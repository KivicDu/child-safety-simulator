// agent.js — v3
// Changes vs v2:
//  • moveTowardsTarget: uses physicsEngine.moveAgentWithController (anti-clip)
//    instead of setNextKinematicTranslation directly
//  • Character controller created per-agent in constructor, stored as this.controller
//  • spawnY no longer used as Y lock — floor enforced by KCC + raycast in simulationController
//  • All v2 schema changes (wadingIn, recovery, emotion injection) preserved

import { getAgeGroup } from '../config/ageGroups.js';
import physicsEngine from './physicsEngine.js';
import { visionSystem } from './visionSystem.js';
import { riskAnalytics } from './riskAnalytics.js';

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

    // ── Perception → Decision Pipeline (v4: vision, reaction latency) ────
    this.perceptionQueue = [];       // {object, saliencyScore, seenAt}
    this.reactionTimer   = 0;        // countdown from reactionLatency
    this.pendingReaction  = null;     // object waiting for reaction

    // ── Object Permanence Memory (Piaget) ────────────────────────────────
    this.objectMemory = new Map();   // objectId → {lastSeenPos, lastSeenTime}

    // ── Heading & Kinematics ─────────────────────────────────────────────
    this.currentHeading     = Math.random() * Math.PI * 2; // radians
    this.lastDirChangeTime  = 0;

    // ── Learning & Short-term Memory ─────────────────────────────────────
    this.dangerMap      = new Map(); // posKey → {pos, severity, expiresAt}
    this.actionFailLog  = new Map(); // "objId_action" → {count}
    this.frustrationCount = 0;

    // ── Anti-stuck detection ──────────────────────────────────────────────
    this.stuckCounter  = 0;
    this.lastMovePos   = [...startPosition];
    // FIX STATE LOOP: idle cooldown prevents instant re-targeting after stuck escape,
    // breaking the MOVING → stuck 60f → IDLE → MOVING → stuck loop.
    this.idleCooldown  = 0;

    // ── Simulation Timer ──────────────────────────────────────────────────
    this.simTime       = 0;
  }

  // ── Physics Utility ───────────────────────────────────────────────────────
  setSafeTranslation(newPos) {
    if (!this.body) return;
    if (Number.isFinite(newPos.x) && Number.isFinite(newPos.y) && Number.isFinite(newPos.z)) {
      this.body.setNextKinematicTranslation(newPos);
    } else {
      console.warn(`[Agent ${this.id}] Guarded NaN in setSafeTranslation:`, newPos);
    }
  }

  // ── ActionLog recording ───────────────────────────────────────────────────
  recordPosition(position) {
    this.frameCount++;
    if (this.frameCount % this.trajectorySampleRate !== 0) return;

    this.trajectory.push(position.map(v => Math.round(v * 100) / 100));

    // FIX BUG #9: When agent is MOVING with no currentBehavior (wander), log 'walk' not 'idle'.
    // Previously entry.a was always 'idle' during wander — causing wrong animation in Canvas3D.
    const wanderAction = (this.state === 'MOVING' && !this.currentBehavior) ? 'walk' : null;
    const entry = {
      s: this.state,
      a: wanderAction || this.currentBehavior?.action || this.currentBehavior?.type || 'idle',
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

  // ── Attraction scanning — Vision-based with Saliency Map ──────────────────
  scanForAttractions(bounds) {
    if (this.participatingInRareEvent) return;
    if (Math.random() > 0.15) return;
    const ag = getAgeGroup(this.ageGroupId);
    if (!ag || !this.availableObjects.length) return;

    // Step 1: Vision-based scan with FOV + saliency scoring
    const visible = visionSystem.scanVisibleObjects(this, this.availableObjects);
    if (!visible.length) return;

    // Step 2: Update object permanence memory
    const now = Date.now() / 1000;
    for (const v of visible) {
      this.objectMemory.set(v.object.id, {
        lastSeenPos: visionSystem._getObjCenter(v.object),
        lastSeenTime: now,
      });
    }
    // Forget old objects (limited memory by age)
    const memoryLimit = ag.cognition?.hiddenObjectMemory || 30;
    for (const [id, mem] of this.objectMemory) {
      if (now - mem.lastSeenTime > memoryLimit) this.objectMemory.delete(id);
    }

    // Step 3: Apply stranger/large-object fear penalty
    const best = visible[0];
    let score = best.score;
    score = this._applyStrangerFear(best.object, score);

    // Step 4: Queue best object with reaction latency delay
    if (score > 0.5 && Math.random() < score * 0.3) {
      const stats = this._getFatigueModifiedStats();
      this.pendingReaction = best;
      this.reactionTimer = stats.reactionLatency;
    }
  }

  // ── Update loop ───────────────────────────────────────────────────────────
  update(deltaTime, colliders, otherAgents, bounds) {
    if (!this.body) return;
    this.availableObjects = colliders || [];
    this.simTime += deltaTime;

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

    // ── Process Reaction Latency Pipeline ──────────────────────────────────
    if (this.pendingReaction && this.reactionTimer > 0) {
      this.reactionTimer -= deltaTime;
      if (this.reactionTimer <= 0) {
        this._reactToObject(this.pendingReaction);
        this.pendingReaction = null;
      }
    }

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
        this.setSafeTranslation({ x: newX, y: pos.y, z: newZ });
      }
      this.pendingBounce = null;
    }

    if (this.stunTimer > 0) { this.stunTimer -= deltaTime; return; }
    if (this.fallState && this.body) { this.executeAction({ action: 'free_fall' }, deltaTime, colliders, bounds); return; }
    if (this.participatingInRareEvent && this.rareEventChain) { this.executeRareEventStep(deltaTime, colliders, bounds); return; }

    // FIX STATE LOOP: honour idle cooldown — do NOT pick a new target while cooling down.
    // This breaks the rapid MOVING→stuck→IDLE→MOVING→stuck cycle by inserting a real pause.
    if (this.idleCooldown > 0) {
      this.idleCooldown = Math.max(0, this.idleCooldown - deltaTime);
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
      // FIX: Remove one-shot reaction behaviors (hurt/crying/recovery) — they must NOT be recycled.
      // handleCollision replaces behaviorQueue with [hurt, cry, get_up]. Without this filter,
      // pickNextBehavior resets them to completed=false and replays the chain forever.
      const REACTION_TYPES = ['hurt', 'crying', 'recovery'];
      this.behaviorQueue = this.behaviorQueue.filter(b => !REACTION_TYPES.includes(b.type));

      // Restore saved behaviors if collision had replaced them
      if (!this.behaviorQueue.length && this._savedBehaviorQueue?.length) {
        this.behaviorQueue = this._savedBehaviorQueue;
        this._savedBehaviorQueue = null;
      }

      if (this.behaviorQueue.length) {
        this.behaviorQueue.forEach(b => {
          b.completed = false;
          if (b.sequence) b.sequence.forEach(a => { a.completed = false; });
        });
      }
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
        // FIX STATE LOOP: Target the NEAR EDGE of the bounding box, not its geometric center.
        // Targeting the center places the goal INSIDE the furniture, causing the KCC to
        // block immediately, triggering stuckCounter, and creating the MOVING→stuck→IDLE loop.
        const cur = this.getPosition();
        const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
        const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
        const toCurX = cur[0] - cx;
        const toCurZ = cur[2] - cz;
        const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
        const hx = (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2;
        const hz = (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2;
        const edgeRadius = Math.max(hx, hz);
        const capsR = this.anthropometry ? (this.anthropometry.walkStride || 0.3) : 0.3;
        const approachOffset = edgeRadius + capsR * 2.5;
        this.targetPosition = [
          cx + (toCurX / toCurLen) * approachOffset,
          obj.boundingBox.min[1],
          cz + (toCurZ / toCurLen) * approachOffset,
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
        // FIX STATE LOOP: same edge-approach fix for type-matched objects
        const cur2 = this.getPosition();
        const cx = (bestObj.boundingBox.min[0] + bestObj.boundingBox.max[0]) / 2;
        const cz = (bestObj.boundingBox.min[2] + bestObj.boundingBox.max[2]) / 2;
        const toCurX = cur2[0] - cx;
        const toCurZ = cur2[2] - cz;
        const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
        const hx = (bestObj.boundingBox.max[0] - bestObj.boundingBox.min[0]) / 2;
        const hz = (bestObj.boundingBox.max[2] - bestObj.boundingBox.min[2]) / 2;
        const edgeRadius = Math.max(hx, hz);
        const capsR = this.anthropometry ? (this.anthropometry.walkStride || 0.3) : 0.3;
        const approachOffset = edgeRadius + capsR * 2.5;
        this.targetPosition = [
          cx + (toCurX / toCurLen) * approachOffset,
          bestObj.boundingBox.min[1],
          cz + (toCurZ / toCurLen) * approachOffset,
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
        // FIX BUG #11: Use FALLING state immediately so injury calculator gets correct severity.
        // Previously was INTERACTING for the entire action (even when fallState was set).
        const pos = this.body.translation();
        const h   = pos.y - this.spawnY;
        if (h > 0.15) {
          this.state = 'FALLING';   // ← CORRECTED: agent is actually falling
          this.fallState = { startY: pos.y, targetY: this.spawnY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        } else {
          this.state = 'INTERACTING'; // ground-level stumble: no airtime, use INTERACTING
          if (this.behaviorTimer < 0.3) {
            const surge = 1.0 * deltaTime, angle = Math.random() * Math.PI * 2;
            this.setSafeTranslation({
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
        this.setSafeTranslation({ x: pos.x, y: Math.max(this.spawnY, newY), z: pos.z });
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
        // FIX: Remove physical Y-axis accumulation. 'reach_up' (tiptoes) should only 
        // be a visual animation on the frontend. Modifying physics Y here causes the 
        // "Flying Bug" because the agent never returns to the floor.
        break;
      }

      case 'open_drawer': case 'pull': case 'pull_to_stand': {
        this.state = 'INTERACTING';
        // Pull back slightly — agent leans backward
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
        
        // 1. Try intended target
        const intendedTargetId = action.targetObjectId || this.currentBehavior?.targetObjectId;
        if (intendedTargetId) {
          climbTarget = (colliders || []).find(c => c.id === intendedTargetId);
        }
        
        // 2. Find nearest climbable-size object (within 0.4m)
        if (!climbTarget) {
          let bestDist = 0.4;
          for (const obj of (colliders || [])) {
            if (!obj.boundingBox) continue;
            const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
            const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
            const objHeight = obj.boundingBox.max[1] - obj.boundingBox.min[1];
            const d = Math.hypot(cx - curPos[0], cz - curPos[2]);
            if (d < bestDist && objHeight > 0.2 && objHeight < 1.5) { 
              climbTarget = obj; 
              bestDist = d;
            }
          }
        }
        if (!climbTarget) { this.state = 'IDLE'; break; }

        // Non-climbable filter
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

        // Validate climbability
        const agData = getAgeGroup(this.ageGroupId);
        // FIX: Strictly limit maxClimbH to 1.0m even for older kids to prevent wall-climbing
        const maxClimbH = Math.min(1.0, (agData?.reachHeight || 0.5) * 1.5);
        const objH = climbTarget.boundingBox.max[1] - climbTarget.boundingBox.min[1];
        const friction = this._getObjectFriction(climbTarget);

        if (!agData?.canClimb || objH > maxClimbH || friction < 0.3) {
          this.state = 'INTERACTING';
          this._setEmotion(friction < 0.3 ? 'frustrated' : 'scared');
          if (this.currentBehavior) {
            this.currentBehavior.action = 'reach_up';
          }
          break;
        }

        const progress = this.behaviorTimer / (action.duration || 3.0);

        // FIX BUG #7: Set state based on phase.
        // Phase 1 (approach) = MOVING; Phase 2+ (actual climb) = INTERACTING.
        // Previously was INTERACTING for ALL phases causing fatigue/animation mismatch.
        if (progress < 0.3) {
          this.state = 'MOVING';  // ← approaching the object, agent is walking
        } else {
          this.state = 'INTERACTING'; // ← actually climbing
        }
        
        const fail = agData?.climbFailRate || 0.1;
        const adjustedFail = fail + (1 - friction) * 0.2;
        if (Math.random() < adjustedFail && pos_c.y > this.spawnY + 0.1) {
          const h = pos_c.y - this.spawnY;
          this.fallState = { startY: pos_c.y, targetY: this.spawnY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        } else {
          // FIX: Headboard Bug. Don't blindly use the object's absolute max Y.
          // Fallback simple cap:
          const maxAllowedY = this.spawnY + (agData?.height || 0.8) + 0.1;
          let objectTopY = climbTarget.boundingBox.max[1];

          // Use raycast at the center of the object to find the actual surface height, not the headboard peak.
          const cx = (climbTarget.boundingBox.min[0] + climbTarget.boundingBox.max[0]) / 2;
          const cz = (climbTarget.boundingBox.min[2] + climbTarget.boundingBox.max[2]) / 2;

          if (this.world) {
             const ray = new physicsEngine.rapier.Ray({ x: cx, y: objectTopY + 0.5, z: cz }, { x: 0, y: -1, z: 0 });
             const hit = this.world.castRay(ray, objectTopY - this.spawnY + 1.0, true);
             if (hit) {
               const hitToi = hit.toi !== undefined ? hit.toi : hit.timeOfImpact;
               objectTopY = (objectTopY + 0.5) - hitToi;
             }
          }

          const targetTopY = Math.min(objectTopY, maxAllowedY);
          
          // Safety fallback: if targetTopY is somehow way above actual floor (e.g., raycast glitch), abort
          if (targetTopY > maxAllowedY + 0.5) {
            this.state = 'IDLE';
            return;
          }
          
          // FIX: Walk to object EDGE (not center) to prevent clipping into geometry
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
            // Phase 1: approach edge of object
            this.targetPosition = [edgeX, pos_c.y, edgeZ];
            this.moveTowardsTarget(deltaTime, 'walk');
          } else {
            const dObject = Math.hypot(cx - pos_c.x, cz - pos_c.z);
            if (dObject > 1.2) {
               // Too far — cancel climb
               this.state = 'IDLE';
               this.targetPosition = null;
               break;
            }
            
            if (progress < 0.8) {
              // Phase 2: pull up (capped speed, never exceed targetTopY)
              const climbSpeed = this.getRealisticVelocity('climb');
              const maxLift = climbSpeed * deltaTime * 0.5; // Max 0.5m/s climb rate
              const liftY = Math.min(maxLift, targetTopY - pos_c.y);
              if (liftY > 0) {
                this.setSafeTranslation({
                  x: pos_c.x, y: Math.min(targetTopY, pos_c.y + liftY), z: pos_c.z
                });
              }
            } else {
              // Phase 3: on top (capped)
              this.setSafeTranslation({
                x: pos_c.x, y: Math.min(targetTopY, pos_c.y), z: pos_c.z
              });
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
        // FIX BUG #12: 'scared' should be set at the BEGINNING of get_up (just fell, frightened),
        // then cleared to 'cautious' as agent finishes standing up.
        // Previously was setting 'scared' at 80% done — logically backwards.
        if (this.behaviorTimer <= deltaTime * 2) {
          // First frame of get_up: agent is scared from the fall
          this._setEmotion('scared');
        } else if (this.behaviorTimer > (action.duration || 1.5) * 0.8) {
          // Near end: agent has recovered, transition to cautious
          this._setEmotion('cautious');
        }
        break;

      case 'pause': case 'look_around':
        this.state = 'IDLE';
        break;

      // Group G: Rare events + F7 slide — agent stays in place, frontend animates
      case 'dodge': case 'push': case 'throw': case 'pick_up':
      case 'sit_down': case 'stand_up': case 'jump': case 'land': case 'slide':
        this.state = 'INTERACTING';
        break;

      // FIX-P2: climb_on must check if there's actually something to climb nearby
      // If nothing climbable within 1.5m, convert to 'look_around' instead
      default: {
        // FIX BUG #8: Use `t` (the extracted string) not `action` (the object) for comparison.
        // Previously `action === 'crawl'` was ALWAYS false because action is an object like {action:'crawl',...}.
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, t === 'crawl' ? 'crawl' : 'walk');
      }
    }
  }

  // ── Movement Kernel — Anti-Clip via KCC + Turn Rate + Inertia ─────────────
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

    // Danger zone avoidance (Learning & Memory system)
    const dangerCheck = this._isNearDangerZone(this.targetPosition);
    if (dangerCheck.dangerous) {
      this._logRiskEvent('near_miss', this.targetPosition, { reason: 'danger_zone_avoided' });
      this.targetPosition = null;
      this.state = 'IDLE';
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

    // ── Kinematics: Turn Rate + Momentum + Forward Bias ──────────────────
    const ag = getAgeGroup(this.ageGroupId);
    const kin = ag?.kinematics;
    const stats = this._getFatigueModifiedStats();
    let moveX, moveZ;

    if (kin) {
      // Turn rate limiting — agent can't instantly face target
      const desiredAngle = Math.atan2(dz, dx);
      const angleDiff = this._normalizeAngle(desiredAngle - this.currentHeading);
      const maxTurn = stats.turnRate * deltaTime;
      const clampedTurn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
      this.currentHeading += clampedTurn;

      // Forward bias — toddlers lunge forward impulsively
      const biasedSpeed = speed * (1.0 + kin.forwardBias * 0.3);

      // Momentum — velocity carries from previous frame (inertia)
      const rawX = Math.cos(this.currentHeading) * biasedSpeed * deltaTime;
      const rawZ = Math.sin(this.currentHeading) * biasedSpeed * deltaTime;
      const mf = kin.momentumFactor;
      moveX = rawX * (1 - mf) + (this.velocity[0] * deltaTime) * mf;
      moveZ = rawZ * (1 - mf) + (this.velocity[2] * deltaTime) * mf;
    } else {
      moveX = (dx/dist) * speed * deltaTime;
      moveZ = (dz/dist) * speed * deltaTime;
    }

    // §Fix: use character controller so agent slides along walls instead of clipping
    if (this.controller && this.world) {
      const kccCollider = this.collider ?? this.colliders?.torso ?? this.colliders?.legs ?? null;
      if (kccCollider) {
        const corrected = physicsEngine.moveAgentWithController(
          this.world, this.controller, this.body, kccCollider,
          { x: moveX, y: -0.05, z: moveZ },
          deltaTime
        );

        // FIX #12: Do NOT bypass KCC when blocked — this caused clipping through furniture.
        // Previously: if KCC blocked >90%, we used setNextKinematicTranslation directly.
        // Now: trust the KCC correction. If blocked, agent slides along the wall.

        // ── Anti-stuck detection ──────────────────────────────────────────
        const posNow = this.body.translation();
        const stuckDx = posNow.x - this.lastMovePos[0];
        const stuckDz = posNow.z - this.lastMovePos[2];
        const stuckDist = Math.sqrt(stuckDx * stuckDx + stuckDz * stuckDz);
        if (stuckDist < 0.01) {
          this.stuckCounter++;
        } else {
          this.stuckCounter = 0;
        }
        this.lastMovePos = [posNow.x, posNow.y, posNow.z];

        // If stuck for 60+ frames (~1 second), try escape via KCC (not teleport)
        if (this.stuckCounter > 60) {
          const escDist = 0.4;
          const moveLen = Math.hypot(moveX, moveZ) || 1;
          // Try 3 escape directions via KCC to find the clearest path
          const escDirs = [
            { x: -moveZ / moveLen * escDist, z:  moveX / moveLen * escDist },  // perp left
            { x:  moveZ / moveLen * escDist, z: -moveX / moveLen * escDist },  // perp right
            { x: -moveX / moveLen * escDist, z: -moveZ / moveLen * escDist },  // backward
          ];
          let bestDist = 0;
          for (const dir of escDirs) {
            const esc = physicsEngine.moveAgentWithController(
              this.world, this.controller, this.body, kccCollider,
              { x: dir.x, y: 0, z: dir.z },
              deltaTime
            );
            const d = Math.hypot(esc?.x || 0, esc?.z || 0);
            if (d > bestDist) bestDist = d;
          }
          // FIX STATE LOOP: set idleCooldown so the agent waits in IDLE before re-targeting.
          // Without this, stuckCounter reset → IDLE → pickNextBehavior → MOVING → stuck again
          // all within 1-2 frames, creating a visible thrashing loop.
          this.stuckCounter = 0;
          this.targetPosition = null;
          this.state = 'IDLE';
          this.idleCooldown = 1.0 + Math.random() * 1.0; // 1–2 seconds of genuine IDLE
        }
        return;
      }
    }

    // Fallback: direct translation
    const pos = this.body.translation();
    if (Number.isFinite(pos.x + moveX) && Number.isFinite(pos.z + moveZ)) {
      this.setSafeTranslation({ x: pos.x + moveX, y: pos.y, z: pos.z + moveZ });
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

  handleCollision(contactNormal, severity, objectId = null) {
    if (!this.body) return;
    if (this.stunTimer > 0) return;
    if (this.fallState) return;

    // FIX: Ignore all severe impacts in the first 3 seconds to allow the agent to settle after spawn.
    // The KinematicCharacterController produces massive virtual velocities when pushing agents out of initial overlaps.
    // 2s was not always enough for furniture-spawn cases; increased to 3s.
    if (this.simTime < 3.0) return;

    // FIX: Don't start a new hurt chain while still recovering from a previous collision.
    // This breaks the get_up_fast → hurt_medium → cry_standing infinite loop.
    if (this.recoveryTimer > 0) return;

    // FIX: Per-object collision cooldown — ignore repeated collisions with same object within 8s.
    // Increased from 5s to 8s: agents spawning very close to furniture kept retriggering
    // the hurt chain every 5s even after physically settling, causing a perpetual state loop.
    if (objectId) {
      if (!this._collisionCooldowns) this._collisionCooldowns = new Map();
      const lastHit = this._collisionCooldowns.get(objectId) || 0;
      if (this.simTime - lastHit < 8.0) return;
      this._collisionCooldowns.set(objectId, this.simTime);
    }

    // FIX: Only interrupt behaviors and trigger hurt/cry for significant impacts.
    // severity < 15 usually means grazing or brushing past an object while KCC is sliding.
    if (severity < 15) {
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

    // FIX #2: Emit hurt action with severity-based response
    const hurtAction = severity > 80 ? 'hurt_shock'
      : severity > 50 ? 'hurt_heavy'
      : severity > 20 ? 'hurt_medium' : 'hurt_light';
    const hurtDuration = severity > 80 ? 5.0
      : severity > 50 ? 3.0 : severity > 20 ? 2.0 : 0.5;
    const hurtEmotion = severity > 20 ? 'crying' : 'scared';

    // Chain: hurt → crying → get_up
    const chain = [{ type: 'hurt', action: hurtAction, duration: hurtDuration, completed: false }];
    if (severity > 20) {
      chain.push({ type: 'crying', action: severity > 50 ? 'crying_sit' : 'crying_stand',
        duration: severity > 50 ? 3.0 : 1.5, completed: false });
    }
    chain.push({ type: 'recovery', action: severity > 50 ? 'get_up_slow' : 'get_up_fast',
      duration: severity > 50 ? 2.0 : 0.8, completed: false });

    // FIX: Save original behaviors before replacing with reaction chain
    // so pickNextBehavior can restore them after the chain completes.
    if (this.behaviorQueue.length && !this.behaviorQueue.every(b => ['hurt', 'crying', 'recovery'].includes(b.type))) {
      this._savedBehaviorQueue = [...this.behaviorQueue];
    }
    this.behaviorQueue = chain;
    this.currentBehavior = null;
    this.state = 'INTERACTING';
    this._setEmotion(hurtEmotion);
    this.recoveryTimer = hurtDuration + (severity > 20 ? 3.0 : 0.5);

    // v4: Record danger zone for learning system
    this._recordDangerZone(this.getPosition(), severity);
    this._logRiskEvent('collision', this.getPosition(), { severity, objectId: objectId });
    this._checkTantrumTrigger();
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

  // ── Surface friction helper (for climb validation) ───────────────────────
  _getObjectFriction(obj) {
    if (obj?.properties?.friction != null) return obj.properties.friction;
    const matName = (obj?.properties?.material?.name || obj?.name || obj?.id || '').toLowerCase();
    // FIX #15: Hanging/suspended objects — cannot support weight
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
    if (matName.includes('stone') || matName.includes('brick') || matName.includes('da')) return 0.65;
    return 0.50; // default — moderately climbable
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  v4 SUBSYSTEMS — Professional-Grade Child Behavior Simulation
  // ══════════════════════════════════════════════════════════════════════════

  // ── Reaction to Object (with grasping precision) ──────────────────────
  _reactToObject(visibleObj) {
    const ag = getAgeGroup(this.ageGroupId);
    const stats = this._getFatigueModifiedStats();
    const obj = visibleObj.object;
    const dims = obj.boundingBox ? [
      obj.boundingBox.max[0]-obj.boundingBox.min[0],
      obj.boundingBox.max[1]-obj.boundingBox.min[1],
      obj.boundingBox.max[2]-obj.boundingBox.min[2],
    ] : null;
    const isChoke = dims && Math.max(...dims) < 0.04 &&
      (this.ageGroupId === 'infant' || this.ageGroupId === 'toddler');
    const action = isChoke ? 'grab_mouth' : 'investigate';
    // Apply grasping offset error
    const offset = ag?.coordination?.graspingOffset || 0;
    const targetPos = visionSystem._getObjCenter(obj);
    targetPos[0] += (Math.random() - 0.5) * 2 * offset;
    targetPos[2] += (Math.random() - 0.5) * 2 * offset;
    // Roll for grasp success
    const willSucceed = Math.random() < stats.graspSuccess;
    if (willSucceed) {
      this.behaviorQueue = [{ type: action, action: action === 'grab_mouth' ? 'grab_mouth' : 'walk_to',
        targetObjectId: obj.id, duration: 5.0, completed: false }];
      this._setEmotion('mischievous');
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

  // ── Fatigue-Modified Stats ────────────────────────────────────────────
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

  // ── Angle normalization helper ────────────────────────────────────────
  _normalizeAngle(angle) {
    while (angle > Math.PI)  angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  // ── Stranger/Large Object Fear ────────────────────────────────────────
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
    if (objVol > childVol * 8) {
      score *= (1 - ag.fear.strangerFear);
    }
    return score;
  }

  // ── Acoustic Startle Response ─────────────────────────────────────────
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

  // ── Height Fear (Visual Cliff) ────────────────────────────────────────
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
        this.stunTimer = 1.0;
        this._setEmotion('scared');
        return Math.random() < 0.5;
      case 'cautious':
        return Math.random() < 0.2;
      default:
        return false;
    }
  }

  // ── Object Permanence (Piaget) ────────────────────────────────────────
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

  // ── Danger Zone Memory (Learning) ─────────────────────────────────────
  _recordDangerZone(position, severity) {
    const ag = getAgeGroup(this.ageGroupId);
    const memDuration = ag?.cognition?.dangerMemoryDuration || 30;
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
      if (d < 0.8) return { dangerous: true, zone };
    }
    return { dangerous: false };
  }

  // ── Trial-and-Error Strategy Change ───────────────────────────────────
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

  // ── Tantrum Trigger ───────────────────────────────────────────────────
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

  // ── Risk Analytics Logger ─────────────────────────────────────────────
  _logRiskEvent(type, position, details = {}) {
    riskAnalytics.recordEvent(type, position, {
      agentId: this.id, ageGroup: this.ageGroupId, ...details
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  // FIX STATE LOOP: Collision-aware random target — reject points inside furniture bounding boxes.
  // Also handles fallback more gracefully: if 10 random attempts fail (dense room),
  // try 20 more with a smaller exclusion pad before accepting any clear position.
  setRandomTarget(bounds) {
    if (!bounds) return;
    const pads = [0.15, 0.05]; // first try with normal pad, then minimal pad
    for (const pad of pads) {
      for (let attempt = 0; attempt < 15; attempt++) {
        const x = bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]);
        const z = bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2]);
        let insideFurniture = false;
        for (const obj of (this.availableObjects || [])) {
          if (!obj.boundingBox) continue;
          const bb = obj.boundingBox;
          if (x > bb.min[0] - pad && x < bb.max[0] + pad &&
              z > bb.min[2] - pad && z < bb.max[2] + pad) {
            insideFurniture = true;
            break;
          }
        }
        if (!insideFurniture) {
          this.targetPosition = [x, bounds.min[1], z];
          return;
        }
      }
    }
    // Last resort: accept random point rather than hang. KCC will block the agent at the edge.
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