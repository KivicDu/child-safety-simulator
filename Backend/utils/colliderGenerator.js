// ─────────────────────────────────────────────────────────────────────────────
// colliderGenerator.js  — v2
//
// FIX v2 (Report Priority 2):
//  • OBB-first policy: any object with a non-identity rotation quaternion or an
//    explicit `obb` property now uses createCompoundOBBCollider instead of
//    createBoxCollider. This prevents invisible "corner walls" at rotated
//    furniture (e.g. a diagonal sofa blocking a 30 cm gap that doesn't exist).
//
//  • Thin surface thickening: floors, rugs, and mats with physics thickness
//    < 0.05 m get padded to 0.05 m so KCC snap-to-ground never tunnels through.
//
//  • Affordance injection (Priority 5 support): every returned collider metadata
//    object carries an `affordances` array. Populated from:
//      1. scene object's own `affordances` field (from glbParser / Gemini),
//      2. rule-based fallback from object name + dimensions.
//
//  • Missing-collider guard: objects with no boundingBox are silently skipped
//    and logged rather than crashing the generator.
//
// Contract: generateCollidersFromScene(sceneData, world, physicsEngine)
//   Returns: Array<ColliderMeta>
//     { id, name, type, boundingBox, collider, collidersArr?, isSoft, affordances }
// ─────────────────────────────────────────────────────────────────────────────

// Quaternion identity tolerance — anything closer than this is treated as "no rotation"
const QUAT_IDENTITY_EPSILON = 0.005;

/**
 * Returns true when a quaternion (x,y,z,w) is effectively the identity rotation.
 * Accepts both array [x,y,z,w] and object {x,y,z,w}.
 */
function isIdentityQuat(q) {
  if (!q) return true;
  const x = Array.isArray(q) ? q[0] : (q.x ?? 0);
  const y = Array.isArray(q) ? q[1] : (q.y ?? 0);
  const z = Array.isArray(q) ? q[2] : (q.z ?? 0);
  const w = Array.isArray(q) ? q[3] : (q.w ?? 1);
  return (
    Math.abs(x) < QUAT_IDENTITY_EPSILON &&
    Math.abs(y) < QUAT_IDENTITY_EPSILON &&
    Math.abs(z) < QUAT_IDENTITY_EPSILON &&
    Math.abs(Math.abs(w) - 1) < QUAT_IDENTITY_EPSILON
  );
}

/**
 * Derive an OBB descriptor from a scene object that has a rotation quaternion.
 * Returns an object compatible with physicsEngine.createCompoundOBBCollider().
 */
function buildOBBDescriptor(obj) {
  const { min, max } = obj.boundingBox;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;

  // Half-extents of the AABB (used as the OBB extents in local space)
  let ex = (max[0] - min[0]) / 2;
  let ey = (max[1] - min[1]) / 2;
  let ez = (max[2] - min[2]) / 2;

  // [P2] Thin surface thickening — prevent KCC tunneling through thin geometry
  const MIN_PHYSICS_THICKNESS = 0.05;
  if (ey < MIN_PHYSICS_THICKNESS / 2) {
    ey = MIN_PHYSICS_THICKNESS / 2;
  }

  const q = obj.rotation ?? obj.obb?.rotation;
  let rotation;
  if (Array.isArray(q)) {
    rotation = [q[0], q[1], q[2], q[3]];
  } else if (q && typeof q === 'object') {
    rotation = [q.x ?? 0, q.y ?? 0, q.z ?? 0, q.w ?? 1];
  } else {
    rotation = [0, 0, 0, 1];
  }

  return {
    center:  [cx, cy, cz],
    extents: [ex, ey, ez],
    rotation,
  };
}

/**
 * Rule-based affordance inference (fallback when scene metadata has no affordances).
 * Returns string[].
 */
function inferAffordances(obj, nameLower) {
  const affordances = [];
  const dims = obj.boundingBox ? [
    obj.boundingBox.max[0] - obj.boundingBox.min[0],
    obj.boundingBox.max[1] - obj.boundingBox.min[1],
    obj.boundingBox.max[2] - obj.boundingBox.min[2],
  ] : null;

  const maxDim = dims ? Math.max(...dims) : 1;
  const height = dims ? dims[1] : 1;

  // Tiny + graspable
  if (maxDim < 0.04)                                          affordances.push('graspable');
  // Chokeable: tiny object child might mouth
  if (maxDim < 0.04)                                          affordances.push('chokeable');
  // Sharp hazard
  if (/knife|scissors|fork|pin|nail|razor|sharp/.test(nameLower)) affordances.push('sharp');
  // Electrical hazard
  if (/socket|outlet|plug|electric/.test(nameLower))          affordances.push('pokeable');
  // Climbable furniture
  if (height > 0.20 && height < 1.2 &&
      /sofa|couch|chair|bench|stool|ottoman|bed|mattress|box|trunk|chest|drawer/.test(nameLower)) {
    affordances.push('climbable');
  }
  // Pullable (drawers, cabinets)
  if (/drawer|cabinet|dresser|wardrobe|tu|ke|cupboard/.test(nameLower)) affordances.push('pullable');
  // Pushable light items
  if (/ball|toy|block|cube|basket/.test(nameLower))           affordances.push('pushable');
  // Hot surfaces
  if (/stove|oven|heater|radiator|iron/.test(nameLower))      affordances.push('hot');
  // Fallback: everything investigable
  if (affordances.length === 0)                               affordances.push('investigable');

  return affordances;
}

/**
 * Returns whether an object should be a soft/sensor collider.
 * Soft objects allow wading/crawling detection without hard repulsion.
 */
function isSoftObject(nameLower, type) {
  if (type === 'soft') return true;
  return /pillow|cushion|mattress|bed(?!side)|plushie|stuffed|soft/.test(nameLower);
}

// ─────────────────────────────────────────────────────────────────────────────

const colliderGenerator = {
  /**
   * Generate Rapier colliders for all scene objects.
   *
   * Strategy routing (v3 — mesh collision):
   *   1. Soft objects → sensor cuboid (unchanged)
   *   2. colliderStrategy === 'cuboid' or no mesh data → OBB/AABB (unchanged)
   *   3. colliderStrategy === 'compound' + collisionPrimitives → decomposed convexHull
   *   4. colliderStrategy === 'convexHull' + collisionVertices → single convexHull
   *   5. All mesh paths fall back to AABB/OBB on failure
   *
   * @param {object}       sceneData     - parsed scene JSON (objects[], boundingBox, floor)
   * @param {object}       world         - Rapier world instance
   * @param {object}       physicsEngine - physicsEngine singleton
   * @returns {ColliderMeta[]}
   */
  generateCollidersFromScene(sceneData, world, physicsEngine) {
    if (!sceneData?.objects) return [];

    const colliders = [];
    let obbCount  = 0;
    let aabbCount = 0;
    let softCount = 0;
    let chCount   = 0;   // convex hull
    let compCount = 0;   // compound (decomposed)
    let skipCount = 0;

    for (const obj of sceneData.objects) {
      try {
        // ── Guard: skip objects with no spatial data ──────────────────────
        if (!obj.boundingBox) {
          console.warn(`[ColliderGen] Skip "${obj.id || obj.name}": no boundingBox`);
          skipCount++;
          continue;
        }

        const { min, max } = obj.boundingBox;

        // Skip zero-volume objects
        if (
          Math.abs(max[0] - min[0]) < 0.001 &&
          Math.abs(max[1] - min[1]) < 0.001 &&
          Math.abs(max[2] - min[2]) < 0.001
        ) {
          skipCount++;
          continue;
        }

        const nameLower = (obj.name || obj.id || '').toLowerCase();
        const isSoft    = isSoftObject(nameLower, obj.type);

        // ── Affordances ───────────────────────────────────────────────────
        const affordances = Array.isArray(obj.affordances) && obj.affordances.length > 0
          ? obj.affordances
          : inferAffordances(obj, nameLower);

        // ── Thin surface thickening ───────────────────────────────────────
        const rawHeight = max[1] - min[1];
        const isFloorLike = (
          obj.type === 'floor' ||
          /rug|carpet|mat($|[_\s])/.test(nameLower) ||
          (rawHeight < 0.05 && min[1] < (sceneData.floor?.height ?? 0) + 0.10)
        );

        // ── Collider creation ─────────────────────────────────────────────
        let colliderEntry = null;
        const strategy = obj.colliderStrategy || 'cuboid';

        // ────────────────────────────────────────────────────────────────
        // PATH 1: Soft objects (sensors) — unchanged
        // ────────────────────────────────────────────────────────────────
        if (isSoft) {
          const bbox = { ...obj.boundingBox };
          if ((bbox.max[1] - bbox.min[1]) < 0.05) {
            bbox.max[1] = bbox.min[1] + 0.05;
          }
          const rapierObj = physicsEngine.createBoxCollider(world, bbox, true, true);

          colliderEntry = {
            id:          obj.id,
            name:        obj.name || obj.id,
            type:        obj.type || 'soft',
            boundingBox: obj.boundingBox,
            collider:    rapierObj.collider,
            isSoft:      true,
            affordances,
          };
          softCount++;

        // ────────────────────────────────────────────────────────────────
        // PATH 2: Compound (decomposed multi-hull) — NEW
        // ────────────────────────────────────────────────────────────────
        } else if (strategy === 'compound' && obj.collisionPrimitives && obj.collisionPrimitives.length > 1) {
          const bboxCenter = [
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2,
          ];

          // Convert plain arrays to Float32Arrays for Rapier
          const primVerts = obj.collisionPrimitives.map(pv =>
            pv instanceof Float32Array ? pv : new Float32Array(pv)
          );

          const rapierObj = physicsEngine.createDecomposedCollider(
            world, primVerts, bboxCenter, true, false
          );

          if (rapierObj) {
            const collidersArr = rapierObj.colliders ?? [rapierObj.collider];
            colliderEntry = {
              id:          obj.id,
              name:        obj.name || obj.id,
              type:        obj.type || 'object',
              boundingBox: obj.boundingBox,
              collider:    rapierObj.collider,
              collidersArr,
              isSoft:      false,
              isCompound:  true,
              affordances,
            };
            compCount++;
          }
          // if null → fall through to AABB/OBB fallback below

        // ────────────────────────────────────────────────────────────────
        // PATH 3: Single ConvexHull — NEW
        // ────────────────────────────────────────────────────────────────
        } else if (strategy === 'convexHull' && obj.collisionVertices && obj.collisionVertices.length >= 12) {
          const bboxCenter = [
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2,
          ];

          const verts = obj.collisionVertices instanceof Float32Array
            ? obj.collisionVertices
            : new Float32Array(obj.collisionVertices);

          const rapierObj = physicsEngine.createConvexHullCollider(
            world, verts, bboxCenter, true, false
          );

          if (rapierObj) {
            colliderEntry = {
              id:          obj.id,
              name:        obj.name || obj.id,
              type:        obj.type || 'object',
              boundingBox: obj.boundingBox,
              collider:    rapierObj.collider,
              isSoft:      false,
              isConvexHull: true,
              affordances,
            };
            chCount++;
          }
          // if null → fall through to AABB/OBB fallback below
        }

        // ────────────────────────────────────────────────────────────────
        // PATH 4: AABB/OBB fallback — original logic (also catches
        //         failed convexHull/compound and cuboid strategy)
        // ────────────────────────────────────────────────────────────────
        if (!colliderEntry && !isSoft) {
          const hasRotation = !isIdentityQuat(obj.rotation ?? obj.obb?.rotation);
          const hasExplicitOBB = !!obj.obb;

          if ((hasRotation || hasExplicitOBB)) {
            // ── OBB path ──────────────────────────────────────────────────
            const obbDesc = hasExplicitOBB ? obj.obb : buildOBBDescriptor(obj);
            if (obbDesc.extents[1] < 0.025) obbDesc.extents[1] = 0.025;

            const proxyColliders = obj.proxyColliders ?? null;
            const rapierObj = physicsEngine.createCompoundOBBCollider(
              world, obbDesc, proxyColliders, true, false
            );

            const collidersArr = rapierObj.colliders ?? (rapierObj.collider ? [rapierObj.collider] : []);

            colliderEntry = {
              id:          obj.id,
              name:        obj.name || obj.id,
              type:        obj.type || 'object',
              boundingBox: obj.boundingBox,
              collider:    rapierObj.collider,
              collidersArr,
              isSoft:      false,
              isOBB:       true,
              affordances,
            };
            obbCount++;

          } else {
            // ── AABB path ─────────────────────────────────────────────────
            const bbox = { min: [...min], max: [...max] };
            if (isFloorLike && (bbox.max[1] - bbox.min[1]) < 0.05) {
              bbox.min[1] = bbox.max[1] - 0.05;
            }

            const rapierObj = physicsEngine.createBoxCollider(world, bbox, true, false);

            colliderEntry = {
              id:          obj.id,
              name:        obj.name || obj.id,
              type:        obj.type || 'object',
              boundingBox: obj.boundingBox,
              collider:    rapierObj.collider,
              isSoft:      false,
              affordances,
            };
            aabbCount++;
          }
        }

        if (colliderEntry) colliders.push(colliderEntry);

      } catch (err) {
        console.warn(`[ColliderGen] Error processing "${obj.id || obj.name}":`, err.message);
        skipCount++;
      }
    }

    // ── Runtime diagnostics ─────────────────────────────────────────────────
    const totalColliderCount = colliders.reduce((sum, c) =>
      sum + (c.collidersArr ? c.collidersArr.length : 1), 0);

    console.log(
      `[ColliderGen] Generated ${colliders.length} objects → ${totalColliderCount} colliders` +
      ` (ConvexHull: ${chCount}, Compound: ${compCount}, OBB: ${obbCount}, ` +
      `AABB: ${aabbCount}, Soft: ${softCount}, Skip: ${skipCount})`
    );
    if (totalColliderCount > 400) {
      console.warn(`[ColliderGen] ⚠️ High collider count (${totalColliderCount}) — may impact performance`);
    }

    return colliders;
  },
};

export default colliderGenerator;