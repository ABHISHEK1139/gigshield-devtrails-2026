import type { Express, Response } from "express";
import { type Server } from "http";
import { z } from "zod";
import {
  insertWorkerActivitySessionSchema,
  insertWorkerSchema,
  insertWorkerEarningsSnapshotSchema,
  type Worker,
  type WorkerActivitySession,
} from "@shared/schema";
import { storage } from "./storage";
import {
  checkWeatherTriggers,
  detectTriggeredThresholds,
  fetchAllCitiesWeather,
  fetchWeatherByCoordinates,
  findNearestMonitoredCity,
} from "./weatherService";
import {
  createWorkerInvite,
  loginHandler,
  logoutHandler,
  meHandler,
  provisionWorkerIdentity,
  requireAdmin,
  requireWorker,
  sessionHandler,
  workerActivateHandler,
  workerLoginHandler,
  logAudit,
  getAuditLog,
} from "./auth";
import { previewPolicyFromVerifiedBaseline, summarizeVerifiedEarnings } from "./hybridEngine";
import {
  recomputeClaimsFromTriggers,
  recomputeClaimsForEvent,
  SIMULATION_SCENARIO_KEYS,
  seedSyntheticImpactForWorker,
  upsertEventFromTrigger,
  weatherToTrigger,
} from "./disruptionWorkflow";
import { getCronStatus } from "./weatherCron";

const PLAN_COVERAGE: Record<string, string[]> = {
  basic: ["extreme_heat", "heavy_rain"],
  standard: ["extreme_heat", "heavy_rain", "flood", "pollution"],
  premium: ["extreme_heat", "heavy_rain", "flood", "pollution", "curfew", "strike"],
};

let simulationRunSequence = 0;

function shapeError(code: string, message: string, details?: unknown) {
  return { code, message, details };
}

function getSchedulerMode() {
  if (process.env.RUN_SCHEDULER === "true") {
    return "dedicated-scheduler";
  }

  return process.env.NODE_ENV === "production"
    ? "manual-or-external"
    : "inline-development";
}

async function getWorkerOrRespond(res: Response, workerId: string): Promise<Worker | undefined> {
  const worker = await storage.getWorker(workerId);
  if (!worker) {
    res.status(404).json(shapeError("WORKER_NOT_FOUND", "Worker not found."));
    return undefined;
  }

  return worker;
}

function summarizeActivitySessions(sessions: WorkerActivitySession[]) {
  const totals = sessions.reduce(
    (acc, session) => {
      acc.onlineMinutes += session.onlineMinutes;
      acc.activeMinutes += session.activeMinutes;
      acc.ordersCompleted += session.ordersCompleted ?? 0;
      acc.distanceKm += session.distanceKm ?? 0;
      return acc;
    },
    { onlineMinutes: 0, activeMinutes: 0, ordersCompleted: 0, distanceKm: 0 },
  );

  return {
    totals,
    sessionCount: sessions.length,
    latestSessionAt: sessions.length ? sessions[sessions.length - 1].endedAt : null,
  };
}

function nextSimulationTime() {
  simulationRunSequence += 1;
  return new Date(Date.now() + simulationRunSequence * 8 * 60 * 60 * 1000);
}

function severityRank(severity: string) {
  if (severity === "extreme") return 3;
  if (severity === "severe") return 2;
  return 1;
}

export async function registerRoutes(_httpServer: Server, app: Express): Promise<Server> {
  app.get("/health/live", async (_req, res) => {
    res.json({ ok: true, service: "gigshield-web", now: new Date().toISOString() });
  });

  app.get("/health/ready", async (_req, res) => {
    const workerCount = (await storage.getAllWorkers()).length;
    res.json({
      ok: true,
      service: "gigshield-web",
      workerCount,
      schedulerMode: getSchedulerMode(),
    });
  });

  app.post("/api/auth/login", loginHandler);
  app.post("/api/auth/worker/login", workerLoginHandler);
  app.post("/api/auth/worker/activate", workerActivateHandler);
  app.post("/api/auth/logout", logoutHandler);
  app.get("/api/auth/session", sessionHandler);
  app.get("/api/auth/me", meHandler);

  app.get("/api/admin/audit-log", requireAdmin, async (_req, res) => {
    res.json(getAuditLog());
  });

  app.get("/api/admin/workers", requireAdmin, async (_req, res) => {
    res.json(await storage.getAllWorkers());
  });

  app.post("/api/admin/workers", requireAdmin, async (req, res) => {
    const schema = insertWorkerSchema.extend({
      payoutAccountRef: z.string().min(3).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_WORKER", "Worker payload is invalid.", parsed.error.flatten()));
    }

    const worker = await storage.createWorker(parsed.data);
    provisionWorkerIdentity({
      workerId: worker.id,
      phone: worker.phone,
      displayName: worker.name,
    });
    await storage.upsertWorkerPayoutMethod(worker.id, {
      workerId: worker.id,
      method: "upi",
      label: "Primary UPI",
      accountRef: parsed.data.payoutAccountRef || `upi@${worker.phone.slice(-4)}`,
      verificationStatus: "verified",
      lastUpdatedAt: new Date().toISOString(),
      riskLockedUntil: null,
    });
    logAudit(req, "CREATE_WORKER", worker.id, "success", worker.name);
    res.status(201).json(worker);
  });

  app.post("/api/admin/workers/:id/invite", requireAdmin, async (req, res) => {
    const worker = await getWorkerOrRespond(res, String(req.params.id));
    if (!worker) {
      return;
    }

    provisionWorkerIdentity({
      workerId: worker.id,
      phone: worker.phone,
      displayName: worker.name,
    });
    const invite = createWorkerInvite(worker.id);
    const activationUrl = `${req.protocol}://${req.get("host")}/activate?token=${invite.token}`;
    logAudit(req, "CREATE_WORKER_INVITE", worker.id, "success");
    res.status(201).json({
      ...invite,
      activationUrl,
    });
  });

  app.get("/api/admin/workers/:id/earnings-summary", requireAdmin, async (req, res) => {
    const worker = await getWorkerOrRespond(res, String(req.params.id));
    if (!worker) {
      return;
    }

    const snapshots = await storage.getWorkerEarningsSnapshots(worker.id);
    const summary = summarizeVerifiedEarnings(worker, snapshots);
    const payoutMethod = await storage.getWorkerPayoutMethod(worker.id);
    res.json({ worker, summary, payoutMethod, snapshots });
  });

  app.get("/api/admin/workers/:id/activity-summary", requireAdmin, async (req, res) => {
    const worker = await getWorkerOrRespond(res, String(req.params.id));
    if (!worker) {
      return;
    }

    const sessions = await storage.getWorkerActivitySessions(worker.id);
    const summary = summarizeActivitySessions(sessions);

    res.json({
      worker,
      ...summary,
      sessions,
    });
  });

  app.post("/api/admin/workers/:id/earnings-import", requireAdmin, async (req, res) => {
    const worker = await getWorkerOrRespond(res, String(req.params.id));
    if (!worker) {
      return;
    }

    const snapshotSchema = insertWorkerEarningsSnapshotSchema
      .omit({ workerId: true })
      .extend({
        completedOrders: z.number().int().nonnegative().optional(),
        notes: z.string().optional(),
      });
    const payloadSchema = z.object({
      snapshots: z.array(snapshotSchema).min(1),
    });
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_EARNINGS_IMPORT", "Invalid earnings import payload.", parsed.error.flatten()));
    }

    const imported = await storage.importWorkerEarningsSnapshots(
      worker.id,
      parsed.data.snapshots.map((snapshot) => ({ ...snapshot, workerId: worker.id })),
    );
    logAudit(req, "IMPORT_EARNINGS", worker.id, "success", `${imported.length} snapshots`);
    res.status(201).json({
      imported,
      summary: summarizeVerifiedEarnings(worker, await storage.getWorkerEarningsSnapshots(worker.id)),
    });
  });

  app.post("/api/admin/workers/:id/activity-import", requireAdmin, async (req, res) => {
    const worker = await getWorkerOrRespond(res, String(req.params.id));
    if (!worker) {
      return;
    }

    const sessionSchema = insertWorkerActivitySessionSchema
      .omit({ workerId: true })
      .extend({
        notes: z.string().optional(),
      });
    const payloadSchema = z.object({
      sessions: z.array(sessionSchema).min(1),
    });
    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_ACTIVITY_IMPORT", "Invalid activity import payload.", parsed.error.flatten()));
    }

    const imported = await storage.importWorkerActivitySessions(
      worker.id,
      parsed.data.sessions.map((session) => ({ ...session, workerId: worker.id })),
    );
    const summary = summarizeActivitySessions(imported);
    logAudit(req, "IMPORT_ACTIVITY", worker.id, "success", `${imported.length} sessions`);
    res.status(201).json({
      imported,
      summary,
    });
  });

  app.post("/api/admin/policies/preview", requireAdmin, async (req, res) => {
    const schema = z.object({
      workerId: z.string().min(1),
      planTier: z.enum(["basic", "standard", "premium"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_POLICY_PREVIEW", "Invalid policy preview payload.", parsed.error.flatten()));
    }

    const worker = await getWorkerOrRespond(res, parsed.data.workerId);
    if (!worker) {
      return;
    }

    const preview = previewPolicyFromVerifiedBaseline(
      worker,
      parsed.data.planTier,
      await storage.getWorkerEarningsSnapshots(worker.id),
    );
    res.json(preview);
  });

  app.get("/api/admin/policies", requireAdmin, async (_req, res) => {
    res.json(await storage.getAllPolicies());
  });

  app.post("/api/admin/policies", requireAdmin, async (req, res) => {
    const schema = z.object({
      workerId: z.string().min(1),
      planTier: z.enum(["basic", "standard", "premium"]),
      autoRenew: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_POLICY", "Invalid policy create payload.", parsed.error.flatten()));
    }

    const worker = await getWorkerOrRespond(res, parsed.data.workerId);
    if (!worker) {
      return;
    }

    const existing = await storage.getPoliciesByWorker(worker.id);
    if (existing.some((policy) => policy.status === "active" && policy.planTier === parsed.data.planTier)) {
      return res.status(409).json(shapeError("DUPLICATE_POLICY", "Worker already has an active policy of this tier."));
    }

    const preview = previewPolicyFromVerifiedBaseline(
      worker,
      parsed.data.planTier,
      await storage.getWorkerEarningsSnapshots(worker.id),
    );
    if (preview.status === "blocked") {
      return res.status(422).json(shapeError("UNDERWRITING_BLOCKED", "Worker is not eligible for automated policy issuance.", preview.reasons));
    }

    const policy = await storage.createPolicy({
      workerId: worker.id,
      planTier: parsed.data.planTier,
      weeklyPremium: preview.weeklyPremium,
      maxWeeklyCoverage: preview.maxWeeklyCoverage,
      coverageTypes: PLAN_COVERAGE[parsed.data.planTier],
      underwritingStatus: preview.status,
      underwritingNotes: preview.reasons.join(" ") || null,
      baselineWeeklyEarnings: preview.baselineWeeklyEarnings,
      baselineHourlyEarnings: preview.baselineHourlyEarnings,
      baselineActiveHours: preview.baselineActiveHours,
      pricingVersion: preview.pricingVersion,
      riskInputsSnapshot: preview.riskInputsSnapshot,
      startDate: new Date().toISOString(),
      waitingPeriodEndsAt: preview.waitingPeriodEndsAt,
      endDate: null,
      autoRenew: parsed.data.autoRenew ?? true,
    });

    logAudit(req, "CREATE_POLICY", policy.id, "success", `${worker.name} - ${policy.planTier}`);
    res.status(201).json(policy);
  });

  app.get("/api/admin/events", requireAdmin, async (_req, res) => {
    res.json(await storage.getAllEvents());
  });

  app.post("/api/admin/events/recompute", requireAdmin, async (req, res) => {
    try {
      const { weather, triggers } = await checkWeatherTriggers();
      const results = await recomputeClaimsFromTriggers(
        triggers.map((trigger) => ({
          city: trigger.city,
          zone: trigger.zone,
          type: trigger.type,
          severity: trigger.severity,
          value: trigger.value,
          threshold: trigger.threshold,
          verificationPayload: JSON.stringify({ liveWeather: weather.find((item) => item.city === trigger.city) || null }),
        })),
      );

      const claimsCreated = results.reduce((sum, result) => sum + result.claims.length, 0);
      logAudit(req, "RECOMPUTE_EVENTS", "live_weather", "success", `${triggers.length} triggers / ${claimsCreated} claims`);
      res.json({
        status: "connected",
        weather,
        triggersFound: triggers.length,
        eventsCreated: results.length,
        claimsCreated,
        results,
      });
    } catch (error) {
      res.status(503).json(shapeError("WEATHER_UNAVAILABLE", "Unable to recompute disruption events from live weather.", String(error)));
    }
  });

  app.get("/api/admin/claims", requireAdmin, async (_req, res) => {
    const claims = await storage.getAllClaims();
    const signalsByClaim = Object.fromEntries(
      await Promise.all(
        claims.map(async (claim) => [claim.id, await storage.getFraudSignalsByClaim(claim.id)]),
      ),
    );
    res.json(claims.map((claim) => ({ ...claim, signals: signalsByClaim[claim.id] || [] })));
  });

  app.post("/api/admin/claims/:id/review", requireAdmin, async (req, res) => {
    const schema = z.object({
      action: z.enum(["approve", "reject", "manual_review"]),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_REVIEW", "Invalid review payload.", parsed.error.flatten()));
    }

    const claim = await storage.getClaim(String(req.params.id));
    if (!claim) {
      return res.status(404).json(shapeError("CLAIM_NOT_FOUND", "Claim not found."));
    }
    if (claim.blockReason && parsed.data.action === "approve") {
      return res.status(422).json(shapeError("HARD_BLOCK", "Blocked claims cannot be manually approved until the block condition is resolved."));
    }

    const nextStatus =
      parsed.data.action === "approve"
        ? "approved"
        : parsed.data.action === "reject"
          ? "rejected"
          : "manual_review";
    const updated = await storage.updateClaim(claim.id, {
      status: nextStatus,
      processedAt: new Date().toISOString(),
      decisionExplanation: parsed.data.notes || claim.decisionExplanation,
      autoApproved: false,
    });

    await storage.createFraudReview({
      claimId: claim.id,
      reviewer: "admin",
      decision: nextStatus,
      notes: parsed.data.notes,
    });

    logAudit(req, "REVIEW_CLAIM", claim.id, "success", nextStatus);
    res.json(updated);
  });

  app.post("/api/admin/payouts", requireAdmin, async (req, res) => {
    const schema = z.object({
      claimId: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_PAYOUT", "Invalid payout payload.", parsed.error.flatten()));
    }

    const claim = await storage.getClaim(parsed.data.claimId);
    if (!claim) {
      return res.status(404).json(shapeError("CLAIM_NOT_FOUND", "Claim not found."));
    }
    if (claim.status !== "approved") {
      return res.status(400).json(shapeError("CLAIM_NOT_APPROVED", "Only approved claims can be paid."));
    }

    const payoutMethod = await storage.getWorkerPayoutMethod(claim.workerId);
    if (!payoutMethod) {
      return res.status(422).json(shapeError("NO_PAYOUT_METHOD", "Worker does not have a payout method on file."));
    }
    if (payoutMethod.riskLockedUntil && new Date(payoutMethod.riskLockedUntil).getTime() > Date.now()) {
      return res.status(422).json(shapeError("PAYOUT_RISK_LOCK", "Payout method is inside the post-update review window."));
    }

    const existingPayout = (await storage.getPayoutsByClaim(claim.id))[0];
    if (existingPayout) {
      return res.json(existingPayout);
    }

    const payout = await storage.createPayout({
      claimId: claim.id,
      workerId: claim.workerId,
      payoutMethodId: payoutMethod.id,
      amount: claim.payoutAmount,
      method: payoutMethod.method,
      idempotencyKey: `claim-${claim.id}`,
    });
    const txId = `TXN${Date.now().toString(36).toUpperCase()}${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    await storage.updatePayoutStatus(payout.id, "completed", txId);
    await storage.updateClaim(claim.id, { status: "paid", processedAt: new Date().toISOString() });
    logAudit(req, "PAY_CLAIM", claim.id, "success", `Rs ${claim.payoutAmount}`);
    res.status(201).json(await storage.getPayoutsByClaim(claim.id).then((items) => items[0]));
  });

  app.get("/api/worker/me", requireWorker, async (req, res) => {
    const worker = await getWorkerOrRespond(res, req.worker!.workerId!);
    if (!worker) {
      return;
    }
    res.json(worker);
  });

  app.get("/api/worker/policies", requireWorker, async (req, res) => {
    res.json(await storage.getPoliciesByWorker(req.worker!.workerId!));
  });

  app.get("/api/worker/claims", requireWorker, async (req, res) => {
    res.json(await storage.getClaimsByWorker(req.worker!.workerId!));
  });

  app.get("/api/worker/payouts", requireWorker, async (req, res) => {
    res.json(await storage.getPayoutsByWorker(req.worker!.workerId!));
  });

  app.get("/api/worker/alerts", requireWorker, async (req, res) => {
    const worker = await getWorkerOrRespond(res, req.worker!.workerId!);
    if (!worker) {
      return;
    }

    const alerts = await storage.getActiveAlerts();
    res.json(
      alerts.filter(
        (alert) =>
          alert.city === worker.city &&
          (!alert.zone || alert.zone.toLowerCase() === worker.zone.toLowerCase()),
      ),
    );
  });

  app.get("/api/dashboard", requireAdmin, async (_req, res) => {
    res.json(await storage.getDashboardStats());
  });

  app.get("/api/alerts", requireAdmin, async (_req, res) => {
    res.json(await storage.getActiveAlerts());
  });

  app.get("/api/weather/live", requireAdmin, async (_req, res) => {
    try {
      const weather = await fetchAllCitiesWeather();
      res.json({ status: "connected", fetchedAt: new Date().toISOString(), cities: weather });
    } catch (error) {
      res.status(503).json(shapeError("WEATHER_UNAVAILABLE", "Weather service unavailable.", String(error)));
    }
  });

  app.get("/api/weather/location", requireAdmin, async (req, res) => {
    const schema = z.object({
      lat: z.coerce.number().min(-90).max(90),
      lon: z.coerce.number().min(-180).max(180),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json(shapeError("INVALID_LOCATION", "Latitude or longitude is invalid.", parsed.error.flatten()));
    }

    try {
      const nearestCity = findNearestMonitoredCity(parsed.data.lat, parsed.data.lon);
      const weather = await fetchWeatherByCoordinates(
        parsed.data.lat,
        parsed.data.lon,
        nearestCity?.city ?? "Current Location",
      );
      const suggestedTriggers = detectTriggeredThresholds(weather)
        .map((trigger) => ({
          ...trigger,
          city: nearestCity?.city ?? weather.city,
          zone: nearestCity?.zone ?? "Current Zone",
        }))
        .sort((left, right) => severityRank(right.severity) - severityRank(left.severity));

      res.json({
        requestedLocation: parsed.data,
        nearestCity,
        weather,
        suggestedTriggers,
      });
    } catch (error) {
      res
        .status(503)
        .json(shapeError("WEATHER_UNAVAILABLE", "Unable to fetch live weather for this GPS location.", String(error)));
    }
  });

  app.post("/api/simulate-trigger", requireAdmin, async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json(shapeError("SIMULATION_DISABLED", "Simulation is disabled in production."));
    }

    const schema = z.object({
      city: z.string().min(1),
      zone: z.string().min(1),
      alertType: z.string().min(1),
      severity: z.enum(["warning", "severe", "extreme"]),
      value: z.string().min(1),
      threshold: z.string().min(1),
      workerId: z.string().min(1).optional(),
      scenarioKey: z.enum(SIMULATION_SCENARIO_KEYS).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(shapeError("INVALID_SIMULATION", "Invalid simulation payload.", parsed.error.flatten()));
    }

    const simulationTime = nextSimulationTime();
    const selectedWorker = parsed.data.workerId
      ? await getWorkerOrRespond(res, parsed.data.workerId)
      : undefined;
    if (parsed.data.workerId && !selectedWorker) {
      return;
    }

    const workers = selectedWorker
      ? [selectedWorker]
      : (await storage.getAllWorkers()).filter((worker) => worker.city === parsed.data.city);

    await Promise.all(
      workers.map((worker) =>
        seedSyntheticImpactForWorker(
          worker.id,
          parsed.data.severity,
          simulationTime,
          parsed.data.scenarioKey ?? "legit_auto_approve",
        ),
      ),
    );

    const event = await upsertEventFromTrigger({
      city: selectedWorker?.city ?? parsed.data.city,
      zone: selectedWorker?.zone ?? parsed.data.zone,
      type: parsed.data.alertType,
      severity: parsed.data.severity,
      value: parsed.data.value,
      threshold: parsed.data.threshold,
      source: "simulation",
      verificationPayload: JSON.stringify({
        synthetic: true,
        scenarioKey: parsed.data.scenarioKey ?? "legit_auto_approve",
        workerId: selectedWorker?.id ?? null,
      }),
    }, simulationTime.toISOString());
    const result = await recomputeClaimsForEvent(event, {
      targetWorkerIds: workers.map((worker) => worker.id),
      ignoreClaimHistory: Boolean(parsed.data.scenarioKey),
    });
    logAudit(
      req,
      "SIMULATE_EVENT",
      event.id,
      "success",
      `${parsed.data.scenarioKey ?? "custom"} / ${result.claims.length} claims`,
    );
    res.status(201).json({
      event,
      scenarioKey: parsed.data.scenarioKey ?? null,
      affectedWorkers: workers.length,
      workers: workers.map((worker) => ({
        id: worker.id,
        name: worker.name,
        city: worker.city,
        zone: worker.zone,
      })),
      claimsCreated: result.claims.length,
      claims: result.claims,
    });
  });

  app.get("/api/cron/status", requireAdmin, async (_req, res) => {
    res.json({
      ...getCronStatus(),
      mode: getSchedulerMode(),
    });
  });

  app.get("/api/admin/events/from-live-weather", requireAdmin, async (_req, res) => {
    try {
      const weather = await fetchAllCitiesWeather();
      res.json(weather.flatMap(weatherToTrigger));
    } catch (error) {
      res.status(503).json(shapeError("WEATHER_UNAVAILABLE", "Unable to derive trigger candidates.", String(error)));
    }
  });

  return _httpServer;
}
