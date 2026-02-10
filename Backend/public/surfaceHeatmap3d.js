import * as THREE from 'three';

class SurfaceHeatmap3D {
  constructor(scene, sceneData) {
    this.scene = scene;
    this.sceneData = sceneData;
    this.heatmapData = new Map();
    
    // Configuration
    this.config = {
      maxInfluenceDistance: 2.0,  // meters
      falloffSigma: 0.5,          // Gaussian falloff
      colorScheme: 'RISK',        // RISK or GRADIENT
      minHeatThreshold: 0.05,     // Ignore weak heat
      useSpatialIndex: true       // Performance optimization
    };
  }

  /**
   * ============================================================================
   * MAIN API: Apply heatmap to all meshes in scene
   * ============================================================================
   */

  applyHeatmapToMeshes(collisionEvents) {
    console.log(`🔥 Applying 3D surface heatmap to scene`);
    console.log(`   Collision events: ${collisionEvents.length}`);

    if (!collisionEvents || collisionEvents.length === 0) {
      console.warn('⚠️  No collision events to visualize');
      return;
    }

    const startTime = Date.now();

    // Build spatial index for fast lookup
    const collisionIndex = this.config.useSpatialIndex
      ? this.buildCollisionSpatialIndex(collisionEvents)
      : { findNearby: (point, radius) => collisionEvents };

    let meshCount = 0;
    let vertexCount = 0;

    // Process each mesh in scene
    this.scene.traverse((object) => {
      if (object.isMesh && object.geometry && object.visible) {
        const vertices = this.paintMeshWithHeatmap(object, collisionIndex);
        if (vertices > 0) {
          meshCount++;
          vertexCount += vertices;
        }
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Heatmap applied in ${elapsed}s`);
    console.log(`   Meshes processed: ${meshCount}`);
    console.log(`   Vertices colored: ${vertexCount.toLocaleString()}`);
  }

  /**
   * ============================================================================
   * CORE: Paint individual mesh with heatmap colors
   * ============================================================================
   */

  paintMeshWithHeatmap(mesh, collisionIndex) {
    const geometry = mesh.geometry;
    
    // Validate geometry
    if (!geometry.attributes.position) {
      return 0;
    }

    const positions = geometry.attributes.position;
    const vertexCount = positions.count;

    // Create vertex colors array
    const colors = new Float32Array(vertexCount * 3);
    
    // Update world matrix
    mesh.updateMatrixWorld(true);

    let heatedVertices = 0;

    // Process each vertex
    for (let i = 0; i < vertexCount; i++) {
      // Get vertex position in local space
      const localPos = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );

      // Transform to world space
      const worldPos = localPos.applyMatrix4(mesh.matrixWorld);

      // Calculate heat value at this vertex
      const heatValue = this.calculateHeatAtPoint(worldPos, collisionIndex);

      // Convert heat to RGB color
      let color;
      if (heatValue < this.config.minHeatThreshold) {
        // No heat - use default color (white)
        color = { r: 1.0, g: 1.0, b: 1.0 };
      } else {
        color = this.heatToColor(heatValue);
        heatedVertices++;
      }

      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    // Only apply if we found some heat
    if (heatedVertices > 0) {
      // Add color attribute to geometry
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      // Update material to use vertex colors
      this.enableVertexColors(mesh);
      
      // Store metadata
      this.heatmapData.set(mesh, {
        vertexCount,
        heatedVertices,
        timestamp: Date.now()
      });

      return vertexCount;
    }

    return 0;
  }

  /**
   * ============================================================================
   * HEAT CALCULATION: Calculate heat value at a specific 3D point
   * ============================================================================
   */

  calculateHeatAtPoint(point, collisionIndex) {
    let totalHeat = 0;
    const maxInfluence = this.config.maxInfluenceDistance;

    // Find nearby collisions using spatial index
    const nearbyCollisions = collisionIndex.findNearby(point, maxInfluence);

    for (const collision of nearbyCollisions) {
      const distance = point.distanceTo(collision.position);
      
      if (distance < maxInfluence) {
        // Gaussian falloff: exp(-(d^2) / (2*sigma^2))
        const sigma = this.config.falloffSigma;
        const influence = Math.exp(-(distance * distance) / (2 * sigma * sigma));
        
        // Normalized injury score (0-1)
        const heat = (collision.injuryScore || 0) / 100;
        
        totalHeat += heat * influence;
      }
    }

    return Math.min(totalHeat, 1.0);
  }

  /**
   * ============================================================================
   * COLOR MAPPING: Convert heat value to RGB color
   * ============================================================================
   */

  heatToColor(heat) {
    if (this.config.colorScheme === 'RISK') {
      return this.getRiskColor(heat);
    } else {
      return this.getGradientColor(heat);
    }
  }

  /**
   * 3-tier risk color system
   */
  getRiskColor(heat) {
    if (heat < 0.3) {
      // 🟢 LOW RISK: Green
      return { r: 0.298, g: 0.686, b: 0.314 };
    } else if (heat < 0.7) {
      // 🟡 WARNING: Orange
      return { r: 1.0, g: 0.596, b: 0.0 };
    } else {
      // 🔴 CRITICAL: Red
      return { r: 0.957, g: 0.263, b: 0.212 };
    }
  }

  /**
   * Smooth gradient color (Green → Yellow → Red)
   */
  getGradientColor(heat) {
    if (heat < 0.5) {
      // Green → Yellow
      const t = heat / 0.5;
      return {
        r: 0.298 + t * (1.0 - 0.298),
        g: 0.686 + t * (0.596 - 0.686),
        b: 0.314 + t * (0.0 - 0.314)
      };
    } else {
      // Yellow → Red
      const t = (heat - 0.5) / 0.5;
      return {
        r: 1.0 + t * (0.957 - 1.0),
        g: 0.596 + t * (0.263 - 0.596),
        b: 0.0 + t * (0.212 - 0.0)
      };
    }
  }

  /**
   * ============================================================================
   * MATERIAL MANAGEMENT: Enable vertex colors on mesh material
   * ============================================================================
   */

  enableVertexColors(mesh) {
    const originalMaterial = mesh.material;

    // Check if already using vertex colors
    if (originalMaterial.vertexColors === true) {
      return;
    }

    // Create new material with vertex colors enabled
    const heatmapMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: originalMaterial.metalness !== undefined ? originalMaterial.metalness : 0.1,
      roughness: originalMaterial.roughness !== undefined ? originalMaterial.roughness : 0.8,
      side: originalMaterial.side || THREE.FrontSide,
      transparent: false,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0
    });

    // Copy texture if exists
    if (originalMaterial.map) {
      heatmapMaterial.map = originalMaterial.map;
    }

    // Store original material for restoration
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = originalMaterial;
    }

    mesh.material = heatmapMaterial;
  }

  /**
   * ============================================================================
   * SPATIAL INDEX: Fast collision lookup using 3D grid
   * ============================================================================
   */

  buildCollisionSpatialIndex(collisionEvents) {
    const grid = new Map();
    const cellSize = this.config.maxInfluenceDistance; // 1 cell = max influence

    console.log(`   🌳 Building spatial index (cell size: ${cellSize}m)...`);

    for (const event of collisionEvents) {
      if (!event.position || event.position.length !== 3) {
        continue;
      }

      const pos = new THREE.Vector3(...event.position);
      
      // Grid cell coordinates
      const cellX = Math.floor(pos.x / cellSize);
      const cellY = Math.floor(pos.y / cellSize);
      const cellZ = Math.floor(pos.z / cellSize);
      const cellKey = `${cellX},${cellY},${cellZ}`;

      if (!grid.has(cellKey)) {
        grid.set(cellKey, []);
      }

      grid.get(cellKey).push({
        position: pos,
        injuryScore: event.injury?.injuryScore || 0,
        original: event
      });
    }

    console.log(`   ✅ Spatial index built: ${grid.size} cells`);

    return {
      grid,
      cellSize,
      
      findNearby(point, radius) {
        const results = [];
        const cellRadius = Math.ceil(radius / cellSize);
        
        const baseCellX = Math.floor(point.x / cellSize);
        const baseCellY = Math.floor(point.y / cellSize);
        const baseCellZ = Math.floor(point.z / cellSize);

        // Search neighboring cells
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
          for (let dy = -cellRadius; dy <= cellRadius; dy++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
              const cellKey = `${baseCellX + dx},${baseCellY + dy},${baseCellZ + dz}`;
              const cellCollisions = grid.get(cellKey);
              
              if (cellCollisions) {
                results.push(...cellCollisions);
              }
            }
          }
        }

        return results;
      }
    };
  }

  /**
   * ============================================================================
   * CLEANUP: Clear heatmap from all meshes
   * ============================================================================
   */

  clearHeatmap() {
    console.log('🧹 Clearing 3D heatmap...');

    let clearedCount = 0;

    this.scene.traverse((object) => {
      if (object.isMesh && object.userData.originalMaterial) {
        // Restore original material
        object.material = object.userData.originalMaterial;
        delete object.userData.originalMaterial;
        
        // Remove color attribute
        if (object.geometry.attributes.color) {
          object.geometry.deleteAttribute('color');
        }

        clearedCount++;
      }
    });

    this.heatmapData.clear();
    
    console.log(`✅ Heatmap cleared from ${clearedCount} meshes`);
  }

  /**
   * ============================================================================
   * CONFIGURATION: Update heatmap settings
   * ============================================================================
   */

  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️  Heatmap config updated:', this.config);
  }

  /**
   * ============================================================================
   * STATISTICS: Get heatmap information
   * ============================================================================
   */

  getStats() {
    const totalVertices = Array.from(this.heatmapData.values())
      .reduce((sum, data) => sum + data.vertexCount, 0);
    
    const totalHeatedVertices = Array.from(this.heatmapData.values())
      .reduce((sum, data) => sum + data.heatedVertices, 0);

    return {
      meshCount: this.heatmapData.size,
      totalVertices,
      heatedVertices: totalHeatedVertices,
      heatCoverage: totalVertices > 0 ? (totalHeatedVertices / totalVertices * 100).toFixed(1) + '%' : '0%',
      config: this.config
    };
  }
}

export default SurfaceHeatmap3D;