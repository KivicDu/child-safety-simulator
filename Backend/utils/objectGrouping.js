// ─────────────────────────────────────────────────────────────────────────────
// objectGrouping.js — Graph-based object grouping via connected components
//
// Groups meshes into logical entities (e.g. table legs + top → "Table")
// using hierarchy prefix matching, AABB overlap, and distance proximity.
//
// Algorithm:
//   1. Build undirected graph: nodes=objects, edges=grouping conditions
//   2. Find connected components via BFS
//   3. Each component = one ObjectGroup
// ─────────────────────────────────────────────────────────────────────────────

import {
  distance as vecDistance,
  aabbOverlap,
  mergeBBox,
  bboxCenter,
  bboxDimensions,
  sceneDiagonal,
} from './vecUtils.js';

// ── Union-Find (Disjoint Set) for connected components ────────────────────
class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank   = new Array(n).fill(0);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;

    // union by rank
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
    return true;
  }

  connected(a, b) {
    return this.find(a) === this.find(b);
  }
}

// ── Hierarchy prefix extraction ──────────────────────────────────────────────
// Extracts common prefix from mesh names like "Table_Leg_1", "Table_Top"
// → prefix = "Table"
function extractPrefix(name) {
  if (!name) return null;
  // Split by common separators: _, -, ., space
  // Then take everything except the last segment (which is usually the part identifier)
  const parts = name.split(/[_\-.\s]+/);
  if (parts.length < 2) return null;
  // Return prefix (all but last part)
  return parts.slice(0, -1).join('_').toLowerCase();
}

// ── Check if two names share a hierarchy prefix ──────────────────────────────
function shareHierarchyPrefix(nameA, nameB) {
  const prefixA = extractPrefix(nameA);
  const prefixB = extractPrefix(nameB);
  if (!prefixA || !prefixB) return false;
  // Must be the same prefix AND at least 3 chars long to avoid false positives
  return prefixA === prefixB && prefixA.length >= 3;
}

// ── Determine group name from members ────────────────────────────────────────
function deriveGroupName(members) {
  if (members.length === 0) return 'Unknown Group';

  // Try common prefix
  const prefixes = members.map(m => extractPrefix(m.name)).filter(Boolean);
  if (prefixes.length > 0) {
    // Find most frequent prefix
    const freq = {};
    for (const p of prefixes) {
      freq[p] = (freq[p] || 0) + 1;
    }
    const bestPrefix = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    // Capitalize first letter
    return bestPrefix.charAt(0).toUpperCase() + bestPrefix.slice(1);
  }

  // Fallback: use the first member's name
  return members[0].name || 'Group';
}

// ── Volume threshold — ignore tiny objects ───────────────────────────────────
const MIN_OBJECT_VOLUME = 0.0001; // 0.1 cm³

/**
 * Group SceneObjects into logical entities.
 *
 * @param {SceneObject[]} objects - Normalized scene objects (with Vec3 bbox)
 * @param {{ min: Vec3, max: Vec3 }} scnBbox - Scene bounding box
 * @param {object} [options] - Config overrides
 * @param {number} [options.distanceThresholdFactor=0.05] - Distance as fraction of scene diagonal
 * @param {boolean} [options.useHierarchy=true]
 * @param {boolean} [options.useOverlap=true]
 * @param {boolean} [options.useDistance=true]
 * @returns {{ groups: ObjectGroup[], ungrouped: SceneObject[] }}
 */
export function groupObjects(objects, scnBbox, options = {}) {
  const {
    distanceThresholdFactor = 0.05,
    useHierarchy = true,
    useOverlap   = true,
    useDistance   = true,
  } = options;

  if (!objects || objects.length === 0) {
    return { groups: [], ungrouped: [] };
  }

  // Filter out tiny objects
  const validObjects = objects.filter(obj => {
    const d = obj.dimensions;
    return (d.width * d.height * d.depth) >= MIN_OBJECT_VOLUME;
  });

  const n = validObjects.length;
  const uf = new UnionFind(n);

  // Compute dynamic distance threshold from scene size
  const diag = sceneDiagonal(scnBbox);
  const distThreshold = diag * distanceThresholdFactor;

  // ── Strategy 1: Hierarchy grouping (strongest signal) ─────────────────
  if (useHierarchy) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (uf.connected(i, j)) continue;
        if (shareHierarchyPrefix(validObjects[i].name, validObjects[j].name)) {
          uf.union(i, j);
        }
      }
    }
  }

  // ── Strategy 2: Overlap grouping ──────────────────────────────────────
  if (useOverlap) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (uf.connected(i, j)) continue;
        if (aabbOverlap(validObjects[i].bbox, validObjects[j].bbox)) {
          uf.union(i, j);
        }
      }
    }
  }

  // ── Strategy 3: Distance grouping (weakest signal) ────────────────────
  if (useDistance) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (uf.connected(i, j)) continue;
        const dist = vecDistance(validObjects[i].center, validObjects[j].center);
        if (dist < distThreshold) {
          uf.union(i, j);
        }
      }
    }
  }

  // ── Extract connected components ──────────────────────────────────────
  const componentMap = new Map(); // root → list of indices
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!componentMap.has(root)) componentMap.set(root, []);
    componentMap.get(root).push(i);
  }

  const groups = [];
  const ungrouped = [];
  let groupIdx = 0;

  for (const [, indices] of componentMap) {
    const members = indices.map(i => validObjects[i]);

    if (members.length === 1) {
      // Single member = ungrouped (not a meaningful group)
      ungrouped.push(members[0]);
      continue;
    }

    // Compute merged bounding box
    let mergedBbox = members[0].bbox;
    for (let i = 1; i < members.length; i++) {
      mergedBbox = mergeBBox(mergedBbox, members[i].bbox);
    }

    groups.push({
      id: `group_${groupIdx++}`,
      name: deriveGroupName(members),
      members: members.map(m => m.id),
      bbox: mergedBbox,
      center: bboxCenter(mergedBbox),
    });
  }

  console.log(
    `[ObjectGrouping] ${validObjects.length} objects → ${groups.length} groups, ` +
    `${ungrouped.length} ungrouped (distThreshold: ${distThreshold.toFixed(2)}m)`
  );

  return { groups, ungrouped };
}

export default { groupObjects };
