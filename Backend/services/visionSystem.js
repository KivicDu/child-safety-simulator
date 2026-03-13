/**
 * VisionSystem — FOV-based scanning with Visual Saliency Map
 * 
 * Provides age-specific visual perception for child agents:
 * - Eye position calculation based on posture (crawling vs standing)
 * - Field-of-View cone check (horizontal + vertical)
 * - Visual saliency scoring with 7 boost categories
 * 
 * Sources: AAP/AAO developmental ophthalmology, ARVO contrast studies,
 *          WHO growth standards for eye heights
 */

import { getAgeGroup } from '../config/ageGroups.js';

const DEG2RAD = Math.PI / 180;

// Visual saliency boost multipliers per age group
// Research: ARVO contrast sensitivity, AAO color development, APA curiosity studies
const SALIENCY_BOOSTS = {
  infant:   { highContrast: 3.0, primaryColor: 2.5, luminous: 3.0, reflective: 2.0, moving: 2.0, smallGraspable: 2.5, dangling: 2.0 },
  early_toddler:  { highContrast: 1.5, primaryColor: 2.0, luminous: 2.5, reflective: 2.0, moving: 2.5, smallGraspable: 1.5, dangling: 2.0 },
  late_toddler:  { highContrast: 1.2, primaryColor: 1.8, luminous: 2.2, reflective: 1.8, moving: 2.2, smallGraspable: 1.2, dangling: 1.5 },
  preschool:{ highContrast: 1.0, primaryColor: 1.5, luminous: 2.0, reflective: 1.5, moving: 2.0, smallGraspable: 1.0, dangling: 1.0 },
  child:   { highContrast: 1.0, primaryColor: 1.0, luminous: 1.5, reflective: 1.0, moving: 1.5, smallGraspable: 1.0, dangling: 1.0 },
};

class VisionSystem {
  getEyePosition(agent) {
    const ag = getAgeGroup(agent.ageGroupId);
    const pos = agent.getPosition();
    if (!ag?.vision) return [pos[0], pos[1] + 0.5, pos[2]];
    const isCrawling = !ag.canWalk ||
      (agent.currentBehavior?.action === 'crawl') ||
      (agent.state === 'MOVING' && agent.currentBehavior?.action === 'crawl');
    const eyeY = (isCrawling && ag.vision.eyeLevel.crawling)
      ? ag.vision.eyeLevel.crawling
      : ag.vision.eyeLevel.standing;
    return [pos[0], pos[1] + eyeY, pos[2]];
  }

  canSeeObject(agent, object) {
    const ag = getAgeGroup(agent.ageGroupId);
    const v = ag?.vision;
    if (!v) return { visible: true, score: 1.0 };
    const eyePos = this.getEyePosition(agent);
    const objCenter = this._getObjCenter(object);
    const dist = this._dist3D(eyePos, objCenter);
    if (dist > v.maxScanDistance) return { visible: false, score: 0 };
    const fovH = v.fovHorizontal * DEG2RAD;
    const fovV = v.fovVertical * DEG2RAD;
    const fwd = agent.velocity && (agent.velocity[0] !== 0 || agent.velocity[2] !== 0)
      ? agent.velocity
      : [Math.cos(agent.currentHeading || 0), 0, Math.sin(agent.currentHeading || 0)];
    if (!this._isInFOV(eyePos, fwd, objCenter, fovH, fovV)) {
      if (v.peripheralVision > 0) {
        const expandedFovH = fovH * (1 + v.peripheralVision * 0.5);
        if (this._isInFOV(eyePos, fwd, objCenter, expandedFovH, fovV)) {
          const score = this.computeSaliency(agent, object, dist) * v.peripheralVision * 0.3;
          return { visible: true, score };
        }
      }
      return { visible: false, score: 0 };
    }
    const score = this.computeSaliency(agent, object, dist);
    return { visible: true, score };
  }

  scanVisibleObjects(agent, objects) {
    if (!objects || !objects.length) return [];
    const results = [];
    const ag = getAgeGroup(agent.ageGroupId);
    const attentionThreshold = ag?.attentionProfile ? (1.0 - ag.attentionProfile.distractibility) : 0.2;
    
    for (const obj of objects) {
      const check = this.canSeeObject(agent, obj);
      if (check.visible && check.score > attentionThreshold) {
        results.push({ object: obj, score: check.score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  computeSaliency(agent, object, distance) {
    const ag = getAgeGroup(agent.ageGroupId);
    const v = ag?.vision;
    if (!v) return 1.0;
    
    // ── [Phase 3] Visual Attention System ──
    // 1. Proximity Weight
    let score = 1.0 - (distance / v.maxScanDistance);
    if (score <= 0) return 0;
    
    const boosts = SALIENCY_BOOSTS[ag.id] || SALIENCY_BOOSTS.child;
    
    // 2. Novelty Weight
    const isNovel = !agent.objectMemory.has(object.id);
    const attentionProfile = ag.attentionProfile || { noveltyBias: 0.5 };
    if (isNovel) {
      score += attentionProfile.noveltyBias * 2.0; 
    }
    
    // 3. Motion Weight (if Rapier rigid body provides velocity)
    if (object.rigidBody) {
       const vel = object.rigidBody.linvel();
       const spd = Math.hypot(vel.x, vel.z);
       if (spd > 0.1) score *= boosts.moving * (1 + spd);
    }
    
    // 4. Contrast / Luminous / Visual Properties
    const props = object.properties || {};
    const mat = props.material || {};
    const color = mat.baseColor || [0.5, 0.5, 0.5];
    const emissive = mat.emissive || [0, 0, 0];
    const metallic = mat.metallic || 0;
    
    const contrast = Math.abs(Math.max(...color) - Math.min(...color));
    if (contrast > 0.7) score *= boosts.highContrast;
    
    // [BUG-11 FIX] Old code only boosted red (color[0]) and blue (color[2]),
    // ignoring yellow/green primaries. Infant saliency is driven by HIGH CONTRAST
    // and LUMINANCE, not hue alone (AAP/ARVO). Fix: detect any saturated primary
    // by comparing max channel vs min channel (saturation proxy).
    const maxC = Math.max(...color);
    const minC = Math.min(...color);
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
    // Saturated (>0.5) AND bright (max>0.6) — catches red, yellow, green, blue primaries
    if (saturation > 0.5 && maxC > 0.6) {
      score *= boosts.primaryColor * v.colorSensitivity;
    }
    const emissiveStrength = Math.max(...emissive);
    if (emissiveStrength > 0.1) {
      score *= boosts.luminous * (1 + emissiveStrength);
    }
    if (metallic > 0.5) score *= boosts.reflective;
    const dims = this._getObjDimensions(object);
    if (dims && Math.max(...dims) < 0.04) score *= boosts.smallGraspable;
    const name = (object.name || object.id || '').toLowerCase();
    if (name.includes('cord') || name.includes('cable') || name.includes('string') || name.includes('wire')) {
      score *= boosts.dangling;
    }
    if (v.focusMode !== 'full') {
      const objH = this._getObjCenter(object)[1];
      const eyeH = this.getEyePosition(agent)[1];
      if (v.focusMode === 'floor' && objH > eyeH * 1.2) score *= 0.3;
      else if (v.focusMode === 'near' && objH > eyeH * 1.5) score *= 0.5;
    }
    return Math.min(score, 5.0);
  }

  _isInFOV(eyePos, forward, targetPos, fovH, fovV) {
    const dx = targetPos[0] - eyePos[0];
    const dy = targetPos[1] - eyePos[1];
    const dz = targetPos[2] - eyePos[2];
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    if (distXZ < 0.01) return true;
    const fwdLen = Math.sqrt(forward[0] * forward[0] + forward[2] * forward[2]);
    if (fwdLen < 0.001) return true;
    const fwdNx = forward[0] / fwdLen;
    const fwdNz = forward[2] / fwdLen;
    const tgtNx = dx / distXZ;
    const tgtNz = dz / distXZ;
    const dotH = fwdNx * tgtNx + fwdNz * tgtNz;
    const angleH = Math.acos(Math.max(-1, Math.min(1, dotH)));
    if (angleH > fovH / 2) return false;
    const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist3D < 0.01) return true;
    const angleV = Math.abs(Math.asin(dy / dist3D));
    if (angleV > fovV / 2) return false;
    return true;
  }

  _getObjCenter(object) {
    if (object.boundingBox) {
      const bb = object.boundingBox;
      return [(bb.min[0]+bb.max[0])/2, (bb.min[1]+bb.max[1])/2, (bb.min[2]+bb.max[2])/2];
    }
    if (object.position) return [...object.position];
    return [0, 0, 0];
  }

  _getObjDimensions(object) {
    if (!object.boundingBox) return null;
    const bb = object.boundingBox;
    return [bb.max[0]-bb.min[0], bb.max[1]-bb.min[1], bb.max[2]-bb.min[2]];
  }

  _dist3D(a, b) {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  }
}

const visionSystem = new VisionSystem();
export { visionSystem, VisionSystem };