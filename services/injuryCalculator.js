import { getAgeGroup, calculateAgeAdjustedInjury } from '../config/ageGroups.js';

class InjuryCalculator {
  constructor() {
    this.GRAVITY = 9.81;
    this.RISK_TIERS = {
      safe: { min: 0, max: 20, color: '#22c55e', label: 'Safe' },
      watch: { min: 21, max: 45, color: '#eab308', label: 'Watch' },
      warning: { min: 46, max: 70, color: '#f97316', label: 'Warning' },
      critical: { min: 71, max: 90, color: '#ef4444', label: 'Critical' },
      dangerous: { min: 91, max: 100, color: '#7f1d1d', label: 'Dangerous' }
    };
    this.WEIGHTS = { hic: 0.35, impactForce: 0.25, sharpness: 0.20, fallHeight: 0.20 };
  }

  calculateInjury(collisionEvent, ageGroupId, objectProperties = {}) {
    const ageGroup = getAgeGroup(ageGroupId);
    if (!ageGroup) throw new Error(`Unknown age group: ${ageGroupId}`);

    const velocity = collisionEvent.velocity || 0;
    const position = collisionEvent.position || [0, 0, 0];
    const mass = ageGroup.mass;
    const bodyPart = this.determineBodyPart(position[1], ageGroup.height);
    
    const hicScore = this.calculateHIC(velocity, mass, bodyPart === 'head');
    const impactForce = this.calculateImpactForce(mass, velocity);
    const sharpnessScore = objectProperties.edgeSharpness || 0;
    const fallHeightScore = this.calculateFallHeightScore(position[1], ageGroup.height);

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
      components: {
        hic: { raw: hicScore, normalized: normalizedHIC },
        impactForce: { raw: impactForce, normalized: normalizedForce },
        sharpness: { raw: sharpnessScore, normalized: sharpnessScore * 100 },
        fallHeight: { raw: fallHeightScore, normalized: fallHeightScore * 100 }
      },
      metadata: { velocity, mass, ageGroup: ageGroupId, timestamp: new Date().toISOString() }
    };
  }

  calculateHIC(velocity, mass, isHeadImpact = false) {
    if (velocity < 0.1) return 0;
    const collisionDuration = 0.015;
    const deceleration = velocity / collisionDuration;
    const a_normalized = deceleration / this.GRAVITY;
    const hic = collisionDuration * Math.pow(a_normalized, 2.5);
    return hic * 1000 * (isHeadImpact ? 1.5 : 1.0);
  }

  calculateImpactForce(mass, velocity) {
    if (velocity < 0.1) return 0;
    return (mass * velocity) / 0.015;
  }

  determineBodyPart(collisionHeight, agentHeight) {
    const relativeHeight = collisionHeight / agentHeight;
    if (relativeHeight > 0.8) return 'head';
    if (relativeHeight > 0.4) return 'torso';
    return 'legs';
  }

  calculateFallHeightScore(collisionHeight, agentHeight) {
    const centerOfMass = agentHeight * 0.55;
    const fallHeight = Math.max(0, collisionHeight - centerOfMass);
    return Math.min(1.0, fallHeight / 2.0);
  }

  normalizeHIC(hic, ageGroup) {
    const t = ageGroup.hicThreshold;
    if (hic < t.safe) return 0;
    if (hic < t.warning) return 30 * (hic - t.safe) / (t.warning - t.safe);
    if (hic < t.critical) return 30 + 40 * (hic - t.warning) / (t.critical - t.warning);
    if (hic < t.dangerous) return 70 + 30 * (hic - t.critical) / (t.dangerous - t.critical);
    return 100;
  }

  normalizeForce(force, mass) {
    const threshold = mass * 50;
    if (force < threshold * 0.3) return 0;
    if (force < threshold) return 50 * (force / threshold);
    if (force < threshold * 2) return 50 + 50 * ((force - threshold) / threshold);
    return 100;
  }

  getRiskTier(score) {
    for (const tier of Object.values(this.RISK_TIERS)) {
      if (score >= tier.min && score <= tier.max) return tier;
    }
    return this.RISK_TIERS.dangerous;
  }

  calculateBatchInjuries(collisionEvents, ageGroupId, objectsMap) {
    return collisionEvents.map(event => {
      const objectProps = objectsMap[event.objectId]?.classification?.properties || {};
      try {
        return { ...event, injury: this.calculateInjury(event, ageGroupId, objectProps) };
      } catch (error) {
        return { ...event, injury: { injuryScore: 0, riskTier: 'safe', error: error.message } };
      }
    });
  }

  getInjurySummary(injuryAssessments) {
    const tierCounts = { safe: 0, watch: 0, warning: 0, critical: 0, dangerous: 0 };
    const bodyPartCounts = { head: 0, torso: 0, legs: 0 };
    let totalScore = 0, maxScore = 0;

    injuryAssessments.forEach(assessment => {
      const injury = assessment.injury;
      if (!injury) return;
      const tier = injury.riskTier.toLowerCase();
      if (tierCounts.hasOwnProperty(tier)) tierCounts[tier]++;
      if (bodyPartCounts.hasOwnProperty(injury.bodyPart)) bodyPartCounts[injury.bodyPart]++;
      totalScore += injury.injuryScore;
      maxScore = Math.max(maxScore, injury.injuryScore);
    });

    const count = injuryAssessments.length;
    return {
      totalEvents: count,
      averageScore: count > 0 ? Math.round(totalScore / count) : 0,
      maxScore,
      tierDistribution: tierCounts,
      bodyPartDistribution: bodyPartCounts,
      criticalCount: tierCounts.critical + tierCounts.dangerous
    };
  }
}

export default new InjuryCalculator();