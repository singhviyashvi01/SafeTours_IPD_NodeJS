/**
 * testRiskEngine.js — SafeTours IPD
 *
 * Standalone verification script for the centralized Risk Score Engine (via Python).
 * Run with: node src/scripts/testRiskEngine.js
 */

require('dotenv').config();
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

async function runTest(label, inputs) {
  try {
    const result = await riskEngineService.calculateRisk(inputs);
    console.log(`\n${INFO} Test: ${label}`);
    console.log(`   Inputs: ${JSON.stringify(inputs)}`);
    console.log(`   Result: totalRiskScore=${result.totalRiskScore}, level=${result.level}`);
    console.log(`   Breakdown: ${JSON.stringify(result.breakdown)}`);
    assert(`  Successfully computed risk score`, true);
    return result;
  } catch (err) {
    console.log(`\n${INFO} Test: ${label}`);
    console.log(`   Inputs: ${JSON.stringify(inputs)}`);
    assert(`  Failed to compute risk score`, false, err.message);
    throw err;
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════');
  console.log('   SafeTours Risk Score Engine Tests   ');
  console.log('═══════════════════════════════════════\n');

  try {
    // Test 1: Normal data
    await runTest('Normal data', {
      lat: 18.9220,
      lng: 72.8347,
      crowdCount: 5,
      communityReports: [
        { severity: 3, timestamp: new Date().toISOString(), verified: true }
      ]
    });

    // Test 2: Missing weather/news numeric inputs -> handled by Python/normalization
    // For Node.js, we test missing crowdCount
    const result2 = await runTest('Missing crowdCount (should default to 0)', {
      lat: 19.0,
      lng: 73.0,
      crowdCount: undefined,
      communityReports: []
    });
    assert(`  crowdScore in breakdown should be 70 (isolation cap)`, result2.breakdown.crowd === 70, `got ${result2.breakdown.crowd}`);

    // Test 3: Missing string (null handling test on Python side)
    // We send empty strings to check if normalizeData handles it
    const result3 = await runTest('Missing/invalid numeric inputs (NaN, null)', {
      lat: null,
      lng: 'invalid',
      crowdCount: null,
      communityReports: []
    });
    assert(`  Valid risk calculation even with invalid inputs (defaults to 0,0)`, result3.totalRiskScore >= 0);

  } catch (error) {
    console.error('Test run aborted due to error.', error.message);
  }

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log(`   Results: ${passedTests}/${totalTests} tests passed`);
  if (passedTests === totalTests) {
    console.log('\x1b[32m   ✔ All tests passed. Risk Engine is ready!\x1b[0m');
  } else {
    console.log(`\x1b[31m   ✘ ${totalTests - passedTests} test(s) failed. Check logs above.\x1b[0m`);
  }
  console.log('═══════════════════════════════════════\n');
}

runTests();
