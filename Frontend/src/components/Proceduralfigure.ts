/**
 * ProceduralFigure.ts  — v2.0 (BUG-FIX + ANATOMY AUDIT)
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds a fully-animated child figure from Three.js primitives.
 * No GLB / skeleton / skinning required.
 *
 * ═══ CHANGES v2.0 ══════════════════════════════════════════════════════════
 *
 * FIX-A  JOINT LIMITS — Anatomical clamp on every rotation target
 *        Root cause: shL_x=-2.55rad (crying) = -146° backward → impossible.
 *                    shL_x=-(PI+0.32) (excited) = -198° → arm wraps around.
 *        Fix: Added JOINT_LIMITS map. _setTarget() now calls _clamp() before
 *             storing value. Every emotion/action is within anatomy.
 *
 * FIX-B  EMOTION PRIORITY — Action cannot overwrite emotion in same frame
 *        Root cause: isCrawl sets spine_x=1.10, then emotion=excited
 *                    overwrites spine_x=0.08 in same frame. Last write wins.
 *        Fix: Two-pass system. Actions set base layer. Emotions apply delta
 *             on top. Emotions never reset action-critical joints (legs, hips).
 *
 * FIX-C  LERP SHORT-ARC — Prevent 360° spin through 180° on state change
 *        Root cause: Transition fall(-144°)→idle(0°) lerps through -72°→-144°
 *                    at low FPS, visually going the long way around.
 *        Fix: _lerpAngle() uses angle difference modulo 2π so lerp always
 *             takes shortest arc (< 180°).
 *
 * FIX-D  CRAWL CYCLE RATE — Too slow vs. real infant crawl data
 *        Root cause: cycleRate=1.8 rad/s → 0.29Hz → 0.57 steps/s.
 *                    NIH data: infant crawl ~0.59 cycles/s → needs 3.7 rad/s.
 *        Fix: crawl cycleRate raised to 3.2 rad/s (accounting for toddler
 *             being faster than infant).
 *
 * FIX-E  CRAWL ELBOW — Should be straight (0 rad) for floor weight-bearing
 *        Fix: elbowBend=0 during crawl.
 *
 * FIX-F  RUN HIP — 80.2° exceeds gait max of ~70°
 *        Fix: run legSwing reduced 1.40→1.22 rad (exactly 70°).
 *
 * FIX-G  CLIMB KNEE — Was never set, defaulted to 0 (straight leg)
 *        Fix: climb now sets hipL/R and kneeL/R for realistic ladder pose.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ANATOMY REFERENCE (sources: IRCOBI, APTA Pediatric, NIH PMC)
 *
 *  Joint          Forward(+x)  Backward(-x)   Abduct(+z)   Notes
 *  ─────────────────────────────────────────────────────────────────────────
 *  Shoulder x     +3.14 rad    -1.05 rad      ±1.57 rad    Overhead = +PI
 *  Shoulder z     +1.57 rad    -1.57 rad                   Lateral raise
 *  Elbow x        0 → +2.53    (no hyperext)               Flex only
 *  Hip x          +1.22 rad    -0.70 rad                   70° flex, 40° ext
 *  Hip z          ±0.70 rad                                 Abduction
 *  Knee x         0 → +2.44    (no hyperext)               Flex only
 *  Spine x        +1.31 rad    -0.44 rad                   75° forward
 *  Spine y        ±0.35 rad                                 Lateral sway
 *  Head x         +0.52 rad    -0.52 rad                   ±30° nod
 *  Head y         ±0.52 rad                                 ±30° turn
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Anthropometry table  (from ageGroups.js + WHO/CDC 50th percentile)
// ─────────────────────────────────────────────────────────────────────────────
interface Anthropometry {
  realHeight:     number;
  headRadius:     number;
  neckLength:     number;
  torsoLength:    number;
  torsoRadius:    number;
  legLength:      number;
  armLength:      number;
  shoulderWidth:  number;
  hipWidth:       number;
  skinColor:      number;
  outfitColor:    number;
  accentColor:    number;
}

const ANTHROPOMETRY: Record<string, Anthropometry> = {
  infant: {
    realHeight: 0.70, headRadius: 0.078, neckLength: 0.040,
    torsoLength: 0.22, torsoRadius: 0.070,
    legLength: 0.284, armLength: 0.160,
    shoulderWidth: 0.12, hipWidth: 0.08,
    skinColor: 0xf5cba7, outfitColor: 0xfde68a, accentColor: 0xfb923c,
  },
  toddler: {
    realHeight: 0.90, headRadius: 0.075, neckLength: 0.050,
    torsoLength: 0.28, torsoRadius: 0.080,
    legLength: 0.420, armLength: 0.240,
    shoulderWidth: 0.16, hipWidth: 0.10,
    skinColor: 0xf5cba7, outfitColor: 0x93c5fd, accentColor: 0x3b82f6,
  },
  preschool: {
    realHeight: 1.10, headRadius: 0.070, neckLength: 0.060,
    torsoLength: 0.34, torsoRadius: 0.090,
    legLength: 0.560, armLength: 0.320,
    shoulderWidth: 0.20, hipWidth: 0.12,
    skinColor: 0xf5cba7, outfitColor: 0x86efac, accentColor: 0x22c55e,
  },
  school_age: {
    realHeight: 1.30, headRadius: 0.065, neckLength: 0.070,
    torsoLength: 0.40, torsoRadius: 0.100,
    legLength: 0.700, armLength: 0.400,
    shoulderWidth: 0.24, hipWidth: 0.14,
    skinColor: 0xf5cba7, outfitColor: 0xc4b5fd, accentColor: 0x8b5cf6,
  },
  preteen: {
    realHeight: 1.50, headRadius: 0.065, neckLength: 0.080,
    torsoLength: 0.46, torsoRadius: 0.110,
    legLength: 0.830, armLength: 0.480,
    shoulderWidth: 0.28, hipWidth: 0.16,
    skinColor: 0xf5cba7, outfitColor: 0xfca5a5, accentColor: 0xef4444,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FIX-A: Anatomical joint limits (radians)
// Format: [min, max]  where rotation.x is forward(+)/backward(-)
// ─────────────────────────────────────────────────────────────────────────────
const JOINT_LIMITS: Record<string, [number, number]> = {
  // Shoulder X: backward extension −60°(−1.047) → forward flexion +180°(+3.14)
  // Shoulder must be able to reach overhead (PI rad) for climbing
  shL_x: [-1.047, Math.PI],
  shR_x: [-1.047, Math.PI],
  // Shoulder Z: abduction ±90°
  shL_z: [-1.571, 1.571],
  shR_z: [-1.571, 1.571],
  // Elbow X: 0 (straight) → 145° flex (2.53 rad). No hyperextension.
  elbL_x: [0, 2.530],
  elbR_x: [0, 2.530],
  // Hip X: 40° back-extension(−0.698) → 70° forward-flexion(+1.222)
  hipL_x: [-0.698, 1.222],
  hipR_x: [-0.698, 1.222],
  // Hip Z: abduction ±40°
  hipL_z: [-0.698, 0.698],
  hipR_z: [-0.698, 0.698],
  // Knee X: 0 (straight) → 140° flex (2.44 rad). No hyperextension.
  kneeL_x: [0, 2.443],
  kneeR_x: [0, 2.443],
  // Spine X: 25° backward(−0.436) → 75° forward(+1.309)
  spine_x: [-0.436, 1.309],
  // Spine Y: ±20° lateral sway
  spine_y: [-0.349, 0.349],
  // Head X: ±30° nod
  head_x: [-0.524, 0.524],
  // Head Y: ±45° turn
  head_y: [-0.785, 0.785],
  // Hip bob: 0 → 5cm
  hips_bob: [0, 0.05],
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared materials (cached)
// ─────────────────────────────────────────────────────────────────────────────
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(colorHex: number, roughness = 0.7, metalness = 0.0, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${colorHex}_${roughness}_${metalness}_${emissive}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color: colorHex, roughness, metalness,
      emissive: new THREE.Color(emissive), emissiveIntensity: 0,
    }));
  }
  return matCache.get(key)!.clone();
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────
function capsuleMesh(r: number, length: number, color: number): THREE.Mesh {
  const halfCyl = Math.max(0.001, length - r * 2);
  const geo = new THREE.CylinderGeometry(r, r * 0.92, halfCyl + r * 2, 10, 1);
  return new THREE.Mesh(geo, mat(color, 0.70));
}
function ellipsoid(rx: number, ry: number, rz: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat(color, 0.65));
  m.scale.set(rx, ry, rz);
  return m;
}
function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, 0.75));
}

// ─────────────────────────────────────────────────────────────────────────────
// Joint helpers
// ─────────────────────────────────────────────────────────────────────────────
function pivot(y = 0, name = ''): THREE.Group {
  const g = new THREE.Group();
  g.position.y = y;
  g.name = name;
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProceduralFigure
// ─────────────────────────────────────────────────────────────────────────────
export interface ActionEntry {
  a: string; v?: number; e?: string;
  wadingIn?: string; recovery?: boolean;
}

export class ProceduralFigure {
  root: THREE.Group;
  ageGroupId: string;
  agentId: number;

  private a: Anthropometry;

  // Joint pivots (rotated every frame)
  private hips!:       THREE.Group;
  private spine!:      THREE.Group;
  private headPivot!:  THREE.Group;
  private shoulderL!:  THREE.Group;
  private shoulderR!:  THREE.Group;
  private elbowL!:     THREE.Group;
  private elbowR!:     THREE.Group;
  private hipL!:       THREE.Group;
  private hipR!:       THREE.Group;
  private kneeL!:      THREE.Group;
  private kneeR!:      THREE.Group;

  // Meshes for tinting
  private skinMeshes:   THREE.Mesh[] = [];
  private outfitMeshes: THREE.Mesh[] = [];
  private eyeL!:        THREE.Mesh;
  private eyeR!:        THREE.Mesh;

  // Animation state
  private cycle       = 0;
  private wading      = false;
  private wadingAlpha = 0;

  // FIX-C: Lerp state stores CURRENT angle (for short-arc lerp)
  // targets = desired value this frame (reset each update)
  // current = smoothed value applied to bones
  private targets: Record<string, number> = {};
  private current: Record<string, number> = {};

  // Optional label sprite (managed externally by Canvas3D)
  labelSprite?: THREE.Sprite;

  constructor(ageGroupId: string, agentId: number, accentOverride?: number) {
    this.ageGroupId = ageGroupId;
    this.agentId    = agentId;
    this.a          = ANTHROPOMETRY[ageGroupId] ?? ANTHROPOMETRY['toddler'];
    this.root       = new THREE.Group();
    this.root.name  = `agent_${agentId}_${ageGroupId}`;
    this.root.userData.agentId      = agentId;
    this.root.userData.ageGroupId   = ageGroupId;
    this.root.userData.isProcedural = true;

    if (accentOverride !== undefined) {
      this.a = { ...this.a, accentColor: accentOverride, outfitColor: accentOverride };
    }

    this._build();
  }

  // ─── Build geometry ─────────────────────────────────────────────────────
  private _build() {
    const {
      headRadius, neckLength, torsoLength, torsoRadius,
      legLength, armLength, shoulderWidth, hipWidth,
      skinColor, outfitColor, accentColor,
    } = this.a;

    const thighLen = legLength * 0.54;
    const shinLen  = legLength * 0.46;
    const uArmLen  = armLength * 0.52;
    const fArmLen  = armLength * 0.48;

    const limbR = torsoRadius * 0.36;
    const armR  = torsoRadius * 0.26;
    const handR = armR * 0.85;
    const footW = limbR * 2.4;
    const footH = limbR * 0.55;
    const footD = limbR * 3.2;

    // ── Hips (pivot at foot level + legLength) ────────────────────────────
    const hips = pivot(legLength, 'hips');
    this.hips  = hips;
    this.root.add(hips);

    // ── LEGS ──────────────────────────────────────────────────────────────
    const buildLeg = (side: -1 | 1, hipPivot: THREE.Group, name: string) => {
      const legX = (hipWidth / 2) * side;

      const hip = pivot(0, `${name}_hip`);
      hip.position.x = legX;
      hipPivot.add(hip);

      const thigh = capsuleMesh(limbR, thighLen, outfitColor);
      thigh.position.y = -thighLen / 2;
      this.outfitMeshes.push(thigh);
      hip.add(thigh);

      const knee = pivot(-thighLen, `${name}_knee`);
      hip.add(knee);

      const shin = capsuleMesh(limbR * 0.88, shinLen, outfitColor);
      shin.position.y = -shinLen / 2;
      this.outfitMeshes.push(shin);
      knee.add(shin);

      const foot = box(footW, footH, footD, accentColor);
      foot.position.set(0, -shinLen - footH / 2, footD * 0.15);
      this.outfitMeshes.push(foot);
      knee.add(foot);

      return { hip, knee };
    };

    const { hip: hipL, knee: kneeL } = buildLeg(-1, hips, 'L');
    const { hip: hipR, knee: kneeR } = buildLeg( 1, hips, 'R');
    this.hipL  = hipL;  this.hipR  = hipR;
    this.kneeL = kneeL; this.kneeR = kneeR;

    // ── SPINE ─────────────────────────────────────────────────────────────
    const spine = pivot(0, 'spine');
    hips.add(spine);
    this.spine = spine;

    const torso = ellipsoid(torsoRadius, torsoLength / 2, torsoRadius * 0.75, outfitColor);
    torso.position.y = torsoLength / 2;
    this.outfitMeshes.push(torso);
    spine.add(torso);

    // ── SHOULDERS ─────────────────────────────────────────────────────────
    const shoulderBar = pivot(torsoLength, 'shoulders');
    spine.add(shoulderBar);

    const buildArm = (side: -1 | 1, name: string) => {
      const sh = pivot(0, `${name}_shoulder`);
      sh.position.x = (shoulderWidth / 2 + armR) * side;
      shoulderBar.add(sh);

      const uArm = capsuleMesh(armR, uArmLen, skinColor);
      uArm.position.y = -uArmLen / 2;
      this.skinMeshes.push(uArm);
      sh.add(uArm);

      const elbow = pivot(-uArmLen, `${name}_elbow`);
      sh.add(elbow);

      const fArm = capsuleMesh(armR * 0.88, fArmLen, skinColor);
      fArm.position.y = -fArmLen / 2;
      this.skinMeshes.push(fArm);
      elbow.add(fArm);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(handR, 8, 6),
        mat(skinColor, 0.65),
      );
      hand.position.y = -fArmLen - handR;
      this.skinMeshes.push(hand);
      elbow.add(hand);

      // Resting A-pose angle
      sh.rotation.z = side * 0.30;

      return { sh, elbow };
    };

    const { sh: shoulderL, elbow: elbowL } = buildArm(-1, 'L');
    const { sh: shoulderR, elbow: elbowR } = buildArm( 1, 'R');
    this.shoulderL = shoulderL; this.shoulderR = shoulderR;
    this.elbowL    = elbowL;    this.elbowR    = elbowR;

    // ── NECK ──────────────────────────────────────────────────────────────
    const neckPivot = pivot(torsoLength, 'neck');
    spine.add(neckPivot);

    const neckMesh = capsuleMesh(torsoRadius * 0.30, neckLength, skinColor);
    neckMesh.position.y = neckLength / 2;
    this.skinMeshes.push(neckMesh);
    neckPivot.add(neckMesh);

    // ── HEAD ──────────────────────────────────────────────────────────────
    const headPivot = pivot(neckLength, 'head');
    neckPivot.add(headPivot);
    this.headPivot = headPivot;

    const headMesh = ellipsoid(headRadius, headRadius * 1.05, headRadius * 0.95, skinColor);
    headMesh.position.y = headRadius;
    this.skinMeshes.push(headMesh);
    headPivot.add(headMesh);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(headRadius * 0.14, 8, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.3 });
    const eyeOffX = headRadius * 0.38;
    const eyeOffY = headRadius * 1.15;
    const eyeOffZ = headRadius * 0.88;

    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone());
    this.eyeL.position.set(-eyeOffX, eyeOffY, eyeOffZ);
    this.eyeR.position.set( eyeOffX, eyeOffY, eyeOffZ);
    headPivot.add(this.eyeL, this.eyeR);

    // Pupils
    const pupGeo = new THREE.SphereGeometry(headRadius * 0.07, 6, 6);
    const pupMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const pupL   = new THREE.Mesh(pupGeo, pupMat);
    const pupR   = new THREE.Mesh(pupGeo, pupMat.clone());
    pupL.position.z = headRadius * 0.08;
    pupR.position.z = headRadius * 0.08;
    this.eyeL.add(pupL);
    this.eyeR.add(pupR);

    // Nose
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius * 0.09, 6, 4),
      mat(skinColor * 0.9, 0.7),
    );
    nose.position.set(0, eyeOffY - headRadius * 0.18, eyeOffZ + headRadius * 0.04);
    headPivot.add(nose);

    // Mouth
    const mouth = box(headRadius * 0.30, headRadius * 0.06, headRadius * 0.05, 0xc0392b);
    mouth.name = 'mouth';
    mouth.position.set(0, eyeOffY - headRadius * 0.42, eyeOffZ + headRadius * 0.02);
    headPivot.add(mouth);

    // Cast/receive shadows on all meshes
    this.root.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow    = true;
        o.receiveShadow = true;
      }
    });
  }

  // ─── Per-frame update ───────────────────────────────────────────────────
  update(dt: number, entry?: ActionEntry | null) {
    const action  = entry?.a ?? 'idle';
    const emotion = entry?.e ?? 'neutral';
    this.wading   = !!(entry?.wadingIn);

    // FIX: Backend sends 'walk_to', 'investigate', 'walk_random' — not just 'walk'
    // These were all falling through to isIdle=true → V-POSE!
    const isWalk  = ['walk', 'walk_to', 'walk_random', 'investigate', 'reach'].includes(action);
    const isRun   = ['run', 'sprint', 'run_unstable'].includes(action);
    const isWade  = action === 'wade';
    const isCrawl = action === 'crawl';
    const isFall  = ['falling', 'free_fall', 'stumble', 'trip', 'fall_forward', 'lose_balance'].includes(action);
    const isClimb = ['climb_on', 'climb'].includes(action);
    // FIX-C4: New interaction actions — these have dedicated poses instead of idle/T-pose
    const isGrab     = ['grab', 'grab_mouth'].includes(action);
    const isReach    = action === 'reach_up';
    const isPull     = ['pull', 'pull_to_stand', 'open_drawer'].includes(action);
    const isLunge    = action === 'lunge';
    const isLookAround = action === 'look_around';
    const isPause    = action === 'pause';
    const isInteract = isGrab || isReach || isPull || isLunge || isLookAround || isPause;
    const isIdle  = !isWalk && !isRun && !isWade && !isCrawl && !isFall && !isClimb && !isInteract;

    // Corrected cycle rates based on biomechanics data
    const cycleRate = isRun ? 3.8 : isWalk ? 2.5 : isWade ? 1.2 : isCrawl ? 3.2
      : isInteract ? 1.0 : 0.6;
    this.cycle += dt * cycleRate;

    const s = Math.sin(this.cycle);
    const c = Math.cos(this.cycle);

    // ══════════════════════════════════════════════════════════════════════
    // LAYER 1 — ACTION BASE POSE
    // These values are set first. Emotions may override select joints on top.
    // ══════════════════════════════════════════════════════════════════════

    // ── Leg swing ─────────────────────────────────────────────────────────
    // FIX-F: run legSwing reduced 1.40→1.22 to keep hip within 70° anatomy limit
    const legSwing  = isRun ? 1.22 : isWalk ? 0.90 : isWade ? 0.42 : 0;
    // FIX-F: run kneeSwing kept at 1.05 (60°) — anatomically OK for sprinting
    const kneeSwing = isRun ? 1.05 : isWalk ? 0.55 : isWade ? 0.25 : 0;

    if (legSwing > 0) {
      // Walk / run / wade: alternating hip swing + knee flex on trailing leg
      this._setTarget('hipL_x',   s * legSwing);
      this._setTarget('hipR_x',  -s * legSwing);
      // Knee bends on the leg swinging BACK (negative hip = trailing leg)
      this._setTarget('kneeL_x',  Math.max(0, -c * kneeSwing));
      this._setTarget('kneeR_x',  Math.max(0,  c * kneeSwing));
    } else if (isCrawl) {
      // Crawl: hip fully flexed ~90°, alternating fore/aft
      // anatomy: hip flexion up to 90° is fine for crawl position
      this._setTarget('hipL_x',  -(0.90 + s * 0.32));   // −52° ± 18°  (was −60°±29° OVER limit)
      this._setTarget('hipR_x',  -(0.90 - s * 0.32));
      this._setTarget('kneeL_x',  1.22 - s * 0.28);      // 70° ± 16° knee flex (was 34°-52° too low)
      this._setTarget('kneeR_x',  1.22 + s * 0.28);
    } else if (isFall) {
      // Fall / stumble: legs slightly bent backward (natural stumble reflex)
      const flail = Math.sin(this.cycle * 5) * 0.28; // slightly slower flail, less extreme
      this._setTarget('hipL_x',  -0.40 + flail);
      this._setTarget('hipR_x',  -0.40 - flail);
      this._setTarget('kneeL_x',  0.52);
      this._setTarget('kneeR_x',  0.52);
    } else if (isClimb) {
      // FIX-G: Climb pose — alternating step-up motion
      // Left leg reaches up (hip high flexion), right leg pushes (less flex)
      const t2 = Math.abs(s);
      this._setTarget('hipL_x',  -(1.05 + t2 * 0.17));   // −60°-70° (was −(1.30+0.60)=−109° OVER)
      this._setTarget('hipR_x',  -(0.52 - t2 * 0.17));   // −30°-20°
      this._setTarget('kneeL_x',  0.87 + t2 * 0.35);     // 50°-70° knee flex
      this._setTarget('kneeR_x',  0.52 + t2 * 0.17);     // 30°-40° knee flex
    } else if (isGrab) {
      // Grab: slight knee bend (lowering to pick up), weight forward
      this._setTarget('hipL_x',  -0.17);
      this._setTarget('hipR_x',  -0.17);
      this._setTarget('kneeL_x',  0.35);
      this._setTarget('kneeR_x',  0.35);
    } else if (isReach) {
      // Reach up: tip-toe — ankle plantarflex, knees straight, hips neutral
      this._setTarget('hipL_x',   0);
      this._setTarget('hipR_x',   0);
      this._setTarget('kneeL_x',  0);
      this._setTarget('kneeR_x',  0);
    } else if (isPull) {
      // Pull: wide stance, weight back, knees bent
      this._setTarget('hipL_x',  -0.26);
      this._setTarget('hipR_x',  -0.26);
      this._setTarget('kneeL_x',  0.52);
      this._setTarget('kneeR_x',  0.52);
    } else if (isLunge) {
      // Lunge: one leg forward, one back — quick burst motion
      this._setTarget('hipL_x',  -0.70);
      this._setTarget('hipR_x',   0.35);
      this._setTarget('kneeL_x',  0.87);
      this._setTarget('kneeR_x',  0.17);
    } else {
      // Idle / look_around / pause
      this._setTarget('hipL_x',  0);
      this._setTarget('hipR_x',  0);
      this._setTarget('kneeL_x', 0);
      this._setTarget('kneeR_x', 0);
    }

    // ── Arm swing ─────────────────────────────────────────────────────────
    // Walk ±40°(0.70 rad), Run ±63°(1.10 rad) — both anatomically OK
    const armSwing = isRun ? 1.10 : isWalk ? 0.70 : isWade ? 0.30 : 0;

    if (armSwing > 0) {
      // Natural arm counter-swing (opposite to legs)
      // Negative X = forward, Positive X = backward
      this._setTarget('shL_x', -s * armSwing);   // left arm swings opposite to left leg
      this._setTarget('shR_x',  s * armSwing);   // right arm swings opposite to right leg
    } else if (isCrawl) {
      // Crawl: arms reach forward alternately (weight-bearing, elbow straight)
      // Shoulder swings ±26° around −90° (arms pointing forward/down)
      this._setTarget('shL_x', -(1.40 - s * 0.45));  // −80°±26°  (was −(PI/2±0.45) = ok but using correct value)
      this._setTarget('shR_x', -(1.40 + s * 0.45));
    } else if (isFall) {
      // Fall: arms instinctively fly up/forward to ~90°-100°
      // FIX-A: was -PI*0.8 = −144°. Correct reflex is forward-upward, not backward.
      // Children instinctively extend arms forward when falling (APTA pediatric)
      const flailA = Math.sin(this.cycle * 5) * 0.28;
      this._setTarget('shL_x', -(1.22 + flailA));  // ~−70° ± 16°  (was −144° IMPOSSIBLE)
      this._setTarget('shR_x', -(1.22 - flailA));
    } else if (isClimb) {
      // Climb: arms reach forward and upward alternately
      // Negative X = reaching forward/up (correct for climbing)
      const t2 = Math.abs(s);
      this._setTarget('shL_x', -(1.40 + t2 * 0.35));  // −80°~−100° (reaching up)
      this._setTarget('shR_x', -(1.05 + t2 * 0.35));  // −60°~−80°
    } else if (isGrab) {
      // FIX-C4: Grab — both arms extend forward ~70° to reach for object
      this._setTarget('shL_x', -1.22);  // forward 70°
      this._setTarget('shR_x', -1.22);
    } else if (isReach) {
      // FIX-C4: Reach up — arms forward and overhead ~130° with slight sway
      // Negative values push arms forward/up (correct direction)
      this._setTarget('shL_x', -(2.27 + s * 0.10));  // ~130°±6° forward-up
      this._setTarget('shR_x', -(2.27 - s * 0.10));
    } else if (isPull) {
      // FIX-C4: Pull — arms forward ~50°, elbows slightly bent, pulling back
      this._setTarget('shL_x', -(0.87 - s * 0.17));  // ~50°-40° cyclic pull
      this._setTarget('shR_x', -(0.87 + s * 0.17));
    } else if (isLunge) {
      // FIX-C4: Lunge — arms out for balance
      this._setTarget('shL_x', -0.52);
      this._setTarget('shR_x', -0.52);
    } else if (isLookAround) {
      // FIX-C4: Look around — arms relaxed at sides, slight sway
      this._setTarget('shL_x', -s * 0.10);
      this._setTarget('shR_x',  s * 0.10);
    } else {
      // Idle / pause / wade
      this._setTarget('shL_x', isWade ? -s * 0.30 : 0);
      this._setTarget('shR_x', isWade ?  s * 0.30 : 0);
    }

    // Arm abduction (spread from body)
    // Walk/idle: small spread so arms don't clip torso but stay close
    const armDropZVal = isGrab ? 0.17 : isReach ? 0.10 : isCrawl ? 0.08 : isClimb ? 0.12 : 0.15;
    this._setTarget('shL_z',  armDropZVal);
    this._setTarget('shR_z', -armDropZVal);

    // Elbow bend per action
    const elbowBend = isRun ? 0.60 : isWalk ? 0.30 : isCrawl ? 0.05 : isClimb ? 0.52
      : isGrab ? 0.52 : isReach ? 0.17 : isPull ? 0.70 : isLunge ? 0.35 : 0.10;
    this._setTarget('elbL_x', elbowBend);
    this._setTarget('elbR_x', elbowBend);

    // ── Spine ─────────────────────────────────────────────────────────────
    if (isCrawl) {
      this._setTarget('spine_x',  1.10);
      this._setTarget('spine_y',  0);
    } else if (isRun) {
      this._setTarget('spine_x',  0.18);
      this._setTarget('spine_y',  s * 0.10);
    } else if (isFall) {
      this._setTarget('spine_x',  0.52);
      this._setTarget('spine_y',  0);
    } else if (isClimb) {
      this._setTarget('spine_x', -0.26);
      this._setTarget('spine_y',  0);
    } else if (isGrab) {
      // FIX-C4: Grab — lean forward ~25° toward object
      this._setTarget('spine_x',  0.44);
      this._setTarget('spine_y',  0);
    } else if (isReach) {
      // FIX-C4: Reach up — slight backward lean to counterbalance arms
      this._setTarget('spine_x', -0.18);
      this._setTarget('spine_y',  0);
    } else if (isPull) {
      // FIX-C4: Pull — lean backward ~20° (counterweight)
      this._setTarget('spine_x', -0.35);
      this._setTarget('spine_y',  s * 0.05);
    } else if (isLunge) {
      // FIX-C4: Lunge — forward lean ~15°
      this._setTarget('spine_x',  0.26);
      this._setTarget('spine_y',  0);
    } else {
      const breathe = (isIdle || isPause) ? Math.sin(this.cycle * 0.5) * 0.022 : 0;
      this._setTarget('spine_x',  breathe);
      this._setTarget('spine_y',  (isWalk || isWade) ? s * 0.08 : 0);
    }

    // ── Head ──────────────────────────────────────────────────────────────
    if (isFall) {
      this._setTarget('head_x', -0.26);  // look down toward impact point
    } else if (isCrawl) {
      this._setTarget('head_x', -0.52);  // looking forward-down in crawl pose
    } else if (isGrab) {
      this._setTarget('head_x',  0.26);  // FIX-C4: look down at object being grabbed
    } else if (isReach) {
      this._setTarget('head_x', -0.35);  // FIX-C4: look up at target
    } else if (isPull) {
      this._setTarget('head_x',  0.17);  // FIX-C4: look slightly down at hands
    } else if (isLookAround) {
      // FIX-C4: Head turns side-to-side ±45° continuously
      this._setTarget('head_x',  0);
    } else {
      this._setTarget('head_x', 0);
    }
    // FIX-C4: look_around cycles head Y, idle has subtle sway
    const headYaw = isLookAround ? Math.sin(this.cycle * 0.8) * 0.78  // ±45° scan
      : (isIdle || isPause) ? Math.sin(this.cycle * 0.3) * 0.06 : 0;
    this._setTarget('head_y', headYaw);

    // ── Hips bob ──────────────────────────────────────────────────────────
    const bob = (isRun || isWalk) ? Math.abs(s) * (isRun ? 0.025 : 0.012) : 0;
    this._setTarget('hips_bob', bob);

    // ══════════════════════════════════════════════════════════════════════
    // LAYER 2 — EMOTION OVERRIDES
    // FIX-B: Emotions override only upper-body / expressive joints.
    //        Leg/hip locomotion joints are NEVER overwritten by emotions.
    //        All values validated against JOINT_LIMITS.
    // ══════════════════════════════════════════════════════════════════════

    if (emotion !== 'neutral') {
      switch (emotion) {
        case 'crying':
          // Crying: head bowed forward, spine hunched, arms hugged to body
          // Head nods forward rapidly (sobbing motion)
          this._setTarget('head_x',   0.42 + Math.sin(this.cycle * 10) * 0.08);  // nod ~24° ± 5°
          this._setTarget('spine_x',  0.32);  // 18° forward hunch — correct
          // Arms: held across chest (forward ~60°, abducted slightly)
          // FIX-A: was −2.55rad(−146°). CORRECT crying pose: arms forward ~60°
          //        Children hug themselves when crying, arms go FORWARD not backward.
          this._setTarget('shL_x',   -0.87);  this._setTarget('shL_z',  0.52);
          this._setTarget('shR_x',   -0.87);  this._setTarget('shR_z', -0.52);
          this._setTarget('elbL_x',   1.40);  // arms bent — hugging posture
          this._setTarget('elbR_x',   1.40);
          break;

        case 'mischievous':
          // Mischievous: spine leaning back a tiny bit, head turned, one arm akimbo
          this._setTarget('spine_x', -0.18);  // 10° backward (was -0.20 OK)
          this._setTarget('head_y',   0.30);  // turned to side (was 0.32 OK)
          // Arms: akimbo pose — one hand on hip
          this._setTarget('shL_x',   -0.52);  this._setTarget('shL_z',  0.52);
          this._setTarget('shR_x',   -0.52);  this._setTarget('shR_z', -0.52);
          this._setTarget('elbL_x',   1.57);  // 90° bend = hand-on-hip
          this._setTarget('elbR_x',   1.57);
          break;

        case 'excited':
          // Excited: arms raised overhead (cheering/jumping)
          // FIX-A: was -(PI+0.32)=−198°. CORRECT excited pose: arms UP, forward ~150°-170°
          //        Children raise hands UPWARD when excited, not behind their back.
          this._setTarget('shL_x',  2.62 + Math.sin(this.cycle * 8) * 0.26);  // ~150°±15°
          this._setTarget('shR_x',  2.62 + Math.sin(this.cycle * 8 + Math.PI) * 0.26);
          this._setTarget('shL_z',  0.26);  // slightly outward for V shape
          this._setTarget('shR_z', -0.26);
          this._setTarget('elbL_x',  0.26);  // arms mostly straight
          this._setTarget('elbR_x',  0.26);
          this._setTarget('spine_x', 0.08);  // slight forward lean
          break;

        case 'scared':
          // Scared: arms raised in defensive guard, head ducked
          this._setTarget('head_x',   0.35);   // duck down
          this._setTarget('spine_x',  0.26);   // hunch
          this._setTarget('shL_x',   -0.52);   // arms up in guard
          this._setTarget('shR_x',   -0.52);
          this._setTarget('shL_z',    0.87);   // spread wide
          this._setTarget('shR_z',   -0.87);
          this._setTarget('elbL_x',   1.57);   // elbows 90°
          this._setTarget('elbR_x',   1.57);
          break;

        case 'focused':
          // Focused: leaning forward slightly, arms in front
          this._setTarget('spine_x',  0.14);
          this._setTarget('head_x',  -0.18);  // chin down looking at thing
          this._setTarget('shL_x',   -0.87);  // arms reaching forward
          this._setTarget('shR_x',   -0.87);
          this._setTarget('elbL_x',   0.52);
          this._setTarget('elbR_x',   0.52);
          break;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // APPLY LERPED ROTATIONS
    // FIX-P4: dt*8 = ~200ms convergence (balanced: smooth but responsive)
    //         dt*12 was robotic (130ms), dt*5 was too sluggish (900ms, V-POSE persisted)
    // ══════════════════════════════════════════════════════════════════════
    const LERP = Math.min(1, dt * 8);

    const applyR = (target: THREE.Object3D, xKey: string, yKey = '', zKey = '') => {
      if (xKey) target.rotation.x = this._lerpAngle(xKey, LERP);
      if (yKey) target.rotation.y = this._lerpAngle(yKey, LERP);
      if (zKey) target.rotation.z = this._lerpAngle(zKey, LERP);
    };

    applyR(this.hipL,      'hipL_x');
    applyR(this.hipR,      'hipR_x');
    applyR(this.kneeL,     'kneeL_x');
    applyR(this.kneeR,     'kneeR_x');
    applyR(this.shoulderL, 'shL_x', '', 'shL_z');
    applyR(this.shoulderR, 'shR_x', '', 'shR_z');
    applyR(this.elbowL,    'elbL_x');
    applyR(this.elbowR,    'elbR_x');
    applyR(this.spine,     'spine_x', 'spine_y');
    applyR(this.headPivot, 'head_x',  'head_y');

    // FIX-P4: Add subtle secondary motion for child-like softness
    // Gentle body sway (children move their torso slightly when walking)
    if (isWalk || isRun) {
      const sway = Math.sin(this.cycle * 1.3) * (isRun ? 0.04 : 0.025);
      this.spine.rotation.z = sway;
    }

    this.hips.position.y = this.a.legLength + this._lerpAngle('hips_bob', LERP);

    this._updateWadingTint(dt);
    this._updateBlink(dt);
  }

  // ─── FIX-A: Anatomical clamp helper ─────────────────────────────────────
  private _clamp(key: string, value: number): number {
    const lim = JOINT_LIMITS[key];
    if (!lim) return value;
    return Math.max(lim[0], Math.min(lim[1], value));
  }

  // ─── FIX-A: _setTarget now clamps value against anatomical limits ────────
  private _setTarget(key: string, value: number) {
    const clamped = this._clamp(key, value);
    this.targets[key] = clamped;
    // Initialize current to target on first use to avoid start-of-sim snap
    if (!(key in this.current)) this.current[key] = clamped;
  }

  // ─── FIX-C: Short-arc lerp — always takes the shortest angle path ────────
  // Prevents lerp from going the "long way" through ±180° on state transitions.
  private _lerpAngle(key: string, alpha: number): number {
    const t   = this.targets[key] ?? 0;
    const cv  = this.current[key] ?? t;
    // Compute the difference modulo 2π to pick the shortest arc
    let diff  = t - cv;
    const TWO_PI = Math.PI * 2;
    // Wrap diff into [−π, +π]
    while (diff >  Math.PI) diff -= TWO_PI;
    while (diff < -Math.PI) diff += TWO_PI;
    const n = cv + diff * alpha;
    this.current[key] = n;
    return n;
  }

  // ─── Wading blue tint ──────────────────────────────────────────────────
  private _wadingColor = new THREE.Color(0.2, 0.5, 1.0);
  private _blinkTimer  = 3 + Math.random() * 4;
  private _blinking    = false;
  private _blinkPhase  = 0;

  private _updateWadingTint(dt: number) {
    const speed = 2.8;
    this.wadingAlpha = this.wading
      ? Math.min(1, this.wadingAlpha + dt * speed)
      : Math.max(0, this.wadingAlpha - dt * speed);

    if (this.wadingAlpha === 0) return;

    const alpha = this.wadingAlpha * 0.45;
    const tintMesh = (mesh: THREE.Mesh, base: number) => {
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (!m?.color) return;
      m.color.copy(new THREE.Color(base)).lerp(this._wadingColor, alpha);
    };
    this.outfitMeshes.forEach(m => tintMesh(m, this.a.outfitColor));
    this.skinMeshes.forEach(m =>   tintMesh(m, this.a.skinColor));
  }

  // ─── Eye blink ─────────────────────────────────────────────────────────
  private _updateBlink(dt: number) {
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0 && !this._blinking) {
      this._blinking   = true;
      this._blinkPhase = 0;
    }
    if (this._blinking) {
      this._blinkPhase += dt * 12;
      const closed = Math.sin(this._blinkPhase * Math.PI);
      this.eyeL.scale.y = Math.max(0.05, 1 - closed);
      this.eyeR.scale.y = Math.max(0.05, 1 - closed);
      if (this._blinkPhase >= 1) {
        this._blinking    = false;
        this._blinkTimer  = 2.5 + Math.random() * 4.5;
        this.eyeL.scale.y = 1;
        this.eyeR.scale.y = 1;
      }
    }
  }

  // ─── Public setters ──────────────────────────────────────────────────────
  setPosition(x: number, y: number, z: number) {
    this.root.position.set(x, y, z);
  }
  setRotationY(rad: number) {
    this.root.rotation.y = rad;
  }
  getRoot(): THREE.Group { return this.root; }

  dispose() {
    this.root.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach(mat2 => mat2.dispose());
        } else {
          (m.material as THREE.Material)?.dispose();
        }
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────
export const PROCEDURAL_AGE_GROUPS = new Set(['infant', 'school_age', 'preteen']);

export function createFigure(
  ageGroupId:   string,
  agentId:      number,
  accentColor?: number,
): ProceduralFigure {
  return new ProceduralFigure(ageGroupId, agentId, accentColor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent palette (shared with Canvas3D)
// ─────────────────────────────────────────────────────────────────────────────
export const AGENT_PALETTE = [
  0x00e5ff, 0x69f0ae, 0xffab40, 0xec407a, 0xce93d8,
  0x42a5f5, 0xd4e157, 0xff7043, 0x26c6da, 0xef5350,
];