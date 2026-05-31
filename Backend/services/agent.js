import { getAgeGroup } from '../config/ageGroups.js';
import physicsEngine from './physicsEngine.js';
import { visionSystem } from './visionSystem.js';
import { riskAnalytics } from './riskAnalytics.js';
import { topplePredictor } from './topplepredictor.js';

export const WADING_SCALE_FACTOR = 0.6;
const MIN_WADING_SPEED  = 0.05;
const RECOVERY_DURATION = 1.5;

// ============================================================================
//  EXPLORATION MAP
// ============================================================================
class ExplorationMap {
  constructor(cellSize = 0.6) {
    this.cellSize = cellSize;
    this.cells    = new Map();
    this.bounds   = null;
    this.cols     = 0;
    this.rows     = 0;
    this._allKeys = [];
  }

  init(bounds) {
    this.bounds = bounds;
    this.cells.clear();
    this._allKeys = [];
    const cs = this.cellSize;
    this.cols = Math.max(1, Math.ceil((bounds.max[0] - bounds.min[0]) / cs));
    this.rows = Math.max(1, Math.ceil((bounds.max[2] - bounds.min[2]) / cs));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const key = `${c},${r}`;
        this.cells.set(key, 0);
        this._allKeys.push(key);
      }
    }
  }

  markVisited(x, z) {
    if (!this.bounds) return;
    const c = Math.floor((x - this.bounds.min[0]) / this.cellSize);
    const r = Math.floor((z - this.bounds.min[2]) / this.cellSize);
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
    const key = `${c},${r}`;
    this.cells.set(key, (this.cells.get(key) || 0) + 1);
  }

  getLeastVisitedCenter(avoidNearPos = null, minDist = 1.5, validCheckFn = null) {
    if (!this.bounds || this._allKeys.length === 0) return null;
    const cs = this.cellSize;

    let candidates = this._allKeys.map(key => {
      const [c, r] = key.split(',').map(Number);
      const cx = this.bounds.min[0] + (c + 0.5) * cs;
      const cz = this.bounds.min[2] + (r + 0.5) * cs;
      const visits = this.cells.get(key) || 0;
      return { cx, cz, visits };
    });

    if (validCheckFn) {
      candidates = candidates.filter(cd => validCheckFn(cd.cx, cd.cz));
    }

    if (candidates.length === 0) return null;

    if (avoidNearPos) {
      const far = candidates.filter(
        cd => Math.hypot(cd.cx - avoidNearPos[0], cd.cz - avoidNearPos[2]) >= minDist
      );
      if (far.length > 0) candidates = far;
    }

    candidates.sort((a, b) => a.visits - b.visits);
    const topN = Math.max(1, Math.floor(candidates.length * 0.2));
    const pool = candidates.slice(0, topN);
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    const jitter = cs * 0.3;
    return [
      chosen.cx + (Math.random() - 0.5) * jitter,
      chosen.cz + (Math.random() - 0.5) * jitter,
    ];
  }

  getCoverage() {
    if (this._allKeys.length === 0) return 0;
    let visited = 0;
    for (const k of this._allKeys) { if ((this.cells.get(k) || 0) > 0) visited++; }
    return visited / this._allKeys.length;
  }
}

// ============================================================================
//  AGE MOVEMENT PROFILES
// ============================================================================
const AGE_MOVEMENT_PROFILES = {
  infant: {
    locomotion:         'crawl',
    velocityProfile: {
      crawl: { mean: 0.15, stdDev: 0.04 }
    },
    wobbleAmplitude:    0.07, // biên độ lắc 0.05 radian
    wobbleFrequency:    1.5, // tần suất lắc lư 1,5/lần một giây
    pauseInterval:      [2.0, 5.0], // dừng lại quan sát trong khoảng 2 ->5 giây trước khi tiếp tục di chuyển
    pauseDuration:      [1.0, 3.5], // mỗi lần dừng lại sẽ kéo dài từ 1 đến 3.5 giây
    burstProb:          0.0, // trẻ sơ sinh chưa có khả năng bứt tốc, giữ nguyên 0
    dirChangeProb:      0.02, // xác suất thay đổi hướng di chuyển mỗi giây, trẻ sơ sinh có thể thay đổi hướng một cách ngẫu nhiên nhưng không quá thường xuyên
    stumbleProb:        0.0047, // Xác suất quy đổi trực tiếp theo giây (Per-second rate)
    curiosityRadius:    1.2, // bán kính quan sát và tương tác với đồ vật xung quanh, trẻ sơ sinh có tầm nhìn hạn chế và thường chỉ quan tâm đến những vật thể rất gần mình
    attentionSpan:      5.0, // thời gian trung bình mà trẻ sơ sinh có thể duy trì
    boredomRate:        0.10, // tốc độ tăng mức độ chán nản khi ở trong cùng một khu vực hoặc hoạt động lặp đi lặp lại
    explorationBias:    0.25, // xu hướng ưu tiên khám phá khu vực mới so với quay lại khu vực đã biết
    headBobAmplitude:   0.012, // biên độ gật đầu khi di chuyển, trẻ sơ sinh thường có chuyển động đầu nhẹ nhàng hơn
  },

  // EARLY TODDLER (12-18 tháng): Đi bộ chập chững, loại bỏ bứt tốc quá mạnh
  early_toddler: {
    locomotion:         'walk',
    velocityProfile: {
      walk:  { mean: 0.82, stdDev: 0.20 },
      crawl: { mean: 0.70, stdDev: 0.15 }
    },
    wobbleAmplitude:    0.09,
    wobbleFrequency:    1.8,
    pauseInterval:      [2.5, 6.0],
    pauseDuration:      [0.8, 2.5],
    burstProb:          0.015,
    burstDuration:      [0.5, 2.0],
    burstSpeedMult:     1.3, // Giảm bớt để phù hợp độ tuổi đi chưa vững
    dirChangeProb:      0.07,
    stumbleProb:        0.0041, // Per-second rate bám sát nghiên cứu Adolph
    curiosityRadius:    2.0,
    attentionSpan:      8.0,
    boredomRate:        0.06,
    explorationBias:    0.45,
    armsHighGuard:      true,
  },

  // LATE TODDLER (18-36 tháng): Chạy ổn định, dọn dẹp từ khóa sprint bị trùng lặp
  late_toddler: {
    locomotion:         'run',
    velocityProfile: {
      walk:  { mean: 0.92, stdDev: 0.17 },
      run:   { mean: 1.80, stdDev: 0.35 },
      crawl: { mean: 0.70, stdDev: 0.15 }
    },
    wobbleAmplitude:    0.06,
    wobbleFrequency:    2.0,
    pauseInterval:      [4.0, 10.0],
    pauseDuration:      [0.5, 2.0],
    burstProb:          0.055,
    burstDuration:      [1.0, 3.5],
    burstSpeedMult:     1.5,
    dirChangeProb:      0.055,
    stumbleProb:        0.0027, 
    forwardLunge:       0.12,
    curiosityRadius:    3.0,
    attentionSpan:      12.0,
    boredomRate:        0.045,
    explorationBias:    0.65,
  },

  // PRESCHOOL (3-5 tuổi): Vận động khéo léo, xóa bỏ sprint
  preschool: {
    locomotion:         'run',
    velocityProfile: {
      walk:   { mean: 1.05, stdDev: 0.13 },
      run:    { mean: 2.00, stdDev: 0.40 },
      crawl:  { mean: 0.90, stdDev: 0.18 }
    },
    wobbleAmplitude:    0.025,
    wobbleFrequency:    2.5,
    pauseInterval:      [6.0, 18.0],
    pauseDuration:      [0.4, 2.0],
    burstProb:          0.050,
    burstDuration:      [1.5, 5.0],
    burstSpeedMult:     1.6,
    circleProb:         0.035,
    circleDuration:     [2.0, 5.0],
    dirChangeProb:      0.025,
    stumbleProb:        0.0022, 
    curiosityRadius:    4.5,
    attentionSpan:      20.0,
    boredomRate:        0.028,
    explorationBias:    0.82,
  },

  // SCHOOL AGE (6-12 tuổi): Đầy đủ bộ tính năng vận động nâng cao bao gồm Sprint bứt tốc
  school_age: {
    locomotion:         'run',
    velocityProfile: {
      walk:   { mean: 1.25, stdDev: 0.13 },
      // [BUG-FIX-SPEED] run.mean giảm từ 2.50 → 2.20 m/s.
      // Decker et al. (2012) & CDC: tốc độ chạy tự nhiên trẻ 6-8 tuổi ~1.80-2.20 m/s.
      // 2.50 m/s là tốc độ của người lớn — không phù hợp với nhóm 6-8 tuổi.
      // Trẻ 10-12 tuổi có thể đạt 2.40 m/s nhưng đây là mean cho cả nhóm → 2.20 hợp lý hơn.
      run:    { mean: 2.20, stdDev: 0.40 },
      // sprint giữ nguyên 3.50 — hợp lý cho trẻ 10-12 tuổi bứt tốc ngắn
      sprint: { mean: 3.50, stdDev: 0.45 },
      crawl:  { mean: 1.10, stdDev: 0.20 },
    },
    wobbleAmplitude:    0.010,
    wobbleFrequency:    2.8,
    pauseInterval:      [8.0, 30.0],
    pauseDuration:      [0.3, 2.5],
    burstProb:          0.038,
    burstDuration:      [2.0, 7.0],
    // [BUG-FIX-SPEED] burstSpeedMult giảm từ 1.85 → 1.60.
    // 1.85 × 2.50 = 4.63 m/s ≈ tốc độ chạy nước rút người lớn amateur — vô lý với trẻ em.
    // 1.60 × 2.20 = 3.52 m/s — hợp lý, gần với sprint.mean và không vượt quá sinh lý học.
    burstSpeedMult:     1.60,
    dirChangeProb:      0.012,
    stumbleProb:        0.0011, // Per-second rate
    scanBeforeMove:     true,
    curiosityRadius:    7.0,
    attentionSpan:      45.0,
    boredomRate:        0.013,
    explorationBias:    1.0,
  },
};

function getAgeMovementProfile(ageGroupId) {
  if (ageGroupId === 'infant')        return AGE_MOVEMENT_PROFILES.infant;
  if (ageGroupId === 'early_toddler') return AGE_MOVEMENT_PROFILES.early_toddler;
  if (ageGroupId === 'late_toddler')  return AGE_MOVEMENT_PROFILES.late_toddler;
  if (ageGroupId === 'preschool')     return AGE_MOVEMENT_PROFILES.preschool;
  if (ageGroupId === 'child')         return AGE_MOVEMENT_PROFILES.school_age; // Map 'child' to school_age profile
  if (ageGroupId === 'school_age')    return AGE_MOVEMENT_PROFILES.school_age;
  return AGE_MOVEMENT_PROFILES.early_toddler;
}

class Agent {
  constructor(id, startPosition, rigidBody, ageGroupId, world = null) {
    this.id         = id;
    this.body       = rigidBody;
    this.ageGroupId = ageGroupId;
    this.world      = world;

    const groupData = getAgeGroup(this.ageGroupId);
    if (groupData) {
      this.gaitStability = groupData.gaitStability || 0.8;
      this.anthropometry = groupData.anthropometry || null;
    }

    this.controller = null;
    this.collider = null;
    if (world && physicsEngine.rapier) {
      try {
        const kccOffset = 0.04;

        const legLen = groupData?.anthropometry?.legLength
                    ?? (groupData?.height ?? 0.8) * 0.40;
        const maxStepHeight = Math.max(0.05, legLen * 0.4);

        this.controller = physicsEngine.createCharacterController(world, kccOffset, maxStepHeight);
      } catch (e) {
        console.warn(`[Agent ${id}] Could not create character controller:`, e.message);
      }
    }

    this.trajectory            = [];
    this.MAX_TRAJECTORY_POINTS = 600;
    this.trajectorySampleRate  = 1;
    this.frameCount            = 0;

    this.state           = 'IDLE';
    this.emotion         = 'neutral';
    this.behaviorQueue   = [];
    this.currentBehavior = null;
    this.behaviorTimer   = 0;

    this.participatingInRareEvent = false;
    this.rareEventChain           = null;
    this.rareEventStep            = 0;

    this.targetPosition    = null;
    this.velocity          = [0, 0, 0];
    this.previousPosition  = [...startPosition];
    this.failedMovementCooldown = 0;
    this.targetLockTimer   = 0;
    this.spawnY            = startPosition[1];
    this.availableObjects  = [];

    this.fatigueLevel    = 0.0;
    this.gaitStability   = 1.0;
    this.lastStumbleTime = 0;

    this.muscleState = {
      fatigueLevel: 0.0,
      sustainedLoadTimer: 0.0
    };

    this.wadingPenalty  = 0.0;
    this.wadingObjectId = null;

    this.recoveryTimer = 0;

    this.actionLog = [];

    this.totalDistance = 0;
    this.stateHistory  = new Map();

    this.fallState     = null;
    this.stunTimer     = 0;
    this.pendingBounce = null;

    // Integrated vertical velocity (m/s). Negative = downward.
    // Reset to 0 when KCC reports grounded; accumulated by gravity (-9.81*dt) when airborne.
    this._vertVel = 0.0;

    this.perceptionQueue = [];
    this.reactionTimer   = 0;
    this.pendingReaction  = null;

    this.objectMemory = new Map();

    this.currentHeading     = Math.random() * Math.PI * 2;
    this.lastDirChangeTime  = 0;

    this.dangerMap      = new Map();
    this.actionFailLog  = new Map();
    this.frustrationCount = 0;

    this.stuckCounter  = 0;
    this.lastMovePos   = [...startPosition];
    this.idleCooldown  = 0;

    this.simTime       = 0;

    this.explorationMap = new ExplorationMap(0.6);
    this._boundsInited  = false;

    this.boredomLevel       = 0.0;
    this.lastPositionChange = 0;
    this.curiosityTarget    = null;
    this.burstState         = null;
    this.circleState        = null;
    this.pauseUntil         = 0;
    
    this.curiosityLevel     = getAgeGroup(ageGroupId)?.curiosity || 0.8;
    this.fearLevel          = getAgeGroup(ageGroupId)?.riskAwareness || 0.2;
    this.objectExposureMap  = new Map();

    const _ag = getAgeGroup(ageGroupId);
    this._agentHalfH = (_ag?.height ?? 1.0) / 2;

    this._ageProfile = getAgeMovementProfile(ageGroupId);
    this._wobblePhase = Math.random() * Math.PI * 2;
    this._driftPhase  = Math.random() * Math.PI * 2;

    this._knownFloorY  = startPosition[1];

    const _resampleByAge = {
      infant:        1.1,
      early_toddler: 0.65,
      late_toddler:  0.55,
      preschool:     0.45,
      school_age:    0.40,
    };
    this._cachedSpeed           = null;
    this._speedActionType       = null;
    this._speedResampleTimer    = 0;
    this._speedResampleInterval = _resampleByAge[ageGroupId] ?? 0.35;

    this.handSensors        = null;
    this._handInteractCooldown = 0;
    this._handInteractLog   = new Map();
    this._handReachRadius   = (groupData?.anthropometry?.armLength ?? (groupData?.height ?? 0.8) * 0.30) * 0.75;
  }

  setSafeTranslation(newPos) {
    if (!this.body) return;
    if (Number.isFinite(newPos.x) && Number.isFinite(newPos.y) && Number.isFinite(newPos.z)) {
      this.body.setNextKinematicTranslation(newPos);
    } else {
      console.warn(`[Agent ${this.id}] Guarded NaN in setSafeTranslation:`, newPos);
    }
  }

  getDynamicCOM() {
    const ag = getAgeGroup(this.ageGroupId);
    const pos = this.getPosition();
    if (!ag || !ag.segmentalMass) {
      return [pos[0], pos[1] + (ag?.height || 0.8) * 0.55, pos[2]];
    }

    const { head, torso, arms, legs } = ag.segmentalMass;
    const isCrawling = (!ag.canWalk || this.currentBehavior?.action === 'crawl');
    const totalH = ag.height || 0.8;
    
    let comY = pos[1];
    let comX = pos[0];
    let comZ = pos[2];
    
    if (isCrawling) {
      const accelMult = 0.02; 
      const clampedAccX = Math.max(-5, Math.min(5, this.acceleration?.[0] || 0));
      const clampedAccZ = Math.max(-5, Math.min(5, this.acceleration?.[2] || 0));
      comX -= clampedAccX * accelMult;
      comZ -= clampedAccZ * accelMult;
    } else {
      const accelMult = 0.05;
      const clampedAccX = Math.max(-5, Math.min(5, this.acceleration?.[0] || 0));
      const clampedAccZ = Math.max(-5, Math.min(5, this.acceleration?.[2] || 0));
      comX -= clampedAccX * accelMult;
      comZ -= clampedAccZ * accelMult;
    }

    let headY  = totalH * 0.90;
    let torsoY = totalH * 0.60;
    let armsY  = totalH * 0.55;
    let legsY  = totalH * 0.25;
    let headZ = 0, torsoZ = 0, armsZ = 0, legsZ = 0;
    
    if (isCrawling) {
      headY  = totalH * 0.35; torsoY = totalH * 0.25;
      armsY  = totalH * 0.15; legsY  = totalH * 0.15;
      headZ  = totalH * 0.4;  torsoZ = 0;
      armsZ  = totalH * 0.3;  legsZ  = -totalH * 0.3;
    } else if (this.currentBehavior?.action?.includes('pull') || this.currentBehavior?.action?.includes('push')) {
      headZ  = totalH * 0.3; torsoZ = totalH * 0.15; armsZ = totalH * 0.4;
    } else if (this.currentBehavior?.action?.includes('reach_up')) {
      armsY  = totalH * 0.85; headZ  = -totalH * 0.05; torsoZ = -totalH * 0.05;
    }
    
    const weightedY = (head * headY) + (torso * torsoY) + (arms * armsY) + (legs * legsY);
    const weightedZ = (head * headZ) + (torso * torsoZ) + (arms * armsZ) + (legs * legsZ);
    comY += weightedY;
    const heading = this.currentHeading || 0;
    comX += Math.sin(heading) * weightedZ;
    comZ += Math.cos(heading) * weightedZ;
    
    this.debugCOM = {
      position: [comX, comY, comZ],
      bosRadius: ag?.capsuleRadius ? ag.capsuleRadius * 1.5 : 0.33,
      comDistFromBOS: Math.hypot(comX - pos[0], comZ - pos[2])
    };
    return [comX, comY, comZ];
  }

  recordPosition(position) {
    this.frameCount++;
    if (this.frameCount % this.trajectorySampleRate !== 0) return;
    this.trajectory.push(position.map(v => Math.round(v * 100) / 100));
    const wanderAction = (this.state === 'MOVING' && !this.currentBehavior) ? 'walk' : null;
    const rawAction = wanderAction || this.currentBehavior?.action || this.currentBehavior?.type || 'idle';
    const entry = {
      s: this.state,
      a: rawAction,
      v: Math.round(Math.hypot(this.velocity[0], this.velocity[2]) * 100) / 100,
    };
    if (this.emotion && this.emotion !== 'neutral')    entry.e        = this.emotion;
    if (this.wadingObjectId)                           { entry.wadingIn = this.wadingObjectId; entry.a = 'wade'; }
    if (this.recoveryTimer > 0)                        entry.recovery  = true;

    // [FIX-ANIMATION] Tính toán animation clip phù hợp để frontend 3D biết phải chạy clip nào.
    // Trước đây agent.js không emit animation state → renderer luôn hiển thị idle dù nhân vật đang đi.
    this.currentAnimation = this._resolveAnimationClip(rawAction, this.state);
    entry.anim = this.currentAnimation;

    this.actionLog.push(entry);
    if (this.trajectory.length > this.MAX_TRAJECTORY_POINTS) {
      this.trajectory.shift();
      this.actionLog.shift();
    }
  }

  /**
   * [FIX-ANIMATION] Map action/state → animation clip name.
   * Frontend đọc getStatus().animation để biết clip cần blend.
   */
  _resolveAnimationClip(action, state) {
    if (state === 'FALLING') return 'fall';
    if (state === 'IDLE' || state === 'INTERACTING') {
      switch (action) {
        case 'pause':        return 'idle';
        case 'look_around':  return 'look_around';
        case 'lose_balance': return 'stumble';
        case 'fall_forward': return 'fall_forward';
        case 'trip':         return 'stumble';
        case 'grab':         return 'grab';
        case 'grab_mouth':   return 'grab_mouth';
        case 'reach_up':     return 'reach_up';
        case 'pull':
        case 'pull_to_stand':return 'pull';
        case 'climb_on':     return 'climb';
        case 'open_drawer':  return 'pull';
        case 'hurt_light':   return 'hurt_light';
        case 'hurt_medium':  return 'hurt_medium';
        case 'hurt_heavy':   return 'hurt_heavy';
        case 'hurt_shock':   return 'hurt_shock';
        case 'crying_stand': return 'cry_stand';
        case 'crying_sit':   return 'cry_sit';
        case 'get_up_slow':  return 'get_up_slow';
        case 'get_up_fast':  return 'get_up_fast';
        case 'recoil':       return 'recoil';
        default:             return 'idle';
      }
    }
    // state === 'MOVING' hoặc RARE_EVENT
    switch (action) {
      case 'crawl':        return 'crawl';
      case 'run':
      case 'run_unstable': return 'run';
      case 'sprint':       return 'sprint';
      case 'lunge':        return 'run'; // lunge dùng chung clip run
      case 'walk_to':
      case 'walk_random':
      case 'walk':
      default: {
        // Phân biệt walk/run dựa trên tốc độ thực tế — tránh nhân vật chạy nhanh mà vẫn dùng clip walk
        const prof = this._ageProfile;
        const walkMean = prof?.velocityProfile?.walk?.mean ?? 1.0;
        const runThreshold = walkMean * 1.35;
        const curSpeed = this._currentSpeed ?? 0;
        if (curSpeed >= runThreshold && prof?.velocityProfile?.run) return 'run';
        return this.ageGroupId === 'infant' ? 'crawl' : 'walk';
      }
    }
  }

  _gaussianRandom(mean, stdDev) {
    const u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev + mean;
  }

  getRealisticVelocity(actionType) {
    const now = this.simTime ?? 0;
    if (
      this._cachedSpeed !== null &&
      this._speedActionType === actionType &&
      now < this._speedResampleTimer
    ) {
      return this._cachedSpeed;
    }

    const movProf = this._ageProfile;
    let speed;
    if (movProf?.velocityProfile) {
      const vp = movProf.velocityProfile[actionType]
              || movProf.velocityProfile.walk
              || movProf.velocityProfile.crawl;
      if (vp) {
        speed = this._gaussianRandom(vp.mean, vp.stdDev);
        speed *= (1.0 - this.fatigueLevel * 0.4);
        if (this.wadingPenalty > 0) {
          speed *= (1.0 - this.wadingPenalty);
          speed  = Math.max(MIN_WADING_SPEED, speed);
        }
        speed = Math.max(MIN_WADING_SPEED, speed);
      }
    }
    if (speed == null) {
      const ag = getAgeGroup(this.ageGroupId);
      if (!ag?.velocityProfile) {
        speed = 1.0;
      } else {
        const prof = ag.velocityProfile[actionType] || ag.velocityProfile.walk || ag.velocityProfile.crawl
                  || { mean: ag.speed || 0.5, stdDev: (ag.speed || 0.5) * 0.15 };
        speed = this._gaussianRandom(prof.mean, prof.stdDev);
        speed *= (1.0 - this.fatigueLevel * 0.4);
        if (this.wadingPenalty > 0) {
          speed *= (1.0 - this.wadingPenalty);
          speed  = Math.max(MIN_WADING_SPEED, speed);
        }
        speed = Math.max(MIN_WADING_SPEED, speed);
      }
    }

    this._cachedSpeed         = speed;
    this._speedActionType     = actionType;
    this._speedResampleTimer  = now + this._speedResampleInterval;
    return speed;
  }

  _setEmotion(e)  { this.emotion = e; }
  _clearEmotion() { this.emotion = 'neutral'; }

  scanForAttractions(bounds) {
    if (this.participatingInRareEvent) return;
    if (this.pendingReaction) return;
    if (this.behaviorQueue && this.behaviorQueue.length && ['investigate', 'grab_mouth', 'hurt', 'crying', 'recovery'].includes(this.behaviorQueue[0]?.type)) return;

    const nowSim = this.simTime ?? (Date.now() / 1000);
    if (this._distractionCooldown && nowSim < this._distractionCooldown) return;

    const isWandering = !this.currentBehavior || (this.currentBehavior.action && this.currentBehavior.action.includes('random'));

    if (!isWandering && Math.random() > 0.001) return;
    if (isWandering && Math.random() > 0.005) return;

    const ag = getAgeGroup(this.ageGroupId);
    if (!ag || !this.availableObjects.length) return;

    const visible = visionSystem.scanVisibleObjects(this, this.availableObjects);
    if (!visible.length) return;

    const now = Date.now() / 1000;
    for (const v of visible) {
      this.objectMemory.set(v.object.id, {
        lastSeenPos: visionSystem._getObjCenter(v.object),
        lastSeenTime: now,
      });
    }
    const memoryLimit = ag.cognition?.hiddenObjectMemory || 30;
    for (const [id, mem] of this.objectMemory) {
      if (now - mem.lastSeenTime > memoryLimit) this.objectMemory.delete(id);
    }

    const best = visible[0];
    let score = best.score;
    score = this._applyStrangerFear(best.object, score);

    if (score > 0.5 && Math.random() < score * 0.3) {
      if (ag.neuromotorLatency) {
        const { perception, transmission, actuation } = ag.neuromotorLatency;
        this.reactionTimer = perception + transmission + actuation;
      } else {
        const stats = this._getFatigueModifiedStats();
        this.reactionTimer = stats.reactionLatency;
      }
      this.pendingReaction = best;
      this._distractionCooldown = nowSim + 3.0 + Math.random() * 3.0; 
    }
  }

  update(deltaTime, colliders, otherAgents, bounds) {
    if (!this.body) return;
    this.availableObjects = colliders || [];
    this.simTime += deltaTime;

    const cur = this.getPosition();
    this.recordPosition(cur);

    const dx = cur[0] - this.previousPosition[0];
    const dy = cur[1] - this.previousPosition[1];
    const dz = cur[2] - this.previousPosition[2];
    
    const newVel = [dx/deltaTime, dy/deltaTime, dz/deltaTime];
    if (this.velocity) {
      if (this.stunTimer > 0 || (this.recoveryTimer > 0 && this.recoveryTimer < 0.2)) {
        this._emaBoostFrames = 3;
      }
      if (this._emaBoostFrames > 0) this._emaBoostFrames--;
      const EMA_ALPHA = (this._emaBoostFrames > 0) ? 0.18 : 0.08;
      const rawAccX = (newVel[0] - this.velocity[0]) / deltaTime;
      const rawAccZ = (newVel[2] - this.velocity[2]) / deltaTime;
      const prevAcc = this.acceleration || [0, 0, 0];
      this.acceleration = [
        prevAcc[0] + EMA_ALPHA * (rawAccX - prevAcc[0]),
        0,
        prevAcc[2] + EMA_ALPHA * (rawAccZ - prevAcc[2]),
      ];
    } else {
      this.acceleration = [0, 0, 0];
    }
    this.velocity = newVel;
    this.totalDistance += Math.sqrt(dx*dx + dy*dy + dz*dz);

    const ag = getAgeGroup(this.ageGroupId);
    const fProfile = ag?.fatigueProfile || { fatigueRate: 0.05, recoveryRate: 0.1, enduranceCapacity: 60 };
    
    if (this.state === 'MOVING' || this.state === 'INTERACTING') {
      this.muscleState.fatigueLevel = Math.min(1.0, this.muscleState.fatigueLevel + deltaTime * fProfile.fatigueRate);
    } else if (this.state === 'IDLE') {
      this.muscleState.fatigueLevel = Math.max(0.0, this.muscleState.fatigueLevel - deltaTime * fProfile.recoveryRate);
      this.muscleState.sustainedLoadTimer = Math.max(0.0, this.muscleState.sustainedLoadTimer - deltaTime);
    }
    this.fatigueLevel = this.muscleState.fatigueLevel;

    if (this.recoveryTimer > 0) {
      this.recoveryTimer = Math.max(0, this.recoveryTimer - deltaTime);
      if (this.recoveryTimer === 0 && this.emotion === 'crying') this._clearEmotion();
    }

    if (this.wadingPenalty > 0) {
      this.wadingPenalty = Math.max(0, this.wadingPenalty - deltaTime * 2.0);
      if (this.wadingPenalty === 0) this.wadingObjectId = null;
    }

    if (bounds && !this._boundsInited) {
      this.explorationMap.init(bounds);
      this._boundsInited = true;
    }

    if (this._boundsInited) {
      this.explorationMap.markVisited(cur[0], cur[2]);
    }

    this._updateBoredom(deltaTime, cur);
    this.scanForAttractions(bounds);

    if (this.pendingReaction && this.reactionTimer > 0) {
      this.reactionTimer -= deltaTime;
      if (this.reactionTimer <= 0) {
        this._reactToObject(this.pendingReaction);
        this.pendingReaction = null;
      }
    }

    this._updateHandSensors();
    this.updateBehavior(deltaTime, colliders, bounds);
    this.previousPosition = [...cur];
  }

  updateBehavior(deltaTime, colliders, bounds) {
    if (!this.body) return;

    const pos = this.getPosition();
    const dynamicCOM = this.getDynamicCOM();
    const agData = getAgeGroup(this.ageGroupId);
    
    if (agData && (this.state === 'MOVING' || this.state === 'INTERACTING') && !this.fallState) {
      const capsuleRadius = agData.capsuleRadius || 0.22;
      const supportRadius = capsuleRadius * 1.5;
      const comDistX = dynamicCOM[0] - pos[0];
      const comDistZ = dynamicCOM[2] - pos[2];
      const comDistXZ = Math.hypot(comDistX, comDistZ);
      const neutralComY   = pos[1] + (agData.height || 0.8) * 0.55;
      const comY          = dynamicCOM[1];
      const comElevation  = Math.max(0, comY - neutralComY);
      // Pendulum scaling: sqrt(1 + (Δh/r)²) — small-angle approximation
      const pendulumScale = Math.sqrt(1 + Math.pow(comElevation / Math.max(supportRadius, 0.01), 2));
      const comDist       = comDistXZ * pendulumScale;

      let marginOfStability = supportRadius - comDist;
      const bCtrl = agData.balanceControl || { ankleGain: 0.5, hipGain: 0.5, recoveryStepLatency: 0.5, balanceNoise: 0.5 };
      const noise = (Math.random() * 2 - 1) * bCtrl.balanceNoise * 0.1;
      marginOfStability += noise;
      
      if (marginOfStability < 0.10) {
        if (marginOfStability >= 0.04) {
          if (!this._stratLog) {
            this.actionLog.push({ s: this.state, a: 'ankle_strategy', margin: marginOfStability.toFixed(2) });
            this._stratLog = true;
          }
          this.velocity[0] *= (1.0 - (1.0 - bCtrl.ankleGain) * 0.1);
          this.velocity[2] *= (1.0 - (1.0 - bCtrl.ankleGain) * 0.1);
        } else if (marginOfStability >= 0.0) {
          this.actionLog.push({ s: this.state, a: 'hip_strategy', margin: marginOfStability.toFixed(2) });
          this.velocity[0] *= (1.0 - (1.0 - bCtrl.hipGain) * 0.4);
          this.velocity[2] *= (1.0 - (1.0 - bCtrl.hipGain) * 0.4);
        } else if (marginOfStability >= -0.15) {
          this.actionLog.push({ s: 'IDLE', a: 'step_strategy', margin: marginOfStability.toFixed(2) });
          this.behaviorQueue = [
             { type: 'stumble', action: 'lose_balance', duration: bCtrl.recoveryStepLatency, completed: false }
          ];
          this.currentBehavior = null;
          this.state = 'INTERACTING';
          this._setEmotion('scared');
          return;
        } else {
          this.actionLog.push({ s: 'IDLE', a: 'fall_failed', margin: marginOfStability.toFixed(2) });
          const isRunStall = Math.hypot(this.velocity[0], this.velocity[2]) > 1.5;
          this.behaviorQueue = [
             { type: 'stumble', action: isRunStall ? 'fall_forward' : 'trip', duration: 1.5, completed: false }
          ];
          this.currentBehavior = null;
          this.targetPosition = null;
          this.state = 'IDLE';
          this.velocity = [0, 0, 0];
          this._setEmotion('scared');
          return;
        }
      } else {
        this._stratLog = false;
      }
    }

    if (this.pendingBounce && this.body) {
      const pos  = this.body.translation();
      const newX = pos.x + this.pendingBounce.nx * this.pendingBounce.force;
      const newZ = pos.z + this.pendingBounce.nz * this.pendingBounce.force;
      if (Number.isFinite(newX) && Number.isFinite(newZ)) {
        this.setSafeTranslation({ x: newX, y: pos.y, z: newZ });
      }
      this.pendingBounce = null;
    }

    if (this.stunTimer > 0) { this.stunTimer -= deltaTime; return; }
    if (this.fallState && this.body) { this.executeAction({ action: 'free_fall' }, deltaTime, colliders, bounds); return; }
    if (this.participatingInRareEvent && this.rareEventChain) { this.executeRareEventStep(deltaTime, colliders, bounds); return; }

    if (this.idleCooldown > 0) {
      const prevCooldown = this.idleCooldown;
      this.idleCooldown = Math.max(0, this.idleCooldown - deltaTime);
      if (prevCooldown > 0 && this.idleCooldown === 0 && this.body) {
        const pos = this.body.translation();
        this.lastMovePos = [pos.x, pos.y, pos.z];
      }
      this.state = 'IDLE';
      return;
    }

    if (this.currentBehavior) {
      this.behaviorTimer += deltaTime;
      if (this.behaviorTimer >= this.currentBehavior.duration) {
        this.currentBehavior.completed = true; this.currentBehavior = null;
        this.behaviorTimer = 0; this.state = 'IDLE';
      } else {
        this.executeAction(this.currentBehavior, deltaTime, colliders, bounds);
      }
    } else if (this.state === 'MOVING' && this.targetPosition) {
      this.moveTowardsTarget(deltaTime, 'walk', bounds);
      if (!this.targetPosition) this.state = 'IDLE';
    } else {
      this.pickNextBehavior(deltaTime, bounds);
      if (this.state === 'MOVING' && this.targetPosition) this.moveTowardsTarget(deltaTime, 'walk', bounds);
    }
  }

  /**
   * [REALISM FIX] Adjust behavior duration based on actual target distance and age speed.
   * Prevents infant from being stuck in unrealistic crawl-to-distant-target behavior.
   */
  _adjustBehaviorDuration(behavior, actionType = 'walk') {
    if (!behavior || !behavior.sequence) return behavior;
    
    const movements = behavior.sequence.filter(a => ['walk', 'crawl', 'run', 'walk_to'].includes(a.action));
    
    if (movements.length === 0) return behavior; // No movement actions, keep as is
    
    // Ensure all actions have valid duration
    if (behavior.sequence) {
      behavior.sequence.forEach(a => {
        if (!a.duration || a.duration <= 0) {
          a.duration = 0.5; // Default 0.5s for any action without duration
        }
        a.duration = Math.min(a.duration, 10); // Cap single action at 10s
      });
    }
    
    // Ensure total behavior duration is reasonable
    const minDuration = 0.5;
    const maxDuration = 20; // Max 20s per behavior
    const totalSequenceDuration = (behavior.sequence || []).reduce((sum, a) => sum + (a.duration || 0.5), 0);
    behavior.duration = Math.max(minDuration, Math.min(totalSequenceDuration, maxDuration));
    
    return behavior;
  }

  pickNextBehavior(deltaTime, bounds) {
    if (!this.behaviorQueue?.length) {
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }

    let next = this.behaviorQueue.find(b => !b.completed);

    if (!next) {
      const REACTION_TYPES = ['hurt', 'crying', 'recovery'];
      this.behaviorQueue = this.behaviorQueue.filter(b => !REACTION_TYPES.includes(b.type));

      if (!this.behaviorQueue.length && this._savedBehaviorQueue?.length) {
        let shouldRestore = true;
        if (this._savedBehaviorQueue.length > 0) {
          const restoredTarget = this._savedBehaviorQueue[0]?.target
                              || this._savedBehaviorQueue[0]?.targetPosition;
          if (restoredTarget && Array.isArray(restoredTarget)) {
            const agentPos = this.getPosition();
            const dx = restoredTarget[0] - agentPos[0];
            const dz = (restoredTarget[2] ?? 0) - agentPos[2];
            const dist = Math.hypot(dx, dz);
            if (dist > 2.5) {
              shouldRestore = false;
              this._savedBehaviorQueue = null;
            }
          }
        }
        if (shouldRestore) {
          this.behaviorQueue = this._savedBehaviorQueue;
          this._savedBehaviorQueue = null;
        }
        this._reactionActive = false;
      } else if (!this.behaviorQueue.length) {
        this._reactionActive = false;
      }

      if (this.behaviorQueue.length) {
        this.behaviorQueue.forEach(b => {
          b.completed = false;
          if (b.sequence) b.sequence.forEach(a => { a.completed = false; });
        });
      }
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }

    // Case 1: Behavior with sequence
    if (next.sequence && next.sequence.length > 0) {
      const act = next.sequence.find(a => !a.completed);
      if (act) {
        const _stationaryActions = ['grab', 'grab_mouth', 'reach_up', 'pull', 'pull_to_stand',
          'open_drawer', 'pause', 'look_around', 'lose_balance', 'climb_on'];
        if (!_stationaryActions.includes(act.action)) {
          this.targetPosition = null; // [BUG-M3 FIX]
        }
        this._resolveActionTarget(act, next, bounds);
        this.currentBehavior = act;
        this.behaviorTimer = 0;
      } else {
        next.completed = true;
        this.state = 'MOVING';
        this.setRandomTarget(bounds);
      }
      return;
    }

    // Case 2: Flat action (no sequence)
    // [BUG-M3 FIX] Same targetPosition clear as Case 1 for flat actions.
    const _stationaryActionsFlat = ['grab', 'grab_mouth', 'reach_up', 'pull', 'pull_to_stand',
      'open_drawer', 'pause', 'look_around', 'lose_balance', 'climb_on'];
    if (!_stationaryActionsFlat.includes(next.action)) {
      this.targetPosition = null; // [BUG-M3 FIX]
    }
    this._resolveActionTarget(next, next, bounds);
    this.currentBehavior = next;
    this.behaviorTimer = 0;
  }


  /**
   * Compute the distance from AABB center to its surface in direction (nx, nz).
   * Formula: projDist = |nx|*hx + |nz|*hz  (exact for axis-aligned box in XZ plane)
   * This replaces max(hx,hz) which over-estimates approach distance for rectangular objects.
   * @param {number} hx - half-extent in X
   * @param {number} hz - half-extent in Z
   * @param {number} nx - approach unit vector X (agent_to_center normalized)
   * @param {number} nz - approach unit vector Z
   * @returns {number} edge distance in metres
   */
  _aabbSurfaceDist(hx, hz, nx, nz) {
    return Math.abs(nx) * hx + Math.abs(nz) * hz;
  }

  _resolveActionTarget(action, parentBehavior, bounds) {
    const targetId = action.targetObjectId || parentBehavior?.targetObjectId;
    const targetType = action.target || parentBehavior?.targetTypes?.[0];

    if (this.targetPosition) return;
    const stationaryActions = ['grab', 'grab_mouth', 'reach_up', 'pull', 'pull_to_stand',
      'open_drawer', 'pause', 'look_around', 'lose_balance', 'climb_on'];
    if (stationaryActions.includes(action.action)) return;

    if (targetId && this.availableObjects.length > 0) {
      const obj = this.availableObjects.find(c =>
        c.id === targetId || c.name?.toLowerCase().includes(targetId.toLowerCase())
      );
      if (obj?.boundingBox) {
        const cur = this.getPosition();
        const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
        const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
        const toCurX = cur[0] - cx;
        const toCurZ = cur[2] - cz;
        const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
        const hx = (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2;
        const hz = (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2;
        const nx = toCurX / toCurLen;
        const nz = toCurZ / toCurLen;
        const edgeSurfaceDist = this._aabbSurfaceDist(hx, hz, nx, nz);
        const capsR = this.anthropometry ? (this.anthropometry.capsuleRadius || 0.22) : 0.22;
        // Stand 1.5× capsule radius away from actual object surface
        const approachOffset = edgeSurfaceDist + capsR * 1.5;
        this.targetPosition = [
          cx + nx * approachOffset,
          obj.boundingBox.min[1],
          cz + nz * approachOffset,
        ];
        return;
      }
    }

    if (targetType && targetType !== 'random' && this.availableObjects.length > 0) {
      const cur = this.getPosition();
      let candidates = [];
      for (const obj of this.availableObjects) {
        if (!obj.boundingBox) continue;
        const name = (obj.name || obj.id || '').toLowerCase();
        if (name.includes(targetType.toLowerCase()) || targetType === 'object') {
          const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
          const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
          const d = Math.hypot(cx - cur[0], cz - cur[2]);
          if (d < 10.0) { // Consider anything reasonable in the room
            candidates.push({ obj, dist: d });
          }
        }
      }
      
      if (candidates.length > 0) {
        // Find far candidates to encourage crossing the room
        const farCandidates = candidates.filter(c => c.dist > 1.5);
        let selectedCandidate = null;
        
        if (farCandidates.length > 0) {
          // 80% chance to intentionally pick a far object if one is available
          if (Math.random() < 0.8) {
            selectedCandidate = farCandidates[Math.floor(Math.random() * farCandidates.length)];
          } else {
            selectedCandidate = candidates[Math.floor(Math.random() * candidates.length)];
          }
        } else {
          selectedCandidate = candidates[Math.floor(Math.random() * candidates.length)];
        }
        
        const bestObj = selectedCandidate.obj;
        const cx = (bestObj.boundingBox.min[0] + bestObj.boundingBox.max[0]) / 2;
        const cz = (bestObj.boundingBox.min[2] + bestObj.boundingBox.max[2]) / 2;
        const toCurX = cur[0] - cx;
        const toCurZ = cur[2] - cz;
        const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
        const hx = (bestObj.boundingBox.max[0] - bestObj.boundingBox.min[0]) / 2;
        const hz = (bestObj.boundingBox.max[2] - bestObj.boundingBox.min[2]) / 2;
        // [GEOM-1 FIX] AABB surface projection — exact edge distance in approach direction
        const nx = toCurX / toCurLen;
        const nz = toCurZ / toCurLen;
        const edgeSurfaceDist = this._aabbSurfaceDist(hx, hz, nx, nz);
        const capsR = this.anthropometry ? (this.anthropometry.capsuleRadius || 0.22) : 0.22;
        const approachOffset = edgeSurfaceDist + capsR * 1.5;
        this.targetPosition = [
          cx + nx * approachOffset,
          bestObj.boundingBox.min[1],
          cz + nz * approachOffset,
        ];
        return;
      }
    }

    this.setRandomTarget(bounds);
  }

  executeAction(action, deltaTime, colliders, bounds) {
    if (!this.body) return;
    const t = action.action || action.type;

    switch (t) {
      case 'walk_to':
      case 'investigate':
        this.state = 'MOVING';
        if (!this.targetPosition && (action.targetObjectId || action.target)) {
          const id  = action.targetObjectId || action.target;
          const obj = colliders.find(c => c.id === id || c.name?.toLowerCase().includes(id.toLowerCase()));
          if (obj?.boundingBox) {
            const cur2 = this.getPosition();
            const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
            const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
            const toCurX = cur2[0] - cx;
            const toCurZ = cur2[2] - cz;
            const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
            const hxW = (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2;
            const hzW = (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2;
            // [GEOM-1 FIX] AABB surface projection
            const nxW = toCurX / toCurLen;
            const nzW = toCurZ / toCurLen;
            const edgeR = this._aabbSurfaceDist(hxW, hzW, nxW, nzW);
            const capsR = this.anthropometry?.capsuleRadius ?? 0.22;
            const offset = edgeR + capsR * 1.5;
            this.targetPosition = [
              cx + nxW * offset,
              obj.boundingBox.min[1],
              cz + nzW * offset,
            ];
          } else {
            this.setRandomTarget(bounds);
          }
        } else if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime, 'walk', bounds);
        break;

      case 'walk_random':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'walk', bounds);
        if (!this.targetPosition) this.setRandomTarget(bounds);
        break;

      case 'crawl':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'crawl', bounds);
        if (!this.targetPosition) this.setRandomTarget(bounds);
        break;

      case 'run': case 'run_unstable':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'run', bounds);
        break;

      case 'lunge':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'lunge', bounds);
        break;

      case 'trip': case 'stumble': case 'fall_forward': {
        const pos = this.body.translation();
        const currentFeetY = pos.y - this._agentHalfH;
        const h   = currentFeetY - this.spawnY;
        const landingY = this.spawnY + this._agentHalfH;
        if (h > 0.15) {
          this.state = 'FALLING';
          this.fallState = { startY: pos.y, targetY: landingY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        } else {
          this.state = 'INTERACTING';
          if (this.behaviorTimer < 0.3) {
            const surge = 1.0 * deltaTime, angle = Math.random() * Math.PI * 2;
            this.setSafeTranslation({
              x: pos.x + Math.cos(angle)*surge,
              y: Math.max(landingY - 0.2, pos.y - Math.sin(this.behaviorTimer*10)*0.1),
              z: pos.z + Math.sin(angle)*surge,
            });
          } else {
            this.state = 'IDLE'; this.velocity = [0,0,0];
            this.recoveryTimer = RECOVERY_DURATION;
            this._setEmotion('crying');
          }
        }
        break;
      }

      case 'free_fall': {
        this.state = 'FALLING';
        if (!this.body) break;
        const pos = this.body.translation();

        if (!this.fallState) {
          const currentFeetY = pos.y - this._agentHalfH;
          const h = Math.max(0.05, currentFeetY - (this._knownFloorY ?? this.spawnY));
          const landingY = (this._knownFloorY ?? this.spawnY) + this._agentHalfH;
          const v0 = -Math.sqrt(2 * 9.81 * h);
          this._vertVel = Math.min(this._vertVel, v0);
          this.fallState = { startY: pos.y, targetY: landingY, fallHeight: h, elapsed: 0 };
        }

        this.fallState.elapsed += deltaTime;
        this._vertVel = Math.max(this._vertVel - 9.81 * deltaTime, -20.0);

        const _kccColl = this.collider ?? this.colliders?.legs ?? this.colliders?.torso ?? null;
        if (_kccColl && this.controller) {
          physicsEngine.moveAgentWithController(
            this.world, this.controller, this.body, _kccColl,
            { x: 0, y: this._vertVel * deltaTime, z: 0 },
            deltaTime
          );
          if (physicsEngine.isGrounded(this.controller)) {
            this._vertVel = 0.0;
            this.fallState = null;
            this.state = 'IDLE';
            this.recoveryTimer = RECOVERY_DURATION;
            this._setEmotion('crying');
          }
        } else {
          // No KCC — legacy direct translation fallback
          const dur = Math.max(0.01, Math.sqrt(2 * this.fallState.fallHeight / 9.81));
          const t2  = Math.min(this.fallState.elapsed / dur, 1.0);
          const newY = this.fallState.startY - this.fallState.fallHeight * t2 * t2;
          this.setSafeTranslation({ x: pos.x, y: Math.max(this.fallState.targetY, newY), z: pos.z });
          if (t2 >= 1.0) {
            this._vertVel = 0.0;
            this.fallState = null; this.state = 'IDLE';
            this.recoveryTimer = RECOVERY_DURATION;
            this._setEmotion('crying');
          }
        }
        break;
      }

      case 'grab': case 'grab_mouth':
      case 'reach_up': {
        // [BUG FIX] Stationary actions without distance checks
        const curPos = this.getPosition();
        let validInteractTarget = false;
        if (action.targetObjectId && colliders) {
          const tObj = colliders.find(c => c.id === action.targetObjectId);
          if (tObj && tObj.boundingBox) {
            const cx = (tObj.boundingBox.min[0] + tObj.boundingBox.max[0]) / 2;
            const cz = (tObj.boundingBox.min[2] + tObj.boundingBox.max[2]) / 2;
            const hx = (tObj.boundingBox.max[0] - tObj.boundingBox.min[0]) / 2;
            const hz = (tObj.boundingBox.max[2] - tObj.boundingBox.min[2]) / 2;
            const edgeDist = Math.max(hx, hz) + 0.6; // Allow 0.6m leeway from center
            if (Math.hypot(cx - curPos[0], cz - curPos[2]) < edgeDist) {
              validInteractTarget = true;
            }
          }
        }
        
        // If no explicit target, see if any object at all is nearby
        if (!validInteractTarget) {
          for (const obj of (colliders || [])) {
            if (!obj.boundingBox) continue;
            const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
            const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
            const hx = (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2;
            const hz = (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2;
            // E.g., standing near wall, table, etc.
            if (Math.hypot(cx - curPos[0], cz - curPos[2]) < Math.max(hx,hz) + 0.7) {
              validInteractTarget = true;
              break;
            }
          }
        }

        if (validInteractTarget) {
          this.state = 'INTERACTING';
          if (t === 'grab_mouth') this._setEmotion('mischievous');
        } else {
          // No object nearby. Cancel the interaction to prevent air-grabbing.
          this.state = 'IDLE';
          if (this.currentBehavior) {
            this.currentBehavior.completed = true;
          }
          this._clearEmotion();
        }
        break;
      }

      case 'open_drawer': case 'pull': case 'pull_to_stand': case 'push': {
        // [BUG FIX] Check if we're actually near an object before pretending to pull
        const curPos = this.getPosition();
        let validInteractTarget = false;
        let interactTargetObj = null;
        if (action.targetObjectId && colliders) {
          const tObj = colliders.find(c => c.id === action.targetObjectId);
          if (tObj && tObj.boundingBox) {
            const cx = (tObj.boundingBox.min[0] + tObj.boundingBox.max[0]) / 2;
            const cz = (tObj.boundingBox.min[2] + tObj.boundingBox.max[2]) / 2;
            const hx = (tObj.boundingBox.max[0] - tObj.boundingBox.min[0]) / 2;
            const hz = (tObj.boundingBox.max[2] - tObj.boundingBox.min[2]) / 2;
            if (Math.hypot(cx - curPos[0], cz - curPos[2]) < Math.max(hx,hz) + 0.8) {
              validInteractTarget = true;
              interactTargetObj = tObj;
            }
          }
        }
        
        if (!validInteractTarget) {
          for (const obj of (colliders || [])) {
            if (!obj.boundingBox) continue;
            const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
            const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
            const hx = (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2;
            const hz = (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2;
            if (Math.hypot(cx - curPos[0], cz - curPos[2]) < Math.max(hx,hz) + 0.8) {
              validInteractTarget = true;
              interactTargetObj = obj;
              break;
            }
          }
        }

        if (!validInteractTarget) {
          this.state = 'IDLE';
          if (this.currentBehavior) {
            this.currentBehavior.completed = true;
          }
          break; // Abort pulling the air
        }

        // ── [TOPPLE PREDICTION] ──────────────────────────────────────────────
        // Khi agent bắt đầu push/pull, đánh giá ngay xem vật có thể đổ không.
        // Chỉ đánh giá một lần (khi behaviorTimer gần 0) để tránh spam.
        if (this.behaviorTimer < deltaTime * 3 && interactTargetObj) {
          const agData = getAgeGroup(this.ageGroupId);
          const toppleResult = topplePredictor.evaluate(
            this, interactTargetObj, t, agData
          );
          if (toppleResult) {
            this._lastToppleResult = toppleResult;
            if (toppleResult.canTopple) {
              // Log vào actionLog để frontend hiển thị
              this.actionLog.push({
                s: this.state,
                a: 'topple_predicted',
                obj: interactTargetObj.id,
                objName: interactTargetObj.name || interactTargetObj.id,
                mass: toppleResult.objectMass,
                injuryScore: toppleResult.agentInjury?.injuryScore,
                riskTier: toppleResult.agentInjury?.riskTier,
                dangerLevel: toppleResult.objectDangerLevel,
              });
              // Emit vào riskAnalytics
              if (toppleResult.agentInjury?.riskTier !== 'safe') {
                riskAnalytics.recordEvent('near_miss', toppleResult.asCollisionEvent?.position || curPos, {
                  agentId: this.id,
                  ageGroup: this.ageGroupId,
                  reason: 'topple_risk',
                  objectId: interactTargetObj.id,
                  severity: Math.ceil((toppleResult.agentInjury?.injuryScore || 0) / 20),
                });
              }
            }
          }
        }

        const agData = getAgeGroup(this.ageGroupId);
        const maxTorque = agData?.physics?.maxJointTorqueNm || 10;
        let assumedForceN = 20;
        if (action.targetObjectId && colliders) {
          const obj = colliders.find(c => c.id === action.targetObjectId);
          if (obj && obj.boundingBox) {
            const h = obj.boundingBox.max[1] - obj.boundingBox.min[1];
            assumedForceN = 10 + (h * 40); 
          }
        }
        const armLength = agData?.anthropometry?.armLength || 0.2;
        const requiredTorque = assumedForceN * armLength;
        let fatigueFactor = 1.0 - (this.muscleState.fatigueLevel * 0.5);
        let postureFactor = (this.state === 'IDLE') ? 1.0 : 0.8;
        const motorNoise = agData?.motorControl?.coordinationNoise || 0.1;
        let coordinationFactor = 1.0 - (Math.random() * motorNoise);
        const effectiveTorque = maxTorque * fatigueFactor * postureFactor * coordinationFactor;
        if (requiredTorque > 0.6 * maxTorque) {
            this.muscleState.sustainedLoadTimer += deltaTime;
            if (this.muscleState.sustainedLoadTimer > 2.0) {
                const fProfile = agData?.fatigueProfile || { fatigueRate: 0.05, enduranceCapacity: 60 };
                this.muscleState.fatigueLevel = Math.min(1.0, this.muscleState.fatigueLevel + (fProfile.fatigueRate * 5.0)); 
            }
        }
        if (requiredTorque > effectiveTorque) {
          this.logTorqueLimitExceeded(this.id, requiredTorque, effectiveTorque);
          this.state = 'INTERACTING';
          this.behaviorTimer = 0;
          this.currentBehavior = { type: 'failed_torque', action: 'lose_balance', duration: 1.5, completed: false };
          this._setEmotion('frustrated');
          break;
        }
        this.state = 'INTERACTING';
        const pos_p = this.body.translation();
        const pullBack = Math.sin(this.behaviorTimer * 1.5) * 0.02 * deltaTime;
        if (Number.isFinite(pos_p.z + pullBack)) {
          this.setSafeTranslation({ x: pos_p.x, y: pos_p.y, z: pos_p.z + pullBack });
        }
        break;
      }

      case 'climb_on': {
        const pos_c  = this.body.translation();
        const curPos = [pos_c.x, pos_c.y, pos_c.z];
        let climbTarget = null;
        const intendedTargetId = action.targetObjectId || this.currentBehavior?.targetObjectId;
        if (intendedTargetId) {
          climbTarget = (colliders || []).find(c => c.id === intendedTargetId);
        }
        if (!climbTarget) {
          let bestDist = 0.8; // Need to be within arm's reach ~0.8m of the edge
          for (const obj of (colliders || [])) {
            if (!obj.boundingBox) continue;
            const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
            const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
            const objHeight = obj.boundingBox.max[1] - obj.boundingBox.min[1];
            const hx = (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2;
            const hz = (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2;
            
            // Measure distance to actual edge, not center
            const distFromCenter = Math.hypot(cx - curPos[0], cz - curPos[2]);
            const distFromEdge = Math.max(0, distFromCenter - Math.max(hx, hz));
            
            if (distFromEdge < bestDist && objHeight > 0.2 && objHeight < 1.5) { 
              climbTarget = obj; bestDist = distFromEdge;
            }
          }
        }
        if (!climbTarget) { 
          // Air Climbing Cancelled
          this.state = 'IDLE'; 
          if (this.currentBehavior) this.currentBehavior.completed = true;
          break; 
        }
        const climbTargetName = (climbTarget.name || climbTarget.id || '').toLowerCase();
        const isNonClimbable = /curtain|drape|blind|rem|man_cua|shade|banner|tapestry|flag|ri_do|wall|picture|frame|painting|poster|mirror|clock|lamp|sconce|tranh|tuong|anh/.test(climbTargetName);
        if (isNonClimbable) {
          this.state = 'INTERACTING';
          this._setEmotion('mischievous');
          if (this.currentBehavior) {
             this.currentBehavior.action = climbTargetName.match(/curtain|drape|blind|rem|man_cua|ri_do/) ? 'pull' : 'reach_up';
          }
          break;
        }
        const agData = getAgeGroup(this.ageGroupId);
        const maxClimbH = Math.min(1.0, (agData?.reachHeight || 0.5) * 1.5);
        const objH = climbTarget.boundingBox.max[1] - climbTarget.boundingBox.min[1];
        const friction = this._getObjectFriction(climbTarget);
        if (!agData?.canClimb || objH > maxClimbH || friction < 0.3) {
          this.state = 'INTERACTING';
          this._setEmotion(friction < 0.3 ? 'frustrated' : 'scared');
          if (this.currentBehavior) { this.currentBehavior.action = 'reach_up'; }
          break;
        }
        const progress = this.behaviorTimer / (action.duration || 3.0);
        if (progress < 0.3) {
          this.state = 'MOVING';
        } else {
          this.state = 'INTERACTING';
        }
        const fail = agData?.climbFailRate || 0.1;
        const adjustedFail = fail + (1 - friction) * 0.2;
        if (Math.random() < adjustedFail && pos_c.y > (this.spawnY + this._agentHalfH) + 0.1) {
          const currentFeetY = pos_c.y - this._agentHalfH;
          const h = currentFeetY - this.spawnY;
          const landingY = this.spawnY + this._agentHalfH;
          this.fallState = { startY: pos_c.y, targetY: landingY, fallHeight: Math.max(0.1, h),
            velocity: Math.sqrt(2*9.81*Math.max(0.1, h)), elapsed: 0, duration: Math.sqrt(2*Math.max(0.1, h)/9.81) };
        } else {
          const maxAllowedY = (this.spawnY + this._agentHalfH) + (agData?.height || 0.8) + 0.1;
          let objectTopY = climbTarget.boundingBox.max[1];
          const cx = (climbTarget.boundingBox.min[0] + climbTarget.boundingBox.max[0]) / 2;
          const cz = (climbTarget.boundingBox.min[2] + climbTarget.boundingBox.max[2]) / 2;
          if (this.world) {
             const ray = new physicsEngine.rapier.Ray({ x: cx, y: objectTopY + 0.5, z: cz }, { x: 0, y: -1, z: 0 });
             // [FIX] Use filterFlags = 2 (EXCLUDE_KINEMATIC) to ignore agents
             const hit = this.world.castRay(ray, objectTopY - this.spawnY + 1.0, true, 2);
             if (hit) {
               const hitToi = hit.toi !== undefined ? hit.toi : hit.timeOfImpact;
               objectTopY = (objectTopY + 0.5) - hitToi;
             }
          }
          const targetTopY = Math.min(objectTopY, maxAllowedY);
          if (targetTopY > maxAllowedY + 0.5) { this.state = 'IDLE'; return; }
          const objHalfX = (climbTarget.boundingBox.max[0] - climbTarget.boundingBox.min[0]) / 2;
          const objHalfZ = (climbTarget.boundingBox.max[2] - climbTarget.boundingBox.min[2]) / 2;
          const capsuleR = agData?.capsuleRadius || 0.15;
          const edgeDist = Math.max(objHalfX, objHalfZ) + capsuleR * 1.5;
          const toObjX = cx - pos_c.x;
          const toObjZ = cz - pos_c.z;
          const toObjLen = Math.hypot(toObjX, toObjZ) || 1;
          const edgeX = cx - (toObjX / toObjLen) * Math.min(edgeDist, Math.max(objHalfX, objHalfZ));
          const edgeZ = cz - (toObjZ / toObjLen) * Math.min(edgeDist, Math.max(objHalfX, objHalfZ));
          if (progress < 0.3) {
            this.targetPosition = [edgeX, pos_c.y, edgeZ];
            this.moveTowardsTarget(deltaTime, 'walk', bounds);
          } else {
            const dObject = Math.hypot(cx - pos_c.x, cz - pos_c.z);
            if (dObject > 1.2) { this.state = 'IDLE'; this.targetPosition = null; break; }
            if (progress < 0.8) {
              const climbSpeed = this.getRealisticVelocity('climb');
              const maxLift = climbSpeed * deltaTime * 0.5;
              const liftY = Math.min(maxLift, targetTopY - pos_c.y);
              if (liftY > 0) {
                this.setSafeTranslation({ x: pos_c.x, y: Math.min(targetTopY, pos_c.y + liftY), z: pos_c.z });
              }
            } else {
              this.setSafeTranslation({ x: pos_c.x, y: Math.min(targetTopY, pos_c.y), z: pos_c.z });
            }
          }
        }
        break;
      }

      case 'hurt_light': case 'hurt_medium': case 'hurt_heavy': case 'hurt_shock': case 'recoil':
        this.state = 'INTERACTING';
        break;
      case 'crying_stand': case 'crying_sit':
        this.state = 'INTERACTING';
        break;
      case 'get_up_slow': case 'get_up_fast':
        this.state = 'INTERACTING';
        if (this.behaviorTimer <= deltaTime * 2) {
          this._setEmotion('scared');
        } else if (this.behaviorTimer > (action.duration || 1.5) * 0.8) {
          this._setEmotion('cautious');
        }
        break;
      case 'pause': case 'look_around':
        this.state = 'IDLE';
        break;
      case 'dodge': case 'push': case 'throw': case 'pick_up':
      case 'sit_down': case 'stand_up': case 'jump': case 'land': case 'slide':
        this.state = 'INTERACTING';
        break;
      default: {
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, t === 'crawl' ? 'crawl' : 'walk', bounds);
      }
    }
  }

  moveTowardsTarget(deltaTime, actionType = 'walk', bounds = null) {
    if (!this.targetPosition || !this.body) return;
    if (this.simTime < this.failedMovementCooldown) return;

    const cur  = this.getPosition();
    const dx   = this.targetPosition[0] - cur[0];
    const dz   = this.targetPosition[2] - cur[2];
    const dist = Math.sqrt(dx*dx + dz*dz);
    const arr  = this._getArrivalThreshold(actionType);
    if (dist < arr) {
      this.targetPosition  = null;
      this._currentSpeed   = 0;   // [FIX MOVEMENT 1] reset ramp on arrival
      if (this.emotion === 'mischievous' && Math.random() < 0.2) this._setEmotion('excited');
      else this._clearEmotion();
      return;
    }

    const dangerCheck = this._isNearDangerZone(this.targetPosition);
    if (dangerCheck.dangerous) {
      this._logRiskEvent('near_miss', this.targetPosition, {
        reason: 'danger_zone_avoided',
        agentHeight: getAgeGroup(this.ageGroupId)?.height ?? null,
      });
      this.targetPosition = null;
      this.state = 'IDLE';
      return;
    }

    if (actionType === 'walk' || actionType === 'run') {
      const agData = getAgeGroup(this.ageGroupId);
      const agentH = agData?.height || 0.8;
      const crawlH = (agData?.anthropometry?.legLength || agentH * 0.40) * 0.6; // chiều cao khi bò ~40cm

      if (agData?.canCrawl !== false) {
        const cur = this.getPosition();
        const toTargetX = dx / (dist || 1);
        const toTargetZ = dz / (dist || 1);

        // Kiểm tra điểm 0.5m trước mặt theo hướng di chuyển
        const probeX = cur[0] + toTargetX * 0.5;
        const probeZ = cur[2] + toTargetZ * 0.5;

        for (const obj of (this.availableObjects || [])) {
          if (!obj.boundingBox || obj.isSoft) continue;
          const bb = obj.boundingBox;
          const objH = bb.max[1] - bb.min[1];

          // Object phải: có độ cao vừa đủ để bò qua (crawlH < objH < agentH*0.85)
          // VÀ đáy gần sàn (min[1] <= knownFloorY + 0.1)
          // VÀ điểm probe nằm trong/gần object
          const floorY = this._knownFloorY ?? 0;
          const clearance = bb.max[1] - floorY; // khoảng hở từ sàn tới đáy ở mặt trên
          const objBottom = bb.min[1];

          if (
            objBottom <= floorY + 0.15 &&          // đế object gần sàn
            clearance >= crawlH &&                  // đủ chỗ để bò
            clearance < agentH * 0.85 &&            // không đủ chỗ để đi thẳng
            probeX > bb.min[0] - 0.3 && probeX < bb.max[0] + 0.3 &&
            probeZ > bb.min[2] - 0.3 && probeZ < bb.max[2] + 0.3
          ) {
            // Chuyển sang crawl
            if (this.currentBehavior) {
              this.currentBehavior._savedActionType = actionType;
              this.actionLog.push({ s: 'MOVING', a: 'auto_crawl', reason: 'low_clearance', obj: obj.id });
            }
            actionType = 'crawl';
            break;
          }
        }
      }
    }
    const agTorqueData = getAgeGroup(this.ageGroupId);
    if (agTorqueData && agTorqueData.physics) {
      const legLength = agTorqueData.anthropometry?.legLength || 0.2;
      const agentMass = agTorqueData.mass || 12;
      const accelTime = agTorqueData.kinematics?.accelerationTime || 0.5;
      const accel = this.getRealisticVelocity(actionType) / accelTime;
      const requiredForce = agentMass * accel;
      const requiredTorque = requiredForce * legLength;
      const maxTorque = agTorqueData.physics.maxJointTorqueNm;

      if (requiredTorque > maxTorque) {
        this.logTorqueLimitExceeded(this.id, requiredTorque, maxTorque);
        this.behaviorQueue = [{ type: 'stumble', action: 'lose_balance', duration: 1.5, completed: false }];
        this.currentBehavior = null;
        this.velocity = [0, 0, 0];
        this.state = 'IDLE';
        this.failedMovementCooldown = this.simTime + 0.5;
        return;
      }
    }

    if (this.simTime < this.pauseUntil) return;

    let targetSpeed = this.getRealisticVelocity(actionType);
    const floorFriction = physicsEngine.getFrictionForMovement(actionType, 'hardwood');
    targetSpeed *= (floorFriction / 0.5);

    const prof = this._ageProfile;
    if (this.burstState && this.simTime < this.burstState.endTime) {
      targetSpeed *= this.burstState.speedMult;
    }
    {
      const ag       = getAgeGroup(this.ageGroupId);
      const accelTime = ag?.kinematics?.accelerationTime ?? 0.4;
      const decelTime = accelTime * 0.5;  // decel is faster than accel for all ages

      if (!Number.isFinite(this._currentSpeed)) this._currentSpeed = 0;

      const delta = targetSpeed - this._currentSpeed;
      const rampRate = delta > 0
        ? (targetSpeed / accelTime) * deltaTime   // accelerating ✓
        : -(targetSpeed / decelTime) * deltaTime; // decelerating ✓ (âm → giảm speed)

      if (Math.abs(delta) < Math.abs(rampRate)) {
        this._currentSpeed = targetSpeed;
      } else {
        this._currentSpeed += rampRate;
      }
      this._currentSpeed = Math.max(0, this._currentSpeed);
    }
    const speed = this._currentSpeed;
    {
      const ag         = getAgeGroup(this.ageGroupId);
      const legLen     = ag?.anthropometry?.legLength ?? (ag?.height ?? 0.8) * 0.40;
      const minFreq    = 0.8;  // Hz (slow toddler trudge)
      const maxFreq    = 3.5;  // Hz (fast child run)
      // Froude-based step frequency: f ≈ sqrt(g / legLen) / (2π) × speedScale
      const froude     = speed > 0.01 ? Math.min(1, speed / Math.max(0.1, targetSpeed)) : 0;
      const stepFreq   = minFreq + froude * (maxFreq - minFreq);
      if (!Number.isFinite(this._gaitPhase)) this._gaitPhase = Math.random() * Math.PI * 2;
      this._gaitPhase += stepFreq * deltaTime * Math.PI * 2;

      // Speed modulation: ±8% variation at heel-strike, negligible during crawl
      const swayAmp = actionType === 'crawl' ? 0.02 : 0.08;
      this._gaitSpeedMult = 1.0 + Math.sin(this._gaitPhase) * swayAmp;
    }
    // [BUG-FIX-STUMBLE] stumbleProb trong AGE_MOVEMENT_PROFILES đã là per-second rate (có comment rõ ràng).
    // Nhân thêm 60 là sai hoàn toàn — tăng xác suất vấp ngã lên 60 lần, gây chấn thương vô lý liên tục.
    const stumbleP = (prof.stumbleProb || 0); // per-second rate, không nhân thêm
    if (stumbleP > 0 && Math.random() < stumbleP * deltaTime) {
      this.behaviorQueue = [{ type: 'stumble', action: 'fall_forward', duration: 1.5, completed: false }];
      this.currentBehavior = null;
      return;
    }

    const seekX = dx / dist;
    const seekZ = dz / dist;

    let avoidX = 0, avoidZ = 0;
    const avoidRadius = 0.35;
    const solidObstacles = (this.availableObjects || []).filter(obj => {
      if (!obj.boundingBox) return false;
      const { min, max } = obj.boundingBox;
      const objH = max[1] - min[1];
      const roomW = this._boundsInited
        ? Math.max(this.explorationMap.cols, this.explorationMap.rows) * this.explorationMap.cellSize
        : 10;
      const objW = Math.max(max[0] - min[0], max[2] - min[2]);
      if (objW > roomW * 0.75) return false;
      if (objH < 0.20) return false;
      if (min[1] > (this._knownFloorY ?? 0) + 0.5) return false;
      return true;
    });

    for (const obj of solidObstacles) {
      const bb = obj.boundingBox;
      const nearX = Math.max(bb.min[0], Math.min(cur[0], bb.max[0]));
      const nearZ = Math.max(bb.min[2], Math.min(cur[2], bb.max[2]));
      const toObjX = cur[0] - nearX;
      const toObjZ = cur[2] - nearZ;
      const toObjDist = Math.hypot(toObjX, toObjZ);

      if (toObjDist < avoidRadius) {
        const safeDist = Math.max(toObjDist, 0.01);
        const strength = (1 - safeDist / avoidRadius) * 1.5;
        if (toObjDist < 0.01) {
          const escAngle = (this.id * 2.399963) % (Math.PI * 2);
          avoidX += Math.cos(escAngle) * strength;
          avoidZ += Math.sin(escAngle) * strength;
        } else {
          avoidX += (toObjX / safeDist) * strength;
          avoidZ += (toObjZ / safeDist) * strength;
        }
      }
    }

    if (!this._avoidHistory) this._avoidHistory = [];
    this._avoidHistory.push([avoidX, avoidZ]);
    if (this._avoidHistory.length > 10) this._avoidHistory.shift();
    const avgAvoidX = this._avoidHistory.reduce((s, v) => s + v[0], 0) / this._avoidHistory.length;
    const avgAvoidZ = this._avoidHistory.reduce((s, v) => s + v[1], 0) / this._avoidHistory.length;
    const avgAvoidLen = Math.hypot(avgAvoidX, avgAvoidZ);
    const isOscillating = (this.stuckCounter || 0) >= 10;
    const avoidWeight = isOscillating
      ? Math.min(0.05, avgAvoidLen * 0.03)
      : Math.min(0.35, avgAvoidLen * 0.25);
    const seekWeight  = 1 - avoidWeight;
    let steerX = seekX * seekWeight + (avgAvoidLen > 0 ? (avgAvoidX/avgAvoidLen)*avoidWeight : 0);
    let steerZ = seekZ * seekWeight + (avgAvoidLen > 0 ? (avgAvoidZ/avgAvoidLen)*avoidWeight : 0);
    const steerLen = Math.hypot(steerX, steerZ) || 1;
    steerX /= steerLen;
    steerZ /= steerLen;

    const ag  = getAgeGroup(this.ageGroupId);
    const kin = ag?.kinematics;
    const stats = this._getFatigueModifiedStats();
    let moveX, moveZ;

    // Apply gait speed modulation (footfall oscillation — see [FIX MOVEMENT 2] above)
    const gaitSpeed = speed * (this._gaitSpeedMult ?? 1.0);

    if (kin) {
      const desiredAngle = Math.atan2(steerZ, steerX);
      const angleDiff    = this._normalizeAngle(desiredAngle - this.currentHeading);
      const maxTurn      = stats.turnRate * deltaTime;
      this.currentHeading += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
      const biasedSpeed = gaitSpeed * (1.0 + kin.forwardBias * 0.3);
      const rawX = Math.cos(this.currentHeading) * biasedSpeed * deltaTime;
      const rawZ = Math.sin(this.currentHeading) * biasedSpeed * deltaTime;
      const mf = dist < 1.5
        ? Math.min(0.05, kin.momentumFactor * 0.2)  // near target: minimal momentum
        : kin.momentumFactor;
      moveX = rawX * (1 - mf) + (this.velocity[0] * deltaTime) * mf;
      moveZ = rawZ * (1 - mf) + (this.velocity[2] * deltaTime) * mf;
    } else {
      moveX = steerX * gaitSpeed * deltaTime;
      moveZ = steerZ * gaitSpeed * deltaTime;
    }

    const agObj = getAgeGroup(this.ageGroupId);
    const mCtrl = agObj?.motorControl || { coordinationNoise: 0.1, motorPlanningError: 0.05 };
    
    const prevWobble = Math.sin(this._wobblePhase) * (prof.wobbleAmplitude || 0);
    this._wobblePhase += prof.wobbleFrequency * deltaTime * Math.PI * 2;
    const currWobble = Math.sin(this._wobblePhase) * (prof.wobbleAmplitude || 0);
    const wobbleDelta = currWobble - prevWobble;

    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0.001) {
      this._driftPhase += deltaTime * 1.5;
      const wanderFactor = Math.sin(this._driftPhase) * 0.5 + Math.cos(this._driftPhase * 0.73) * 0.5;
      const planErrorAngle = wanderFactor * mCtrl.motorPlanningError; 
      const currentX = moveX;
      const currentZ = moveZ;
      moveX = currentX * Math.cos(planErrorAngle) - currentZ * Math.sin(planErrorAngle);
      moveZ = currentX * Math.sin(planErrorAngle) + currentZ * Math.cos(planErrorAngle);
      const speedWander = Math.sin(this._driftPhase * 1.3);
      const coordJitter = 1.0 + (speedWander * mCtrl.coordinationNoise);
      moveX *= coordJitter;
      moveZ *= coordJitter;
      const perpX = -moveZ / moveLen;
      const perpZ =  moveX / moveLen;
      moveX += perpX * wobbleDelta;
      moveZ += perpZ * wobbleDelta;
    }

    if (this.controller && this.world) {
      const kccCollider = this.collider ?? this.colliders?.legs ?? this.colliders?.torso ?? null;
      if (kccCollider) {
        const corrected = physicsEngine.moveAgentWithController(
          this.world, this.controller, this.body, kccCollider,
          { x: moveX, y: (this._vertVel || 0) * deltaTime, z: moveZ },
          deltaTime
        );
        const _isGrounded = physicsEngine.isGrounded(this.controller);
        if (_isGrounded) {
          this._vertVel = 0.0;
          const _feetNow = this.body.translation().y - this._agentHalfH;
          if (Number.isFinite(_feetNow)) this._knownFloorY = _feetNow;
        } else {
          this._vertVel = Math.max((this._vertVel || 0) - 9.81 * deltaTime, -20.0);
        }

        const posNow = this.body.translation();
        const stuckDx = posNow.x - this.lastMovePos[0];
        const stuckDz = posNow.z - this.lastMovePos[2];
        const stuckDist = Math.sqrt(stuckDx * stuckDx + stuckDz * stuckDz);
        const intendedDist = Math.hypot(moveX, moveZ);
        const isEffectivelyStuck = intendedDist > 0.003 && stuckDist < intendedDist * 0.10;
        if (isEffectivelyStuck) {
          this.stuckCounter++;
        } else {
          this.stuckCounter = 0;
        }
        this.lastMovePos = [posNow.x, posNow.y, posNow.z];
        // [BUG-FIX-STUCK] Giảm ngưỡng từ 30 → 15 để phản ứng nhanh hơn.
        // Sau unstuck PHẢI gọi setRandomTarget để chọn đích mới — nếu chỉ set idleCooldown
        // thì pickNextBehavior() sẽ lấy lại behavior cũ cùng targetObjectId → loop vô tận vào tường.
        if (this.stuckCounter > 15) {
          this.targetPosition = null;
          this.stuckCounter = 0;
          this._currentSpeed = 0;
          this.state = 'IDLE';
          this._avoidHistory = []; // Xoá lịch sử avoid để tránh oscillation

          // Xoay đầu lệch 90° so với hướng tường
          this.currentHeading += (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
          this.idleCooldown = 0.5;

          // [BUG-FIX-STUCK] Chủ động chọn đích mới ngay lập tức thay vì để pickNextBehavior
          // lấy lại behavior cũ. Dùng setRandomTarget với bounds hiện tại nếu có.
          if (bounds) {
            // Reset behavior queue để thoát behavior đang bị block
            const BLOCKABLE_TYPES = ['walk_to', 'investigate', 'crawl', 'run', 'walk_random'];
            if (this.currentBehavior && BLOCKABLE_TYPES.includes(this.currentBehavior.action)) {
              this.currentBehavior.completed = true;
              this.currentBehavior = null;
              this.behaviorTimer = 0;
            }
            this.setRandomTarget(bounds);
          }
          return;
        }
        return;
      }
      // [BUG-FIX-KCC-NULL] kccCollider null: controller tồn tại nhưng collider chưa được gán.
      // Code cũ return sớm ở đây → nhân vật đứng yên hoàn toàn, totalDistance = 0.0m.
      // Fallthrough xuống direct translation để vẫn di chuyển được.
      console.warn(`[Agent ${this.id}] KCC collider is null — falling back to direct translation`);
    }

    const pos = this.body.translation();
    if (Number.isFinite(pos.x + moveX) && Number.isFinite(pos.z + moveZ)) {
      this.setSafeTranslation({ x: pos.x + moveX, y: pos.y, z: pos.z + moveZ });
      // Cập nhật lastMovePos để stuck detection vẫn hoạt động ở fallback path
      this.lastMovePos = [pos.x + moveX, pos.y, pos.z + moveZ];
    }
  }

  logTorqueLimitExceeded(agentId, torqueRequested, maxTorque) {
    if (this.simTime - (this._lastTorqueLogTime || 0) < 1.0) return;
    this._lastTorqueLogTime = this.simTime;
    console.warn(`[Physics Safety] Agent ${agentId} exceeded biological torque limit! Requested: ${torqueRequested.toFixed(1)}Nm, Max: ${maxTorque.toFixed(1)}Nm`);
    this.actionLog.push({ s: 'INTERACTING', a: 'torque_exceeded', v: 0, reqTorque: torqueRequested, maxTorque: maxTorque });
  }

  _getArrivalThreshold(actionType) {
    if (!this.anthropometry) return 0.2;
    switch (actionType) {
      case 'crawl':  return this.anthropometry.crawlReach  || 0.15;
      case 'run':
      case 'sprint': return (this.anthropometry.runStride  || 0.5) * 0.5;
      default:       return (this.anthropometry.walkStride || 0.3) * 0.5;
    }
  }

  handleIntersection(softObj) {
    if (!this.body) return;
    const r = typeof softObj.materialResistance === 'number' ? softObj.materialResistance : 0.60;
    this.wadingPenalty  = Math.min(1.0, r * WADING_SCALE_FACTOR);
    this.wadingObjectId = softObj.id || null;
  }

  handleCollision(contactNormal, severity, objectId = null) {
    if (!this.body) return;
    if (this.stunTimer > 0) return;
    if (this.fallState) return;
    if (this.simTime < 3.0) return;
    if (this.recoveryTimer > 0) return;

    // [BUG-FIX-WALL] Bỏ qua collision với tường và boundary — chúng không gây thương tích thực tế
    // mà chỉ là vật cản vật lý. Không filter này → nhân vật bị chấn thương khi đứng sát tường.
    if (objectId) {
      const objIdLower = String(objectId).toLowerCase();
      if (
        objIdLower.includes('wall') ||
        objIdLower.includes('boundary') ||
        objIdLower.includes('floor') ||
        objIdLower.includes('ceiling') ||
        objIdLower.includes('tuong') ||
        objIdLower.includes('san') ||
        objIdLower.includes('tran')
      ) return;
    }

    // Bộ lọc an toàn: Kiểm tra mảng vận tốc để tránh crash ngầm hệ thống
    let actualSpeed = 0;
    if (this.velocity && Array.isArray(this.velocity) && this.velocity.length >= 3) {
      const vx = this.velocity[0] || 0;
      const vz = this.velocity[2] || 0;
      const vy = this._vertVel || 0;
      actualSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    }

    // Triệt tiêu chấn thương Jittering ma thuật khi trẻ đứng im hoặc bị cản cứng tại tường
    if (actualSpeed < 0.05 && !this.fallState) {
      return; 
    }

    // Đảm bảo không tính chấn thương trên không trung/trần nhà nếu chân trẻ đang sát sàn
    const pos = this.body.translation();
    const currentFeetY = pos.y - this._agentHalfH;
    const expectedFloorY = this._knownFloorY ?? this.spawnY;
    if (currentFeetY > expectedFloorY + 0.15 && !this.fallState) {
      return;
    }

    if (objectId) {
      if (!this._collisionCooldowns) this._collisionCooldowns = new Map();
      if (!this._collisionCounts) this._collisionCounts = new Map();
      const lastHit = this._collisionCooldowns.get(objectId) || 0;
      if (this.simTime - lastHit < 2.0) return;
      this._collisionCooldowns.set(objectId, this.simTime);
      const prevCount = this._collisionCounts.get(objectId) || 0;
      this._collisionCounts.set(objectId, prevCount + 1);
    }

    if (severity < 25) { 
      if (objectId) {
        this.actionLog.push({ type: 'graze', severity: severity.toFixed(1), objectId });
      }
      return; 
    }

    const force    = severity > 50 ? 0.15 : severity > 20 ? 0.08 : 0.01;
    const stun     = severity > 50 ? 1.5  : severity > 20 ? 0.8  : 0.2;
    let nx = 0, nz = 0;
    if (contactNormal && (contactNormal[0] !== 0 || contactNormal[2] !== 0)) {
      const len = Math.hypot(contactNormal[0], contactNormal[2]);
      nx = contactNormal[0]/len; nz = contactNormal[2]/len;
    } else {
      const a = Math.random() * Math.PI * 2; nx = Math.cos(a); nz = Math.sin(a);
    }
    this.pendingBounce = { nx, nz, force };
    this.stunTimer     = stun;
    this.velocity      = [0, 0, 0];

    const hurtAction = severity > 80 ? 'hurt_shock'
      : severity > 50 ? 'hurt_heavy'
      : severity > 20 ? 'hurt_medium' : 'hurt_light';
    const hurtDuration = severity > 80 ? 5.0
      : severity > 50 ? 3.0 : severity > 20 ? 2.0 : 0.5;
    const hurtEmotion = severity > 20 ? 'crying' : 'scared';
    const chain = [{ type: 'hurt', action: hurtAction, duration: hurtDuration, completed: false }];
    if (severity > 20) {
      chain.push({ type: 'crying', action: severity > 50 ? 'crying_sit' : 'crying_stand',
        duration: severity > 50 ? 1.5 : 1.0, completed: false });
    }
    chain.push({ type: 'recovery', action: severity > 50 ? 'get_up_slow' : 'get_up_fast',
      duration: severity > 50 ? 2.0 : 0.8, completed: false });

    if (!this._reactionActive) {
      if (this.behaviorQueue.length && !this.behaviorQueue.every(b => ['hurt', 'crying', 'recovery'].includes(b.type))) {
        this._savedBehaviorQueue = [...this.behaviorQueue];
      }
    }
    this._reactionActive = true;
    this.behaviorQueue = chain;
    this.currentBehavior = null;
    this.state = 'INTERACTING';
    this._setEmotion(hurtEmotion);
    this.recoveryTimer = hurtDuration + (severity > 20 ? 1.5 : 0.5);

    this._recordDangerZone(this.getPosition(), severity);
    this._logRiskEvent('collision', this.getPosition(), { severity, objectId: objectId });
    this._checkTantrumTrigger();
  }

  executeRareEventStep(deltaTime, colliders, bounds) {
    if (!this.rareEventChain?.chain) return;
    const step = this.rareEventChain.chain[this.rareEventStep];
    if (!step) { this.participatingInRareEvent = false; return; }
    this.state = 'RARE_EVENT';
    if (step.action) this.executeAction(step, deltaTime, colliders, bounds);
    this.behaviorTimer += deltaTime;
    if (this.behaviorTimer >= (step.duration || 2.0)) {
      this.rareEventStep++;
      this.behaviorTimer = 0;
      if (this.rareEventStep >= this.rareEventChain.chain.length) this.participatingInRareEvent = false;
    }
  }

  _getObjectFriction(obj) {
    if (obj?.properties?.friction != null) return obj.properties.friction;
    const matName = (obj?.properties?.material?.name || obj?.name || obj?.id || '').toLowerCase();
    if (matName.includes('curtain') || matName.includes('drape') || matName.includes('blind')
        || matName.includes('rem') || matName.includes('ri_do') || matName.includes('man_cua')) return 0.10;
    if (matName.includes('glass') || matName.includes('mirror') || matName.includes('window')) return 0.15;
    if (matName.includes('metal') || matName.includes('steel') || matName.includes('chrome')) return 0.20;
    if (matName.includes('plastic') || matName.includes('laminate')) return 0.35;
    if (matName.includes('leather') || matName.includes('da')) return 0.45;
    if (matName.includes('wood') || matName.includes('go') || matName.includes('timber')) return 0.55;
    if (matName.includes('fabric') || matName.includes('cloth') || matName.includes('vai')) return 0.70;
    if (matName.includes('carpet') || matName.includes('rug') || matName.includes('tham')) return 0.75;
    if (matName.includes('mattress') || matName.includes('nem') || matName.includes('bed')) return 0.70;
    if (matName.includes('stone') || matName.includes('brick')) return 0.65;
    return 0.50;
  }

  _reactToObject(visibleObj) {
    const ag = getAgeGroup(this.ageGroupId);
    const stats = this._getFatigueModifiedStats();
    const obj = visibleObj.object;
    
    let exposure = this.objectExposureMap.get(obj.id) || 0;
    this.objectExposureMap.set(obj.id, exposure + 1);
    let currentCuriosity = this.curiosityLevel * Math.pow(0.8, exposure);
    let currentFear = this.fearLevel;
    const objName = (obj.name || obj.id || '').toLowerCase();
    const isLoud = objName.includes('vacuum') || objName.includes('blender');
    const isMoving = obj.rigidBody && Math.hypot(obj.rigidBody.linvel().x, obj.rigidBody.linvel().z) > 0.1;
    const isCaregiver = objName.includes('adult') || objName.includes('parent');
    const isHazard = objName.includes('knife') || objName.includes('fire') || objName.includes('stove');
    if (isLoud) currentFear *= 2.0;
    if (isCaregiver) currentFear *= 0.1;
    if (isHazard) currentFear *= 1.5; 
    if (isMoving) currentCuriosity *= 1.5;
    const strangerPenalty = 1.0 - this._applyStrangerFear(obj, 1.0);
    currentFear += strangerPenalty;
    
    if (currentFear > currentCuriosity * 1.2) {
      const curPos = this.getPosition();
      const dx = curPos[0] - (visionSystem._getObjCenter(obj)[0]);
      const dz = curPos[2] - (visionSystem._getObjCenter(obj)[2]);
      const dist = Math.hypot(dx, dz) || 1;
      this.targetPosition = [curPos[0] + (dx/dist)*3, curPos[1], curPos[2] + (dz/dist)*3];
      this.state = 'MOVING';
      this._setEmotion('scared');
      this.currentBehavior = null;
      return;
    }

    const affordances = Array.isArray(obj.affordances) && obj.affordances.length > 0
      ? obj.affordances
      : this._inferAffordances(obj, objName, ag);
    const action = this._selectActionFromAffordances(affordances, obj, ag, stats);
    const willSucceed = Math.random() < stats.graspSuccess;
    if (willSucceed) {
      this.behaviorQueue = [{
        type: action, action: action, targetObjectId: obj.id,
        duration: this._getAffordanceDuration(action), completed: false,
      }];
      this._setEmotion(action === 'grab_mouth' ? 'mischievous' : 'curious');
    } else {
      const willDrop = Math.random() < stats.dropProb;
      this.behaviorQueue = [{ type: 'reach_fail', action: 'reach_up', duration: 1.5, completed: false }];
      if (willDrop) {
        this.behaviorQueue.push({ type: 'stumble', action: 'lose_balance', duration: 0.5, completed: false });
        this._setEmotion('frustrated');
        this._logRiskEvent('grasp_fail', this.getPosition(), { objectId: obj.id, severity: 2 });
        this._recordActionFail(obj.id, action);
      } else {
        this._setEmotion('curious');
      }
    }
    this.currentBehavior = null;
    this.state = 'IDLE';
  }

  _inferAffordances(obj, nameLower, ag) {
    const affordances = [];
    const dims = obj.boundingBox ? [
      obj.boundingBox.max[0] - obj.boundingBox.min[0],
      obj.boundingBox.max[1] - obj.boundingBox.min[1],
      obj.boundingBox.max[2] - obj.boundingBox.min[2],
    ] : null;
    const maxDim = dims ? Math.max(...dims) : 1;
    if (maxDim < 0.04) affordances.push('graspable');
    if (maxDim < 0.04 && (this.ageGroupId === 'infant' || this.ageGroupId === 'early_toddler')) {
      affordances.push('chokeable');
    }
    if (dims && dims[1] > 0.20 && dims[1] < 1.2 && ag?.canClimb &&
        !/curtain|drape|blind|mirror|glass/.test(nameLower)) {
      affordances.push('climbable');
    }
    if (/drawer|cabinet|dresser|chest|wardrobe|tu|ke/.test(nameLower)) affordances.push('pullable');
    if (/ball|toy|block|cube|box/.test(nameLower)) affordances.push('pushable');
    if (/knife|scissors|fork|pin|nail|razor|sharp/.test(nameLower)) affordances.push('sharp');
    if (/socket|outlet|plug|electric/.test(nameLower)) affordances.push('pokeable');
    if (affordances.length === 0) affordances.push('investigable');
    return affordances;
  }

  _selectActionFromAffordances(affordances, obj, ag, stats) {
    if (affordances.includes('chokeable'))   return 'grab_mouth';
    if (affordances.includes('sharp'))       return 'investigate';
    if (affordances.includes('pokeable') && (this.ageGroupId === 'infant' || this.ageGroupId === 'early_toddler')) {
      return 'investigate';
    }
    if (affordances.includes('graspable'))   return 'grab';
    if (affordances.includes('climbable') && ag?.canClimb) return 'climb_on';
    if (affordances.includes('pullable'))    return 'pull';
    if (affordances.includes('pushable'))    return 'push';
    return 'walk_to';
  }

  _getAffordanceDuration(action) {
    const durations = {
      grab_mouth: 4.0, grab: 3.0, climb_on: 5.0,
      pull: 3.5, push: 2.5, investigate: 5.0, walk_to: 4.0,
    };
    return durations[action] ?? 4.0;
  }

  _updateHandSensors() {
    if (!this.handSensors || !this.body) return;
    const pos = this.body.translation();
    const ag  = getAgeGroup(this.ageGroupId);
    
    // Tính toán vị trí sensor tay chạy tịnh tiến mượt mà theo ma trận cơ học tuyệt đối của Server
    physicsEngine.updateHandSensorPositions(
      this.handSensors.left, this.handSensors.right,
      pos, this.currentHeading, ag?.height ?? 0.8, ag?.anthropometry ?? null
    );
  }

  handleHandSensorIntersection(hand, sceneObject) {
    if (!sceneObject || !sceneObject.id) return;
    if (this.state === 'FALLING' || this.stunTimer > 0) return;
    const now = this.simTime;
    const lastTime = this._handInteractLog.get(sceneObject.id) || -Infinity;
    if (now - lastTime < 5.0) return;
    this._handInteractLog.set(sceneObject.id, now);
    if (sceneObject.type === 'floor' || sceneObject.type === 'wall' ||
        sceneObject.id === 'boundary_wall' || sceneObject.id === 'explicit_floor') return;
    const busyActions = ['grab', 'grab_mouth', 'climb_on', 'pull', 'push', 'hurt', 'crying'];
    if (this.currentBehavior && busyActions.includes(this.currentBehavior.action)) return;
    const ag      = getAgeGroup(this.ageGroupId);
    const objName = (sceneObject.name || sceneObject.id || '').toLowerCase();
    const affordances = Array.isArray(sceneObject.affordances) && sceneObject.affordances.length > 0
      ? sceneObject.affordances
      : this._inferAffordances(sceneObject, objName, ag);
    const stats  = this._getFatigueModifiedStats();
    const action = this._selectActionFromAffordances(affordances, sceneObject, ag, stats);
    const interactBehavior = {
      type: action, action: action, targetObjectId: sceneObject.id,
      duration: this._getAffordanceDuration(action), completed: false, _fromHandSensor: true,
    };
    if (this.behaviorQueue.length && !this._savedBehaviorQueue) {
      this._savedBehaviorQueue = [...this.behaviorQueue];
    }
    this.behaviorQueue = [interactBehavior, ...(this._savedBehaviorQueue || [])];
    this.currentBehavior = null;
    this.state = 'IDLE';
    this._logRiskEvent('hand_contact', this.getPosition(), { objectId: sceneObject.id, hand, action, affordances });
  }

  _getFatigueModifiedStats() {
    const ag = getAgeGroup(this.ageGroupId);
    const f = this.fatigueLevel;
    const coord = ag?.coordination || {};
    const kin = ag?.kinematics || {};
    return {
      reactionLatency: (coord.reactionLatency || 0.5) * (1 + f * 0.4),
      graspSuccess:    (coord.graspSuccessRate || 0.8) * (1 - f * 0.3),
      dropProb:        (coord.dropProbability || 0.1) * (1 + f * 0.5),
      turnRate:        (kin.turnRate || 2.0) * (1 - f * 0.2),
      fovH:            (ag?.vision?.fovHorizontal || 120) * (1 - f * 0.15),
    };
  }

  _normalizeAngle(angle) {
    while (angle > Math.PI)  angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  _applyStrangerFear(object, score) {
    const ag = getAgeGroup(this.ageGroupId);
    if (!ag?.fear) return score;
    const dims = object.boundingBox ? [
      object.boundingBox.max[0]-object.boundingBox.min[0],
      object.boundingBox.max[1]-object.boundingBox.min[1],
      object.boundingBox.max[2]-object.boundingBox.min[2],
    ] : null;
    if (!dims) return score;
    const objVol = dims[0] * dims[1] * dims[2];
    const childVol = (ag.height || 0.7) * 0.2 * 0.15;
    if (objVol > childVol * 8) score *= (1 - ag.fear.strangerFear);
    return score;
  }

  handleStartleEvent(soundLevel, sourcePosition) {
    const ag = getAgeGroup(this.ageGroupId);
    const fear = ag?.fear;
    if (!fear) return;
    const intensity = soundLevel / 100;
    if (Math.random() > fear.startleSensitivity * intensity) return;
    this.stunTimer = fear.startleFreezeDuration;
    this.velocity = [0, 0, 0];
    if (this.ageGroupId === 'infant') {
      this._setEmotion('scared');
      this.behaviorQueue = [{ action: 'crying_stand', duration: 3.0, completed: false }];
    } else if (this.ageGroupId === 'toddler') {
      if (Math.random() < 0.5) {
        const pos = this.getPosition();
        const dx = pos[0] - sourcePosition[0];
        const dz = pos[2] - sourcePosition[2];
        const d = Math.hypot(dx, dz) || 1;
        this.targetPosition = [pos[0]+(dx/d)*2, pos[1], pos[2]+(dz/d)*2];
        this.state = 'MOVING';
        this._setEmotion('scared');
      } else {
        this._setEmotion('crying');
        this.behaviorQueue = [{ action: 'crying_stand', duration: 2.0, completed: false }];
      }
    } else {
      this._setEmotion('surprised');
    }
    this.currentBehavior = null;
    this._logRiskEvent('startle', sourcePosition, { soundLevel });
  }

  _checkHeightFear(perceivedHeight) {
    const ag = getAgeGroup(this.ageGroupId);
    const fear = ag?.fear;
    if (!fear || perceivedHeight < fear.heightFearThreshold) return false;
    switch (fear.heightFearResponse) {
      case 'cry':
        this._setEmotion('scared');
        this.behaviorQueue = [{ action: 'crying_stand', duration: 2.0, completed: false }];
        this.currentBehavior = null;
        return true;
      case 'hesitate':
        this.stunTimer = 1.0; this._setEmotion('scared');
        return Math.random() < 0.5;
      case 'cautious':
        return Math.random() < 0.2;
      default:
        return false;
    }
  }

  _checkObjectPermanence(objectId) {
    const ag = getAgeGroup(this.ageGroupId);
    const cog = ag?.cognition;
    const mem = this.objectMemory.get(objectId);
    if (!mem) return { shouldContinue: false };
    const elapsed = Date.now()/1000 - mem.lastSeenTime;
    if (Math.random() > (cog?.objectPermanence || 1)) {
      this.objectMemory.delete(objectId);
      return { shouldContinue: false };
    }
    if (elapsed > (cog?.hiddenObjectMemory || 30)) {
      this.objectMemory.delete(objectId);
      return { shouldContinue: false, reason: 'memory_expired' };
    }
    return { shouldContinue: true, lastKnownPos: mem.lastSeenPos,
      confidence: Math.max(0, 1 - elapsed / (cog?.hiddenObjectMemory || 30)) };
  }

  _recordDangerZone(position, severity) {
    const ag = getAgeGroup(this.ageGroupId);
    const memDuration = ag?.cognition?.dangerMemoryDuration || 8;
    const maxZones = ag?.cognition?.maxDangerZones || 4;
    const key = `${Math.round(position[0]*2)}_${Math.round(position[2]*2)}`;
    this.dangerMap.set(key, { pos: [...position], severity, expiresAt: Date.now()/1000 + memDuration });
    if (this.dangerMap.size > maxZones) {
      const oldest = [...this.dangerMap.entries()].sort((a,b) => a[1].expiresAt - b[1].expiresAt)[0];
      this.dangerMap.delete(oldest[0]);
    }
  }

  _isNearDangerZone(targetPos) {
    const now = Date.now()/1000;
    for (const [key, zone] of this.dangerMap) {
      if (now > zone.expiresAt) { this.dangerMap.delete(key); continue; }
      const d = Math.hypot(targetPos[0]-zone.pos[0], targetPos[2]-zone.pos[2]);
      if (d < 0.35) return { dangerous: true, zone };
    }
    return { dangerous: false };
  }

  _recordActionFail(objectId, action) {
    const key = `${objectId}_${action}`;
    const entry = this.actionFailLog.get(key) || { count: 0 };
    entry.count++;
    this.actionFailLog.set(key, entry);
    const ag = getAgeGroup(this.ageGroupId);
    const threshold = ag?.cognition?.failBeforeStrategyChange || Infinity;
    if (entry.count >= threshold && threshold < Infinity) {
      this.actionFailLog.delete(key);
      return this._generateAlternativeStrategy(objectId, action, ag);
    }
    return null;
  }

  _generateAlternativeStrategy(objectId, failedAction, ag) {
    const strategyType = ag?.cognition?.strategyChangeType || 'random_alt';
    switch (strategyType) {
      case 'random_alt':
        return { type: 'redirect', action: 'walk_random', duration: 3.0 };
      case 'use_tool': {
        const tools = this.availableObjects.filter(obj => {
          const h = obj.boundingBox ? obj.boundingBox.max[1] - obj.boundingBox.min[1] : 0;
          return h > 0.2 && h < 0.6;
        });
        if (tools.length) {
          return { type: 'tool_use', sequence: [
            { action: 'walk_to', targetObjectId: tools[0].id, duration: 2.0, completed: false },
            { action: 'push', duration: 2.0, completed: false },
            { action: 'climb_on', duration: 2.0, completed: false },
          ]};
        }
        return { type: 'redirect', action: 'walk_random', duration: 3.0 };
      }
      case 'plan':
        return { type: 'redirect', action: 'look_around', duration: 2.0 };
      default:
        return null;
    }
  }

  _checkTantrumTrigger() {
    this.frustrationCount++;
    if (this.frustrationCount >= 3 && this.fatigueLevel > 0.6) {
      this.frustrationCount = 0;
      this._setEmotion('frustrated');
      this.behaviorQueue = [
        { action: 'crying_sit', duration: 3.0, completed: false },
        { action: 'get_up_slow', duration: 2.0, completed: false },
      ];
      this.currentBehavior = null;
      this.state = 'INTERACTING';
      const pos = this.getPosition();
      const fallDir = Math.random() * Math.PI * 2;
      this.pendingBounce = { nx: Math.cos(fallDir), nz: Math.sin(fallDir), force: 0.1 };
      this._logRiskEvent('tantrum', pos, { fatigue: this.fatigueLevel, severity: 3 });
      return true;
    }
    return false;
  }

  _logRiskEvent(type, position, details = {}) {
    riskAnalytics.recordEvent(type, position, {
      agentId: this.id, ageGroup: this.ageGroupId, ...details
    });
  }

  setRandomTarget(bounds) {
    if (!bounds) return;

    if (this.targetPosition && this.simTime < this.targetLockTimer) {
      return; 
    }

    const floorY = this._knownFloorY ?? bounds.min[1];
    const prof   = this._ageProfile;
    const validCheckFn = (x, z) => !this._isInsideSolidObstacle(x, z, bounds);

    // [FIX REALISM] Tính MAX_RANDOM_DIST dựa trên độ tuổi và thời gian mô phỏng
    // Tránh set target quá xa khiến nhân vật không kịp di chuyển trong 20-30s simulation
    const ag = getAgeGroup(this.ageGroupId);
    const avgSpeed = prof?.velocityProfile?.walk?.mean || prof?.velocityProfile?.crawl?.mean || 0.15;
    const SIM_TIME_BUDGET = 25; // Dự kiến 20-30s simulation, trừ buffer cho actions
    const ACTION_TIME_BUFFER = 3; // Buffer cho non-movement actions (reach, grab, etc.)
    const ACTUAL_MOVE_TIME = Math.max(5, SIM_TIME_BUDGET - ACTION_TIME_BUFFER);
    const MAX_RANDOM_DIST = avgSpeed * ACTUAL_MOVE_TIME * 0.8; // 80% để có margin
    const MIN_RANDOM_DIST = Math.max(1.0, avgSpeed * 3); // Ít nhất 3 giây di chuyển
    if (!this._distanceLogged) {
      console.log(`[Agent ${this.id}] Distance constraints: MIN=${MIN_RANDOM_DIST.toFixed(2)}m, MAX=${MAX_RANDOM_DIST.toFixed(2)}m (speed=${avgSpeed.toFixed(3)}m/s)`);
      this._distanceLogged = true;
    }

    if (this.boredomLevel > 0.6 && this._boundsInited) {
      const pos = this.getPosition();
      const explorationPt = this.explorationMap.getLeastVisitedCenter(pos, Math.min(1.5, MIN_RANDOM_DIST), validCheckFn);
      if (explorationPt) {
        this.targetPosition = [explorationPt[0], floorY, explorationPt[1]];
        this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
        this.boredomLevel = Math.max(0, this.boredomLevel - 0.3);
        return;
      }
    }

    if (this._boundsInited && Math.random() < 0.3) {
      const pos = this.getPosition();
      const minD = Math.max(MIN_RANDOM_DIST, (prof.explorationBias || 0.5) * 2.0);
      const maxD = MAX_RANDOM_DIST;
      const pt = this.explorationMap.getLeastVisitedCenter(pos, minD, validCheckFn);
      if (pt) {
        const distToPt = Math.hypot(pt[0] - pos[0], pt[1] - pos[2]);
        if (distToPt <= maxD) {
          this.targetPosition = [pt[0], floorY, pt[1]];
          this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
          return;
        }
      }
    }

    const solidObstacles = this._buildSolidObstacles(bounds);
    const pads = [0.45, 0.30, 0.15];
    const curPos = this.getPosition();

    for (const pad of pads) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]);
        const z = bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2]);
        
        // [FIX REALISM] Ensure distance is within realistic walking time
        const distToTarget = Math.hypot(x - curPos[0], z - curPos[2]);
        if (distToTarget < MIN_RANDOM_DIST || distToTarget > MAX_RANDOM_DIST) continue;

        let blocked = false;
        for (const obs of solidObstacles) {
          const bb = obs.boundingBox;
          if (x > bb.min[0] - pad && x < bb.max[0] + pad &&
              z > bb.min[2] - pad && z < bb.max[2] + pad) {
            blocked = true; break;
          }
        }
        if (!blocked) {
          this.targetPosition = [x, floorY, z];
          this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
          if (this.ageGroupId === 'infant' && distToTarget > 3.0) {
            console.log(`[Agent ${this.id}] Target set: ${distToTarget.toFixed(2)}m away, infant crawl time: ${(distToTarget/avgSpeed).toFixed(1)}s`);
          }
          return;
        }
      }
    }
    // [FIX REALISM] Fallback: chọn random target trong bounds nhưng vẫn respect MAX_RANDOM_DIST
    for (let fallbackAttempt = 0; fallbackAttempt < 10; fallbackAttempt++) {
      const x = bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]);
      const z = bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2]);
      const dist = Math.hypot(x - curPos[0], z - curPos[2]);
      if (dist >= MIN_RANDOM_DIST && dist <= MAX_RANDOM_DIST) {
        this.targetPosition = [x, floorY, z];
        this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
        return;
      }
    }
    // Last resort: near current position
    this.targetPosition = [
      curPos[0] + (Math.random() - 0.5) * MIN_RANDOM_DIST * 2,
      floorY,
      curPos[2] + (Math.random() - 0.5) * MIN_RANDOM_DIST * 2,
    ];
    this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
  }

  _buildSolidObstacles(bounds) {
    let roomW = 10;
    if (bounds) {
      roomW = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
    } else if (this._boundsInited) {
      roomW = Math.max(
        this.explorationMap.cols * this.explorationMap.cellSize,
        this.explorationMap.rows * this.explorationMap.cellSize
      );
    }
    const floorY = this._knownFloorY ?? (bounds?.min[1] ?? 0);
    return (this.availableObjects || []).filter(obj => {
      if (!obj.boundingBox) return false;
      const { min, max } = obj.boundingBox;
      const objH = max[1] - min[1];
      const objW = Math.max(max[0] - min[0], max[2] - min[2]);
      // Exclude room-spanning objects (walls, floor plane) — they're not obstacles
      if (objW > roomW * 0.75) return false;
      // Exclude very thin objects (rugs, decals) — walkable
      if (objH < 0.20) return false;
      // Exclude objects elevated above agent reach (ceiling fixtures, etc.)
      if (min[1] > floorY + 0.5) return false;
      return true;
    });
  }

  _isInsideSolidObstacle(x, z, bounds) {
    for (const obs of this._buildSolidObstacles(bounds)) {
      const bb = obs.boundingBox;
      if (x > bb.min[0] - 0.15 && x < bb.max[0] + 0.15 &&
          z > bb.min[2] - 0.15 && z < bb.max[2] + 0.15) return true;
    }
    return false;
  }

  _updateBoredom(deltaTime, curPos) {
    const prof = this._ageProfile;
    const boredomRate = prof.boredomRate || 0.03;
    const movedDist = Math.hypot(
      curPos[0] - (this.previousPosition[0] ?? curPos[0]),
      curPos[2] - (this.previousPosition[2] ?? curPos[2])
    );
    if (movedDist < 0.02) {
      this.boredomLevel = Math.min(1.0, this.boredomLevel + boredomRate * deltaTime * 2);
    } else {
      this.boredomLevel = Math.max(0, this.boredomLevel - boredomRate * deltaTime * 0.5);
    }

    if (!this.burstState && this.state === 'MOVING') {
      const burstP = (prof.burstProb || 0) * deltaTime;
      if (Math.random() < burstP) {
        const dur = prof.burstDuration
          ? prof.burstDuration[0] + Math.random() * (prof.burstDuration[1] - prof.burstDuration[0])
          : 1.5;
        this.burstState = { endTime: this.simTime + dur, speedMult: prof.burstSpeedMult || 1.5 };
      }
    }
    if (this.burstState && this.simTime >= this.burstState.endTime) {
      this.burstState = null;
    }

    const dirChangeP = (prof.dirChangeProb || 0) * deltaTime;
    if (this.state === 'MOVING' && this.targetPosition && Math.random() < dirChangeP) {
      if (this.simTime > this.targetLockTimer) {
        this.targetPosition = null;
      }
    }

    if (this.simTime > this.pauseUntil && this.state === 'MOVING') {
      const [pMin, pMax] = prof.pauseInterval || [5, 10];
      const pauseCheckP = deltaTime / (pMin + Math.random() * (pMax - pMin));
      if (Math.random() < pauseCheckP) {
        const [dMin, dMax] = prof.pauseDuration || [0.5, 1.5];
        this.pauseUntil = this.simTime + dMin + Math.random() * (dMax - dMin);
        this._setEmotion('curious');
      }
    }
  }

  loadBehaviorPolicy(behaviors) {
    this.behaviorQueue = behaviors.map(b => {
      // [REALISM FIX] Normalize behavior durations on load
      const normalized = this._adjustBehaviorDuration({
        ...b,
        completed: false,
        sequence: b.sequence ? b.sequence.map(a => ({ ...a, completed: false })) : []
      });
      return normalized;
    });
  }

  startRareEventChain(chain) {
    this.participatingInRareEvent = true;
    this.rareEventChain           = chain;
    this.rareEventStep            = 0;
    this.behaviorTimer            = 0;
  }

  getPosition() {
    if (!this.body) return this.previousPosition || [0, 0, 0];
    const t = this.body.translation();
    if (isNaN(t.x) || isNaN(t.y) || isNaN(t.z)) {
      return this.previousPosition || [0, 0, 0];
    }

    return [t.x, t.y - this._agentHalfH, t.z];
  }

  getVelocity() {
    // Include _vertVel (integrated gravity) in the magnitude.
    // this.velocity[1] is always 0 (XZ locomotion only).
    // Fall injuries need the actual Y component — without _vertVel
    // a 0.5m fall records 0 m/s at contact → injury score = 0 (false negative).
    const [vx, , vz] = this.velocity;
    const vy = this._vertVel ?? 0;
    return Math.sqrt(vx * vx + vy * vy + vz * vz);
  }

  getVelocityVector() {
    const [vx, , vz] = this.velocity;
    const vy = this._vertVel ?? 0;
    return [vx, vy, vz];
  }

  getStatus() {
    return {
      id: this.id, ageGroupId: this.ageGroupId, state: this.state,
      position: this.getPosition(), velocity: this.getVelocity(),
      velocityVector: this.getVelocityVector(),
      totalDistance: this.totalDistance, fatigue: this.fatigueLevel,
      gaitStability: this.gaitStability,
      behaviorsCompleted: this.behaviorQueue?.filter(b => b.completed).length ?? 0,
      animation: this.currentAnimation ?? 'idle',
    };
  }

  getAgeGroupData() { return getAgeGroup(this.ageGroupId) || { speed: 0.8 }; }

  getSampledTrajectory(maxPts = 30) {
    if (this.trajectory.length <= maxPts) return [...this.trajectory];
    const step = Math.floor(this.trajectory.length / maxPts);
    const out  = [];
    for (let i = 0; i < this.trajectory.length; i += step) {
      out.push([...this.trajectory[i]]);
      if (out.length >= maxPts) break;
    }
    return out;
  }

  cleanup() {
    if (this.controller && this.world) {
      try { this.world.removeCharacterController(this.controller); } catch (_) {}
    }
    if (this.handSensors && this.world) {
      try { this.world.removeRigidBody(this.handSensors.left.body);  } catch (_) {}
      try { this.world.removeRigidBody(this.handSensors.right.body); } catch (_) {}
    }
    this.controller    = null;
    this.handSensors   = null;
    this.trajectory    = [];
    this.behaviorQueue = [];
    this.availableObjects = [];
    this.explorationMap.cells.clear();
    this._boundsInited = false;
    this.burstState    = null;
    this.circleState   = null;
    this._cachedSpeed  = null;
  }
}

export default Agent;