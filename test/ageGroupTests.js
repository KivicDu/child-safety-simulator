import { getAgeGroup, getAllAgeGroups } from '../config/ageGroups.js';

/**
 * Test all age group configurations
 */
export function testAgeGroupConfigurations() {
  console.log('\n🧪 TESTING AGE GROUP CONFIGURATIONS\n');
  
  const allGroups = getAllAgeGroups();
  let passed = 0;
  let failed = 0;

  allGroups.forEach(group => {
    console.log(`\n📋 Testing: ${group.name} (${group.ageRange})`);
    
    const tests = [
      { name: 'Mass', value: group.mass, min: 5, max: 100 },
      { name: 'Height', value: group.height, min: 0.5, max: 2.0 },
      { name: 'Speed', value: group.speed, min: 0.1, max: 3.0 },
      { name: 'Curiosity', value: group.curiosity, min: 0, max: 1 },
      { name: 'Risk Awareness', value: group.riskAwareness, min: 0, max: 1 },
      { name: 'Head Sensitivity', value: group.headSensitivity, min: 0.8, max: 3.0 },
      { name: 'Fall Damage Mult', value: group.fallDamageMultiplier, min: 0.8, max: 2.0 }
    ];

    tests.forEach(test => {
      if (test.value >= test.min && test.value <= test.max) {
        console.log(`   ✅ ${test.name}: ${test.value}`);
        passed++;
      } else {
        console.log(`   ❌ ${test.name}: ${test.value} (out of range ${test.min}-${test.max})`);
        failed++;
      }
    });

    // HIC thresholds
    const hic = group.hicThreshold;
    if (hic.safe < hic.warning && hic.warning < hic.critical && hic.critical < hic.dangerous) {
      console.log(`   ✅ HIC Thresholds: ${hic.safe} < ${hic.warning} < ${hic.critical} < ${hic.dangerous}`);
      passed++;
    } else {
      console.log(`   ❌ HIC Thresholds not in ascending order`);
      failed++;
    }
  });

  console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

/**
 * Run comparative simulation test
 */
export async function testComparativeSimulation() {
  console.log('\n🧪 COMPARATIVE SIMULATION TEST\n');
  
  const testResults = {
    infant: null,
    toddler: null,
    preschool: null,
    school: null,
    preteen: null
  };

  // This would call the actual simulation
  // For now, just structure check
  console.log('✅ Test structure ready for implementation');
  
  return testResults;
}