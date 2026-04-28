/**
 * Script to measure bounding boxes of all GLB models.
 * Run with: node measure_models.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MODELS_DIR = resolve('public/models');
const MODEL_FILES = [
  'room.glb',
  'play_toys_animated.glb',
  'sit_to_stand_animated.glb',
  'walk_animated.glb',
  'car_toy.glb',
  'dog_toy.glb',
  'seal_toys.glb',
  'table_hazard.glb',
];

function parseGLB(filePath) {
  const buf = readFileSync(filePath);
  // GLB header: magic(4) + version(4) + length(4) + chunk0_length(4) + chunk0_type(4)
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
  return JSON.parse(jsonStr);
}

function getAccessorMinMax(gltf) {
  const results = [];
  if (!gltf.accessors) return results;
  
  for (const acc of gltf.accessors) {
    if (acc.type === 'VEC3' && acc.min && acc.max) {
      results.push({ min: acc.min, max: acc.max, count: acc.count });
    }
  }
  return results;
}

console.log('=' .repeat(80));
console.log('3D MODEL BOUNDING BOX ANALYSIS');
console.log('=' .repeat(80));
console.log('');

for (const file of MODEL_FILES) {
  const filePath = resolve(MODELS_DIR, file);
  try {
    const gltf = parseGLB(filePath);
    const accessors = getAccessorMinMax(gltf);
    
    // Find the overall bounding box from all POSITION accessors
    let globalMin = [Infinity, Infinity, Infinity];
    let globalMax = [-Infinity, -Infinity, -Infinity];
    
    for (const acc of accessors) {
      for (let i = 0; i < 3; i++) {
        globalMin[i] = Math.min(globalMin[i], acc.min[i]);
        globalMax[i] = Math.max(globalMax[i], acc.max[i]);
      }
    }
    
    const sizeX = globalMax[0] - globalMin[0];
    const sizeY = globalMax[1] - globalMin[1];
    const sizeZ = globalMax[2] - globalMin[2];
    
    console.log(`📦 ${file}`);
    console.log(`   Min:  [${globalMin.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`   Max:  [${globalMax.map(v => v.toFixed(3)).join(', ')}]`);
    console.log(`   Size: W=${sizeX.toFixed(3)}  H=${sizeY.toFixed(3)}  D=${sizeZ.toFixed(3)}`);
    console.log(`   Center: [${((globalMin[0]+globalMax[0])/2).toFixed(3)}, ${((globalMin[1]+globalMax[1])/2).toFixed(3)}, ${((globalMin[2]+globalMax[2])/2).toFixed(3)}]`);
    
    // Check animations
    if (gltf.animations && gltf.animations.length > 0) {
      console.log(`   🎬 Animations: ${gltf.animations.map(a => a.name || 'unnamed').join(', ')}`);
    }
    
    console.log('');
  } catch (err) {
    console.log(`❌ ${file}: ${err.message}`);
    console.log('');
  }
}

// Now calculate ideal scales
console.log('=' .repeat(80));
console.log('SCALE RECOMMENDATIONS');
console.log('=' .repeat(80));
console.log('');
console.log('Target world dimensions:');
console.log('  Room: ~4m wide x 3m tall x 4m deep');
console.log('  Baby: ~0.7m tall (sitting) / ~0.9m tall (standing)');
console.log('  Table: ~0.6m tall');
console.log('  Toys: ~0.1-0.15m');
