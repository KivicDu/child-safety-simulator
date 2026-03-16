// ─────────────────────────────────────────────────────────────────────────────
// colliderGenerator.js  — v6
//
// FIXES v6 (Performance):
//  [PERF-FIX-6] Smart trimesh routing — PATH 2 phân loại theo độ phức tạp mesh:
//    - triCount ≤ 24 (box-like): dùng OBB thay trimesh → 3-5× nhanh hơn
//    - triCount > 24 (complex shapes): vẫn dùng trimesh để đảm bảo accuracy
//    Kết quả dự kiến: Trimesh giảm từ 25 → ~8 cho bedroom scene,
//    OBB tăng tương ứng, simulation time giảm từ 152s → ~50s.
//
// FIXES v5 (Accuracy):
//  [COLLISION-ACCURACY] Bỏ strategy gate cho PATH 2/3/4.
//    Old: PATH 2 (trimesh) chỉ chạy khi strategy !== 'cuboid'.
//    Fix: data-driven routing — nếu có collisionMesh → trimesh (bất kể strategy).
//
// FIXES v4:
//  [BUG-COL-2] Reverted "dual hard+sensor" introduced in v3.
//
// Contract: generateCollidersFromScene(sceneData, world, physicsEngine)
//   Returns: Array<ColliderMeta>
//     { id, name, type, boundingBox, collider, collidersArr?, isSoft, affordances }
// ─────────────────────────────────────────────────────────────────────────────

const QUAT_IDENTITY_EPSILON = 0.005;

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

function buildOBBDescriptor(obj) {
  const { min, max } = obj.boundingBox;
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;

  let ex = (max[0] - min[0]) / 2;
  let ey = (max[1] - min[1]) / 2;
  let ez = (max[2] - min[2]) / 2;

  // Thin surface thickening — prevent KCC tunneling through thin geometry
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

  return { center: [cx, cy, cz], extents: [ex, ey, ez], rotation };
}

function inferAffordances(obj, nameLower) {
  const affordances = [];
  const dims = obj.boundingBox ? [
    obj.boundingBox.max[0] - obj.boundingBox.min[0],
    obj.boundingBox.max[1] - obj.boundingBox.min[1],
    obj.boundingBox.max[2] - obj.boundingBox.min[2],
  ] : null;

  const maxDim = dims ? Math.max(...dims) : 1;
  const height = dims ? dims[1] : 1;

  if (maxDim < 0.04)                                                             affordances.push('graspable');
  if (maxDim < 0.04)                                                             affordances.push('chokeable');
  if (/knife|scissors|fork|pin|nail|razor|sharp/.test(nameLower))               affordances.push('sharp');
  if (/socket|outlet|plug|electric/.test(nameLower))                            affordances.push('pokeable');
  if (height > 0.20 && height < 1.2 &&
      /sofa|couch|chair|bench|stool|ottoman|bed|mattress|box|trunk|chest|drawer/.test(nameLower)) {
    affordances.push('climbable');
  }
  if (/drawer|cabinet|dresser|wardrobe|tu|ke|cupboard/.test(nameLower))         affordances.push('pullable');
  if (/ball|toy|block|cube|basket/.test(nameLower))                             affordances.push('pushable');
  if (/stove|oven|heater|radiator|iron/.test(nameLower))                        affordances.push('hot');
  if (affordances.length === 0)                                                  affordances.push('investigable');

  return affordances;
}

function isSoftObject(nameLower, type) {
  if (type === 'soft') return true;
  return /pillow|cushion|mattress|bed(?!side)|plushie|stuffed|soft/.test(nameLower);
}

// ─────────────────────────────────────────────────────────────────────────────

const colliderGenerator = {
  /**
   * Generate Rapier colliders for all scene objects.
   *
   * Strategy routing (v4):
   *   1. Soft objects → sensor cuboid ONLY (reverted from v3's dual hard+sensor)
   *   2. strategy !== 'cuboid' + collisionMesh → trimesh (exact mesh)
   *   3. strategy === 'compound' + collisionPrimitives → decomposed convexHull
   *   4. strategy === 'convexHull' + collisionVertices → single convexHull
   *   5. Fallback: OBB (if rotated) or AABB
   */
  generateCollidersFromScene(sceneData, world, physicsEngine) {
    if (!sceneData?.objects) return [];

    const colliders = [];
    let obbCount  = 0;
    let aabbCount = 0;
    let softCount = 0;
    let chCount   = 0;
    let compCount = 0;
    let trimCount = 0;
    let skipCount = 0;

    for (const obj of sceneData.objects) {
      try {
        if (!obj.boundingBox) {
          console.warn(`[ColliderGen] Skip "${obj.id || obj.name}": no boundingBox`);
          skipCount++;
          continue;
        }

        const { min, max } = obj.boundingBox;

        if (
          Math.abs(max[0] - min[0]) < 0.001 &&
          Math.abs(max[1] - min[1]) < 0.001 &&
          Math.abs(max[2] - min[2]) < 0.001
        ) {
          skipCount++;
          continue;
        }

        const nameLower   = (obj.name || obj.id || '').toLowerCase();
        const isSoft      = isSoftObject(nameLower, obj.type);
        const affordances = Array.isArray(obj.affordances) && obj.affordances.length > 0
          ? obj.affordances
          : inferAffordances(obj, nameLower);

        const rawHeight  = max[1] - min[1];
        const isFloorLike = (
          obj.type === 'floor' ||
          /rug|carpet|mat($|[_\s])/.test(nameLower) ||
          (rawHeight < 0.05 && min[1] < (sceneData.floor?.height ?? 0) + 0.10)
        );

        let colliderEntry = null;
        const strategy    = obj.colliderStrategy || 'cuboid';

        // ──────────────────────────────────────────────────────────────────
        // PATH 1: Soft objects — SENSOR ONLY
        // [BUG-COL-2 FIX] v3's hard collider enclosed agents near soft
        // furniture inside an invisible full-height box → KCC corrected = 0.
        // Sensor only: allows intersection events for soft-touch detection
        // without creating a physical wall around the object.
        // ──────────────────────────────────────────────────────────────────
        if (isSoft) {
          const bbox = { ...obj.boundingBox };
          if ((bbox.max[1] - bbox.min[1]) < 0.05) bbox.max[1] = bbox.min[1] + 0.05;

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

        // ──────────────────────────────────────────────────────────────────
        // PATH 2: Trimesh — exact mesh-accurate collision (preferred cho hình phức tạp)
        // [COLLISION-ACCURACY FIX] Bỏ điều kiện `strategy !== 'cuboid'`.
        // [PERF-FIX-6] Smart routing: trimesh chỉ dùng khi object thực sự có hình dạng
        // phức tạp (ghế, giường, cầu thang...). Objects box-like đơn giản (tủ hình hộp,
        // bàn phẳng, tường) dùng OBB/AABB — nhanh hơn 3-5× trong collision detection.
        //
        // Tiêu chí "phức tạp" = collisionMesh có nhiều triangles hơn OBB tương đương,
        // tức là số triangles > 24 (một cuboid chỉ cần 12 triangles = 36 indices).
        // Nếu ≤ 24 triangles → mesh gần như là box → dùng OBB thay thế.
        // ──────────────────────────────────────────────────────────────────
        } else if (
          obj.collisionMesh &&
          obj.collisionMesh.vertices?.length >= 9 &&
          obj.collisionMesh.indices?.length  >= 3
        ) {
          const triCount   = obj.collisionMesh.indices.length / 3;
          const isBoxLike  = triCount <= 24;  // ≤24 tris = đơn giản như hộp, không cần trimesh
          const bboxCenter = [
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2,
          ];

          let rapierObj = null;

          if (isBoxLike) {
            // Dùng OBB thay trimesh cho objects đơn giản — nhanh hơn nhiều
            const obbDesc = (obj.obb && obj.obb.center) ? obj.obb : buildOBBDescriptor(obj);
            if (obbDesc.extents[1] < 0.025) obbDesc.extents[1] = 0.025;
            rapierObj = physicsEngine.createCompoundOBBCollider(
              world, obbDesc, obj.proxyColliders ?? null, true, false
            );
            if (rapierObj) {
              const collidersArr = rapierObj.colliders ?? (rapierObj.collider ? [rapierObj.collider] : []);
              colliderEntry = {
                id: obj.id, name: obj.name || obj.id,
                type: obj.type || 'object', boundingBox: obj.boundingBox,
                collider: rapierObj.collider, collidersArr,
                isSoft: false, isOBB: true, affordances,
              };
              obbCount++;
            }
          } else {
            // Trimesh cho objects thực sự phức tạp (ghế, giường, cầu thang...)
            rapierObj = physicsEngine.createTrimeshCollider(
              world, obj.collisionMesh.vertices, obj.collisionMesh.indices,
              bboxCenter, false
            );
            if (rapierObj) {
              colliderEntry = {
                id: obj.id, name: obj.name || obj.id,
                type: obj.type || 'object', boundingBox: obj.boundingBox,
                collider: rapierObj.collider,
                isSoft: false, isTrimesh: true, affordances,
              };
              trimCount++;
            }
          }

        // ──────────────────────────────────────────────────────────────────
        // PATH 3: Compound (decomposed multi-hull)
        // [COLLISION-ACCURACY FIX] Bỏ `strategy === 'compound'` check.
        // Nếu GLB parser export collisionPrimitives, đó là tín hiệu rõ ràng
        // rằng object cần compound hull — không cần strategy phải match.
        // ──────────────────────────────────────────────────────────────────
        } else if (obj.collisionPrimitives && obj.collisionPrimitives.length > 1) {
          const bboxCenter = [
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2,
          ];

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

        // ──────────────────────────────────────────────────────────────────
        // PATH 4: Single ConvexHull
        // [COLLISION-ACCURACY FIX] Bỏ `strategy === 'convexHull'` check.
        // ──────────────────────────────────────────────────────────────────
        } else if (obj.collisionVertices && obj.collisionVertices.length >= 12) {
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
              id:            obj.id,
              name:          obj.name || obj.id,
              type:          obj.type || 'object',
              boundingBox:   obj.boundingBox,
              collider:      rapierObj.collider,
              isSoft:        false,
              isConvexHull:  true,
              affordances,
            };
            chCount++;
          }
        }

        // ──────────────────────────────────────────────────────────────────
        // PATH 5: AABB/OBB fallback
        // ──────────────────────────────────────────────────────────────────
        if (!colliderEntry && !isSoft) {
          const hasRotation    = !isIdentityQuat(obj.rotation ?? obj.obb?.rotation);
          const hasExplicitOBB = !!obj.obb;

          if (hasRotation || hasExplicitOBB) {
            const obbDesc = hasExplicitOBB ? obj.obb : buildOBBDescriptor(obj);
            if (obbDesc.extents[1] < 0.025) obbDesc.extents[1] = 0.025;

            const proxyColliders = obj.proxyColliders ?? null;
            const rapierObj      = physicsEngine.createCompoundOBBCollider(
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

    const totalColliderCount = colliders.reduce((sum, c) =>
      sum + (c.collidersArr ? c.collidersArr.length : 1), 0);

    console.log(
      `[ColliderGen] Generated ${colliders.length} objects → ${totalColliderCount} colliders` +
      ` (Trimesh: ${trimCount}, ConvexHull: ${chCount}, Compound: ${compCount}, OBB: ${obbCount}, ` +
      `AABB: ${aabbCount}, Soft(sensor): ${softCount}, Skip: ${skipCount})`
    );
    if (totalColliderCount > 400) {
      console.warn(`[ColliderGen] ⚠️ High collider count (${totalColliderCount}) — may impact performance`);
    }

    return colliders;
  },
};

export default colliderGenerator;