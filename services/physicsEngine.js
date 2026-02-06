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
  createBoxCollider(world, bbox, isStatic = true) {
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
    const colliderDesc = this.rapier.ColliderDesc.cuboid(
      size[0], size[1], size[2]
    );
    world.createCollider(colliderDesc, rigidBody);

    return rigidBody;
  }

  // Create floor plane collider
  createFloorCollider(world, floorHeight, size = 50) {
    const rigidBodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(0, floorHeight, 0);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    const colliderDesc = this.rapier.ColliderDesc.cuboid(
      size, 0.1, size // Large thin box
    );
    world.createCollider(colliderDesc, rigidBody);

    return rigidBody;
  }

  // Create agent capsule collider
  createAgentCollider(world, position, height = 1.0, radius = 0.3) {
    const rigidBodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(position[0], position[1], position[2])
      .lockRotations(); // Prevent agent from falling over
    
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Capsule collider (child's body)
    const colliderDesc = this.rapier.ColliderDesc.capsule(
      height / 2, // half-height
      radius
    );
    
    world.createCollider(colliderDesc, rigidBody);

    return rigidBody;
  }

  step(world, deltaTime = 1/60) {
    world.step();
  }
}

const engine = new PhysicsEngine();
export default engine;