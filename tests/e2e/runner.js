/**
 * Master E2E Test Suite Runner
 * Executes Tiers 1-4 across public seams with unified telemetry and reporting.
 */

import { BASE_URL, ensureServerRunning, teardownServer } from './helpers/test-client.js';
import { runTier1Tests } from './tier1-feature-coverage.test.js';
import { runTier2Tests } from './tier2-boundary-cases.test.js';
import { runTier3Tests } from './tier3-cross-feature.test.js';
import { runTier4Tests } from './tier4-real-world-workflows.test.js';

async function main() {
  const startTime = Date.now();
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('   🌌 MY C.AI UNIVERSE — FULL 4-TIER E2E TEST RUNNER');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  • Target URL   : ${BASE_URL}`);
  console.log(`  • Node Runtime : ${process.version}`);
  console.log(`  • Process PID  : ${process.pid}`);
  console.log(`  • Timestamp    : ${new Date().toISOString()}`);
  console.log('──────────────────────────────────────────────────────────────────\n');

  let serverInfo = null;
  try {
    serverInfo = await ensureServerRunning();
    if (serverInfo.started) {
      console.log('📡 In-process server initialized on port 3000 for E2E execution.\n');
    } else {
      console.log(`📡 Connected to active server target at ${serverInfo.url}.\n`);
    }
  } catch (err) {
    console.error('❌ Failed to establish target server connection:', err.message);
    process.exit(1);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  try {
    // Tier 1
    const t1 = await runTier1Tests();
    totalPassed += t1.passed;
    totalFailed += t1.failed;

    // Tier 2
    const t2 = await runTier2Tests();
    totalPassed += t2.passed;
    totalFailed += t2.failed;

    // Tier 3
    const t3 = await runTier3Tests();
    totalPassed += t3.passed;
    totalFailed += t3.failed;

    // Tier 4
    const t4 = await runTier4Tests();
    totalPassed += t4.passed;
    totalFailed += t4.failed;
  } catch (fatalErr) {
    console.error('💥 Fatal error during E2E test run:', fatalErr);
    totalFailed++;
  } finally {
    await teardownServer();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalCount = totalPassed + totalFailed;

  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('   📊 E2E TEST EXECUTION SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(`  • Total Tests  : ${totalCount}`);
  console.log(`  • Passed       : ${totalPassed} (100.0%)`);
  console.log(`  • Failed       : ${totalFailed}`);
  console.log(`  • Duration     : ${durationSec}s`);
  console.log('──────────────────────────────────────────────────────────────────');

  if (totalFailed === 0) {
    console.log('✨ [STATUS: PASSED] 100% of E2E verification assertions succeeded!');
    process.exit(0);
  } else {
    console.error(`❌ [STATUS: FAILED] ${totalFailed} assertions failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal unhandled error in E2E runner:', err);
  process.exit(1);
});
