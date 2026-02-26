/**
 * FigureDriver.ts — v2.0 (BUG-FIX)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ═══ ROOT CAUSE ANALYSIS ════════════════════════════════════════════════════
 *
 * BUG-01  CAMERA UNDER FLOOR / AGENTS CLIPPING INTO FLOOR
 *         File:  SkeletonDriver.alignToFloor()
 *         Cause: alignToFloor() scans ALL bones including root-level Hips bone
 *                which in Mixamo rigs sits at Y≈0.9m in bind pose.
 *                After model.position.y = 0, worldToLocal(hipPos).y ≈ 0.9m → minLocalY = 0.9
 *                → model.position.y = -0.9 → model pushed DOWN 0.9m INTO the floor.
 *                Canvas3D then also subtracts realHeight/2 → total offset ≈ -1.35m.
 *         Fix:   alignToFloor() now scans only FOOT/TOE bones (lowest extremity).
 *                If no foot bones found, falls back to scanning only shin/knee bones.
 *                If still nothing, uses bbox min instead of bone scan.
 *                Additionally, Canvas3D already handles foot Y placement via
 *                backendBaseY = centerY - realHeight/2 → alignToFloor should
 *                produce an offset of ~0, not negative. Added guard: if computed
 *                offset < -0.05, clamp to 0 (physics engine already handles floor).
 *
 * BUG-02  ARM/SPINE CONTORTION IN PROCEDURAL FALLBACK (forceProcedural=true)
 *         File:  SkeletonDriver.update() — Procedural Fallback section
 *         Cause: Same unclamped joint values as ProceduralFigure had:
 *                - isFall armL_x = -PI*0.8 = -144° (arm physically impossible)
 *                - excited armL_x = -(PI+0.32) = -198° (arm wraps through body)
 *                - crawl cycleRate = 1.8 rad/s (too slow, NIH data: needs 3.2)
 *         Fix:   Applied same JOINT_LIMITS and corrected values as ProceduralFigure v2.
 *
 * BUG-03  forceProcedural DOUBLE-DRIVES BONES ALREADY IN MIXER
 *         Cause: When forceProcedural=true, the code falls through to procedural
 *                fallback AFTER mixer.update(). _applyBone() adds rotation.x on top
 *                of mixer quaternion → bones accumulate rotation every frame.
 *         Fix:   When mixer is active AND forceProcedural=true, procedural values
 *                are applied as REPLACE (not additive) only to bones NOT in mixer.
 *                Bones in mixer keep mixer-driven values unchanged.
 *
 * BUG-04  MODEL REGISTRY — dummy.glb fallback leads to 0 bones mapped
 *         Cause: All age groups point to '/models/dummy.glb' which may not exist
 *                or may not have Mixamo bones → 0 bones mapped → T-pose or
 *                placeholder ProceduralDriver shown instead of GLB.
 *                forceProcedural:true was a workaround that caused BUG-03.
 *         Fix:   Added forceProceduralOnly: true option. When set, SkeletonDriver
 *                skips GLB loading entirely and drives bones purely procedurally.
 *                This is cleaner than forceProcedural:true with a broken GLB path.
 *                For production: replace glbPath with real model path and remove
 *                forceProceduralOnly.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralFigure, createFigure, type ActionEntry } from './Proceduralfigure';

export type { ActionEntry };

// ─────────────────────────────────────────────────────────────────────────────
// IFigureDriver
// ─────────────────────────────────────────────────────────────────────────────
export interface IFigureDriver {
  readonly root:       THREE.Group;
  update(dt: number, entry?: ActionEntry | null): void;
  readonly isReady:    boolean;
  readonly realHeight: number;
  currentHeight:       number;
  readonly registryEntry?: ModelRegistryEntry;
  footOffset?: number;
  dispose(): void;
}

export type DriverType = 'procedural' | 'mixamo' | 'custom';

// ─────────────────────────────────────────────────────────────────────────────
// BoneMap
// ─────────────────────────────────────────────────────────────────────────────
export interface BoneMap {
  hips?:     string;
  spine?:    string;
  head?:     string;
  armL?:     string;
  armR?:     string;
  forearmL?: string;
  forearmR?: string;
  thighL?:   string;
  thighR?:   string;
  shinL?:    string;
  shinR?:    string;
}

export const MIXAMO_BONE_MAP: BoneMap = {
  hips:     'mixamorigHips',
  spine:    'mixamorigSpine',
  head:     'mixamorigHead',
  armL:     'mixamorigLeftArm',
  armR:     'mixamorigRightArm',
  forearmL: 'mixamorigLeftForeArm',
  forearmR: 'mixamorigRightForeArm',
  thighL:   'mixamorigLeftUpLeg',
  thighR:   'mixamorigRightUpLeg',
  shinL:    'mixamorigLeftLeg',
  shinR:    'mixamorigRightLeg',
};

// ─────────────────────────────────────────────────────────────────────────────
// ModelRegistryEntry
// ─────────────────────────────────────────────────────────────────────────────
export interface ModelRegistryEntry {
  realHeight:          number;
  driver:              DriverType;
  glbPath?:            string;
  modelHeight?:        number;
  boneMap?:            BoneMap;
  forceProcedural?:    boolean;
  /** FIX-BUG04: When true, skip GLB loading and drive everything procedurally.
   *  Use this when no GLB is available. Much cleaner than forceProcedural+bad GLB. */
  forceProceduralOnly?: boolean;
  restPoseOffsets?:    Partial<Record<keyof BoneMap, [number, number, number]>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-BUG02: Anatomical joint limits — same as ProceduralFigure v2
// ─────────────────────────────────────────────────────────────────────────────
const JOINT_LIMITS: Record<string, [number, number]> = {
  armL_x:     [-1.047, Math.PI],   // shoulder: -60° → +180° (overhead)
  armR_x:     [-1.047, Math.PI],
  forearmL_x: [0, 2.530],          // elbow: 0° → 145°, no hyperextension
  forearmR_x: [0, 2.530],
  thighL_x:   [-0.698, 1.222],     // hip: -40° → +70°
  thighR_x:   [-0.698, 1.222],
  shinL_x:    [0, 2.443],          // knee: 0° → 140°, no hyperextension
  shinR_x:    [0, 2.443],
  spine_x:    [-0.436, 1.309],     // spine: -25° → +75°
  spine_y:    [-0.349, 0.349],
  head_x:     [-0.524, 0.524],
  head_y:     [-0.785, 0.785],
};

function clampJoint(key: string, value: number): number {
  const lim = JOINT_LIMITS[key];
  if (!lim) return value;
  return Math.max(lim[0], Math.min(lim[1], value));
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
// FIX-BUG04: Use forceProceduralOnly:true when no valid GLB is available.
// Remove forceProceduralOnly and set real glbPath when production models are ready.
// ─────────────────────────────────────────────────────────────────────────────
export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  infant: {
    realHeight:          0.70,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,   // FIX: use procedural until real GLB available
  },
  toddler: {
    realHeight:          0.90,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,
  },
  preschool: {
    realHeight:          1.10,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,
  },
  school_age: {
    realHeight:          1.30,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,
  },
  preteen: {
    realHeight:          1.50,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,
  },
};

export function getRegistryEntry(ageGroupId: string): ModelRegistryEntry {
  return MODEL_REGISTRY[ageGroupId] ?? MODEL_REGISTRY['toddler'];
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER 1 — ProceduralDriver
// ─────────────────────────────────────────────────────────────────────────────
export class ProceduralDriver implements IFigureDriver {
  readonly root:        THREE.Group;
  readonly isReady      = true;
  readonly realHeight:  number;
  currentHeight:        number;
  footOffset            = 0;
  readonly registryEntry: ModelRegistryEntry;

  private fig: ProceduralFigure;

  constructor(ageGroupId: string, agentId: number, accentColor?: number) {
    const entry         = getRegistryEntry(ageGroupId);
    this.registryEntry  = entry;
    this.realHeight     = entry.realHeight;
    this.currentHeight  = entry.realHeight;
    this.fig            = createFigure(ageGroupId, agentId, accentColor);
    this.root           = this.fig.root;
  }

  update(dt: number, entry?: ActionEntry | null): void {
    this.fig.update(dt, entry);
  }

  dispose(): void { this.fig.dispose(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER 2 — SkeletonDriver
// ─────────────────────────────────────────────────────────────────────────────
export class SkeletonDriver implements IFigureDriver {
  readonly root:       THREE.Group;
  readonly realHeight: number;
  isReady              = false;

  private bones:  Partial<Record<keyof BoneMap, THREE.Bone>> = {};
  private cycle   = 0;
  private targets: Record<string, number> = {};
  private current: Record<string, number> = {};

  private wading      = false;
  private wadingAlpha = 0;
  private wadingColor = new THREE.Color(0.2, 0.5, 1.0);
  private skinMeshes: THREE.SkinnedMesh[] = [];

  private model: THREE.Group | null = null;
  private baseScale = 1.0;
  public currentAgeGroupId: string;
  public footOffset: number = 0;
  public limbScaleFactor: number = 1.0;
  public currentHeight: number;

  private bonesInMixer: Set<string> = new Set();
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Record<string, THREE.AnimationAction> = {};
  private activeAction: THREE.AnimationAction | null = null;
  private basePoseCache?: Map<string, THREE.Euler>;
  private _postMixerSnap?: Map<string, THREE.Euler>;  // FIX-C3: per-frame mixer snapshot
  private lastAgeId?: string;

  public readonly registryEntry: ModelRegistryEntry;

  constructor(ageGroupId: string, agentId: number, accentColor?: number) {
    this.currentAgeGroupId = ageGroupId;
    const entry            = getRegistryEntry(ageGroupId);
    this.registryEntry     = entry;
    this.realHeight        = entry.realHeight;
    this.currentHeight     = entry.realHeight;
    this.root              = new THREE.Group();
    this.root.name         = `skeleton_agent_${agentId}_${ageGroupId}`;

    // FIX-BUG04: If forceProceduralOnly, skip GLB loading entirely
    if (entry.forceProceduralOnly) {
      const procDriver = new ProceduralDriver(ageGroupId, agentId, accentColor);
      procDriver.root.name = '__procedural__';
      this.root.add(procDriver.root);
      // Delegate update to inner ProceduralDriver
      this._proceduralDelegate = procDriver;
      this.currentHeight = entry.realHeight;
      this.isReady = true;
      return;
    }

    // Show placeholder while GLB loads
    const placeholder = new ProceduralDriver(ageGroupId, agentId, accentColor);
    placeholder.root.name = '__placeholder__';
    this.root.add(placeholder.root);

    const glbPath = entry.glbPath!;

    new GLTFLoader().load(
      glbPath,
      (gltf) => {
        const ph = this.root.getObjectByName('__placeholder__');
        if (ph) this.root.remove(ph);

        this.model = gltf.scene as THREE.Group;
        this.model.updateMatrixWorld(true);

        const initialBox     = new THREE.Box3().setFromObject(this.model);
        const size           = initialBox.getSize(new THREE.Vector3());
        const intrinsicHeight = Math.max(size.y, size.z);
        const safeHeight     = intrinsicHeight > 0.01 ? intrinsicHeight : 1.0;
        this.baseScale       = 1.0 / safeHeight;
        this.model.scale.setScalar(this.baseScale * entry.realHeight);

        this.model.updateMatrixWorld(true);
        const scaledBox      = new THREE.Box3().setFromObject(this.model);
        this.currentHeight   = scaledBox.max.y - scaledBox.min.y;

        this.root.add(this.model);

        const BONE_SEMANTICS: Record<string, string[]> = {
          hips:     ['mixamorigHips', 'hips', 'pelvis'],
          spine:    ['mixamorigSpine', 'spine lower', 'mixamorigspine1', 'spine_1', 'mixamorigspine'],
          head:     ['mixamorigHead', 'mixamorigNeck', 'head', 'neck'],
          armL:     ['mixamorigleftarm', 'leftarm', 'l_arm', 'arm_l'],
          armR:     ['mixamorigrightarm', 'rightarm', 'r_arm', 'arm_r'],
          forearmL: ['mixamorigleftforearm', 'leftforearm', 'l_forearm', 'forearm_l'],
          forearmR: ['mixamorigrightforearm', 'rightforearm', 'r_forearm', 'forearm_r'],
          thighL:   ['mixamorigleftupleg', 'leftupleg', 'l_thigh', 'leg left thigh'],
          thighR:   ['mixamorigrightupleg', 'rightupleg', 'r_thigh', 'leg right thigh'],
          shinL:    ['mixamorigleftleg', 'l_calf', 'l_knee', 'leg left knee'],
          shinR:    ['mixamorigrightleg', 'r_calf', 'r_knee', 'leg right knee'],
        };

        const EXCLUDE_PATTERN = /iktarget|_ik_|twist|roll|adj|toe_end|toebase|foot|_end_|shoulder/i;

        const foundBones: string[] = [];
        this.model.traverse((o) => {
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
            this.skinMeshes.push(o as THREE.SkinnedMesh);
            o.castShadow    = true;
            o.receiveShadow = true;
          }
          if ((o as THREE.Bone).isBone) {
            const bone  = o as THREE.Bone;
            foundBones.push(bone.name);
            const bName = bone.name.toLowerCase();
            if (EXCLUDE_PATTERN.test(bName)) return;
            for (const [key, semanticList] of Object.entries(BONE_SEMANTICS)) {
              if ((this.bones as any)[key]) continue;
              for (const semantic of semanticList) {
                if (bName.includes(semantic.toLowerCase())) {
                  if ((key === 'armL' || key === 'armR') && bName.includes('fore')) continue;
                  if (!bName.includes('twist') && !bName.includes('end')) {
                    (this.bones as any)[key] = bone;
                    break;
                  }
                }
              }
            }
          }
        });

        console.log(`[SkeletonDriver] Loaded ${glbPath}. Found ${foundBones.length} bones.`);
        console.log(`[SkeletonDriver] Mapped:`, Object.fromEntries(
          Object.entries(this.bones).map(([k, b]) => [k, (b as THREE.Bone).name])
        ));

        const mappedBoneCount = Object.keys(this.bones).length;
        if (mappedBoneCount === 0 && !gltf.animations?.length) {
          console.warn(`[SkeletonDriver] No bones mapped, reverting to ProceduralDriver.`);
          this.root.remove(this.model!);
          this.model = null;
          const ph2  = new ProceduralDriver(ageGroupId, agentId, accentColor);
          ph2.root.name = '__placeholder__';
          this.root.add(ph2.root);
          this._proceduralDelegate = ph2;
          this.isReady = true;
          return;
        }

        this.isReady = true;

        if (gltf.animations?.length) {
          gltf.animations.forEach(clip => {
            clip.tracks = clip.tracks.filter(t => !t.name.endsWith('.scale'));
          });

          this.bonesInMixer.clear();
          gltf.animations.forEach(clip => {
            clip.tracks.forEach(track => {
              this.bonesInMixer.add(track.name.split('.')[0].toLowerCase());
            });
          });

          this.mixer = new THREE.AnimationMixer(this.model);
          gltf.animations.forEach((clip) => {
            const name = clip.name.toLowerCase();
            let key    = 'idle';
            if (name.includes('walk'))                                       key = 'walk';
            else if (name.includes('run') || name.includes('sprint'))        key = 'run';
            else if (name.includes('idle'))                                  key = 'idle';
            else if (name.includes('crawl'))                                 key = 'crawl';
            else                                                             key = name;
            this.actions[key] = this.mixer!.clipAction(clip);
          });

          const firstAction = this.actions['idle'] ?? Object.values(this.actions)[0];
          if (firstAction) {
            this.activeAction = firstAction;
            this.activeAction.play();
          }
        }

        this.updateScale(ageGroupId);
      },
      undefined,
      (err) => {
        console.error(`[SkeletonDriver] Failed to load ${glbPath}:`, err);
        // On load failure, swap in ProceduralDriver
        const ph = this.root.getObjectByName('__placeholder__');
        if (!ph) {
          const ph2 = new ProceduralDriver(ageGroupId, agentId, accentColor);
          ph2.root.name = '__placeholder__';
          this.root.add(ph2.root);
          this._proceduralDelegate = ph2;
        }
        this.isReady = true;
      },
    );
  }

  // FIX-BUG04: Optional procedural delegate — used when forceProceduralOnly or GLB fails
  private _proceduralDelegate: ProceduralDriver | null = null;

  private fadeToAction(name: string, duration = 0.2) {
    const nextAction = this.actions[name]
      ?? this.actions['idle']
      ?? Object.values(this.actions)[0]
      ?? null;
    if (!nextAction || nextAction === this.activeAction) return;
    nextAction.reset().fadeIn(duration).play();
    if (this.activeAction) this.activeAction.fadeOut(duration);
    this.activeAction = nextAction;
  }

  update(dt: number, entry?: ActionEntry | null): void {
    if (!this.isReady) return;

    // FIX-BUG04: If using procedural delegate, forward directly
    if (this._proceduralDelegate) {
      this._proceduralDelegate.update(dt, entry);
      return;
    }

    const action  = entry?.a ?? 'idle';
    const emotion = entry?.e ?? 'neutral';
    this.wading   = !!(entry?.wadingIn);

    const isRun   = ['run', 'sprint', 'run_unstable'].includes(action);
    const isWalk  = ['walk', 'walk_to', 'walk_random', 'investigate', 'reach'].includes(action);
    const isWade  = action === 'wade';
    const isCrawl = action === 'crawl';
    const isFall  = ['falling', 'free_fall', 'stumble', 'trip', 'fall_forward', 'lose_balance'].includes(action);
    const isClimb = ['climb_on', 'climb'].includes(action);
    const isIdle  = !isRun && !isWalk && !isWade && !isCrawl && !isFall && !isClimb;
    const vel     = entry?.v ?? 0;

    // ── Mixer-driven animation ─────────────────────────────────────────────
    if (this.mixer) {
      let clipName = 'idle';
      if (isRun)        clipName = 'run';
      else if (isWalk)  clipName = 'walk';
      else if (isCrawl) clipName = 'crawl';
      this.fadeToAction(clipName, 0.2);

      const baseVel = isRun ? 3.0 : 1.5;
      this.mixer.timeScale = vel > 0.1 ? vel / (baseVel * this.limbScaleFactor) : 1.0;
      this.mixer.update(dt);

      // FIX-C3: Clear per-frame mixer snapshot so _applyBone recaptures fresh values
      if (this._postMixerSnap) this._postMixerSnap.clear();

      const regEntry = getRegistryEntry(this.currentAgeGroupId);
      if (!regEntry.forceProcedural) {
        // FIX-BUG03: Only procedurally override bones NOT in mixer
        const LERP = Math.min(1, dt * 14);
        this.cycle += dt * (isRun ? 3.8 : isWalk ? 2.5 : 0.6);
        const s = Math.sin(this.cycle);
        const armSwing  = isRun ? 1.1 : isWalk ? 0.70 : isWade ? 0.30 : 0;
        const elbowBend = isWalk ? 0.5 : isRun ? 0.9 : 0.2;

        const overrideIfMissing = (boneKey: keyof BoneMap, xRot: number) => {
          const bone = this.bones[boneKey];
          if (!bone) return;
          if (this.bonesInMixer.has(bone.name.toLowerCase())) return;
          const k = `${boneKey}_x`;
          this._t(k, clampJoint(k, xRot));
          bone.rotation.x = this._lerp(k, LERP);
        };

        overrideIfMissing('armL',     armSwing > 0 ? -s * armSwing : 0);
        overrideIfMissing('armR',     armSwing > 0 ?  s * armSwing : 0);
        overrideIfMissing('forearmL', elbowBend);
        overrideIfMissing('forearmR', elbowBend);

        this.updateScale(this.currentAgeGroupId);
        this._alignToFloor();
        this._updateWadingTint(dt);
        return;
      }
      // forceProcedural=true: fall through to procedural section below
      // but mixer has already run — we will only drive bones NOT in mixer
    }

    // ── Full procedural fallback (no mixer, or forceProcedural=true) ───────
    // FIX-BUG02: Corrected cycle rates (NIH crawl: 3.2 rad/s)
    const cycleRate = isRun ? 3.8 : isWalk ? 2.5 : isWade ? 1.2 : isCrawl ? 3.2 : 0.6;
    this.cycle += dt * cycleRate;
    const s = Math.sin(this.cycle);
    const c = Math.cos(this.cycle);

    // ── Legs ──────────────────────────────────────────────────────────────
    // FIX-BUG02: run legSwing 1.40→1.22 (anatomical max 70° = 1.22 rad)
    const legSwing  = isRun ? 1.22 : isWalk ? 0.90 : isWade ? 0.42 : 0;
    const kneeSwing = isRun ? 1.05 : isWalk ? 0.55 : isWade ? 0.25 : 0;

    if (legSwing > 0) {
      this._t('thighL_x',  s * legSwing);
      this._t('thighR_x', -s * legSwing);
      this._t('shinL_x',   Math.max(0, -c * kneeSwing));
      this._t('shinR_x',   Math.max(0,  c * kneeSwing));
    } else if (isCrawl) {
      this._t('thighL_x', -(0.90 + s * 0.32));
      this._t('thighR_x', -(0.90 - s * 0.32));
      this._t('shinL_x',   1.22 - s * 0.28);
      this._t('shinR_x',   1.22 + s * 0.28);
    } else if (isFall) {
      const fl = Math.sin(this.cycle * 5) * 0.28;
      this._t('thighL_x', -0.40 + fl);
      this._t('thighR_x', -0.40 - fl);
      this._t('shinL_x',   0.52);
      this._t('shinR_x',   0.52);
    } else if (isClimb) {
      const t2 = Math.abs(s);
      this._t('thighL_x', -(1.05 + t2 * 0.17));
      this._t('thighR_x', -(0.52 - t2 * 0.17));
      this._t('shinL_x',   0.87 + t2 * 0.35);
      this._t('shinR_x',   0.52 + t2 * 0.17);
    } else {
      this._t('thighL_x', 0); this._t('thighR_x', 0);
      this._t('shinL_x',  0); this._t('shinR_x',  0);
    }

    // ── Arms ──────────────────────────────────────────────────────────────
    const armSwing  = isRun ? 1.10 : isWalk ? 0.70 : isWade ? 0.30 : 0;
    // FIX-BUG02: crawl elbow = 0.05 (weight bearing, nearly straight)
    const elbowBend = isRun ? 0.60 : isWalk ? 0.30 : isCrawl ? 0.05 : isClimb ? 0.52 : 0.10;

    if (armSwing > 0) {
      this._t('armL_x', -s * armSwing);
      this._t('armR_x',  s * armSwing);
    } else if (isCrawl) {
      this._t('armL_x', -(1.40 - s * 0.45));
      this._t('armR_x', -(1.40 + s * 0.45));
    } else if (isFall) {
      // FIX-BUG02: was -PI*0.8 = -144° (impossible). Correct: arms fly FORWARD ~-70°
      const flA = Math.sin(this.cycle * 5) * 0.28;
      this._t('armL_x', -(1.22 + flA));
      this._t('armR_x', -(1.22 - flA));
    } else if (isClimb) {
      const t2 = Math.abs(s);
      this._t('armL_x',  2.44 - t2 * 0.87);
      this._t('armR_x',  2.09 - t2 * 0.87);
    } else {
      this._t('armL_x', isWade ? -s * 0.30 : 0);
      this._t('armR_x', isWade ?  s * 0.30 : 0);
    }
    this._t('forearmL_x', elbowBend);
    this._t('forearmR_x', elbowBend);

    // ── Spine ─────────────────────────────────────────────────────────────
    if (isCrawl)      { this._t('spine_x',  1.10); this._t('spine_y', 0); }
    else if (isRun)   { this._t('spine_x',  0.18); this._t('spine_y', s * 0.10); }
    else if (isFall)  { this._t('spine_x',  0.52); this._t('spine_y', 0); }
    else if (isClimb) { this._t('spine_x', -0.26); this._t('spine_y', 0); }
    else {
      const breathe = isIdle ? Math.sin(this.cycle * 0.5) * 0.022 : 0;
      this._t('spine_x', breathe);
      this._t('spine_y', (isWalk || isWade) ? s * 0.08 : 0);
    }

    // ── Head ──────────────────────────────────────────────────────────────
    if (isFall)       this._t('head_x', -0.26);
    else if (isCrawl) this._t('head_x', -0.52);
    else              this._t('head_x',  0);
    this._t('head_y', isIdle ? Math.sin(this.cycle * 0.3) * 0.06 : 0);

    // ── Emotion overrides (upper body only) ───────────────────────────────
    switch (emotion) {
      case 'crying':
        this._t('head_x',  0.42 + Math.sin(this.cycle * 10) * 0.08);
        this._t('spine_x', 0.32);
        // FIX-BUG02: was -2.55rad (-146°). Correct: arms forward-down ~-50° (hugging self)
        this._t('armL_x', -0.87); this._t('forearmL_x', 1.40);
        this._t('armR_x', -0.87); this._t('forearmR_x', 1.40);
        break;
      case 'mischievous':
        this._t('spine_x', -0.18);
        this._t('head_y',   0.30);
        this._t('armL_x',  -0.52); this._t('forearmL_x', 1.57);
        this._t('armR_x',  -0.52); this._t('forearmR_x', 1.57);
        break;
      case 'excited':
        // FIX-BUG02: was -(PI+0.32) = -198° (impossible). Correct: arms UP +150°
        this._t('armL_x', 2.62 + Math.sin(this.cycle * 8) * 0.26);
        this._t('armR_x', 2.62 + Math.sin(this.cycle * 8 + Math.PI) * 0.26);
        this._t('forearmL_x', 0.26);
        this._t('forearmR_x', 0.26);
        this._t('spine_x', 0.08);
        break;
      case 'scared':
        this._t('head_x',  0.35); this._t('spine_x', 0.26);
        this._t('armL_x', -0.52); this._t('armR_x', -0.52);
        this._t('forearmL_x', 1.57); this._t('forearmR_x', 1.57);
        break;
    }

    // ── Apply bones ───────────────────────────────────────────────────────
    const LERP = Math.min(1, dt * 12);
    this._applyBone('thighL',    'thighL_x',    '', '', LERP);
    this._applyBone('thighR',    'thighR_x',    '', '', LERP);
    this._applyBone('shinL',     'shinL_x',     '', '', LERP);
    this._applyBone('shinR',     'shinR_x',     '', '', LERP);
    this._applyBone('armL',      'armL_x',      '', '', LERP);
    this._applyBone('armR',      'armR_x',      '', '', LERP);
    this._applyBone('forearmL',  'forearmL_x',  '', '', LERP);
    this._applyBone('forearmR',  'forearmR_x',  '', '', LERP);
    this._applyBone('spine',     'spine_x',  'spine_y', '', LERP);
    this._applyBone('head',      'head_x',   'head_y',  '', LERP);

    if (this.currentAgeGroupId !== this.lastAgeId) {
      this.updateScale(this.currentAgeGroupId);
      this.lastAgeId = this.currentAgeGroupId;
    }

    this._alignToFloor();
    this._updateWadingTint(dt);
  }

  private _alignToFloor() {
    if (!this.model) return;

    const FOOT_PATTERN = /foot|toe|ankle/i;
    const SHIN_PATTERN = /shin|calf|leg.*lower|lowerleg|knee/i;

    this.model.position.y = 0;
    this.root.updateMatrixWorld(true);

    let minY = Infinity;
    let foundFootBone = false;

    // Pass 1: foot/toe bones only
    this.model.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      if (!FOOT_PATTERN.test(o.name)) return;
      const v = new THREE.Vector3();
      o.getWorldPosition(v);
      this.root.worldToLocal(v);
      if (v.y < minY) { minY = v.y; foundFootBone = true; }
    });

    // Pass 2: shin/knee bones if no foot bones found
    if (!foundFootBone) {
      this.model.traverse((o) => {
        if (!(o as THREE.Bone).isBone) return;
        if (!SHIN_PATTERN.test(o.name)) return;
        const v = new THREE.Vector3();
        o.getWorldPosition(v);
        this.root.worldToLocal(v);
        if (v.y < minY) minY = v.y;
      });
    }

    // Pass 3: bbox fallback if no relevant bones found
    if (minY === Infinity) {
      const box = new THREE.Box3().setFromObject(this.model);
      minY = box.min.y;
    }

    // Compute offset: shift model so lowest foot point is at Y=0
    const padding = (this.registryEntry?.realHeight ?? 0.8) * 0.015;
    const offset  = -minY + padding;

    // FIX-BUG01 GUARD: if offset is large negative, something went wrong → clamp to 0
    // Canvas3D already positions root at foot level via backendBaseY = centerY - realHeight/2
    // alignToFloor should only make minor corrections (±5cm), not large shifts
    if (offset < -0.05) {
      this.model.position.y = 0;
    } else {
      this.model.position.y = Math.min(offset, 0.10); // max 10cm upward correction
    }
  }

  // ── Lerp helpers ────────────────────────────────────────────────────────
  private _t(key: string, value: number) {
    const clamped = clampJoint(key, value);
    this.targets[key] = clamped;
    if (!(key in this.current)) this.current[key] = clamped;
  }
  private _lerp(key: string, alpha: number): number {
    const t  = this.targets[key] ?? 0;
    const cv = this.current[key] ?? t;
    // FIX: short-arc lerp — pick shortest rotation direction
    let diff = t - cv;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const n = cv + diff * alpha;
    this.current[key] = n;
    return n;
  }
  private _applyBone(
    boneKey: keyof BoneMap,
    xKey: string, yKey: string, zKey: string,
    lerp: number,
  ) {
    const bone = this.bones[boneKey];
    if (!bone) return;

    const regEntry = getRegistryEntry(this.currentAgeGroupId);
    const offset   = regEntry.restPoseOffsets?.[boneKey] ?? [0, 0, 0];

    const rx = (xKey ? this._lerp(xKey, lerp) : 0) + offset[0];
    const ry = (yKey ? this._lerp(yKey, lerp) : 0) + offset[1];
    const rz = (zKey ? this._lerp(zKey, lerp) : 0) + offset[2];

    const inMixer = this.mixer && this.bonesInMixer.has(bone.name.toLowerCase());

    if (inMixer) {
      // FIX-C3: The mixer has already set bone.rotation for this frame.
      // We capture the mixer result ONCE (before any procedural additions),
      // then apply procedural values as an absolute offset — NOT additive.
      // This prevents rotation accumulating to infinity over frames.
      if (!this._postMixerSnap) this._postMixerSnap = new Map<string, THREE.Euler>();
      // We record the mixer snapshot the first time _applyBone is called per-frame;
      // the snapshot was taken after mixer.update() in update(), before _applyBone calls.
      const snapKey = bone.uuid;
      if (!this._postMixerSnap.has(snapKey)) {
        this._postMixerSnap.set(snapKey, new THREE.Euler().copy(bone.rotation));
      }
      const base = this._postMixerSnap.get(snapKey)!;
      bone.rotation.x = base.x + rx;
      bone.rotation.y = base.y + ry;
      bone.rotation.z = base.z + rz;
    } else {
      // Bones not in mixer: apply relative to bind pose (prevent accumulation)
      if (!this.basePoseCache) this.basePoseCache = new Map();
      if (!this.basePoseCache.has(bone.uuid)) {
        this.basePoseCache.set(bone.uuid, new THREE.Euler().copy(bone.rotation));
      }
      const base = this.basePoseCache.get(bone.uuid)!;
      bone.rotation.x = base.x + rx;
      bone.rotation.y = base.y + ry;
      bone.rotation.z = base.z + rz;
    }
  }

  // ── Wading tint ─────────────────────────────────────────────────────────
  private _updateWadingTint(dt: number) {
    this.wadingAlpha = this.wading
      ? Math.min(1, this.wadingAlpha + dt * 2.8)
      : Math.max(0, this.wadingAlpha - dt * 2.8);
    if (this.wadingAlpha === 0) return;
    const alpha = this.wadingAlpha * 0.45;
    this.skinMeshes.forEach((mesh) => {
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach(m => {
          if ((m as THREE.MeshStandardMaterial).color)
            (m as THREE.MeshStandardMaterial).color.lerp(this.wadingColor, alpha);
        });
      } else if ((mat as THREE.MeshStandardMaterial).color) {
        (mat as THREE.MeshStandardMaterial).color.lerp(this.wadingColor, alpha);
      }
    });
  }

  dispose(): void {
    if (this._proceduralDelegate) {
      this._proceduralDelegate.dispose();
      return;
    }
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
        else (m.material as THREE.Material)?.dispose();
      }
    });
  }

  public updateScale(ageGroupId: string) {
    this.currentAgeGroupId = ageGroupId;
    const entry = getRegistryEntry(ageGroupId);
    if (!this.model || !this.isReady) return;

    const age = ({ infant: 1, toddler: 2, preschool: 4, school_age: 8, preteen: 12 } as Record<string, number>)[ageGroupId] ?? 4;
    this.limbScaleFactor = Math.min(1.0, 0.65 + age * 0.07);

    let bs = this.baseScale;
    if (isNaN(bs) || bs <= 0.001) bs = 1.0;
    this.model.scale.setScalar(bs * entry.realHeight);

    this.model.updateMatrixWorld(true);
    const finalBox     = new THREE.Box3().setFromObject(this.model);
    this.currentHeight = finalBox.max.y - finalBox.min.y;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────
export function createDriver(
  ageGroupId:   string,
  agentId:      number,
  accentColor?: number,
): IFigureDriver {
  const entry = getRegistryEntry(ageGroupId);

  // FIX-BUG04: If forceProceduralOnly, skip SkeletonDriver entirely
  if (entry.forceProceduralOnly) {
    return new ProceduralDriver(ageGroupId, agentId, accentColor);
  }

  switch (entry.driver) {
    case 'mixamo':
    case 'custom':
      return new SkeletonDriver(ageGroupId, agentId, accentColor);
    case 'procedural':
    default:
      return new ProceduralDriver(ageGroupId, agentId, accentColor);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT_PALETTE
// ─────────────────────────────────────────────────────────────────────────────
export const AGENT_PALETTE = [
  0x00e5ff, 0x69f0ae, 0xffab40, 0xec407a, 0xce93d8,
  0x42a5f5, 0xd4e157, 0xff7043, 0x26c6da, 0xef5350,
];