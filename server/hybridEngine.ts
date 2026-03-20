import type {
  Claim,
  DisruptionEvent,
  FraudSignal,
  Policy,
  Worker,
  WorkerActivitySession,
  WorkerEarningsSnapshot,
  WorkerPayoutMethod,
} from "@shared/schema";

export interface EarningsSummary {
  eligible: boolean;
  status: "eligible" | "manual_review" | "blocked";
  reasons: string[];
  verifiedWeeks: number;
  baselineWeeklyEarnings: number;
  baselineActiveHours: number;
  baselineHourlyEarnings: number;
  volatilityRatio: number;
  recentSpikeRatio: number;
}

export interface PolicyPreview {
  eligible: boolean;
  status: "eligible" | "manual_review" | "blocked";
  reasons: string[];
  weeklyPremium: number;
  maxWeeklyCoverage: number;
  baselineWeeklyEarnings: number;
  baselineActiveHours: number;
  baselineHourlyEarnings: number;
  waitingPeriodEndsAt: string;
  pricingVersion: string;
  riskInputsSnapshot: string;
}

export interface ClaimEvaluation {
  status:
    | "blocked_no_impact"
    | "blocked_waiting_period"
    | "blocked_duplicate_event"
    | "blocked_unverified_baseline"
    | "blocked_pre_event_inactivity"
    | "blocked_activity_continuity"
    | "blocked_opportunistic_login"
    | "blocked_no_work_proof"
    | "manual_review"
    | "approved";
  blockReason: string | null;
  eventImpactHours: number;
  approvedCompensationHours: number;
  impactLossRatio: number;
  preEventActiveMinutes: number;
  duringEventActiveMinutes: number;
  continuityScore: number;
  workProofScore: number;
  measuredEarningsDrop: number;
  measuredActiveHoursDrop: number;
  payoutAmount: number;
  fraudScore: number;
  fraudFlags: string[];
  explanation: string;
}

interface ActivityEvidence {
  preEventActiveMinutes: number;
  duringEventActiveMinutes: number;
  continuityScore: number;
  workProofScore: number;
  overlappedEventStart: boolean;
  lateLogin: boolean;
}

interface ZoneActivityStats {
  activeAtEventStart: number;
  preCommittedWorkers: number;
}

const COVERAGE_MULTIPLIER: Record<string, number> = {
  basic: 5,
  standard: 8,
  premium: 12,
};

const BASE_PREMIUM_RATE: Record<string, number> = {
  basic: 0.015,
  standard: 0.025,
  premium: 0.04,
};

const SEVERITY_MAX_HOURS: Record<string, number> = {
  warning: 2,
  severe: 4,
  extreme: 8,
};

const WAITING_PERIOD_HOURS = 72;
const SHORT_EVENT_BLOCK_HOURS = 1;
const MIN_IMPACT_RATIO = 0.2;
const PRE_EVENT_LOOKBACK_MINUTES = 90;
const MIN_PRE_EVENT_ACTIVE_MINUTES = 45;
const MIN_DURING_EVENT_ACTIVE_MINUTES = 15;
const MIN_WORK_PROOF_SCORE = 40;

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function ratioSpread(values: number[], baseline: number): number {
  if (!values.length || baseline <= 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return roundCurrency((max - min) / baseline);
}

function overlapMinutes(startA: Date, endA: Date, startB: Date, endB: Date) {
  const overlap = Math.max(
    0,
    Math.min(endA.getTime(), endB.getTime()) - Math.max(startA.getTime(), startB.getTime()),
  );
  return roundCurrency(overlap / (1000 * 60));
}

function getVerifiedActivitySessions(activitySessions: WorkerActivitySession[]) {
  return [...activitySessions]
    .filter((session) => session.verificationStatus === "verified")
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
}

function evaluateActivityEvidence(
  activitySessions: WorkerActivitySession[],
  event: DisruptionEvent,
): ActivityEvidence {
  const verified = getVerifiedActivitySessions(activitySessions);
  const eventStart = new Date(event.startsAt);
  const eventEnd = new Date(event.endsAt);
  const preWindowStart = new Date(eventStart.getTime() - PRE_EVENT_LOOKBACK_MINUTES * 60 * 1000);
  const earlyEventEnd = new Date(
    Math.min(eventEnd.getTime(), eventStart.getTime() + 60 * 60 * 1000),
  );

  let preEventActiveMinutes = 0;
  let duringEventActiveMinutes = 0;
  let totalOrders = 0;
  let totalDistance = 0;
  let overlappedEventStart = false;
  let lateLogin = false;

  for (const session of verified) {
    const sessionStart = new Date(session.startedAt);
    const sessionEnd = new Date(session.endedAt);

    preEventActiveMinutes += overlapMinutes(sessionStart, sessionEnd, preWindowStart, eventStart);
    duringEventActiveMinutes += overlapMinutes(sessionStart, sessionEnd, eventStart, earlyEventEnd);

    if (sessionEnd >= preWindowStart && sessionStart <= earlyEventEnd) {
      totalOrders += session.ordersCompleted ?? 0;
      totalDistance += session.distanceKm ?? 0;
    }

    if (sessionStart <= eventStart && sessionEnd >= eventStart) {
      overlappedEventStart = true;
    }

    if (sessionStart > eventStart && sessionStart <= earlyEventEnd && session.activeMinutes > 0) {
      lateLogin = true;
    }
  }

  preEventActiveMinutes = roundCurrency(preEventActiveMinutes);
  duringEventActiveMinutes = roundCurrency(duringEventActiveMinutes);

  const continuityScore = roundCurrency(
    Math.min(
      100,
      (overlappedEventStart ? 55 : 0) +
        Math.min(preEventActiveMinutes / MIN_PRE_EVENT_ACTIVE_MINUTES, 1) * 25 +
        Math.min(duringEventActiveMinutes / MIN_DURING_EVENT_ACTIVE_MINUTES, 1) * 20,
    ),
  );

  const workProofScore = roundCurrency(
    Math.min(
      100,
      Math.min(preEventActiveMinutes / MIN_PRE_EVENT_ACTIVE_MINUTES, 1) * 35 +
        Math.min(duringEventActiveMinutes / MIN_DURING_EVENT_ACTIVE_MINUTES, 1) * 20 +
        Math.min(totalOrders / 3, 1) * 25 +
        Math.min(totalDistance / 10, 1) * 20,
    ),
  );

  return {
    preEventActiveMinutes,
    duringEventActiveMinutes,
    continuityScore,
    workProofScore,
    overlappedEventStart,
    lateLogin: lateLogin && !overlappedEventStart,
  };
}

function computeZoneActivityStats(
  zoneActivitySessions: WorkerActivitySession[],
  event: DisruptionEvent,
): ZoneActivityStats {
  const sessionsByWorker = new Map<string, WorkerActivitySession[]>();
  for (const session of zoneActivitySessions) {
    const existing = sessionsByWorker.get(session.workerId) || [];
    existing.push(session);
    sessionsByWorker.set(session.workerId, existing);
  }

  let activeAtEventStart = 0;
  let preCommittedWorkers = 0;

  for (const sessions of Array.from(sessionsByWorker.values())) {
    const evidence = evaluateActivityEvidence(sessions, event);
    if (evidence.overlappedEventStart) activeAtEventStart += 1;
    if (evidence.preEventActiveMinutes >= MIN_PRE_EVENT_ACTIVE_MINUTES) preCommittedWorkers += 1;
  }

  return { activeAtEventStart, preCommittedWorkers };
}

export function getVerifiedSnapshots(snapshots: WorkerEarningsSnapshot[]) {
  return [...snapshots]
    .filter((snapshot) => snapshot.verificationStatus === "verified")
    .sort((a, b) => new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime())
    .slice(0, 8);
}

export function summarizeVerifiedEarnings(
  worker: Worker,
  snapshots: WorkerEarningsSnapshot[],
): EarningsSummary {
  const verified = getVerifiedSnapshots(snapshots);
  const reasons: string[] = [];

  if (verified.length < 4) {
    reasons.push("At least 4 verified weeks are required before policy issuance.");
  }

  const grosses = verified.map((snapshot) => snapshot.grossEarnings);
  const activeHours = verified.map((snapshot) => snapshot.activeHours);
  const baselineWeeklyEarnings = median(grosses);
  const baselineActiveHours = median(activeHours);
  const baselineHourlyEarnings =
    baselineWeeklyEarnings > 0 && baselineActiveHours > 0
      ? roundCurrency(baselineWeeklyEarnings / baselineActiveHours)
      : 0;

  const volatilityRatio = ratioSpread(grosses, baselineWeeklyEarnings);

  if (volatilityRatio > 0.9) {
    reasons.push("Earnings history is too volatile for automated underwriting.");
  }

  const recent = verified.slice(0, 2).map((snapshot) => snapshot.grossEarnings);
  const older = verified.slice(2).map((snapshot) => snapshot.grossEarnings);
  const olderMedian = older.length ? median(older) : baselineWeeklyEarnings;
  const recentSpikeRatio = olderMedian > 0 ? roundCurrency(median(recent) / olderMedian) : 0;
  if (recentSpikeRatio > 1.35) {
    reasons.push("Recent earnings spike detected before policy issuance.");
  }

  if (baselineWeeklyEarnings <= 0 || baselineActiveHours <= 0) {
    reasons.push("Verified baseline is incomplete.");
  }

  let status: EarningsSummary["status"] = "eligible";
  if (reasons.some((reason) => reason.includes("required") || reason.includes("incomplete"))) {
    status = "blocked";
  } else if (reasons.length > 0) {
    status = "manual_review";
  }

  return {
    eligible: status === "eligible",
    status,
    reasons,
    verifiedWeeks: verified.length,
    baselineWeeklyEarnings: baselineWeeklyEarnings || worker.avgWeeklyEarnings,
    baselineActiveHours: baselineActiveHours || roundCurrency(worker.avgDailyHours * 6),
    baselineHourlyEarnings:
      baselineHourlyEarnings ||
      roundCurrency(worker.avgWeeklyEarnings / Math.max(worker.avgDailyHours * 6, 1)),
    volatilityRatio,
    recentSpikeRatio,
  };
}

function calculateRiskScore(worker: Worker, summary: EarningsSummary) {
  let score = 40;
  const cityRisk: Record<string, number> = {
    Delhi: 12,
    Mumbai: 10,
    Chennai: 8,
    Kolkata: 7,
    Hyderabad: 5,
    Bangalore: 3,
    Pune: 2,
  };
  score += cityRisk[worker.city] || 4;

  if (worker.vehicleType === "bicycle") score += 10;
  if (worker.vehicleType === "bike") score += 5;
  if (worker.avgDailyHours >= 10) score += 8;
  if (worker.experienceMonths < 6) score += 10;
  if (summary.volatilityRatio > 0.6) score += 6;
  return Math.max(20, Math.min(95, score));
}

export function previewPolicyFromVerifiedBaseline(
  worker: Worker,
  planTier: string,
  snapshots: WorkerEarningsSnapshot[],
  now = new Date(),
): PolicyPreview {
  const summary = summarizeVerifiedEarnings(worker, snapshots);
  const riskScore = calculateRiskScore(worker, summary);
  const baseRate = BASE_PREMIUM_RATE[planTier] || BASE_PREMIUM_RATE.standard;
  const riskMultiplier = 0.7 + (riskScore / 100) * 0.6;
  const weeklyPremium = roundCurrency(summary.baselineWeeklyEarnings * baseRate * riskMultiplier);
  const maxWeeklyCoverage = roundCurrency(
    weeklyPremium * (COVERAGE_MULTIPLIER[planTier] || COVERAGE_MULTIPLIER.standard),
  );

  const waitingPeriodEndsAt = new Date(
    now.getTime() + WAITING_PERIOD_HOURS * 60 * 60 * 1000,
  ).toISOString();

  return {
    eligible: summary.eligible,
    status: summary.status,
    reasons: summary.reasons,
    weeklyPremium,
    maxWeeklyCoverage,
    baselineWeeklyEarnings: summary.baselineWeeklyEarnings,
    baselineActiveHours: summary.baselineActiveHours,
    baselineHourlyEarnings: summary.baselineHourlyEarnings,
    waitingPeriodEndsAt,
    pricingVersion: "hybrid-v1",
    riskInputsSnapshot: JSON.stringify({
      riskScore,
      verifiedWeeks: summary.verifiedWeeks,
      volatilityRatio: summary.volatilityRatio,
      recentSpikeRatio: summary.recentSpikeRatio,
      vehicleType: worker.vehicleType,
      city: worker.city,
      avgDailyHours: worker.avgDailyHours,
      experienceMonths: worker.experienceMonths,
    }),
  };
}

export function buildEventKey(event: Pick<DisruptionEvent, "city" | "zone" | "triggerType" | "startsAt">) {
  const bucket = new Date(event.startsAt).toISOString().slice(0, 13);
  return `${event.city.toLowerCase()}::${event.zone.toLowerCase()}::${event.triggerType}::${bucket}`;
}

export function durationHours(event: Pick<DisruptionEvent, "startsAt" | "endsAt">) {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  return Math.max(0, roundCurrency((end - start) / (1000 * 60 * 60)));
}

function impactMultiplier(impactLossRatio: number) {
  if (impactLossRatio < 0.2) return 0;
  if (impactLossRatio < 0.4) return 0.4;
  if (impactLossRatio < 0.6) return 0.7;
  return 1.0;
}

export function detectSharedPayoutRisk(
  payoutMethod: WorkerPayoutMethod | undefined,
  allPayoutMethods: WorkerPayoutMethod[],
): FraudSignal[] {
  if (!payoutMethod) return [];

  const linked = allPayoutMethods.filter(
    (method) =>
      method.accountRef === payoutMethod.accountRef && method.workerId !== payoutMethod.workerId,
  );

  if (linked.length === 0) return [];

  return [
    {
      id: `signal-shared-${payoutMethod.workerId}`,
      claimId: "",
      workerId: payoutMethod.workerId,
      signalType: "shared_payout_destination",
      severity: "high",
      notes: `Payout destination is shared with ${linked.length} other worker account(s).`,
      createdAt: new Date(),
    },
  ];
}

export function evaluateClaimForEvent(input: {
  worker: Worker;
  policy: Policy;
  event: DisruptionEvent;
  payoutMethod?: WorkerPayoutMethod;
  snapshots: WorkerEarningsSnapshot[];
  activitySessions: WorkerActivitySession[];
  zoneActivitySessions: WorkerActivitySession[];
  zoneTotalWorkers: number;
  existingClaims: Claim[];
  allPayoutMethods: WorkerPayoutMethod[];
  now?: Date;
}): ClaimEvaluation {
  const now = input.now ?? new Date();
  const summary = summarizeVerifiedEarnings(input.worker, input.snapshots);
  const activityEvidence = evaluateActivityEvidence(input.activitySessions, input.event);
  const zoneActivityStats = computeZoneActivityStats(input.zoneActivitySessions, input.event);
  const fraudFlags: string[] = [];
  let fraudScore = 0;

  const baseBlockedResponse = (
    status: ClaimEvaluation["status"],
    blockReason: string,
    explanation: string,
    extraFraudFlags: string[],
    extraFraudScore: number,
  ): ClaimEvaluation => ({
    status,
    blockReason,
    eventImpactHours: 0,
    approvedCompensationHours: 0,
    impactLossRatio: 0,
    preEventActiveMinutes: activityEvidence.preEventActiveMinutes,
    duringEventActiveMinutes: activityEvidence.duringEventActiveMinutes,
    continuityScore: activityEvidence.continuityScore,
    workProofScore: activityEvidence.workProofScore,
    measuredEarningsDrop: 0,
    measuredActiveHoursDrop: 0,
    payoutAmount: 0,
    fraudScore: extraFraudScore,
    fraudFlags: extraFraudFlags,
    explanation,
  });

  if (!summary.eligible) {
    return baseBlockedResponse(
      "blocked_unverified_baseline",
      "unverified_baseline",
      "Claim blocked because verified earnings history is not sufficient for automated coverage.",
      ["unverified_baseline"],
      30,
    );
  }

  const duplicate = input.existingClaims.find((claim) => claim.eventKey === input.event.eventKey);
  if (duplicate) {
    return baseBlockedResponse(
      "blocked_duplicate_event",
      "duplicate_event",
      "Claim blocked because this worker already has a claim for the same disruption event.",
      ["duplicate_event"],
      25,
    );
  }

  if (new Date(input.policy.waitingPeriodEndsAt).getTime() > new Date(input.event.startsAt).getTime()) {
    return baseBlockedResponse(
      "blocked_waiting_period",
      "waiting_period",
      "Claim blocked because the disruption began inside the policy waiting period.",
      ["waiting_period"],
      35,
    );
  }

  if (
    input.payoutMethod?.riskLockedUntil &&
    new Date(input.payoutMethod.riskLockedUntil).getTime() > now.getTime()
  ) {
    return {
      status: "manual_review",
      blockReason: "payout_method_lock",
      eventImpactHours: 0,
      approvedCompensationHours: 0,
      impactLossRatio: 0,
      preEventActiveMinutes: activityEvidence.preEventActiveMinutes,
      duringEventActiveMinutes: activityEvidence.duringEventActiveMinutes,
      continuityScore: activityEvidence.continuityScore,
      workProofScore: activityEvidence.workProofScore,
      measuredEarningsDrop: 0,
      measuredActiveHoursDrop: 0,
      payoutAmount: 0,
      fraudScore: 55,
      fraudFlags: ["payout_method_lock"],
      explanation:
        "Manual review required because the payout method is inside a post-update risk lock window.",
    };
  }

  if (activityEvidence.lateLogin) {
    return baseBlockedResponse(
      "blocked_opportunistic_login",
      "late_login_after_event",
      "Claim blocked because verified activity started after the disruption began, which matches opportunistic login behavior.",
      ["late_login_after_event"],
      70,
    );
  }

  if (activityEvidence.preEventActiveMinutes < MIN_PRE_EVENT_ACTIVE_MINUTES) {
    return baseBlockedResponse(
      "blocked_pre_event_inactivity",
      "insufficient_pre_event_activity",
      "Claim blocked because the worker did not show enough verified activity before the event start.",
      ["insufficient_pre_event_activity"],
      50,
    );
  }

  if (
    !activityEvidence.overlappedEventStart ||
    activityEvidence.duringEventActiveMinutes < MIN_DURING_EVENT_ACTIVE_MINUTES
  ) {
    return baseBlockedResponse(
      "blocked_activity_continuity",
      "missing_activity_continuity",
      "Claim blocked because the worker was not continuously active across the event start window.",
      ["missing_activity_continuity"],
      58,
    );
  }

  if (activityEvidence.workProofScore < MIN_WORK_PROOF_SCORE) {
    return baseBlockedResponse(
      "blocked_no_work_proof",
      "insufficient_work_proof",
      "Claim blocked because verified work proof signals were too weak to support a disruption payout.",
      ["insufficient_work_proof"],
      42,
    );
  }

  const eventHours = durationHours(input.event);
  const baselineDailyHours = summary.baselineActiveHours / 6;
  const cappedEventHours = Math.min(
    eventHours,
    baselineDailyHours,
    SEVERITY_MAX_HOURS[input.event.severity] || 4,
  );

  const latestImpactSnapshot = getVerifiedSnapshots(input.snapshots).find(
    (snapshot) => new Date(snapshot.weekStart).getTime() <= new Date(input.event.startsAt).getTime(),
  );

  const measuredEarningsDrop =
    latestImpactSnapshot && summary.baselineWeeklyEarnings > 0
      ? roundCurrency(
          Math.max(
            0,
            (summary.baselineWeeklyEarnings - latestImpactSnapshot.grossEarnings) /
              summary.baselineWeeklyEarnings,
          ),
        )
      : 0;
  const measuredActiveHoursDrop =
    latestImpactSnapshot && summary.baselineActiveHours > 0
      ? roundCurrency(
          Math.max(
            0,
            (summary.baselineActiveHours - latestImpactSnapshot.activeHours) /
              summary.baselineActiveHours,
          ),
        )
      : 0;

  const impactLossRatio = roundCurrency(Math.max(measuredEarningsDrop, measuredActiveHoursDrop));

  if (eventHours < SHORT_EVENT_BLOCK_HOURS) {
    return {
      status: "blocked_no_impact",
      blockReason: "short_event",
      eventImpactHours: eventHours,
      approvedCompensationHours: 0,
      impactLossRatio,
      preEventActiveMinutes: activityEvidence.preEventActiveMinutes,
      duringEventActiveMinutes: activityEvidence.duringEventActiveMinutes,
      continuityScore: activityEvidence.continuityScore,
      workProofScore: activityEvidence.workProofScore,
      measuredEarningsDrop,
      measuredActiveHoursDrop,
      payoutAmount: 0,
      fraudScore: 10,
      fraudFlags: ["short_event"],
      explanation: "Claim blocked because the disruption lasted under the minimum payable event duration.",
    };
  }

  const multiplier = impactMultiplier(impactLossRatio);
  if (impactLossRatio < MIN_IMPACT_RATIO || multiplier === 0) {
    return {
      status: "blocked_no_impact",
      blockReason: "no_material_impact",
      eventImpactHours: cappedEventHours,
      approvedCompensationHours: 0,
      impactLossRatio,
      preEventActiveMinutes: activityEvidence.preEventActiveMinutes,
      duringEventActiveMinutes: activityEvidence.duringEventActiveMinutes,
      continuityScore: activityEvidence.continuityScore,
      workProofScore: activityEvidence.workProofScore,
      measuredEarningsDrop,
      measuredActiveHoursDrop,
      payoutAmount: 0,
      fraudScore: 20,
      fraudFlags: ["no_material_impact"],
      explanation:
        "Claim blocked because verified earnings and activity did not fall enough during the event window.",
    };
  }

  const approvedCompensationHours = roundCurrency(cappedEventHours * multiplier);
  const payoutAmount = roundCurrency(
    Math.min(
      approvedCompensationHours * input.policy.baselineHourlyEarnings,
      input.policy.maxWeeklyCoverage,
    ),
  );

  const recentClaims = input.existingClaims.filter((claim) => {
    const diff = now.getTime() - new Date(claim.triggeredAt).getTime();
    return diff <= 7 * 24 * 60 * 60 * 1000;
  });
  if (recentClaims.length >= 2) {
    fraudFlags.push("high_claim_frequency");
    fraudScore += 18;
  }

  if (impactLossRatio < 0.26) {
    fraudFlags.push("borderline_impact");
    fraudScore += 10;
  }

  if (summary.recentSpikeRatio > 1.35) {
    fraudFlags.push("pre_policy_earnings_spike");
    fraudScore += 22;
  }

  const sharedPayoutSignals = detectSharedPayoutRisk(input.payoutMethod, input.allPayoutMethods);
  if (sharedPayoutSignals.length > 0) {
    fraudFlags.push("shared_payout_destination");
    fraudScore += 28;
  }

  const priorOpportunisticBlocks = input.existingClaims.filter((claim) =>
    [
      "late_login_after_event",
      "insufficient_pre_event_activity",
      "missing_activity_continuity",
      "insufficient_work_proof",
    ].includes(claim.blockReason || ""),
  );
  if (priorOpportunisticBlocks.length > 0) {
    fraudFlags.push("repeat_opportunistic_pattern");
    fraudScore += 18;
  }

  if (input.zoneTotalWorkers >= 3 && zoneActivityStats.activeAtEventStart <= 1) {
    fraudFlags.push("isolated_zone_activity");
    fraudScore += 14;
  }

  if (input.zoneTotalWorkers >= 4 && zoneActivityStats.preCommittedWorkers <= 1) {
    fraudFlags.push("low_zone_precommitment");
    fraudScore += 12;
  }

  if (fraudScore >= 45) {
    return {
      status: "manual_review",
      blockReason: null,
      eventImpactHours: cappedEventHours,
      approvedCompensationHours,
      impactLossRatio,
      preEventActiveMinutes: activityEvidence.preEventActiveMinutes,
      duringEventActiveMinutes: activityEvidence.duringEventActiveMinutes,
      continuityScore: activityEvidence.continuityScore,
      workProofScore: activityEvidence.workProofScore,
      measuredEarningsDrop,
      measuredActiveHoursDrop,
      payoutAmount,
      fraudScore: Math.min(100, fraudScore),
      fraudFlags,
      explanation:
        "Manual review required because the claim passed base eligibility but triggered opportunistic-fraud or fraud-cluster heuristics.",
    };
  }

  return {
    status: "approved",
    blockReason: null,
    eventImpactHours: cappedEventHours,
    approvedCompensationHours,
    impactLossRatio,
    preEventActiveMinutes: activityEvidence.preEventActiveMinutes,
    duringEventActiveMinutes: activityEvidence.duringEventActiveMinutes,
    continuityScore: activityEvidence.continuityScore,
    workProofScore: activityEvidence.workProofScore,
    measuredEarningsDrop,
    measuredActiveHoursDrop,
    payoutAmount,
    fraudScore: Math.min(100, fraudScore),
    fraudFlags,
    explanation:
      "Claim approved from verified pre-event work, continuity across the disruption, and measured earnings impact.",
  };
}
