import assert from "node:assert/strict";
import {
  recomputeClaimsForEvent,
  seedSyntheticImpactForWorker,
  SIMULATION_SCENARIO_KEYS,
  upsertEventFromTrigger,
} from "../server/disruptionWorkflow";
import { storage } from "../server/storage";

async function runScenario(args: {
  workerName: string;
  scenarioKey: (typeof SIMULATION_SCENARIO_KEYS)[number];
  alertType: string;
  severity: "warning" | "severe" | "extreme";
  value: string;
  threshold: string;
  offsetHours: number;
}) {
  const workers = await storage.getAllWorkers();
  const worker = workers.find((item) => item.name === args.workerName);
  assert.ok(worker, `worker ${args.workerName} should exist`);

  const triggeredAt = new Date(Date.now() + args.offsetHours * 60 * 60 * 1000);
  await seedSyntheticImpactForWorker(worker.id, args.severity, triggeredAt, args.scenarioKey);

  const event = await upsertEventFromTrigger(
    {
      city: worker.city,
      zone: worker.zone,
      type: args.alertType,
      severity: args.severity,
      value: args.value,
      threshold: args.threshold,
      source: "test",
      verificationPayload: JSON.stringify({ scenarioKey: args.scenarioKey }),
    },
    triggeredAt.toISOString(),
  );

  const result = await recomputeClaimsForEvent(event, {
    targetWorkerIds: [worker.id],
    ignoreClaimHistory: true,
  });

  assert.equal(result.claims.length, 1, `${args.scenarioKey} should create exactly one claim`);
  return result.claims[0];
}

async function main() {
  const legitClaim = await runScenario({
    workerName: "Rajesh Kumar",
    scenarioKey: "legit_auto_approve",
    alertType: "extreme_heat",
    severity: "extreme",
    value: "47 C",
    threshold: "42 C",
    offsetHours: 8,
  });
  assert.equal(legitClaim.status, "approved", "legit scenario should auto-approve");
  assert.ok(legitClaim.payoutAmount > 0, "legit scenario should produce a payout amount");

  const noImpactClaim = await runScenario({
    workerName: "Priya Singh",
    scenarioKey: "blocked_no_impact",
    alertType: "heavy_rain",
    severity: "severe",
    value: "80mm/hr",
    threshold: "65mm/hr",
    offsetHours: 16,
  });
  assert.equal(noImpactClaim.status, "blocked_no_impact", "no-impact scenario should be blocked");
  assert.equal(noImpactClaim.blockReason, "no_material_impact", "no-impact scenario should explain the block");

  const opportunisticClaim = await runScenario({
    workerName: "Amit Sharma",
    scenarioKey: "blocked_opportunistic_login",
    alertType: "heavy_rain",
    severity: "severe",
    value: "95mm/hr",
    threshold: "65mm/hr",
    offsetHours: 24,
  });
  assert.equal(
    opportunisticClaim.status,
    "blocked_opportunistic_login",
    "late-login scenario should be blocked as opportunistic",
  );

  const continuityClaim = await runScenario({
    workerName: "Priya Singh",
    scenarioKey: "blocked_activity_continuity",
    alertType: "extreme_heat",
    severity: "severe",
    value: "44 C",
    threshold: "42 C",
    offsetHours: 32,
  });
  assert.equal(
    continuityClaim.status,
    "blocked_activity_continuity",
    "broken continuity scenario should be blocked",
  );

  const payoutLockClaim = await runScenario({
    workerName: "Rajesh Kumar",
    scenarioKey: "manual_review_payout_lock",
    alertType: "extreme_heat",
    severity: "severe",
    value: "44 C",
    threshold: "42 C",
    offsetHours: 40,
  });
  assert.equal(
    payoutLockClaim.status,
    "manual_review",
    "payout-lock scenario should route to manual review",
  );
  assert.equal(
    payoutLockClaim.blockReason,
    "payout_method_lock",
    "payout-lock scenario should keep the payout lock reason",
  );

  console.log("Scenario lab checks passed.");
}

void main();
