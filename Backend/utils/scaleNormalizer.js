/**
 * Scene Scale Normalizer
 * 
 * Auto-detects GLB coordinate unit system and normalizes all scene coordinates
 * to meters. Supports models authored in meters, feet, inches, centimeters,
 * and millimeters.
 */

/**
 * Known unit conversions to meters.
 * Ordered by likelihood for typical architectural/furniture models.
 */
const UNIT_CONVERSIONS = [
  { unit: 'feet',        factor: 0.3048 },
  { unit: 'inches',      factor: 0.0254 },
  { unit: 'centimeters', factor: 0.01 },
  { unit: 'millimeters', factor: 0.001 },
];

// Expected residential room horizontal span in meters
const ROOM_MIN_M = 2.0;
const ROOM_MAX_M = 20.0;
const ROOM_IDEAL_M = 6.0;

/**
 * Detect the coordinate unit system from a scene bounding box.
 *
 * @param {{ min: number[], max: number[] }} bbox - Scene bounding box
 * @returns {{ unit: string, factor: number, maxDimMeters: number }}
 */
export function detectSceneScale(bbox) {
  if (!bbox || !bbox.min || !bbox.max) {
    return { unit: 'meters', factor: 1.0, maxDimMeters: 0 };
  }

  const width = Math.abs(bbox.max[0] - bbox.min[0]) || 0;
  const depth = Math.abs(bbox.max[2] - bbox.min[2]) || 0;
  let maxHorizontal = Math.max(width, depth);
  if (!Number.isFinite(maxHorizontal)) maxHorizontal = 0;

  // Already in plausible meter range → no conversion needed
  if (maxHorizontal >= ROOM_MIN_M && maxHorizontal <= ROOM_MAX_M) {
    return { unit: 'meters', factor: 1.0, maxDimMeters: maxHorizontal };
  }

  // Try each unit conversion; pick the one whose result is closest to a
  // typical room size while still falling within the valid range.
  let best = null;
  let bestScore = Infinity;

  for (const conv of UNIT_CONVERSIONS) {
    const dimInMeters = maxHorizontal * conv.factor;
    if (dimInMeters >= ROOM_MIN_M && dimInMeters <= ROOM_MAX_M) {
      const score = Math.abs(dimInMeters - ROOM_IDEAL_M);
      if (score < bestScore) {
        bestScore = score;
        best = { unit: conv.unit, factor: conv.factor, maxDimMeters: dimInMeters };
      }
    }
  }

  if (best) return best;

  // Fallback: no standard unit matches — scale so max dim ≈ 8m
  // Guard against division by zero if maxHorizontal is extremely small or zero
  const safeHorizontal = Math.max(maxHorizontal, 0.001);
  const fallbackFactor = 8.0 / safeHorizontal;
  
  return {
    unit: 'unknown',
    factor: fallbackFactor,
    maxDimMeters: 8.0
  };
}

/**
 * Scale a 3-component coordinate array in-place.
 * @param {number[]} arr
 * @param {number} factor
 */
function scaleVec3(arr, factor) {
  if (!arr || arr.length < 3) return;
  arr[0] *= factor;
  arr[1] *= factor;
  arr[2] *= factor;
}

/**
 * Normalize all scene coordinates to meters (mutates in-place).
 *
 * After this call every position, bounding box, and floor height in
 * `sceneData` is expressed in meters regardless of the original GLB unit.
 *
 * The detected scale factor is stored as `sceneData._scaleFactor` so
 * downstream code can reference it if needed.
 *
 * @param {Object} sceneData - Parsed scene JSON (mutated in-place)
 * @returns {Object} The same sceneData reference (for chaining)
 */
export function normalizeSceneToMeters(sceneData) {
  if (!sceneData || !sceneData.boundingBox) return sceneData;

  const { unit, factor, maxDimMeters } = detectSceneScale(sceneData.boundingBox);

  // Already in meters — skip expensive traversal
  if (factor === 1.0) {
    console.log(`📐 Scene scale: meters (no conversion needed, max dim: ${maxDimMeters.toFixed(1)}m)`);
    sceneData._scaleFactor = 1.0;
    sceneData._sceneUnit = 'meters';
    return sceneData;
  }

  console.log(`📐 Scene unit detected: ${unit} (factor: ${factor})`);
  console.log(`   Max horizontal dimension: ${(maxDimMeters / factor).toFixed(1)} ${unit} → ${maxDimMeters.toFixed(1)} m`);

  // 1. Scale scene-level bounding box
  scaleVec3(sceneData.boundingBox.min, factor);
  scaleVec3(sceneData.boundingBox.max, factor);

  // 2. Scale floor height
  if (sceneData.floor && typeof sceneData.floor.height === 'number') {
    sceneData.floor.height *= factor;
  }

  // 3. Scale every object's position and bounding box
  if (sceneData.objects && Array.isArray(sceneData.objects)) {
    for (const obj of sceneData.objects) {
      if (obj.boundingBox) {
        scaleVec3(obj.boundingBox.min, factor);
        scaleVec3(obj.boundingBox.max, factor);
      }
      if (obj.position && Array.isArray(obj.position)) {
        scaleVec3(obj.position, factor);
      }
    }
  }

  // 4. Store metadata for downstream use
  sceneData._scaleFactor = factor;
  sceneData._sceneUnit = unit;

  console.log(`   ✅ Normalized ${sceneData.objects?.length || 0} objects to meters`);

  return sceneData;
}
