// ─────────────────────────────────────────────────────────────────────────────
// physicsEngine.js  — v2
//
// Key changes:
//  • createAgentMultipartCollider: uses real heights from ageGroups (not guessed)
//  • createCharacterController: Rapier KinematicCharacterController to block
//    agents from passing through solid geometry
//  • moveAgentWithController: wrapper used by simulationController each step
//    instead of setNextKinematicTranslation directly → prevents clipping
//  • All existing API surface preserved (no breaking changes)
// ─────────────────────────────────────────────────────────────────────────────

import RAPIER from '@dimforge/rapier3d-compat';

class PhysicsEngine {
  constructor() {
    this.world       = null;
    this.rapier      = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    console.log('🔧 Initializing Rapier3D physics engine...');
    await RAPIER.init();
    this.rapier = RAPIER;
    this.initialized = true;
    console.log('✅ Physics engine initialized');
  }

  createWorld() {
    const gravity = { x: 0.0, y: -9.81, z: 0.0 };
    return new this.rapier.World(gravity);
  }

  // ── Box collider for scene objects ───────────────────────────────────────
  createBoxCollider(world, bbox, isStatic = true, isSensor = false) {
    const size = [
      (bbox.max[0] - bbox.min[0]) / 2,
      (bbox.max[1] - bbox.min[1]) / 2,
      (bbox.max[2] - bbox.min[2]) / 2,
    ];
    const center = [
      (bbox.min[0] + bbox.max[0]) / 2,
      (bbox.min[1] + bbox.max[1]) / 2,
      (bbox.min[2] + bbox.max[2]) / 2,
    ];

    const rigidBodyDesc = isStatic
      ? this.rapier.RigidBodyDesc.fixed()
      : this.rapier.RigidBodyDesc.dynamic();
    rigidBodyDesc.setTranslation(center[0], center[1], center[2]);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    let activeEvents = this.rapier.ActiveEvents.COLLISION_EVENTS;
    if (isSensor) {
      activeEvents = activeEvents | this.rapier.ActiveEvents.INTERSECTION_EVENTS;
    }

    let colliderDesc = this.rapier.ColliderDesc
      .cuboid(size[0], size[1], size[2])
      .setFriction(0.6)
      .setRestitution(0.0)
      .setActiveEvents(activeEvents);
    if (isSensor) colliderDesc = colliderDesc.setSensor(true);

    const collider = world.createCollider(colliderDesc, rigidBody);
    return { body: rigidBody, collider };
  }

  // ── Floor collider ────────────────────────────────────────────────────────
  createFloorCollider(world, floorHeight, size = 50) {
    const rigidBodyDesc = this.rapier.RigidBodyDesc
      .fixed()
      .setTranslation(0, floorHeight - 0.1, 0); // Translate down by half-height so top surface aligns with floorHeight
    const rigidBody  = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = this.rapier.ColliderDesc
      .cuboid(size, 0.1, size)
      .setFriction(0.9)
      .setRestitution(0.0)
      .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);
    const collider = world.createCollider(colliderDesc, rigidBody);
    return { body: rigidBody, collider };
  }

  // ── Agent multipart collider ─────────────────────────────────────────────
  /**
   * Creates a kinematic rigidbody with 3 colliders (head/torso/legs).
   * Dimensions come directly from ageGroups.js anthropometry so sizes
   * match the real child dimensions, not arbitrary defaults.
   *
   * @param {object} world       - Rapier world
   * @param {number[]} position  - [x, y, z] spawn position
   * @param {number} height      - real height in metres (from ageGroup.height)
   * @param {number} radius      - capsule radius (from ageGroup.capsuleRadius)
   * @param {object|null} anthropometry - from ageGroup.anthropometry
   */
  createAgentMultipartCollider(world, position, height = 1.0, radius = 0.25, anthropometry = null) {
    // Agent origin is placed at feet + half-height so the body is centred
    const halfH = height / 2;
    const posY  = (typeof position[1] === 'number') ? position[1] + halfH : halfH;

    const rigidBodyDesc = this.rapier.RigidBodyDesc
      .kinematicPositionBased()
      .setTranslation(position[0], posY, position[2]);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Derive from anthropometry or sensible proportional fallbacks
    const headRadius  = anthropometry?.headRadius   ?? height * 0.12;
    const torsoLength = anthropometry?.torsoLength   ?? height * 0.40;
    const torsoRadius = anthropometry?.torsoRadius   ?? radius * 0.9;
    const legLength   = anthropometry?.legLength      ?? height * 0.40;

    const parts = {};
    const KINEMATIC_FIXED = this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED
      | this.rapier.ActiveCollisionTypes.DEFAULT;
    const COL_EVENTS = this.rapier.ActiveEvents.COLLISION_EVENTS;

    // HEAD — sphere at top
    const headOffset = halfH - headRadius;
    parts.head = world.createCollider(
      this.rapier.ColliderDesc.ball(headRadius)
        .setTranslation(0, headOffset, 0)
        .setFriction(0.3)
        .setRestitution(0.1)
        .setActiveEvents(COL_EVENTS)
        .setActiveCollisionTypes(KINEMATIC_FIXED),
      rigidBody
    );

    // TORSO — capsule below head
    const torsoOffset = headOffset - headRadius - torsoLength / 2;
    parts.torso = world.createCollider(
      this.rapier.ColliderDesc.capsule(torsoLength / 2, torsoRadius)
        .setTranslation(0, torsoOffset, 0)
        .setFriction(0.5)
        .setRestitution(0.0)
        .setActiveEvents(COL_EVENTS)
        .setActiveCollisionTypes(KINEMATIC_FIXED),
      rigidBody
    );

    // LEGS — capsule at bottom
    // A Rapier capsule's total height is 2 * halfHeight + 2 * radius.
    // To ensure the lowest point is exactly at -halfH (so agent's feet sit perfectly on the floor),
    // legsOffset - (legLength / 2 + radius * 0.75) must equal -halfH.
    // Thus, legsOffset = -halfH + legLength / 2 + radius * 0.75.
    const legsOffset = -halfH + legLength / 2 + radius * 0.75;
    parts.legs = world.createCollider(
      this.rapier.ColliderDesc.capsule(legLength / 2, radius * 0.75)
        .setTranslation(0, legsOffset, 0)
        .setFriction(0.8)
        .setRestitution(0.0)
        .setActiveEvents(COL_EVENTS)
        .setActiveCollisionTypes(KINEMATIC_FIXED),
      rigidBody
    );

    // Explicit Center of Mass Shift
    // Infants are top heavy. A headRatio of 0.25 pulls the CoM significantly upwards.
    const headRatio = anthropometry?.headHeightRatio ?? 0.15;
    const baseMass = 10.0; // Arbitrary but consistent for kinematic bodies
    // Shift CoM up proportionally to how much larger the head is vs adult (~0.14)
    const comYShift = headRatio > 0.15 ? (headRatio - 0.15) * height * 2.0 : 0; 
    
    // Set custom mass properties on the rigid body
    rigidBody.setAdditionalMassProperties(
      baseMass, 
      { x: 0, y: comYShift, z: 0 }, 
      { x: 1, y: 1, z: 1 }, 
      { w: 1, x: 0, y: 0, z: 0 }
    );

    return { body: rigidBody, colliders: parts };
  }

  // ── Character controller (anti-clip) ─────────────────────────────────────
  /**
   * §Fix: KinematicCharacterController prevents agents from clipping through
   * solid geometry.  Call once per agent after creating its rigid body.
   *
   * @param {object} world       - Rapier world
   * @param {number} offset      - skin width around character (metres)
   * @param {number} maxStepHeight - max height obstacle KCC can step over automatically
   * @returns {RAPIER.KinematicCharacterController}
   */
  createCharacterController(world, offset = 0.02, maxStepHeight = 0.3) {
    const controller = world.createCharacterController(offset);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle(45 * Math.PI / 180);   // 45°
    controller.setMinSlopeSlideAngle(30 * Math.PI / 180);   // 30°
    controller.enableAutostep(maxStepHeight, 0.2, true);    // max step matches parameter
    controller.enableSnapToGround(0.2);                     // snap within 20cm
    controller.setSlideEnabled(true);                       // slide along walls
    return controller;
  }

  // ── Move agent respecting collisions ─────────────────────────────────────
  /**
   * §Fix: replaces direct setNextKinematicTranslation calls in agent.js /
   * simulationController.js.  The controller resolves collisions and returns
   * the corrected translation that Rapier will actually apply.
   *
   * @param {object} world           - Rapier world
   * @param {object} controller      - KinematicCharacterController
   * @param {object} rigidBody       - agent's rigidbody
   * @param {object} collider        - agent's primary collider (torso)
   * @param {{x,y,z}} desiredMove    - movement delta this frame
   * @param {number} deltaTime       - seconds
   * @returns {{x,y,z}} applied translation
   */
  moveAgentWithController(world, controller, rigidBody, collider, desiredMove, deltaTime) {
    if (!controller || !rigidBody || !collider) return desiredMove;

    try {
      // Compute collision-resolved movement
      controller.computeColliderMovement(collider, desiredMove);
      const corrected = controller.computedMovement();

      // Apply the corrected position
      const pos = rigidBody.translation();
      const newPos = {
        x: pos.x + corrected.x,
        y: pos.y + corrected.y,
        z: pos.z + corrected.z,
      };

      // Guard against NaN (WASM crash prevention)
      if (Number.isFinite(newPos.x) && Number.isFinite(newPos.y) && Number.isFinite(newPos.z)) {
        rigidBody.setNextKinematicTranslation(newPos);
      }

      return corrected;
    } catch (err) {
      console.warn('[PhysicsEngine] moveAgentWithController error:', err.message);
      return desiredMove;
    }
  }

  /**
   * Check if controller determined the character is grounded.
   */
  isGrounded(controller) {
    try {
      return controller.computedGrounded();
    } catch {
      return true;
    }
  }

  // ── Simulation step ───────────────────────────────────────────────────────
  step(world, deltaTime = 1 / 60, eventQueue = null) {
    world.timestep = deltaTime;
    if (eventQueue) { world.step(eventQueue); }
    else            { world.step(); }
  }

  // ── Contact helpers ───────────────────────────────────────────────────────
  createHandleMap(bodies, keyExtractor = (body) => body.id) {
    const map = new Map();
    bodies.forEach(body => {
      if (body.body && body.body.handle !== undefined) {
        map.set(body.body.handle, body);
      }
    });
    return map;
  }

  processCollisions(eventQueue, handleToAgent, handleToCollider, callback) {
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;
      const agent    = handleToAgent.get(handle1)    || handleToAgent.get(handle2);
      const collider = handleToCollider.get(handle1) || handleToCollider.get(handle2);
      if (agent && collider) callback(agent, collider, handle1, handle2);
    });
  }

  /**
   * Get contact point on the static object's surface.
   */
  getContactPoint(world, collider1, collider2) {
    let contactData = null;
    let maxDepth    = -Infinity;

    try {
      world.contactPair(collider1, collider2, (manifold) => {
        const numContacts = manifold.numContacts();
        if (numContacts === 0) return;

        for (let i = 0; i < numContacts; i++) {
          const point  = manifold.contactPoint(i);
          const normal = manifold.contactNormal(i);
          const depth  = manifold.contactDist(i);

          if (depth > maxDepth) {
            maxDepth = depth;
            const halfDepth = Math.abs(depth) * 0.5;
            contactData = {
              position: [
                point.x - normal.x * halfDepth,
                point.y - normal.y * halfDepth,
                point.z - normal.z * halfDepth,
              ],
              normal: [normal.x, normal.y, normal.z],
              depth,
              contactCount: numContacts,
              source: 'manifold',
            };
          }
        }
      });
    } catch (_) {}

    if (!contactData) {
      try {
        const p1 = collider1.parent();
        const p2 = collider2.parent();
        if (p1 && p2) {
          const t1 = p1.translation(), t2 = p2.translation();
          const dx = t1.x - t2.x, dy = t1.y - t2.y, dz = t1.z - t2.z;
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const nx = dx / len, ny = dy / len, nz = dz / len;
          const shift = Math.min(0.1, len * 0.2);
          contactData = {
            position: [t2.x + nx * shift, t2.y + ny * shift, t2.z + nz * shift],
            normal: [nx, ny, nz],
            depth: 0,
            contactCount: 1,
            source: 'geometric',
          };
        }
      } catch (_) {}
    }

    return contactData;
  }

  getAllContactPoints(world, collider1, collider2) {
    const contacts = [];
    try {
      world.contactPair(collider1, collider2, (manifold) => {
        for (let i = 0; i < manifold.numContacts(); i++) {
          const point  = manifold.contactPoint(i);
          const normal = manifold.contactNormal(i);
          contacts.push({
            position: [point.x, point.y, point.z],
            normal:   [normal.x, normal.y, normal.z],
            depth:    manifold.contactDist(i),
          });
        }
      });
    } catch (_) {}
    return contacts;
  }

  areInContact(world, collider1, collider2) {
    let inContact = false;
    try {
      world.contactPair(collider1, collider2, (manifold) => {
        if (manifold.numContacts() > 0) inContact = true;
      });
    } catch (_) {}
    return inContact;
  }

  getContactImpulse(world, collider1, collider2) {
    let maxImpulse = 0;
    try {
      world.contactPair(collider1, collider2, (manifold) => {
        for (let i = 0; i < manifold.numContacts(); i++) {
          const imp = manifold.contactImpulse(i);
          if (imp > maxImpulse) maxImpulse = imp;
        }
      });
    } catch (_) {}
    return maxImpulse;
  }

  /**
 * Downward raycast to find actual floor height at (x, z).
 * Returns floorFallback if ray misses or hits furniture (not floor).
 * Only accepts surfaces within maxStepHeight of the scene floor.
 */
getFloorHeightAt(world, x, y, z, floorFallback = 0, maxDistance = 10, agentBodyToIgnore = null) {
  try {
    // Cast from slightly above the agent's current position to allow stepping up
    const origin    = { x, y: y + 0.3, z }; 
    const direction = { x: 0, y: -1, z: 0 };
    const ray  = new this.rapier.Ray(origin, direction);
    
    // We pass agentBodyToIgnore as the filterRigidBody argument (7th positional)
    // and we also specify QueryFilterFlags.EXCLUDE_KINEMATIC (2) as the filterFlags argument (5th positional)
    // to ensure we never hit agents.
    // Signature: castRay(ray, maxToi, solid, collisionGroups, filterFlags, filterTarget, filterBody, filterCollider)
    const excludeKinematic = 2;
    const hit  = world.castRay(ray, maxDistance, true, undefined, excludeKinematic, undefined, agentBodyToIgnore, undefined);
    
    // Older Rapier JS uses timeOfImpact, newer uses toi. Handle both safely to avoid NaN coordinates
    const t = hit ? (hit.toi !== undefined ? hit.toi : hit.timeOfImpact) : null;
    if (t !== null && t !== undefined) {
      const hitY = origin.y + direction.y * t;
      // FIX: Reject furniture surfaces — only accept hits within step-up range of scene floor
      // If hit surface is > 0.3m above scene floor, it's furniture, not walkable floor
      const maxStepHeight = 0.3;
      if (hitY > floorFallback + maxStepHeight) {
        return floorFallback;  // Ignore furniture surface, use scene floor
      }
      return hitY;
    }
  } catch (_) {}
  return floorFallback;
}
}

const engine = new PhysicsEngine();
export default engine;