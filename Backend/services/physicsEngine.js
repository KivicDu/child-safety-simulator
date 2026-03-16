// ─────────────────────────────────────────────────────────────────────────────
// physicsEngine.js  — v4
//
// FIXES v4 (Report Priority 1 + 4):
//  • [P1] getFloorHeightAt: removed hidden y+0.3 offset. Origin = exact y.
//    hitY = y - toi (not origin.y + dir.y*t with offset).
//    Old hidden offset caused spawn hovering/sinking and DBC false-positives.
//  • [P4] createHandSensors: new method — creates two kinematic sensor spheres
//    (left/right hand) for reach-based object interaction instead of torso collision.
//  • [P4] updateHandSensorPositions: new method — repositions hand sensors each
//    frame to match agent body pos + heading-relative arm extension.
//
// BUG FIX v3:
//  • [FIX BOUNCE BUG] createAgentMultipartCollider: caller passes FEET position
//    (floor Y + 0.02). Engine internally adds halfH to centre the body.
//    Previously, both the caller AND the engine were adding halfH → body spawned
//    halfH above the floor, causing gravity → bounce → KCC push → infinite loop.
//    Contract is now explicit: position[1] = feet Y. Engine owns the +halfH.
//
//  • [FIX FALL HEIGHT] getBodyCenterY / getFeetY helpers added so agent.js can
//    convert between body-centre (Rapier translation) and feet Y without
//    hardcoding halfH everywhere. Fixes free_fall height calculation that used
//    pos.y (centre) - spawnY (feet) → always positive even on flat ground.
//
// All other API surface preserved (no breaking changes).
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

  // ── [Phase 4] Foot-Ground Contact Friction Matrices ──────────────────────
  getFrictionForMovement(movementType, floorSurface = 'hardwood') {
    const frictionMatrix = {
      walk:  { hardwood: 0.5, carpet: 0.7 },
      run:   { hardwood: 0.4, carpet: 0.65 },
      crawl: { hardwood: 0.6, carpet: 0.8 },
      lunge: { hardwood: 0.3, carpet: 0.5 },
    };
    const actionFriction = frictionMatrix[movementType] || frictionMatrix.walk;
    return actionFriction[floorSurface] || 0.5;
  }

  // ── [FIX v3] Height conversion helpers ───────────────────────────────────
  /**
   * Given a feet Y (floor surface) and agent height, return the body-centre Y
   * that Rapier stores as rigidBody.translation().y
   */
  getBodyCenterY(feetY, agentHeight) {
    return feetY + (agentHeight / 2);
  }

  /**
   * Given the body-centre Y (from rigidBody.translation().y) and agent height,
   * return the feet Y (what was passed to createAgentMultipartCollider as position[1]).
   */
  getFeetY(bodyCenterY, agentHeight) {
    return bodyCenterY - (agentHeight / 2);
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

    // [BUG-A FIX] fixed↔kinematic collision events cần KINEMATIC_FIXED opt-in
    const activeColTypes = this.rapier.ActiveCollisionTypes.DEFAULT
      | this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED;

    let colliderDesc = this.rapier.ColliderDesc
      .cuboid(size[0], size[1], size[2])
      .setFriction(0.6)
      .setRestitution(0.0)
      .setActiveEvents(activeEvents)
      .setActiveCollisionTypes(isSensor ? this.rapier.ActiveCollisionTypes.DEFAULT : activeColTypes);
    if (isSensor) colliderDesc = colliderDesc.setSensor(true);

    const collider = world.createCollider(colliderDesc, rigidBody);
    return { body: rigidBody, collider };
  }

  // ── OBB & Compound Collider for scene objects ────────────────────────────
  createCompoundOBBCollider(world, obbData, proxyColliders = [], isStatic = true, isSensor = false) {
    const rigidBodyDesc = isStatic
      ? this.rapier.RigidBodyDesc.fixed()
      : this.rapier.RigidBodyDesc.dynamic();

    rigidBodyDesc.setTranslation(obbData.center[0], obbData.center[1], obbData.center[2]);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    let activeEvents = this.rapier.ActiveEvents.COLLISION_EVENTS;
    if (isSensor) {
      activeEvents = activeEvents | this.rapier.ActiveEvents.INTERSECTION_EVENTS;
    }

    // [BUG-A FIX] fixed↔kinematic collision events cần KINEMATIC_FIXED opt-in
    const _obbActiveColTypes = this.rapier.ActiveCollisionTypes.DEFAULT
      | this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED;

    const colliders = [];

    if (proxyColliders && proxyColliders.length > 0) {
      proxyColliders.forEach(proxy => {
        let colliderDesc = this.rapier.ColliderDesc
          .cuboid(proxy.extents[0], proxy.extents[1], proxy.extents[2])
          .setFriction(0.6)
          .setRestitution(0.0)
          .setActiveEvents(activeEvents)
          .setActiveCollisionTypes(isSensor ? this.rapier.ActiveCollisionTypes.DEFAULT : _obbActiveColTypes);

        if (isSensor) colliderDesc = colliderDesc.setSensor(true);

        const localX = proxy.center[0] - obbData.center[0];
        const localY = proxy.center[1] - obbData.center[1];
        const localZ = proxy.center[2] - obbData.center[2];

        colliderDesc.setTranslation(localX, localY, localZ);
        colliderDesc.setRotation({ x: proxy.rotation[0], y: proxy.rotation[1], z: proxy.rotation[2], w: proxy.rotation[3] });

        colliders.push(world.createCollider(colliderDesc, rigidBody));
      });
    } else {
      let colliderDesc = this.rapier.ColliderDesc
        .cuboid(obbData.extents[0], obbData.extents[1], obbData.extents[2])
        .setFriction(0.6)
        .setRestitution(0.0)
        .setActiveEvents(activeEvents)
        .setActiveCollisionTypes(isSensor ? this.rapier.ActiveCollisionTypes.DEFAULT : _obbActiveColTypes);

      if (isSensor) colliderDesc = colliderDesc.setSensor(true);

      colliderDesc.setRotation({ x: obbData.rotation[0], y: obbData.rotation[1], z: obbData.rotation[2], w: obbData.rotation[3] });

      colliders.push(world.createCollider(colliderDesc, rigidBody));
    }

    return { body: rigidBody, colliders, collider: colliders[0] };
  }

  // ── Floor collider ────────────────────────────────────────────────────────
  createFloorCollider(world, floorHeight, size = 50) {
    const rigidBodyDesc = this.rapier.RigidBodyDesc
      .fixed()
      .setTranslation(0, floorHeight - 0.1, 0);
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
   *
   * CONTRACT (v3 — fixes bounce bug):
   *   position[1] = FEET Y (floor surface Y + small offset, e.g. actualFloorY + 0.02).
   *   This function adds halfH internally to place the body centre correctly.
   *   Callers must NOT pre-add halfH. The old v2 contract was ambiguous; v3 is explicit.
   *
   * @param {object} world       - Rapier world
   * @param {number[]} position  - [x, feetY, z]  ← feetY = floor surface, NOT centre
   * @param {number} height      - real height in metres (from ageGroup.height)
   * @param {number} radius      - capsule radius (from ageGroup.capsuleRadius)
   * @param {object|null} anthropometry - from ageGroup.anthropometry
   */
  createAgentMultipartCollider(world, position, height = 1.0, radius = 0.25, anthropometry = null) {
    // Guard against NaN in position
    if (!position || !Array.isArray(position) || position.some(v => !Number.isFinite(v))) {
      console.warn('[PhysicsEngine] NaN in agent spawn position:', position);
      position = [0, 0.02, 0];
    }
    const safeHeight = Number.isFinite(height) ? height : 1.0;

    // ── [FIX v3] Body centre Y = feet Y + halfH ───────────────────────────
    // position[1] is the FEET position (floor surface + tiny offset).
    // We compute the body centre here — callers must not add halfH themselves.
    const halfH  = safeHeight / 2;
    const feetY  = position[1];                 // explicit alias for clarity
    const centreY = feetY + halfH;              // Rapier body origin = centre of capsule stack

    const rigidBodyDesc = this.rapier.RigidBodyDesc
      .kinematicPositionBased()
      .setTranslation(position[0], centreY, position[2]);
    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Derive from anthropometry or sensible proportional fallbacks
    const headRadius  = anthropometry?.headRadius   ?? height * 0.12;
    const torsoLength = anthropometry?.torsoLength   ?? height * 0.40;
    const torsoRadius = anthropometry?.torsoRadius   ?? radius * 0.9;
    const legLength   = anthropometry?.legLength     ?? height * 0.40;

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
    // Lowest point of legs capsule = legsOffset - (legLength/2 + radius*0.75) = -halfH (feet)
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

    // Explicit Center of Mass shift for top-heavy infants
    const headRatio = anthropometry?.headHeightRatio ?? 0.15;
    const baseMass = 10.0;
    let comYShift = headRatio > 0.15 ? (headRatio - 0.15) * safeHeight * 2.0 : 0;
    if (!Number.isFinite(comYShift)) comYShift = 0;

    rigidBody.setAdditionalMassProperties(
      baseMass,
      { x: 0, y: comYShift, z: 0 },
      { x: 1, y: 1, z: 1 },
      { w: 1, x: 0, y: 0, z: 0 }
    );

    return { body: rigidBody, colliders: parts };
  }

  // ── Character controller (anti-clip) ─────────────────────────────────────
  createCharacterController(world, offset = 0.02, maxStepHeight = 0.3) {
    const controller = world.createCharacterController(offset);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.setMaxSlopeClimbAngle(45 * Math.PI / 180);
    controller.setMinSlopeSlideAngle(30 * Math.PI / 180);
    controller.enableAutostep(maxStepHeight, 0.2, true);
    controller.enableSnapToGround(0.2);
    controller.setSlideEnabled(true);
    return controller;
  }

  // ── Move agent respecting collisions ─────────────────────────────────────
  moveAgentWithController(world, controller, rigidBody, collider, desiredMove, deltaTime) {
    if (!controller || !rigidBody || !collider) return desiredMove;

    if (!Number.isFinite(desiredMove.x) || !Number.isFinite(desiredMove.y) || !Number.isFinite(desiredMove.z)) {
      console.warn('[PhysicsEngine] NaN detected in desiredMove:', desiredMove);
      return { x: 0, y: 0, z: 0 };
    }

    try {
      controller.computeColliderMovement(collider, desiredMove);
      const corrected = controller.computedMovement();

      // [PERF-FIX-5] MoveDebug log đã disabled.
      // if (Math.random() < 0.05) {
      //   const pos = rigidBody.translation();
      //   console.log(`[MoveDebug] ...`);
      // }

      // pos phải được khai báo ở đây (độc lập với MoveDebug block ở trên)
      const pos = rigidBody.translation();

      const newPos = {
        x: pos.x + corrected.x,
        y: pos.y + corrected.y,
        z: pos.z + corrected.z,
      };

      if (Number.isFinite(newPos.x) && Number.isFinite(newPos.y) && Number.isFinite(newPos.z)) {
        rigidBody.setNextKinematicTranslation(newPos);
      }

      return corrected;
    } catch (err) {
      console.warn('[PhysicsEngine] moveAgentWithController error:', err.message);
      return desiredMove;
    }
  }

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

  getContactPoint(world, collider1, collider2) {
    let contactData = null;
    let maxDepth    = -Infinity;

    // Method 1: contactPair — works for dynamic/dynamic and some kinematic/fixed pairs
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

    if (contactData) return contactData;

    // Method 2: intersectColliders — works for kinematic+trimesh pairs where
    // contactPair returns no manifold. Uses shape overlap test instead.
    // [CONTACT-FIX] Rapier contactPair does NOT reliably generate manifolds for
    // kinematic_position_based ↔ fixed_trimesh pairs (known Rapier limitation).
    // intersectColliders is a broader overlap test that always works for these pairs.
    try {
      let hasIntersection = false;
      world.intersectionPair(collider1, collider2, (intersecting) => {
        hasIntersection = intersecting;
      });

      // intersectionPair didn't work — try contactsWith as alternative
      if (!hasIntersection) {
        world.contactsWith(collider1, (other) => {
          if (other.handle === collider2.handle) hasIntersection = true;
        });
      }

      if (hasIntersection) {
        // Use geometric fallback: midpoint between collider centers
        const p1 = collider1.parent();
        const p2 = collider2.parent();
        if (p1 && p2) {
          const t1 = p1.translation(), t2 = p2.translation();
          const dx = t1.x - t2.x, dy = t1.y - t2.y, dz = t1.z - t2.z;
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const nx = dx / len, ny = dy / len, nz = dz / len;
          const shift = Math.min(0.15, len * 0.3);
          return {
            position: [t2.x + nx * shift, t2.y + ny * shift, t2.z + nz * shift],
            normal: [nx, ny, nz],
            depth: 0.01,
            contactCount: 1,
            source: 'intersection',
          };
        }
      }
    } catch (_) {}

    // Method 3: Pure geometric fallback using parent body translations
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
   *
   * CONTRACT v4 (Priority 1 fix):
   *   Origin is exactly (x, y, z) — NO hidden offset.
   *   hitY = y - toi  (direction.y = -1, so hitPoint.y = origin.y + (-1)*toi)
   *   Callers must pass y = agentFeetY or agentFeetY + small_clearance,
   *   NOT y = bodyCentreY.  The old hidden +0.3 caused hitY errors of ±0.3m,
   *   leading to spawn hovering and DBC false-positive falls.
   *
   * @param {object} world
   * @param {number} x
   * @param {number} y        - ray origin Y (pass feet-level or slightly above)
   * @param {number} z
   * @param {number} floorFallback
   * @param {number} maxDistance
   * @param {object|null} agentBodyToIgnore
   */
  getFloorHeightAt(world, x, y, z, floorFallback = 0, maxDistance = 10, agentBodyToIgnore = null) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return floorFallback;

    try {
      if (!world || isNaN(x) || isNaN(y) || isNaN(z)) return floorFallback;

      const ray = new this.rapier.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
      
      // [FIX] rapier3d-compat@0.19.3 uses flat argument signature for filtering:
      // castRay(ray, maxToi, solid, filterFlags, filterGroups, excludeCollider, excludeRigidBody)
      // Using 0x2 (EXCLUDE_KINEMATIC) ensures we ignore all agents (which are kinematic).
      const hit = world.castRay(ray, maxDistance, true, 2);

      if (hit) {
        const t = hit.toi ?? hit.timeOfImpact ?? 0;
        const hitY = y - t;
        return Math.max(hitY, floorFallback);
      }
    } catch (err) {
      console.warn(`[PhysicsEngine] getFloorHeightAt error: ${err.message}`);
    }
    return floorFallback;
  }

  // ── Hand Interaction Sensors (Priority 4) ────────────────────────────────
  /**
   * Creates two Kinematic sensor spheres representing Left and Right hand positions.
   * These are NOT attached as child colliders to the agent body — they are independent
   * fixed bodies that the agent's update() loop repositions each frame by mirroring
   * the agent's body position + a hand-reach offset.
   *
   * Usage:
   *   const { left, right } = physicsEngine.createHandSensors(world, height, radius);
   *   // each frame: physicsEngine.updateHandSensorPositions(left, right, bodyPos, heading, ag)
   *   // drain intersectionEvents to detect what the hands are touching
   *
   * @param {object} world
   * @param {number} height      - agent height (m)
   * @param {number} capsuleRadius
   * @param {object|null} anthropometry
   * @returns {{ left: {body, collider}, right: {body, collider} }}
   */
  createHandSensors(world, height, capsuleRadius, anthropometry = null) {
    const handR = anthropometry?.handRadius ?? Math.max(0.04, capsuleRadius * 0.35);

    const makeSensor = (x0, y0, z0) => {
      const bodyDesc = this.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(x0, y0, z0);
      const body = world.createRigidBody(bodyDesc);
      const colliderDesc = this.rapier.ColliderDesc.ball(handR)
        .setSensor(true)
        .setActiveEvents(
          this.rapier.ActiveEvents.INTERSECTION_EVENTS |
          this.rapier.ActiveEvents.COLLISION_EVENTS
        );
      const collider = world.createCollider(colliderDesc, body);
      return { body, collider };
    };

    // Initial positions are arbitrary — updateHandSensorPositions sets them every frame
    return {
      left:  makeSensor(0, 0, 0),
      right: makeSensor(0, 0, 0),
    };
  }

  /**
   * Reposition hand sensors each physics frame to match agent's body + heading.
   * Call this BEFORE physicsEngine.step() so sensors are in the right place
   * when the event queue is drained.
   *
   * @param {{body}} leftSensor
   * @param {{body}} rightSensor
   * @param {{x,y,z}} bodyPos   - agent body translation (centre Y)
   * @param {number}  heading   - agent's current heading in radians
   * @param {number}  height    - agent height
   * @param {object|null} anthropometry
   */
  updateHandSensorPositions(leftSensor, rightSensor, bodyPos, heading, height, anthropometry = null) {
    if (!leftSensor?.body || !rightSensor?.body) return;

    const armLength   = anthropometry?.armLength   ?? height * 0.30;
    const shoulderY   = anthropometry?.torsoLength ?? height * 0.40;
    const halfH       = height / 2;

    // Shoulder height in body-local frame (measured from body centre)
    const handY = bodyPos.y - halfH + shoulderY * 0.70;

    // Hands extended forward-left and forward-right relative to heading
    const fwdX = Math.cos(heading), fwdZ = Math.sin(heading);
    const latX = -fwdZ,            latZ =  fwdX;   // perpendicular left

    const reach = armLength * 0.75; // 75% arm extension for normal reach

    const lx = bodyPos.x + fwdX * reach * 0.5 + latX * reach * 0.5;
    const lz = bodyPos.z + fwdZ * reach * 0.5 + latZ * reach * 0.5;
    const rx = bodyPos.x + fwdX * reach * 0.5 - latX * reach * 0.5;
    const rz = bodyPos.z + fwdZ * reach * 0.5 - latZ * reach * 0.5;

    if (Number.isFinite(lx) && Number.isFinite(lz)) {
      leftSensor.body.setNextKinematicTranslation({ x: lx, y: handY, z: lz });
    }
    if (Number.isFinite(rx) && Number.isFinite(rz)) {
      rightSensor.body.setNextKinematicTranslation({ x: rx, y: handY, z: rz });
    }
  }
  /**
   * Returns per-part shape descriptors matching createAgentMultipartCollider geometry.
   * centerOffsetY values are relative to the BODY CENTRE (= feetY + halfH).
   */
  getAgentSpawnShapes(height, radius, anthro = null) {
    const halfH       = height / 2;
    const headRadius  = anthro?.headRadius   ?? height * 0.12;
    const torsoLength = anthro?.torsoLength  ?? height * 0.40;
    const torsoRadius = anthro?.torsoRadius  ?? radius  * 0.9;
    const legLength   = anthro?.legLength    ?? height  * 0.40;

    return [
      // HEAD sphere
      {
        shape:         this.rapier.Ball,
        params:        [headRadius],
        centerOffsetY: halfH - headRadius,
      },
      // TORSO capsule
      {
        shape:         this.rapier.Capsule,
        params:        [torsoLength / 2, torsoRadius],
        centerOffsetY: (halfH - headRadius) - headRadius - torsoLength / 2,
      },
      // LEGS capsule
      {
        shape:         this.rapier.Capsule,
        params:        [legLength / 2, radius * 0.75],
        centerOffsetY: -halfH + legLength / 2 + radius * 0.75,
      },
    ];
  }

  // ── Trimesh Collider — mesh-accurate static collision ─────────────────
  /**
   * Creates a static trimesh (triangle mesh) collider that exactly matches the
   * original 3D mesh geometry — no convex approximation, no phantom walls.
   *
   * WHY TRIMESH INSTEAD OF CONVEX HULL:
   *   Convex hull wraps a concave object (chair, table) with an inflated shell,
   *   creating invisible walls in open spaces (e.g. the gap under a table).
   *   Trimesh uses the exact triangles, so collision matches the visual mesh 1:1.
   *   Trade-off: trimesh is ~2× slower per query than convex hull, but for
   *   a typical indoor scene with <200 objects this is negligible.
   *
   * IMPORTANT: Rapier trimesh is ONLY valid for fixed/static bodies.
   *   Dynamic objects must use convex hull or compound convex.
   *
   * @param {object}        world
   * @param {number[]|Float32Array} vertices - flat [x0,y0,z0, x1,y1,z1, ...] in world space
   * @param {number[]|Uint32Array}  indices  - flat [i0,i1,i2, ...] triangle indices
   * @param {number[]}      center           - [cx,cy,cz] rigid body world position
   * @param {boolean}       isSensor
   * @returns {{ body, collider } | null}
   */
  createTrimeshCollider(world, vertices, indices, center, isSensor = false) {
    if (!vertices || vertices.length < 9)  return null;  // need ≥ 3 vertices
    if (!indices  || indices.length  < 3)  return null;  // need ≥ 1 triangle

    const bodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(center[0], center[1], center[2]);
    const body = world.createRigidBody(bodyDesc);

    // Convert to typed arrays (Rapier requires Float32Array / Uint32Array)
    const rawVerts   = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
    const rawIndices = indices  instanceof Uint32Array  ? indices  : new Uint32Array(indices);

    // Offset vertices to body-local space (body origin = center)
    const localVerts = new Float32Array(rawVerts.length);
    for (let i = 0; i < rawVerts.length; i += 3) {
      localVerts[i]     = rawVerts[i]     - center[0];
      localVerts[i + 1] = rawVerts[i + 1] - center[1];
      localVerts[i + 2] = rawVerts[i + 2] - center[2];
    }

    // ── [RC#2 FIX] Double-sided trimesh ─────────────────────────────────────
    // Rapier trimesh is ONE-SIDED by default: castRay only hits the FRONT face
    // (the side the face normal points toward). GLB floor meshes exported from
    // Blender/Maya frequently have normals pointing DOWN (CW winding when viewed
    // from above) — a downward ray from above hits the BACK face and is IGNORED.
    //
    // Consequence: confirmFloorSurface → 0 hits → confirmedFloorY stays at
    // estimate, buildWalkableGrid → 0 cells, all agents fall through last-resort,
    // KCC ground detection fails, _vertVel accumulates → agents escape UP.
    //
    // Fix: duplicate every triangle with reversed winding (i2, i1, i0).
    // This makes the mesh double-sided: castRay hits it from both directions.
    // Memory cost: 2× index array (vertices unchanged). For a 1000-tri floor
    // mesh: extra 6000 bytes — negligible.
    //
    // Alternative (newer Rapier API): ColliderDesc.trimesh(verts, indices, TriMeshFlags.ORIENTED)
    // but this flag is not available in all rapier3d-compat versions.
    const triCount     = rawIndices.length / 3;
    const doubleSided  = new Uint32Array(rawIndices.length * 2);
    doubleSided.set(rawIndices, 0);                          // original winding
    for (let t = 0; t < triCount; t++) {
      const base   = t * 3;
      const dest   = rawIndices.length + base;
      doubleSided[dest]     = rawIndices[base + 2];         // reversed: i2, i1, i0
      doubleSided[dest + 1] = rawIndices[base + 1];
      doubleSided[dest + 2] = rawIndices[base];
    }

    let colliderDesc = this.rapier.ColliderDesc.trimesh(localVerts, doubleSided);
    if (!colliderDesc) {
      console.warn('[PhysicsEngine] trimesh returned null — degenerate geometry, falling back');
      world.removeRigidBody(body);
      return null;
    }

    let activeEvents = this.rapier.ActiveEvents.COLLISION_EVENTS;
    if (isSensor) activeEvents |= this.rapier.ActiveEvents.INTERSECTION_EVENTS;

    // [BUG-A FIX] Trimesh là fixed body, agent là kinematic body.
    // Rapier mặc định KHÔNG fire collision events cho fixed↔kinematic pairs.
    // Phải set KINEMATIC_FIXED trên collider để opt-in vào loại pair này.
    // Không set → drainCollisionEvents() không bao giờ nhận được pair nào
    // → contactCandidates = 0 mãi mãi dù agents đang va chạm thực sự.
    const activeColTypes = this.rapier.ActiveCollisionTypes.DEFAULT
      | this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED;

    colliderDesc
      .setFriction(0.6)
      .setRestitution(0.0)
      .setActiveEvents(activeEvents)
      .setActiveCollisionTypes(activeColTypes);
    if (isSensor) colliderDesc.setSensor(true);

    const collider = world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  // ── Best-fit Collider: Trimesh > ConvexHull > OBB > AABB ──────────────
  /**
   * Tự động chọn collider tốt nhất cho một scene object.
   * Ưu tiên: Trimesh (mesh gốc) > ConvexHull > OBB > AABB
   *
   * [COLLISION-ACCURACY FIX] AABB và OBB đều là xấp xỉ — chúng tạo ra
   * "phantom walls" trong không gian rỗng (ví dụ: gầm bàn, ghế rỗng).
   * Trimesh dùng triangle mesh gốc → collision 1:1 với visual mesh.
   *
   * @param {object} world
   * @param {object} sceneObject  - object từ sceneData.objects có .collisionMesh, .boundingBox, .obb
   * @param {boolean} isSensor
   * @returns {{ body, collider, collidersArr?, type: string } | null}
   */
  createBestFitCollider(world, sceneObject, isSensor = false) {
    const bbox = sceneObject.boundingBox;

    // ── Priority 1: Trimesh từ collisionMesh (mesh-accurate) ──────────────
    if (sceneObject.collisionMesh?.vertices && sceneObject.collisionMesh?.indices) {
      const { vertices, indices } = sceneObject.collisionMesh;
      if (vertices.length >= 9 && indices.length >= 3) {
        const center = bbox ? [
          (bbox.min[0] + bbox.max[0]) / 2,
          (bbox.min[1] + bbox.max[1]) / 2,
          (bbox.min[2] + bbox.max[2]) / 2,
        ] : [0, 0, 0];
        const result = this.createTrimeshCollider(world, vertices, indices, center, isSensor);
        if (result) return { ...result, collidersArr: [result.collider], type: 'trimesh' };
      }
    }

    // ── Priority 2: ConvexHull từ mesh vertices (xấp xỉ lồi) ─────────────
    if (sceneObject.collisionMesh?.vertices && sceneObject.collisionMesh.vertices.length >= 12) {
      const center = bbox ? [
        (bbox.min[0] + bbox.max[0]) / 2,
        (bbox.min[1] + bbox.max[1]) / 2,
        (bbox.min[2] + bbox.max[2]) / 2,
      ] : [0, 0, 0];
      const result = this.createConvexHullCollider(world, sceneObject.collisionMesh.vertices, center, true, isSensor);
      if (result) return { ...result, collidersArr: [result.collider], type: 'convex_hull' };
    }

    // ── Priority 3: OBB (Oriented Bounding Box) nếu có rotation data ─────
    if (sceneObject.obb?.center && sceneObject.obb?.extents) {
      const result = this.createCompoundOBBCollider(
        world, sceneObject.obb, sceneObject.proxyColliders || [], true, isSensor
      );
      if (result) return { ...result, collidersArr: result.colliders || [result.collider], type: 'obb' };
    }

    // ── Priority 4: AABB fallback (bounding box đơn giản) ─────────────────
    if (bbox) {
      const result = this.createBoxCollider(world, bbox, true, isSensor);
      if (result) return { ...result, collidersArr: [result.collider], type: 'aabb' };
    }

    return null;
  }
  /**
   * After scene colliders are created, fire a 3×3 grid of downward raycasts
   * across the room center to find the EXACT top surface of the physics floor.
   *
   * Why needed:
   *   floor.height from glbParser = bounding box yMax. But the trimesh/convex
   *   collider surface may be a few mm different due to mesh curvature or
   *   floating-point. Using the raycast-confirmed Y for spawn guarantees the
   *   agent's feet land on the physics surface, not slightly above/below it.
   *
   * @param {object} world        - Rapier world (must have floor collider already)
   * @param {object} bb           - scene bounding box {min, max}
   * @param {number} estimatedFloorY - initial estimate (from floor.height)
   * @returns {number} confirmedFloorY
   */
  confirmFloorSurface(world, bb, estimatedFloorY) {
    if (!world || !bb) return estimatedFloorY;

    // [FLOOR-CONFIRM FIX v2] castFromY tăng lên +5.0 thay vì +3.0.
    // Với scene có furniture cao (giường, tủ đứng), ray từ +3.0 có thể bắt đầu
    // ngay trong furniture → hit surface của furniture thay vì floor.
    const castFromY = estimatedFloorY + 5.0;
    const maxDist   = 7.0;
    const tolerance = 0.40;

    // 3×3 grid centred on room + 4 corners (tổng 13 điểm)
    // [BUG-D FIX] Center phòng thường bị furniture che (giường ở giữa phòng ngủ)
    // → toàn bộ 9 grid points miss floor → confirmFloorSurface giữ estimate.
    // Fix: thêm 4 corner points ở 10% trong từ mép → ít bị furniture che hơn.
    const cx = (bb.min[0] + bb.max[0]) / 2;
    const cz = (bb.min[2] + bb.max[2]) / 2;
    const sw = (bb.max[0] - bb.min[0]) * 0.25;
    const sd = (bb.max[2] - bb.min[2]) * 0.25;
    const mx = (bb.max[0] - bb.min[0]) * 0.10;  // 10% margin from edge
    const mz = (bb.max[2] - bb.min[2]) * 0.10;

    const samplePoints = [];
    // 3×3 center grid
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        samplePoints.push([cx + dx * sw, cz + dz * sd]);
      }
    }
    // 4 corners (near edges, less likely blocked by furniture)
    samplePoints.push([bb.min[0] + mx, bb.min[2] + mz]);
    samplePoints.push([bb.max[0] - mx, bb.min[2] + mz]);
    samplePoints.push([bb.min[0] + mx, bb.max[2] - mz]);
    samplePoints.push([bb.max[0] - mx, bb.max[2] - mz]);

    const sampleHits = [];
    for (const [x, z] of samplePoints) {
      try {
        const ray = new this.rapier.Ray({ x, y: castFromY, z }, { x: 0, y: -1, z: 0 });
        const hit = world.castRay(ray, maxDist, true, 2);
        if (hit) {
          const hitY = castFromY - (hit.toi ?? 0);
          if (Math.abs(hitY - estimatedFloorY) < tolerance) {
            sampleHits.push(hitY);
          }
        }
      } catch (_) {}
    }

    if (sampleHits.length === 0) {
      console.warn(`[PhysicsEngine] confirmFloorSurface: no hits within ±${tolerance}m of estimate ${estimatedFloorY.toFixed(4)} — keeping estimate`);
      return estimatedFloorY;
    }

    // Cluster: find median group within 3cm of each other
    sampleHits.sort((a, b) => a - b);
    let bestCluster = [sampleHits[0]];
    let bestSize    = 1;
    for (let i = 0; i < sampleHits.length; i++) {
      const cluster = sampleHits.filter(h => Math.abs(h - sampleHits[i]) < 0.03);
      if (cluster.length > bestSize) {
        bestCluster = cluster;
        bestSize    = cluster.length;
      }
    }

    const confirmedY = bestCluster.reduce((s, v) => s + v, 0) / bestCluster.length;
    console.log(`[PhysicsEngine] ✅ Floor surface confirmed by raycast: Y=${confirmedY.toFixed(4)}m (${bestSize}/${sampleHits.length} hits in cluster, estimate was ${estimatedFloorY.toFixed(4)})`);
    return confirmedY;
  }
  /**
   * Creates a convex hull collider from raw vertex data.
   * Returns null if Rapier cannot compute a hull (degenerate vertices).
   *
   * @param {object} world
   * @param {Float32Array|number[]} vertices  - [x0,y0,z0, x1,y1,z1, ...] in world space
   * @param {number[]} center                 - [cx, cy, cz] rigid body position
   * @param {boolean} isStatic
   * @param {boolean} isSensor
   * @returns {{ body, collider } | null}
   */
  createConvexHullCollider(world, vertices, center, isStatic = true, isSensor = false) {
    if (!vertices || vertices.length < 12) return null; // need at least 4 points

    const bodyDesc = isStatic
      ? this.rapier.RigidBodyDesc.fixed()
      : this.rapier.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(center[0], center[1], center[2]);
    const body = world.createRigidBody(bodyDesc);

    // Use original vertices and offset using collider translation
    const rawVerts = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
    let colliderDesc = this.rapier.ColliderDesc.convexHull(rawVerts);

    // FALLBACK: Rapier returns null for degenerate / coplanar vertex sets
    if (!colliderDesc) {
      console.warn('[PhysicsEngine] convexHull returned null — degenerate vertices');
      world.removeRigidBody(body);
      return null;
    }

    // Offset the collider to local space
    colliderDesc.setTranslation(-center[0], -center[1], -center[2]);

    let activeEvents = this.rapier.ActiveEvents.COLLISION_EVENTS;
    if (isSensor) activeEvents |= this.rapier.ActiveEvents.INTERSECTION_EVENTS;

    // [BUG-A FIX] fixed↔kinematic collision events cần KINEMATIC_FIXED opt-in
    const _chActiveColTypes = this.rapier.ActiveCollisionTypes.DEFAULT
      | this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED;

    // NOTE: No setCollisionGroups — keep default groups so castRay queries hit this.
    colliderDesc
      .setFriction(0.6)
      .setRestitution(0.0)
      .setActiveEvents(activeEvents)
      .setActiveCollisionTypes(isSensor ? this.rapier.ActiveCollisionTypes.DEFAULT : _chActiveColTypes);
    if (isSensor) colliderDesc.setSensor(true);

    const collider = world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  // ── Decomposed (Compound) ConvexHull Collider ─────────────────────────
  /**
   * Creates a compound rigid body with one convex hull per primitive vertex set.
   * Each hull is offset relative to bodyCenter so parts are positioned correctly.
   * Returns null if ALL primitive hulls fail.
   *
   * @param {object} world
   * @param {Array<Float32Array|number[]>} primitiveVertices  - array of vertex sets
   * @param {number[]} bodyCenter                             - [cx, cy, cz]
   * @param {boolean} isStatic
   * @param {boolean} isSensor
   * @returns {{ body, colliders: Collider[], collider: Collider } | null}
   */
  createDecomposedCollider(world, primitiveVertices, bodyCenter, isStatic = true, isSensor = false) {
    if (!primitiveVertices || primitiveVertices.length === 0) return null;

    const bodyDesc = isStatic
      ? this.rapier.RigidBodyDesc.fixed()
      : this.rapier.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(bodyCenter[0], bodyCenter[1], bodyCenter[2]);
    const body = world.createRigidBody(bodyDesc);

    let activeEvents = this.rapier.ActiveEvents.COLLISION_EVENTS;
    if (isSensor) activeEvents |= this.rapier.ActiveEvents.INTERSECTION_EVENTS;

    // [BUG-A FIX] fixed↔kinematic collision events cần KINEMATIC_FIXED opt-in
    const _dcActiveColTypes = this.rapier.ActiveCollisionTypes.DEFAULT
      | this.rapier.ActiveCollisionTypes.KINEMATIC_FIXED;

    const colliders = [];

    for (const primVerts of primitiveVertices) {
      if (!primVerts || primVerts.length < 12) continue; // need ≥4 points

      // Use original vertices and offset using collider translation
      const rawVerts = primVerts instanceof Float32Array ? primVerts : new Float32Array(primVerts);
      let desc = this.rapier.ColliderDesc.convexHull(rawVerts);
      
      if (!desc) continue; // skip degenerate primitives

      // Offset the collider to local space
      desc.setTranslation(-bodyCenter[0], -bodyCenter[1], -bodyCenter[2]);

      // NOTE: No setCollisionGroups — keep default groups so castRay queries hit this.
      desc
        .setFriction(0.6)
        .setRestitution(0.0)
        .setActiveEvents(activeEvents)
        .setActiveCollisionTypes(isSensor ? this.rapier.ActiveCollisionTypes.DEFAULT : _dcActiveColTypes);
      if (isSensor) desc.setSensor(true);

      colliders.push(world.createCollider(desc, body));
    }

    if (colliders.length === 0) {
      console.warn('[PhysicsEngine] All primitive hulls failed — decomposed collider returning null');
      world.removeRigidBody(body);
      return null;
    }

    return { body, colliders, collider: colliders[0] };
  }
}

const engine = new PhysicsEngine();
export default engine;