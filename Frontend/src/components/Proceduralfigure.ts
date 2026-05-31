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
    realHeight: 0.70, headRadius: 0.095, neckLength: 0.040,
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
  early_toddler: {
    realHeight: 0.82, headRadius: 0.088, neckLength: 0.046,
    torsoLength: 0.258, torsoRadius: 0.076,
    legLength: 0.370, armLength: 0.210,
    shoulderWidth: 0.20, hipWidth: 0.09,
    skinColor: 0xf5cba7, outfitColor: 0x93c5fd, accentColor: 0x3b82f6,
  },
  late_toddler: {
    realHeight: 0.94, headRadius: 0.073, neckLength: 0.053,
    torsoLength: 0.30, torsoRadius: 0.082,
    legLength: 0.440, armLength: 0.250,
    shoulderWidth: 0.22, hipWidth: 0.10,
    skinColor: 0xf5cba7, outfitColor: 0xa5b4fc, accentColor: 0x6366f1,
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
  school: {
    realHeight: 1.30, headRadius: 0.065, neckLength: 0.070,
    torsoLength: 0.40, torsoRadius: 0.100,
    legLength: 0.700, armLength: 0.400,
    shoulderWidth: 0.30, hipWidth: 0.14,
    skinColor: 0xf5cba7, outfitColor: 0xc4b5fd, accentColor: 0x8b5cf6,
  },
  child: {
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
// Shared Joint Limits (radians)
// ─────────────────────────────────────────────────────────────────────────────
const JOINT_LIMITS: Record<string, [number, number]> = {
  shL_x: [-Math.PI, Math.PI],
  shR_x: [-Math.PI, Math.PI],
  shL_z: [-Math.PI, Math.PI],
  shR_z: [-Math.PI, Math.PI],
  elbL_x: [-2.530, 2.530],
  elbR_x: [-2.530, 2.530],
  hipL_x: [-2.5, 2.5],
  hipR_x: [-2.5, 2.5],
  hipL_z: [-1.5, 1.5],
  hipR_z: [-1.5, 1.5],
  kneeL_x: [-2.5, 2.5],
  kneeR_x: [-2.5, 2.5],
  spine_x: [-1.5, 1.5],
  spine_y: [-1.0, 1.0],
  head_x: [-1.0, 1.0],
  head_y: [-1.0, 1.0],
  hips_bob: [-2.0, 1.0],
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

  // Joint pivots
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

  private _lastAction = '';
  private _actionTimer = 0;
  private static readonly MIN_ACTION_DURATION = 0.05; 
  private _breathTimer2 = 0;

  private targets: Record<string, number> = {};
  private current: Record<string, number> = {};

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

    const baseWidth = shoulderWidth > 0 ? shoulderWidth : 0.22;

    // ── Hips ──────────────────────────────────────────────────────────────
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
      const safeShoulderX = Math.min(baseWidth / 2, torsoRadius + armR * 0.2);
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

    this.root.traverse(o => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow    = true;
        o.receiveShadow = true;
      }
    });
  }

  update(dt: number, entry?: ActionEntry | null) {
    let action  = entry?.a ?? 'idle';
    const emotion = entry?.e ?? 'neutral';
    
    this._actionTimer += dt;
    const PRIORITY_ACTIONS = ['fall', 'falling', 'free_fall', 'fall_forward', 'hurt_light', 'hurt_medium', 'hurt_heavy', 'recoil'];
    
    if (action !== this._lastAction) {
      if (this._actionTimer < ProceduralFigure.MIN_ACTION_DURATION && !PRIORITY_ACTIONS.includes(action)) {
        action = this._lastAction || action;
      } else {
        this._lastAction = action;
        this._actionTimer = 0;
        // Bỏ đóng băng khi kích hoạt chạy lại hoặc đổi trạng thái
        if (action === 'idle' || entry?.v === 0) {
          this.cycle = 0; 
        }
      }
    }
    this.wading = !!(entry?.wadingIn);

    // Phân nhóm bộ hành động độc lập đầy đủ (Khôi phục trạng thái climb)
    const isWalk  = ['walk', 'walk_to', 'walk_random', 'investigate'].includes(action); 
    const isRun   = ['run', 'run_unstable'].includes(action); 
    const isSprint = action === 'sprint';
    const isWade  = action === 'wade';
    const isCrawl = action === 'crawl';
    const isFall  = ['falling', 'free_fall', 'fall_forward', 'fall_under', 'furniture_tips'].includes(action); // Bổ sung fall_under đè tủ
    const isStumble = ['stumble', 'trip', 'lose_balance'].includes(action);    
    const isClimb = ['climb_on', 'climb', 'climb_approach', 'climb_reach', 'climb_pull', 
                     'climb_mount', 'climb_down', 'step_up', 'step_down', 
                     'pull_to_stand', 'climb_drawer', 'open_cabinet'].includes(action);                     
    const isHurt     = ['hurt_light', 'hurt_medium', 'hurt_heavy', 'hurt_shock', 'recoil'].includes(action);
    const isCrying   = ['crying_stand', 'crying_sit'].includes(action);
    const isSitting  = ['sitting', 'sit_down'].includes(action); 
    const isGetUp    = ['get_up_slow', 'get_up_fast', 'stand_up'].includes(action);
    const isGrab     = ['grab', 'grab_mouth', 'grab_bottle'].includes(action);    
    const isReach    = ['reach', 'reach_up', 'swing_open', 'swing_close', 'pull_item', 'insert_object'].includes(action);    
    const isInteract = isGrab || isReach || isHurt || isCrying || isSitting || isGetUp || isStumble || action === 'drink' || action === 'jump';
    const isIdle  = !isWalk && !isRun && !isSprint && !isWade && !isCrawl && !isFall && !isClimb && !isInteract;
    const vel = entry?.v ?? 0;
    const legLen = this.a.legLength;

    // Tần số chu kỳ bước chân hoạt họa
    let cycleRate: number;
    if (isWalk || isRun || isSprint) {
      const strideLen = isSprint ? legLen * 2.0 : isRun ? legLen * 1.6 : legLen * 1.0;
      const vEff      = Math.max(0.05, vel);
      const rawRate   = (vEff / strideLen) * 2 * Math.PI;
      if (isSprint) cycleRate = Math.max(10.0, Math.min(20.0, rawRate * 1.2));
      else if (isRun)  cycleRate = Math.max(7.0, Math.min(14.0, rawRate));
      else             cycleRate = Math.max(2.2, Math.min(4.8, rawRate * 0.5));
    } else if (isCrawl) {
      // Nhịp bò chậm, bập bênh nhịp nhàng theo vận tốc
      const vCrawl = vel > 0 ? vel : 0.15;
      cycleRate = Math.max(3.0, Math.min(6.0, (vCrawl / (legLen * 1.1)) * 2 * Math.PI));
    } else if (isClimb) {
      cycleRate = 2.8; // Nhịp bám trèo điều độ
    } else {
      cycleRate = (isFall || isWade) ? 3.0 : (vel > 0 ? 2.0 : 0);
    }
    
    if (vel === 0 && (isWalk || isRun || isSprint || isCrawl)) {
      cycleRate = 0;
    }
    
    this.cycle += dt * cycleRate;
    this._breathTimer2 += dt;

    const s = Math.sin(this.cycle);
    const c = Math.cos(this.cycle);
    const bt = this._breathTimer2;

    // ══════════════════════════════════════════════════════════════════════
    // LAYER 1 — TẠO POSE CHI DƯỚI (LEGS)
    // ══════════════════════════════════════════════════════════════════════
    
    // FIX KHÓA TRỌNG TÂM: Luôn tự động hoàn trả hips_bob về 0 nếu không ở trạng thái Ngồi/Bò/Trèo
    if (!isSitting && !isCrawl && !isClimb) {
      this._setTarget('hips_bob', 0);
    }

    const legSwing  = isSprint ? 1.30 : isRun ? 1.10 : isWalk ? 0.65 : isWade ? 0.42 : 0;
    const kneeSwing = isSprint ? 1.15 : isRun ? 0.95 : isWalk ? 0.40 : isWade ? 0.25 : 0;

    if (legSwing > 0 && !isFall && !isStumble && !isHurt && !isSitting && vel > 0) {
      this._setTarget('hipL_x',   s * legSwing);
      this._setTarget('hipR_x',  -s * legSwing);
      this._setTarget('kneeL_x',  Math.max(0, -c * kneeSwing));
      this._setTarget('kneeR_x',  Math.max(0,  c * kneeSwing));
    } 
    else if (isCrawl) {
      this._setTarget('hips_bob', -this.a.legLength * 0.45); 
      // Chân di chuyển nhịp nhàng tịnh tiến so le với tay
      this._setTarget('hipL_x',  -0.15- s * 0.2);  
      this._setTarget('hipR_x',  -0.15 + s * 0.2);
      this._setTarget('kneeL_x',  2 + c * 0.18);  
      this._setTarget('kneeR_x',  2 - c * 0.18);
    } 
    else if (isClimb) {
      this._setTarget('hips_bob', -this.a.legLength * 0.20 + Math.abs(s) * 0.04);
      this._setTarget('hipL_x',  -0.85 - s * 0.35);   
      this._setTarget('hipR_x',  -0.85 + s * 0.35);   
      this._setTarget('kneeL_x',  1.10 + c * 0.30);     
      this._setTarget('kneeR_x',  1.10 - c * 0.30);
    }
    else if (isFall) {
      const factor = (action === 'fall_under') ? 0.98 : 0.25;
      this._setTarget('hips_bob', -this.a.legLength * factor);
      this._setTarget('hipL_x',   0.25);  
      this._setTarget('hipR_x',   0.25);
      this._setTarget('kneeL_x',  0.10);  
      this._setTarget('kneeR_x',  0.10);
    } 
    else if (isSitting) {
      this._setTarget('hips_bob', -this.a.legLength * 0.95); 
      this._setTarget('hipL_x', -1.65); 
      this._setTarget('hipR_x', -1.65);
      this._setTarget('kneeL_x', 0.20); 
      this._setTarget('kneeR_x', 0.20);
    } 
    else {
      this._setTarget('hipL_x',  0); this._setTarget('hipR_x',  0);
      this._setTarget('kneeL_x', 0); this._setTarget('kneeR_x', 0);
    }

    // ══════════════════════════════════════════════════════════════════════
    // LAYER 2 — TẠO POSE CHI TRÊN (ARMS) - HỆ TRỤC GÓC ÂM (-) ĐƯA RA TRƯỚC
    // ══════════════════════════════════════════════════════════════════════
    const armSwing = isSprint ? 1.30 : isRun ? 1.00 : isWalk ? 0.65 : 0;

    this._setTarget('shL_z', -0.08);
    this._setTarget('shR_z',  0.08);

    if (armSwing > 0 && !isFall && !isHurt && vel > 0) {
      this._setTarget('shL_x', -s * armSwing);
      this._setTarget('shR_x',  s * armSwing);
      this._setTarget('elbL_x', -0.35 - Math.abs(s) * 0.3);
      this._setTarget('elbR_x', -0.35 - Math.abs(s) * 0.3);
    } 
    else if (isCrawl) {
      this._setTarget('shL_x',  -1.25 + s * 0.40); 
      this._setTarget('shR_x',  -1.25 - s * 0.40);
      
      // Khớp vai hơi khép khum nhẹ vào lồng ngực cho tự nhiên như em bé
      this._setTarget('shL_z',  -0.12);
      this._setTarget('shR_z',   0.12);
      
      // Khuỷu tay hơi chùng góc vuông nhẹ để nâng đỡ cơ thể chịu lực
      this._setTarget('elbL_x', -0.55 - Math.max(0, s) * 0.25);           
      this._setTarget('elbR_x', -0.55 - Math.max(0, -s) * 0.25);
    } 
    else if (isClimb) {
      this._setTarget('shL_x',  -2.20 + s * 0.45);  
      this._setTarget('shR_x',  -2.20 - s * 0.45);
      this._setTarget('shL_z',  -0.25);
      this._setTarget('shR_z',   0.25);
      this._setTarget('elbL_x', -0.80); 
      this._setTarget('elbR_x', -0.80);
    }
    else if (isFall) {
      const angle = (action === 'fall_under') ? -2.40 : -1.40;
      this._setTarget('shL_x',  angle);  
      this._setTarget('shR_x',  angle);
      this._setTarget('elbL_x', -0.80); 
      this._setTarget('elbR_x', -0.80);
    }
    else if (isSitting) {
      this._setTarget('shL_x',  -0.20); 
      this._setTarget('shR_x',  -0.20);
      this._setTarget('shL_z',  -0.35); 
      this._setTarget('shR_z',   0.35);
      this._setTarget('elbL_x', -0.40); 
      this._setTarget('elbR_x', -0.40);
    }
    else if (isGrab) {
      this._setTarget('shL_x',  -1.20);  
      this._setTarget('shR_x',  -1.20);
      this._setTarget('shL_z',   0.15);  
      this._setTarget('shR_z',  -0.15);
      this._setTarget('elbL_x', -1.35);  
      this._setTarget('elbR_x', -1.35);
    } 
    else if (isReach) {
      this._setTarget('shL_x',  -1.65); 
      this._setTarget('shR_x',  -1.65);
      this._setTarget('elbL_x', -0.05); 
      this._setTarget('elbR_x', -0.05);
    }
    else if (action === 'drink') {
      this._setTarget('shL_x',  -1.10);  
      this._setTarget('shR_x',  -0.20);
      this._setTarget('elbL_x', -2.30); // Gập khuỷu cực sâu ép sát miệng
      this._setTarget('elbR_x', -0.15);
    }
    else if (action === 'jump') {
      const jumpPhase = Math.sin(bt * 4.0);
      if (jumpPhase > 0) {
        this._setTarget('hipL_x', -0.60);  this._setTarget('hipR_x', -0.60);
        this._setTarget('kneeL_x', 1.10);  this._setTarget('kneeR_x', 1.10);
        this._setTarget('shL_x',   0.45);  this._setTarget('shR_x',   0.45); 
      } else {
        this._setTarget('hipL_x',  0.10);  this._setTarget('hipR_x',  0.10);
        this._setTarget('kneeL_x', 0.00);  this._setTarget('kneeR_x', 0.00);
        this._setTarget('shL_x',  -2.65);  this._setTarget('shR_x',  -2.65); 
      }
    } 
    else {
      this._setTarget('shL_x',  0); this._setTarget('shR_x',  0);
      this._setTarget('elbL_x', -0.15); this._setTarget('elbR_x', -0.15);
    }

    // ── Spine & Head Xoay Nghiêng Theo Ảnh ────────────────────────────────
    if (isCrawl) {

      this._setTarget('spine_x',  1.5); 
      // Đầu ngẩng lên tự nhiên nhìn về phía trước giống ảnh
      this._setTarget('head_x',  -0.8); 
    } else if (isClimb) {
      this._setTarget('spine_x',  0.30); // Người hơi hướng nghiêng bám tường
      this._setTarget('head_x',  -0.25); // Ngẩng cổ ngó lên trên
    } else if (isSprint) {
      this._setTarget('spine_x',  0.38); 
      this._setTarget('head_x',   0);
    } else if (isFall) {
      const spineAngle = (action === 'fall_under') ? 1.30 : 0.75;
      this._setTarget('spine_x',  spineAngle); 
      this._setTarget('head_x',   0.20);
    }else if (action === 'drink') {
      this._setTarget('spine_x', -0.05);
      this._setTarget('head_x',   0.30); // Ngửa đầu ra sau đón nước tu chai
    } else {
      const breathe = isIdle ? Math.sin(bt * 1.5) * 0.025 : 0;
      this._setTarget('spine_x',  breathe);
      this._setTarget('head_x',   0);
    }
    this._setTarget('spine_y', (isWalk && vel > 0) ? s * 0.06 : 0);
    this._setTarget('head_y', isIdle ? Math.sin(bt * 0.4) * 0.05 : 0);

    // ══════════════════════════════════════════════════════════════════════
    // LAYER 3 — EMOTION OVERRIDES 
    // ══════════════════════════════════════════════════════════════════════
    if (emotion !== 'neutral') {
      switch (emotion) {
        case 'crying':
          this._setTarget('head_x',   0.35);
          this._setTarget('shL_x',   -0.65); this._setTarget('shR_x', -0.65);
          this._setTarget('elbL_x',  -1.20); this._setTarget('elbR_x', -1.20);
          break;
        case 'excited':
          this._setTarget('shL_x',  -2.50); this._setTarget('shR_x', -2.50);
          break;
      }
    }

    // NỘI SUY GÓC LERP CONVERGENCE
    const LERP = (isFall || isHurt) ? Math.min(1, dt * 20) : Math.min(1, dt * 12);

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

    if (isWalk || isRun || isSprint) {
      const sway = Math.sin(this.cycle * 1.3) * (isSprint ? 0.055 : isRun ? 0.04 : 0.025);
      this.spine.rotation.z = sway;
    }

    this.hips.position.y = this.a.legLength + this._lerpAngle('hips_bob', LERP);

    this._updateWadingTint(dt);
    this._updateBlink(dt);
  }

  private _clamp(key: string, value: number): number {
    const lim = JOINT_LIMITS[key];
    if (!lim) return value;
    return Math.max(lim[0], Math.min(lim[1], value));
  }

  private _setTarget(key: string, value: number) {
    const clamped = this._clamp(key, value);
    this.targets[key] = clamped;
    if (!(key in this.current)) this.current[key] = clamped;
  }

  private _lerpAngle(key: string, alpha: number): number {
    const t   = this.targets[key] ?? 0;
    const cv  = this.current[key] ?? t;
    let diff  = t - cv;
    const TWO_PI = Math.PI * 2;
    while (diff >  Math.PI) diff -= TWO_PI;
    while (diff < -Math.PI) diff += TWO_PI;
    let n = cv + diff * alpha;
    while (n >  Math.PI) n -= TWO_PI;
    while (n < -Math.PI) n += TWO_PI;
    this.current[key] = n;
    return n;
  }

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


export const PROCEDURAL_AGE_GROUPS = new Set(['infant', 'school_age', 'preteen']);

export function createFigure(
  ageGroupId:   string,
  agentId:      number,
  accentColor?: number,
): ProceduralFigure {
  return new ProceduralFigure(ageGroupId, agentId, accentColor);
}