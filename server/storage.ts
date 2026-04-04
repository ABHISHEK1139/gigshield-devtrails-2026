import {
  type Claim,
  type DisruptionEvent,
  type FraudReview,
  type FraudSignal,
  type InsertClaim,
  type InsertDisruptionEvent,
  type InsertFraudReview,
  type InsertFraudSignal,
  type InsertPayout,
  type InsertPolicy,
  type InsertWeatherAlert,
  type InsertWorkerActivitySession,
  type InsertWorker,
  type InsertWorkerEarningsSnapshot,
  type InsertWorkerPayoutMethod,
  type Payout,
  type Policy,
  type WeatherAlert,
  type WorkerActivitySession,
  type Worker,
  type WorkerEarningsSnapshot,
  type WorkerPayoutMethod,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { buildEventKey, evaluateClaimForEvent, previewPolicyFromVerifiedBaseline } from "./hybridEngine";

export interface DashboardStats {
  totalWorkers: number;
  activePolicies: number;
  totalClaims: number;
  totalPayouts: number;
  totalPremiumCollected: number;
  totalClaimsPaid: number;
  lossRatio: number;
  avgFraudScore: number;
  claimsByType: Record<string, number>;
  claimsByStatus: Record<string, number>;
  weeklyTrend: { week: string; premiums: number; claims: number }[];
}

export interface IStorage {
  getWorker(id: string): Promise<Worker | undefined>;
  getWorkerByPhone(phone: string): Promise<Worker | undefined>;
  getAllWorkers(): Promise<Worker[]>;
  createWorker(worker: InsertWorker): Promise<Worker>;
  updateWorkerRiskScore(id: string, score: number): Promise<Worker | undefined>;

  getWorkerEarningsSnapshots(workerId: string): Promise<WorkerEarningsSnapshot[]>;
  importWorkerEarningsSnapshots(
    workerId: string,
    snapshots: InsertWorkerEarningsSnapshot[],
  ): Promise<WorkerEarningsSnapshot[]>;
  getWorkerActivitySessions(workerId: string): Promise<WorkerActivitySession[]>;
  getZoneActivitySessions(
    city: string,
    zone: string,
    from: string,
    to: string,
  ): Promise<WorkerActivitySession[]>;
  importWorkerActivitySessions(
    workerId: string,
    sessions: InsertWorkerActivitySession[],
  ): Promise<WorkerActivitySession[]>;

  getWorkerPayoutMethod(workerId: string): Promise<WorkerPayoutMethod | undefined>;
  getAllWorkerPayoutMethods(): Promise<WorkerPayoutMethod[]>;
  upsertWorkerPayoutMethod(
    workerId: string,
    payoutMethod: InsertWorkerPayoutMethod,
  ): Promise<WorkerPayoutMethod>;

  getPolicy(id: string): Promise<Policy | undefined>;
  getPoliciesByWorker(workerId: string): Promise<Policy[]>;
  getAllPolicies(): Promise<Policy[]>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicyStatus(id: string, status: string): Promise<Policy | undefined>;

  getEvent(id: string): Promise<DisruptionEvent | undefined>;
  getEventByKey(eventKey: string): Promise<DisruptionEvent | undefined>;
  getAllEvents(): Promise<DisruptionEvent[]>;
  createOrUpdateEvent(event: InsertDisruptionEvent & { eventKey?: string }): Promise<DisruptionEvent>;

  getClaim(id: string): Promise<Claim | undefined>;
  getClaimsByWorker(workerId: string): Promise<Claim[]>;
  getClaimsByPolicy(policyId: string): Promise<Claim[]>;
  getAllClaims(): Promise<Claim[]>;
  createClaim(claim: InsertClaim): Promise<Claim>;
  updateClaim(
    id: string,
    updates: Partial<
      Pick<
        Claim,
        | "status"
        | "blockReason"
        | "fraudScore"
        | "fraudFlags"
        | "decisionExplanation"
        | "autoApproved"
        | "processedAt"
        | "payoutAmount"
        | "approvedCompensationHours"
        | "eventImpactHours"
        | "impactLossRatio"
        | "preEventActiveMinutes"
        | "duringEventActiveMinutes"
        | "continuityScore"
        | "workProofScore"
        | "measuredEarningsDrop"
        | "measuredActiveHoursDrop"
      >
    >,
  ): Promise<Claim | undefined>;

  getFraudSignalsByClaim(claimId: string): Promise<FraudSignal[]>;
  createFraudSignals(signals: InsertFraudSignal[]): Promise<FraudSignal[]>;
  getFraudReviewsByClaim(claimId: string): Promise<FraudReview[]>;
  createFraudReview(review: InsertFraudReview): Promise<FraudReview>;

  getActiveAlerts(): Promise<WeatherAlert[]>;
  getAlertsByCity(city: string): Promise<WeatherAlert[]>;
  createAlert(alert: InsertWeatherAlert): Promise<WeatherAlert>;
  resolveAlert(id: string): Promise<WeatherAlert | undefined>;

  getPayoutsByClaim(claimId: string): Promise<Payout[]>;
  getPayoutsByWorker(workerId: string): Promise<Payout[]>;
  getAllPayouts(): Promise<Payout[]>;
  createPayout(payout: InsertPayout): Promise<Payout>;
  updatePayoutStatus(id: string, status: string, txId?: string): Promise<Payout | undefined>;

  getDashboardStats(): Promise<DashboardStats>;
}

function isoDate(daysOffset: number) {
  return new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000).toISOString();
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1);
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function createWeekRange(weeksAgo: number) {
  const now = new Date();
  const start = startOfWeek(now);
  start.setDate(start.getDate() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { weekStart: start.toISOString(), weekEnd: end.toISOString() };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export class MemStorage implements IStorage {
  private workers = new Map<string, Worker>();
  private earningsSnapshots = new Map<string, WorkerEarningsSnapshot>();
  private activitySessions = new Map<string, WorkerActivitySession>();
  private payoutMethods = new Map<string, WorkerPayoutMethod>();
  private policies = new Map<string, Policy>();
  private events = new Map<string, DisruptionEvent>();
  private claims = new Map<string, Claim>();
  private fraudSignals = new Map<string, FraudSignal>();
  private fraudReviews = new Map<string, FraudReview>();
  private alerts = new Map<string, WeatherAlert>();
  private payouts = new Map<string, Payout>();

  constructor() {
    this.seedData();
  }

  private seedData() {
    const workerData: Array<{
      name: string;
      phone: string;
      email: string;
      platform: string;
      city: string;
      zone: string;
      vehicleType: string;
      avgWeeklyEarnings: number;
      avgDailyHours: number;
      experienceMonths: number;
      riskScore: number;
    }> = [
      {
        name: "Rajesh Kumar",
        phone: "9876543210",
        email: "rajesh@mail.com",
        platform: "zomato",
        city: "Delhi",
        zone: "South Delhi",
        vehicleType: "bike",
        avgWeeklyEarnings: 4500,
        avgDailyHours: 10,
        experienceMonths: 24,
        riskScore: 62,
      },
      {
        name: "Amit Sharma",
        phone: "9876543211",
        email: "amit@mail.com",
        platform: "swiggy",
        city: "Mumbai",
        zone: "Andheri",
        vehicleType: "bike",
        avgWeeklyEarnings: 5200,
        avgDailyHours: 11,
        experienceMonths: 36,
        riskScore: 58,
      },
      {
        name: "Priya Singh",
        phone: "9876543212",
        email: "priya@mail.com",
        platform: "zepto",
        city: "Bangalore",
        zone: "Koramangala",
        vehicleType: "ev",
        avgWeeklyEarnings: 3800,
        avgDailyHours: 8,
        experienceMonths: 12,
        riskScore: 40,
      },
      {
        name: "Kavita Devi",
        phone: "9876543214",
        email: "kavita@mail.com",
        platform: "swiggy",
        city: "Hyderabad",
        zone: "Madhapur",
        vehicleType: "bike",
        avgWeeklyEarnings: 4100,
        avgDailyHours: 10,
        experienceMonths: 18,
        riskScore: 54,
      },
    ];

    const workerIds: string[] = [];

    workerData.forEach((item, index) => {
      const id = randomUUID();
      workerIds.push(id);
      this.workers.set(id, {
        ...item,
        id,
        createdAt: new Date(Date.now() - (25 - index) * 24 * 60 * 60 * 1000),
      });
    });

    workerIds.forEach((workerId, index) => {
      const worker = this.workers.get(workerId)!;
      const base = worker.avgWeeklyEarnings;
      const hours = worker.avgDailyHours * 6;
      const weeklySeries =
        index === 0
          ? [4450, 4520, 4480, 4550, 4510, 4380, 2800, 2650]
          : index === 1
            ? [5200, 5180, 5225, 5300, 5280, 5250, 4980, 4940]
            : index === 2
              ? [3700, 3740, 3810, 3790, 3825, 3780, 3650, 3600]
              : [3980, 4050, 4120, 4060, 4080, 6100, 6000, 2750];

      weeklySeries.forEach((grossEarnings, weekIndex) => {
        const activeHours = roundCurrency(hours * (grossEarnings / base));
        const { weekStart, weekEnd } = createWeekRange(8 - weekIndex);
        const snapshotId = randomUUID();
        this.earningsSnapshots.set(snapshotId, {
          id: snapshotId,
          workerId,
          weekStart,
          weekEnd,
          grossEarnings,
          activeHours,
          completedOrders: Math.max(20, Math.round(grossEarnings / 65)),
          source: "admin_import",
          verificationStatus: "verified",
          notes: null,
          createdAt: new Date(weekEnd),
        });
      });
    });

    workerIds.forEach((workerId, index) => {
      const methodId = randomUUID();
      const sharedRef = index === 3 ? "upi@shared-risk" : `upi@worker-${index + 1}`;
      this.payoutMethods.set(methodId, {
        id: methodId,
        workerId,
        method: "upi",
        label: "Primary UPI",
        accountRef: sharedRef,
        verificationStatus: "verified",
        lastUpdatedAt: isoDate(-(index + 5)),
        riskLockedUntil: index === 3 ? isoDate(2) : null,
        createdAt: new Date(Date.now() - (15 - index) * 24 * 60 * 60 * 1000),
      });
    });

    workerIds.forEach((workerId, index) => {
      const worker = this.workers.get(workerId)!;
      const snapshots = Array.from(this.earningsSnapshots.values()).filter(
        (snapshot) => snapshot.workerId === workerId,
      );
      const preview = previewPolicyFromVerifiedBaseline(
        worker,
        index === 2 ? "basic" : "standard",
        snapshots,
        new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      );

      const policyId = randomUUID();
      this.policies.set(policyId, {
        id: policyId,
        workerId,
        planTier: index === 2 ? "basic" : "standard",
        weeklyPremium: preview.weeklyPremium,
        maxWeeklyCoverage: preview.maxWeeklyCoverage,
        coverageTypes:
          index === 2
            ? ["extreme_heat", "heavy_rain"]
            : ["extreme_heat", "heavy_rain", "flood", "pollution"],
        status: "active",
        underwritingStatus: preview.status,
        underwritingNotes: preview.reasons.join(" ") || null,
        baselineWeeklyEarnings: preview.baselineWeeklyEarnings,
        baselineHourlyEarnings: preview.baselineHourlyEarnings,
        baselineActiveHours: preview.baselineActiveHours,
        pricingVersion: preview.pricingVersion,
        riskInputsSnapshot: preview.riskInputsSnapshot,
        startDate: isoDate(-6),
        waitingPeriodEndsAt: isoDate(-3),
        endDate: null,
        autoRenew: true,
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      });
    });

    const eventSeeds: Array<Omit<InsertDisruptionEvent, "eventKey">> = [
      {
        city: "Delhi",
        zone: "South Delhi",
        triggerType: "extreme_heat",
        severity: "extreme",
        source: "weather",
        triggerValue: "46 C",
        threshold: "42 C",
        verificationPayload: JSON.stringify({ temperature: 46, source: "open-meteo" }),
        startsAt: isoDate(-2),
        endsAt: isoDate(-2 + 0.25),
      },
      {
        city: "Mumbai",
        zone: "Andheri",
        triggerType: "heavy_rain",
        severity: "severe",
        source: "weather",
        triggerValue: "84mm/hr",
        threshold: "65mm/hr",
        verificationPayload: JSON.stringify({ rainfall: 84, source: "open-meteo" }),
        startsAt: isoDate(-1),
        endsAt: isoDate(-1 + 0.12),
      },
      {
        city: "Hyderabad",
        zone: "Madhapur",
        triggerType: "extreme_heat",
        severity: "severe",
        source: "weather",
        triggerValue: "43 C",
        threshold: "42 C",
        verificationPayload: JSON.stringify({ temperature: 43, source: "open-meteo" }),
        startsAt: isoDate(-1),
        endsAt: isoDate(-1 + 0.18),
      },
    ];

    eventSeeds.forEach((seed) => {
      const eventKey = buildEventKey({
        city: seed.city,
        zone: seed.zone,
        triggerType: seed.triggerType,
        startsAt: seed.startsAt,
      });
      const id = randomUUID();
      const event: DisruptionEvent = {
        id,
        ...seed,
        eventKey,
        source: seed.source ?? "weather",
        verificationPayload: seed.verificationPayload ?? "{}",
        isActive: false,
        createdAt: new Date(seed.startsAt),
      };
      this.events.set(id, event);
      const alertId = randomUUID();
      this.alerts.set(alertId, {
        id: alertId,
        city: seed.city,
        zone: seed.zone,
        alertType: seed.triggerType,
        severity: seed.severity,
        value: seed.triggerValue,
        threshold: seed.threshold,
        isActive: false,
        triggeredAt: seed.startsAt,
        resolvedAt: seed.endsAt,
      });
    });

    const delhiEvent = Array.from(this.events.values()).find(
      (event) => event.city === "Delhi" && event.zone === "South Delhi",
    );
    const mumbaiEvent = Array.from(this.events.values()).find(
      (event) => event.city === "Mumbai" && event.zone === "Andheri",
    );
    const hyderabadEvent = Array.from(this.events.values()).find(
      (event) => event.city === "Hyderabad" && event.zone === "Madhapur",
    );

    const activitySeeds: Array<InsertWorkerActivitySession> = [];
    const rajeshId = workerIds[0];
    const amitId = workerIds[1];
    const priyaId = workerIds[2];
    const kavitaId = workerIds[3];

    if (delhiEvent) {
      const eventStart = new Date(delhiEvent.startsAt);
      activitySeeds.push({
        workerId: rajeshId,
        startedAt: addMinutes(eventStart, -95).toISOString(),
        endedAt: addMinutes(eventStart, 70).toISOString(),
        onlineMinutes: 165,
        activeMinutes: 140,
        ordersCompleted: 4,
        distanceKm: 19.5,
        source: "admin_import",
        verificationStatus: "verified",
        notes: "Verified delivery activity spanning the event onset",
      });
      activitySeeds.push({
        workerId: rajeshId,
        startedAt: addMinutes(eventStart, -24 * 60).toISOString(),
        endedAt: addMinutes(eventStart, -24 * 60 + 180).toISOString(),
        onlineMinutes: 180,
        activeMinutes: 150,
        ordersCompleted: 5,
        distanceKm: 22.1,
        source: "admin_import",
        verificationStatus: "verified",
        notes: "Historical normal shift",
      });
    }

    if (mumbaiEvent) {
      const eventStart = new Date(mumbaiEvent.startsAt);
      activitySeeds.push({
        workerId: amitId,
        startedAt: addMinutes(eventStart, -80).toISOString(),
        endedAt: addMinutes(eventStart, 55).toISOString(),
        onlineMinutes: 135,
        activeMinutes: 118,
        ordersCompleted: 5,
        distanceKm: 17.2,
        source: "admin_import",
        verificationStatus: "verified",
        notes: "Verified activity before heavy rain event",
      });
    }

    if (hyderabadEvent) {
      const eventStart = new Date(hyderabadEvent.startsAt);
      activitySeeds.push({
        workerId: kavitaId,
        startedAt: addMinutes(eventStart, -88).toISOString(),
        endedAt: addMinutes(eventStart, 65).toISOString(),
        onlineMinutes: 153,
        activeMinutes: 122,
        ordersCompleted: 3,
        distanceKm: 15.4,
        source: "admin_import",
        verificationStatus: "verified",
        notes: "Verified activity with payout rail under lock",
      });
    }

    activitySeeds.push({
      workerId: priyaId,
      startedAt: isoDate(-2),
      endedAt: isoDate(-2 + 0.08),
      onlineMinutes: 115,
      activeMinutes: 92,
      ordersCompleted: 3,
      distanceKm: 12.2,
      source: "admin_import",
      verificationStatus: "verified",
      notes: "Baseline activity sample",
    });

    activitySeeds.forEach((session) => {
      const id = randomUUID();
      this.activitySessions.set(id, {
        ...session,
        id,
        ordersCompleted: session.ordersCompleted ?? 0,
        distanceKm: session.distanceKm ?? 0,
        source: session.source ?? "admin_import",
        verificationStatus: session.verificationStatus ?? "verified",
        notes: session.notes ?? null,
        createdAt: new Date(),
      });
    });

    for (const event of Array.from(this.events.values())) {
      const affectedWorkers = Array.from(this.workers.values()).filter(
        (worker) => worker.city === event.city,
      );

      for (const worker of affectedWorkers) {
        const policy = Array.from(this.policies.values()).find(
          (item) => item.workerId === worker.id && item.coverageTypes.includes(event.triggerType),
        );
        if (!policy) continue;

        const payoutMethod = Array.from(this.payoutMethods.values()).find(
          (method) => method.workerId === worker.id,
        );
        const snapshots = Array.from(this.earningsSnapshots.values()).filter(
          (snapshot) => snapshot.workerId === worker.id,
        );
        const activitySessions = Array.from(this.activitySessions.values()).filter(
          (session) => session.workerId === worker.id,
        );
        const existingClaims = Array.from(this.claims.values()).filter(
          (claim) => claim.workerId === worker.id,
        );
        const zoneWorkers = Array.from(this.workers.values()).filter(
          (candidate) => candidate.city === worker.city && candidate.zone === worker.zone,
        );
        const zoneActivitySessions = Array.from(this.activitySessions.values()).filter((session) => {
          const sessionWorker = this.workers.get(session.workerId);
          return sessionWorker?.city === worker.city && sessionWorker.zone === worker.zone;
        });

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
          allPayoutMethods: Array.from(this.payoutMethods.values()),
        });

        const claimId = randomUUID();
        const claimStatus =
          evaluation.status === "approved" && worker.city === "Delhi"
            ? "paid"
            : evaluation.status;

        const claim: Claim = {
          id: claimId,
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
          payoutAmount: evaluation.status === "approved" || claimStatus === "paid" ? evaluation.payoutAmount : 0,
          status: claimStatus as Claim["status"],
          blockReason: evaluation.blockReason,
          fraudScore: evaluation.fraudScore,
          fraudFlags: evaluation.fraudFlags.length > 0 ? evaluation.fraudFlags : null,
          decisionExplanation: evaluation.explanation,
          autoApproved: evaluation.status === "approved",
          triggeredAt: event.startsAt,
          processedAt: isoDate(-1),
          createdAt: new Date(event.startsAt),
        };
        this.claims.set(claimId, claim);

        if (evaluation.fraudFlags.length > 0) {
          evaluation.fraudFlags.forEach((flag) => {
            const signalId = randomUUID();
            this.fraudSignals.set(signalId, {
              id: signalId,
              claimId,
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
              createdAt: new Date(),
            });
          });
        }

        if (claimStatus === "paid") {
          const payoutId = randomUUID();
          this.payouts.set(payoutId, {
            id: payoutId,
            claimId,
            workerId: worker.id,
            payoutMethodId: payoutMethod?.id ?? null,
            amount: claim.payoutAmount,
            method: payoutMethod?.method ?? "upi",
            status: "completed",
            idempotencyKey: `seed-${claimId}`,
            transactionId: `TXN${Date.now().toString(36).toUpperCase()}${Math.random()
              .toString(36)
              .slice(2, 6)
              .toUpperCase()}`,
            createdAt: new Date(),
          });
        }
      }
    }
  }

  async getWorker(id: string) {
    return this.workers.get(id);
  }

  async getWorkerByPhone(phone: string) {
    return Array.from(this.workers.values()).find((worker) => worker.phone === phone);
  }

  async getAllWorkers() {
    return Array.from(this.workers.values());
  }

  async createWorker(worker: InsertWorker): Promise<Worker> {
    const id = randomUUID();
    const created: Worker = {
      ...worker,
      id,
      email: worker.email ?? null,
      riskScore: null,
      createdAt: new Date(),
    };
    this.workers.set(id, created);
    return created;
  }

  async updateWorkerRiskScore(id: string, score: number) {
    const worker = this.workers.get(id);
    if (!worker) return undefined;
    worker.riskScore = score;
    return worker;
  }

  async getWorkerEarningsSnapshots(workerId: string) {
    return Array.from(this.earningsSnapshots.values()).filter((snapshot) => snapshot.workerId === workerId);
  }

  async importWorkerEarningsSnapshots(workerId: string, snapshots: InsertWorkerEarningsSnapshot[]) {
    const imported: WorkerEarningsSnapshot[] = [];
    for (const snapshot of snapshots) {
      const id = randomUUID();
      const created: WorkerEarningsSnapshot = {
        ...snapshot,
        id,
        workerId,
        completedOrders: snapshot.completedOrders ?? null,
        source: snapshot.source ?? "admin_import",
        verificationStatus: snapshot.verificationStatus ?? "verified",
        notes: snapshot.notes ?? null,
        createdAt: new Date(),
      };
      this.earningsSnapshots.set(id, created);
      imported.push(created);
    }
    return imported;
  }

  async getWorkerActivitySessions(workerId: string) {
    return Array.from(this.activitySessions.values())
      .filter((session) => session.workerId === workerId)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  }

  async getZoneActivitySessions(city: string, zone: string, from: string, to: string) {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    const eligibleWorkerIds = new Set(
      Array.from(this.workers.values())
        .filter((worker) => worker.city === city && worker.zone === zone)
        .map((worker) => worker.id),
    );

    return Array.from(this.activitySessions.values()).filter((session) => {
      if (!eligibleWorkerIds.has(session.workerId)) return false;
      const sessionStart = new Date(session.startedAt).getTime();
      const sessionEnd = new Date(session.endedAt).getTime();
      return sessionEnd >= fromTime && sessionStart <= toTime;
    });
  }

  async importWorkerActivitySessions(workerId: string, sessions: InsertWorkerActivitySession[]) {
    const imported: WorkerActivitySession[] = [];
    for (const session of sessions) {
      const id = randomUUID();
      const created: WorkerActivitySession = {
        ...session,
        id,
        workerId,
        ordersCompleted: session.ordersCompleted ?? 0,
        distanceKm: session.distanceKm ?? 0,
        source: session.source ?? "admin_import",
        verificationStatus: session.verificationStatus ?? "verified",
        notes: session.notes ?? null,
        createdAt: new Date(),
      };
      this.activitySessions.set(id, created);
      imported.push(created);
    }
    return imported;
  }

  async getWorkerPayoutMethod(workerId: string) {
    return Array.from(this.payoutMethods.values()).find((method) => method.workerId === workerId);
  }

  async getAllWorkerPayoutMethods() {
    return Array.from(this.payoutMethods.values());
  }

  async upsertWorkerPayoutMethod(workerId: string, payoutMethod: InsertWorkerPayoutMethod) {
    const existing = await this.getWorkerPayoutMethod(workerId);
    if (existing) {
      existing.method = payoutMethod.method ?? "upi";
      existing.label = payoutMethod.label;
      existing.accountRef = payoutMethod.accountRef;
      existing.verificationStatus = payoutMethod.verificationStatus ?? "verified";
      existing.lastUpdatedAt = payoutMethod.lastUpdatedAt;
      existing.riskLockedUntil = payoutMethod.riskLockedUntil ?? null;
      return existing;
    }

    const id = randomUUID();
      const created: WorkerPayoutMethod = {
        ...payoutMethod,
        id,
        workerId,
        method: payoutMethod.method ?? "upi",
        verificationStatus: payoutMethod.verificationStatus ?? "verified",
        riskLockedUntil: payoutMethod.riskLockedUntil ?? null,
        createdAt: new Date(),
      };
    this.payoutMethods.set(id, created);
    return created;
  }

  async getPolicy(id: string) {
    return this.policies.get(id);
  }

  async getPoliciesByWorker(workerId: string) {
    return Array.from(this.policies.values()).filter((policy) => policy.workerId === workerId);
  }

  async getAllPolicies() {
    return Array.from(this.policies.values());
  }

  async createPolicy(policy: InsertPolicy): Promise<Policy> {
    const id = randomUUID();
      const created: Policy = {
        ...policy,
        id,
        status: "active",
        underwritingStatus: policy.underwritingStatus ?? "eligible",
        underwritingNotes: policy.underwritingNotes ?? null,
        pricingVersion: policy.pricingVersion ?? "hybrid-v1",
        riskInputsSnapshot: policy.riskInputsSnapshot ?? "{}",
        endDate: policy.endDate ?? null,
        autoRenew: policy.autoRenew ?? true,
        createdAt: new Date(),
    };
    this.policies.set(id, created);
    return created;
  }

  async updatePolicyStatus(id: string, status: string) {
    const policy = this.policies.get(id);
    if (!policy) return undefined;
    policy.status = status;
    return policy;
  }

  async getEvent(id: string) {
    return this.events.get(id);
  }

  async getEventByKey(eventKey: string) {
    return Array.from(this.events.values()).find((event) => event.eventKey === eventKey);
  }

  async getAllEvents() {
    return Array.from(this.events.values()).sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  }

  async createOrUpdateEvent(event: InsertDisruptionEvent & { eventKey?: string }) {
    const eventKey =
      event.eventKey ||
      buildEventKey({
        city: event.city,
        zone: event.zone,
        triggerType: event.triggerType,
        startsAt: event.startsAt,
      });

    const existing = await this.getEventByKey(eventKey);
    if (existing) {
      existing.endsAt = event.endsAt;
      existing.triggerValue = event.triggerValue;
      existing.threshold = event.threshold;
      existing.severity = event.severity;
      existing.source = event.source ?? "weather";
      existing.verificationPayload = event.verificationPayload ?? "{}";
      existing.isActive = false;
      return existing;
    }

    const id = randomUUID();
    const created: DisruptionEvent = {
      ...event,
      id,
      eventKey,
      source: event.source ?? "weather",
      verificationPayload: event.verificationPayload ?? "{}",
      isActive: false,
      createdAt: new Date(),
    };
    this.events.set(id, created);
    return created;
  }

  async getClaim(id: string) {
    return this.claims.get(id);
  }

  async getClaimsByWorker(workerId: string) {
    return Array.from(this.claims.values()).filter((claim) => claim.workerId === workerId);
  }

  async getClaimsByPolicy(policyId: string) {
    return Array.from(this.claims.values()).filter((claim) => claim.policyId === policyId);
  }

  async getAllClaims() {
    return Array.from(this.claims.values()).sort(
      (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
    );
  }

  async createClaim(claim: InsertClaim): Promise<Claim> {
    const id = randomUUID();
      const created: Claim = {
        ...claim,
        id,
        eventId: claim.eventId ?? null,
        eventKey: claim.eventKey ?? null,
        eventImpactHours: claim.eventImpactHours ?? 0,
        approvedCompensationHours: claim.approvedCompensationHours ?? 0,
        impactLossRatio: claim.impactLossRatio ?? 0,
        preEventActiveMinutes: claim.preEventActiveMinutes ?? 0,
        duringEventActiveMinutes: claim.duringEventActiveMinutes ?? 0,
        continuityScore: claim.continuityScore ?? 0,
        workProofScore: claim.workProofScore ?? 0,
        measuredEarningsDrop: claim.measuredEarningsDrop ?? 0,
        measuredActiveHoursDrop: claim.measuredActiveHoursDrop ?? 0,
        status: "manual_review",
      blockReason: null,
      fraudScore: null,
      fraudFlags: null,
      decisionExplanation: null,
      autoApproved: false,
      processedAt: null,
      createdAt: new Date(),
    };
    this.claims.set(id, created);
    return created;
  }

  async updateClaim(id: string, updates: Parameters<IStorage["updateClaim"]>[1]) {
    const claim = this.claims.get(id);
    if (!claim) return undefined;
    Object.assign(claim, updates);
    return claim;
  }

  async getFraudSignalsByClaim(claimId: string) {
    return Array.from(this.fraudSignals.values()).filter((signal) => signal.claimId === claimId);
  }

  async createFraudSignals(signals: InsertFraudSignal[]) {
    const created: FraudSignal[] = [];
    for (const signal of signals) {
      const id = randomUUID();
      const fraudSignal: FraudSignal = {
        ...signal,
        id,
        severity: signal.severity ?? "medium",
        createdAt: new Date(),
      };
      this.fraudSignals.set(id, fraudSignal);
      created.push(fraudSignal);
    }
    return created;
  }

  async getFraudReviewsByClaim(claimId: string) {
    return Array.from(this.fraudReviews.values()).filter((review) => review.claimId === claimId);
  }

  async createFraudReview(review: InsertFraudReview) {
    const id = randomUUID();
    const created: FraudReview = {
      ...review,
      id,
      notes: review.notes ?? null,
      createdAt: new Date(),
    };
    this.fraudReviews.set(id, created);
    return created;
  }

  async getActiveAlerts() {
    return Array.from(this.alerts.values()).filter((alert) => alert.isActive);
  }

  async getAlertsByCity(city: string) {
    return Array.from(this.alerts.values()).filter((alert) => alert.city === city);
  }

  async createAlert(alert: InsertWeatherAlert) {
    const id = randomUUID();
    const created: WeatherAlert = {
      ...alert,
      id,
      isActive: true,
      resolvedAt: null,
    };
    this.alerts.set(id, created);
    return created;
  }

  async resolveAlert(id: string) {
    const alert = this.alerts.get(id);
    if (!alert) return undefined;
    alert.isActive = false;
    alert.resolvedAt = new Date().toISOString();
    return alert;
  }

  async getPayoutsByClaim(claimId: string) {
    return Array.from(this.payouts.values()).filter((payout) => payout.claimId === claimId);
  }

  async getPayoutsByWorker(workerId: string) {
    return Array.from(this.payouts.values()).filter((payout) => payout.workerId === workerId);
  }

  async getAllPayouts() {
    return Array.from(this.payouts.values());
  }

  async createPayout(payout: InsertPayout) {
    const id = randomUUID();
    const created: Payout = {
      ...payout,
      id,
      payoutMethodId: payout.payoutMethodId ?? null,
      method: payout.method ?? "upi",
      status: "processing",
      transactionId: null,
      createdAt: new Date(),
    };
    this.payouts.set(id, created);
    return created;
  }

  async updatePayoutStatus(id: string, status: string, txId?: string) {
    const payout = this.payouts.get(id);
    if (!payout) return undefined;
    payout.status = status;
    if (txId) payout.transactionId = txId;
    return payout;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const policies = Array.from(this.policies.values());
    const claims = Array.from(this.claims.values());
    const payouts = Array.from(this.payouts.values());
    const activePolicies = policies.filter((policy) => policy.status === "active");
    const claimsByType: Record<string, number> = {};
    const claimsByStatus: Record<string, number> = {};

    claims.forEach((claim) => {
      claimsByType[claim.triggerType] = (claimsByType[claim.triggerType] || 0) + 1;
      claimsByStatus[claim.status] = (claimsByStatus[claim.status] || 0) + 1;
    });

    const totalPremiumCollected = activePolicies.reduce(
      (sum, policy) => sum + policy.weeklyPremium * 2,
      0,
    );
    const totalClaimsPaid = payouts.reduce((sum, payout) => sum + payout.amount, 0);
    const avgFraudScore =
      claims.reduce((sum, claim) => sum + (claim.fraudScore || 0), 0) / Math.max(claims.length, 1);

    const weeklyMap = new Map<string, { premiums: number; claims: number }>();
    activePolicies.forEach((policy) => {
      const key = policy.startDate.slice(0, 10);
      const current = weeklyMap.get(key) || { premiums: 0, claims: 0 };
      current.premiums += policy.weeklyPremium;
      weeklyMap.set(key, current);
    });
    claims.forEach((claim) => {
      const key = claim.triggeredAt.slice(0, 10);
      const current = weeklyMap.get(key) || { premiums: 0, claims: 0 };
      current.claims += claim.payoutAmount;
      weeklyMap.set(key, current);
    });

    const weeklyTrend = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-4)
      .map(([week, values]) => ({
        week,
        premiums: roundCurrency(values.premiums),
        claims: roundCurrency(values.claims),
      }));

    return {
      totalWorkers: this.workers.size,
      activePolicies: activePolicies.length,
      totalClaims: claims.length,
      totalPayouts: payouts.length,
      totalPremiumCollected: roundCurrency(totalPremiumCollected),
      totalClaimsPaid: roundCurrency(totalClaimsPaid),
      lossRatio: totalPremiumCollected > 0 ? roundCurrency(totalClaimsPaid / totalPremiumCollected) : 0,
      avgFraudScore: roundCurrency(avgFraudScore),
      claimsByType,
      claimsByStatus,
      weeklyTrend,
    };
  }
}

export const storage = new MemStorage();
