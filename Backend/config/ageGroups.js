/**
 * Age Group Configuration — RESEARCH GRADE REFACTOR
 * 
 * Defines physical attributes, movement capabilities, and injury thresholds for different age groups.
 * Data derived from NIH, NHTSA, CDC, and IRCOBI pediatric studies.
 * 
 * CORE REFINE: 
 * - Adult-like 'preteen' group removed. 
 * - 'Toddler' split into Early (1-2y) and Late (2-3y) to capture rapid CNS myelination.
 * - Static COM removed. Segmental mass arrays added for dynamic COM calculation.
 * - Biological Torque limits (Nm) and Physis Yield limits added for realistic physics constraints.
 * - Neuromotor Delay timers added (Perception + Transmission + Actuation).
 */

const ageGroups = {
  infant: {
    id: 'infant',
    name: 'Infant',
    ageRange: '0-1 years',
    mass: 8,            // kg
    height: 0.7,        // m  
    reachHeight: 0.2,   // m  
    capsuleRadius: 0.20,
    boneDensityFactor: 1.475,
    surfaceAreaFactor: 2.5,
    
    // ANTHROPOMETRY & SEGMENTAL MASS (Dynamic COM foundation)
    anthropometry: {
      headRadius: 0.12,
      torsoLength: 0.28,
      armLength: 0.16,
      legLength: 0.18,
    },
    segmentalMass: {
      head: 0.25,   // 25% of systemic mass
      torso: 0.35,  // 35% of systemic mass
      arms: 0.10,   // 10% (5% each arm)
      legs: 0.30,   // 30% (15% each leg)
    },
    
    // BIOLOGICAL PHYSICS CONSTRAINTS
    physics: {
      jointLaxity: 'extreme',
      maxJointTorqueNm: 6,      // Extremely weak muscle output
      physisYieldLimitNm: 15,   // Growth plates shear easily
    },

    // NEUROMOTOR DELAY (Total: 800ms)
    neuromotorLatency: {
      perception: 0.300,
      transmission: 0.200,
      actuation: 0.300
    },

    // MOVEMENT KINEMATICS
    canWalk: false,
    canCrawl: true,
    canClimb: false,
    canRun: false,
    canJump: false,
    kinematics: { turnRate: 1.0, forwardBias: 0.1, momentumFactor: 0.1, maxAcceleration: 0.5, accelerationTime: 2.0 },
    
    // AI ENGINE PARAMETERS
    balanceControl: { ankleGain: 0.1, hipGain: 0.1, recoveryStepLatency: 0.8, balanceNoise: 0.8 },
    fatigueProfile: { fatigueRate: 0.08, recoveryRate: 0.05, enduranceCapacity: 10 },
    attentionProfile: { focusDuration: 3, distractibility: 0.9, noveltyBias: 1.0, hazardAwareness: 0.0 },
    motorControl: { coordinationNoise: 0.8, motorPlanningError: 0.5 },
    
    velocityProfile: {
      crawl:   { mean: 0.13, stdDev: 0.03 },
      fall:    { mean: 0.80, stdDev: 0.20 },
    },
    speed: 0.13,
    gaitStability: 0.0, // Quadrupedal
    stumbleProbability: 0.05,
    
    // BEHAVIORAL & RISK
    curiosity: 0.8,
    riskAwareness: 0.05,
    headSensitivity: 2.0,
    fallDamageMultiplier: 1.5,
    hicThreshold: { safe: 200, warning: 390, critical: 600, dangerous: 800 },
    explorationMode: 'mouth_first',
  },

  early_toddler: {
    id: 'early_toddler',
    name: 'Early Toddler',
    ageRange: '1-2 years',
    mass: 12,
    height: 0.82,
    reachHeight: 0.45,
    capsuleRadius: 0.22,
    boneDensityFactor: 1.42,
    surfaceAreaFactor: 2.0,
    
    anthropometry: {
      headRadius: 0.11,
      torsoLength: 0.30,
      armLength: 0.22,
      legLength: 0.26,
    },
    segmentalMass: {
      head: 0.22,
      torso: 0.36,
      arms: 0.12,
      legs: 0.30,
    },
    
    physics: {
      jointLaxity: 'high',
      maxJointTorqueNm: 12,
      physisYieldLimitNm: 25,
    },
    
    // NEUROMOTOR DELAY (Total: 500ms)
    neuromotorLatency: {
      perception: 0.200,
      transmission: 0.150,
      actuation: 0.150
    },

    canWalk: true,
    canCrawl: true,
    canClimb: true,
    canRun: false,
    canJump: false,
    kinematics: { turnRate: 1.5, forwardBias: 0.2, momentumFactor: 0.2, maxAcceleration: 1.0, accelerationTime: 1.6 },
    
    // AI ENGINE PARAMETERS
    balanceControl: { ankleGain: 0.4, hipGain: 0.3, recoveryStepLatency: 0.4, balanceNoise: 0.6 },
    fatigueProfile: { fatigueRate: 0.05, recoveryRate: 0.06, enduranceCapacity: 60 },
    attentionProfile: { focusDuration: 10, distractibility: 0.8, noveltyBias: 0.9, hazardAwareness: 0.05 },
    motorControl: { coordinationNoise: 0.5, motorPlanningError: 0.3 },
    
    velocityProfile: {
      walk:    { mean: 0.45, stdDev: 0.12 }, // Extremely unstable, high stdDev
      crawl:   { mean: 0.17, stdDev: 0.04 },
      fall:    { mean: 1.20, stdDev: 0.30 },
    },
    speed: 0.45,
    gaitStability: 0.3, // "High Guard" arm position
    stumbleProbability: 0.20, // Toddlers fall 17 times/hour (Adolph 2012)
    
    curiosity: 1.0,
    riskAwareness: 0.1,
    headSensitivity: 1.8,
    fallDamageMultiplier: 1.4,
    hicThreshold: { safe: 300, warning: 570, critical: 800, dangerous: 1100 },
    explorationMode: 'touch_everything',
  },

  late_toddler: {
    id: 'late_toddler',
    name: 'Late Toddler',
    ageRange: '2-3 years',
    mass: 14,
    height: 0.94,
    reachHeight: 0.55,
    capsuleRadius: 0.23,
    boneDensityFactor: 1.35,
    surfaceAreaFactor: 1.6,
    
    anthropometry: {
      headRadius: 0.10,
      torsoLength: 0.32,
      armLength: 0.26,
      legLength: 0.30,
    },
    segmentalMass: {
      head: 0.20,
      torso: 0.38,
      arms: 0.12,
      legs: 0.30,
    },
    
    physics: {
      jointLaxity: 'high',
      maxJointTorqueNm: 20,
      physisYieldLimitNm: 35,
    },

    // NEUROMOTOR DELAY (Total: 400ms)
    neuromotorLatency: {
      perception: 0.150,
      transmission: 0.100,
      actuation: 0.150
    },

    canWalk: true,
    canCrawl: false,
    canClimb: true,
    canRun: true,
    canJump: false,
    kinematics: { turnRate: 2.5, forwardBias: 0.4, momentumFactor: 0.3, maxAcceleration: 1.5, accelerationTime: 1.4 },
    
    // AI ENGINE PARAMETERS
    balanceControl: { ankleGain: 0.6, hipGain: 0.5, recoveryStepLatency: 0.3, balanceNoise: 0.4 },
    fatigueProfile: { fatigueRate: 0.04, recoveryRate: 0.08, enduranceCapacity: 120 },
    attentionProfile: { focusDuration: 20, distractibility: 0.7, noveltyBias: 0.8, hazardAwareness: 0.15 },
    motorControl: { coordinationNoise: 0.3, motorPlanningError: 0.2 },
    
    velocityProfile: {
      walk:    { mean: 0.60, stdDev: 0.10 },
      run:     { mean: 1.10, stdDev: 0.20 }, // Stiff running
      fall:    { mean: 1.60, stdDev: 0.40 },
    },
    speed: 0.60,
    gaitStability: 0.55,
    stumbleProbability: 0.12,
    
    curiosity: 0.9,
    riskAwareness: 0.2,
    headSensitivity: 1.7,
    fallDamageMultiplier: 1.35,
    hicThreshold: { safe: 350, warning: 620, critical: 900, dangerous: 1200 },
    explorationMode: 'touch_everything',
  },

  preschool: {
    id: 'preschool',
    name: 'Preschool',
    ageRange: '3-5 years',
    mass: 18,
    height: 1.1,
    reachHeight: 0.8,
    capsuleRadius: 0.25,
    boneDensityFactor: 1.25,
    surfaceAreaFactor: 1.4,
    
    anthropometry: {
      headRadius: 0.09,
      torsoLength: 0.34,
      armLength: 0.32,
      legLength: 0.38,
    },
    segmentalMass: {
      head: 0.16,
      torso: 0.40,
      arms: 0.12,
      legs: 0.32,
    },
    
    physics: {
      jointLaxity: 'moderate',
      maxJointTorqueNm: 35,
      physisYieldLimitNm: 50,
    },

    // NEUROMOTOR DELAY (Total: 350ms)
    neuromotorLatency: {
      perception: 0.120,
      transmission: 0.080,
      actuation: 0.150
    },

    canWalk: true,
    canCrawl: false,
    canClimb: true,
    canRun: true,
    canJump: true,
    kinematics: { turnRate: 3.5, forwardBias: 0.5, momentumFactor: 0.4, maxAcceleration: 2.0, accelerationTime: 1.2 },
    
    // AI ENGINE PARAMETERS
    balanceControl: { ankleGain: 0.8, hipGain: 0.7, recoveryStepLatency: 0.2, balanceNoise: 0.2 },
    fatigueProfile: { fatigueRate: 0.03, recoveryRate: 0.10, enduranceCapacity: 300 },
    attentionProfile: { focusDuration: 45, distractibility: 0.5, noveltyBias: 0.6, hazardAwareness: 0.4 },
    motorControl: { coordinationNoise: 0.15, motorPlanningError: 0.1 },

    velocityProfile: {
      walk:    { mean: 0.95, stdDev: 0.15 },
      run:     { mean: 1.50, stdDev: 0.25 },
      sprint:  { mean: 2.20, stdDev: 0.30 },
      fall:    { mean: 2.20, stdDev: 0.50 },
    },
    speed: 0.95,
    gaitStability: 0.75,
    stumbleProbability: 0.08,
    
    curiosity: 0.95,
    riskAwareness: 0.3,
    headSensitivity: 1.5,
    fallDamageMultiplier: 1.3,
    hicThreshold: { safe: 400, warning: 700, critical: 1000, dangerous: 1400 },
    explorationMode: 'imaginative_play',
  },

  child: {
    id: 'child',
    name: 'Child',
    ageRange: '6-10 years',
    mass: 28,
    height: 1.3,
    reachHeight: 1.0,
    capsuleRadius: 0.28,
    boneDensityFactor: 1.10,
    surfaceAreaFactor: 1.1,
    
    anthropometry: {
      headRadius: 0.07,
      torsoLength: 0.40,
      armLength: 0.40,
      legLength: 0.50,
    },
    segmentalMass: {
      head: 0.14,
      torso: 0.42,
      arms: 0.12,
      legs: 0.32,
    },
    
    physics: {
      jointLaxity: 'low',
      maxJointTorqueNm: 80,
      physisYieldLimitNm: 90,
    },

    // NEUROMOTOR DELAY (Total: 250ms) // Adult-like transmission speed
    neuromotorLatency: {
      perception: 0.100,
      transmission: 0.050,
      actuation: 0.100
    },

    canWalk: true,
    canCrawl: false,
    canClimb: true,
    canRun: true,
    canJump: true,
    kinematics: { turnRate: 4.5, forwardBias: 0.6, momentumFactor: 0.5, maxAcceleration: 3.0, accelerationTime: 1.0 },
    
    // AI ENGINE PARAMETERS
    balanceControl: { ankleGain: 1.0, hipGain: 0.9, recoveryStepLatency: 0.15, balanceNoise: 0.05 },
    fatigueProfile: { fatigueRate: 0.015, recoveryRate: 0.15, enduranceCapacity: 900 },
    attentionProfile: { focusDuration: 120, distractibility: 0.3, noveltyBias: 0.4, hazardAwareness: 0.7 },
    motorControl: { coordinationNoise: 0.05, motorPlanningError: 0.02 },

    velocityProfile: {
      walk:    { mean: 1.24, stdDev: 0.19 },
      run:     { mean: 2.40, stdDev: 0.40 },
      sprint:  { mean: 3.50, stdDev: 0.50 },
      fall:    { mean: 3.00, stdDev: 0.60 },
    },
    speed: 1.24,
    gaitStability: 0.85,
    stumbleProbability: 0.04,
    
    curiosity: 0.85,
    riskAwareness: 0.6, // Higher risk awareness
    headSensitivity: 1.2,
    fallDamageMultiplier: 1.2,
    hicThreshold: { safe: 500, warning: 850, critical: 1200, dangerous: 1600 },
    explorationMode: 'active_play',
  }
};

// Helper: Sample from Gaussian distribution (Box-Muller transform)
export function sampleGaussian(mean, stdDev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

// Helper: Get realistic velocity for an action type
export function getRealisticVelocity(ageGroupId, actionType, elapsedRatio = 0) {
  const group = ageGroups[ageGroupId];
  if (!group) return 0.5;

  const profile = group.velocityProfile;
  const actionProfile = profile[actionType] || profile.walk || profile.crawl || { mean: group.speed, stdDev: group.speed * 0.15 };

  // Sample from Gaussian distribution
  let velocity = sampleGaussian(actionProfile.mean, actionProfile.stdDev);

  // Fatigue: speed decreases 5-15% over simulation duration
  const fatigueFactor = 1.0 - elapsedRatio * (0.05 + Math.random() * 0.10);
  velocity *= fatigueFactor;

  return Math.max(0.05, Math.min(velocity, actionProfile.mean * 2.5));
}

export function getAgeGroup(id) { return ageGroups[id] || null; }
export function getAllAgeGroups() { return Object.values(ageGroups); }
export function getAgeGroupIds() { return Object.keys(ageGroups); }
export function calculateAgeAdjustedInjury(baseInjury, ageGroupId, bodyPart) {
  const group = getAgeGroup(ageGroupId);
  if (!group) return baseInjury;
  let adjusted = baseInjury;
  if (bodyPart === 'head') adjusted *= group.headSensitivity;
  if (bodyPart === 'fall') adjusted *= group.fallDamageMultiplier;
  return adjusted;
}

export function validateAgeProfile(profile) {
  const errors = [];
  
  if (profile.segmentalMass) {
    const sum = (profile.segmentalMass.head || 0) + 
                (profile.segmentalMass.torso || 0) + 
                (profile.segmentalMass.arms || 0) + 
                (profile.segmentalMass.legs || 0);
    if (Math.abs(sum - 1.0) > 0.01) errors.push(`Segmental masses sum to ${sum.toFixed(2)}, expected 1.0`);
  } else {
    errors.push('Missing segmentalMass profiles');
  }

  if (profile.physics && profile.physics.maxJointTorqueNm <= 0) {
    errors.push('maxJointTorqueNm must be strictly positive');
  } else if (!profile.physics || profile.physics.maxJointTorqueNm === undefined) {
    errors.push('Missing maxJointTorqueNm');
  }

  if (profile.neuromotorLatency) {
    const { perception, transmission, actuation } = profile.neuromotorLatency;
    if (perception < 0.05 || perception > 1.0) errors.push('perceptionDelay out of biological bounds [0.05-1.0s]');
    if (transmission < 0.01 || transmission > 0.5) errors.push('transmissionDelay out of biological bounds [0.01-0.5s]');
    if (actuation < 0.05 || actuation > 1.0) errors.push('actuationDelay out of biological bounds [0.05-1.0s]');
  } else {
    errors.push('Missing neuromotorLatency configuration');
  }

  return { valid: errors.length === 0, errors };
}

export default ageGroups;