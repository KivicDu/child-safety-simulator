// agent.js — v3
// Changes vs v2:
//  • moveTowardsTarget: uses physicsEngine.moveAgentWithController (anti-clip)
//    instead of setNextKinematicTranslation directly
//  • Character controller created per-agent in constructor, stored as this.controller
//  • spawnY no longer used as Y lock — floor enforced by KCC + raycast in simulationController
//  • All v2 schema changes (wadingIn, recovery, emotion injection) preserved

import { getAgeGroup } from '../config/ageGroups.js';
import physicsEngine from './physicsEngine.js';

export const WADING_SCALE_FACTOR = 0.6;
const MIN_WADING_SPEED  = 0.05;
const RECOVERY_DURATION = 1.5;

class Agent {
  constructor(id, startPosition, rigidBody, ageGroupId, world = null) {
    this.id         = id;
    this.body       = rigidBody;
    this.ageGroupId = ageGroupId;
    this.world      = world;  // stored so controller can be used in moveTowardsTarget

    // Init from Age Group early for physics
    const groupData = getAgeGroup(this.ageGroupId);
    if (groupData) {
      this.gaitStability = groupData.gaitStability || 0.8;
      this.anthropometry = groupData.anthropometry || null;
    }

    // ── Character controller (anti-clip) ─────────────────────────────────
    // Created once per agent; used by moveAgentWithController every frame.
    this.controller = null;
    // FIX CLIPPING: khởi tạo this.collider từ body để KCC có target collider
    // Caller (simulationController) nên set agent.collider sau khi tạo physics body.
    // Để không bị null hoàn toàn, tạo placeholder và ghi đè sau.
    this.collider = null;
    if (world && physicsEngine.rapier) {
      try {
        let kccOffset = 0.05;
        if (this.ageGroupId === 'infant') kccOffset = 0.15;
        else if (this.ageGroupId === 'toddler') kccOffset = 0.10;
        
        let maxStepHeight = 0.10;
        if (this.ageGroupId === 'infant') maxStepHeight = 0.05;
        else if (this.ageGroupId === 'toddler') maxStepHeight = 0.10;
        else maxStepHeight = 0.20;
        
        this.controller = physicsEngine.createCharacterController(world, kccOffset, maxStepHeight);
      } catch (e) {
        console.warn(`[Agent ${id}] Could not create character controller:`, e.message);
      }
    }

    // ── Trajectory ───────────────────────────────────────────────────────
    this.trajectory            = [];
    this.MAX_TRAJECTORY_POINTS = 600;
    this.trajectorySampleRate  = 1;
    this.frameCount            = 0;

    // ── State & Behavior ─────────────────────────────────────────────────
    this.state           = 'IDLE';
    this.emotion         = 'neutral';
    this.behaviorQueue   = [];
    this.currentBehavior = null;
    this.behaviorTimer   = 0;

    // ── Rare Events ──────────────────────────────────────────────────────
    this.participatingInRareEvent = false;
    this.rareEventChain           = null;
    this.rareEventStep            = 0;

    // ── Movement ─────────────────────────────────────────────────────────
    this.targetPosition    = null;
    this.velocity          = [0, 0, 0];
    this.previousPosition  = [...startPosition];
    this.spawnY            = startPosition[1];   // kept only for free-fall targetY
    this.availableObjects  = [];

    // ── Research-Based Stats ─────────────────────────────────────────────
    this.fatigueLevel    = 0.0;
    this.gaitStability   = 1.0;
    this.lastStumbleTime = 0;

    // ── Wading (v2) ───────────────────────────────────────────────────────
    this.wadingPenalty  = 0.0;
    this.wadingObjectId = null;

    // ── Recovery (v2) ────────────────────────────────────────────────────
    this.recoveryTimer = 0;

    // (Moved getAgeGroup up to apply early physics constraints)

    // ── Action Log ────────────────────────────────────────────────────────
    this.actionLog = [];

    // ── Metrics ───────────────────────────────────────────────────────────
    this.totalDistance = 0;
    this.stateHistory  = new Map();

    // ── Physics ───────────────────────────────────────────────────────────
    this.fallState     = null;
    this.stunTimer     = 0;
    this.pendingBounce = null;
  }

  // ── ActionLog recording ───────────────────────────────────────────────────
  recordPosition(position) {
    this.frameCount++;
    if (this.frameCount % this.trajectorySampleRate !== 0) return;

    this.trajectory.push(position.map(v => Math.round(v * 100) / 100));

    const entry = {
      s: this.state,
      a: this.currentBehavior?.action || this.currentBehavior?.type || 'idle',
      v: Math.round(Math.hypot(this.velocity[0], this.velocity[2]) * 100) / 100,
    };
    if (this.emotion && this.emotion !== 'neutral')    entry.e        = this.emotion;
    if (this.wadingObjectId)                           { entry.wadingIn = this.wadingObjectId; entry.a = 'wade'; }
    if (this.recoveryTimer > 0)                        entry.recovery  = true;

    this.actionLog.push(entry);

    if (this.trajectory.length > this.MAX_TRAJECTORY_POINTS) {
      this.trajectory.shift();
      this.actionLog.shift();
    }
  }

  // ── Gaussian helper ───────────────────────────────────────────────────────
  _gaussianRandom(mean, stdDev) {
    const u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev + mean;
  }

  getRealisticVelocity(actionType) {
    const ag = getAgeGroup(this.ageGroupId);
    if (!ag?.velocityProfile) return 1.0;
    const prof = ag.velocityProfile[actionType] || ag.velocityProfile.walk || ag.velocityProfile.crawl
              || { mean: ag.speed || 0.5, stdDev: (ag.speed || 0.5) * 0.15 };
    let speed = this._gaussianRandom(prof.mean, prof.stdDev);
    speed *= (1.0 - this.fatigueLevel * 0.4);
    if (this.wadingPenalty > 0) {
      speed *= (1.0 - this.wadingPenalty);
      speed  = Math.max(MIN_WADING_SPEED, speed);
    }
    return Math.max(MIN_WADING_SPEED, speed);
  }

  // ── Emotion helpers ───────────────────────────────────────────────────────
  _setEmotion(e)  { this.emotion = e; }
  _clearEmotion() { this.emotion = 'neutral'; }

  // ── Attraction scanning ───────────────────────────────────────────────────
  scanForAttractions(bounds) {
    if (this.participatingInRareEvent) return;
    // FIX-P1: Increased from 5% to 15% so agents interact more with objects
    if (Math.random() > 0.15) return;
    const ag = getAgeGroup(this.ageGroupId);
    if (!ag || !this.availableObjects.length) return;

    let best = null, maxScore = 0;
    const cur = this.getPosition();
    let fwd = [...this.velocity], spd = Math.hypot(fwd[0], fwd[2]);
    if (spd < 0.01) fwd = [0, 0, 0]; else { fwd[0] /= spd; fwd[2] /= spd; }

    for (const obj of this.availableObjects) {
      if (!obj.attractionByAge) continue;
      let score = obj.attractionByAge[this.ageGroupId] || 0;
      if (!obj.boundingBox) continue;

      const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
      const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
      const dx = cx - cur[0], dz = cz - cur[2];
      const dist = Math.hypot(dx, dz);
      if (dist > 5.0) continue;
      if (spd > 0.1) {
        const dot = fwd[0] * (dx/dist) + fwd[2] * (dz/dist);
        if (dot < 0.5) continue;
      }
      if (this.ageGroupId === 'infant' || this.ageGroupId === 'toddler') {
        const c2 = obj.properties?.material?.baseColor;
        if (c2 && (c2[0] > 0.8 || c2[2] > 0.8)) score *= 1.5;
      }
      const dims = [
        obj.boundingBox.max[0]-obj.boundingBox.min[0],
        obj.boundingBox.max[1]-obj.boundingBox.min[1],
        obj.boundingBox.max[2]-obj.boundingBox.min[2],
      ];
      if (Math.max(...dims) < 0.04 && (this.ageGroupId === 'infant' || this.ageGroupId === 'toddler')) {
        score *= 2.0; obj.isChokeHazard = true;
      }
      if (score > 0.6 && score > maxScore) { maxScore = score; best = obj; }
    }

    if (best && Math.random() < maxScore * 0.3) {
      const act = best.isChokeHazard ? 'mouth_test' : 'investigate';
      this.behaviorQueue = [{ type: act, action: act === 'mouth_test' ? 'grab_mouth' : 'walk_to', targetObjectId: best.id, duration: 5.0, completed: false }];
      this.currentBehavior = null;
      this.state = 'IDLE';
      this._setEmotion('mischievous');
    }
  }

  // ── Update loop ───────────────────────────────────────────────────────────
  update(deltaTime, colliders, otherAgents, bounds) {
    if (!this.body) return;
    this.availableObjects = colliders || [];

    const cur = this.getPosition();
    this.recordPosition(cur);

    const dx = cur[0] - this.previousPosition[0];
    const dy = cur[1] - this.previousPosition[1];
    const dz = cur[2] - this.previousPosition[2];
    this.velocity      = [dx/deltaTime, dy/deltaTime, dz/deltaTime];
    this.totalDistance += Math.sqrt(dx*dx + dy*dy + dz*dz);

    if (this.state === 'MOVING')      this.fatigueLevel = Math.min(1.0, this.fatigueLevel + deltaTime * 0.01);
    else if (this.state === 'IDLE')   this.fatigueLevel = Math.max(0.0, this.fatigueLevel - deltaTime * 0.05);

    if (this.recoveryTimer > 0) {
      this.recoveryTimer = Math.max(0, this.recoveryTimer - deltaTime);
      if (this.recoveryTimer === 0 && this.emotion === 'crying') this._clearEmotion();
    }

    if (this.wadingPenalty > 0) {
      this.wadingPenalty = Math.max(0, this.wadingPenalty - deltaTime * 2.0);
      if (this.wadingPenalty === 0) this.wadingObjectId = null;
    }

    this.scanForAttractions(bounds);
    this.updateBehavior(deltaTime, colliders, bounds);
    this.previousPosition = [...cur];
  }

  updateBehavior(deltaTime, colliders, bounds) {
    // Apply queued bounce (outside Rapier drain loop)
    if (this.pendingBounce && this.body) {
      const pos  = this.body.translation();
      const newX = pos.x + this.pendingBounce.nx * this.pendingBounce.force;
      const newZ = pos.z + this.pendingBounce.nz * this.pendingBounce.force;
      if (Number.isFinite(newX) && Number.isFinite(newZ)) {
        this.body.setNextKinematicTranslation({ x: newX, y: pos.y, z: newZ });
      }
      this.pendingBounce = null;
    }

    if (this.stunTimer > 0) { this.stunTimer -= deltaTime; return; }
    if (this.fallState && this.body) { this.executeAction({ action: 'free_fall' }, deltaTime, colliders, bounds); return; }
    if (this.participatingInRareEvent && this.rareEventChain) { this.executeRareEventStep(deltaTime, colliders, bounds); return; }

    if (this.currentBehavior) {
      this.behaviorTimer += deltaTime;
      if (this.behaviorTimer >= this.currentBehavior.duration) {
        this.currentBehavior.completed = true; this.currentBehavior = null;
        this.behaviorTimer = 0; this.state = 'IDLE';
      } else {
        this.executeAction(this.currentBehavior, deltaTime, colliders, bounds);
      }
    } else if (this.state === 'MOVING' && this.targetPosition) {
      this.moveTowardsTarget(deltaTime, 'walk');
      if (!this.targetPosition) this.state = 'IDLE';
    } else {
      this.pickNextBehavior(deltaTime, bounds);
      if (this.state === 'MOVING' && this.targetPosition) this.moveTowardsTarget(deltaTime, 'walk');
    }
  }

  pickNextBehavior(deltaTime, bounds) {
    // FIX-P1: Complete rewrite — old code never assigned flat behaviors to currentBehavior
    if (!this.behaviorQueue?.length) {
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }

    // Find next uncompleted behavior
    let next = this.behaviorQueue.find(b => !b.completed);

    // If all behaviors are done, reset and cycle
    if (!next) {
      this.behaviorQueue.forEach(b => {
        b.completed = false;
        if (b.sequence) b.sequence.forEach(a => { a.completed = false; });
      });
      // Walk to random target between behavior cycles
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }

    // Case 1: Behavior has a sequence of sub-actions
    if (next.sequence && next.sequence.length > 0) {
      const act = next.sequence.find(a => !a.completed);
      if (act) {
        // FIX-P1: Resolve target for sub-actions like {action:'crawl', target:'object'}
        this._resolveActionTarget(act, next, bounds);
        this.currentBehavior = act;
        this.behaviorTimer = 0;
      } else {
        // All sub-actions completed — mark parent as completed
        next.completed = true;
        // Walk to random target briefly before next behavior
        this.state = 'MOVING';
        this.setRandomTarget(bounds);
      }
      return;
    }

    // Case 2: Behavior is a flat action (no sequence)
    // — This was the critical bug: these were NEVER executed before!
    this._resolveActionTarget(next, next, bounds);
    this.currentBehavior = next;
    this.behaviorTimer = 0;
  }

  // FIX-P1: Resolve target position for an action based on targetObjectId or target type
  _resolveActionTarget(action, parentBehavior, bounds) {
    const targetId = action.targetObjectId || parentBehavior?.targetObjectId;
    const targetType = action.target || parentBehavior?.targetTypes?.[0];

    // If action already has a target, or is a stationary action, skip
    if (this.targetPosition) return;
    const stationaryActions = ['grab', 'grab_mouth', 'reach_up', 'pull', 'pull_to_stand',
      'open_drawer', 'pause', 'look_around', 'lose_balance', 'climb_on'];
    if (stationaryActions.includes(action.action)) return;

    // Try to find a specific target object
    if (targetId && this.availableObjects.length > 0) {
      const obj = this.availableObjects.find(c =>
        c.id === targetId || c.name?.toLowerCase().includes(targetId.toLowerCase())
      );
      if (obj?.boundingBox) {
        this.targetPosition = [
          (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2,
          obj.boundingBox.min[1],
          (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2,
        ];
        return;
      }
    }

    // Try to find by target type (e.g. 'furniture', 'cord', 'object')
    if (targetType && targetType !== 'random' && this.availableObjects.length > 0) {
      const cur = this.getPosition();
      let bestObj = null, bestDist = Infinity;
      for (const obj of this.availableObjects) {
        if (!obj.boundingBox) continue;
        const name = (obj.name || obj.id || '').toLowerCase();
        if (name.includes(targetType.toLowerCase()) || targetType === 'object') {
          const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
          const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
          const d = Math.hypot(cx - cur[0], cz - cur[2]);
          if (d < bestDist && d < 8.0) { bestDist = d; bestObj = obj; }
        }
      }
      if (bestObj) {
        this.targetPosition = [
          (bestObj.boundingBox.min[0] + bestObj.boundingBox.max[0]) / 2,
          bestObj.boundingBox.min[1],
          (bestObj.boundingBox.min[2] + bestObj.boundingBox.max[2]) / 2,
        ];
        return;
      }
    }

    // Fallback: random position
    this.setRandomTarget(bounds);
  }

  executeAction(action, deltaTime, colliders, bounds) {
    if (!this.body) return;
    const t = action.action || action.type;

    switch (t) {
      case 'walk_to':
      case 'investigate':
        this.state = 'MOVING';
        if (action.targetObjectId || action.target) {
          const id  = action.targetObjectId || action.target;
          const obj = colliders.find(c => c.id === id || c.name?.toLowerCase().includes(id.toLowerCase()));
          if (obj?.boundingBox) {
            this.targetPosition = [
              (obj.boundingBox.min[0]+obj.boundingBox.max[0])/2,
               obj.boundingBox.min[1],
              (obj.boundingBox.min[2]+obj.boundingBox.max[2])/2,
            ];
          } else if (!this.targetPosition) this.setRandomTarget(bounds);
        } else if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'walk');
        break;

      case 'walk_random':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'walk');
        break;

      case 'crawl':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'crawl');
        break;

      case 'run': case 'run_unstable':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'run');
        break;

      case 'lunge':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'lunge');
        break;

      case 'trip': case 'stumble': case 'fall_forward': {
        this.state = 'INTERACTING';
        const pos = this.body.translation();
        const h   = pos.y - this.spawnY;
        if (h > 0.15) {
          this.fallState = { startY: pos.y, targetY: this.spawnY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        } else {
          if (this.behaviorTimer < 0.3) {
            const surge = 1.0 * deltaTime, angle = Math.random() * Math.PI * 2;
            this.body.setNextKinematicTranslation({
              x: pos.x + Math.cos(angle)*surge,
              y: Math.max(this.spawnY-0.2, pos.y - Math.sin(this.behaviorTimer*10)*0.1),
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
          const h = Math.max(0.1, pos.y - this.spawnY);
          this.fallState = { startY: pos.y, targetY: this.spawnY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        }
        this.fallState.elapsed += deltaTime;
        const t2       = Math.min(this.fallState.elapsed / this.fallState.duration, 1.0);
        const newY     = this.fallState.startY - this.fallState.fallHeight * t2 * t2;
        this.body.setNextKinematicTranslation({ x: pos.x, y: Math.max(this.spawnY, newY), z: pos.z });
        if (t2 >= 1.0) {
          this.fallState = null; this.state = 'IDLE';
          this.recoveryTimer = RECOVERY_DURATION;
          this._setEmotion('crying');
        }
        break;
      }

      // FIX-H4: Interaction actions — agent stays in place but records action for frontend animation
      case 'grab': case 'grab_mouth':
        this.state = 'INTERACTING';
        // Agent stays still, but emotion may change (mischievous for grab_mouth)
        if (t === 'grab_mouth') this._setEmotion('mischievous');
        break;

      case 'reach_up': {
        this.state = 'INTERACTING';
        // Slight upward stretch — agent rises on tiptoes (small Y bump)
        const pos_r = this.body.translation();
        const stretchY = Math.sin(this.behaviorTimer * 2) * 0.03;
        if (Number.isFinite(pos_r.y + stretchY)) {
          this.body.setNextKinematicTranslation({ x: pos_r.x, y: pos_r.y + stretchY, z: pos_r.z });
        }
        break;
      }

      case 'open_drawer': case 'pull': case 'pull_to_stand': {
        this.state = 'INTERACTING';
        // Pull back slightly — agent leans backward
        const pos_p = this.body.translation();
        const pullBack = Math.sin(this.behaviorTimer * 1.5) * 0.02 * deltaTime;
        if (Number.isFinite(pos_p.z + pullBack)) {
          this.body.setNextKinematicTranslation({ x: pos_p.x, y: pos_p.y, z: pos_p.z + pullBack });
        }
        break;
      }

      case 'climb_on': {
        // FIX-P2: Check if there's actually something climbable within 1.5m
        const pos_c  = this.body.translation();
        const curPos = [pos_c.x, pos_c.y, pos_c.z];
        let hasClimbable = false;
        for (const obj of (colliders || [])) {
          if (!obj.boundingBox) continue;
          const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
          const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
          const objHeight = obj.boundingBox.max[1] - obj.boundingBox.min[1];
          const d = Math.hypot(cx - curPos[0], cz - curPos[2]);
          // Climbable = within 1.5m AND height > 0.2m AND height < 2m
          if (d < 1.5 && objHeight > 0.2 && objHeight < 2.0) { hasClimbable = true; break; }
        }
        if (!hasClimbable) {
          // Nothing to climb — convert to look_around
          this.state = 'IDLE';
          break;
        }

        this.state = 'INTERACTING';
        const gd   = getAgeGroup(this.ageGroupId);
        const fail = gd ? (1 - gd.gaitStability) * 0.3 : 0.1;
        if (Math.random() < fail && pos_c.y > this.spawnY + 0.1) {
          const h = pos_c.y - this.spawnY;
          this.fallState = { startY: pos_c.y, targetY: this.spawnY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        } else {
          // FIX-H1: Use realistic climb speed from age group velocity profile
          const climbSpeed = this.getRealisticVelocity('climb');
          this.body.setNextKinematicTranslation({
            x: pos_c.x,
            y: pos_c.y + climbSpeed * deltaTime,
            z: pos_c.z
          });
        }
        break;
      }

      case 'pause': case 'look_around':
        this.state = 'IDLE';
        break;

      // FIX-P2: climb_on must check if there's actually something to climb nearby
      // If nothing climbable within 1.5m, convert to 'look_around' instead
      default: {
        // Actions like 'reach', 'swing_open', etc. that fall through — treat as walk
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, action === 'crawl' ? 'crawl' : 'walk');
      }
    }
  }

  // ── Movement Kernel — Anti-Clip via KCC ───────────────────────────────────
  moveTowardsTarget(deltaTime, actionType = 'walk') {
    if (!this.targetPosition || !this.body) return;

    const cur  = this.getPosition();
    const dx   = this.targetPosition[0] - cur[0];
    const dz   = this.targetPosition[2] - cur[2];
    const dist = Math.sqrt(dx*dx + dz*dz);
    const arr  = this._getArrivalThreshold(actionType);
    if (dist < arr) {
      this.targetPosition = null;
      if (this.emotion === 'mischievous' && Math.random() < 0.2) this._setEmotion('excited');
      else this._clearEmotion();
      return;
    }

    const speed = this.getRealisticVelocity(actionType);

    // Stumble check
    const risk = 1.1 - this.gaitStability;
    const sf   = speed > 0.8 ? 1.5 : 1.0;
    if (Math.random() < 0.001 * risk * sf) {
      this.behaviorQueue = [{ type: 'stumble', action: 'fall_forward', duration: 1.5, completed: false }];
      this.currentBehavior = null;
      return;
    }

    const moveX = (dx/dist) * speed * deltaTime;
    const moveZ = (dz/dist) * speed * deltaTime;

    // §Fix: use character controller so agent slides along walls instead of clipping
    if (this.controller && this.world) {
      // FIX: Use TORSO collider (not legs!) — legs are at floor level and
      // KCC computeColliderMovement collides with the floor, blocking all movement
      const kccCollider = this.collider ?? this.colliders?.torso ?? this.colliders?.legs ?? null;
      if (kccCollider) {
        const corrected = physicsEngine.moveAgentWithController(
          this.world, this.controller, this.body, kccCollider,
          { x: moveX, y: -0.05, z: moveZ },
          deltaTime
        );

        // FIX: If KCC computes near-zero movement but we wanted to move,
        // fall back to direct translation (KCC might be stuck on geometry)
        const correctedDist = Math.hypot(corrected?.x || 0, corrected?.z || 0);
        const desiredDist = Math.hypot(moveX, moveZ);
        if (correctedDist < desiredDist * 0.1 && desiredDist > 0.001) {
          // KCC blocked — use direct translation as fallback
          const pos = this.body.translation();
          if (Number.isFinite(pos.x + moveX) && Number.isFinite(pos.z + moveZ)) {
            this.body.setNextKinematicTranslation({ x: pos.x + moveX, y: pos.y, z: pos.z + moveZ });
          }
        }
        return;
      }
    }

    // Fallback: direct translation (when controller not available)
    const pos = this.body.translation();
    if (Number.isFinite(pos.x + moveX) && Number.isFinite(pos.z + moveZ)) {
      this.body.setNextKinematicTranslation({ x: pos.x + moveX, y: pos.y, z: pos.z + moveZ });
    }
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

  // ── Collision / Intersection handlers ────────────────────────────────────
  handleIntersection(softObj) {
    if (!this.body) return;
    const r = typeof softObj.materialResistance === 'number' ? softObj.materialResistance : 0.60;
    this.wadingPenalty  = Math.min(1.0, r * WADING_SCALE_FACTOR);
    this.wadingObjectId = softObj.id || null;
  }

  handleCollision(contactNormal, severity) {
    if (!this.body) return;
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
    this.state         = 'IDLE';
    this.velocity      = [0, 0, 0];
    if (severity > 20) this._setEmotion('crying');
  }

  // ── Rare events ───────────────────────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────
  setRandomTarget(bounds) {
    if (!bounds) return;
    this.targetPosition = [
      bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]),
      bounds.min[1],
      bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2]),
    ];
  }

  loadBehaviorPolicy(behaviors) {
    this.behaviorQueue = behaviors.map(b => ({
      ...b, completed: false,
      sequence: b.sequence ? b.sequence.map(a => ({ ...a, completed: false })) : [],
    }));
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
    return [t.x, t.y, t.z];
  }

  getVelocity() {
    const [vx, vy, vz] = this.velocity;
    return Math.sqrt(vx*vx + vy*vy + vz*vz);
  }

  getStatus() {
    return {
      id: this.id, ageGroupId: this.ageGroupId, state: this.state,
      position: this.getPosition(), velocity: this.getVelocity(),
      totalDistance: this.totalDistance, fatigue: this.fatigueLevel,
      gaitStability: this.gaitStability,
      behaviorsCompleted: this.behaviorQueue?.filter(b => b.completed).length ?? 0,
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
    // Cleanup character controller to avoid memory leak
    if (this.controller && this.world) {
      try { this.world.removeCharacterController(this.controller); } catch (_) {}
    }
    this.controller    = null;
    this.trajectory    = [];
    this.behaviorQueue = [];
    this.availableObjects = [];
  }
}

export default Agent;