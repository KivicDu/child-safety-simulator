/**
 * ============================================================================
 * INJURY CALCULATOR — Research-Based Biomechanics  (v2 — Pediatric Fixes)
 * ============================================================================
 * Original implements:
 * - HIC₁₅ (Head Injury Criterion) per NHTSA FMVSS 208 / Versace 1971
 * - Impact Force via Impulse-Momentum Theorem: F = mΔv/Δt
 * - Material-dependent collision durations from NIH playground studies
 * - Age-specific injury thresholds from IRCOBI scaled pediatric data
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

// shoulder g-thresholds between torso and arm (thinner bone, less bracing)
const PEDIATRIC_G_THRESHOLDS = {
  infant: {
    head:     { observe: 30,  serious: 60  },
    torso:    { observe: 20,  serious: 40  },
    shoulder: { observe: 18,  serious: 36  }, 
    legs:     { observe: 25,  serious: 50  },
    arm:      { observe: 20,  serious: 35  },
    wrist:    { observe: 18,  serious: 30  },
  },
  early_toddler: {
    head:     { observe: 35,  serious: 70  },
    torso:    { observe: 22,  serious: 45  },
    shoulder: { observe: 20,  serious: 40  },
    legs:     { observe: 28,  serious: 55  },
    arm:      { observe: 22,  serious: 40  },
    wrist:    { observe: 20,  serious: 35  },
  },
  late_toddler: {
    head:     { observe: 40,  serious: 80  },
    torso:    { observe: 25,  serious: 50  },
    shoulder: { observe: 23,  serious: 46  },
    legs:     { observe: 30,  serious: 60  },
    arm:      { observe: 25,  serious: 45  },
    wrist:    { observe: 22,  serious: 38  },
  },
  preschool: {
    head:     { observe: 50,  serious: 100 },
    torso:    { observe: 30,  serious: 55  },
    shoulder: { observe: 27,  serious: 52  },
    legs:     { observe: 35,  serious: 65  },
    arm:      { observe: 28,  serious: 50  },
    wrist:    { observe: 25,  serious: 42  },
  },
  child: {
    head:     { observe: 60,  serious: 120 },
    torso:    { observe: 35,  serious: 60  },
    shoulder: { observe: 32,  serious: 58  },
    legs:     { observe: 40,  serious: 70  },
    arm:      { observe: 30,  serious: 55  },
    wrist:    { observe: 28,  serious: 45  },
  },
};

// ============================================================================
//   infant clavicle: 80-120 N (birth fracture common)
//   toddler clavicle: ~200-350 N (falls from standing)
//   preschool:        ~500-700 N
const PEDIATRIC_FRACTURE_THRESHOLDS_N = {
  infant: {
    legs:     300,   // femur/tibia — very fragile
    arm:      150,   // radius/ulna
    wrist:    120,   // distal radius
    shoulder: 100,   // clavicle — most fragile long bone in infant
    torso:    500,   // ribs — thin but braced
    head:     600,   // skull — denser flat bone
  },
  early_toddler: {
    legs:     600,
    arm:      250,
    wrist:    200,
    shoulder: 200,   // clavicle
    torso:    800,
    head:     900,
  },
  late_toddler: {
    legs:     900,
    arm:      400,
    wrist:    320,
    shoulder: 320,
    torso:    1200,
    head:     1200,
  },
  preschool: {
    legs:     1400,
    arm:      600,
    wrist:    480,
    shoulder: 550,
    torso:    1800,
    head:     1600,
  },
  child: {
    legs:     2000,
    arm:      900,
    wrist:    720,
    shoulder: 800,
    torso:    2500,
    head:     2000,
  },
};

class InjuryCalculator {
  constructor() {
    this.GRAVITY = 9.81;

    this.RISK_TIERS = {
      safe:      { min: 0,  max: 20,  color: '#22c55e', label: 'Safe' },
      watch:     { min: 21, max: 45,  color: '#eab308', label: 'Watch' },
      warning:   { min: 46, max: 70,  color: '#f97316', label: 'Warning' },
      critical:  { min: 71, max: 90,  color: '#ef4444', label: 'Critical' },
      dangerous: { min: 91, max: 100, color: '#7f1d1d', label: 'Dangerous' },
    };

    // Weighted scoring components
    this.WEIGHTS = { hic: 0.40, impactForce: 0.30, sharpness: 0.15, fallHeight: 0.15 };

    // G-force tier labels (thresholds looked up per-age in getGForceTier)
    this.G_FORCE_TIERS = {
      observe:        { label: 'Observe',        color: '#22c55e', icon: '👀', action: 'Monitor only — no injury expected' },
      soft_injury:    { label: 'Soft Injury',    color: '#f97316', icon: '⚠️', action: 'Preventive measures needed — padding or relocation recommended' },
      serious_injury: { label: 'Serious Injury', color: '#ef4444', icon: '🚨', action: 'MUST change environment — high risk of significant injury' },
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
    const mass     = ageGroup.mass;

    // agentFeetY is passed from simulationController via collisionEvent.agentFeetY.
    // Fall back to 0 for backward compatibility with older event records.
    const agentFeetY = collisionEvent.agentFeetY ?? 0;
    let bodyPart = collisionEvent.bodyPart ||
      this.determineBodyPart(position[1], ageGroup.height, agentFeetY);
    // FOOSH (Fall On OutStretched Hand) is the #1 injury mechanism for ages 1-5.
    // Triggered when: agent is falling + horizontal velocity exceeds 30% of vertical.
    const isFalling = collisionEvent.isFalling ?? false;
    const velVec    = collisionEvent.velocityVector || [0, -1, 0];
    if (isFalling && (bodyPart === 'arm' || bodyPart === 'legs' || bodyPart === 'torso')) {
      const horizSpeed = Math.sqrt((velVec[0] || 0) ** 2 + (velVec[2] || 0) ** 2);
      const vertSpeed  = Math.abs(velVec[1] || 0);
      const fooshAgeGroups = ['early_toddler', 'late_toddler', 'preschool'];
      if (fooshAgeGroups.includes(ageGroupId) && horizSpeed > vertSpeed * 0.30) {
        bodyPart = 'wrist';
      }
    }

    // Determine collision duration from object material
    const surfaceType       = objectProperties.surfaceType || objectProperties.materialType || 'unknown';
    const collisionDuration = this.getCollisionDuration(surfaceType, objectProperties);

    // ── Biometric Core calculations ──
    const isHeadImpact   = bodyPart === 'head';
    const hicScore       = this.calculateHIC15(velocity, collisionDuration, isHeadImpact);
    const impactForce    = this.calculateImpactForce(mass, velocity, collisionDuration);

    // Biometric Pressure (Force / Area)
    const surfaceAreaFactor = ageGroup.surfaceAreaFactor || 1.0;
    const impactPressure    = isHeadImpact ? (impactForce / surfaceAreaFactor) : impactForce;

    const deceleration_g = velocity > 0.01 ? (velocity / collisionDuration) / this.GRAVITY : 0;
    const sharpnessScore = objectProperties.edgeSharpness || 0;

    const fallHeightScore = this.calculateFallHeightScore(
      position[1],
      ageGroup.height,
      collisionEvent.agentFeetY ?? null,
      collisionEvent.agentPeakY ?? null
    );

    const gForce     = deceleration_g;
    const gForceTier = this.getGForceTier(gForce, ageGroupId, bodyPart);

    // ── Normalized scoring ──
    const normalizedHIC = this.normalizeHIC(hicScore, ageGroup);
    // [BUG-INJ-4 FIX] normalizeForce uses pediatric fracture thresholds.
    const normalizedForce = this.normalizeForce(impactPressure, mass, ageGroupId, bodyPart);

    // Biometric Bone Density Softness
    const boneDensityFactor = ageGroup.boneDensityFactor || 1.0;

    // Anatomical site density multiplier — lower density = more fragile = higher effective score.
    // Sources: Kalkwarf HJ et al. (2007) JBMR; Mora S et al. (2001) Bone; Landin (1997).
    // shoulder: clavicle cortical bone density comparable to distal radius (~0.78)
    const LOCATION_DENSITY = {
      head:     1.00,   // dense skull flat bone
      torso:    0.90,   // ribs + sternum bracing
      shoulder: 0.78,   // [BUG-BODY-1 FIX] clavicle — thin, frequently fractured
      legs:     0.85,   // long bone diaphysis
      arm:      0.80,   // radius / ulna
      wrist:    0.75,   // distal radius — thinnest cortical zone
      unknown:  0.90,
    };
    const locationDensityMultiplier = LOCATION_DENSITY[bodyPart] ?? LOCATION_DENSITY.unknown;

    const rawScore = (
      this.WEIGHTS.hic         * normalizedHIC +
      this.WEIGHTS.impactForce  * normalizedForce +
      this.WEIGHTS.sharpness    * (sharpnessScore * 100) +
      this.WEIGHTS.fallHeight   * (fallHeightScore * 100)
    ) * boneDensityFactor / locationDensityMultiplier;

    const isFallingEvent = collisionEvent.isFalling ?? false;
    const ageAdjustedScore = calculateAgeAdjustedInjury(rawScore, ageGroupId, bodyPart, isFallingEvent);
    let finalScore = Math.max(0, Math.min(100, ageAdjustedScore));

    // [Phase 5] Physis Yield (Growth Plate) Check
    const physisInjury = this.calculatePhysisYield(impactForce, ageGroupId);
    if (physisInjury && finalScore < 71) {
      finalScore = 85; // A fracture represents critical injury minimum
    }

    const riskTier = this.getRiskTier(finalScore);

    return {
      injuryScore:     Math.round(finalScore),
      riskTier:        riskTier.label,
      riskColor:       riskTier.color,
      bodyPart,
      specificInjury:  physisInjury || null,
      // Biomechanics detail
      gForce:              Math.round(gForce * 10) / 10,
      gForceTier:          gForceTier.label,
      gForceColor:         gForceTier.color,
      gForceAction:        gForceTier.action,
      gForceIcon:          gForceTier.icon,
      impactForceN:        Math.round(impactForce * 10) / 10,
      hic15:               Math.round(hicScore * 100) / 100,
      collisionDurationMs: Math.round(collisionDuration * 1000 * 10) / 10,
      surfaceType,
      components: {
        hic:         { raw: hicScore,       normalized: normalizedHIC },
        impactForce: { raw: impactForce,    normalized: normalizedForce },
        sharpness:   { raw: sharpnessScore, normalized: sharpnessScore * 100 },
        fallHeight:  { raw: fallHeightScore, normalized: fallHeightScore * 100 },
      },
      metadata: { velocity, mass, ageGroup: ageGroupId, timestamp: new Date().toISOString() },
    };
  }

  // ===========================================================================
  // GROWTH PLATE FRACTURE MODELING (Physis Yield)
  // ===========================================================================
  calculatePhysisYield(jointForce, ageGroupId) {
    const ageGroup = getAgeGroup(ageGroupId);
    if (!ageGroup || !ageGroup.physics || !ageGroup.physics.physisYieldLimitNm) {
      return null;
    }
    const leverArm      = 0.15; // 15cm lever arm
    const appliedTorque = jointForce * leverArm;
    const physisThreshold = ageGroup.physics.physisYieldLimitNm;
    if (appliedTorque > physisThreshold) {
      return 'growth_plate_fracture';
    }
    return null;
  }

  // ===========================================================================
  // HIC₁₅ — Head Injury Criterion (NHTSA FMVSS 208 / Versace 1971)
  //
  // Correct formula: HIC = [(a_avg/g)^2.5 × Δt]
  //   where Δt = collision duration (NOT clamped to 0.015s)
  //         a_avg = Δv / Δt (average deceleration)
  //
  // [BUG-INJ-8 FIX]: Old code truncated dt at 0.015s for ALL surfaces.
  // This causes HIC to be drastically over-estimated for soft surfaces (fabric=0.06s,
  // mattress=0.07s) — a child falling on a mattress got same HIC as concrete.
  //
  // New: use actual collision duration. Soft surfaces correctly produce lower HIC
  // because longer duration = lower peak deceleration = lower injury.
  //
  // Practical HIC₁₅ limit: t2−t1 ≤ 15ms for the WORST-CASE window. We approximate
  // this by finding the peak acceleration window analytically.
  // For constant deceleration pulse: best 15ms window = min(duration, 0.015) × (a^2.5)
  // But for real impacts the peak window dominates. We use the full duration when
  // duration ≤ 0.015s, and the peak-energy sub-window when duration > 0.015s.
  // ===========================================================================
  calculateHIC15(velocity, collisionDuration, isHeadImpact = false) {
    if (velocity < 0.01) return 0;
    const dt = collisionDuration;
    if (dt <= 0.001) return 0;
    const a_mps2 = velocity / dt;
    const a_g    = a_mps2 / this.GRAVITY;

    let hic;
    if (dt <= 0.015) {
      // Short impact (hard surface): full pulse is within HIC₁₅ window
      hic = Math.pow(a_g, 2.5) * dt;
    } else {
      // Long impact (soft surface): HIC₁₅ uses worst-case 15ms window
      // For constant deceleration: worst window = first 15ms (highest vel)
      // a_avg over 15ms: still v/0.015 but energy absorbed over full dt
      // Correction factor: (0.015/dt)^1.5 accounts for momentum spread
      const HIC_WINDOW = 0.015;
      const a_peak_g = velocity / HIC_WINDOW / this.GRAVITY;
      const energyRatio = Math.pow(HIC_WINDOW / dt, 1.5);  // energy in worst 15ms window
      hic = Math.pow(a_peak_g, 2.5) * HIC_WINDOW * energyRatio;
    }
    return isHeadImpact ? hic : hic * 0.3;
  }

  // ===========================================================================
  // IMPACT FORCE — Impulse-Momentum Theorem
  // ===========================================================================
  calculateImpactForce(mass, velocity, collisionDuration) {
    if (velocity < 0.01) return 0;
    return (mass * velocity) / collisionDuration;
  }

  // ===========================================================================
  // COLLISION DURATION from surface material
  // ===========================================================================
  getCollisionDuration(surfaceType, objectProperties = {}) {
    const key = (surfaceType || 'unknown').toLowerCase().replace(/\s+/g, '_');
    if (MATERIAL_COLLISION[key]) return MATERIAL_COLLISION[key].duration;
    if (objectProperties.edgeSharpness > 0.7) return MATERIAL_COLLISION.sharp_edge.duration;
    const sub = (objectProperties.subcategory || '').toLowerCase();
    if (sub.includes('pillow') || sub.includes('cushion')) return MATERIAL_COLLISION.pillow.duration;
    if (sub.includes('mattress') || sub.includes('bed'))   return MATERIAL_COLLISION.mattress.duration;
    if (sub.includes('foam') || sub.includes('mat'))       return MATERIAL_COLLISION.foam.duration;
    return MATERIAL_COLLISION.unknown.duration;
  }

  // ===========================================================================
  // BODY PART DETERMINATION
  // [BUG-INJ-1 FIX] Uses agent-relative Y: (collisionWorldY - agentFeetY) / height
  // [BUG-BODY-1 FIX] Added 'shoulder' body part (62-72% height zone).
  //   Previously lumped with torso, but shoulder/clavicle fracture is the
  //   #2 fall injury in children (Landin 1997). Now has distinct biomechanics.
  //
  // Zone map (normalised 0-1 from feet):
  //   0.00–0.28  legs    (thigh / knee / shin)
  //   0.28–0.48  arm     (forearm / FOOSH zone)
  //   0.48–0.62  torso   (abdomen / lower chest)
  //   0.62–0.72  shoulder (clavicle / upper chest — new)
  //   0.72–0.82  torso_upper (chest / mid-spine — grouped as torso)
  //   0.82–1.00  head
  // ===========================================================================
  determineBodyPart(collisionWorldY, agentHeight, agentFeetY = 0) {
    const agentRelY = collisionWorldY - agentFeetY;
    const relH      = agentHeight > 0 ? Math.max(0, Math.min(1, agentRelY / agentHeight)) : 0.5;

    if (relH >= 0.82) return 'head';       // skull / face
    if (relH >= 0.72) return 'torso';      // upper chest / mid-spine
    if (relH >= 0.62) return 'shoulder';   // [BUG-BODY-1 FIX] clavicle / shoulder joint
    if (relH >= 0.48) return 'torso';      // abdomen / lower back
    if (relH >= 0.28) return 'arm';        // forearm / wrist zone (FOOSH)
    return 'legs';                          // thigh / knee / shin
  }

  // ===========================================================================
  // FALL HEIGHT SCORE
  // [BUG-INJ-2 FIX] Uses actual fall delta from peak/spawn Y when available.
  // Old code: fallHeight = max(0, collisionHeight - CoM) — this used absolute
  // world Y, so a contact at ground level always gave fallHeight ≈ 0 regardless
  // of how high the agent was before falling.
  // ===========================================================================
  calculateFallHeightScore(collisionWorldY, agentHeight, agentSpawnY = null, agentPeakY = null) {
    let fallHeight;

    if (agentPeakY !== null) {
      // Best case: peak Y reached during fall is known
      fallHeight = Math.max(0, agentPeakY - collisionWorldY);
    } else if (agentSpawnY !== null) {
      // Use spawn surface Y as the starting elevation (agent was standing)
      const standingCoM = agentSpawnY + agentHeight * 0.55;
      fallHeight = Math.max(0, standingCoM - collisionWorldY);
    } else {
      // Backward-compat fallback: treat collisionWorldY as height above "ground"
      const centerOfMass = agentHeight * 0.55;
      fallHeight = Math.max(0, collisionWorldY - centerOfMass);
    }

    // Normalize: 2 m free fall = score 1.0 (WHO child fall fatality threshold ≈ 2 m)
    return Math.min(1.0, fallHeight / 2.0);
  }

  // ===========================================================================
  // NORMALIZATION for composite scoring
  // ===========================================================================
  normalizeHIC(hic, ageGroup) {
    const t = ageGroup.hicThreshold;
    if (hic < t.safe)      return 0;
    if (hic < t.warning)   return 30 * (hic - t.safe) / (t.warning - t.safe);
    if (hic < t.critical)  return 30 + 40 * (hic - t.warning) / (t.critical - t.warning);
    if (hic < t.dangerous) return 70 + 30 * (hic - t.critical) / (t.dangerous - t.critical);
    return 100;
  }

  // [BUG-INJ-4 FIX] Age-specific + body-part-specific fracture force thresholds.
  // Old formula: threshold = mass × 40 × g  (example: infant 7 kg → 2746 N)
  // Real infant femur fracture threshold: ~200-400 N (Miltner 1998) — off by ~9×.
  normalizeForce(force, mass, ageGroupId = 'early_toddler', bodyPart = 'legs') {
    const ageThresholds = PEDIATRIC_FRACTURE_THRESHOLDS_N[ageGroupId]
      ?? PEDIATRIC_FRACTURE_THRESHOLDS_N.early_toddler;
    const threshold = ageThresholds[bodyPart] ?? ageThresholds.legs;

    if (force < threshold * 0.1)  return 0;
    if (force < threshold * 0.3)  return 20 * (force / (threshold * 0.3));
    if (force < threshold)        return 20 + 50 * ((force - threshold * 0.3) / (threshold * 0.7));
    if (force < threshold * 1.5)  return 70 + 30 * ((force - threshold) / (threshold * 0.5));
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

  // [BUG-INJ-5 FIX] Pediatric g-force tier lookup — age × body-part matrix.
  // Old: fixed thresholds (observe < 20g, soft_injury 20-50g, serious > 50g).
  // These were adult values; infant head injury can start at 30-40g.
  getGForceTier(gForce, ageGroupId = 'early_toddler', bodyPart = 'head') {
    const ageThresholds = PEDIATRIC_G_THRESHOLDS[ageGroupId]
      ?? PEDIATRIC_G_THRESHOLDS.early_toddler;
    const t = ageThresholds[bodyPart] ?? ageThresholds.torso;

    if (gForce < t.observe)  return this.G_FORCE_TIERS.observe;
    if (gForce < t.serious)  return this.G_FORCE_TIERS.soft_injury;
    return this.G_FORCE_TIERS.serious_injury;
  }

  // ===========================================================================
  // BATCH + SUMMARY
  // ===========================================================================
  calculateBatchInjuries(collisionEvents, ageGroupId, objectsMap) {
    return collisionEvents.map(event => {
      const objectProps    = objectsMap[event.objectId]?.classification?.properties || {};
      const classification = objectsMap[event.objectId]?.classification || {};
      const enrichedProps  = {
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
    const tierCounts     = { safe: 0, watch: 0, warning: 0, critical: 0, dangerous: 0 };
    const bodyPartCounts = { head: 0, torso: 0, legs: 0, arm: 0, wrist: 0 };
    let totalScore = 0, maxScore = 0;
    let totalHIC = 0, maxHIC = 0;
    let totalForce = 0, maxForce = 0;

    injuryAssessments.forEach(assessment => {
      const injury = assessment.injury;
      if (!injury) return;
      const tier = injury.riskTier.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(tierCounts, tier)) tierCounts[tier]++;
      if (Object.prototype.hasOwnProperty.call(bodyPartCounts, injury.bodyPart)) {
        bodyPartCounts[injury.bodyPart]++;
      }
      totalScore += injury.injuryScore;
      maxScore    = Math.max(maxScore, injury.injuryScore);
      if (injury.hic15 !== undefined) {
        totalHIC += injury.hic15;
        maxHIC    = Math.max(maxHIC, injury.hic15);
      }
      if (injury.impactForceN !== undefined) {
        totalForce += injury.impactForceN;
        maxForce    = Math.max(maxForce, injury.impactForceN);
      }
    });

    const count = injuryAssessments.length;
    return {
      totalEvents:         count,
      averageScore:        count > 0 ? Math.round(totalScore / count) : 0,
      maxScore,
      tierDistribution:    tierCounts,
      bodyPartDistribution: bodyPartCounts,
      criticalCount:       tierCounts.critical + tierCounts.dangerous,
      hic15:       { average: count > 0 ? Math.round(totalHIC   / count * 100) / 100 : 0, max: Math.round(maxHIC   * 100) / 100 },
      impactForce: { averageN: count > 0 ? Math.round(totalForce / count) : 0,             maxN: Math.round(maxForce) },
    };
  }

  // ===========================================================================
  // SAFETY RECOMMENDATIONS
  // ===========================================================================
  generateSafetyRecommendations(objectName, gForceTier, bodyPart, injuryScore) {
    const recommendations = [];
    const searchBase = 'https://www.amazon.com/s?k=';
    const objLower   = (objectName || '').toLowerCase();

    if (gForceTier === 'Soft Injury' || gForceTier === 'Serious Injury') {
      if (bodyPart === 'head') {
        recommendations.push({
          product: 'Corner & Edge Guards',
          reason: 'Protect against head impacts on sharp edges',
          searchUrl: `${searchBase}${encodeURIComponent('baby corner protector edge guard ' + objLower)}`,
          priority: 'high',
        });
        recommendations.push({
          product: 'Baby Safety Helmet',
          reason: 'Head protection for active toddlers',
          searchUrl: `${searchBase}${encodeURIComponent('baby safety helmet toddler head protection')}`,
          priority: 'medium',
        });
      }

      if (bodyPart === 'wrist' || bodyPart === 'arm') {
        recommendations.push({
          product: 'Foam Floor Play Mat',
          reason: 'Cushioned landing surface reduces wrist/arm impact on falls',
          searchUrl: `${searchBase}${encodeURIComponent('baby foam floor mat interlocking tiles')}`,
          priority: 'high',
        });
      }

      if (objLower.includes('table') || objLower.includes('desk') || objLower.includes('counter')) {
        recommendations.push({
          product: 'Table Edge Bumper Strip',
          reason: 'Cushion hard table edges to reduce impact force',
          searchUrl: `${searchBase}${encodeURIComponent('table edge bumper strip child safety')}`,
          priority: 'high',
        });
      }

      if (objLower.includes('shelf') || objLower.includes('bookcase') || objLower.includes('cabinet')) {
        recommendations.push({
          product: 'Furniture Anti-Tip Straps',
          reason: 'Prevent furniture from tipping over onto children',
          searchUrl: `${searchBase}${encodeURIComponent('furniture anti-tip strap wall anchor child safety')}`,
          priority: 'high',
        });
        recommendations.push({
          product: 'Cabinet Safety Locks',
          reason: 'Prevent children from opening and climbing',
          searchUrl: `${searchBase}${encodeURIComponent('baby proof cabinet locks child safety')}`,
          priority: 'medium',
        });
      }

      if (objLower.includes('stair') || objLower.includes('step')) {
        recommendations.push({
          product: 'Safety Gate',
          reason: 'Block access to stairs and dangerous areas',
          searchUrl: `${searchBase}${encodeURIComponent('baby safety gate stairs child proof')}`,
          priority: 'high',
        });
      }

      if (objLower.includes('window')) {
        recommendations.push({
          product: 'Window Guards / Locks',
          reason: 'Prevent children from opening windows',
          searchUrl: `${searchBase}${encodeURIComponent('child safety window guard locks baby proof')}`,
          priority: 'high',
        });
      }

      if (objLower.includes('door')) {
        recommendations.push({
          product: 'Door Finger Pinch Guards',
          reason: 'Prevent finger injuries in door hinges',
          searchUrl: `${searchBase}${encodeURIComponent('door finger pinch guard child safety')}`,
          priority: 'medium',
        });
      }
    }

    if (gForceTier === 'Serious Injury') {
      recommendations.push({
        product: 'Foam Floor Play Mat',
        reason: 'Cushion floor to reduce fall impact severity',
        searchUrl: `${searchBase}${encodeURIComponent('baby foam floor mat interlocking play tiles')}`,
        priority: 'high',
      });
      recommendations.push({
        product: 'Non-Slip Rug Pad',
        reason: 'Prevent slipping that causes falls',
        searchUrl: `${searchBase}${encodeURIComponent('non-slip rug pad child safety anti-slip')}`,
        priority: 'medium',
      });
    }

    if (recommendations.length === 0 && injuryScore > 20) {
      recommendations.push({
        product: 'Baby Proofing Kit',
        reason: 'Comprehensive safety kit for home hazards',
        searchUrl: `${searchBase}${encodeURIComponent('baby proofing kit child safety home set')}`,
        priority: 'medium',
      });
    }

    return recommendations;
  }
}

// ============================================================================
// ROOM SAFETY INDEX
// ============================================================================
export function calculateRoomSafetyIndex(events) {
  let score = 100;
  const breakdown = { critical: 0, serious: 0, moderate: 0, minor: 0 };

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

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade = 'F';
  if (score >= 95)      grade = 'S';
  else if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 50) grade = 'C';

  return { score, grade, breakdown };
}

export { MATERIAL_COLLISION };

const calculatorInstance = new InjuryCalculator();

export default {
  calculateInjury:               calculatorInstance.calculateInjury.bind(calculatorInstance),
  calculateBatchInjuries:        calculatorInstance.calculateBatchInjuries.bind(calculatorInstance),
  getInjurySummary:              calculatorInstance.getInjurySummary.bind(calculatorInstance),
  generateSafetyRecommendations: calculatorInstance.generateSafetyRecommendations.bind(calculatorInstance),
  calculateRoomSafetyIndex,

  // Expose helpers
  calculateHIC15:        calculatorInstance.calculateHIC15.bind(calculatorInstance),
  getCollisionDuration:  calculatorInstance.getCollisionDuration.bind(calculatorInstance),
  calculatePhysisYield:  calculatorInstance.calculatePhysisYield.bind(calculatorInstance),

  RISK_TIERS:        calculatorInstance.RISK_TIERS,
  MATERIAL_COLLISION,
};