import assert from "node:assert/strict";
import {
  evaluateClaimForEvent,
  previewPolicyFromVerifiedBaseline,
  summarizeVerifiedEarnings,
} from "../server/hybridEngine";
import { storage } from "../server/storage";

async function main() {
  const workers = await storage.getAllWorkers();
  assert.ok(workers.length >= 4, "seed workers should exist");

  const rajesh = workers.find((worker) => worker.name === "Rajesh Kumar");
  const kavita = workers.find((worker) => worker.name === "Kavita Devi");
  assert.ok(rajesh, "Rajesh seed worker should exist");
  assert.ok(kavita, "Kavita seed worker should exist");

  const rajeshSnapshots = await storage.getWorkerEarningsSnapshots(rajesh.id);
  const rajeshSummary = summarizeVerifiedEarnings(rajesh, rajeshSnapshots);
  assert.equal(rajeshSummary.eligible, true, "Rajesh should have an eligible verified baseline");
  assert.ok(rajeshSummary.baselineWeeklyEarnings > 4000, "Rajesh baseline should be computed from history");

  const rajeshPreview = previewPolicyFromVerifiedBaseline(rajesh, "standard", rajeshSnapshots);
  assert.equal(rajeshPreview.status, "eligible", "Rajesh policy preview should be eligible");
  assert.ok(rajeshPreview.weeklyPremium > 0, "Policy preview should compute a premium");

  const kavitaSnapshots = await storage.getWorkerEarningsSnapshots(kavita.id);
  const kavitaActivity = await storage.getWorkerActivitySessions(kavita.id);
  const kavitaPolicy = (await storage.getPoliciesByWorker(kavita.id))[0];
  const kavitaPayoutMethod = await storage.getWorkerPayoutMethod(kavita.id);
  const kavitaEvent = (await storage.getAllEvents()).find((event) => event.city === kavita.city);
  assert.ok(kavitaPolicy && kavitaPayoutMethod && kavitaEvent, "Kavita seed data should include policy, payout method, and event");

  const kavitaZoneSessions = await storage.getZoneActivitySessions(
    kavita.city,
    kavita.zone,
    new Date(new Date(kavitaEvent.startsAt).getTime() - 90 * 60 * 1000).toISOString(),
    kavitaEvent.endsAt,
  );
  const lockedEvaluation = evaluateClaimForEvent({
    worker: kavita,
    policy: kavitaPolicy,
    event: kavitaEvent,
    payoutMethod: kavitaPayoutMethod,
    snapshots: kavitaSnapshots,
    activitySessions: kavitaActivity,
    zoneActivitySessions: kavitaZoneSessions,
    zoneTotalWorkers: workers.filter((worker) => worker.city === kavita.city && worker.zone === kavita.zone).length,
    existingClaims: [],
    allPayoutMethods: await storage.getAllWorkerPayoutMethods(),
  });
  assert.equal(lockedEvaluation.status, "manual_review", "Risk-locked payout methods should force manual review");

  const rajeshPolicy = (await storage.getPoliciesByWorker(rajesh.id))[0];
  const rajeshEvent = (await storage.getAllEvents()).find((event) => event.city === "Delhi");
  const rajeshActivity = await storage.getWorkerActivitySessions(rajesh.id);
  assert.ok(rajeshPolicy && rajeshEvent, "Rajesh should have policy and event data");

  const rajeshZoneSessions = await storage.getZoneActivitySessions(
    rajesh.city,
    rajesh.zone,
    new Date(new Date(rajeshEvent.startsAt).getTime() - 90 * 60 * 1000).toISOString(),
    rajeshEvent.endsAt,
  );
  const duplicateEvaluation = evaluateClaimForEvent({
    worker: rajesh,
    policy: rajeshPolicy,
    event: rajeshEvent,
    payoutMethod: await storage.getWorkerPayoutMethod(rajesh.id),
    snapshots: rajeshSnapshots,
    activitySessions: rajeshActivity,
    zoneActivitySessions: rajeshZoneSessions,
    zoneTotalWorkers: workers.filter((worker) => worker.city === rajesh.city && worker.zone === rajesh.zone).length,
    existingClaims: await storage.getClaimsByWorker(rajesh.id),
    allPayoutMethods: await storage.getAllWorkerPayoutMethods(),
  });
  assert.equal(duplicateEvaluation.status, "blocked_duplicate_event", "Duplicate worker-event pairs should be blocked");

  const shortEventEvaluation = evaluateClaimForEvent({
    worker: rajesh,
    policy: rajeshPolicy,
    event: {
      ...rajeshEvent,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      eventKey: `short-${Date.now()}`,
    },
    payoutMethod: await storage.getWorkerPayoutMethod(rajesh.id),
    snapshots: rajeshSnapshots,
    activitySessions: [
      {
        id: "short-eligible-activity",
        workerId: rajesh.id,
        startedAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
        endedAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
        onlineMinutes: 95,
        activeMinutes: 78,
        ordersCompleted: 3,
        distanceKm: 9.5,
        source: "test",
        verificationStatus: "verified",
        notes: null,
        createdAt: new Date(),
      },
    ],
    zoneActivitySessions: [],
    zoneTotalWorkers: 1,
    existingClaims: [],
    allPayoutMethods: await storage.getAllWorkerPayoutMethods(),
  });
  assert.equal(shortEventEvaluation.status, "blocked_no_impact", "Short events under the deductible window should be blocked");

  const opportunisticEvaluation = evaluateClaimForEvent({
    worker: rajesh,
    policy: rajeshPolicy,
    event: {
      ...rajeshEvent,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      eventKey: `late-login-${Date.now()}`,
    },
    payoutMethod: await storage.getWorkerPayoutMethod(rajesh.id),
    snapshots: rajeshSnapshots,
    activitySessions: [
      {
        id: "late-login-session",
        workerId: rajesh.id,
        startedAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        endedAt: new Date(Date.now() + 40 * 60 * 1000).toISOString(),
        onlineMinutes: 35,
        activeMinutes: 28,
        ordersCompleted: 0,
        distanceKm: 0,
        source: "test",
        verificationStatus: "verified",
        notes: null,
        createdAt: new Date(),
      },
    ],
    zoneActivitySessions: [],
    zoneTotalWorkers: 1,
    existingClaims: [],
    allPayoutMethods: await storage.getAllWorkerPayoutMethods(),
  });
  assert.equal(opportunisticEvaluation.status, "blocked_opportunistic_login", "Late logins after the event starts should be blocked");

  console.log("Hybrid guardrail checks passed.");
}

void main();
