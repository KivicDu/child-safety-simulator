import { readFileSync } from 'fs';
import { resolve } from 'path';

const filePath = resolve('public/models/room.glb');
const buf = readFileSync(filePath);

const jsonLen = buf.readUInt32LE(12);
const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
const gltf = JSON.parse(jsonStr);

console.log('--- MESHES IN ROOM.GLB ---');
gltf.meshes?.forEach((mesh, idx) => {
  console.log(`Mesh ${idx}: ${mesh.name}`);
  // Try to find its accessor to get bounding box
  if (mesh.primitives && mesh.primitives[0].attributes.POSITION !== undefined) {
    const accIdx = mesh.primitives[0].attributes.POSITION;
    const acc = gltf.accessors[accIdx];
    if (acc && acc.min && acc.max) {
      console.log(`   min: [${acc.min.map(v=>v.toFixed(2)).join(', ')}]`);
      console.log(`   max: [${acc.max.map(v=>v.toFixed(2)).join(', ')}]`);
    }
  }
});
