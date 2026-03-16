
// ─────────────────────────────────────────────────────────────────────────────
// Low-level helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scale a 3-element array in-place (positions, centers, extents).
 * @param {number[]} arr
 * @param {number}   factor
 */
function scaleVec3(arr, factor) {
  if (!arr || arr.length < 3) return;
  arr[0] *= factor;
  arr[1] *= factor;
  arr[2] *= factor;
}

/**
 * Scale a flat vertex array [x0,y0,z0, x1,y1,z1, …] in-place.
 * Works for both plain Array and Float32Array.
 *
 * @param {number[]|Float32Array} arr
 * @param {number} factor
 */
function scaleVertexArray(arr, factor) {
  if (!arr) return;
  // Float32Array or Array — both support indexed write
  const len = arr.length;
  for (let i = 0; i < len; i++) arr[i] *= factor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply the given absolute scale factor to ALL spatial quantities in sceneData,
 * converting everything to metres.
 *
 * After this call:
 *   • Every boundingBox, position, OBB, proxyCollider, floor height, and
 *     mesh-collision vertex is expressed in metres.
 *   • Rotation quaternions are left unchanged (they are dimensionless).
 *
 * @param {Object} sceneData   - Parsed scene JSON (mutated in-place)
 * @param {number} scaleFactor - Absolute multiplier to apply (e.g. 0.01 for cm→m)
 * @returns {Object} The same sceneData reference (for chaining)
 */
export function applyScaleToSceneData(sceneData, scaleFactor) {
  if (!sceneData || !sceneData.boundingBox) return sceneData;

  // Already in metres — skip the traversal entirely
  if (scaleFactor === 1.0) {
    sceneData._scaleFactor = 1.0;
    sceneData._sceneUnit  = 'meters';
    return sceneData;
  }

  // ── 1. Scene-level bounding box ───────────────────────────────────────────
  scaleVec3(sceneData.boundingBox.min, scaleFactor);
  scaleVec3(sceneData.boundingBox.max, scaleFactor);

  // ── 2. Floor metadata ─────────────────────────────────────────────────────
  if (sceneData.floor) {
    if (typeof sceneData.floor.height    === 'number') sceneData.floor.height    *= scaleFactor;
    if (typeof sceneData.floor.topHeight === 'number') sceneData.floor.topHeight *= scaleFactor;
  }

  // ── 3. Per-object spatial data ────────────────────────────────────────────
  if (Array.isArray(sceneData.objects)) {
    for (const obj of sceneData.objects) {

      // 3a. AABB bounding box (used by fallback OBB / AABB collider paths)
      if (obj.boundingBox) {
        scaleVec3(obj.boundingBox.min, scaleFactor);
        scaleVec3(obj.boundingBox.max, scaleFactor);
      }

      // 3b. Explicit world position arrays
      if (Array.isArray(obj.position)) {
        scaleVec3(obj.position, scaleFactor);
      }
      if (obj.transform && Array.isArray(obj.transform.position)) {
        scaleVec3(obj.transform.position, scaleFactor);
      }

      // 3c. OBB descriptor — CRITICAL FIX
      //     createCompoundOBBCollider() uses obb.center as the rigid-body
      //     world translation and obb.extents as half-extents. Both must be
      //     in metres or the collider ends up at the wrong position / scale.
      if (obj.obb) {
        if (Array.isArray(obj.obb.center))  scaleVec3(obj.obb.center,  scaleFactor);
        if (Array.isArray(obj.obb.extents)) scaleVec3(obj.obb.extents, scaleFactor);
        // obb.rotation is a quaternion — dimensionless, never scale
      }

      // 3d. Proxy colliders (COL_* child nodes from the modeller) — CRITICAL FIX
      //     proxyColliders are independent OBBs that override the parent AABB for
      //     complex furniture. Their center/extents must also be in metres.
      if (Array.isArray(obj.proxyColliders)) {
        for (const proxy of obj.proxyColliders) {
          if (Array.isArray(proxy.center))  scaleVec3(proxy.center,  scaleFactor);
          if (Array.isArray(proxy.extents)) scaleVec3(proxy.extents, scaleFactor);
          // proxy.rotation — quaternion, skip
        }
      }

      // 3e. Mesh collision vertices (single convex hull path) — CRITICAL FIX
      //     These are world-space vertex positions extracted by glbParser.
      //     If unscaled, createConvexHullCollider builds a hull in cm while
      //     the rest of the scene is in metres → hull is 100× too large.
      if (Array.isArray(obj.collisionVertices)) {
        scaleVertexArray(obj.collisionVertices, scaleFactor);
      }

      // 3e-bis. Trimesh collision mesh (exact mesh path) — ROOT CAUSE FIX ─────
      //     collisionMesh.vertices is used by createTrimeshCollider (PATH 2 in
      //     colliderGenerator, 21/32 objects in the bedroom scene).
      //     v1 of this function scaled collisionVertices and collisionPrimitives
      //     but LEFT collisionMesh.vertices UNSCALED.
      //
      //     Consequence: the trimesh body is placed at bboxCenter (scaled to metres),
      //     but vertex positions in local space are offset by (vertex_1x - bboxCenter_2x)
      //     instead of (vertex_1x - bboxCenter_1x) → every trimesh collider is
      //     physically displaced from its visual mesh by (1 - scaleFactor) * bboxCenter.
      //     For a bedroom object at [3m, 1m, 2m] with scaleFactor=0.8463:
      //       displacement ≈ 0.154 × [3, 1, 2] = [0.46m, 0.15m, 0.31m]
      //     Combined with double-scaling (RC#0), this shifts colliders ~0.5–1m off.
      //
      //     The floor trimesh specifically is shifted DOWN by ~0.02m relative to where
      //     confirmFloorSurface expects it → 0 hits → spawn cascade.
      if (obj.collisionMesh) {
        if (Array.isArray(obj.collisionMesh.vertices)) {
          scaleVertexArray(obj.collisionMesh.vertices, scaleFactor);
        }
        if (obj.collisionMesh.vertices instanceof Float32Array) {
          scaleVertexArray(obj.collisionMesh.vertices, scaleFactor);
        }
      }

      // 3f. Compound collision primitives (decomposed multi-hull path) — CRITICAL FIX
      //     Each element is a Float32Array or plain Array of [x,y,z, …] vertices
      //     for one convex primitive. All must be converted to metres.
      if (Array.isArray(obj.collisionPrimitives)) {
        for (const prim of obj.collisionPrimitives) {
          scaleVertexArray(prim, scaleFactor);
        }
      }
    }
  }

  // ── 4. Store metadata for downstream diagnostics ─────────────────────────
  sceneData._scaleFactor = scaleFactor;
  sceneData._sceneUnit   = 'meters';

  console.log(
    `   ✅ Applied absolute scale factor ${scaleFactor.toFixed(4)} to` +
    ` ${sceneData.objects?.length || 0} objects` +
    ` (boundingBox + OBB + proxyColliders + collisionMesh.vertices + mesh vertices)`
  );

  return sceneData;
}