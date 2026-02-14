
import { MATERIAL_COLLISION } from '../services/injuryCalculator.js';

// ── KEYWORD DICTIONARY ──────────────────────────────────────────────────────
const OBJECT_KEYWORDS = {
  // === FURNITURE ===
  bed:        { category: 'furniture', subcategory: 'bed', surfaceType: 'fabric', attractionByAge: { infant: 0.1, toddler: 0.8, preschool: 0.5 }, canClimb: true },
  crib:       { category: 'furniture', subcategory: 'crib', surfaceType: 'wood', attractionByAge: { infant: 0.9, toddler: 0.2 }, canClimb: false },
  table:      { category: 'furniture', subcategory: 'table', surfaceType: 'wood', attractionByAge: { toddler: 0.4, preschool: 0.3 }, edgeSharpness: 0.8 },
  desk:       { category: 'furniture', subcategory: 'table', surfaceType: 'wood', attractionByAge: { preschool: 0.5 }, edgeSharpness: 0.8 },
  chair:      { category: 'furniture', subcategory: 'chair', surfaceType: 'wood', attractionByAge: { toddler: 0.6, preschool: 0.4 }, canClimb: true },
  sofa:       { category: 'furniture', subcategory: 'sofa', surfaceType: 'fabric', attractionByAge: { infant: 0.2, toddler: 0.9, preschool: 0.8 }, canClimb: true },
  couch:      { category: 'furniture', subcategory: 'sofa', surfaceType: 'fabric', attractionByAge: { infant: 0.2, toddler: 0.9, preschool: 0.8 } },
  shelf:      { category: 'furniture', subcategory: 'storage', surfaceType: 'wood', attractionByAge: { toddler: 0.7, preschool: 0.6 }, canClimb: true, tipHazard: true },
  bookcase:   { category: 'furniture', subcategory: 'storage', surfaceType: 'wood', attractionByAge: { toddler: 0.7, preschool: 0.6 }, tipHazard: true },
  cabinet:    { category: 'furniture', subcategory: 'storage', surfaceType: 'wood', attractionByAge: { toddler: 0.8, preschool: 0.5 }, pinchHazard: true },
  drawer:     { category: 'furniture', subcategory: 'storage', surfaceType: 'wood', attractionByAge: { toddler: 0.9, preschool: 0.4 }, pinchHazard: true },
  tv:         { category: 'appliance', subcategory: 'electronics', surfaceType: 'plastic', attractionByAge: { infant: 0.4, toddler: 0.9, preschool: 0.9 }, tipHazard: true },
  television: { category: 'appliance', subcategory: 'electronics', surfaceType: 'plastic', attractionByAge: { infant: 0.4, toddler: 0.9, preschool: 0.9 }, tipHazard: true },

  // === HAZARDS ===
  stairs:     { category: 'structure', subcategory: 'stairs', surfaceType: 'wood', attractionByAge: { infant: 0.1, toddler: 0.8, preschool: 0.4 }, fallHazard: true },
  step:       { category: 'structure', subcategory: 'stairs', surfaceType: 'wood', attractionByAge: { toddler: 0.6 } },
  window:     { category: 'structure', subcategory: 'window', surfaceType: 'glass', attractionByAge: { toddler: 0.7, preschool: 0.8 }, fallHazard: true },
  socket:     { category: 'hazard', subcategory: 'electrical', surfaceType: 'plastic', attractionByAge: { infant: 0.2, toddler: 0.95, preschool: 0.3 }, electricHazard: true },
  outlet:     { category: 'hazard', subcategory: 'electrical', surfaceType: 'plastic', attractionByAge: { infant: 0.2, toddler: 0.95, preschool: 0.3 }, electricHazard: true },
  cord:       { category: 'hazard', subcategory: 'strangulation', surfaceType: 'plastic', attractionByAge: { infant: 0.6, toddler: 0.8, preschool: 0.2 }, chokeHazard: true },
  cable:      { category: 'hazard', subcategory: 'strangulation', surfaceType: 'plastic', attractionByAge: { infant: 0.6, toddler: 0.8 } },
  knife:      { category: 'hazard', subcategory: 'sharp', surfaceType: 'metal', attractionByAge: { toddler: 0.4, preschool: 0.5 }, cutHazard: true },
  glass:      { category: 'hazard', subcategory: 'sharp', surfaceType: 'glass', attractionByAge: { toddler: 0.5 }, cutHazard: true },
  cleaning:   { category: 'hazard', subcategory: 'chemical', surfaceType: 'plastic', attractionByAge: { toddler: 0.9, preschool: 0.4 }, poisonHazard: true },
  bleach:     { category: 'hazard', subcategory: 'chemical', surfaceType: 'plastic', attractionByAge: { toddler: 0.9 } },

  // === TOYS / OBJECTS ===
  toy:        { category: 'toy', subcategory: 'general', surfaceType: 'plastic', attractionByAge: { infant: 0.8, toddler: 0.95, preschool: 0.9 } },
  lego:       { category: 'toy', subcategory: 'small_parts', surfaceType: 'plastic', attractionByAge: { toddler: 0.8, preschool: 0.95 }, chokeHazard: true },
  block:      { category: 'toy', subcategory: 'general', surfaceType: 'wood', attractionByAge: { infant: 0.7, toddler: 0.9 } },
  ball:       { category: 'toy', subcategory: 'general', surfaceType: 'plastic', attractionByAge: { infant: 0.6, toddler: 0.9, preschool: 0.9 } },
  doll:       { category: 'toy', subcategory: 'soft', surfaceType: 'fabric', attractionByAge: { infant: 0.5, toddler: 0.8, preschool: 0.8 } },
  bear:       { category: 'toy', subcategory: 'soft', surfaceType: 'fabric', attractionByAge: { infant: 0.5, toddler: 0.8 } },
  
  // === DECOR ===
  rug:        { category: 'decor', subcategory: 'floor', surfaceType: 'carpet', attractionByAge: { infant: 0.9, toddler: 0.5 }, tripHazard: true },
  carpet:     { category: 'decor', subcategory: 'floor', surfaceType: 'carpet', attractionByAge: { infant: 0.9 } },
  lamp:       { category: 'decor', subcategory: 'lighting', surfaceType: 'metal', attractionByAge: { infant: 0.3, toddler: 0.8, preschool: 0.5 }, hotHazard: true, tipHazard: true },
  plant:      { category: 'decor', subcategory: 'nature', surfaceType: 'ceramic', attractionByAge: { infant: 0.4, toddler: 0.7, preschool: 0.3 }, poisonHazard: true },
  vase:       { category: 'decor', subcategory: 'fragile', surfaceType: 'glass', attractionByAge: { toddler: 0.6, preschool: 0.4 }, cutHazard: true },
  mirror:     { category: 'decor', subcategory: 'fragile', surfaceType: 'glass', attractionByAge: { infant: 0.8, toddler: 0.9, preschool: 0.7 } },
  
  // === DEFAULT/GENERIC ===
  floor:      { category: 'structure', subcategory: 'floor', surfaceType: 'wood', attractionByAge: { infant: 1.0, toddler: 0.1 } },
  wall:       { category: 'structure', subcategory: 'wall', surfaceType: 'plaster', attractionByAge: { infant: 0.0, toddler: 0.1 } },
  door:       { category: 'structure', subcategory: 'door', surfaceType: 'wood', attractionByAge: { toddler: 0.7, preschool: 0.6 }, pinchHazard: true }
};

// ── COLOR HELPERS ────────────────────────────────────────────────────────
const COLOR_PALETTE = {
  wood:   [[100, 70, 40], [160, 120, 80], [200, 150, 100]], // Browns
  metal:  [[150, 150, 150], [200, 200, 200], [50, 50, 50]], // Greys
  plastic:[[255, 0, 0], [0, 0, 255], [255, 255, 0]],        // Bright primaries
  fabric: [[240, 240, 240], [200, 200, 220]],               // Whites/Softs
};

function estimateMaterialFromColor(rgba) {
  if (!rgba || rgba.length < 3) return null;
  const r = rgba[0] * 255;
  const g = rgba[1] * 255;
  const b = rgba[2] * 255;

  // Simple heuristic
  if (r > 100 && g > 100 && b > 100 && Math.abs(r-g) < 20 && Math.abs(g-b) < 20) return 'metal'; // Grey-ish
  if (r > g && g > b && r > 100 && b < 100) return 'wood'; // Brown-ish
  return 'plastic'; // Default to plastic for colors
}

// ============================================================================
// CLASSIFIER LOGIC
// ============================================================================

export function classifyObject(obj, sceneBbox, floorInfo) {
  const name = (obj.name || '').toLowerCase();
  
  // 1. Initial Match by Name
  let match = null;
  let matchScore = 0;

  for (const [key, data] of Object.entries(OBJECT_KEYWORDS)) {
    if (name.includes(key)) {
      // Prioritize longer matches (e.g., "coffee table" > "table")
      if (key.length > matchScore) {
        match = data;
        matchScore = key.length;
      }
    }
  }

  // 2. Material Analysis (PBR -> Collision Material Map)
  let estimatedMaterial = 'unknown';
  if (obj.material) {
    const { metallic = 0, roughness = 0.5, transmission = 0, baseColor } = obj.material;

    if (transmission > 0.5) {
      estimatedMaterial = 'glass';
    } else if (metallic > 0.6) {
      estimatedMaterial = 'metal';
    } else if (roughness > 0.8) {
      // High roughness: could be fabric, carpet, or concrete/stone
      // Check color/name to disambiguate
      if (name.includes('floor') || name.includes('wall')) estimatedMaterial = 'concrete';
      else estimatedMaterial = 'fabric';
    } else if (roughness < 0.2) {
      // Low roughness (shiny) non-metal: plastic, ceramic, or polished wood
      estimatedMaterial = 'plastic';
    } else {
      // Mid roughness: Wood, Plastic, Rubber
      if (baseColor) {
        const matFromColor = estimateMaterialFromColor(baseColor); // returns 'wood', 'metal', 'plastic'
        if (matFromColor === 'wood') estimatedMaterial = 'wood';
        else estimatedMaterial = 'plastic';
      }
    }
  }

  // 3. Fallback Classification
  if (!match) {
    // If no keyword match, guess by material + size
    const dims = [
      obj.boundingBox.max[0] - obj.boundingBox.min[0],
      obj.boundingBox.max[1] - obj.boundingBox.min[1],
      obj.boundingBox.max[2] - obj.boundingBox.min[2]
    ];
    const volume = dims[0] * dims[1] * dims[2];

    if (estimatedMaterial === 'wood' && volume > 0.5) {
      match = { category: 'furniture', subcategory: 'general', surfaceType: 'wood', attractionByAge: { toddler: 0.3 } };
    } else if (estimatedMaterial === 'fabric') {
      match = { category: 'decor', subcategory: 'soft', surfaceType: 'fabric', attractionByAge: { infant: 0.6 } };
    } else {
      match = { category: 'unknown', subcategory: 'misc', surfaceType: estimatedMaterial, attractionByAge: { toddler: 0.4 } };
    }
  }

  // 4. Override Surface Type if Material Analysis is Strong
  let finalSurface = match.surfaceType;
  if (obj.material && obj.material.name) {
     const matName = obj.material.name.toLowerCase();
     if (matName.includes('glass')) finalSurface = 'glass';
     if (matName.includes('metal')) finalSurface = 'metal';
     if (matName.includes('wood')) finalSurface = 'wood';
  } else if (estimatedMaterial !== 'unknown' && match.surfaceType === 'unknown') {
    finalSurface = estimatedMaterial;
  }

  // 5. Construct Result
  // Ensure we define all needed properties for Agent & Physics
  const result = {
    category: match.category,
    subcategory: match.subcategory,
    surfaceType: finalSurface,
    // Add missing specificName for UI
    specificName: (match.subcategory + ' ' + match.category).replace('_', ' '), 
    properties: {
      ...match,
      surfaceType: finalSurface,
      material: obj.material || {},
      isFloor: (floorInfo && floorInfo.objectId === obj.id)
    },
    attractionByAge: match.attractionByAge || {},
    dangerScore: (match.sharpness || 0) * 10 + (match.fallHazard ? 50 : 0),
    confidence: matchScore > 0 ? 0.9 : 0.4
  };

  // Special case: Floor
  if (floorInfo && floorInfo.objectId === obj.id) {
    result.category = 'structure';
    result.subcategory = 'floor';
    result.surfaceType = 'carpet'; // Default to carpet for safety unless spec'd
    result.attractionByAge = { infant: 1.0, toddler: 0.1 };
  }

  return result;
}



export function classifyScene(objects, sceneBbox, floorInfo) {
  if (!Array.isArray(objects)) return [];
  return objects.map(obj => classifyObject(obj, sceneBbox, floorInfo));
}

export default { classifyObject, classifyScene, OBJECT_KEYWORDS };