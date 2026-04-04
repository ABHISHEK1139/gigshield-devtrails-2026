import type {
  Claim,
  DisruptionEvent,
  InsertWorkerActivitySession,
  InsertWorkerEarningsSnapshot,
  Policy,
  Worker,
} from "@shared/schema";
import { buildEventKey, evaluateClaimForEvent } from "./hybridEngine";
import { storage } from "./storage";
import { getMonitoredCities, type CityWeather } from "./weatherService";

const SEVERITY_DURATION_HOURS: Record<string, number> = {
  warning: 1.5,
  severe: 3,
  extreme: 6,
};

export interface TriggerInput {
  city: string;
  zone: string;
  type: string;
  severity: string;
  value: string;
  threshold: string;
  source?: string;
  verificationPayload?: string;
}

export const SIMULATION_SCENARIO_KEYS = [
  "legit_auto_approve",
  "blocked_no_impact",
  "blocked_opportunistic_login",
  "blocked_activity_continuity",
  "manual_review_payout_lock",
] as const;

export type SimulationScenarioKey = (typeof SIMULATION_SCENARIO_KEYS)[number];

interface ScenarioProfile {
  dropRatio: number;
  activityStartOffsetMinutes: number;
  activityEndOffsetMinutes: number;
  activeMinutes: number;
  ordersCompleted: number;
  distanceKm: number;
  payoutLockHours?: number;
  notes: string;
}

interface RecomputeOptions {
  targetWorkerIds?: string[];
  ignoreClaimHistory?: boolean;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function severityDropRatio(severity: string) {
  if (severity === "extreme") return 0.65;
  if (severity === "severe") return 0.45;
  return 0.25;
}

function resolveScenarioProfile(
  scenarioKey: SimulationScenarioKey,
  severity: string,
): ScenarioProfile {
  const severeDrop = severityDropRatio(severity);
  const strongEndOffset = severity === "extreme" ? 75 : severity === "severe" ? 55 : 40;

  switch (scenarioKey) {
    case "blocked_no_impact":
      return {
        dropRatio: 0.08,
        activityStartOffsetMinutes: -95,
        activityEndOffsetMinutes: 55,
        activeMinutes: 92,
        ordersCompleted: 3,
        distanceKm: 11.2,
        notes: "Scenario lab: verified event but no material earnings impact",
      };
    case "blocked_opportunistic_login":
      return {
        dropRatio: severeDrop,
        activityStartOffsetMinutes: 5,
        activityEndOffsetMinutes: 45,
        activeMinutes: 28,
        ordersCompleted: 0,
        distanceKm: 0,
        notes: "Scenario lab: late login after the disruption began",
      };
    case "blocked_activity_continuity":
      return {
        dropRatio: severeDrop,
        activityStartOffsetMinutes: -95,
        activityEndOffsetMinutes: -10,
        activeMinutes: 70,
        ordersCompleted: 2,
        distanceKm: 7.4,
        notes: "Scenario lab: pre-event activity exists but continuity breaks at event start",
      };
    case "manual_review_payout_lock":
      return {
        dropRatio: severeDrop,
        activityStartOffsetMinutes: -95,
        activityEndOffsetMinutes: strongEndOffset,
        activeMinutes: severity === "extreme" ? 135 : severity === "severe" ? 118 : 92,
        ordersCompleted: severity === "warning" ? 2 : 3,
        distanceKm: severity === "warning" ? 6.5 : 11.4,
        payoutLockHours: 72,
        notes: "Scenario lab: payout rail inside a post-update lock window",
      };
    case "legit_auto_approve":
    default:
      return {
        dropRatio: severeDrop,
        activityStartOffsetMinutes: -95,
        activityEndOffsetMinutes: strongEndOffset,
        activeMinutes: severity === "extreme" ? 135 : severity === "severe" ? 118 : 92,
        ordersCompleted: severity === "warning" ? 2 : 3,
        distanceKm: severity === "warning" ? 6.5 : 11.4,
        notes: "Scenario lab: strong pre-event work and material impact",
      };
  }
}

async function ensureSimulationPayoutState(
  worker: Worker,
  triggeredAt: Date,
  payoutLockHours?: number,
) {
  const existing = await storage.getWorkerPayoutMethod(worker.id);

  await storage.upsertWorkerPayoutMethod(worker.id, {
    workerId: worker.id,
    method: existing?.method ?? "upi",
    label: existing?.label ?? "Primary UPI",
    accountRef: existing?.accountRef ?? `upi@${worker.phone.slice(-4)}`,
    verificationStatus: existing?.verificationStatus ?? "verified",
    lastUpdatedAt: triggeredAt.toISOString(),
    riskLockedUntil: payoutLockHours ? addHours(triggeredAt, payoutLockHours).toISOString() : null,
  });
}

function makeEventWindow(triggeredAt: string, severity: string) {
  const start = new Date(triggeredAt);
  const duration = SEVERITY_DURATION_HOURS[severity] || 3;
  return {
    startsAt: start.toISOString(),
    endsAt: addHours(start, duration).toISOString(),
  };
}

export async function upsertEventFromTrigger(
  trigger: TriggerInput,
  triggeredAt = new Date().toISOString(),
): Promise<DisruptionEvent> {
  const window = makeEventWindow(triggeredAt, trigger.severity);
  const eventKey = buildEventKey({
    city: trigger.city,
    zone: trigger.zone,
    triggerType: trigger.type,
    startsAt: window.startsAt,
  });

  const event = await storage.createOrUpdateEvent({
    eventKey,
    city: trigger.city,
    zone: trigger.zone,
    triggerType: trigger.type,
    severity: trigger.severity,
    source: trigger.source ?? "weather",
    triggerValue: trigger.value,
    threshold: trigger.threshold,
    verificationPayload: trigger.verificationPayload ?? "{}",
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  });

  await storage.createAlert({
    city: trigger.city,
    zone: trigger.zone,
    alertType: trigger.type,
    severity: trigger.severity,
    value: trigger.value,
    threshold: trigger.threshold,
    triggeredAt: window.startsAt,
  });

  return event;
}

async function createClaimForWorkerEvent(
  worker: Worker,
  policy: Policy,
  event: DisruptionEvent,
  options?: RecomputeOptions,
) {
  const snapshots = await storage.getWorkerEarningsSnapshots(worker.id);
  const activitySessions = await storage.getWorkerActivitySessions(worker.id);
  const payoutMethod = await storage.getWorkerPayoutMethod(worker.id);
  const existingClaims = options?.ignoreClaimHistory ? [] : await storage.getClaimsByWorker(worker.id);
  const allPayoutMethods = await storage.getAllWorkerPayoutMethods();
  const zoneWorkers = (await storage.getAllWorkers()).filter(
    (candidate) => candidate.city === worker.city && candidate.zone === worker.zone,
  );
  const zoneActivitySessions = await storage.getZoneActivitySessions(
    worker.city,
    worker.zone,
    new Date(new Date(event.startsAt).getTime() - 90 * 60 * 1000).toISOString(),
    event.endsAt,
  );
  const evaluation = evaluateClaimForEvent({
    worker,
    policy,
    event,
    payoutMethod,
    snapshots,
    activitySessions,
    zoneActivitySessions,
    zoneTotalWorkers: zoneWorkers.length,
    existingClaims,
    allPayoutMethods,
  });

  if (evaluation.status === "blocked_duplicate_event") {
    return { claim: null, created: false, evaluation };
  }

  const claim = await storage.createClaim({
    policyId: policy.id,
    workerId: worker.id,
    eventId: event.id,
    eventKey: event.eventKey,
    triggerType: event.triggerType,
    triggerValue: event.triggerValue,
    incomeLossHours: evaluation.eventImpactHours,
    eventImpactHours: evaluation.eventImpactHours,
    approvedCompensationHours: evaluation.approvedCompensationHours,
    impactLossRatio: evaluation.impactLossRatio,
    preEventActiveMinutes: evaluation.preEventActiveMinutes,
    duringEventActiveMinutes: evaluation.duringEventActiveMinutes,
    continuityScore: evaluation.continuityScore,
    workProofScore: evaluation.workProofScore,
    measuredEarningsDrop: evaluation.measuredEarningsDrop,
    measuredActiveHoursDrop: evaluation.measuredActiveHoursDrop,
    payoutAmount: evaluation.status === "approved" || evaluation.status === "manual_review" ? evaluation.payoutAmount : 0,
    triggeredAt: event.startsAt,
  });

  await storage.updateClaim(claim.id, {
    status: evaluation.status,
    blockReason: evaluation.blockReason,
    fraudScore: evaluation.fraudScore,
    fraudFlags: evaluation.fraudFlags.length > 0 ? evaluation.fraudFlags : undefined,
    decisionExplanation: evaluation.explanation,
    autoApproved: evaluation.status === "approved",
    processedAt: new Date().toISOString(),
    payoutAmount: evaluation.status === "approved" || evaluation.status === "manual_review" ? evaluation.payoutAmount : 0,
    approvedCompensationHours: evaluation.approvedCompensationHours,
    eventImpactHours: evaluation.eventImpactHours,
    impactLossRatio: evaluation.impactLossRatio,
    preEventActiveMinutes: evaluation.preEventActiveMinutes,
    duringEventActiveMinutes: evaluation.duringEventActiveMinutes,
    continuityScore: evaluation.continuityScore,
    workProofScore: evaluation.workProofScore,
    measuredEarningsDrop: evaluation.measuredEarningsDrop,
    measuredActiveHoursDrop: evaluation.measuredActiveHoursDrop,
  });

  if (evaluation.fraudFlags.length > 0) {
    await storage.createFraudSignals(
      evaluation.fraudFlags.map((flag) => ({
        claimId: claim.id,
        workerId: worker.id,
        signalType: flag,
        severity:
          flag.includes("shared") ||
          flag.includes("spike") ||
          flag.includes("late_login") ||
          flag.includes("opportunistic") ||
          flag.includes("continuity")
            ? "high"
            : "medium",
        notes: evaluation.explanation,
      })),
    );
  }

  return {
    claim: await storage.getClaim(claim.id),
    created: true,
    evaluation,
  };
}

export async function recomputeClaimsForEvent(event: DisruptionEvent, options?: RecomputeOptions) {
  const workers = await storage.getAllWorkers();
  const createdClaims: Claim[] = [];
  let skipped = 0;
  const targetWorkerIds = options?.targetWorkerIds ? new Set(options.targetWorkerIds) : null;

  for (const worker of workers.filter((candidate) => {
    if (targetWorkerIds) {
      return targetWorkerIds.has(candidate.id);
    }
    return candidate.city === event.city;
  })) {
    const policy = (await storage.getPoliciesByWorker(worker.id)).find(
      (candidate) => candidate.status === "active" && candidate.coverageTypes.includes(event.triggerType),
    );
    if (!policy) continue;

    const result = await createClaimForWorkerEvent(worker, policy, event, options);
    if (!result.created || !result.claim) {
      skipped++;
      continue;
    }
    createdClaims.push(result.claim);
  }

  return { event, claims: createdClaims, skipped };
}

export async function recomputeClaimsFromTriggers(
  triggers: TriggerInput[],
  triggeredAt = new Date().toISOString(),
) {
  const results = [];
  for (const trigger of triggers) {
    const event = await upsertEventFromTrigger(trigger, triggeredAt);
    results.push(await recomputeClaimsForEvent(event));
  }
  return results;
}

export async function seedSyntheticImpactForWorker(
  workerId: string,
  severity: string,
  triggeredAt = new Date(),
  scenarioKey: SimulationScenarioKey = "legit_auto_approve",
) {
  const worker = await storage.getWorker(workerId);
  if (!worker) return [];

  const profile = resolveScenarioProfile(scenarioKey, severity);
  const dropRatio = profile.dropRatio;
  const weekStart = new Date(triggeredAt);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addHours(weekStart, 24 * 6);

  await ensureSimulationPayoutState(worker, triggeredAt, profile.payoutLockHours);

  const snapshots = await storage.importWorkerEarningsSnapshots(workerId, [
    {
      workerId,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      grossEarnings: Math.round(worker.avgWeeklyEarnings * (1 - dropRatio)),
      activeHours: Math.round(worker.avgDailyHours * 6 * (1 - dropRatio)),
      completedOrders: Math.round((worker.avgWeeklyEarnings / 70) * (1 - dropRatio)),
      source: "simulation",
      verificationStatus: "verified",
      notes: profile.notes,
    } satisfies InsertWorkerEarningsSnapshot,
  ]);

  const activityStart = addMinutes(triggeredAt, profile.activityStartOffsetMinutes);
  const activityEnd = addMinutes(triggeredAt, profile.activityEndOffsetMinutes);
  await storage.importWorkerActivitySessions(workerId, [
    {
      workerId,
      startedAt: activityStart.toISOString(),
      endedAt: activityEnd.toISOString(),
      onlineMinutes: Math.round((activityEnd.getTime() - activityStart.getTime()) / (1000 * 60)),
      activeMinutes: profile.activeMinutes,
      ordersCompleted: profile.ordersCompleted,
      distanceKm: profile.distanceKm,
      source: "simulation",
      verificationStatus: "verified",
      notes: profile.notes,
    } satisfies InsertWorkerActivitySession,
  ]);

  return snapshots;
}

export function weatherToTrigger(weather: CityWeather) {
  const zone =
    getMonitoredCities().find((city) => city.city.toLowerCase() === weather.city.toLowerCase())?.zone ??
    `Central ${weather.city}`;
  const triggers: TriggerInput[] = [];
  if (weather.temperature >= 42) {
    triggers.push({
      city: weather.city,
      zone,
      type: "extreme_heat",
      severity: weather.temperature >= 45 ? "extreme" : weather.temperature >= 43 ? "severe" : "warning",
      value: `${weather.temperature} C`,
      threshold: "42 C",
      verificationPayload: JSON.stringify({ temperature: weather.temperature }),
    });
  }
  if (weather.rainfall >= 40) {
    triggers.push({
      city: weather.city,
      zone,
      type: "heavy_rain",
      severity: weather.rainfall >= 90 ? "extreme" : weather.rainfall >= 65 ? "severe" : "warning",
      value: `${weather.rainfall}mm/hr`,
      threshold: "65mm/hr",
      verificationPayload: JSON.stringify({ rainfall: weather.rainfall }),
    });
  }
  if (weather.aqi !== null && weather.aqi >= 150) {
    triggers.push({
      city: weather.city,
      zone,
      type: "pollution",
      severity: weather.aqi >= 300 ? "extreme" : weather.aqi >= 200 ? "severe" : "warning",
      value: `${weather.aqi} AQI`,
      threshold: "150 AQI",
      verificationPayload: JSON.stringify({ aqi: weather.aqi }),
    });
  }
  return triggers;
}
