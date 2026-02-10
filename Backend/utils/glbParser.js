import fs from 'fs/promises';
import path from 'path';
import { NodeIO } from '@gltf-transform/core';

class GLBParser {
  
  async parse(glbPath) {
    try {
      console.log(`🔍 Starting parse for: ${glbPath}`);
      
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

      // ✅ TRAVERSE ĐỆ QUY TÌM TẤT CẢ MESH
      const traverseNode = (node, parentTransform = null) => {
        const mesh = node.getMesh();
        
        if (mesh) {
          const bbox = this.calculateBoundingBox(mesh);
          const transform = this.getNodeTransform(node);
          
          // Combine with parent transform if exists
          const worldTransform = parentTransform 
            ? this.combineTransforms(parentTransform, transform)
            : transform;
          
          const worldBbox = this.transformBoundingBox(bbox, worldTransform);
          
          objects.push({
            id: `obj_${objects.length}`,
            name: node.getName() || `Object_${objects.length}`,
            transform: worldTransform,
            boundingBox: worldBbox,
            primitiveCount: mesh.listPrimitives().length
          });

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
        }

        // Traverse children
        const children = node.listChildren();
        for (const child of children) {
          const currentTransform = this.getNodeTransform(node);
          const combinedTransform = parentTransform 
            ? this.combineTransforms(parentTransform, currentTransform)
            : currentTransform;
          traverseNode(child, combinedTransform);
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

  // Thêm hàm combine transforms
  combineTransforms(parent, child) {
    return {
      position: [
        parent.position[0] + child.position[0],
        parent.position[1] + child.position[1],
        parent.position[2] + child.position[2]
      ],
      rotation: child.rotation, // Simplified - should multiply quaternions
      scale: [
        parent.scale[0] * child.scale[0],
        parent.scale[1] * child.scale[1],
        parent.scale[2] * child.scale[2]
      ]
    };
  }

  calculateBoundingBox(mesh) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    const primitives = mesh.listPrimitives();
    
    for (const primitive of primitives) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;

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

    return { min, max };
  }

  getNodeTransform(node) {
    const translation = node.getTranslation();
    const rotation = node.getRotation();
    const scale = node.getScale();

    return {
      position: Array.from(translation),
      rotation: Array.from(rotation),
      scale: Array.from(scale)
    };
  }

  transformBoundingBox(bbox, transform) {
    const min = [
      bbox.min[0] * transform.scale[0] + transform.position[0],
      bbox.min[1] * transform.scale[1] + transform.position[1],
      bbox.min[2] * transform.scale[2] + transform.position[2]
    ];
    
    const max = [
      bbox.max[0] * transform.scale[0] + transform.position[0],
      bbox.max[1] * transform.scale[1] + transform.position[1],
      bbox.max[2] * transform.scale[2] + transform.position[2]
    ];

    return { min, max };
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

      // 🏛️ Tiêu chí tìm sàn:
      // 1. Phải mỏng (height < 0.5)
      // 2. Phải lớn (area > 1.0)
      // 3. Phải ở vị trí thấp nhất (yMin nhỏ nhất)
      // 4. Ưu tiên object có area lớn nhất nếu cùng yMin
      
      if (height < 0.5 && area > 1.0) {
        // Score: yMin thấp nhất (âm lớn = thấp) + area lớn nhất
        const score = -yMin * 100 + area;
        
        if (score > bestScore) {
          bestScore = score;
          floorCandidate = {
            objectId: obj.id,
            objectName: obj.name,
            height: yMin, // Sử dụng yMin (đáy của sàn)
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