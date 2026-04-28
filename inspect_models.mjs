/**
 * Quick GLB model inspector using three.js in Node.
 * Outputs bounding boxes, mesh names, and scale calculations.
 */
import { readFileSync } from 'fs';
import { join, basename } from 'path';

// Minimal GLB parser - just reads the JSON chunk
function parseGLB(filepath) {
  const buf = readFileSync(filepath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('Not a GLB file');
  
  const jsonLen = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  if (jsonType !== 0x4E4F534A) throw new Error('Expected JSON chunk');
  
  const jsonStr = buf.slice(20, 20 + jsonLen).toString('utf8');
  return JSON.parse(jsonStr);
}

function inspectModel(filepath) {
  const name = basename(filepath);
  const gltf = parseGLB(filepath);
  
  // Collect mesh/node info
  const meshNames = [];
  const nodeNames = [];
  
  if (gltf.nodes) {
    gltf.nodes.forEach((node, i) => {
      nodeNames.push(node.name || `node_${i}`);
      if (node.mesh !== undefined) {
        const meshDef = gltf.meshes?.[node.mesh];
        meshNames.push(meshDef?.name || node.name || `mesh_${node.mesh}`);
      }
    });
  }
  
  // Collect accessor min/max for position attributes to estimate bounding box
  let globalMin = [Infinity, Infinity, Infinity];
  let globalMax = [-Infinity, -Infinity, -Infinity];
  
  if (gltf.meshes && gltf.accessors) {
    gltf.meshes.forEach((mesh) => {
      mesh.primitives?.forEach((prim) => {
        const posIdx = prim.attributes?.POSITION;
        if (posIdx !== undefined) {
          const accessor = gltf.accessors[posIdx];
          if (accessor.min && accessor.max) {
            for (let i = 0; i < 3; i++) {
              globalMin[i] = Math.min(globalMin[i], accessor.min[i]);
              globalMax[i] = Math.max(globalMax[i], accessor.max[i]);
            }
          }
        }
      });
    });
  }
  
  // But we need to account for node transforms
  // For a rough estimate, also check node translations
  let hasTransforms = false;
  if (gltf.nodes) {
    gltf.nodes.forEach((node) => {
      if (node.translation || node.scale || node.rotation || node.matrix) {
        hasTransforms = true;
      }
    });
  }
  
  const size = [
    globalMax[0] - globalMin[0],
    globalMax[1] - globalMin[1],
    globalMax[2] - globalMin[2],
  ];
  
  const center = [
    (globalMin[0] + globalMax[0]) / 2,
    (globalMin[1] + globalMax[1]) / 2,
    (globalMin[2] + globalMax[2]) / 2,
  ];
  
  // Animations
  const animNames = (gltf.animations || []).map(a => a.name || 'unnamed');
  
  // Materials
  const matNames = (gltf.materials || []).map(m => m.name || 'unnamed');
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📦 ${name}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Raw Accessor Min:    (${globalMin.map(v => v.toFixed(3)).join(', ')})`);
  console.log(`  Raw Accessor Max:    (${globalMax.map(v => v.toFixed(3)).join(', ')})`);
  console.log(`  Raw Size (W×H×D):    ${size.map(v => v.toFixed(3)).join(' × ')}`);
  console.log(`  Raw Center:          (${center.map(v => v.toFixed(3)).join(', ')})`);
  console.log(`  Has Node Transforms: ${hasTransforms ? 'YES ⚠️ (bbox may differ at runtime)' : 'No'}`);
  console.log(`  Mesh Count:          ${gltf.meshes?.length || 0}`);
  console.log(`  Node Count:          ${gltf.nodes?.length || 0}`);
  console.log(`  Material Count:      ${gltf.materials?.length || 0}`);
  console.log(`  Animation Count:     ${gltf.animations?.length || 0}`);
  console.log(`  Mesh Names:          ${meshNames.join(', ') || '(none)'}`);
  console.log(`  Node Names:          ${nodeNames.join(', ') || '(none)'}`);
  console.log(`  Material Names:      ${matNames.join(', ') || '(none)'}`);
  if (animNames.length > 0) {
    console.log(`  Animation Names:     ${animNames.join(', ')}`);
  }
  
  // Node details with transforms
  if (gltf.nodes) {
    const transformedNodes = gltf.nodes.filter(n => n.translation || n.scale || n.rotation);
    if (transformedNodes.length > 0) {
      console.log(`  Transformed Nodes:`);
      transformedNodes.forEach(n => {
        console.log(`    - ${n.name || 'unnamed'}: T=${JSON.stringify(n.translation)} S=${JSON.stringify(n.scale)} R=${JSON.stringify(n.rotation)}`);
      });
    }
  }
  
  return { name, size, globalMin, globalMax, center, meshNames, nodeNames, hasTransforms };
}

// Run inspection
const modelsDir = join(process.cwd(), 'Frontend', 'public', 'models');
const files = [
  'house_complete.glb',
  'room.glb',
  'play_toys_animated.glb',
  'sit_to_stand_animated.glb',
  'walk_animated.glb',
  'car_toy.glb',
  'dog_toy.glb',
  'seal_toys.glb',
  'table_hazard.glb',
];

console.log('🔍 MODEL DIAGNOSTIC REPORT');
console.log(`${'═'.repeat(60)}`);

const results = [];
for (const file of files) {
  try {
    const info = inspectModel(join(modelsDir, file));
    results.push(info);
  } catch (err) {
    console.error(`❌ Error loading ${file}:`, err.message);
  }
}

// Scale calculation summary
console.log(`\n\n${'═'.repeat(60)}`);
console.log('📐 SCALE CALCULATIONS');
console.log(`${'═'.repeat(60)}`);

const targets = {
  'house_complete.glb': { targetH: 3.5, desc: 'Full house with roof' },
  'room.glb': { targetH: 3.0, desc: 'Interior room' },
  'play_toys_animated.glb': { targetH: 0.5, desc: 'Baby playing' },
  'sit_to_stand_animated.glb': { targetH: 0.5, desc: 'Baby standing' },
  'walk_animated.glb': { targetH: 0.5, desc: 'Baby walking' },
  'car_toy.glb': { targetH: 0.1, desc: 'Car toy' },
  'dog_toy.glb': { targetH: 0.12, desc: 'Dog toy' },
  'seal_toys.glb': { targetH: 0.08, desc: 'Seal toy' },
  'table_hazard.glb': { targetH: 0.55, desc: 'Hazard table' },
};

for (const r of results) {
  const t = targets[r.name];
  if (!t) continue;
  const scale = t.targetH / r.size[1];
  const worldW = r.size[0] * scale;
  const worldH = r.size[1] * scale;
  const worldD = r.size[2] * scale;
  const floorOffset = -r.globalMin[1] * scale;
  console.log(`\n  ${r.name} (${t.desc}):`);
  console.log(`    Raw H=${r.size[1].toFixed(3)} → target H=${t.targetH}`);
  console.log(`    Scale = ${scale.toFixed(6)}`);
  console.log(`    World Size: ${worldW.toFixed(3)} × ${worldH.toFixed(3)} × ${worldD.toFixed(3)}`);
  console.log(`    Floor Y-Offset: +${floorOffset.toFixed(4)}`);
  console.log(`    ${r.hasTransforms ? '⚠️ Has transforms — verify at runtime!' : '✅ No transforms'}`);
}
