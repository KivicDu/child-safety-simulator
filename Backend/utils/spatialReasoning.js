// ─────────────────────────────────────────────────────────────────────────────
// spatialReasoning.js — Contextual hazard detection engine
//
// Uses a declarative rule engine pattern:
//   Each rule = { id, match(ctx) → boolean, buildHazard(ctx) → Hazard }
//
// Severity is computed from distance, height, and object type.
// ─────────────────────────────────────────────────────────────────────────────

import { distance as vecDistance } from './vecUtils.js';

// ── Helper: find object by ID ────────────────────────────────────────────────
function findObj(objects, id) {
  return objects.find(o => o.id === id);
}

// ── Helper: check if object matches category/keyword ─────────────────────────
function matchesLabel(obj, ...keywords) {
  if (!obj) return false;
  const name = (obj.name || '').toLowerCase();
  const label = (obj.classification?.label || '').toLowerCase();
  const cat = (obj.classification?.category || '').toLowerCase();
  const sub = (obj.classification?.subcategory || '').toLowerCase();

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (name.includes(kwLower) || label.includes(kwLower) ||
        cat.includes(kwLower) || sub.includes(kwLower)) {
      return true;
    }
  }
  return false;
}

// ── Helper: compute severity from distance + height ──────────────────────────
function severityFromDistance(dist, dangerDist = 1.0) {
  if (dist < dangerDist * 0.3) return 'high';
  if (dist < dangerDist * 0.7) return 'medium';
  return 'low';
}

// ── RULE DEFINITIONS ─────────────────────────────────────────────────────────

const RULES = [
  // ── Rule 1: Toy near stairs → fall risk ─────────────────────────────────
  {
    id: 'toy_near_stairs',
    match(ctx) {
      return ctx.relations.some(r => {
        if (r.relation !== 'near' && r.relation !== 'touching') return false;
        const a = findObj(ctx.objects, r.objectA);
        const b = findObj(ctx.objects, r.objectB);
        return (
          (matchesLabel(a, 'toy', 'ball', 'block', 'lego', 'doll') && matchesLabel(b, 'stair', 'step')) ||
          (matchesLabel(b, 'toy', 'ball', 'block', 'lego', 'doll') && matchesLabel(a, 'stair', 'step'))
        );
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      for (const r of ctx.relations) {
        if (r.relation !== 'near' && r.relation !== 'touching') continue;
        const a = findObj(ctx.objects, r.objectA);
        const b = findObj(ctx.objects, r.objectB);

        let toy, stairs;
        if (matchesLabel(a, 'toy', 'ball', 'block', 'lego', 'doll') && matchesLabel(b, 'stair', 'step')) {
          toy = a; stairs = b;
        } else if (matchesLabel(b, 'toy', 'ball', 'block', 'lego', 'doll') && matchesLabel(a, 'stair', 'step')) {
          toy = b; stairs = a;
        } else continue;

        hazards.push({
          type: 'fall_risk',
          severity: severityFromDistance(r.distance || 0, 2.0),
          objects: [toy.id, stairs.id],
          position: toy.center,
          explanation: `Toy "${toy.name}" is ${r.relation} stairs "${stairs.name}" — child may trip and fall.`,
        });
      }
      return hazards;
    },
  },

  // ── Rule 2: Sharp object near floor → cut risk for infants ──────────────
  {
    id: 'sharp_near_floor',
    match(ctx) {
      return ctx.objects.some(obj => {
        if (!matchesLabel(obj, 'knife', 'scissors', 'glass', 'sharp', 'razor', 'fork')) return false;
        // Check if object is low (near floor height)
        const floorY = ctx.floorHeight || 0;
        return obj.center.y < floorY + 0.5; // within 50cm of floor
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      const floorY = ctx.floorHeight || 0;
      for (const obj of ctx.objects) {
        if (!matchesLabel(obj, 'knife', 'scissors', 'glass', 'sharp', 'razor', 'fork')) continue;
        if (obj.center.y >= floorY + 0.5) continue;

        const heightAbove = obj.center.y - floorY;
        hazards.push({
          type: 'cut_risk',
          severity: heightAbove < 0.2 ? 'high' : 'medium',
          objects: [obj.id],
          position: obj.center,
          explanation: `Sharp object "${obj.name}" is ${heightAbove.toFixed(2)}m above floor — accessible to crawling infants.`,
        });
      }
      return hazards;
    },
  },

  // ── Rule 3: Climbable near window → fall risk ───────────────────────────
  {
    id: 'climbable_near_window',
    match(ctx) {
      return ctx.relations.some(r => {
        if (r.relation !== 'near' && r.relation !== 'touching') return false;
        const a = findObj(ctx.objects, r.objectA);
        const b = findObj(ctx.objects, r.objectB);
        return (
          (matchesLabel(a, 'chair', 'stool', 'sofa', 'bench', 'box', 'shelf') && matchesLabel(b, 'window')) ||
          (matchesLabel(b, 'chair', 'stool', 'sofa', 'bench', 'box', 'shelf') && matchesLabel(a, 'window'))
        );
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      for (const r of ctx.relations) {
        if (r.relation !== 'near' && r.relation !== 'touching') continue;
        const a = findObj(ctx.objects, r.objectA);
        const b = findObj(ctx.objects, r.objectB);

        let climbable, window;
        if (matchesLabel(a, 'chair', 'stool', 'sofa', 'bench', 'box', 'shelf') && matchesLabel(b, 'window')) {
          climbable = a; window = b;
        } else if (matchesLabel(b, 'chair', 'stool', 'sofa', 'bench', 'box', 'shelf') && matchesLabel(a, 'window')) {
          climbable = b; window = a;
        } else continue;

        hazards.push({
          type: 'fall_risk',
          severity: 'high',
          objects: [climbable.id, window.id],
          position: climbable.center,
          explanation: `Climbable furniture "${climbable.name}" is near window "${window.name}" — child may climb and fall out.`,
        });
      }
      return hazards;
    },
  },

  // ── Rule 4: Electrical hazard near floor → shock risk ───────────────────
  {
    id: 'electrical_near_floor',
    match(ctx) {
      return ctx.objects.some(obj => {
        if (!matchesLabel(obj, 'socket', 'outlet', 'plug', 'electric', 'cord', 'cable')) return false;
        const floorY = ctx.floorHeight || 0;
        return obj.center.y < floorY + 0.4; // within 40cm of floor
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      const floorY = ctx.floorHeight || 0;
      for (const obj of ctx.objects) {
        if (!matchesLabel(obj, 'socket', 'outlet', 'plug', 'electric', 'cord', 'cable')) continue;
        if (obj.center.y >= floorY + 0.4) continue;

        hazards.push({
          type: 'electrical_risk',
          severity: 'high',
          objects: [obj.id],
          position: obj.center,
          explanation: `Electrical hazard "${obj.name}" is ${(obj.center.y - floorY).toFixed(2)}m above floor — toddlers can reach.`,
        });
      }
      return hazards;
    },
  },

  // ── Rule 5: Small object on floor → choking hazard ──────────────────────
  {
    id: 'small_object_floor',
    match(ctx) {
      const floorY = ctx.floorHeight || 0;
      return ctx.objects.some(obj => {
        const vol = obj.dimensions.width * obj.dimensions.height * obj.dimensions.depth;
        const maxDim = Math.max(obj.dimensions.width, obj.dimensions.height, obj.dimensions.depth);
        return vol < 0.00005 && maxDim < 0.04 && obj.center.y < floorY + 0.1;
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      const floorY = ctx.floorHeight || 0;
      for (const obj of ctx.objects) {
        const vol = obj.dimensions.width * obj.dimensions.height * obj.dimensions.depth;
        const maxDim = Math.max(obj.dimensions.width, obj.dimensions.height, obj.dimensions.depth);
        if (vol >= 0.00005 || maxDim >= 0.04 || obj.center.y >= floorY + 0.1) continue;

        hazards.push({
          type: 'choking_risk',
          severity: 'high',
          objects: [obj.id],
          position: obj.center,
          explanation: `Small object "${obj.name}" (${(maxDim * 100).toFixed(1)}cm) on/near floor — choking hazard for infants.`,
        });
      }
      return hazards;
    },
  },

  // ── Rule 6: Tip-hazard furniture (tall + narrow base) → tip-over ────────
  {
    id: 'tip_hazard_furniture',
    match(ctx) {
      return ctx.objects.some(obj => {
        if (!matchesLabel(obj, 'shelf', 'bookcase', 'tv', 'lamp', 'cabinet', 'dresser')) return false;
        const d = obj.dimensions;
        return d.height > 0.8 && d.height > (Math.max(d.width, d.depth) * 2);
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      for (const obj of ctx.objects) {
        if (!matchesLabel(obj, 'shelf', 'bookcase', 'tv', 'lamp', 'cabinet', 'dresser')) continue;
        const d = obj.dimensions;
        if (d.height <= 0.8 || d.height <= Math.max(d.width, d.depth) * 2) continue;

        const ratio = d.height / Math.max(d.width, d.depth);
        hazards.push({
          type: 'tip_over_risk',
          severity: ratio > 4 ? 'high' : 'medium',
          objects: [obj.id],
          position: obj.center,
          explanation: `"${obj.name}" is tall (${d.height.toFixed(2)}m) with narrow base (ratio ${ratio.toFixed(1)}:1) — tip-over risk if child climbs.`,
        });
      }
      return hazards;
    },
  },

  // ── Rule 7: Chemical/poison near floor or reachable────────────────────
  {
    id: 'chemical_accessible',
    match(ctx) {
      return ctx.objects.some(obj => {
        if (!matchesLabel(obj, 'cleaning', 'bleach', 'chemical', 'detergent', 'poison')) return false;
        const floorY = ctx.floorHeight || 0;
        return obj.center.y < floorY + 1.0; // within 1m of floor
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      const floorY = ctx.floorHeight || 0;
      for (const obj of ctx.objects) {
        if (!matchesLabel(obj, 'cleaning', 'bleach', 'chemical', 'detergent', 'poison')) continue;
        if (obj.center.y >= floorY + 1.0) continue;

        hazards.push({
          type: 'poison_risk',
          severity: 'high',
          objects: [obj.id],
          position: obj.center,
          explanation: `Chemical/cleaning product "${obj.name}" at reachable height (${(obj.center.y - floorY).toFixed(2)}m) — poison risk.`,
        });
      }
      return hazards;
    },
  },

  // ── Rule 8: Hot surface accessible ──────────────────────────────────────
  {
    id: 'hot_surface_accessible',
    match(ctx) {
      return ctx.objects.some(obj => {
        if (!matchesLabel(obj, 'stove', 'oven', 'heater', 'radiator', 'iron', 'lamp')) return false;
        const floorY = ctx.floorHeight || 0;
        return obj.center.y < floorY + 0.8;
      });
    },
    buildHazard(ctx) {
      const hazards = [];
      const floorY = ctx.floorHeight || 0;
      for (const obj of ctx.objects) {
        if (!matchesLabel(obj, 'stove', 'oven', 'heater', 'radiator', 'iron', 'lamp')) continue;
        if (obj.center.y >= floorY + 0.8) continue;

        hazards.push({
          type: 'burn_risk',
          severity: 'high',
          objects: [obj.id],
          position: obj.center,
          explanation: `Hot surface "${obj.name}" at reachable height (${(obj.center.y - floorY).toFixed(2)}m) — burn risk.`,
        });
      }
      return hazards;
    },
  },
];

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Run all hazard rules against the scene context.
 *
 * @param {SceneObject[]} objects - Normalized + classified objects
 * @param {SpatialRelation[]} relations - Computed spatial relations
 * @param {object} [options]
 * @param {number} [options.floorHeight=0] - Floor Y position
 * @returns {Hazard[]}
 */
export function computeHazards(objects, relations, options = {}) {
  const ctx = {
    objects,
    relations,
    floorHeight: options.floorHeight || 0,
  };

  const allHazards = [];
  let hazardIdx = 0;

  for (const rule of RULES) {
    try {
      if (rule.match(ctx)) {
        const results = rule.buildHazard(ctx);
        for (const h of results) {
          allHazards.push({
            id: `hazard_${hazardIdx++}`,
            ...h,
          });
        }
      }
    } catch (err) {
      console.warn(`[SpatialReasoning] Rule "${rule.id}" error:`, err.message);
    }
  }

  // Deduplicate: same objects + same type
  const seen = new Set();
  const deduped = allHazards.filter(h => {
    const key = `${h.type}_${h.objects.sort().join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(
    `[SpatialReasoning] ${RULES.length} rules checked → ${deduped.length} hazards ` +
    `(high: ${deduped.filter(h => h.severity === 'high').length}, ` +
    `medium: ${deduped.filter(h => h.severity === 'medium').length}, ` +
    `low: ${deduped.filter(h => h.severity === 'low').length})`
  );

  return deduped;
}

/**
 * Get the list of registered rule IDs (for debugging/testing).
 */
export function listRules() {
  return RULES.map(r => r.id);
}

export default { computeHazards, listRules };
