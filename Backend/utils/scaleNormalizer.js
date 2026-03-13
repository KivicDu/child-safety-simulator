/**
 * Scene Scale Applicator
 * 
 * Applies a specific scale factor to all scene coordinates to 
 * convert them to meters. Mutates in-place.
 */

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
 * Apply the given scale factor to all scene coordinates.
 *
 * After this call every position, bounding box, and floor height in
 * `sceneData` is expressed in meters.
 *
 * @param {Object} sceneData - Parsed scene JSON (mutated in-place)
 * @param {number} scaleFactor - The absolute multiplier to apply
 * @returns {Object} The same sceneData reference (for chaining)
 */
export function applyScaleToSceneData(sceneData, scaleFactor) {
  if (!sceneData || !sceneData.boundingBox) return sceneData;

  // Already in meters — skip expensive traversal
  if (scaleFactor === 1.0) {
    sceneData._scaleFactor = 1.0;
    sceneData._sceneUnit = 'meters';
    return sceneData;
  }

  // 1. Scale scene-level bounding box
  scaleVec3(sceneData.boundingBox.min, scaleFactor);
  scaleVec3(sceneData.boundingBox.max, scaleFactor);

  // 2. Scale floor height
  if (sceneData.floor && typeof sceneData.floor.height === 'number') {
    sceneData.floor.height *= scaleFactor;
  }

  // 3. Scale every object's position and bounding box
  if (sceneData.objects && Array.isArray(sceneData.objects)) {
    for (const obj of sceneData.objects) {
      if (obj.boundingBox) {
        scaleVec3(obj.boundingBox.min, scaleFactor);
        scaleVec3(obj.boundingBox.max, scaleFactor);
      }
      if (obj.position && Array.isArray(obj.position)) {
        scaleVec3(obj.position, scaleFactor);
      }
    }
  }

  // 4. Store metadata for downstream use
  sceneData._scaleFactor = scaleFactor;

  console.log(`   ✅ Applied absolute scale factor ${scaleFactor.toFixed(4)} to ${sceneData.objects?.length || 0} objects`);

  return sceneData;
}