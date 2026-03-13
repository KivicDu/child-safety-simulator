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
  forceProceduralOnly?: boolean;
  restPoseOffsets?:    Partial<Record<keyof BoneMap, [number, number, number]>>;
}

const JOINT_LIMITS: Record<string, [number, number]> = {
  armL_x:     [-1.047, Math.PI],   // shoulder: -60° → +180° (overhead)
  armR_x:     [-1.047, Math.PI],
  forearmL_x: [-2.530, 0],
  forearmR_x: [-2.530, 0],
  thighL_x:   [-1.745, 1.222],     // hip: -100° → +70° (sitting/lying/crawl needs ≥90°)
  thighR_x:   [-1.745, 1.222],
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

export const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  infant: {
    realHeight:          0.70,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,   // FIX: use procedural until real GLB available
  },
  early_toddler: {
    realHeight:          0.82,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,
  },
  late_toddler: {
    realHeight:          0.94,
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
  child: {
    realHeight:          1.30,
    driver:              'mixamo',
    glbPath:             '/models/dummy.glb',
    modelHeight:         1.0,
    forceProceduralOnly: true,
  },
};

export function getRegistryEntry(ageGroupId: string): ModelRegistryEntry {
  return MODEL_REGISTRY[ageGroupId] ?? MODEL_REGISTRY['early_toddler'];
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
    const isClimb = ['climb_on', 'climb', 'climb_approach', 'climb_reach', 'climb_pull', 'climb_mount', 'climb_down', 'step_up', 'step_down'].includes(action);
    const isClimbFail = action === 'climb_fail';
    const isHurt     = ['hurt_light', 'hurt_medium', 'hurt_heavy', 'hurt_shock', 'recoil'].includes(action);
    const isCrying   = ['crying_stand', 'crying_sit'].includes(action);
    const isGetUp    = ['get_up_slow', 'get_up_fast'].includes(action);
    const isGrab     = ['grab', 'grab_mouth'].includes(action);
    const isReach    = action === 'reach_up';
    const isPull     = ['pull', 'pull_to_stand', 'open_drawer'].includes(action);
    const isLunge    = action === 'lunge';
    const isLookAround = action === 'look_around';
    const isPause    = action === 'pause';
    const isSlide    = action === 'slide';
    const isRareEvent = ['dodge', 'push', 'throw', 'pick_up', 'sit_down', 'stand_up', 'jump', 'land'].includes(action);
    const isInteract = isGrab || isReach || isPull || isLunge || isLookAround || isPause || isHurt || isCrying || isGetUp || isClimbFail || isSlide || isRareEvent;
    const isIdle  = !isRun && !isWalk && !isWade && !isCrawl && !isFall && !isClimb && !isInteract;
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
        overrideIfMissing('forearmL', -elbowBend);
        overrideIfMissing('forearmR', -elbowBend);

        this.updateScale(this.currentAgeGroupId);
        this._alignToFloor();
        this._updateWadingTint(dt);
        return;
      }
      // forceProcedural=true: fall through to procedural section below
      // but mixer has already run — we will only drive bones NOT in mixer
    }

    // ── Full procedural fallback (no mixer, or forceProcedural=true) ───────
    // FIX #1: cycleRate = 0 when idle to prevent sliding
    const cycleRate = isRun ? 3.8 : isWalk ? 2.5 : isWade ? 1.2 : isCrawl ? 3.2
      : isFall ? 5.0 : isClimb ? 1.5 : isHurt ? 2.0 : isCrying ? 1.5
      : isGetUp ? 0.8
      : action === 'push' ? 1.0 : action === 'pick_up' ? 0.8 : action === 'sit_down' ? 0.5
      : action === 'stand_up' ? 0.8 : isSlide ? 0 : isRareEvent ? 0
      : isInteract ? 1.0 : 0;
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
    } else if (isHurt) {
      if (action === 'hurt_light' || action === 'recoil') {
        this._t('thighL_x', 0.10); this._t('thighR_x', 0.10);
        this._t('shinL_x', 0.17); this._t('shinR_x', 0.17);
      } else if (action === 'hurt_medium') {
        this._t('thighL_x', -0.70); this._t('thighR_x', -0.70);
        this._t('shinL_x', 1.22); this._t('shinR_x', 1.22);
      } else if (action === 'hurt_heavy') {
        const phase = Math.min(1, this.cycle * 0.5);
        this._t('thighL_x', -(0.35 + phase * 0.70));
        this._t('thighR_x', -(0.35 + phase * 0.70));
        this._t('shinL_x', 0.52 + phase * 1.57);
        this._t('shinR_x', 0.52 + phase * 1.57);
      } else {
        this._t('thighL_x', -1.05); this._t('thighR_x', -1.05);
        this._t('shinL_x', 2.09); this._t('shinR_x', 2.09);
      }
    } else if (isCrying) {
      if (action === 'crying_sit') {
        this._t('thighL_x', -0.87); this._t('thighR_x', -0.87);
        this._t('shinL_x', 1.57); this._t('shinR_x', 1.57);
      } else {
        this._t('thighL_x', 0); this._t('thighR_x', 0);
        this._t('shinL_x', 0.10); this._t('shinR_x', 0.10);
      }
    } else if (isGetUp) {
      const prog = Math.min(1, this.cycle * 0.8);
      this._t('thighL_x', -0.87 * (1 - prog)); this._t('thighR_x', -0.87 * (1 - prog));
      this._t('shinL_x', 1.57 * (1 - prog)); this._t('shinR_x', 1.57 * (1 - prog));
    } else if (isGrab) {
      this._t('thighL_x', -0.17); this._t('thighR_x', -0.17);
      this._t('shinL_x', 0.35); this._t('shinR_x', 0.35);
    } else if (isPull) {
      this._t('thighL_x', -0.26); this._t('thighR_x', -0.26);
      this._t('shinL_x', 0.52); this._t('shinR_x', 0.52);
    } else if (isLunge) {
      this._t('thighL_x', -0.70); this._t('thighR_x', 0.35);
      this._t('shinL_x', 0.87); this._t('shinR_x', 0.17);
    } else if (isSlide) {
      this._t('thighL_x', -0.17); this._t('thighR_x', -0.17);
      this._t('shinL_x', 0.35); this._t('shinR_x', 0.35);
    } else if (isRareEvent) {
      if (action === 'pick_up') {
        this._t('thighL_x', -0.52); this._t('thighR_x', -0.52);
        this._t('shinL_x', 0.87); this._t('shinR_x', 0.87);
      } else if (action === 'sit_down') {
        const sp = Math.min(1, this.cycle * 0.5);
        this._t('thighL_x', -1.22 * sp); this._t('thighR_x', -1.22 * sp);
        this._t('shinL_x', 1.57 * sp); this._t('shinR_x', 1.57 * sp);
      } else if (action === 'stand_up') {
        const sp = Math.min(1, this.cycle * 0.8);
        this._t('thighL_x', -1.22 * (1 - sp)); this._t('thighR_x', -1.22 * (1 - sp));
        this._t('shinL_x', 1.57 * (1 - sp)); this._t('shinR_x', 1.57 * (1 - sp));
      } else if (action === 'jump') {
        const jp = Math.min(1, this.cycle * 2);
        if (jp < 0.4) {
          this._t('thighL_x', -0.52); this._t('thighR_x', -0.52);
          this._t('shinL_x', 1.05); this._t('shinR_x', 1.05);
        } else {
          this._t('thighL_x', 0.10); this._t('thighR_x', 0.10);
          this._t('shinL_x', 0); this._t('shinR_x', 0);
        }
      } else if (action === 'land') {
        this._t('thighL_x', -0.35); this._t('thighR_x', -0.35);
        this._t('shinL_x', 0.70); this._t('shinR_x', 0.70);
      } else {
        this._t('thighL_x', 0); this._t('thighR_x', 0);
        this._t('shinL_x', 0); this._t('shinR_x', 0);
      }
    } else {
      this._t('thighL_x', 0); this._t('thighR_x', 0);
      this._t('shinL_x',  0); this._t('shinR_x',  0);
    }

    // ── Arms ──────────────────────────────────────────────────────────────
    const armSwing  = isRun ? 1.10 : isWalk ? 0.70 : isWade ? 0.30 : 0;
    const elbowBend = isRun ? 0.60 : isWalk ? 0.30 : isCrawl ? 0.05 : isClimb ? 0.52
      : isHurt ? (action === 'hurt_light' ? 1.05 : action === 'hurt_medium' ? 1.40 : 0.52)
      : isCrying ? 1.40 : isGetUp ? (1.57 * (1 - Math.min(1, this.cycle * 0.8)))
      : isSlide ? 0.17
      : action === 'dodge' ? 1.05 : action === 'push' ? 0.26 : action === 'throw' ? 0.17
      : action === 'pick_up' ? 0.35 : action === 'sit_down' ? 0.35
      : action === 'stand_up' ? 0.52 : action === 'jump' ? 0.26 : action === 'land' ? 0.35
      : isGrab ? 0.52 : isReach ? 0.17 : isPull ? 0.70 : isLunge ? 0.35 : 0.10;

    if (armSwing > 0) {
      this._t('armL_x', -s * armSwing);
      this._t('armR_x',  s * armSwing);
    } else if (isCrawl) {
      this._t('armL_x', -(1.40 - s * 0.45));
      this._t('armR_x', -(1.40 + s * 0.45));
    } else if (isFall) {
      const flA = Math.sin(this.cycle * 5) * 0.28;
      this._t('armL_x', -(1.22 + flA));
      this._t('armR_x', -(1.22 - flA));
    } else if (isClimb) {
      const t2 = Math.abs(s);
      this._t('armL_x', -(2.44 - t2 * 0.87));
      this._t('armR_x', -(2.09 - t2 * 0.87));
    } else if (isHurt) {
      if (action === 'hurt_light' || action === 'recoil') {
        this._t('armL_x', -0.52); this._t('armR_x', -0.52);
      } else if (action === 'hurt_medium') {
        this._t('armL_x', -0.87); this._t('armR_x', -0.87);
      } else if (action === 'hurt_heavy') {
        const phase = Math.min(1, this.cycle * 0.5);
        this._t('armL_x', -(1.57 - phase * 0.70));
        this._t('armR_x', -(1.57 - phase * 0.70));
      } else {
        this._t('armL_x', -0.52); this._t('armR_x', -0.52);
      }
    } else if (isCrying) {
      this._t('armL_x', -0.87); this._t('armR_x', -0.87);
    } else if (isGetUp) {
      const prog = Math.min(1, this.cycle * 0.8);
      this._t('armL_x', -(1.05 * (1 - prog))); this._t('armR_x', -(1.05 * (1 - prog)));
    } else if (isGrab) {
      this._t('armL_x', -1.22); this._t('armR_x', -1.22);
    } else if (isReach) {
      this._t('armL_x', -(2.27 + s * 0.10));
      this._t('armR_x', -(2.27 - s * 0.10));
    } else if (isPull) {
      this._t('armL_x', -(0.87 - s * 0.17));
      this._t('armR_x', -(0.87 + s * 0.17));
    } else if (isLunge) {
      this._t('armL_x', -0.52); this._t('armR_x', -0.52);
    } else if (isSlide) {
      this._t('armL_x', 0); this._t('armR_x', 0);
    } else if (isRareEvent) {
      if (action === 'push')     { this._t('armL_x', -1.22); this._t('armR_x', -1.22); }
      else if (action === 'throw') { this._t('armL_x', -1.57); this._t('armR_x',  0.35); }
      else if (action === 'pick_up') { this._t('armL_x', -1.40); this._t('armR_x', -1.40); }
      else if (action === 'jump') {
        const jp = Math.min(1, this.cycle * 2);
        if (jp < 0.4) { this._t('armL_x', -0.52); this._t('armR_x', -0.52); }
        else           { this._t('armL_x', -1.57); this._t('armR_x', -1.57); }
      } else { this._t('armL_x', 0); this._t('armR_x', 0); }
    } else {
      this._t('armL_x', isWade ? -s * 0.30 : 0);
      this._t('armR_x', isWade ?  s * 0.30 : 0);
    }
    this._t('forearmL_x', -elbowBend);
    this._t('forearmR_x', -elbowBend);

    // ── Spine ─────────────────────────────────────────────────────────────
    if (isCrawl)      { this._t('spine_x',  0.70); this._t('spine_y', 0); }  // FIX-W3: 40° natural crawl lean
    else if (isRun)   { this._t('spine_x',  0.18); this._t('spine_y', s * 0.10); }
    else if (isFall)  { this._t('spine_x',  0.52); this._t('spine_y', 0); }
    else if (isClimb) { this._t('spine_x', -0.26); this._t('spine_y', 0); }
    else if (isHurt) {
      if (action === 'hurt_light' || action === 'recoil') this._t('spine_x', -0.15);
      else if (action === 'hurt_medium') this._t('spine_x', 0.52);
      else if (action === 'hurt_heavy') {
        const phase = Math.min(1, this.cycle * 0.5);
        this._t('spine_x', 0.87 + phase * 0.18);
      } else this._t('spine_x', 0.70);
      this._t('spine_y', 0);
    } else if (isCrying) {
      this._t('spine_x', action === 'crying_sit' ? 0.44 : 0.26);
      this._t('spine_y', Math.sin(this.cycle * 3) * 0.06);
    } else if (isGetUp) {
      this._t('spine_x', 0.52 * (1 - Math.min(1, this.cycle * 0.8)));
      this._t('spine_y', 0);
    } else if (isGrab) {
      this._t('spine_x', 0.44); this._t('spine_y', 0);
    } else if (isPull) {
      this._t('spine_x', -0.35); this._t('spine_y', s * 0.05);
    } else if (isSlide) {
      this._t('spine_x', -0.17); this._t('spine_y', 0);
    } else if (isRareEvent) {
      if (action === 'push') this._t('spine_x', 0.26);
      else if (action === 'pick_up') this._t('spine_x', 0.52);
      else if (action === 'jump') this._t('spine_x', -0.10);
      else if (action === 'land') this._t('spine_x', 0.10);
      else this._t('spine_x', 0);
      this._t('spine_y', 0);
    } else {
      const breathe = isIdle ? Math.sin(this.cycle * 0.5) * 0.022 : 0;
      this._t('spine_x', breathe);
      this._t('spine_y', (isWalk || isWade) ? s * 0.08 : 0);
    }

    // ── Head ──────────────────────────────────────────────────────────────
    if (isFall)       this._t('head_x', -0.26);
    else if (isCrawl) this._t('head_x', -0.52);
    else if (isHurt) {
      if (action === 'hurt_light' || action === 'recoil') this._t('head_x', -0.20);
      else if (action === 'hurt_medium') this._t('head_x', 0.35);
      else if (action === 'hurt_heavy') {
        const phase = Math.min(1, this.cycle * 0.5);
        this._t('head_x', phase > 0.5 ? 0.44 : Math.sin(this.cycle * 8) * 0.20);
      } else this._t('head_x', 0.44);
    } else if (isCrying) {
      this._t('head_x', 0.35 + Math.sin(this.cycle * 10) * 0.08);
    } else if (isGetUp) {
      this._t('head_x', 0.35 * (1 - Math.min(1, this.cycle * 0.8)));
    } else if (isClimb) {
      this._t('head_x', -0.35);
    } else if (isGrab) {
      this._t('head_x', 0.26);
    } else if (action === 'pick_up') {
      this._t('head_x', 0.35);
    } else if (action === 'jump') {
      this._t('head_x', -0.20);
    } else this._t('head_x', 0);

    const headYaw = isLookAround ? Math.sin(this.cycle * 0.8) * 0.78
      : isCrying ? Math.sin(this.cycle * 5) * 0.10
      : isHurt ? 0
      : isIdle ? Math.sin(this.cycle * 0.3) * 0.06 : 0;
    this._t('head_y', headYaw);

    // ── Emotion overrides (upper body only) ───────────────────────────────
    if (emotion !== 'neutral') {
      switch (emotion) {
        case 'crying':
          this._t('head_x',  0.42 + Math.sin(this.cycle * 10) * 0.08);
          this._t('spine_x', 0.32);
          this._t('armL_x', -0.87); this._t('forearmL_x', -1.40);
          this._t('armR_x', -0.87); this._t('forearmR_x', -1.40);
          break;
        case 'mischievous':
          this._t('spine_x', -0.18); this._t('head_y', 0.30);
          this._t('armL_x', -0.52); this._t('forearmL_x', -1.57);
          this._t('armR_x', -0.52); this._t('forearmR_x', -1.57);
          break;
        case 'excited':
          this._t('armL_x', -(2.62 + Math.sin(this.cycle * 8) * 0.26));
          this._t('armR_x', -(2.62 + Math.sin(this.cycle * 8 + Math.PI) * 0.26));
          this._t('forearmL_x', -0.26); this._t('forearmR_x', -0.26);
          this._t('spine_x', 0.08);
          break;
        case 'scared':
          this._t('head_x', 0.35); this._t('spine_x', 0.26);
          this._t('armL_x', -0.52); this._t('armR_x', -0.52);
          this._t('forearmL_x', -1.57); this._t('forearmR_x', -1.57);
          break;
        case 'focused':
          this._t('spine_x', 0.14); this._t('head_x', -0.18);
          this._t('armL_x', -0.87); this._t('armR_x', -0.87);
          this._t('forearmL_x', -0.52); this._t('forearmR_x', -0.52);
          break;
        case 'curious':
          this._t('armL_x', -0.35); this._t('armR_x', 0);
          this._t('forearmL_x', -0.87); this._t('forearmR_x', -0.10);
          this._t('spine_x', 0.10); this._t('head_x', -0.15);
          break;
        case 'surprised':
          this._t('armL_x', -0.70); this._t('armR_x', -0.70);
          this._t('forearmL_x', -0.26); this._t('forearmR_x', -0.26);
          this._t('spine_x', -0.10); this._t('head_x', -0.20);
          break;
        case 'tired':
          this._t('armL_x', 0); this._t('armR_x', 0);
          this._t('forearmL_x', -0.05); this._t('forearmR_x', -0.05);
          this._t('spine_x', 0.15); this._t('head_x', 0.15);
          break;
        case 'frustrated':
          this._t('armL_x', -0.87); this._t('armR_x', -0.87);
          this._t('forearmL_x', -0.52); this._t('forearmR_x', -0.52);
          this._t('spine_x', 0.10); this._t('head_x', 0);
          break;
        case 'happy':
          this._t('armL_x', -0.35 + Math.sin(this.cycle * 4) * 0.17);
          this._t('armR_x', -0.35 + Math.sin(this.cycle * 4 + Math.PI) * 0.17);
          this._t('forearmL_x', -0.35); this._t('forearmR_x', -0.35);
          this._t('spine_x', -0.05); this._t('head_x', -0.10);
          break;
      }
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
      this.model.position.y = Math.min(offset, 0.20); // max 20cm upward correction (was 10cm — too low for crawl/climb)
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
    let n = cv + diff * alpha;
    // FIX-D: Normalize accumulated value to prevent rotation drift
    while (n >  Math.PI) n -= Math.PI * 2;
    while (n < -Math.PI) n += Math.PI * 2;
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

    const age = ({ infant: 1, early_toddler: 2, late_toddler: 3, preschool: 4, child: 8 } as Record<string, number>)[ageGroupId] ?? 4;
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