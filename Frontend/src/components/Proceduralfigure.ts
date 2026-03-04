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
    shoulderWidth: 0.18, hipWidth: 0.08,
    skinColor: 0xf5cba7, outfitColor: 0xfde68a, accentColor: 0xfb923c,
  },
  toddler: {
    realHeight: 0.90, headRadius: 0.075, neckLength: 0.050,
    torsoLength: 0.28, torsoRadius: 0.080,
    legLength: 0.420, armLength: 0.240,
    shoulderWidth: 0.22, hipWidth: 0.10,
    skinColor: 0xf5cba7, outfitColor: 0x93c5fd, accentColor: 0x3b82f6,
  },
  preschool: {
    realHeight: 1.10, headRadius: 0.070, neckLength: 0.060,
    torsoLength: 0.34, torsoRadius: 0.090,
    legLength: 0.560, armLength: 0.320,
    shoulderWidth: 0.26, hipWidth: 0.12,
    skinColor: 0xf5cba7, outfitColor: 0x86efac, accentColor: 0x22c55e,
  },
  school_age: {
    realHeight: 1.30, headRadius: 0.065, neckLength: 0.070,
    torsoLength: 0.40, torsoRadius: 0.100,
    legLength: 0.700, armLength: 0.400,
    shoulderWidth: 0.30, hipWidth: 0.14,
    skinColor: 0xf5cba7, outfitColor: 0xc4b5fd, accentColor: 0x8b5cf6,
  },
  // FIX: Backend sends 'school' as ageGroupId — alias to school_age
  school: {
    realHeight: 1.30, headRadius: 0.065, neckLength: 0.070,
    torsoLength: 0.40, torsoRadius: 0.100,
    legLength: 0.700, armLength: 0.400,
    shoulderWidth: 0.30, hipWidth: 0.14,
    skinColor: 0xf5cba7, outfitColor: 0xc4b5fd, accentColor: 0x8b5cf6,
  },
  preteen: {
    realHeight: 1.50, headRadius: 0.065, neckLength: 0.080,
    torsoLength: 0.46, torsoRadius: 0.110,
    legLength: 0.830, armLength: 0.480,
    shoulderWidth: 0.34, hipWidth: 0.16,
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
  // Elbow X: flexion only. Negative = bend inward (toward body). 0 = straight.
  elbL_x: [-2.530, 0],
  elbR_x: [-2.530, 0],
  // Hip X: 100° flexion(−1.745) → 70° forward-swing(+1.222)
  // BUG-FIX: was -0.698(40°) which clamped all sitting/lying/crawl poses!
  // Children hip flexion reaches ~125° (APTA). Allow -100° for sit/lie/crawl.
  hipL_x: [-1.745, 1.222],
  hipR_x: [-1.745, 1.222],
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

  // FIX #17: Minimum action duration tracking — prevent instant state changes
  private _lastAction = '';
  private _actionTimer = 0;
  private static readonly MIN_ACTION_DURATION = 0.3; // seconds
  private _breathTimer2 = 0;  // separate timer for idle breathing (not tied to cycle)

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
      // Ensure shoulder pivot sits outside torso regardless of small shoulderWidth configs
      const safeShoulderX = Math.max(shoulderWidth / 2 + armR, torsoRadius + armR * 1.5);
      sh.position.x = safeShoulderX * side;
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

      // FIX-E: A-pose rotation removed — applyR() sets rotation.z each frame
      // from shL_z/shR_z targets (minimum 0.30 rad enforced in update()).
      // Old code: sh.rotation.z = side * 0.30; — was overwritten and caused clipping.

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
    let action  = entry?.a ?? 'idle';
    const emotion = entry?.e ?? 'neutral';

    // FIX #17: Enforce minimum action duration — ignore action changes that happen
    // too fast (< 0.3s), unless moving to a higher-priority state like 'hurt' or 'fall'
    this._actionTimer += dt;
    const PRIORITY_ACTIONS = ['fall', 'falling', 'free_fall', 'hurt_light', 'hurt_medium', 'hurt_heavy', 'recoil'];
    if (action !== this._lastAction) {
      if (this._actionTimer < ProceduralFigure.MIN_ACTION_DURATION && !PRIORITY_ACTIONS.includes(action)) {
        // Keep the previous action — too early to switch
        action = this._lastAction || action;
      } else {
        this._lastAction = action;
        this._actionTimer = 0;
      }
    }
    this.wading   = !!(entry?.wadingIn);

    // Action classification
    const isWalk  = ['walk', 'walk_to', 'walk_random', 'investigate', 'reach'].includes(action);
    const isRun   = ['run', 'sprint', 'run_unstable'].includes(action);
    const isWade  = action === 'wade';
    const isCrawl = action === 'crawl';
    const isFall  = ['falling', 'free_fall', 'stumble', 'trip', 'fall_forward', 'lose_balance'].includes(action);
    const isClimb = ['climb_on', 'climb', 'climb_approach', 'climb_reach', 'climb_pull', 'climb_mount', 'climb_down', 'step_up', 'step_down'].includes(action);
    const isClimbFail = action === 'climb_fail';
    // Hurt/pain states (NEW)
    const isHurt     = ['hurt_light', 'hurt_medium', 'hurt_heavy', 'hurt_shock', 'recoil'].includes(action);
    const isCrying   = ['crying_stand', 'crying_sit'].includes(action);
    const isGetUp    = ['get_up_slow', 'get_up_fast'].includes(action);
    // Interaction actions
    const isGrab     = ['grab', 'grab_mouth'].includes(action);
    const isReach    = action === 'reach_up';
    const isPull     = ['pull', 'pull_to_stand', 'open_drawer'].includes(action);
    const isLunge    = action === 'lunge';
    const isLookAround = action === 'look_around';
    const isPause    = action === 'pause';
    // F7 + Group G rare events
    const isSlide     = action === 'slide';
    const isRareEvent = ['dodge', 'push', 'throw', 'pick_up', 'sit_down', 'stand_up', 'jump', 'land'].includes(action);
    const isInteract = isGrab || isReach || isPull || isLunge || isLookAround || isPause || isHurt || isCrying || isGetUp || isClimbFail || isSlide || isRareEvent;
    const isIdle  = !isWalk && !isRun && !isWade && !isCrawl && !isFall && !isClimb && !isInteract;

    // FIX #1: cycleRate = 0 when idle — stops sliding!
    // Idle uses a separate breathTimer for subtle breathing only.
    const cycleRate = isRun ? 3.8 : isWalk ? 2.5 : isWade ? 1.2 : isCrawl ? 3.2
      : isFall ? 5.0 : isClimb ? 2.5 : isHurt ? 2.0 : isCrying ? 1.5
      : isGetUp ? 0.8
      : action === 'push' ? 1.0 : action === 'pick_up' ? 0.8 : action === 'sit_down' ? 0.5
      : action === 'stand_up' ? 0.8 : isSlide ? 0 : isRareEvent ? 0
      : isInteract ? 1.0 : 0;   // idle & pause = 0
    this.cycle += dt * cycleRate;
    this._breathTimer2 += dt;  // always ticks for idle breathing

    const s = Math.sin(this.cycle);
    const c = Math.cos(this.cycle);
    const bt = this._breathTimer2;  // for idle-only effects

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
      // Multi-phase climb: alternating step-up with arm pull
      // FIX #8: Use s directly (not abs(s)) for true left/right alternation
      if (action === 'step_up' || action === 'step_down') {
        // Simple step: one leg up, one stable
        const dir = action === 'step_up' ? -1 : 1;
        this._setTarget('hipL_x',  dir * 0.70);
        this._setTarget('hipR_x',  0);
        this._setTarget('kneeL_x', action === 'step_up' ? 1.22 * (1 - Math.abs(s)) : 0.52);
        this._setTarget('kneeR_x', 0.35);
      } else {
        // Full climb: alternating legs — left goes up while right pushes, then swap
        this._setTarget('hipL_x',  -(0.87 + s * 0.35));   // alternates −52° to −122° 
        this._setTarget('hipR_x',  -(0.87 - s * 0.35));   // opposite phase
        this._setTarget('kneeL_x',  0.87 + s * 0.35);     // knee bends with hip
        this._setTarget('kneeR_x',  0.87 - s * 0.35);
        // Hip vertical bob to simulate pulling body upward
        this._setTarget('hips_bob', Math.abs(s) * 0.03);
      }
    } else if (isHurt) {
      // ── HURT / PAIN REACTIONS (NEW) ──
      if (action === 'hurt_light' || action === 'recoil') {
        // Startle: step back, slight knee bend
        this._setTarget('hipL_x',   0.10);
        this._setTarget('hipR_x',   0.10);
        this._setTarget('kneeL_x',  0.17);
        this._setTarget('kneeR_x',  0.17);
      } else if (action === 'hurt_medium') {
        // Crouch down in pain: deep knee bend, hips flexed
        this._setTarget('hipL_x',  -0.70);
        this._setTarget('hipR_x',  -0.70);
        this._setTarget('kneeL_x',  1.22);
        this._setTarget('kneeR_x',  1.22);
      } else if (action === 'hurt_heavy') {
        // Fall down: phase-based (legs buckle then curl)
        const phase = Math.min(1, this.cycle * 0.5);
        this._setTarget('hipL_x',  -(0.35 + phase * 0.70));
        this._setTarget('hipR_x',  -(0.35 + phase * 0.70));
        this._setTarget('kneeL_x',  0.52 + phase * 1.57);
        this._setTarget('kneeR_x',  0.52 + phase * 1.57);
      } else {
        // hurt_shock: lying curled
        this._setTarget('hipL_x',  -1.05);
        this._setTarget('hipR_x',  -1.05);
        this._setTarget('kneeL_x',  2.09);
        this._setTarget('kneeR_x',  2.09);
      }
    } else if (isCrying) {
      if (action === 'crying_sit') {
        // Sitting on ground: hips flexed 50°, knees 90°
        this._setTarget('hipL_x',  -0.87);
        this._setTarget('hipR_x',  -0.87);
        this._setTarget('kneeL_x',  1.57);
        this._setTarget('kneeR_x',  1.57);
      } else {
        // crying_stand: knees slightly bent, wobbly
        this._setTarget('hipL_x',   0);
        this._setTarget('hipR_x',   0);
        this._setTarget('kneeL_x',  0.10);
        this._setTarget('kneeR_x',  0.10);
      }
    } else if (isGetUp) {
      // Get up from ground: progressive straightening
      const progress = Math.min(1, this.cycle * 0.8);
      const hipFlex = -0.87 * (1 - progress);
      const kneeFlex = 1.57 * (1 - progress);
      this._setTarget('hipL_x',  hipFlex);
      this._setTarget('hipR_x',  hipFlex);
      this._setTarget('kneeL_x', kneeFlex);
      this._setTarget('kneeR_x', kneeFlex);
    } else if (isClimbFail) {
      // Climb fail: stumble back
      this._setTarget('hipL_x',   0.17);
      this._setTarget('hipR_x',   0.17);
      this._setTarget('kneeL_x',  0.52);
      this._setTarget('kneeR_x',  0.52);
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
    } else if (isSlide) {
      // F7: Sliding on slippery surface — knees bent, lean back
      this._setTarget('hipL_x',  -0.17);  this._setTarget('hipR_x',  -0.17);
      this._setTarget('kneeL_x',  0.35);  this._setTarget('kneeR_x',  0.35);
    } else if (isRareEvent) {
      // Group G: Rare event poses
      switch (action) {
        case 'dodge':     // G1 — step sideways to dodge
          this._setTarget('hipL_x',  0.17);  this._setTarget('hipR_x', -0.17);
          this._setTarget('kneeL_x', 0.26);  this._setTarget('kneeR_x', 0.17);
          break;
        case 'push':      // G2 — pushing object, wide stance
          this._setTarget('hipL_x', -0.17);  this._setTarget('hipR_x', -0.17);
          this._setTarget('kneeL_x', 0.26);  this._setTarget('kneeR_x', 0.26);
          break;
        case 'throw':     // G3 — throwing, hip rotation
          this._setTarget('hipL_x',  0.17);  this._setTarget('hipR_x', -0.10);
          this._setTarget('kneeL_x', 0.10);  this._setTarget('kneeR_x', 0.10);
          break;
        case 'pick_up':   // G4 — deep bend to pick up
          this._setTarget('hipL_x', -0.52);  this._setTarget('hipR_x', -0.52);
          this._setTarget('kneeL_x', 0.87);  this._setTarget('kneeR_x', 0.87);
          break;
        case 'sit_down': { // G5 — sitting down progressively
          const sitProg = Math.min(1, this.cycle * 0.5);
          this._setTarget('hipL_x', -1.22 * sitProg);
          this._setTarget('hipR_x', -1.22 * sitProg);
          this._setTarget('kneeL_x', 1.57 * sitProg);
          this._setTarget('kneeR_x', 1.57 * sitProg);
          break;
        }
        case 'stand_up': { // G6 — standing up from sitting
          const standProg = Math.min(1, this.cycle * 0.8);
          this._setTarget('hipL_x', -1.22 * (1 - standProg));
          this._setTarget('hipR_x', -1.22 * (1 - standProg));
          this._setTarget('kneeL_x', 1.57 * (1 - standProg));
          this._setTarget('kneeR_x', 1.57 * (1 - standProg));
          break;
        }
        case 'jump': { // G7 — squat then extend
          const jumpPhase = Math.min(1, this.cycle * 2);
          if (jumpPhase < 0.4) {
            this._setTarget('hipL_x', -0.52);  this._setTarget('hipR_x', -0.52);
            this._setTarget('kneeL_x', 1.05);  this._setTarget('kneeR_x', 1.05);
          } else {
            this._setTarget('hipL_x',  0.10);  this._setTarget('hipR_x',  0.10);
            this._setTarget('kneeL_x', 0);     this._setTarget('kneeR_x', 0);
          }
          break;
        }
        case 'land':      // G8 — absorb landing impact
          this._setTarget('hipL_x', -0.35);  this._setTarget('hipR_x', -0.35);
          this._setTarget('kneeL_x', 0.70);  this._setTarget('kneeR_x', 0.70);
          break;
      }
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
      // Positive X = forward (toward face), Negative X = backward
      // When left leg forward (s>0), left arm goes backward (-s*swing)
      this._setTarget('shL_x', -s * armSwing);
      this._setTarget('shR_x',  s * armSwing);
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
      // FIX #8: Alternating arm reach — left up while right pulls, then swap
      // Shoulder counter-rotation for natural climbing motion
      if (action === 'step_up' || action === 'step_down') {
        this._setTarget('shL_x', -0.17);
        this._setTarget('shR_x',  0.17);
      } else if (action === 'climb_pull' || action === 'climb_mount') {
        // Extreme overhead reach during pull/mount phases
        this._setTarget('shL_x', -(2.09 + s * 0.35));   // alternating overhead
        this._setTarget('shR_x', -(2.09 - s * 0.35));
      } else {
        // Standard climb: alternating arm reach (one up, one down)
        this._setTarget('shL_x', -(1.40 + s * 0.45));   // left reaches vs pulls
        this._setTarget('shR_x', -(1.40 - s * 0.45));   // right opposite
      }
    } else if (isHurt) {
      if (action === 'hurt_light' || action === 'recoil') {
        this._setTarget('shL_x', -0.52);  this._setTarget('shR_x', -0.52);
      } else if (action === 'hurt_medium') {
        this._setTarget('shL_x', -0.87);  this._setTarget('shR_x', -0.87);
      } else if (action === 'hurt_heavy') {
        const phase = Math.min(1, this.cycle * 0.5);
        this._setTarget('shL_x', -(1.57 - phase * 0.70));
        this._setTarget('shR_x', -(1.57 - phase * 0.70));
      } else {
        this._setTarget('shL_x', -0.52);  this._setTarget('shR_x', -0.52);
      }
    } else if (isCrying) {
      // Crying: arms hugging self or rubbing eyes
      this._setTarget('shL_x', -0.87);  this._setTarget('shR_x', -0.87);
    } else if (isGetUp) {
      const progress = Math.min(1, this.cycle * 0.8);
      this._setTarget('shL_x', -(1.05 * (1 - progress)));
      this._setTarget('shR_x', -(1.05 * (1 - progress)));
    } else if (isClimbFail) {
      this._setTarget('shL_x', -0.87);  this._setTarget('shR_x', -0.87);
    } else if (isGrab) {
      this._setTarget('shL_x', -1.22);  this._setTarget('shR_x', -1.22);
    } else if (isReach) {
      this._setTarget('shL_x', -(2.27 + s * 0.10));
      this._setTarget('shR_x', -(2.27 - s * 0.10));
    } else if (isPull) {
      this._setTarget('shL_x', -(0.87 - s * 0.17));
      this._setTarget('shR_x', -(0.87 + s * 0.17));
    } else if (isLunge) {
      this._setTarget('shL_x', -0.52);  this._setTarget('shR_x', -0.52);
    } else if (isSlide) {
      // F7: arms out to sides for balance
      this._setTarget('shL_x', 0);  this._setTarget('shR_x', 0);
    } else if (isRareEvent) {
      switch (action) {
        case 'dodge':    this._setTarget('shL_x', -0.52);  this._setTarget('shR_x', -0.52);  break;
        case 'push':     this._setTarget('shL_x', -1.22);  this._setTarget('shR_x', -1.22);  break;
        case 'throw':    this._setTarget('shL_x', -1.57);  this._setTarget('shR_x',  0.35);  break;
        case 'pick_up':  this._setTarget('shL_x', -1.40);  this._setTarget('shR_x', -1.40);  break;
        case 'sit_down': this._setTarget('shL_x', -0.17);  this._setTarget('shR_x', -0.17);  break;
        case 'stand_up': {
          const sp = Math.min(1, this.cycle * 0.8);
          this._setTarget('shL_x', -(0.52 * (1 - sp)));  this._setTarget('shR_x', -(0.52 * (1 - sp)));
          break;
        }
        case 'jump': {
          const jp = Math.min(1, this.cycle * 2);
          if (jp < 0.4) { this._setTarget('shL_x', -0.52); this._setTarget('shR_x', -0.52); }
          else           { this._setTarget('shL_x', -1.57); this._setTarget('shR_x', -1.57); }
          break;
        }
        case 'land':     this._setTarget('shL_x', -0.17);  this._setTarget('shR_x', -0.17);  break;
      }
    } else if (isLookAround) {
      this._setTarget('shL_x', -s * 0.10);
      this._setTarget('shR_x',  s * 0.10);
    } else {
      this._setTarget('shL_x', isWade ? -s * 0.30 : 0);
      this._setTarget('shR_x', isWade ?  s * 0.30 : 0);
    }

    // FIX-E: Arm abduction — compute proportionally to prevent arm-torso clipping for broader body types.
    // FIX #16: DYNAMIC abduction — widen proportionally to arm swing magnitude.
    // When arms swing forward/back (high |shL_x|), the forearm sweeps closer to torso.
    // Adding swing-proportional abduction pushes the arm out during swing.
    const bodyRatio = this.a.torsoRadius / (this.a.shoulderWidth / 2);
    const A_POSE_BASE = Math.max(0.40, 0.30 + bodyRatio * 0.25);
    const rawAbduct = isHurt ? (action === 'hurt_medium' ? 0.45 : 0.52)
      : isCrying ? 0.52 : isSlide ? 0.87
      : action === 'dodge' ? 0.52 : action === 'push' ? 0.40 : action === 'throw' ? 0.40
      : action === 'pick_up' ? 0.40 : action === 'sit_down' ? 0.40 : action === 'stand_up' ? 0.40
      : action === 'jump' ? 0.45 : action === 'land' ? 0.52
      : isGrab ? 0.40 : isReach ? 0.35 : isCrawl ? 0.30 : isClimb ? 0.35 : A_POSE_BASE;
    const baseAbduct = Math.max(rawAbduct, A_POSE_BASE);
    // Dynamic component: wider abduction when arm swings forward/backward
    const armSwingMag = Math.abs(this.targets['shL_x'] ?? 0);
    const dynamicAbduct = baseAbduct + armSwingMag * 0.18; // 18% of swing angle added as extra abduction
    this._setTarget('shL_z', -dynamicAbduct);
    this._setTarget('shR_z',  dynamicAbduct);

    // Elbow bend per action
    let elbowBend = isRun ? 0.60 : isWalk ? 0.30 : isCrawl ? 0.05 : isClimb ? 0.52
      : isHurt ? (action === 'hurt_light' ? 1.05 : action === 'hurt_medium' ? 1.40 : 0.52)
      : isCrying ? 1.40 : isGetUp ? (1.57 * (1 - Math.min(1, this.cycle * 0.8)))
      : isSlide ? 0.17
      : action === 'dodge' ? 1.05 : action === 'push' ? 0.26 : action === 'throw' ? 0.17
      : action === 'pick_up' ? 0.35 : action === 'sit_down' ? 0.35
      : action === 'stand_up' ? 0.52 : action === 'jump' ? 0.26 : action === 'land' ? 0.35
      : isGrab ? 0.52 : isReach ? 0.17 : isPull ? 0.70 : isLunge ? 0.35 : 0.10;
    
    // Safety clamp to prevent forearm from folding directly into upper arm geometry
    const maxSafeElbow = Math.PI - 0.15; // ~170° to avoid complete fold-over
    elbowBend = Math.max(0, Math.min(maxSafeElbow, elbowBend));

    this._setTarget('elbL_x', -elbowBend);
    this._setTarget('elbR_x', -elbowBend);

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
      // FIX #8: Spine tilts FORWARD (leaning into the wall/object when climbing)
      this._setTarget('spine_x',  0.35);
      // Shoulder counter-rotation: slight lateral sway opposite to reaching arm
      this._setTarget('spine_y',  s * 0.12);
    } else if (isHurt) {
      if (action === 'hurt_light' || action === 'recoil') {
        this._setTarget('spine_x', -0.15);  // flinch backward
        this._setTarget('spine_y',  0);
      } else if (action === 'hurt_medium') {
        this._setTarget('spine_x',  0.52);  // curl forward in pain
        this._setTarget('spine_y',  0);
      } else if (action === 'hurt_heavy') {
        const phase = Math.min(1, this.cycle * 0.5);
        this._setTarget('spine_x',  0.87 + phase * 0.18);
        this._setTarget('spine_y',  0);
      } else {
        this._setTarget('spine_x',  0.70);  // hurt_shock: curled
        this._setTarget('spine_y',  0);
      }
    } else if (isCrying) {
      this._setTarget('spine_x',  action === 'crying_sit' ? 0.44 : 0.26);
      this._setTarget('spine_y',  Math.sin(this.cycle * 3) * 0.06);  // sobbing shudder
    } else if (isGetUp) {
      const progress = Math.min(1, this.cycle * 0.8);
      this._setTarget('spine_x',  0.52 * (1 - progress));
      this._setTarget('spine_y',  0);
    } else if (isClimbFail) {
      this._setTarget('spine_x',  0);  this._setTarget('spine_y', 0);
    } else if (isGrab) {
      this._setTarget('spine_x',  0.44);
      this._setTarget('spine_y',  0);
    } else if (isReach) {
      this._setTarget('spine_x', -0.18);
      this._setTarget('spine_y',  0);
    } else if (isPull) {
      this._setTarget('spine_x', -0.35);
      this._setTarget('spine_y',  s * 0.05);
    } else if (isLunge) {
      this._setTarget('spine_x',  0.26);
      this._setTarget('spine_y',  0);
    } else if (isSlide) {
      this._setTarget('spine_x', -0.17);  // lean back while sliding
      this._setTarget('spine_y',  0);
    } else if (isRareEvent) {
      switch (action) {
        case 'dodge':    this._setTarget('spine_x', -0.10);  break;
        case 'push':     this._setTarget('spine_x',  0.26);  break;
        case 'throw':    this._setTarget('spine_x',  0.17);  break;
        case 'pick_up':  this._setTarget('spine_x',  0.52);  break;
        case 'sit_down': this._setTarget('spine_x',  0);     break;
        case 'stand_up': this._setTarget('spine_x',  0.26 * (1 - Math.min(1, this.cycle * 0.8))); break;
        case 'jump':     this._setTarget('spine_x', -0.10);  break;
        case 'land':     this._setTarget('spine_x',  0.10);  break;
      }
      this._setTarget('spine_y', 0);
    } else {
      // FIX #1: Use breathTimer (bt) instead of cycle for idle breathing
      const breathe = (isIdle || isPause) ? Math.sin(bt * 0.5) * 0.022 : 0;
      this._setTarget('spine_x',  breathe);
      this._setTarget('spine_y',  (isWalk || isWade) ? s * 0.08 : 0);
    }

    // ── Head ──────────────────────────────────────────────────────────────
    if (isFall) {
      this._setTarget('head_x', -0.26);
    } else if (isCrawl) {
      this._setTarget('head_x', -0.52);
    } else if (isHurt) {
      if (action === 'hurt_light' || action === 'recoil') {
        this._setTarget('head_x', -0.20);  // jerk head back
      } else if (action === 'hurt_medium') {
        this._setTarget('head_x',  0.35);  // head down in pain
      } else if (action === 'hurt_heavy') {
        const phase = Math.min(1, this.cycle * 0.5);
        this._setTarget('head_x',  phase > 0.5 ? 0.44 : Math.sin(this.cycle * 8) * 0.20);
      } else {
        this._setTarget('head_x',  0.44);  // shock: face down
      }
    } else if (isCrying) {
      this._setTarget('head_x',  0.35 + Math.sin(this.cycle * 10) * 0.08);  // sobbing nod
    } else if (isGetUp) {
      const progress = Math.min(1, this.cycle * 0.8);
      this._setTarget('head_x',  0.35 * (1 - progress));
    } else if (isClimb) {
      this._setTarget('head_x', -0.35);  // look up while climbing
    } else if (isGrab) {
      this._setTarget('head_x',  0.26);
    } else if (isReach) {
      this._setTarget('head_x', -0.35);
    } else if (isPull) {
      this._setTarget('head_x',  0.17);
    } else if (isLookAround) {
      this._setTarget('head_x',  0);
    } else if (isSlide) {
      this._setTarget('head_x',  0);
    } else if (isRareEvent) {
      switch (action) {
        case 'dodge':    this._setTarget('head_x', -0.15); break;
        case 'push':     this._setTarget('head_x',  0);    break;
        case 'throw':    this._setTarget('head_x',  0);    break;
        case 'pick_up':  this._setTarget('head_x',  0.35); break;
        case 'sit_down': this._setTarget('head_x',  0);    break;
        case 'stand_up': this._setTarget('head_x',  0.17 * (1 - Math.min(1, this.cycle * 0.8))); break;
        case 'jump':     this._setTarget('head_x', -0.20); break;
        case 'land':     this._setTarget('head_x',  0);    break;
      }
    } else {
      this._setTarget('head_x', 0);
    }
    // Head Y: use breathTimer for idle sway instead of stopped cycle
    const headYaw = isLookAround ? Math.sin(this.cycle * 0.8) * 0.78
      : isCrying ? Math.sin(this.cycle * 5) * 0.10  // crying head shake
      : isHurt ? 0
      : action === 'dodge' ? (Math.random() > 0.5 ? 0.35 : -0.35)
      : (isIdle || isPause) ? Math.sin(bt * 0.3) * 0.06 : 0;
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

    const baseShL_x = this.targets['shL_x'];
    const baseShR_x = this.targets['shR_x'];
    const isLocomotion = isWalk || isRun || isWade || isCrawl;

    if (emotion !== 'neutral') {
      switch (emotion) {
        case 'crying':
          this._setTarget('head_x',   0.42 + Math.sin(this.cycle * 10) * 0.08);
          this._setTarget('spine_x',  0.32);
          // Arms: held across chest. Negative X = forward (toward face).
          this._setTarget('shL_x',   -0.87);  this._setTarget('shL_z', -0.52);
          this._setTarget('shR_x',   -0.87);  this._setTarget('shR_z',  0.52);
          this._setTarget('elbL_x',  -1.40);
          this._setTarget('elbR_x',  -1.40);
          break;

        case 'mischievous':
          this._setTarget('spine_x', -0.18);
          this._setTarget('head_y',   0.30);
          this._setTarget('shL_x',   -0.52);  this._setTarget('shL_z', -0.52);
          this._setTarget('shR_x',   -0.52);  this._setTarget('shR_z',  0.52);
          this._setTarget('elbL_x',  -1.57);
          this._setTarget('elbR_x',  -1.57);
          break;

        case 'excited':
          // Excited: arms raised overhead (cheering/jumping)
          // FIX-A: was -(PI+0.32)=−198°. CORRECT excited pose: arms UP, forward ~150°-170°
          //        Children raise hands UPWARD when excited, not behind their back.
          this._setTarget('shL_x',  2.62 + Math.sin(this.cycle * 8) * 0.26);  // ~150°±15°
          this._setTarget('shR_x',  2.62 + Math.sin(this.cycle * 8 + Math.PI) * 0.26);
          this._setTarget('shL_z', -0.26);  // slightly outward for V shape
          this._setTarget('shR_z',  0.26);
          this._setTarget('elbL_x', -0.26);
          this._setTarget('elbR_x', -0.26);
          this._setTarget('spine_x', 0.08);  // slight forward lean
          break;

        case 'scared':
          this._setTarget('head_x',   0.35);
          this._setTarget('spine_x',  0.26);
          this._setTarget('shL_x',   -0.52);
          this._setTarget('shR_x',   -0.52);
          this._setTarget('shL_z',   -0.87);
          this._setTarget('shR_z',    0.87);
          this._setTarget('elbL_x',  -1.57);
          this._setTarget('elbR_x',  -1.57);
          break;

        case 'focused':
          this._setTarget('spine_x',  0.14);
          this._setTarget('head_x',  -0.18);
          this._setTarget('shL_x',   -0.87);
          this._setTarget('shR_x',   -0.87);
          this._setTarget('elbL_x',  -0.52);
          this._setTarget('elbR_x',  -0.52);
          break;

        case 'curious':
          this._setTarget('shL_x',  -0.35);  this._setTarget('shL_z', -0.15);
          this._setTarget('shR_x',   0);     this._setTarget('shR_z',  0.15);
          this._setTarget('elbL_x', -0.87);  this._setTarget('elbR_x', -0.10);
          this._setTarget('spine_x', 0.10);
          this._setTarget('head_x', -0.15);
          this._setTarget('head_y', Math.sin(bt * 0.5) * 0.25);
          break;

        case 'surprised':
          this._setTarget('shL_x',  -0.70);  this._setTarget('shL_z', -0.70);
          this._setTarget('shR_x',  -0.70);  this._setTarget('shR_z',  0.70);
          this._setTarget('elbL_x', -0.26);  this._setTarget('elbR_x', -0.26);
          this._setTarget('spine_x', -0.10);
          this._setTarget('head_x',  -0.20);
          break;

        case 'tired':        // E9 — arms drooping, back slightly curved
          this._setTarget('shL_x',   0);     this._setTarget('shL_z', -0.12);
          this._setTarget('shR_x',   0);     this._setTarget('shR_z',  0.12);
          this._setTarget('elbL_x', -0.05);  this._setTarget('elbR_x', -0.05);
          this._setTarget('spine_x', 0.15);
          this._setTarget('head_x',  0.15);
          break;

        case 'frustrated':
          this._setTarget('shL_x',  -0.87);  this._setTarget('shL_z', -0.30);
          this._setTarget('shR_x',  -0.87);  this._setTarget('shR_z',  0.30);
          this._setTarget('elbL_x', -0.52);  this._setTarget('elbR_x', -0.52);
          this._setTarget('spine_x', 0.10);
          this._setTarget('head_x',  0);     this._setTarget('head_y', 0);
          break;

        case 'happy':
          this._setTarget('shL_x', -(0.35 + Math.sin(bt * 4) * 0.17));
          this._setTarget('shR_x', -(0.35 + Math.sin(bt * 4 + Math.PI) * 0.17));
          this._setTarget('shL_z', -0.20);   this._setTarget('shR_z',  0.20);
          this._setTarget('elbL_x', -0.35);  this._setTarget('elbR_x', -0.35);
          this._setTarget('spine_x', -0.05);
          this._setTarget('head_x', -0.10);
          this._setTarget('head_y', Math.sin(bt * 1.5) * 0.10);
          break;
      }

      // Restore locomotion arm swings to maintain balance and prevent robotic locked arms
      if (isLocomotion) {
        if (baseShL_x !== undefined) this._setTarget('shL_x', baseShL_x);
        if (baseShR_x !== undefined) this._setTarget('shR_x', baseShR_x);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // APPLY LERPED ROTATIONS
    // FIX #17: dt*4 = ~400ms convergence (smooth: prevents jerky instant changes)
    //          Was dt*8 (200ms) which was too fast — actions flipped in blink of an eye.
    //          dt*4 gives a natural transition feel for child-like movements.
    // ══════════════════════════════════════════════════════════════════════
    const LERP = Math.min(1, dt * 4);

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
  // FIX-D: Normalize current[key] to [−π, +π] to prevent unbounded drift
  //        which causes arm-torso clipping after thousands of frames.
  private _lerpAngle(key: string, alpha: number): number {
    const t   = this.targets[key] ?? 0;
    const cv  = this.current[key] ?? t;
    // Compute the difference modulo 2π to pick the shortest arc
    let diff  = t - cv;
    const TWO_PI = Math.PI * 2;
    // Wrap diff into [−π, +π]
    while (diff >  Math.PI) diff -= TWO_PI;
    while (diff < -Math.PI) diff += TWO_PI;
    let n = cv + diff * alpha;
    // FIX-D: Normalize accumulated value to prevent drift
    while (n >  Math.PI) n -= TWO_PI;
    while (n < -Math.PI) n += TWO_PI;
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