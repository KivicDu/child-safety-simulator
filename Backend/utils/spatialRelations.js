// ─────────────────────────────────────────────────────────────────────────────
// spatialRelations.js — Spatial grid-based pairwise relationship computation
//
// Uses spatial grid partitioning (NOT O(n²)) to efficiently compute:
//   inside > onTopOf > touching > near  (priority-ordered, deduplicated)
//
// Performance: Only checks pairs within neighboring grid cells.
// ─────────────────────────────────────────────────────────────────────────────

import {
  distance as vecDistance,
  aabbOverlap,
  aabbOverlapVolume,
  bboxVolume,
  bboxDimensions,
  isFullyInside,
  horizontalOverlapRatio,
  sceneDiagonal,
} from './vecUtils.js';

// ── Spatial Grid ─────────────────────────────────────────────────────────────
class SpatialGrid {
  /**
   * @param {number} cellSize - Size of each grid cell
   */
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map(); // "gx_gy_gz" → Set<index>
  }

  _key(gx, gy, gz) {
    return `${gx}_${gy}_${gz}`;
  }

  /**
   * Insert an object's AABB into the grid.
   * An object may span multiple cells.
   */
  insert(index, bbox) {
    const cs = this.cellSize;
    const gxMin = Math.floor(bbox.min.x / cs);
    const gyMin = Math.floor(bbox.min.y / cs);
    const gzMin = Math.floor(bbox.min.z / cs);
    const gxMax = Math.floor(bbox.max.x / cs);
    const gyMax = Math.floor(bbox.max.y / cs);
    const gzMax = Math.floor(bbox.max.z / cs);

    for (let gx = gxMin; gx <= gxMax; gx++) {
      for (let gy = gyMin; gy <= gyMax; gy++) {
        for (let gz = gzMin; gz <= gzMax; gz++) {
          const key = this._key(gx, gy, gz);
          if (!this.cells.has(key)) this.cells.set(key, new Set());
          this.cells.get(key).add(index);
        }
      }
    }
  }

  /**
   * Get all unique candidate pairs (i, j) where i < j.
   * Only returns pairs that share at least one grid cell or neighboring cells.
   */
  getCandidatePairs() {
    const pairs = new Set(); // "i_j" strings for dedup

    for (const [, indices] of this.cells) {
      const arr = [...indices];
      for (let a = 0; a < arr.length; a++) {
        for (let b = a + 1; b < arr.length; b++) {
          const i = Math.min(arr[a], arr[b]);
          const j = Math.max(arr[a], arr[b]);
          pairs.add(`${i}_${j}`);
        }
      }
    }

    return [...pairs].map(p => {
      const [i, j] = p.split('_').map(Number);
      return [i, j];
    });
  }
}

// ── Relation checks ─────────────────────────────────────────────────────────

/**
 * Check if A is fully inside B.
 */
function checkInside(objA, objB) {
  if (isFullyInside(objA.bbox, objB.bbox)) {
    return { relation: 'inside', confidence: 0.95 };
  }
  if (isFullyInside(objB.bbox, objA.bbox)) {
    // Reverse: B inside A — we'll return it as the caller handles swap
    return { relation: 'inside', confidence: 0.95, reversed: true };
  }
  return null;
}

/**
 * Check if A is on top of B.
 * Condition: A.min.y >= B.max.y - epsilon AND horizontal overlap > 50%
 */
function checkOnTopOf(objA, objB) {
  const dimA = objA.dimensions;
  const dimB = objB.dimensions;
  const epsilon = Math.min(dimA.height, dimB.height) * 0.05;

  // A on top of B?
  if (objA.bbox.min.y >= objB.bbox.max.y - epsilon) {
    const hOverlap = horizontalOverlapRatio(objA.bbox, objB.bbox);
    if (hOverlap > 0.5) {
      return { relation: 'onTopOf', confidence: 0.85 + hOverlap * 0.1 };
    }
  }

  // B on top of A?
  if (objB.bbox.min.y >= objA.bbox.max.y - epsilon) {
    const hOverlap = horizontalOverlapRatio(objA.bbox, objB.bbox);
    if (hOverlap > 0.5) {
      return { relation: 'onTopOf', confidence: 0.85 + hOverlap * 0.1, reversed: true };
    }
  }

  return null;
}

/**
 * Check if A and B are touching (surface contact with minimal overlap volume).
 */
function checkTouching(objA, objB) {
  if (!aabbOverlap(objA.bbox, objB.bbox)) return null;

  const overlapVol = aabbOverlapVolume(objA.bbox, objB.bbox);
  const smallerVol = Math.min(bboxVolume(objA.bbox), bboxVolume(objB.bbox));

  if (smallerVol <= 0) return null;

  // Touching = overlap exists but is small relative to the smaller object (< 15%)
  const overlapRatio = overlapVol / smallerVol;
  if (overlapRatio > 0 && overlapRatio < 0.15) {
    return { relation: 'touching', confidence: 0.80 };
  }

  return null;
}

/**
 * Check if A and B are near each other.
 */
function checkNear(objA, objB, threshold) {
  const dist = vecDistance(objA.center, objB.center);
  if (dist < threshold) {
    // Confidence decreases with distance
    const confidence = 0.9 - (dist / threshold) * 0.3;
    return { relation: 'near', distance: dist, confidence: Math.max(confidence, 0.5) };
  }
  return null;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute pairwise spatial relations between scene objects.
 *
 * @param {SceneObject[]} objects - Normalized scene objects with Vec3 bbox
 * @param {{ min: Vec3, max: Vec3 }} scnBbox - Scene bounding box
 * @param {object} [options]
 * @param {number} [options.nearThresholdFactor=0.05] - Near distance as fraction of scene diagonal
 * @returns {SpatialRelation[]}
 */
export function computeSpatialRelations(objects, scnBbox, options = {}) {
  const {
    nearThresholdFactor = 0.05,
  } = options;

  if (!objects || objects.length < 2) return [];

  const diag = sceneDiagonal(scnBbox);
  const nearThreshold = diag * nearThresholdFactor;

  // Build spatial grid with cell size = nearThreshold (so "near" objects share cells)
  const cellSize = Math.max(nearThreshold, 0.5); // min 0.5m cells to avoid too many cells
  const grid = new SpatialGrid(cellSize);

  // Insert all objects + expand their bbox by nearThreshold for "near" detection
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    // Expand bbox by threshold so nearby objects share grid cells
    const expandedBbox = {
      min: {
        x: obj.bbox.min.x - nearThreshold,
        y: obj.bbox.min.y - nearThreshold,
        z: obj.bbox.min.z - nearThreshold,
      },
      max: {
        x: obj.bbox.max.x + nearThreshold,
        y: obj.bbox.max.y + nearThreshold,
        z: obj.bbox.max.z + nearThreshold,
      },
    };
    grid.insert(i, expandedBbox);
  }

  // Get candidate pairs from grid
  const candidatePairs = grid.getCandidatePairs();
  const relations = [];
  const pairSeen = new Set(); // "idA_idB" for dedup

  for (const [i, j] of candidatePairs) {
    const objA = objects[i];
    const objB = objects[j];

    // Deduplicate (A-B same as B-A)
    const pairKey = [objA.id, objB.id].sort().join('_');
    if (pairSeen.has(pairKey)) continue;
    pairSeen.add(pairKey);

    // Priority check: inside > onTopOf > touching > near
    // Only keep the highest-priority relation per pair.

    // 1. Inside
    const insideResult = checkInside(objA, objB);
    if (insideResult) {
      const [a, b] = insideResult.reversed ? [objB.id, objA.id] : [objA.id, objB.id];
      relations.push({
        objectA: a,
        objectB: b,
        relation: 'inside',
        confidence: insideResult.confidence,
      });
      continue;
    }

    // 2. On top of
    const onTopResult = checkOnTopOf(objA, objB);
    if (onTopResult) {
      const [a, b] = onTopResult.reversed ? [objB.id, objA.id] : [objA.id, objB.id];
      relations.push({
        objectA: a,
        objectB: b,
        relation: 'onTopOf',
        confidence: onTopResult.confidence,
      });
      continue;
    }

    // 3. Touching
    const touchResult = checkTouching(objA, objB);
    if (touchResult) {
      relations.push({
        objectA: objA.id,
        objectB: objB.id,
        relation: 'touching',
        confidence: touchResult.confidence,
      });
      continue;
    }

    // 4. Near
    const nearResult = checkNear(objA, objB, nearThreshold);
    if (nearResult) {
      relations.push({
        objectA: objA.id,
        objectB: objB.id,
        relation: 'near',
        distance: nearResult.distance,
        confidence: nearResult.confidence,
      });
    }
  }

  console.log(
    `[SpatialRelations] ${objects.length} objects, ${candidatePairs.length} candidate pairs → ` +
    `${relations.length} relations (grid cells: ${grid.cells.size}, cellSize: ${cellSize.toFixed(2)}m)`
  );

  return relations;
}

export default { computeSpatialRelations };
