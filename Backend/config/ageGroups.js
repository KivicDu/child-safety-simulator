/**
 * Age Group Configuration
 * 
 * Defines physical attributes, movement capabilities, and injury thresholds for different age groups.
 * Data derived from NIH, NHTSA, CDC, and IRCOBI pediatric studies.
 */

const ageGroups = {
  infant: {
    id: 'infant',
    name: 'Infant',
    ageRange: '0-12 months',
    mass: 8,            // kg (average 8-10 kg)
    height: 0.7,        // m  (sitting/crawling height ~70cm)
    reachHeight: 0.2,   // m  (can reach ~20cm from floor)
    capsuleRadius: 0.20,
    // Movement capabilities
    canWalk: false,
    canCrawl: true,
    canClimb: false,
    canRun: false,
    canJump: false,
    // Research-based velocity profiles (m/s) — NIH PMC: infant crawl avg 0.13 m/s
    velocityProfile: {
      crawl:   { mean: 0.13, stdDev: 0.03 },  // 0.10–0.16 m/s measured
      lunge:   { mean: 0.25, stdDev: 0.08 },  // reaching/grabbing burst
      roll:    { mean: 0.10, stdDev: 0.03 },  // rolling over
      fall:    { mean: 0.80, stdDev: 0.20 },  // falling from sitting
    },
    speed: 0.13, // legacy fallback
    gaitStability: 0.3,    // very unstable (0=unstable, 1=stable)
    stumbleProbability: 0.05, // 5% per step cycle when standing
    curiosity: 0.8,
    riskAwareness: 0.1,
    headMassRatio: 0.25,   // head = 25% of body mass (unlike adult 8%)
    headSensitivity: 2.0,
    fallDamageMultiplier: 1.5,
    // NHTSA/IRCOBI scaled HIC₁₅ thresholds
    hicThreshold: { safe: 200, warning: 390, critical: 600, dangerous: 800 },
    // Behavioral preferences
    attractedTo: ['bright_colors', 'shiny', 'small_graspable', 'cords', 'faces'],
    preferredColors: ['red', 'yellow', 'blue'],
    explorationMode: 'mouth_first',
  },

  toddler: {
    id: 'toddler',
    name: 'Toddler',
    ageRange: '1-3 years',
    mass: 13,           // kg (average 10-15 kg)
    height: 0.9,        // m
    reachHeight: 0.5,   // m
    capsuleRadius: 0.22,
    canWalk: true,
    canCrawl: true,
    canClimb: true,
    canRun: true,
    canJump: false,
    // Velocity profiles — NIH: toddler optimal walk 0.56 m/s at 2yo
    velocityProfile: {
      crawl:   { mean: 0.17, stdDev: 0.04 },  // faster crawl than infant
      walk:    { mean: 0.50, stdDev: 0.10 },  // 0.40–0.60 m/s (unstable)
      run:     { mean: 0.90, stdDev: 0.15 },  // short bursts, unstable
      lunge:   { mean: 0.70, stdDev: 0.20 },  // reaching/grabbing
      climb:   { mean: 0.20, stdDev: 0.05 },  // slow climbing
      fall:    { mean: 1.50, stdDev: 0.40 },  // falling from furniture ~0.6m
    },
    speed: 0.50, // legacy fallback
    gaitStability: 0.55,
    stumbleProbability: 0.15, // 15% — newly walking, frequent stumbles
    curiosity: 1.0,
    riskAwareness: 0.2,
    headMassRatio: 0.20,
    headSensitivity: 1.8,
    fallDamageMultiplier: 1.4,
    hicThreshold: { safe: 300, warning: 570, critical: 800, dangerous: 1100 },
    attractedTo: ['bright_colors', 'shiny', 'moving', 'buttons', 'drawers', 'cords'],
    preferredColors: ['red', 'yellow', 'blue', 'green'],
    explorationMode: 'touch_everything',
  },

  preschool: {
    id: 'preschool',
    name: 'Preschool',
    ageRange: '3-6 years',
    mass: 18,           // kg
    height: 1.1,        // m
    reachHeight: 0.8,   // m
    capsuleRadius: 0.25,
    canWalk: true,
    canCrawl: false,
    canClimb: true,
    canRun: true,
    canJump: true,
    // Velocity profiles — NIH: preschool walk 0.8-1.1 m/s, 20m sprint ~3.5 m/s
    velocityProfile: {
      walk:    { mean: 0.95, stdDev: 0.15 },  // 0.80–1.10 m/s
      run:     { mean: 1.50, stdDev: 0.25 },  // 1.20–1.80 m/s
      sprint:  { mean: 2.20, stdDev: 0.30 },  // 2.00–2.50 m/s (short burst)
      climb:   { mean: 0.30, stdDev: 0.08 },
      jump:    { mean: 1.00, stdDev: 0.20 },  // takeoff velocity
      fall:    { mean: 2.20, stdDev: 0.50 },  // falling from ~1.0m
    },
    speed: 0.95, // legacy fallback
    gaitStability: 0.75,
    stumbleProbability: 0.08,
    curiosity: 0.95,
    riskAwareness: 0.3,
    headMassRatio: 0.15,
    headSensitivity: 1.5,
    fallDamageMultiplier: 1.3,
    hicThreshold: { safe: 400, warning: 700, critical: 1000, dangerous: 1400 },
    attractedTo: ['imaginative_play', 'high_places', 'tools', 'colorful'],
    preferredColors: ['red', 'pink', 'blue', 'purple'],
    explorationMode: 'imaginative_play',
  },

  school: {
    id: 'school',
    name: 'School Age',
    ageRange: '6-10 years',
    mass: 28,           // kg
    height: 1.3,        // m
    reachHeight: 1.0,   // m
    capsuleRadius: 0.28,
    canWalk: true,
    canCrawl: false,
    canClimb: true,
    canRun: true,
    canJump: true,
    // Velocity profiles — ResearchGate: 7-10yo walk 1.24 m/s, run ~3.0 m/s
    velocityProfile: {
      walk:    { mean: 1.24, stdDev: 0.19 },  // 1.10–1.30 m/s
      run:     { mean: 2.40, stdDev: 0.40 },  // 2.00–2.80 m/s
      sprint:  { mean: 3.50, stdDev: 0.50 },  // 3.00–4.00 m/s
      climb:   { mean: 0.45, stdDev: 0.10 },
      jump:    { mean: 1.50, stdDev: 0.30 },
      fall:    { mean: 3.00, stdDev: 0.60 },  // falling from ~1.5m
    },
    speed: 1.24, // legacy fallback
    gaitStability: 0.85,
    stumbleProbability: 0.04,
    curiosity: 0.85,
    riskAwareness: 0.5,
    headMassRatio: 0.12,
    headSensitivity: 1.2,
    fallDamageMultiplier: 1.2,
    hicThreshold: { safe: 500, warning: 850, critical: 1200, dangerous: 1600 },
    attractedTo: ['sports_equipment', 'tools', 'high_places', 'competition'],
    preferredColors: [],
    explorationMode: 'active_play',
  },

  preteen: {
    id: 'preteen',
    name: 'Preteen',
    ageRange: '10-14 years',
    mass: 45,           // kg
    height: 1.5,        // m
    reachHeight: 1.2,   // m
    capsuleRadius: 0.30,
    canWalk: true,
    canCrawl: false,
    canClimb: true,
    canRun: true,
    canJump: true,
    // Velocity profiles — ResearchGate: 10-14yo sprint up to 5.5 m/s
    velocityProfile: {
      walk:    { mean: 1.35, stdDev: 0.22 },  // 1.20–1.40 m/s
      run:     { mean: 3.00, stdDev: 0.50 },  // 2.50–3.50 m/s
      sprint:  { mean: 4.70, stdDev: 0.80 },  // 4.00–5.50 m/s
      climb:   { mean: 0.60, stdDev: 0.15 },
      jump:    { mean: 2.00, stdDev: 0.40 },
      fall:    { mean: 3.50, stdDev: 0.70 },  // falling from ~2.0m
    },
    speed: 1.35, // legacy fallback
    gaitStability: 0.90,
    stumbleProbability: 0.02,
    curiosity: 0.7,
    riskAwareness: 0.6,
    headMassRatio: 0.10,
    headSensitivity: 1.0,
    fallDamageMultiplier: 1.0,
    hicThreshold: { safe: 600, warning: 900, critical: 1400, dangerous: 1800 },
    attractedTo: ['thrill_seeking', 'high_places', 'heavy_objects', 'electronics'],
    preferredColors: [],
    explorationMode: 'thrill_seeking',
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
  const actionProfile = profile[actionType] || profile.walk || { mean: group.speed, stdDev: group.speed * 0.15 };

  // Sample from Gaussian distribution
  let velocity = sampleGaussian(actionProfile.mean, actionProfile.stdDev);

  // Fatigue: speed decreases 5-15% over simulation duration
  const fatigueFactor = 1.0 - elapsedRatio * (0.05 + Math.random() * 0.10);
  velocity *= fatigueFactor;

  // Clamp to reasonable range (never negative, never > 2x mean)
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
export default ageGroups;