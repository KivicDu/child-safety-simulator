const ageGroups = {
  infant: { id: 'infant', name: 'Infant', ageRange: '0-12 months', mass: 8, height: 0.7, reachHeight: 0.2, capsuleRadius: 0.25, canWalk: false, canCrawl: true, canClimb: false, speed: 0.3, curiosity: 0.8, riskAwareness: 0.1, headSensitivity: 2.0, fallDamageMultiplier: 1.5, hicThreshold: { safe: 300, warning: 500, critical: 700, dangerous: 1000 } },
  
  toddler: { id: 'toddler', name: 'Toddler', ageRange: '1-3 years', mass: 13, height: 0.9, reachHeight: 0.5, capsuleRadius: 0.25, canWalk: true, canCrawl: true, canClimb: true, speed: 0.8, curiosity: 1.0, riskAwareness: 0.2, headSensitivity: 1.8, fallDamageMultiplier: 1.4, hicThreshold: { safe: 400, warning: 600, critical: 900, dangerous: 1200 } },
  
  preschool: { id: 'preschool', name: 'Preschool', ageRange: '3-6 years', mass: 18, height: 1.1, reachHeight: 0.8, capsuleRadius: 0.28, canWalk: true, canCrawl: false, canClimb: true, speed: 1.2, curiosity: 0.95, riskAwareness: 0.3, headSensitivity: 1.5, fallDamageMultiplier: 1.3, hicThreshold: { safe: 500, warning: 700, critical: 1000, dangerous: 1400 } },
  
  school: { id: 'school', name: 'School Age', ageRange: '6-10 years', mass: 28, height: 1.3, reachHeight: 1.0, capsuleRadius: 0.30, canWalk: true, canCrawl: false, canClimb: true, speed: 1.5, curiosity: 0.85, riskAwareness: 0.5, headSensitivity: 1.2, fallDamageMultiplier: 1.2, hicThreshold: { safe: 600, warning: 900, critical: 1200, dangerous: 1600 } },
  
  preteen: { id: 'preteen', name: 'Preteen', ageRange: '10-14 years', mass: 45, height: 1.5, reachHeight: 1.2, capsuleRadius: 0.32, canWalk: true, canCrawl: false, canClimb: true, speed: 2.0, curiosity: 0.7, riskAwareness: 0.6, headSensitivity: 1.0, fallDamageMultiplier: 1.0, hicThreshold: { safe: 700, warning: 1000, critical: 1400, dangerous: 1800 } }
};

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