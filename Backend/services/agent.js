
import { getAgeGroup } from '../config/ageGroups.js';

class Agent {
  constructor(id, startPosition, rigidBody, ageGroupId) {
    this.id = id;
    this.body = rigidBody;
    this.ageGroupId = ageGroupId;
    
    // ── TRAJECTORY (User's Feature) ──
    this.trajectory = [];
    this.MAX_TRAJECTORY_POINTS = 600; // Allow 10s @ 60fps
    this.trajectorySampleRate = 1;    // Record every frame for smoothness 
    this.frameCount = 0;
    
    // ── STATE & BEHAVIOR ──
    this.state = 'IDLE';
    this.behaviorQueue = [];
    this.currentBehavior = null;
    this.behaviorTimer = 0;
    
    // ── RARE EVENTS (User's Feature) ──
    this.participatingInRareEvent = false;
    this.rareEventChain = null;
    this.rareEventStep = 0;
    
    // ── MOVEMENT & LOGIC ──
    this.targetPosition = null;
    this.velocity = [0, 0, 0];
    this.previousPosition = [...startPosition];
    this.spawnY = startPosition[1];
    this.availableObjects = []; // Stores classified objects for attraction scanning

    // ── RESEARCH-BASED STATS ──
    this.fatigueLevel = 0.0; // 0.0 to 1.0 (1.0 = exhausted)
    this.gaitStability = 1.0; // 1.0 = stable, 0.0 = fall prone
    this.lastStumbleTime = 0;
    
    // Initialize stats from Age Group
    const groupData = getAgeGroup(this.ageGroupId);
    if (groupData) {
      // Base stability on age group (toddlers are wobbly)
      this.gaitStability = groupData.gaitStability || 0.8; 
    }

    // ── METRICS ──
    this.totalDistance = 0;
    this.stateHistory = new Map();
  }

  /**
   * Smart trajectory recording (User's Feature)
   */
  recordPosition(position) {
    this.frameCount++;
    if (this.frameCount % this.trajectorySampleRate !== 0) return;
    
    // Round to save memory
    const roundedPosition = position.map(v => Math.round(v * 100) / 100);
    this.trajectory.push(roundedPosition);
    
    if (this.trajectory.length > this.MAX_TRAJECTORY_POINTS) {
      this.trajectory.shift();
    }
  }

  /**
   * Gaussian Random Helper for realistic velocity variation
   */
  _gaussianRandom(mean, stdDev) {
    const u = 1 - Math.random(); 
    const v = Math.random();
    const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    return z * stdDev + mean;
  }

  /**
   * Calculate realistic velocity based on Action, Age, and Fatigue
   */
  getRealisticVelocity(actionType) {
    const ageGroup = getAgeGroup(this.ageGroupId);
    if (!ageGroup || !ageGroup.velocityProfile) return 1.0; // Fallback

    const profile = ageGroup.velocityProfile[actionType] || ageGroup.velocityProfile.walk;
    // 1. Get base Gaussian speed
    let speed = this._gaussianRandom(profile.mean, profile.stdDev);
    
    // 2. Apply Fatigue Penalty (slow down if tired)
    // Fatigue builds up, reducing speed by up to 40%
    speed *= (1.0 - (this.fatigueLevel * 0.4));

    // 3. Clamp checks
    if (speed < 0.05) speed = 0.05;
    
    return speed;
  }

  /**
   * Check for high-attraction objects nearby (Research Feature)
   */
  scanForAttractions(bounds) {
    if (this.participatingInRareEvent) return; // Don't distract during rare events
    if (Math.random() > 0.05) return; // Only scan occasionally (5% chance per frame)

    const ageGroup = getAgeGroup(this.ageGroupId);
    if (!ageGroup || !this.availableObjects.length) return;

    // Find most attractive object nearby
    let bestTarget = null;
    let maxScore = 0;
    const currentPos = this.getPosition();

    // Determine forward direction from velocity (or previous movement)
    let forward = [...this.velocity];
    let speed = Math.hypot(forward[0], forward[2]);
    if (speed < 0.01) {
       // If stationary, assume forward is rough direction of last movement or random
       // For now, simpler: 360 vision if stationary (scanning)
       forward = [0, 0, 0]; 
    } else {
       forward[0] /= speed;
       forward[2] /= speed;
    }

    for (const obj of this.availableObjects) {
       // Skip if no attraction data
       if (!obj.attractionByAge) continue;
       
       let score = obj.attractionByAge[this.ageGroupId] || 0;
       
       if (obj.boundingBox) {
         const objPos = [
           (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2,
           obj.boundingBox.min[1],
           (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2
         ];
         
         const toObj = [objPos[0] - currentPos[0], 0, objPos[2] - currentPos[2]];
         const dist = Math.hypot(toObj[0], toObj[2]);
         
         // 1. Distance Check
         if (dist > 5.0) continue;

         // 2. FOV Check (Research: Children have narrower valid FOV for attention)
         if (speed > 0.1) { // Only checking FOV if moving
            const toObjNorm = [toObj[0]/dist, 0, toObj[2]/dist];
            const dot = forward[0]*toObjNorm[0] + forward[2]*toObjNorm[2];
            if (dot < 0.5) continue; // Ignore objects behind/perpendicular (approx 120deg cone)
         }

         // 3. Color Preference (Red/Blue/Yellow boost for Infants/Toddlers)
         if (this.ageGroupId === 'infant' || this.ageGroupId === 'toddler') {
            const color = obj.properties?.material?.baseColor; 
            // Simple check if High R, G, or B
            if (color && (color[0] > 0.8 || color[2] > 0.8 || (color[0]>0.8 && color[1]>0.8))) {
               score *= 1.5; // 50% boost for bright colors
            }
         }

         // 4. Mouth Testing (Small Objects)
         // Calculate max dimension
         const dims = [
            obj.boundingBox.max[0]-obj.boundingBox.min[0], 
            obj.boundingBox.max[1]-obj.boundingBox.min[1], 
            obj.boundingBox.max[2]-obj.boundingBox.min[2]
         ];
         const size = Math.max(...dims);

         // MOUTH TEST TRIGGER: < 3.5cm (0.035m) is choke hazard
         if (size < 0.04 && (this.ageGroupId === 'infant' || this.ageGroupId === 'toddler')) {
             score *= 2.0; // Huge attraction to small things
             obj.isChokeHazard = true;
         }
         
         if (dist < 5.0 && score > 0.6 && score > maxScore) {
           maxScore = score;
           bestTarget = obj;
         }
       }
    }

    // Determine distraction probability
    if (bestTarget && Math.random() < (maxScore * 0.3)) {
      // Determine action based on object
      let actionType = 'investigate';
      if (bestTarget.isChokeHazard) actionType = 'mouth_test';
      
      this.behaviorQueue = [{
        type: actionType,
        action: actionType === 'mouth_test' ? 'grab_mouth' : 'walk_to',
        targetObjectId: bestTarget.id,
        duration: 5.0,
        completed: false
      }];
      this.currentBehavior = null; 
      this.state = 'IDLE';
    }
  }

  /**
   * Update agent state and physics
   */
  update(deltaTime, colliders, otherAgents, bounds) {
    if (!this.body) return;
    
    // Update knowledge of world
    this.availableObjects = colliders || [];

    const currentPos = this.getPosition();
    this.recordPosition(currentPos);
    
    // Velocity tracking
    const dx = currentPos[0] - this.previousPosition[0];
    const dy = currentPos[1] - this.previousPosition[1];
    const dz = currentPos[2] - this.previousPosition[2];
    this.velocity = [dx / deltaTime, dy / deltaTime, dz / deltaTime];
    
    this.totalDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    // Fatigue Logic: Moving increases fatigue, Idle decreases it
    if (this.state === 'MOVING') {
      this.fatigueLevel = Math.min(1.0, this.fatigueLevel + (deltaTime * 0.01)); // 100s to full fatigue
    } else if (this.state === 'IDLE') {
      this.fatigueLevel = Math.max(0.0, this.fatigueLevel - (deltaTime * 0.05)); // Recovers 5x faster
    }

    // Scan for distractions (Attraction System)
    this.scanForAttractions(bounds);

    this.updateBehavior(deltaTime, colliders, bounds);
    this.previousPosition = [...currentPos];
  }

  updateBehavior(deltaTime, colliders, bounds) {
    if (this.participatingInRareEvent && this.rareEventChain) {
      this.executeRareEventStep(deltaTime, colliders, bounds);
      return;
    }
    
    if (this.currentBehavior) {
      this.behaviorTimer += deltaTime;
      if (this.behaviorTimer >= this.currentBehavior.duration) {
        this.currentBehavior.completed = true;
        this.currentBehavior = null;
        this.behaviorTimer = 0;
        this.state = 'IDLE';
      } else {
        this.executeAction(this.currentBehavior, deltaTime, colliders, bounds);
      }
    } else if (this.state === 'MOVING' && this.targetPosition) {
      // Continue generic movement (fallback)
      this.moveTowardsTarget(deltaTime, 'walk');
      if (!this.targetPosition) this.state = 'IDLE';
    } else {
      this.pickNextBehavior(deltaTime, bounds);
      // Immediate start
      if (this.state === 'MOVING' && this.targetPosition) {
        this.moveTowardsTarget(deltaTime, 'walk'); // default
      }
    }
  }

  pickNextBehavior(deltaTime, bounds) {
    if (!this.behaviorQueue || this.behaviorQueue.length === 0) {
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }
    
    const nextBehavior = this.behaviorQueue.find(b => !b.completed);
    
    if (nextBehavior && nextBehavior.sequence && nextBehavior.sequence.length > 0) {
      const nextAction = nextBehavior.sequence.find(action => !action.completed);
      if (nextAction) {
        this.currentBehavior = nextAction;
        this.behaviorTimer = 0;
      }
    } else {
      // Loop behaviors
      this.behaviorQueue.forEach(b => {
        b.completed = false;
        if (b.sequence) b.sequence.forEach(a => { a.completed = false; });
      });
      // Brief random walk before restarting
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
    }
  }

  executeAction(action, deltaTime, colliders, bounds) {
    if (!this.body) return;
    
    const actionType = action.action || action.type;
    
    switch (actionType) {
      case 'walk_to':
      case 'investigate': // Treat investigate as walking to it
        this.state = 'MOVING';
        if (action.targetObjectId || action.target) {
          // Find target logic
          const targetId = action.targetObjectId || action.target;
          const targetObj = colliders.find(c => 
            c.id === targetId || 
            (c.name && c.name.toLowerCase().includes(targetId.toLowerCase())) ||
            (c.type && c.type.toLowerCase().includes(targetId.toLowerCase()))
          );
          if (targetObj && targetObj.boundingBox) {
            const bbox = targetObj.boundingBox;
            this.targetPosition = [
              (bbox.min[0] + bbox.max[0]) / 2,
              bbox.min[1], // Floor level
              (bbox.min[2] + bbox.max[2]) / 2
            ];
          } else if (!this.targetPosition) {
            this.setRandomTarget(bounds);
          }
        }
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

      case 'run':
      case 'run_unstable': // Handle specific unstable run
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'run');
        break;

      case 'lunge':
        this.state = 'MOVING';
         if (!this.targetPosition) this.setRandomTarget(bounds);
         this.moveTowardsTarget(deltaTime, 'lunge');
         break;

      case 'trip':
      case 'stumble':
      case 'fall_forward':
         this.state = 'INTERACTING';
         // Simulate stumble physics (surge forward + down)
         if (this.body) {
            const pos = this.body.translation();
            const surge = 2.5 * deltaTime; // Sudden surge
            // Random direction or forward
            const angle = Math.random() * Math.PI * 2;
            this.body.setNextKinematicTranslation({
              x: pos.x + Math.cos(angle) * surge,
              y: Math.max(this.spawnY - 0.2, pos.y - surge), // Drop
              z: pos.z + Math.sin(angle) * surge
            });
         }
         break;

      // Interaction Actions (Stationary or minimal movement)
      case 'grab':
      case 'reach_up':
      case 'climb_on':
      case 'open_drawer':
        this.state = 'INTERACTING';
        // Logic: Face object, maybe small vertical movement for climbing
        if (actionType === 'climb_on') {
           const pos = this.body.translation();
           this.body.setNextKinematicTranslation({
             x: pos.x, y: pos.y + 0.5 * deltaTime, z: pos.z
           });
        }
        break;
        
      case 'pause':
      case 'look_around':
        this.state = 'IDLE';
        break;

      default:
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'walk');
    }
  }

  /**
   * MOVEMENT KERNEL — Research Based
   */
  moveTowardsTarget(deltaTime, actionType = 'walk') {
    if (!this.targetPosition || !this.body) return;
    
    // 1. Calculate Direction
    const currentPos = this.getPosition();
    const dx = this.targetPosition[0] - currentPos[0];
    const dz = this.targetPosition[2] - currentPos[2];
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < 0.2) {
      this.targetPosition = null; // Arrived
      return;
    }

    // 2. Get Research-Based Speed
    // Returns speed in m/s (e.g., 0.5 for walk, 0.9 for run)
    const speed = this.getRealisticVelocity(actionType);
    
    // 3. Stumble Check (if running or unstable)
    // If stability is low and speed is high, risk of stumbling
    const stabilityRisk = (1.1 - this.gaitStability); // 0.1 (stable) to 0.4 (unstable)
    const speedFactor = speed > 0.8 ? 1.5 : 1.0;
    
    // Tiny chance per frame (e.g. 0.1% * risk)
    if (Math.random() < 0.001 * stabilityRisk * speedFactor) {
      // TRIGGER STUMBLE!
      // console.log(` Agent ${this.id} stumbled!`);
      // Interrupt current behavior with a fall
      this.behaviorQueue = [{
         type: 'stumble', action: 'fall_forward', duration: 1.5, completed: false
      }];
      this.currentBehavior = null;
      return; 
    }

    // 4. Move
    const moveX = (dx / distance) * speed * deltaTime;
    const moveZ = (dz / distance) * speed * deltaTime;
    
    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: pos.x + moveX,
      y: this.spawnY, // Lock to floor plane
      z: pos.z + moveZ
    });
  }

  // ── HELPERS ──

  executeRareEventStep(deltaTime, colliders, bounds) {
    if (!this.rareEventChain || !this.rareEventChain.chain) return;
    const currentStep = this.rareEventChain.chain[this.rareEventStep];
    if (!currentStep) {
      this.participatingInRareEvent = false;
      return;
    }
    this.state = 'RARE_EVENT';
    if (currentStep.action) {
      this.executeAction(currentStep, deltaTime, colliders, bounds);
    }
    this.behaviorTimer += deltaTime;
    if (this.behaviorTimer >= (currentStep.duration || 2.0)) {
      this.rareEventStep++;
      this.behaviorTimer = 0;
      if (this.rareEventStep >= this.rareEventChain.chain.length) {
        this.participatingInRareEvent = false;
      }
    }
  }

  setRandomTarget(bounds) {
    if (!bounds) return;
    this.targetPosition = [
      bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]),
      bounds.min[1],
      bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2])
    ];
  }

  loadBehaviorPolicy(behaviors) {
    this.behaviorQueue = behaviors.map(b => ({
      ...b,
      completed: false,
      sequence: b.sequence ? b.sequence.map(action => ({
        ...action,
        completed: false
      })) : []
    }));
  }

  startRareEventChain(eventChain) {
    this.participatingInRareEvent = true;
    this.rareEventChain = eventChain;
    this.rareEventStep = 0;
    this.behaviorTimer = 0;
  }

  getPosition() {
    if (!this.body) return [0, 0, 0];
    const t = this.body.translation();
    return [t.x, t.y, t.z];
  }

  getVelocity() {
    const vx = this.velocity[0];
    const vy = this.velocity[1];
    const vz = this.velocity[2];
    return Math.sqrt(vx * vx + vy * vy + vz * vz);
  }

  getStatus() {
    return {
      id: this.id,
      state: this.state,
      position: this.getPosition(),
      velocity: this.getVelocity(),
      totalDistance: this.totalDistance,
      fatigue: this.fatigueLevel, // Exposed metric
      behaviorsCompleted: this.behaviorQueue ? this.behaviorQueue.filter(b => b.completed).length : 0
    };
  }

  // Centralized Age Group Access
  getAgeGroupData() {
    return getAgeGroup(this.ageGroupId) || { speed: 0.8 };
  }

  // Trajectory export (User's feature)
  getSampledTrajectory(maxPoints = 30) {
    if (this.trajectory.length <= maxPoints) return [...this.trajectory];
    const step = Math.floor(this.trajectory.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < this.trajectory.length; i += step) {
      sampled.push([...this.trajectory[i]]);
      if (sampled.length >= maxPoints) break;
    }
    return sampled;
  }

  cleanup() {
    this.trajectory = [];
    this.behaviorQueue = [];
    this.availableObjects = [];
    this.body = null;
  }
}

export default Agent;