// ─────────────────────────────────────────────────────────────────────────────
// vecUtils.js — Vec3 {x,y,z} helpers & conversion from/to legacy [x,y,z] arrays
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert [x,y,z] array to {x,y,z} object.
 * @param {number[]} arr
 * @returns {{ x: number, y: number, z: number }}
 */
export function toVec3(arr) {
  if (!arr) return { x: 0, y: 0, z: 0 };
  if (typeof arr.x === 'number') return arr; // already Vec3
  return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0 };
}

/**
 * Convert {x,y,z} object back to [x,y,z] array.
 * @param {{ x: number, y: number, z: number }} v
 * @returns {number[]}
 */
export function fromVec3(v) {
  if (!v) return [0, 0, 0];
  if (Array.isArray(v)) return v;
  return [v.x || 0, v.y || 0, v.z || 0];
}

/**
 * Convert legacy BBox { min: [x,y,z], max: [x,y,z] } to { min: Vec3, max: Vec3 }
 * @param {{ min: number[], max: number[] }} bbox
 * @returns {{ min: Vec3, max: Vec3 }}
 */
export function toBBox(bbox) {
  if (!bbox) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  return { min: toVec3(bbox.min), max: toVec3(bbox.max) };
}

/**
 * Convert Vec3 BBox back to array BBox for legacy code.
 */
export function fromBBox(bbox) {
  if (!bbox) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: fromVec3(bbox.min), max: fromVec3(bbox.max) };
}

/**
 * Euclidean distance between two Vec3.
 */
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Euclidean distance ignoring Y axis (XZ plane).
 */
export function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Get center of a BBox.
 * @param {{ min: Vec3, max: Vec3 }} bbox
 * @returns {Vec3}
 */
export function bboxCenter(bbox) {
  return {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
    z: (bbox.min.z + bbox.max.z) / 2,
  };
}

/**
 * Get dimensions from BBox.
 * @param {{ min: Vec3, max: Vec3 }} bbox
 * @returns {{ width: number, height: number, depth: number }}
 */
export function bboxDimensions(bbox) {
  return {
    width:  bbox.max.x - bbox.min.x,
    height: bbox.max.y - bbox.min.y,
    depth:  bbox.max.z - bbox.min.z,
  };
}

/**
 * Scene diagonal (for dynamic threshold calculation).
 */
export function sceneDiagonal(sceneBbox) {
  const d = bboxDimensions(sceneBbox);
  return Math.sqrt(d.width * d.width + d.height * d.height + d.depth * d.depth);
}

/**
 * Volume of a BBox.
 */
export function bboxVolume(bbox) {
  const d = bboxDimensions(bbox);
  return d.width * d.height * d.depth;
}

/**
 * Check if two AABBs overlap.
 * @returns {boolean}
 */
export function aabbOverlap(a, b) {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

/**
 * Compute overlap volume between two AABBs (0 if no overlap).
 */
export function aabbOverlapVolume(a, b) {
  const ox = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
  const oy = Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y));
  const oz = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  return ox * oy * oz;
}

/**
 * Merge two BBoxes into one.
 */
export function mergeBBox(a, b) {
  return {
    min: {
      x: Math.min(a.min.x, b.min.x),
      y: Math.min(a.min.y, b.min.y),
      z: Math.min(a.min.z, b.min.z),
    },
    max: {
      x: Math.max(a.max.x, b.max.x),
      y: Math.max(a.max.y, b.max.y),
      z: Math.max(a.max.z, b.max.z),
    },
  };
}

/**
 * Check if bbox A is fully inside bbox B.
 */
export function isFullyInside(inner, outer) {
  return (
    inner.min.x >= outer.min.x && inner.max.x <= outer.max.x &&
    inner.min.y >= outer.min.y && inner.max.y <= outer.max.y &&
    inner.min.z >= outer.min.z && inner.max.z <= outer.max.z
  );
}

/**
 * Compute horizontal overlap ratio between two AABBs (XZ plane).
 * Returns 0-1 representing the fraction of the smaller object's XZ footprint
 * that overlaps with the larger.
 */
export function horizontalOverlapRatio(a, b) {
  const overlapX = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
  const overlapZ = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));

  const areaA = (a.max.x - a.min.x) * (a.max.z - a.min.z);
  const areaB = (b.max.x - b.min.x) * (b.max.z - b.min.z);
  const smallerArea = Math.min(areaA, areaB);

  if (smallerArea <= 0) return 0;
  return (overlapX * overlapZ) / smallerArea;
}

/**
 * Convert a raw parsed SceneObject from glbParser format to the new analysis format.
 * @param {object} raw - Object from glbParser output
 * @returns {object} - Normalized SceneObject
 */
export function normalizeSceneObject(raw) {
  const bbox = toBBox(raw.boundingBox);
  const center = bboxCenter(bbox);
  const dims = bboxDimensions(bbox);

  return {
    id: raw.id,
    name: raw.name || raw.id,
    meshIds: [raw.id], // single mesh initially
    bbox,
    center,
    dimensions: dims,
    // Preserve original data for physics/collider systems
    _raw: raw,
  };
}

export default {
  toVec3, fromVec3, toBBox, fromBBox,
  distance, distanceXZ, bboxCenter, bboxDimensions,
  sceneDiagonal, bboxVolume,
  aabbOverlap, aabbOverlapVolume, mergeBBox,
  isFullyInside, horizontalOverlapRatio,
  normalizeSceneObject,
};
