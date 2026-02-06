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
      this.executeRareEventStep(deltaTime, colliders);
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
    } else {
      // Pick next behavior from queue
      this.pickNextBehavior(deltaTime, bounds);
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
      // Fallback to random walk
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
        if (action.targetObjectId) {
          const targetObj = colliders.find(c => c.id === action.targetObjectId);
          if (targetObj && targetObj.boundingBox) {
            const bbox = targetObj.boundingBox;
            this.targetPosition = [
              (bbox.min[0] + bbox.max[0]) / 2,
              bbox.min[1],
              (bbox.min[2] + bbox.max[2]) / 2
            ];
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
        
      case 'reach_up':
      case 'pull':
      case 'climb_on':
        this.state = 'INTERACTING';
        // Physics simulation handles this
        break;
        
      default:
        this.state = 'IDLE';
    }
  }

  executeRareEventStep(deltaTime, colliders) {
    if (!this.rareEventChain || !this.rareEventChain.chain) return;
    
    const currentStep = this.rareEventChain.chain[this.rareEventStep];
    if (!currentStep) {
      this.participatingInRareEvent = false;
      return;
    }
    
    this.state = 'RARE_EVENT';
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
    
    // Calculate movement
    const moveX = (dx / distance) * speed * deltaTime;
    const moveZ = (dz / distance) * speed * deltaTime;
    
    // Apply velocity to rigid body
    this.body.setLinvel({ x: moveX * 60, y: 0, z: moveZ * 60 }, true);
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

  getAgeGroupData() {
    const ageGroups = {
      infant: { speed: 0.3 },
      toddler: { speed: 0.8 },
      preschool: { speed: 1.2 },
      school: { speed: 1.5 },
      preteen: { speed: 2.0 }
    };
    return ageGroups[this.ageGroupId] || ageGroups.toddler;
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