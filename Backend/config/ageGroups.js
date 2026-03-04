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
    boneDensityFactor: 1.475, // 1.5 - (0.5 * 0.05)
    surfaceAreaFactor: 2.5,   // Proportional head impact area
    // Research-based anthropometry — WHO Child Growth Standards, CDC, NIH PMC
    // All values are 50th-percentile medians for the age range
    anthropometry: {
      headRadius: 0.12,         // Scaled up to match frontend dummy.glb (base ~0.08 * 1.575)
      headHeightRatio: 0.25,    // Montreal Children's Hospital: head = 25% of body height
      torsoLength: 0.28,        // Adjusted to match Scaled dummy.glb spine
      torsoRadius: 0.07,        // proportional to body width
      armLength: 0.16,          // ~23% of height (short baby arms)
      armSpan: 0.64,            // CDC: slightly less than height at this age
      legLength: 0.18,          // Scaled down to match dummy.glb limbs (base ~0.3 * 0.6)
      hipWidth: 0.08,           // distance between leg attachment points
      shoulderWidth: 0.12,      // biacromial width
      walkStride: 0,            // infants cannot walk
      runStride: 0,             // infants cannot run
      crawlReach: 0.10,         // NIH PMC6723980: forward hand reach per crawl cycle
      crawlHandKneeDist: 0.22,  // distance from hands to knees during crawling
    },
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
    // ── Vision System — AAP/AAO developmental ophthalmology ────────────────
    vision: {
      eyeLevel: { crawling: 0.34, standing: 0.65 },
      fovHorizontal: 60,        // degrees — narrow infant focus
      fovVertical: 40,
      depthPerception: 0.3,     // 0-1 — poor binocular depth
      peripheralVision: 0.2,
      maxScanDistance: 1.5,     // meters — can focus 8-15 inches primarily
      focusMode: 'floor',       // floor-locked gaze pattern
      colorSensitivity: 0.3,    // R,Y,B only; limited color discrimination
      contrastSensitivity: 0.01,// ARVO: ~100x worse than adult at birth
    },
    // ── Movement Kinematics — NIH gait studies ────────────────────────────
    kinematics: {
      turnRate: 0.8,            // rad/s — very slow turning
      forwardBias: 0.2,         // low — mostly stationary/crawling
      dirChangeCooldown: 3.0,   // seconds before direction change
      momentumFactor: 0.3,      // low inertia
    },
    // ── Hand-Eye Coordination — NIH motor development ────────────────────
    coordination: {
      reactionLatency: 0.800,   // seconds — NIH gaze RT ~400ms + motor ~400ms
      graspingOffset: 0.08,     // meters — large spatial error
      graspSuccessRate: 0.50,   // 50% success rate
      dropProbability: 0.30,    // 30% chance of dropping
    },
    // ── Spatial Cognition — Piaget sensorimotor stage ─────────────────────
    cognition: {
      objectPermanence: 0.3,    // partial (4-8mo Piaget)
      hiddenObjectMemory: 2,    // seconds
      depthErrorMargin: 0.15,   // meters — large edge misjudging
      edgeAwareness: 0.1,       // Gibson visual cliff: very low
      dangerMemoryDuration: 10, // seconds — forgets fast
      maxDangerZones: 2,
      failBeforeStrategyChange: Infinity, // no strategy change
      strategyChangeType: null,
    },
    // ── Fear & Caution — Moro reflex, stranger anxiety ───────────────────
    fear: {
      startleSensitivity: 1.0,     // Moro reflex fully active
      startleFreezeDuration: 1.5,  // seconds
      heightFearThreshold: 0.3,    // meters
      heightFearResponse: 'cry',
      strangerFear: 0.7,           // high stranger/large-object avoidance
    },
  },

  toddler: {
    id: 'toddler',
    name: 'Toddler',
    ageRange: '1-3 years',
    mass: 13,           // kg (average 10-15 kg)
    height: 0.9,        // m
    reachHeight: 0.5,   // m
    capsuleRadius: 0.22,
    boneDensityFactor: 1.40,  // 1.5 - (2.0 * 0.05)
    surfaceAreaFactor: 1.8,
    // CDC growth charts + NIH gait studies — 50th percentile at ~2 years
    anthropometry: {
      headRadius: 0.11,         // Math sync with dummy.glb scale (~0.08 * 1.5)
      headHeightRatio: 0.22,    // head = 22% of body height
      torsoLength: 0.30,        // Match spine scale
      torsoRadius: 0.08,
      armLength: 0.24,          // ~27% of height
      armSpan: 0.88,            // CDC: arm span ~98% of height at 2y
      legLength: 0.28,          // Match limb scale
      hipWidth: 0.10,
      shoulderWidth: 0.16,
      walkStride: 0.30,         // NIH: stride length ~0.30m at 18mo, ~0.38m at 3y
      runStride: 0.50,          // short burst running strides
      crawlReach: 0.14,         // slightly longer reach than infant
      crawlHandKneeDist: 0.30,  // torso length + arm reach
    },
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
    // ── Vision System ─────────────────────────────────────────────────────
    vision: {
      eyeLevel: { crawling: 0.38, standing: 0.75 },
      fovHorizontal: 90,
      fovVertical: 50,
      depthPerception: 0.6,
      peripheralVision: 0.4,
      maxScanDistance: 3.0,
      focusMode: 'near',
      colorSensitivity: 0.7,
      contrastSensitivity: 0.3,
    },
    kinematics: {
      turnRate: 1.2,
      forwardBias: 0.7,         // high — lunges forward impulsively
      dirChangeCooldown: 1.5,
      momentumFactor: 0.5,
    },
    coordination: {
      reactionLatency: 0.600,
      graspingOffset: 0.05,
      graspSuccessRate: 0.70,
      dropProbability: 0.15,
    },
    cognition: {
      objectPermanence: 0.7,    // A-not-B error still possible
      hiddenObjectMemory: 8,
      depthErrorMargin: 0.08,
      edgeAwareness: 0.3,
      dangerMemoryDuration: 30,
      maxDangerZones: 4,
      failBeforeStrategyChange: 3,
      strategyChangeType: 'random_alt',
    },
    fear: {
      startleSensitivity: 0.8,
      startleFreezeDuration: 1.0,
      heightFearThreshold: 0.5,
      heightFearResponse: 'hesitate',
      strangerFear: 0.5,
    },
  },

  preschool: {
    id: 'preschool',
    name: 'Preschool',
    ageRange: '3-6 years',
    mass: 18,           // kg
    height: 1.1,        // m
    reachHeight: 0.8,   // m
    capsuleRadius: 0.25,
    boneDensityFactor: 1.25,  // 1.5 - (4.5 * 0.05)
    surfaceAreaFactor: 1.4,
    // CDC + NIH gait analysis — 50th percentile at ~4.5 years
    anthropometry: {
      headRadius: 0.09,         // dummy.glb (1.6 - 4.5*0.05)
      headHeightRatio: 0.18,    // head = 18% of body height
      torsoLength: 0.34,
      torsoRadius: 0.09,
      armLength: 0.32,          // ~29% of height
      armSpan: 1.10,            // CDC: arm span ≈ height by ~4 years
      legLength: 0.38,          // dummy.glb (0.65 + 4.5*0.07 = 0.96 scale)
      hipWidth: 0.12,
      shoulderWidth: 0.20,
      walkStride: 0.50,         // NIH: stride ~0.50m at 4-5y
      runStride: 0.80,          // measured running stride
      crawlReach: 0,            // preschoolers rarely crawl
      crawlHandKneeDist: 0,
    },
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
    // ── Vision System ─────────────────────────────────────────────────────
    vision: {
      eyeLevel: { crawling: null, standing: 0.92 },
      fovHorizontal: 120,
      fovVertical: 60,
      depthPerception: 0.85,
      peripheralVision: 0.7,
      maxScanDistance: 5.0,
      focusMode: 'mid',
      colorSensitivity: 0.9,
      contrastSensitivity: 0.7,
    },
    kinematics: {
      turnRate: 2.5,
      forwardBias: 0.5,
      dirChangeCooldown: 0.8,
      momentumFactor: 0.7,
    },
    coordination: {
      reactionLatency: 0.450,
      graspingOffset: 0.02,
      graspSuccessRate: 0.88,
      dropProbability: 0.05,
    },
    cognition: {
      objectPermanence: 1.0,
      hiddenObjectMemory: 30,
      depthErrorMargin: 0.03,
      edgeAwareness: 0.6,
      dangerMemoryDuration: 60,
      maxDangerZones: 6,
      failBeforeStrategyChange: 2,
      strategyChangeType: 'use_tool', // finds stepping stool
    },
    fear: {
      startleSensitivity: 0.5,
      startleFreezeDuration: 0.5,
      heightFearThreshold: 0.8,
      heightFearResponse: 'cautious',
      strangerFear: 0.3,
    },
  },

  school: {
    id: 'school',
    name: 'School Age',
    ageRange: '6-10 years',
    mass: 28,           // kg
    height: 1.3,        // m
    reachHeight: 1.0,   // m
    capsuleRadius: 0.28,
    boneDensityFactor: 1.10,  // 1.5 - (8.0 * 0.05)
    surfaceAreaFactor: 1.1,
    // CDC + ResearchGate gait data — 50th percentile at ~8 years
    anthropometry: {
      headRadius: 0.07,         // Near adult base scale
      headHeightRatio: 0.15,    // head = 15% of body height
      torsoLength: 0.40,
      torsoRadius: 0.10,
      armLength: 0.40,          // ~31% of height
      armSpan: 1.32,            // CDC: arm span ≈ 1.01× height
      legLength: 0.50,          // dummy.glb scale aligned
      hipWidth: 0.14,
      shoulderWidth: 0.24,
      walkStride: 0.72,         // ResearchGate: stride ~0.72m at 8y
      runStride: 1.10,          // measured running stride
      crawlReach: 0,            // school-age children don't crawl
      crawlHandKneeDist: 0,
    },
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
    // ── Vision System ─────────────────────────────────────────────────────
    vision: {
      eyeLevel: { crawling: null, standing: 1.12 },
      fovHorizontal: 150,
      fovVertical: 70,
      depthPerception: 0.95,
      peripheralVision: 0.9,
      maxScanDistance: 8.0,
      focusMode: 'full',
      colorSensitivity: 1.0,
      contrastSensitivity: 0.9,
    },
    kinematics: {
      turnRate: 3.5,
      forwardBias: 0.3,
      dirChangeCooldown: 0.4,
      momentumFactor: 0.85,
    },
    coordination: {
      reactionLatency: 0.350,
      graspingOffset: 0.01,
      graspSuccessRate: 0.95,
      dropProbability: 0.02,
    },
    cognition: {
      objectPermanence: 1.0,
      hiddenObjectMemory: 60,
      depthErrorMargin: 0.01,
      edgeAwareness: 0.85,
      dangerMemoryDuration: 120,
      maxDangerZones: 8,
      failBeforeStrategyChange: 2,
      strategyChangeType: 'plan',
    },
    fear: {
      startleSensitivity: 0.3,
      startleFreezeDuration: 0.3,
      heightFearThreshold: 1.2,
      heightFearResponse: 'aware',
      strangerFear: 0.1,
    },
  },

  preteen: {
    id: 'preteen',
    name: 'Preteen',
    ageRange: '10-14 years',
    mass: 45,           // kg
    height: 1.5,        // m
    reachHeight: 1.2,   // m
    capsuleRadius: 0.30,
    boneDensityFactor: 0.9,   // 1.5 - (12.0 * 0.05)
    surfaceAreaFactor: 1.0,   // Standard Baseline
    // CDC + NIH — 50th percentile at ~12 years, near-adult proportions
    anthropometry: {
      headRadius: 0.065,        // adult-like head size
      headHeightRatio: 0.14,    // head = 14% of body height
      torsoLength: 0.46,
      torsoRadius: 0.11,
      armLength: 0.48,          // ~32% of height
      armSpan: 1.52,            // CDC: arm span ≈ 1.01× height
      legLength: 0.65,          // dummy.glb (0.65 + 12.0*0.07 > 1.0 -> 1.0 scale)
      hipWidth: 0.16,
      shoulderWidth: 0.28,
      walkStride: 0.90,         // near-adult stride length
      runStride: 1.40,          // NIH: running stride ~1.4m at 12y
      crawlReach: 0,            // preteens don't crawl
      crawlHandKneeDist: 0,
    },
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
    // ── Vision System ─────────────────────────────────────────────────────
    vision: {
      eyeLevel: { crawling: null, standing: 1.31 },
      fovHorizontal: 170,
      fovVertical: 75,
      depthPerception: 1.0,
      peripheralVision: 1.0,
      maxScanDistance: 10.0,
      focusMode: 'full',
      colorSensitivity: 1.0,
      contrastSensitivity: 1.0,
    },
    kinematics: {
      turnRate: 4.0,
      forwardBias: 0.2,
      dirChangeCooldown: 0.3,
      momentumFactor: 0.9,
    },
    coordination: {
      reactionLatency: 0.300,
      graspingOffset: 0.005,
      graspSuccessRate: 0.98,
      dropProbability: 0.01,
    },
    cognition: {
      objectPermanence: 1.0,
      hiddenObjectMemory: 120,
      depthErrorMargin: 0.005,
      edgeAwareness: 0.95,
      dangerMemoryDuration: 180,
      maxDangerZones: 10,
      failBeforeStrategyChange: 1,
      strategyChangeType: 'plan',
    },
    fear: {
      startleSensitivity: 0.2,
      startleFreezeDuration: 0.2,
      heightFearThreshold: 1.5,
      heightFearResponse: 'rational',
      strangerFear: 0.05,
    },
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