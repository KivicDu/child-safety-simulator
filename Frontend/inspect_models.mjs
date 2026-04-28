// Quick GLB binary inspector - reads JSON chunk from GLB files
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const modelsDir = './public/models';
const files = readdirSync(modelsDir).filter(f => f.endsWith('.glb'));

for (const file of files) {
  const buf = readFileSync(join(modelsDir, file));
  
  // GLB header: magic(4) + version(4) + length(4) = 12 bytes
  // Chunk 0: chunkLength(4) + chunkType(4) + chunkData
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) { console.log(`${file}: Not a valid GLB`); continue; }
  
  const jsonChunkLen = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16);
  
  if (jsonChunkType !== 0x4E4F534A) { console.log(`${file}: No JSON chunk`); continue; }
  
  const jsonStr = buf.slice(20, 20 + jsonChunkLen).toString('utf8');
  const gltf = JSON.parse(jsonStr);
  
  // Extract mesh/node information
  const nodes = gltf.nodes || [];
  const meshes = gltf.meshes || [];
  const animations = gltf.animations || [];
  
  const nodeNames = nodes.map((n, i) => ({
    index: i,
    name: n.name || `node_${i}`,
    mesh: n.mesh !== undefined ? n.mesh : null,
    scale: n.scale || null,
    translation: n.translation || null,
    rotation: n.rotation || null,
    children: n.children || [],
  }));
  
  const meshNames = meshes.map((m, i) => ({
    index: i,
    name: m.name || `mesh_${i}`,
    primitiveCount: m.primitives?.length || 0,
  }));
  
  const animNames = animations.map(a => a.name);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Nodes: ${nodes.length}, Meshes: ${meshes.length}, Animations: ${animations.length}`);
  
  if (animNames.length > 0) {
    console.log(`  Animation clips: ${animNames.join(', ')}`);
  }
  
  // Show node tree with mesh associations
  console.log(`  Node names:`);
  nodeNames.forEach(n => {
    const hasMesh = n.mesh !== null ? ` [mesh: ${meshNames[n.mesh]?.name}]` : '';
    const hasScale = n.scale ? ` scale=[${n.scale.map(v=>v.toFixed(2)).join(',')}]` : '';
    const hasTrans = n.translation ? ` pos=[${n.translation.map(v=>v.toFixed(2)).join(',')}]` : '';
    console.log(`    ${n.name}${hasMesh}${hasScale}${hasTrans}`);
  });
  
  // Find accessors for position to compute approximate bounds
  if (gltf.accessors) {
    let globalMin = [Infinity, Infinity, Infinity];
    let globalMax = [-Infinity, -Infinity, -Infinity];
    
    for (const acc of gltf.accessors) {
      if (acc.type === 'VEC3' && acc.min && acc.max) {
        for (let i = 0; i < 3; i++) {
          globalMin[i] = Math.min(globalMin[i], acc.min[i]);
          globalMax[i] = Math.max(globalMax[i], acc.max[i]);
        }
      }
    }
    
    if (globalMin[0] !== Infinity) {
      const size = globalMax.map((v, i) => (v - globalMin[i]).toFixed(2));
      console.log(`  Approx raw bounds: min=[${globalMin.map(v=>v.toFixed(2)).join(',')}] max=[${globalMax.map(v=>v.toFixed(2)).join(',')}]`);
      console.log(`  Approx raw size: W=${size[0]} H=${size[1]} D=${size[2]}`);
    }
  }
}
