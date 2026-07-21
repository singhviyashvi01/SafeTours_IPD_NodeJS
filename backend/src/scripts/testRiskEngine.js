/**
 * testRiskEngine.js — SafeTours IPD
 *
 * Standalone verification script for the centralized Risk Score Engine.
 * Run with: node src/scripts/testRiskEngine.js
 *
 * Tests:
 *   1. All zeros → SAFE (score 0)
 *   2. All 100s  → EXTREME (score 100)
 *   3. Boundary scores testing each SAFE/LOW/MODERATE/HIGH/EXTREME threshold
 *   4. Typical Mumbai hotspot scenario
 *   5. Missing/undefined inputs graceful handling (defaults to 0)
 *   6. Custom weight override
 *   7. Weighted formula validation (manual calculation check)
 */

const riskEngineService = require('../services/riskEngine.service');

const PASS = '\x1b[32m✔ PASS\x1b[0m';
const FAIL = '\x1b[31m✘ FAIL\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';

let totalTests = 0;
let passedTests = 0;

function assert(label, condition, extra = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`${PASS}  ${label}`);
  } else {
    console.log(`${FAIL}  ${label}${extra ? ' — ' + extra : ''}`);
  }
}

function runTest(label, inputs, expectedLevel, expectedRange) {
  const result = riskEngineService.calculateRisk(inputs);
  const inRange = result.totalRiskScore >= expectedRange[0] && result.totalRiskScore <= expectedRange[1];
  const correctLevel = result.level === expectedLevel;

  console.log(`\n${INFO} Test: ${label}`);
  console.log(`   Inputs: ${JSON.stringify(inputs)}`);
  console.log(`   Result: totalRiskScore=${result.totalRiskScore}, level=${result.level}`);
  console.log(`   Breakdown: ${JSON.stringify(result.breakdown)}`);

  assert(`  Score (${result.totalRiskScore}) in range [${expectedRange[0]}, ${expectedRange[1]}]`, inRange, `got ${result.totalRiskScore}`);
  assert(`  Level is '${expectedLevel}'`, correctLevel, `got '${result.level}'`);
}

console.log('\n═══════════════════════════════════════');
console.log('   SafeTours Risk Score Engine Tests   ');
console.log('═══════════════════════════════════════\n');

// Test 1: All zeros → SAFE
runTest(
  'All zeros → SAFE',
  { crimeScore: 0, weatherScore: 0, newsScore: 0, crowdScore: 0, communityScore: 0, ewsScore: 0 },
  'SAFE',
  [0, 19]
);

// Test 2: All 100s → EXTREME
runTest(
  'All 100s → EXTREME',
  { crimeScore: 100, weatherScore: 100, newsScore: 100, crowdScore: 100, communityScore: 100, ewsScore: 0 },
  'EXTREME',
  [80, 100]
);

// Test 3: Score expected to be in LOW range (20-39)
runTest(
  'Low-risk scenario → LOW',
  { crimeScore: 25, weatherScore: 15, newsScore: 10, crowdScore: 20, communityScore: 30, ewsScore: 0 },
  'LOW',
  [20, 39]
);

// Test 4: Moderate risk scenario → MODERATE
runTest(
  'Moderate-risk scenario → MODERATE',
  { crimeScore: 50, weatherScore: 40, newsScore: 30, crowdScore: 45, communityScore: 50, ewsScore: 0 },
  'MODERATE',
  [40, 59]
);

// Test 5: High crime area → HIGH
runTest(
  'High crime area → HIGH',
  { crimeScore: 80, weatherScore: 50, newsScore: 40, crowdScore: 60, communityScore: 70, ewsScore: 0 },
  'HIGH',
  [60, 79]
);

// Test 6: Extreme risk scenario → EXTREME
runTest(
  'Extreme risk scenario → EXTREME',
  { crimeScore: 95, weatherScore: 90, newsScore: 80, crowdScore: 85, communityScore: 88, ewsScore: 0 },
  'EXTREME',
  [80, 100]
);

// Test 7: Missing inputs default to 0
console.log(`\n${INFO} Test: Missing/undefined inputs gracefully default to 0`);
const emptyResult = riskEngineService.calculateRisk({});
assert(`  Result level is a valid risk level`, ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'].includes(emptyResult.level));
assert(`  totalRiskScore is 0 when all inputs missing`, emptyResult.totalRiskScore === 0, `got ${emptyResult.totalRiskScore}`);

// Test 8: Custom weights override
console.log(`\n${INFO} Test: Custom weights override`);
const customWeightsResult = riskEngineService.calculateRisk(
  { crimeScore: 100, weatherScore: 0, newsScore: 0, crowdScore: 0, communityScore: 0, ewsScore: 0 },
  { crime: 1.0, weather: 0, news: 0, crowd: 0, community: 0, ews: 0 }
);
assert(`  With crime=100 and crime weight=1.0, totalRiskScore = 100`, customWeightsResult.totalRiskScore === 100, `got ${customWeightsResult.totalRiskScore}`);
assert(`  Level is EXTREME`, customWeightsResult.level === 'EXTREME', `got ${customWeightsResult.level}`);

// Test 9: Weighted formula manual verification
console.log(`\n${INFO} Test: Manual formula verification`);
// crime=60*0.40=24, weather=50*0.20=10, crowd=40*0.15=6, community=30*0.15=4.5, news=20*0.10=2 → 46.5 → rounds to 47 → MODERATE
const manualResult = riskEngineService.calculateRisk({
  crimeScore: 60,
  weatherScore: 50,
  newsScore: 20,
  crowdScore: 40,
  communityScore: 30,
  ewsScore: 0,
});
// Expected = 0.40*60 + 0.20*50 + 0.10*20 + 0.15*40 + 0.15*30 = 24 + 10 + 2 + 6 + 4.5 = 46.5 → 47
const expectedFormula = Math.round(0.40 * 60 + 0.20 * 50 + 0.10 * 20 + 0.15 * 40 + 0.15 * 30);
assert(`  Score matches manual formula (expected ${expectedFormula}, got ${manualResult.totalRiskScore})`, manualResult.totalRiskScore === expectedFormula, `got ${manualResult.totalRiskScore}`);
assert(`  Level is MODERATE`, manualResult.level === 'MODERATE', `got ${manualResult.level}`);

// Test 10: getRiskLevel boundary checks
console.log(`\n${INFO} Test: getRiskLevel boundary precision`);
assert(`  Score 0  → SAFE`,     riskEngineService.getRiskLevel(0)   === 'SAFE');
assert(`  Score 19 → SAFE`,     riskEngineService.getRiskLevel(19)  === 'SAFE');
assert(`  Score 20 → LOW`,      riskEngineService.getRiskLevel(20)  === 'LOW');
assert(`  Score 39 → LOW`,      riskEngineService.getRiskLevel(39)  === 'LOW');
assert(`  Score 40 → MODERATE`, riskEngineService.getRiskLevel(40)  === 'MODERATE');
assert(`  Score 59 → MODERATE`, riskEngineService.getRiskLevel(59)  === 'MODERATE');
assert(`  Score 60 → HIGH`,     riskEngineService.getRiskLevel(60)  === 'HIGH');
assert(`  Score 79 → HIGH`,     riskEngineService.getRiskLevel(79)  === 'HIGH');
assert(`  Score 80 → EXTREME`,  riskEngineService.getRiskLevel(80)  === 'EXTREME');
assert(`  Score 100 → EXTREME`, riskEngineService.getRiskLevel(100) === 'EXTREME');

// Summary
console.log('\n═══════════════════════════════════════');
console.log(`   Results: ${passedTests}/${totalTests} tests passed`);
if (passedTests === totalTests) {
  console.log('\x1b[32m   ✔ All tests passed. Risk Engine is ready!\x1b[0m');
} else {
  console.log(`\x1b[31m   ✘ ${totalTests - passedTests} test(s) failed. Check logs above.\x1b[0m`);
}
console.log('═══════════════════════════════════════\n');
