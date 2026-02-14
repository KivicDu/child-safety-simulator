import RAPIER from '@dimforge/rapier3d-compat';

class PhysicsEngine {
  constructor() {
    this.world = null;
    this.rapier = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    console.log('🔧 Initializing Rapier3D physics engine...');
    await RAPIER.init();
    this.rapier = RAPIER;
    
    // Create physics world
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.world = new RAPIER.World(gravity);
    
    this.initialized = true;
    console.log('✅ Physics engine initialized');
  }

  createWorld() {
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    return new this.rapier.World(gravity);
  }

  // Create box collider from bounding box
  createBoxCollider(world, bbox, isStatic = true, isSensor = false) {
    const size = [
      (bbox.max[0] - bbox.min[0]) / 2,
      (bbox.max[1] - bbox.min[1]) / 2,
      (bbox.max[2] - bbox.min[2]) / 2
    ];
    
    const center = [
      (bbox.min[0] + bbox.max[0]) / 2,
      (bbox.min[1] + bbox.max[1]) / 2,
      (bbox.min[2] + bbox.max[2]) / 2
    ];

    // Create rigid body
    const rigidBodyDesc = isStatic 
      ? this.rapier.RigidBodyDesc.fixed()
      : this.rapier.RigidBodyDesc.dynamic();

    rigidBodyDesc.setTranslation(center[0], center[1], center[2]);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Create collider
    let colliderDesc = this.rapier.ColliderDesc.cuboid(
      size[0], size[1], size[2]
    ).setFriction(0.6).setRestitution(0.0)
     .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    if (isSensor) {
      colliderDesc = colliderDesc.setSensor(true);
    }
    const collider = world.createCollider(colliderDesc, rigidBody);

    return { body: rigidBody, collider };
  }

  // Create floor plane collider
  createFloorCollider(world, floorHeight, size = 50) {
    const rigidBodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(0, floorHeight, 0);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    const colliderDesc = this.rapier.ColliderDesc.cuboid(
      size, 0.1, size // Large thin box
    )
      .setFriction(0.9)
      .setRestitution(0.0)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    const collider = world.createCollider(colliderDesc, rigidBody);

    return { body: rigidBody, collider };
  }

  // Create agent with multiple body parts (Head, Torso, Legs) for precise injury tracking
  createAgentMultipartCollider(world, position, height = 1.0, radius = 0.25) {
    const minY = (height / 2) + 0.05;
    const posY = (typeof position[1] === 'number') ? position[1] : minY;

    // 1. Single Kinematic RigidBody (Controls overall movement)
    const rigidBodyDesc = this.rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position[0], posY, position[2]);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    const parts = {};
    const halfH = height / 2;
    
    // 2. HEAD Collider (Sphere at top)
    // Radius ~ 0.12m, Offset ~ Top of agent
    const headRadius = 0.12;
    const headOffset = halfH - headRadius;
    const headDesc = this.rapier.ColliderDesc.ball(headRadius)
      .setTranslation(0, headOffset, 0)
      .setFriction(0.3)
      .setRestitution(0.2)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED | this.rapier.ActiveCollisionTypes.DEFAULT);
    parts.head = world.createCollider(headDesc, rigidBody);

    // 3. TORSO Collider (Cylinder/Capsule in middle)
    // Height ~ 40% of total, Offset ~ Just below head
    const torsoHeight = height * 0.4;
    const torsoOffset = headOffset - headRadius - (torsoHeight / 2);
    const torsoDesc = this.rapier.ColliderDesc.capsule(torsoHeight / 2, radius * 0.9)
      .setTranslation(0, torsoOffset, 0)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED | this.rapier.ActiveCollisionTypes.DEFAULT);
    parts.torso = world.createCollider(torsoDesc, rigidBody);

    // 4. LEGS Collider (Capsule at bottom)
    // Remaining height
    const legsHeight = height * 0.4;
    const legsOffset = -halfH + (legsHeight / 2);
    const legsDesc = this.rapier.ColliderDesc.capsule(legsHeight / 2, radius * 0.8)
      .setTranslation(0, legsOffset, 0)
      .setFriction(0.1) // Lower friction for sliding
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED | this.rapier.ActiveCollisionTypes.DEFAULT);
    parts.legs = world.createCollider(legsDesc, rigidBody);

    return { body: rigidBody, colliders: parts };
  }

  // Step with EventQueue support and proper timestep
  step(world, deltaTime = 1/60, eventQueue = null) {
    world.timestep = deltaTime;
    
    if (eventQueue) {
      world.step(eventQueue);
    } else {
      world.step();
    }
  }

  // Helper to create handle maps for collision detection
  createHandleMap(bodies, keyExtractor = (body) => body.id) {
    const map = new Map();
    bodies.forEach(body => {
      if (body.body && body.body.handle !== undefined) {
        map.set(body.body.handle, body);
      }
    });
    return map;
  }

  // Process collision events with callback
  processCollisions(eventQueue, handleToAgent, handleToCollider, callback) {
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;

      const agent = handleToAgent.get(handle1) || handleToAgent.get(handle2);
      const collider = handleToCollider.get(handle1) || handleToCollider.get(handle2);

      if (agent && collider) {
        callback(agent, collider, handle1, handle2);
      }
    });
  }

  /**
   * 🔥 ENHANCED: Get contact point with geometric fallback
   * 
   * Rapier's contactPair manifold may be empty at the same step
   * the collision event fires. When that happens, we compute
   * a geometric approximation from collider positions.
   */
  getContactPoint(world, collider1, collider2) {
    let contactData = null;
    let maxDepth = -Infinity;

    // Try Rapier manifold first
    try {
      world.contactPair(collider1, collider2, (manifold) => {
        const numContacts = manifold.numContacts();
        
        if (numContacts === 0) return;

        for (let i = 0; i < numContacts; i++) {
          const point = manifold.contactPoint(i);
          const normal = manifold.contactNormal(i);
          const depth = manifold.contactDist(i);

          if (depth > maxDepth) {
            maxDepth = depth;
            
            contactData = {
              position: [point.x, point.y, point.z],
              normal: [normal.x, normal.y, normal.z],
              depth: depth,
              contactCount: numContacts,
              source: 'manifold'
            };
          }
        }
      });
    } catch (e) {
      // contactPair may fail if colliders are invalid
    }

    // 🔥 GEOMETRIC FALLBACK: if manifold is empty, compute from collider positions
    if (!contactData) {
      try {
        const parent1 = collider1.parent();
        const parent2 = collider2.parent();
        
        if (parent1 && parent2) {
          const t1 = parent1.translation();
          const t2 = parent2.translation();
          
          // Contact point = midpoint between collider centers
          const midX = (t1.x + t2.x) / 2;
          const midY = (t1.y + t2.y) / 2;
          const midZ = (t1.z + t2.z) / 2;
          
          // Normal = direction from collider2 to collider1
          const dx = t1.x - t2.x;
          const dy = t1.y - t2.y;
          const dz = t1.z - t2.z;
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          
          contactData = {
            position: [midX, midY, midZ],
            normal: [dx / len, dy / len, dz / len],
            depth: 0,
            contactCount: 1,
            source: 'geometric'
          };
        }
      } catch (e) {
        // Fallback also failed
      }
    }

    return contactData;
  }

  /**
   * 🔥 NEW: Get all contact points for detailed analysis
   * Useful for complex collision scenarios
   */
  getAllContactPoints(world, collider1, collider2) {
    const contacts = [];

    world.contactPair(collider1, collider2, (manifold) => {
      const numContacts = manifold.numContacts();
      
      for (let i = 0; i < numContacts; i++) {
        const point = manifold.contactPoint(i);
        const normal = manifold.contactNormal(i);
        const depth = manifold.contactDist(i);

        contacts.push({
          position: [point.x, point.y, point.z],
          normal: [normal.x, normal.y, normal.z],
          depth: depth
        });
      }
    });

    return contacts;
  }

  /**
   * 🔥 NEW: Check if two colliders are currently in contact
   */
  areInContact(world, collider1, collider2) {
    let inContact = false;

    world.contactPair(collider1, collider2, (manifold) => {
      if (manifold.numContacts() > 0) {
        inContact = true;
      }
    });

    return inContact;
  }

  /**
   * 🔥 NEW: Get contact impulse for injury calculation
   */
  getContactImpulse(world, collider1, collider2) {
    let maxImpulse = 0;

    world.contactPair(collider1, collider2, (manifold) => {
      const numContacts = manifold.numContacts();
      
      for (let i = 0; i < numContacts; i++) {
        const impulse = manifold.contactImpulse(i);
        if (impulse > maxImpulse) {
          maxImpulse = impulse;
        }
      }
    });

    return maxImpulse;
  }
}

const engine = new PhysicsEngine();
export default engine;