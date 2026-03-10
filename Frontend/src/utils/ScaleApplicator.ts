import * as THREE from 'three';

/**
 * Scale Applicator (Frontend Dumb Normalizer)
 * 
 * Works in tandem with the Backend Single Source of Truth architecture.
 * This class DOES NOT guess or calculate scale. It acts as an applicator
 * that reads exactly what the backend has requested via `.meta` metadata
 * and bakes that scale directly into the vertices so that Three.js 
 * rendering matches Rapier physics perfectly (1 unit = 1 meter).
 */
export class ScaleApplicator {
    
  /**
   * Correctly update and compute Box3 for animated or hierarchical meshes (including SkinnedMesh)
   * @param object The root object to compute bounds for
   * @returns THREE.Box3 enclosing all children
   */
  public static computeAccurateBoundingBox(object: THREE.Object3D): THREE.Box3 {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3();
    
    object.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh) {
            child.geometry.computeBoundingBox();
            if (child.geometry.boundingBox) {
                const childBox = child.geometry.boundingBox.clone();
                childBox.applyMatrix4(child.matrixWorld);
                box.union(childBox);
            }
        }
    });

    box.union(new THREE.Box3().setFromObject(object));
    return box;
  }

  /**
   * Applies the backend's absolute scale factor to the loaded Three.js scene.
   * 
   * @param scene The loaded Three.js Object3D / Scene
   * @param modelUrl The URL to the GLB/GLTF model so we can fetch the .meta
   * @param fallbackScale Optional scalar from legacy sceneData API
   * @returns The exact absolute scale applied
   */
  public static async applyMetadataScale(scene: THREE.Object3D, modelUrl: string, fallbackScale?: number): Promise<number> {
    console.log(`[ScaleApplicator] Checking Backend Authority for scale...`);

    let absoluteScale = fallbackScale || 1.0;
    const metaUrl = `${modelUrl}.meta`;

    try {
      // Phase 1: Try reading the Single Source of Truth .meta generated on upload
      const response = await fetch(metaUrl);
      if (response.ok) {
        const metadata = await response.json();
        if (metadata && metadata.scaleFactor) {
          absoluteScale = metadata.scaleFactor;
          console.log(`[ScaleApplicator] 📥 Fetched Backend Authority .meta! Applying absolute scalar = ${absoluteScale.toFixed(4)} (Detected via: ${metadata.detectedBy})`);
        }
      } else {
        console.warn(`[ScaleApplicator] ⚠️ No .meta found at ${metaUrl} (Status ${response.status}). Using fallback scale: ${absoluteScale.toFixed(4)}`);
      }
    } catch (error) {
       console.warn(`[ScaleApplicator] ⚠️ Network error fetching .meta. Using fallback scale: ${absoluteScale.toFixed(4)}`, error);
    }

    // Phase 2: Bake the scale directly into the vertices (Required for Rapier Matrix stability)
    if (absoluteScale !== 1.0) {
      this.applyRealScale(scene, absoluteScale);
      console.log(`[ScaleApplicator] ✅ Successfully baked physical dimensions into geometry.`);
    } else {
      console.log(`[ScaleApplicator] 📐 Scale is exactly 1.0. No geometry baking needed.`);
    }

    // Phase 3: Physics Sanity Checks
    this.warnPhysicsLimits(scene);

    return absoluteScale;
  }

  /**
   * Safe vertex baking and translation
   * Scales geometry and relative position without skewing `scene.scale` 
   * preserving (1,1,1) transform matrix arrays for Physics Colliders.
   */
  private static applyRealScale(node: THREE.Object3D, scaleFactor: number): void {
      if (scaleFactor === 1.0) return;

      node.traverse((child) => {
          if (child instanceof THREE.Mesh) {
              if (child.geometry) {
                  child.geometry.scale(scaleFactor, scaleFactor, scaleFactor);
                  child.geometry.computeBoundingBox();
                  child.geometry.computeBoundingSphere();
              }
          }
          if (child !== node) {
              child.position.multiplyScalar(scaleFactor);
          }
      });
  }

  /**
   * Runs exactly once at the end to double-check that the absolute backend scale 
   * hasn't resulted in numbers that will cause Rapier to explode.
   */
  private static warnPhysicsLimits(scene: THREE.Object3D) {
      const finalBox = ScaleApplicator.computeAccurateBoundingBox(scene);
      const h = finalBox.max.y - finalBox.min.y;
      const w = finalBox.max.x - finalBox.min.x;
      const d = finalBox.max.z - finalBox.min.z;
      
      const maxDim = Math.max(h, w, d);

      if (maxDim > 100) {
          console.warn(`[ScaleApplicator] 🚨 PHYSICS SAFETY WARNING: Normalized scene is massive (>100m). Rapier floats may decay! Max = ${maxDim.toFixed(1)}m`);
      }
      if (maxDim > 0 && maxDim < 0.01) {
          console.warn(`[ScaleApplicator] 🚨 PHYSICS SAFETY WARNING: Normalized scene is microscopic (<0.01m). RigidBodies may explode! Max = ${maxDim.toFixed(3)}m`);
      }
  }

}
