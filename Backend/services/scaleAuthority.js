/**
 * Scale Authority Service (Backend Single Source of Truth)
 * 
 * Analyzes parsed scene JSON data to determine the absolute real-world scale 
 * factor required to convert the scene coordinates to exactly 1 Unit = 1 Meter.
 * 
 * Employs a multi-priority heuristic system:
 * 1. Calibration Anchors
 * 2. Strict Door Height Detection
 * 3. Semantic Furniture Assessment
 * 4. Mathematical Bounding Box Fallback
 */

export const detectScale = (sceneData) => {
  if (!sceneData || !sceneData.objects) {
    return { factor: 1.0, detectedBy: 'fallback_empty_scene', maxDimMeters: 0, confidence: 0.1 };
  }

  const objects = sceneData.objects;
  
  // ─────────────────────────────────────────────────────────────────
  // PRIORITY 1: Calibration Anchor (1x1x1m Cube named CALIBRATION_1M)
  // ─────────────────────────────────────────────────────────────────
  const calibrationNode = objects.find(obj => obj.name && obj.name.includes("CALIBRATION_1M"));
  if (calibrationNode && calibrationNode.boundingBox) {
    const minY = calibrationNode.boundingBox.min[1];
    const maxY = calibrationNode.boundingBox.max[1];
    const height = Math.abs(maxY - minY) || 1;
    const factor = 1.0 / height;
    
    console.log(`[ScaleAuthority] Target detection: Calibration Anchor (Priority 1)`);
    console.log(`[ScaleAuthority] Measured height: ${height.toFixed(2)} units`);
    console.log(`[ScaleAuthority] Applied scale factor: ${factor.toFixed(4)}`);
    
    return { factor, detectedBy: 'priority_1_calibration_anchor', confidence: 1.0 };
  }

  // Helper to calculate height of an object
  const getObjHeight = (obj) => {
    if (!obj.boundingBox) return 0;
    return Math.abs(obj.boundingBox.max[1] - obj.boundingBox.min[1]) || 0;
  };

  // ─────────────────────────────────────────────────────────────────
  // PRIORITY 2: Strict Door Height Detection ~2.1m (Real-world standard)
  // ─────────────────────────────────────────────────────────────────
  const doors = objects.filter(obj => obj.name && obj.name.toLowerCase().includes("door"));
  if (doors.length > 0) {
    // Attempt to find a legitimate door (not a tiny cabinet door)
    // Acceptable standard door sizes depending on the author's unit:
    const ACCEPTABLE_RANGES = [
      { unit: "meters", min: 1.5, max: 3.0, expected: 2.1, factor: 1.0 },
      { unit: "inches", min: 59, max: 118, expected: 82.6, factor: 0.0254 }, // 1.5m to 3.0m in inches
      { unit: "cm", min: 150, max: 300, expected: 210, factor: 0.01 }, // 1.5m to 3.0m in cm
      { unit: "mm", min: 1500, max: 3000, expected: 2100, factor: 0.001 },
    ];

    for (const door of doors) {
      const rawHeight = getObjHeight(door);
      if (rawHeight <= 0) continue;

      for (const range of ACCEPTABLE_RANGES) {
        if (rawHeight >= range.min && rawHeight <= range.max) {
          const factor = range.expected / rawHeight;
          console.log(`[ScaleAuthority] Target detection: Door Heuristic (Priority 2)`);
          console.log(`[ScaleAuthority] Measured height: ${rawHeight.toFixed(2)} units (matched as ${range.unit})`);
          console.log(`[ScaleAuthority] Applied scale factor: ${factor.toFixed(4)}`);
          return { factor, detectedBy: 'priority_2_door_heuristic', confidence: 0.9 };
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PRIORITY 3: Semantic Furniture Detection
  // ─────────────────────────────────────────────────────────────────
  const FURNITURE_TARGETS = [
    { regex: /chair|stool/i, expectedMeters: 0.9, weight: 1.0 },  // average chair back height
    { regex: /table|desk/i, expectedMeters: 0.75, weight: 1.5 },   // average table/desk height
    { regex: /bed/i, expectedMeters: 0.6, weight: 1.0 },          // average bed height
    { regex: /sofa|couch/i, expectedMeters: 0.85, weight: 1.0 },   // average sofa back height
  ];

  let totalScaleSum = 0;
  let matchesCount = 0;

  for (const obj of objects) {
    const name = obj.name || "";
    for (const target of FURNITURE_TARGETS) {
      if (target.regex.test(name)) {
        const measuredHeight = getObjHeight(obj);
        if (measuredHeight > 0) {
          // Calculate what the factor would be to reach expectedMeters
          const estimatedFactor = target.expectedMeters / measuredHeight;

          // Reject matches that are completely insane (e.g. a 50m tall chair or a 0.001m tall bed)
          // A valid estimatedFactor should broadly fall near known units (1, 0.0254, 0.01, 0.001, or slight variations)
          if (estimatedFactor > 0.0001 && estimatedFactor < 5.0) {
             totalScaleSum += (estimatedFactor * target.weight);
             matchesCount += target.weight;
          }
        }
      }
    }
  }

  if (matchesCount > 0) {
    const avgFactor = totalScaleSum / matchesCount;
    // Snap to nearest standard unit if it's very close (within 10%), to avoid floating point weirdness
    const UNIT_CONVERSIONS = [1.0, 0.0254, 0.01, 0.001];
    let finalFactor = avgFactor;
    
    for (const exactFactor of UNIT_CONVERSIONS) {
      if (Math.abs(avgFactor - exactFactor) / exactFactor < 0.1) {
        finalFactor = exactFactor;
        break;
      }
    }

    console.log(`[ScaleAuthority] Target detection: Semantic Furniture Detection (Priority 3)`);
    console.log(`[ScaleAuthority] Measured ${matchesCount.toFixed(1)} weighted furniture items.`);
    console.log(`[ScaleAuthority] Averaged scale factor (snapped): ${finalFactor.toFixed(4)}`);
    return { factor: finalFactor, detectedBy: 'priority_3_furniture_heuristic', confidence: 0.75 };
  }

  // ─────────────────────────────────────────────────────────────────
  // PRIORITY 4: Scene Bounding Box (Backend Legacy Fallback)
  // ─────────────────────────────────────────────────────────────────
  return _legacyDetectSceneScale(sceneData.boundingBox);
};


/**
 * Legacy Backend Scale Logic - operates mathematically on the room size bounds.
 */
function _legacyDetectSceneScale(bbox) {
  if (!bbox || !bbox.min || !bbox.max) {
    return { factor: 1.0, detectedBy: 'fallback_empty_bbox', maxDimMeters: 0, confidence: 0.1 };
  }

  const width = Math.abs(bbox.max[0] - bbox.min[0]) || 0;
  const height = Math.abs(bbox.max[1] - bbox.min[1]) || 0;
  const depth = Math.abs(bbox.max[2] - bbox.min[2]) || 0;
  
  const maxHorizontal = Math.max(width, depth);
  const vertical = height;

  if (maxHorizontal === 0) return { factor: 1.0, detectedBy: 'fallback_zero_size', maxDimMeters: 0, confidence: 0.1 };

  const UNIT_CONVERSIONS = [
    { unit: 'feet',        factor: 0.3048 },
    { unit: 'inches',      factor: 0.0254 },
    { unit: 'centimeters', factor: 0.01 },
    { unit: 'millimeters', factor: 0.001 },
    { unit: 'meters',      factor: 1.0 }
  ];

  let best = null;
  let bestScore = Infinity;

  for (const conv of UNIT_CONVERSIONS) {
    const dimH = maxHorizontal * conv.factor;
    const dimV = vertical * conv.factor;

    // Reject totally absurd scales (e.g., room < 0.5m wide or > 100m wide)
    if (dimH < 0.5 || dimH > 100) continue;

    let scoreV = 0;
    if (vertical > 0.1) {
       // Target height is flexible [2.2, 4.5] but strongly penalties anything outside
       let errorV = 0;
       if (dimV < 2.0) errorV = 2.0 - dimV;
       else if (dimV > 4.5) errorV = dimV - 4.5;
       
       scoreV = errorV * 20.0; 
    }

    let scoreH = 0;
    // Typical room is between 2m. and 15m.
    if (dimH < 2.0) scoreH = 2.0 - dimH;
    else if (dimH > 25.0) scoreH = dimH - 25.0;
    
    // Add small continuous penalty so exact matches closest to typical 6m room win ties
    const tieBreaker = Math.abs(dimH - 6.0) * 0.1;
    const matchScore = scoreV + scoreH + tieBreaker;

    if (matchScore < bestScore) {
      bestScore = matchScore;
      best = { factor: conv.factor, maxDimMeters: dimH, detectedBy: `fallback_bbox_math_${conv.unit}` };
    }
  }

  if (best) {
    console.log(`[ScaleAuthority] Target detection: Backward BBox Logic (Priority 4)`);
    console.log(`[ScaleAuthority] Applied scale factor: ${best.factor}`);
    if (best) best.confidence = 0.5;
    return best;
  }

  // Final absolute fallback: scale so max horizontal dim ≈ 8m
  const safeHorizontal = Math.max(maxHorizontal, 0.001);
  const fallbackFactor = 8.0 / safeHorizontal;
  
  console.log(`[ScaleAuthority] Target detection: Absolute Fallback`);
  console.log(`[ScaleAuthority] Applied scale factor: ${fallbackFactor.toFixed(4)}`);
  
  return {
    factor: fallbackFactor,
    detectedBy: 'absolute_fallback',
    maxDimMeters: 8.0,
    confidence: 0.2
  };
}

export default { detectScale };