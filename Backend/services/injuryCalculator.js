/**
 * ============================================================================
 * INJURY CALCULATOR — Research-Based Biomechanics
 * ============================================================================
 *
 * Implements:
 * - HIC₁₅ (Head Injury Criterion) per NHTSA FMVSS 208 / Versace 1971
 * - Impact Force via Impulse-Momentum Theorem: F = mΔv/Δt
 * - Material-dependent collision durations from NIH playground studies
 * - Age-specific injury thresholds from IRCOBI scaled pediatric data
 *
 * Key formula:
 *   HIC₁₅ = (a_g)^2.5 × Δt
 *     where a_g = average deceleration in g's = (Δv / Δt) / 9.81
 *     and   Δt ≤ 0.015s (HIC₁₅ standard)
 *
 *   Impact Force F = m × Δv / Δt  (Impulse-Momentum Theorem)
 */

import { getAgeGroup, calculateAgeAdjustedInjury } from '../config/ageGroups.js';

// ============================================================================
// MATERIAL → COLLISION DURATION MAP
// Source: NIH PMC4802220, ResearchGate playground surface studies, ASME
// ============================================================================
const MATERIAL_COLLISION = {
  // Hard surfaces — very short impact, high force
  metal:     { duration: 0.004, hardness: 0.95, label: 'Metal' },
  glass:     { duration: 0.003, hardness: 0.98, label: 'Glass' },
  stone:     { duration: 0.004, hardness: 0.95, label: 'Stone/Concrete' },
  ceramic:   { duration: 0.004, hardness: 0.92, label: 'Ceramic' },
  concrete:  { duration: 0.004, hardness: 0.96, label: 'Concrete' },

  // Medium-hard surfaces
  wood:      { duration: 0.007, hardness: 0.80, label: 'Wood' },
  hardwood:  { duration: 0.006, hardness: 0.85, label: 'Hardwood' },
  plastic:   { duration: 0.010, hardness: 0.60, label: 'Plastic' },
  laminate:  { duration: 0.008, hardness: 0.70, label: 'Laminate' },

  // Soft-medium surfaces
  carpet:    { duration: 0.015, hardness: 0.30, label: 'Carpet' },
  rubber:    { duration: 0.020, hardness: 0.25, label: 'Rubber' },
  vinyl:     { duration: 0.012, hardness: 0.40, label: 'Vinyl' },
  linoleum:  { duration: 0.012, hardness: 0.40, label: 'Linoleum' },

  // Soft surfaces — long impact, low force
  fabric:    { duration: 0.060, hardness: 0.15, label: 'Fabric' },
  foam:      { duration: 0.040, hardness: 0.10, label: 'Foam' },
  cushion:   { duration: 0.060, hardness: 0.10, label: 'Cushion' },
  pillow:    { duration: 0.080, hardness: 0.05, label: 'Pillow' },
  mattress:  { duration: 0.070, hardness: 0.08, label: 'Mattress' },

  // Edge types — depends on sharpness
  sharp_edge:   { duration: 0.003, hardness: 0.95, label: 'Sharp Edge' },
  rounded_edge: { duration: 0.010, hardness: 0.60, label: 'Rounded Edge' },

  // Default fallback
  unknown:   { duration: 0.015, hardness: 0.50, label: 'Unknown' },
};

class InjuryCalculator {
  constructor() {
    this.GRAVITY = 9.81;

    this.RISK_TIERS = {
      safe:      { min: 0,  max: 20,  color: '#22c55e', label: 'Safe' },
      watch:     { min: 21, max: 45,  color: '#eab308', label: 'Watch' },
      warning:   { min: 46, max: 70,  color: '#f97316', label: 'Warning' },
      critical:  { min: 71, max: 90,  color: '#ef4444', label: 'Critical' },
      dangerous: { min: 91, max: 100, color: '#7f1d1d', label: 'Dangerous' }
    };

    // Weighted scoring components
    this.WEIGHTS = { hic: 0.40, impactForce: 0.30, sharpness: 0.15, fallHeight: 0.15 };

    // G-force tiers for quick classification
    this.G_FORCE_TIERS = {
      observe:        { min: 0,  max: 20,       label: 'Observe',        color: '#22c55e', icon: '👀', action: 'Monitor only — no injury expected' },
      soft_injury:    { min: 20, max: 50,        label: 'Soft Injury',    color: '#f97316', icon: '⚠️', action: 'Preventive measures needed — padding or relocation recommended' },
      serious_injury: { min: 50, max: Infinity,  label: 'Serious Injury', color: '#ef4444', icon: '🚨', action: 'MUST change environment — high risk of significant injury' }
    };
  }

  // ===========================================================================
  // MAIN: Calculate injury from a collision event
  // ===========================================================================
  calculateInjury(collisionEvent, ageGroupId, objectProperties = {}) {
    const ageGroup = getAgeGroup(ageGroupId);
    if (!ageGroup) throw new Error(`Unknown age group: ${ageGroupId}`);

    const velocity = collisionEvent.velocity || 0;
    const position = collisionEvent.position || [0, 0, 0];
    const mass = ageGroup.mass;
    
    // 🔥 NEW: Use precise body part from multipart collider if available
    const bodyPart = collisionEvent.bodyPart || this.determineBodyPart(position[1], ageGroup.height);

    // Determine collision duration from object material
    const surfaceType = objectProperties.surfaceType || objectProperties.materialType || 'unknown';
    const collisionDuration = this.getCollisionDuration(surfaceType, objectProperties);

    // ── Core calculations ──
    const isHeadImpact = bodyPart === 'head';
    const hicScore = this.calculateHIC15(velocity, collisionDuration, isHeadImpact);
    const impactForce = this.calculateImpactForce(mass, velocity, collisionDuration);
    const deceleration_g = velocity > 0.01 ? (velocity / collisionDuration) / this.GRAVITY : 0;
    const sharpnessScore = objectProperties.edgeSharpness || 0;
    const fallHeightScore = this.calculateFallHeightScore(position[1], ageGroup.height);

    // G-force from deceleration
    const gForce = deceleration_g;
    const gForceTier = this.getGForceTier(gForce);

    // ── Normalized scoring ──
    const normalizedHIC = this.normalizeHIC(hicScore, ageGroup);
    const normalizedForce = this.normalizeForce(impactForce, mass);

    const rawScore = (
      this.WEIGHTS.hic * normalizedHIC +
      this.WEIGHTS.impactForce * normalizedForce +
      this.WEIGHTS.sharpness * (sharpnessScore * 100) +
      this.WEIGHTS.fallHeight * (fallHeightScore * 100)
    );

    const ageAdjustedScore = calculateAgeAdjustedInjury(rawScore, ageGroupId, bodyPart);
    const finalScore = Math.max(0, Math.min(100, ageAdjustedScore));
    const riskTier = this.getRiskTier(finalScore);

    return {
      injuryScore: Math.round(finalScore),
      riskTier: riskTier.label,
      riskColor: riskTier.color,
      bodyPart,
      // Biomechanics detail
      gForce: Math.round(gForce * 10) / 10,
      gForceTier: gForceTier.label,
      gForceColor: gForceTier.color,
      gForceAction: gForceTier.action,
      gForceIcon: gForceTier.icon,
      impactForceN: Math.round(impactForce * 10) / 10,
      hic15: Math.round(hicScore * 100) / 100,
      collisionDurationMs: Math.round(collisionDuration * 1000 * 10) / 10,
      surfaceType,
      components: {
        hic: { raw: hicScore, normalized: normalizedHIC },
        impactForce: { raw: impactForce, normalized: normalizedForce },
        sharpness: { raw: sharpnessScore, normalized: sharpnessScore * 100 },
        fallHeight: { raw: fallHeightScore, normalized: fallHeightScore * 100 }
      },
      metadata: { velocity, mass, ageGroup: ageGroupId, timestamp: new Date().toISOString() }
    };
  }

  // ===========================================================================
  // HIC₁₅ — Head Injury Criterion (NHTSA FMVSS 208)
  // ===========================================================================
  // Formula: HIC₁₅ = (a_g)^2.5 × Δt
  //   a_g   = average deceleration in g's = (Δv / Δt) / 9.81
  //   Δt    ≤ 0.015s (15ms cap per HIC₁₅ standard)
  //
  // For head impact, the full HIC value is used.
  // For body impact, we apply a 0.3 reduction factor (body is more resilient).
  calculateHIC15(velocity, collisionDuration, isHeadImpact = false) {
    if (velocity < 0.01) return 0;

    // HIC₁₅: cap the time window at 15ms
    const dt = Math.min(collisionDuration, 0.015);
    const a_mps2 = velocity / dt;            // deceleration in m/s²
    const a_g = a_mps2 / this.GRAVITY;       // deceleration in g's
    const hic = Math.pow(a_g, 2.5) * dt;

    return isHeadImpact ? hic : hic * 0.3;
  }

  // ===========================================================================
  // IMPACT FORCE — Impulse-Momentum Theorem
  // ===========================================================================
  // Formula: F = m × Δv / Δt
  //   m  = child mass (kg)
  //   Δv = impact velocity (m/s)
  //   Δt = collision duration (s) — from material properties
  calculateImpactForce(mass, velocity, collisionDuration) {
    if (velocity < 0.01) return 0;
    return (mass * velocity) / collisionDuration;
  }

  // ===========================================================================
  // COLLISION DURATION from surface material
  // ===========================================================================
  getCollisionDuration(surfaceType, objectProperties = {}) {
    const key = (surfaceType || 'unknown').toLowerCase().replace(/\s+/g, '_');

    // Direct match
    if (MATERIAL_COLLISION[key]) {
      return MATERIAL_COLLISION[key].duration;
    }

    // Infer from edge sharpness
    if (objectProperties.edgeSharpness > 0.7) {
      return MATERIAL_COLLISION.sharp_edge.duration;
    }

    // Infer from subcategory name
    const sub = (objectProperties.subcategory || '').toLowerCase();
    if (sub.includes('pillow') || sub.includes('cushion')) return MATERIAL_COLLISION.pillow.duration;
    if (sub.includes('mattress') || sub.includes('bed')) return MATERIAL_COLLISION.mattress.duration;
    if (sub.includes('foam') || sub.includes('mat')) return MATERIAL_COLLISION.foam.duration;

    return MATERIAL_COLLISION.unknown.duration;
  }

  // ===========================================================================
  // BODY PART DETERMINATION
  // ===========================================================================
  determineBodyPart(collisionHeight, agentHeight) {
    const relativeHeight = collisionHeight / agentHeight;
    if (relativeHeight > 0.8) return 'head';
    if (relativeHeight > 0.4) return 'torso';
    return 'legs';
  }

  // ===========================================================================
  // FALL HEIGHT SCORE
  // ===========================================================================
  calculateFallHeightScore(collisionHeight, agentHeight) {
    const centerOfMass = agentHeight * 0.55;
    const fallHeight = Math.max(0, collisionHeight - centerOfMass);
    return Math.min(1.0, fallHeight / 2.0);
  }

  // ===========================================================================
  // NORMALIZATION for composite scoring
  // ===========================================================================
  normalizeHIC(hic, ageGroup) {
    const t = ageGroup.hicThreshold;
    if (hic < t.safe) return 0;
    if (hic < t.warning) return 30 * (hic - t.safe) / (t.warning - t.safe);
    if (hic < t.critical) return 30 + 40 * (hic - t.warning) / (t.critical - t.warning);
    if (hic < t.dangerous) return 70 + 30 * (hic - t.critical) / (t.dangerous - t.critical);
    return 100;
  }

  normalizeForce(force, mass) {
    // Force threshold based on body weight: 50x body weight is ~dangerous
    const threshold = mass * 50 * this.GRAVITY; // N
    if (force < threshold * 0.1) return 0;
    if (force < threshold * 0.3) return 20 * (force / (threshold * 0.3));
    if (force < threshold) return 20 + 50 * ((force - threshold * 0.3) / (threshold * 0.7));
    if (force < threshold * 2) return 70 + 30 * ((force - threshold) / threshold);
    return 100;
  }

  // ===========================================================================
  // TIER CLASSIFICATION
  // ===========================================================================
  getRiskTier(score) {
    for (const tier of Object.values(this.RISK_TIERS)) {
      if (score >= tier.min && score <= tier.max) return tier;
    }
    return this.RISK_TIERS.dangerous;
  }

  getGForceTier(gForce) {
    if (gForce < 20) return this.G_FORCE_TIERS.observe;
    if (gForce < 50) return this.G_FORCE_TIERS.soft_injury;
    return this.G_FORCE_TIERS.serious_injury;
  }

  // ===========================================================================
  // BATCH + SUMMARY
  // ===========================================================================
  calculateBatchInjuries(collisionEvents, ageGroupId, objectsMap) {
    return collisionEvents.map(event => {
      const objectProps = objectsMap[event.objectId]?.classification?.properties || {};
      // Pass surface/material info from classification
      const classification = objectsMap[event.objectId]?.classification || {};
      const enrichedProps = {
        ...objectProps,
        surfaceType: classification.surfaceType || objectProps.surfaceType || 'unknown',
        subcategory: classification.subcategory || '',
      };
      try {
        return { ...event, injury: this.calculateInjury(event, ageGroupId, enrichedProps) };
      } catch (error) {
        return { ...event, injury: { injuryScore: 0, riskTier: 'Safe', error: error.message } };
      }
    });
  }

  getInjurySummary(injuryAssessments) {
    const tierCounts = { safe: 0, watch: 0, warning: 0, critical: 0, dangerous: 0 };
    const bodyPartCounts = { head: 0, torso: 0, legs: 0 };
    let totalScore = 0, maxScore = 0;
    let totalHIC = 0, maxHIC = 0;
    let totalForce = 0, maxForce = 0;

    injuryAssessments.forEach(assessment => {
      const injury = assessment.injury;
      if (!injury) return;
      const tier = injury.riskTier.toLowerCase();
      if (tierCounts.hasOwnProperty(tier)) tierCounts[tier]++;
      if (bodyPartCounts.hasOwnProperty(injury.bodyPart)) bodyPartCounts[injury.bodyPart]++;
      totalScore += injury.injuryScore;
      maxScore = Math.max(maxScore, injury.injuryScore);
      if (injury.hic15 !== undefined) {
        totalHIC += injury.hic15;
        maxHIC = Math.max(maxHIC, injury.hic15);
      }
      if (injury.impactForceN !== undefined) {
        totalForce += injury.impactForceN;
        maxForce = Math.max(maxForce, injury.impactForceN);
      }
    });

    const count = injuryAssessments.length;
    return {
      totalEvents: count,
      averageScore: count > 0 ? Math.round(totalScore / count) : 0,
      maxScore,
      tierDistribution: tierCounts,
      bodyPartDistribution: bodyPartCounts,
      criticalCount: tierCounts.critical + tierCounts.dangerous,
      hic15: { average: count > 0 ? Math.round(totalHIC / count * 100) / 100 : 0, max: Math.round(maxHIC * 100) / 100 },
      impactForce: { averageN: count > 0 ? Math.round(totalForce / count) : 0, maxN: Math.round(maxForce) },
    };
  }

  // ===========================================================================
  // SAFETY RECOMMENDATIONS
  // ===========================================================================
  generateSafetyRecommendations(objectName, gForceTier, bodyPart, injuryScore) {
    const recommendations = [];
    const searchBase = 'https://www.amazon.com/s?k=';
    const objLower = (objectName || '').toLowerCase();

    if (gForceTier === 'Soft Injury' || gForceTier === 'Serious Injury') {
      if (bodyPart === 'head') {
        recommendations.push({
          product: 'Corner & Edge Guards',
          reason: 'Protect against head impacts on sharp edges',
          searchUrl: `${searchBase}${encodeURIComponent('baby corner protector edge guard ' + objLower)}`,
          priority: 'high'
        });
        recommendations.push({
          product: 'Baby Safety Helmet',
          reason: 'Head protection for active toddlers',
          searchUrl: `${searchBase}${encodeURIComponent('baby safety helmet toddler head protection')}`,
          priority: 'medium'
        });
      }

      if (objLower.includes('table') || objLower.includes('desk') || objLower.includes('counter')) {
        recommendations.push({
          product: 'Table Edge Bumper Strip',
          reason: 'Cushion hard table edges to reduce impact force',
          searchUrl: `${searchBase}${encodeURIComponent('table edge bumper strip child safety')}`,
          priority: 'high'
        });
      }

      if (objLower.includes('shelf') || objLower.includes('bookcase') || objLower.includes('cabinet')) {
        recommendations.push({
          product: 'Furniture Anti-Tip Straps',
          reason: 'Prevent furniture from tipping over onto children',
          searchUrl: `${searchBase}${encodeURIComponent('furniture anti-tip strap wall anchor child safety')}`,
          priority: 'high'
        });
        recommendations.push({
          product: 'Cabinet Safety Locks',
          reason: 'Prevent children from opening and climbing',
          searchUrl: `${searchBase}${encodeURIComponent('baby proof cabinet locks child safety')}`,
          priority: 'medium'
        });
      }

      if (objLower.includes('stair') || objLower.includes('step')) {
        recommendations.push({
          product: 'Safety Gate',
          reason: 'Block access to stairs and dangerous areas',
          searchUrl: `${searchBase}${encodeURIComponent('baby safety gate stairs child proof')}`,
          priority: 'high'
        });
      }

      if (objLower.includes('window')) {
        recommendations.push({
          product: 'Window Guards / Locks',
          reason: 'Prevent children from opening windows',
          searchUrl: `${searchBase}${encodeURIComponent('child safety window guard locks baby proof')}`,
          priority: 'high'
        });
      }

      if (objLower.includes('door')) {
        recommendations.push({
          product: 'Door Finger Pinch Guards',
          reason: 'Prevent finger injuries in door hinges',
          searchUrl: `${searchBase}${encodeURIComponent('door finger pinch guard child safety')}`,
          priority: 'medium'
        });
      }
    }

    if (gForceTier === 'Serious Injury') {
      recommendations.push({
        product: 'Foam Floor Play Mat',
        reason: 'Cushion floor to reduce fall impact severity',
        searchUrl: `${searchBase}${encodeURIComponent('baby foam floor mat interlocking play tiles')}`,
        priority: 'high'
      });
      recommendations.push({
        product: 'Non-Slip Rug Pad',
        reason: 'Prevent slipping that causes falls',
        searchUrl: `${searchBase}${encodeURIComponent('non-slip rug pad child safety anti-slip')}`,
        priority: 'medium'
      });
    }

    if (recommendations.length === 0 && injuryScore > 20) {
      recommendations.push({
        product: 'Baby Proofing Kit',
        reason: 'Comprehensive safety kit for home hazards',
        searchUrl: `${searchBase}${encodeURIComponent('baby proofing kit child safety home set')}`,
        priority: 'medium'
      });
    }

    return recommendations;
  }
}

/**
 * Calculates the Room Safety Index (RSI) - a 0-100 score for the environment
 * @param {Array} events - List of all collision events in the simulation
 * @returns {Object} { score: number, grade: string, breakdown: object }
 */
export function calculateRoomSafetyIndex(events) {
  let score = 100;
  const breakdown = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0
  };

  events.forEach(evt => {
    if (!evt.injury) return;
    const tier = evt.injury.riskTier ? evt.injury.riskTier.toLowerCase() : 'safe';
    
    if (tier === 'critical' || tier === 'dangerous') {
      score -= 15;
      breakdown.critical++;
    } else if (tier === 'warning') {
      score -= 5;
      breakdown.serious++;
    } else if (tier === 'watch') {
      score -= 2;
      breakdown.moderate++;
    } else if (tier === 'safe' && evt.injury.injuryScore > 10) {
      score -= 0.5;
      breakdown.minor++;
    }
  });

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade = 'F';
  if (score >= 95) grade = 'S';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';

  return { score, grade, breakdown };
}

// Export the material collision map for use by other modules
export { MATERIAL_COLLISION };
// The original default export was an instance of InjuryCalculator.
// To align with the requested default export structure, we need to
// create an instance and then export its methods and properties.
const calculatorInstance = new InjuryCalculator();

export default {
  calculateInjury: calculatorInstance.calculateInjury.bind(calculatorInstance),
  calculateBatchInjuries: calculatorInstance.calculateBatchInjuries.bind(calculatorInstance),
  getInjurySummary: calculatorInstance.getInjurySummary.bind(calculatorInstance),
  generateSafetyRecommendations: calculatorInstance.generateSafetyRecommendations.bind(calculatorInstance),
  calculateRoomSafetyIndex,
  
  // Expose helpers if needed by validatons
  calculateHIC15: calculatorInstance.calculateHIC15.bind(calculatorInstance),
  getCollisionDuration: calculatorInstance.getCollisionDuration.bind(calculatorInstance),

  RISK_TIERS: calculatorInstance.RISK_TIERS,
  MATERIAL_COLLISION
};