
import fs from 'fs/promises';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';

/* ── MATH HELPERS ───────────────────────────────────────────── */
const MathUtils = {
  multiplyMatrices: (a, b) => {
    const ae = a; const be = b; const te = new Array(16);

    const a11 = ae[ 0 ], a12 = ae[ 4 ], a13 = ae[ 8 ], a14 = ae[ 12 ];
    const a21 = ae[ 1 ], a22 = ae[ 5 ], a23 = ae[ 9 ], a24 = ae[ 13 ];
    const a31 = ae[ 2 ], a32 = ae[ 6 ], a33 = ae[ 10 ], a34 = ae[ 14 ];
    const a41 = ae[ 3 ], a42 = ae[ 7 ], a43 = ae[ 11 ], a44 = ae[ 15 ];

    const b11 = be[ 0 ], b12 = be[ 4 ], b13 = be[ 8 ], b14 = be[ 12 ];
    const b21 = be[ 1 ], b22 = be[ 5 ], b23 = be[ 9 ], b24 = be[ 13 ];
    const b31 = be[ 2 ], b32 = be[ 6 ], b33 = be[ 10 ], b34 = be[ 14 ];
    const b41 = be[ 3 ], b42 = be[ 7 ], b43 = be[ 11 ], b44 = be[ 15 ];

    te[ 0 ] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[ 4 ] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[ 8 ] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[ 12 ] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[ 1 ] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[ 5 ] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[ 9 ] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[ 13 ] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[ 2 ] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[ 6 ] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[ 10 ] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[ 14 ] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[ 3 ] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[ 7 ] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[ 11 ] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[ 15 ] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return te;
  },

  composeMatrix: (position, quaternion, scale) => {
    const te = new Array(16);
    const x = quaternion[0], y = quaternion[1], z = quaternion[2], w = quaternion[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const sx = scale[0], sy = scale[1], sz = scale[2];

    te[ 0 ] = ( 1 - ( yy + zz ) ) * sx;
    te[ 1 ] = ( xy + wz ) * sx;
    te[ 2 ] = ( xz - wy ) * sx;
    te[ 3 ] = 0;

    te[ 4 ] = ( xy - wz ) * sy;
    te[ 5 ] = ( 1 - ( xx + zz ) ) * sy;
    te[ 6 ] = ( yz + wx ) * sy;
    te[ 7 ] = 0;

    te[ 8 ] = ( xz + wy ) * sz;
    te[ 9 ] = ( yz - wx ) * sz;
    te[ 10 ] = ( 1 - ( xx + yy ) ) * sz;
    te[ 11 ] = 0;

    te[ 12 ] = position[0];
    te[ 13 ] = position[1];
    te[ 14 ] = position[2];
    te[ 15 ] = 1;

    return te;
  },

  identityMatrix: () => {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
  },

  applyMatrixToPoint: (matrix, point) => {
    const x = point[0], y = point[1], z = point[2];
    const e = matrix;
    const w = 1 / ( e[ 3 ] * x + e[ 7 ] * y + e[ 11 ] * z + e[ 15 ] );

    return [
      ( e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ] ) * w,
      ( e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ] ) * w,
      ( e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] ) * w
    ];
  },

  decomposeMatrix: (te) => {
    let sx = Math.hypot(te[0], te[1], te[2]);
    let sy = Math.hypot(te[4], te[5], te[6]);
    let sz = Math.hypot(te[8], te[9], te[10]);

    const det = te[0] * (te[5] * te[10] - te[6] * te[9]) -
                te[1] * (te[4] * te[10] - te[6] * te[8]) +
                te[2] * (te[4] * te[9] - te[5] * te[8]);
    if (det < 0) sx = -sx;

    const invSX = sx !== 0 ? 1 / sx : 0;
    const invSY = sy !== 0 ? 1 / sy : 0;
    const invSZ = sz !== 0 ? 1 / sz : 0;

    const m11 = te[0] * invSX, m12 = te[4] * invSY, m13 = te[8] * invSZ;
    const m21 = te[1] * invSX, m22 = te[5] * invSY, m23 = te[9] * invSZ;
    const m31 = te[2] * invSX, m32 = te[6] * invSY, m33 = te[10] * invSZ;

    const trace = m11 + m22 + m33;
    let x, y, z, w;

    if (trace > 0.0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      w = 0.25 / s;
      x = (m32 - m23) * s;
      y = (m13 - m31) * s;
      z = (m21 - m12) * s;
    } else if (m11 >= m22 && m11 >= m33) {
      const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
      w = (m32 - m23) / s;
      x = 0.25 * s;
      y = (m12 + m21) / s;
      z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
      w = (m13 - m31) / s;
      x = (m12 + m21) / s;
      y = 0.25 * s;
      z = (m23 + m32) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
      w = (m21 - m12) / s;
      x = (m13 + m31) / s;
      y = (m23 + m32) / s;
      z = 0.25 * s;
    }

    const len = Math.hypot(x, y, z, w);
    if (len > 0) {
      const invLen = 1 / len;
      x *= invLen; y *= invLen; z *= invLen; w *= invLen;
    } else {
      x = 0; y = 0; z = 0; w = 1;
    }

    return {
      translation: [te[12], te[13], te[14]],
      rotation: [x, y, z, w],
      scale: [sx, sy, sz]
    };
  }
};

class GLBParser {
  
  async parse(glbPath) {
    try {
      console.log(`🔍 Starting parse for: ${glbPath}`);
      const memUsage = process.memoryUsage();
      console.log(`💾 Memory: RSS=${(memUsage.rss/1024/1024).toFixed(2)}MB, Heap=${(memUsage.heapUsed/1024/1024).toFixed(2)}MB`);
      
      const io = new NodeIO();
      const document = await io.read(glbPath);
      
      const scene = document.getRoot().getDefaultScene();
      
      if (!scene) {
        throw new Error('No default scene found in GLB');
      }
      
      const sceneData = {
        id: path.basename(glbPath, '.glb'),
        fileName: path.basename(glbPath),
        boundingBox: null,
        objects: [],
        floor: null,
        metadata: {
          parseDate: new Date().toISOString()
        }
      };

      const objects = [];
      let globalMin = [Infinity, Infinity, Infinity];
      let globalMax = [-Infinity, -Infinity, -Infinity];

      // ✅ TRAVERSE RECURSIVELY WITH MATRIX MATH checks
      const traverseNode = (node, parentMatrix = MathUtils.identityMatrix(), currentObject = null) => {
        const mesh = node.getMesh();
        const nodeName = node.getName() || '';
        const isProxy = nodeName.startsWith('COL_');
        
        // 1. Get local transform matrix
        const t = node.getTranslation();
        const r = node.getRotation(); // quaternion [x,y,z,w]
        const s = node.getScale();
        const localMatrix = MathUtils.composeMatrix(t, r, s);
        
        // 2. Combine with parent matrix -> World Matrix
        const worldMatrix = MathUtils.multiplyMatrices(parentMatrix, localMatrix);
        
        let newCurrentObject = currentObject;

        if (mesh) {
          // 3. Get local AABB
          const localBbox = this.calculateBoundingBox(mesh);
          
          // 4. Transform AABB to World Space (using 8 corners) for global floor detection
          const worldBbox = this.transformBoundingBox(localBbox, worldMatrix);

          // 5. Extract properly aligned OBB
          const min = localBbox.min;
          const max = localBbox.max;
          
          // Local center offset from geometry origin
          const localCenter = [
            (min[0] + max[0]) / 2,
            (min[1] + max[1]) / 2,
            (min[2] + max[2]) / 2
          ];
          
          // Half-extents for physics shapes
          const halfExtents = [
            (max[0] - min[0]) / 2,
            (max[1] - min[1]) / 2,
            (max[2] - min[2]) / 2
          ];
          
          // Transform local center directly to world space
          const worldCenter = MathUtils.applyMatrixToPoint(worldMatrix, localCenter);
          
          // Decompose the world matrix to find real world rotation
          const decomposed = MathUtils.decomposeMatrix(worldMatrix);
          // When scale has a negative determinant, we'll compensate (already done in decomposeMatrix).
          
          const obbData = {
            center: worldCenter,
            extents: halfExtents,
            rotation: decomposed.rotation
          };

          // Update global bounds
          globalMin = [
            Math.min(globalMin[0], worldBbox.min[0]),
            Math.min(globalMin[1], worldBbox.min[1]),
            Math.min(globalMin[2], worldBbox.min[2])
          ];
          globalMax = [
            Math.max(globalMax[0], worldBbox.max[0]),
            Math.max(globalMax[1], worldBbox.max[1]),
            Math.max(globalMax[2], worldBbox.max[2])
          ];

          if (isProxy) {
            if (currentObject) {
              // Add this proxy to the current parent's proxy list
              currentObject.proxyColliders.push({
                name: nodeName,
                ...obbData
              });
              console.log(`  🔗 Found proxy collider: ${nodeName} on ${currentObject.name}`);
            } else {
              console.warn(`  ⚠️ Found proxy collider ${nodeName} but no parent object to attach to.`);
            }
          } else {
            // Normal object
            // Extract material properties from first primitive
            const primitives = mesh.listPrimitives();
            let materialData = null;
            
            if (primitives.length > 0) {
              const material = primitives[0].getMaterial();
              if (material) {
                const baseColor = material.getBaseColorFactor(); // [r, g, b, a]
                const metallic = material.getMetallicFactor();
                const roughness = material.getRoughnessFactor();
                materialData = {
                  name: material.getName(),
                  baseColor: baseColor, // [r,g,b,a]
                  metallic: metallic,
                  roughness: roughness,
                  emissive: material.getEmissiveFactor && material.getEmissiveFactor() // [r,g,b]
                };
              }
            }
            
            const newObject = {
              id: `obj_${objects.length}`,
              name: nodeName || `Object_${objects.length}`,
              // Backwards compatibility transforms for standard system
              transform: {
                position: [worldMatrix[12], worldMatrix[13], worldMatrix[14]],
              },
              boundingBox: worldBbox, // Kept for scaleNormalizer and legacy compatibility
              obb: obbData,           // New structured OBB!
              proxyColliders: [],     // Array of attached proxies
              primitiveCount: primitives.length,
              material: materialData
            };
            
            objects.push(newObject);
            newCurrentObject = newObject;
          }
        } // end if (mesh)

        // Traverse children
        const children = node.listChildren();
        for (const child of children) {
          traverseNode(child, worldMatrix, newCurrentObject);
        }
      };

      // Start traversal from scene root
      const rootNodes = scene.listChildren();
      console.log(`📊 Found ${rootNodes.length} root nodes in scene`);
      
      for (const node of rootNodes) {
        traverseNode(node);
      }

      console.log(`✅ Parsed ${objects.length} objects with meshes`);

      if (objects.length === 0) {
        console.warn('⚠️ No meshes found in GLB file!');
      }

      sceneData.boundingBox = {
        min: globalMin,
        max: globalMax,
        center: [
          (globalMin[0] + globalMax[0]) / 2,
          (globalMin[1] + globalMax[1]) / 2,
          (globalMin[2] + globalMax[2]) / 2
        ],
        size: [
          globalMax[0] - globalMin[0],
          globalMax[1] - globalMin[1],
          globalMax[2] - globalMin[2]
        ]
      };

      sceneData.objects = objects;
      sceneData.floor = this.detectFloor(objects, sceneData.boundingBox);

      if (sceneData.floor) {
        console.log(`🎯 Floor detected at height: ${sceneData.floor.height}`);
      }

      return sceneData;

    } catch (error) {
      console.error('❌ Parse error:', error);
      throw new Error(`Failed to parse GLB: ${error.message}`);
    }
  }

  calculateBoundingBox(mesh) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    const primitives = mesh.listPrimitives();
    
    for (const primitive of primitives) {
      const position = primitive.getAttribute('POSITION');
      if (!position) {
        console.warn('⚠️ Primitive missing POSITION attribute, skipping bbox calc for this primitive');
        continue;
      }

      const array = position.getArray();
      
      for (let i = 0; i < array.length; i += 3) {
        min[0] = Math.min(min[0], array[i]);
        min[1] = Math.min(min[1], array[i + 1]);
        min[2] = Math.min(min[2], array[i + 2]);
        
        max[0] = Math.max(max[0], array[i]);
        max[1] = Math.max(max[1], array[i + 1]);
        max[2] = Math.max(max[2], array[i + 2]);
      }
    }

    // Default to unit box if no geometry found (rare)
    if (min[0] === Infinity) return { min: [-0.5,-0.5,-0.5], max: [0.5,0.5,0.5] };

    return { min, max };
  }

  transformBoundingBox(bbox, matrix) {
    // 1. Create 8 corners
    const { min, max } = bbox;
    const corners = [
      [min[0], min[1], min[2]],
      [min[0], min[1], max[2]],
      [min[0], max[1], min[2]],
      [min[0], max[1], max[2]],
      [max[0], min[1], min[2]],
      [max[0], min[1], max[2]],
      [max[0], max[1], min[2]],
      [max[0], max[1], max[2]]
    ];

    // 2. Transform corners
    const transformedCorners = corners.map(p => MathUtils.applyMatrixToPoint(matrix, p));

    // 3. Find new min/max
    let newMin = [Infinity, Infinity, Infinity];
    let newMax = [-Infinity, -Infinity, -Infinity];

    transformedCorners.forEach(p => {
      newMin[0] = Math.min(newMin[0], p[0]);
      newMin[1] = Math.min(newMin[1], p[1]);
      newMin[2] = Math.min(newMin[2], p[2]);
      
      newMax[0] = Math.max(newMax[0], p[0]);
      newMax[1] = Math.max(newMax[1], p[1]);
      newMax[2] = Math.max(newMax[2], p[2]);
    });

    return { min: newMin, max: newMax };
  }

  detectFloor(objects, sceneBbox) {
    let floorCandidate = null;
    let bestScore = -Infinity;

    console.log(`🔍 Searching for floor among ${objects.length} objects...`);

    for (const obj of objects) {
      const bbox = obj.boundingBox;
      const yMin = bbox.min[1];
      const yMax = bbox.max[1];
      const height = yMax - yMin;
      const width = bbox.max[0] - bbox.min[0];
      const depth = bbox.max[2] - bbox.min[2];
      const area = width * depth;

      // 🏛️ Improved Logic:
      // 1. Must be large (area > 2.0 to ignore small rugs/items)
      // 2. Height constraint relaxed (allow up to 2.0m thick floors, or even more if very low)
      // 3. Score heavily favors LOWEST yMin.
      
      const isFlat = height < 0.5;
      const isLarge = area > 2.0;

      // Check if it's a potential floor component
      if (isLarge) {
        // Score calculation:
        // - Favor lowest yMin (primary factor)
        // - Favor larger area (secondary)
        // - Favor flatness (tie-breaker)
        let score = -yMin * 1000 + area;
        if (isFlat) score += 500; // Bonus for being a proper thin floor tile

        // Penalty for excessive height (unless it's the absolute base of the scene)
        if (height > 1.0) score -= height * 10;

        if (score > bestScore) {
          bestScore = score;
          floorCandidate = {
            objectId: obj.id,
            objectName: obj.name,
            height: yMax, // FIX: Use TOP surface (yMax) — this is where characters stand
            topHeight: yMax,
            area: area,
            width: width,
            depth: depth
          };
          
          console.log(`  📦 Candidate: ${obj.name} (area: ${area.toFixed(2)}, height: ${height.toFixed(3)}, yMin: ${yMin.toFixed(2)}, score: ${score.toFixed(2)})`)
        }
      }
    }

    if (!floorCandidate) {
      console.warn('⚠️ No suitable floor found! Using scene bounding box minimum');
      floorCandidate = {
        objectId: null,
        objectName: 'auto-detected',
        height: sceneBbox.min[1],
        topHeight: sceneBbox.min[1] + 0.1,
        area: (sceneBbox.max[0] - sceneBbox.min[0]) * (sceneBbox.max[2] - sceneBbox.min[2]),
        width: sceneBbox.max[0] - sceneBbox.min[0],
        depth: sceneBbox.max[2] - sceneBbox.min[2]
      };
    } else {
      console.log(`✅ Floor selected: ${floorCandidate.objectName} (height: ${floorCandidate.height.toFixed(2)})`);
    }

    return floorCandidate;
  }
}

const parser = new GLBParser();
export default parser;