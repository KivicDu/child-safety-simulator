import * as THREE from 'three';
import { ScaleApplicator } from './ScaleApplicator';

export class CharacterScaleValidator {
  /**
   * Evaluates if the scene scale makes physical sense relative to the child agent.
   * Logs warnings if the character would appear microscopic or gigantic.
   * 
   * @param scene The normalized Three.js root scene/model
   * @param agentHeight The target height of the character in meters (e.g., 1.10 for a 5yo)
   */
  static validate(scene: THREE.Object3D, agentHeight: number) {
    console.log(`[CharacterScaleValidator] Validating scene scale for ${agentHeight.toFixed(2)}m agent.`);

    // Recompute exact global scene bounds using accurate method for animated meshes
    const sceneBox = ScaleApplicator.computeAccurateBoundingBox(scene);
    
    const sceneHeight = sceneBox.max.y - sceneBox.min.y;
    const sceneWidth = sceneBox.max.x - sceneBox.min.x;
    const sceneDepth = sceneBox.max.z - sceneBox.min.z;
    
    let isWarning = false;

    // RULE 1: Agent cannot be microscopic
    if (agentHeight < 0.2) {
      console.warn(`[CharacterScaleValidator] 🚨 WARNING: Agent height (${agentHeight}m) is suspiciously small. Has it been misconfigured?`);
      isWarning = true;
    }

    // RULE 2: Agent cannot be giants
    if (agentHeight > 2.0) {
      console.warn(`[CharacterScaleValidator] 🚨 WARNING: Agent height (${agentHeight}m) exceeds 2.0m. Child agents should be under 1.5m.`);
      isWarning = true;
    }

    // RULE 3: Agent vs Ceiling Ratio
    // If the room ceiling is very low, the character might bump their head constantly
    if (sceneHeight > 0) {
      if (agentHeight > sceneHeight * 0.6) {
        console.warn(`[CharacterScaleValidator] 🚨 WARNING: Agent height (${agentHeight}m) is more than 60% of the room ceiling (${sceneHeight.toFixed(2)}m). The room appears too small.`);
        isWarning = true;
      }
      
      // If the room ceiling is massive (e.g. > 20 meters), the agent will look like an ant
      if (sceneHeight > 20.0) {
        // Not strictly an error for outdoor scenes, but highly unusual for bedrooms
        console.warn(`[CharacterScaleValidator] ⚠️ NOTE: The scene ceiling is very high (${sceneHeight.toFixed(2)}m). Ensure this is an outdoor or grand hall environment.`);
      }
    }

    // RULE 4: Floor space required
    const floorArea = sceneWidth * sceneDepth;
    // An agent needs at least a roughly 2x2 meter space to not spawn inside walls immediately.
    if (floorArea < 4.0 && floorArea > 0) {
      console.warn(`[CharacterScaleValidator] 🚨 WARNING: Floor area (${floorArea.toFixed(2)} sqm) is extremely tight for agent navigation. Expected > 4.0 sqm.`);
      isWarning = true;
    }

    if (!isWarning) {
      console.log(`[CharacterScaleValidator] ✅ Validation Passed: Scene (${sceneWidth.toFixed(1)}x${sceneHeight.toFixed(1)}x${sceneDepth.toFixed(1)}) holds a ${agentHeight.toFixed(2)}m agent comfortably.`);
    }
  }
}
