import { getAgeGroup } from '../config/ageGroups.js';

class Agent {
  constructor(id, startPosition, rigidBody, ageGroupId) {
    this.id = id;
    this.body = rigidBody;
    this.ageGroupId = ageGroupId;
    
    // Reduced trajectory size to minimize memory usage
    this.trajectory = [];
    this.MAX_TRAJECTORY_POINTS = 30; // Reduced from 100 to 30
    this.trajectorySampleRate = 20; // Increased from 10 to 20 (sample less frequently)
    this.frameCount = 0;
    
    // Behavior state
    this.state = 'IDLE';
    this.behaviorQueue = [];
    this.currentBehavior = null;
    this.behaviorTimer = 0;
    
    // Rare events
    this.participatingInRareEvent = false;
    this.rareEventChain = null;
    this.rareEventStep = 0;
    
    // Movement
    this.targetPosition = null;
    this.velocity = [0, 0, 0];
    this.previousPosition = [...startPosition];
    this.spawnY = startPosition[1]; // 🔥 Remember spawn height for floor clamping
    
    // Stats
    this.totalDistance = 0;
    this.stateHistory = new Map(); // Track time in each state
  }

  /**
   * Smart trajectory recording with sampling
   */
  recordPosition(position) {
    this.frameCount++;
    
    // Only sample every N frames
    if (this.frameCount % this.trajectorySampleRate !== 0) {
      return;
    }
    
    // Round coordinates to 2 decimals to save memory
    const roundedPosition = position.map(v => Math.round(v * 100) / 100);
    
    // Add new position
    this.trajectory.push(roundedPosition);
    
    // Keep only last N points (circular buffer behavior)
    if (this.trajectory.length > this.MAX_TRAJECTORY_POINTS) {
      this.trajectory.shift(); // Remove oldest
    }
  }

  /**
   * Update agent state and physics
   */
  update(deltaTime, colliders, otherAgents, bounds) {
    if (!this.body) return;
    
    // Get current position from physics body
    const currentPos = this.getPosition();
    
    // Record trajectory (with sampling)
    this.recordPosition(currentPos);
    
    // Calculate velocity
    const dx = currentPos[0] - this.previousPosition[0];
    const dy = currentPos[1] - this.previousPosition[1];
    const dz = currentPos[2] - this.previousPosition[2];
    this.velocity = [dx / deltaTime, dy / deltaTime, dz / deltaTime];
    
    // Update total distance
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.totalDistance += distance;
    
    // Update behavior
    this.updateBehavior(deltaTime, colliders, bounds);
    
    // Save position for next frame
    this.previousPosition = [...currentPos];
  }

  updateBehavior(deltaTime, colliders, bounds) {
    // Handle rare event first
    if (this.participatingInRareEvent && this.rareEventChain) {
      this.executeRareEventStep(deltaTime, colliders, bounds);
      return;
    }
    
    // Handle behavior queue
    if (this.currentBehavior) {
      this.behaviorTimer += deltaTime;
      
      if (this.behaviorTimer >= this.currentBehavior.duration) {
        // Current action completed
        this.currentBehavior.completed = true;
        this.currentBehavior = null;
        this.behaviorTimer = 0;
        this.state = 'IDLE';
      } else {
        // Execute current action
        this.executeAction(this.currentBehavior, deltaTime, colliders, bounds);
      }
    } else if (this.state === 'MOVING' && this.targetPosition) {
      // Continue moving towards existing target (random walk fallback)
      this.moveTowardsTarget(deltaTime);
      // If we reached the target, pick a new one next frame
      if (!this.targetPosition) {
        this.state = 'IDLE';
      }
    } else {
      // Pick next behavior from queue
      this.pickNextBehavior(deltaTime, bounds);
      // If pickNextBehavior set a target (random walk), start moving immediately
      if (this.state === 'MOVING' && this.targetPosition) {
        this.moveTowardsTarget(deltaTime);
      }
    }
  }

  pickNextBehavior(deltaTime, bounds) {
    if (!this.behaviorQueue || this.behaviorQueue.length === 0) {
      // Default: random walk
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }
    
    // Find next incomplete behavior
    const nextBehavior = this.behaviorQueue.find(b => !b.completed);
    
    if (nextBehavior && nextBehavior.sequence && nextBehavior.sequence.length > 0) {
      // Get next action in sequence
      const nextAction = nextBehavior.sequence.find(action => !action.completed);
      
      if (nextAction) {
        this.currentBehavior = nextAction;
        this.behaviorTimer = 0;
      }
    } else {
      // 🔥 FIX #10: Reset behavior queue so agents loop behaviors instead of going idle forever
      this.behaviorQueue.forEach(b => {
        b.completed = false;
        if (b.sequence) b.sequence.forEach(a => { a.completed = false; });
      });
      // Set random walk for a brief period before restarting
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
    }
  }

  executeAction(action, deltaTime, colliders, bounds) {
    if (!this.body) return;
    
    const actionType = action.action || action.type;
    
    switch (actionType) {
      case 'walk_to':
        this.state = 'MOVING';
        if (action.targetObjectId || action.target) {
          // Try to find target object by id or by matching name/type
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
              bbox.min[1],
              (bbox.min[2] + bbox.max[2]) / 2
            ];
          } else if (!this.targetPosition) {
            // Couldn't find target, walk to random position
            this.setRandomTarget(bounds);
          }
        }
        this.moveTowardsTarget(deltaTime);
        break;
        
      case 'walk_random':
        this.state = 'MOVING';
        if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime);
        break;
        
      case 'crawl':
        this.state = 'MOVING';
        if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime * 0.3); // Slower
        break;

      // 🔥 FIX #4: Added missing action type handlers
      case 'run':
        this.state = 'MOVING';
        if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime * 1.8); // Faster
        break;

      case 'grab':
      case 'grab_mouth':
        this.state = 'INTERACTING';
        // Agent grabs object — physics handles collision
        break;
        
      case 'reach_up':
      case 'pull':
      case 'pull_to_stand':
      case 'climb_on':
        this.state = 'INTERACTING';
        // Simulate reaching/climbing — move upward slightly
        if (this.body) {
          const pos = this.body.translation();
          this.body.setNextKinematicTranslation({
            x: pos.x, y: pos.y + 0.3 * deltaTime, z: pos.z
          });
        }
        break;

      case 'jump':
        this.state = 'INTERACTING';
        if (this.body) {
          const jumpH = action.height || 0.5;
          const pos = this.body.translation();
          this.body.setNextKinematicTranslation({
            x: pos.x, y: pos.y + jumpH * deltaTime * 3, z: pos.z
          });
        }
        break;

      case 'land':
      case 'fall_forward':
      case 'trip':
      case 'lose_balance':
        this.state = 'INTERACTING';
        // Simulate a fall — move sideways + downward
        if (this.body) {
          const angle = Math.random() * Math.PI * 2;
          const pos = this.body.translation();
          const fallSpeed = 2.0 * deltaTime;
          this.body.setNextKinematicTranslation({
            x: pos.x + Math.cos(angle) * fallSpeed,
            y: Math.max(this.spawnY - 0.3, pos.y - fallSpeed),
            z: pos.z + Math.sin(angle) * fallSpeed
          });
        }
        break;

      case 'pause':
      case 'look_around':
      case 'stand_up':
        this.state = 'IDLE';
        // Agent pauses — no movement, just wait for duration
        break;

      case 'move_chair':
      case 'open':
      case 'open_drawer':
      case 'swing_open':
      case 'swing_close':
        this.state = 'INTERACTING';
        // Simulate interacting with an object
        if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime * 0.5); // Slow approach
        break;

      case 'climb_in':
      case 'stay_hidden':
      case 'repeat':
        this.state = 'INTERACTING';
        // Stationary interaction
        break;

      case 'grab_tool':
      case 'use_incorrectly':
        this.state = 'INTERACTING';
        break;

      case 'collision':
        this.state = 'INTERACTING';
        // Collision action — move towards nearest furniture
        if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime * 2.0); // Fast approach to trigger collision
        break;
        
      default:
        // Unknown action — default to moving randomly instead of going IDLE
        this.state = 'MOVING';
        if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime);
    }
  }

  // 🔥 FIX #11: Actually execute rare event actions instead of just counting time
  executeRareEventStep(deltaTime, colliders, bounds) {
    if (!this.rareEventChain || !this.rareEventChain.chain) return;
    
    const currentStep = this.rareEventChain.chain[this.rareEventStep];
    if (!currentStep) {
      this.participatingInRareEvent = false;
      return;
    }
    
    this.state = 'RARE_EVENT';
    
    // Execute the actual action from the rare event chain
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

  moveTowardsTarget(deltaTime) {
    if (!this.targetPosition || !this.body) return;
    
    const currentPos = this.getPosition();
    const dx = this.targetPosition[0] - currentPos[0];
    const dz = this.targetPosition[2] - currentPos[2];
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < 0.2) {
      // Reached target
      this.targetPosition = null;
      return;
    }
    
    // Get age-specific speed
    const ageGroup = this.getAgeGroupData();
    const speed = ageGroup.speed || 1.0;
    
    // Calculate movement delta
    const moveX = (dx / distance) * speed * deltaTime;
    const moveZ = (dz / distance) * speed * deltaTime;
    
    // 🔥 FIX: Use setNextKinematicTranslation for kinematic body
    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: pos.x + moveX,
      y: this.spawnY, // Stay on floor plane
      z: pos.z + moveZ
    });
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
    const translation = this.body.translation();
    return [translation.x, translation.y, translation.z];
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
      behaviorsCompleted: this.behaviorQueue 
        ? this.behaviorQueue.filter(b => b.completed).length 
        : 0
    };
  }

  // 🔥 FIX #7: Use centralized ageGroups config instead of duplicate data
  getAgeGroupData() {
    const ageGroup = getAgeGroup(this.ageGroupId);
    if (ageGroup) {
      return { speed: ageGroup.speed };
    }
    // Fallback if config not found
    return { speed: 0.8 };
  }

  /**
   *  Get sampled trajectory for export (already very compact)
   */
  getSampledTrajectory(maxPoints = 30) {
    // Since we already limit to 30 points, just return all
    if (this.trajectory.length <= maxPoints) {
      return [...this.trajectory];
    }
    
    // Sample evenly if somehow exceeded
    const step = Math.floor(this.trajectory.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < this.trajectory.length; i += step) {
      sampled.push([...this.trajectory[i]]);
      if (sampled.length >= maxPoints) break;
    }
    return sampled;
  }

  /**
   *  Enhanced cleanup method
   */
  cleanup() {
    // Clear arrays
    if (this.trajectory) {
      this.trajectory.length = 0;
      this.trajectory = null;
    }
    
    if (this.behaviorQueue) {
      this.behaviorQueue.length = 0;
      this.behaviorQueue = null;
    }
    
    if (this.velocity) {
      this.velocity.length = 0;
      this.velocity = null;
    }
    
    if (this.previousPosition) {
      this.previousPosition.length = 0;
      this.previousPosition = null;
    }
    
    // Clear references
    this.body = null;
    this.targetPosition = null;
    this.currentBehavior = null;
    this.rareEventChain = null;
    
    // Clear map
    if (this.stateHistory) {
      this.stateHistory.clear();
      this.stateHistory = null;
    }
  }
}

export default Agent;