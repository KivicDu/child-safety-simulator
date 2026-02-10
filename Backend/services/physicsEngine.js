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
    ).setFriction(0.6).setRestitution(0.0);
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
      .setRestitution(0.0);
    const collider = world.createCollider(colliderDesc, rigidBody);

    return { body: rigidBody, collider };
  }

  // Create agent capsule collider with sleep disabled
  createAgentCollider(world, position, height = 1.0, radius = 0.3) {
    const minY = (height / 2) + 0.05;
    const posY = (typeof position[1] === 'number' && position[1] > minY) ? position[1] : minY;

    const rigidBodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(position[0], posY, position[2])
      .lockRotations()
      .setCanSleep(false)
      .setLinearDamping(0.0);
    
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    const colliderDesc = this.rapier.ColliderDesc.capsule(
      height / 2,
      radius
    )
      .setFriction(0.0)
      .setRestitution(0.0);

    const collider = world.createCollider(colliderDesc, rigidBody);

    rigidBody.wakeUp();

    return { body: rigidBody, collider };
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
   * 🔥 ENHANCED: Get accurate contact point and normal from Rapier collision manifold
   * 
   * @param {World} world - Rapier physics world
   * @param {Collider} collider1 - First collider (agent)
   * @param {Collider} collider2 - Second collider (object)
   * @returns {Object|null} { position: [x,y,z], normal: [nx,ny,nz], depth: float }
   */
  getContactPoint(world, collider1, collider2) {
    let contactData = null;
    let maxDepth = -Infinity;

    // Iterate through contact pairs
    world.contactPair(collider1, collider2, (manifold) => {
      // Rapier may return multiple contact manifolds
      const numContacts = manifold.numContacts();
      
      if (numContacts === 0) return;

      // Find deepest contact point (most penetrating)
      for (let i = 0; i < numContacts; i++) {
        const point = manifold.contactPoint(i);
        const normal = manifold.contactNormal(i);
        const depth = manifold.contactDist(i);

        // Use deepest contact (most significant)
        if (depth > maxDepth) {
          maxDepth = depth;
          
          contactData = {
            position: [point.x, point.y, point.z],
            normal: [normal.x, normal.y, normal.z],
            depth: depth,
            contactCount: numContacts
          };
        }
      }
    });

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