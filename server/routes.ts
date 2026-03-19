import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWorkerSchema, insertPolicySchema, insertClaimSchema, insertWeatherAlertSchema } from "@shared/schema";

// Simple AI risk scoring engine
function calculateRiskScore(worker: { city: string; zone: string; vehicleType: string; avgDailyHours: number; experienceMonths: number; avgWeeklyEarnings: number }): number {
  let score = 50; // base

  // City risk factor (weather + pollution prone)
  const highRiskCities: Record<string, number> = { Delhi: 15, Mumbai: 12, Chennai: 10, Kolkata: 8, Hyderabad: 6, Bangalore: 4, Pune: 3 };
  score += highRiskCities[worker.city] || 0;

  // Vehicle type (bicycle riders more vulnerable)
  if (worker.vehicleType === "bicycle") score += 15;
  else if (worker.vehicleType === "bike") score += 5;
  else if (worker.vehicleType === "ev") score += 2;

  // Hours worked (more hours = more exposure)
  if (worker.avgDailyHours > 10) score += 10;
  else if (worker.avgDailyHours > 8) score += 5;

  // Experience (less experience = higher risk)
  if (worker.experienceMonths < 6) score += 12;
  else if (worker.experienceMonths < 12) score += 6;
  else if (worker.experienceMonths > 24) score -= 8;

  return Math.max(0, Math.min(100, score));
}

// Dynamic premium calculation
function calculateWeeklyPremium(riskScore: number, planTier: string, avgWeeklyEarnings: number): number {
  const basePremiumRates: Record<string, number> = { basic: 0.015, standard: 0.025, premium: 0.04 };
  const rate = basePremiumRates[planTier] || 0.025;
  const riskMultiplier = 0.7 + (riskScore / 100) * 0.6; // 0.7x to 1.3x
  const premium = avgWeeklyEarnings * rate * riskMultiplier;
  return Math.round(premium * 100) / 100;
}

// Fraud detection scoring
function calculateFraudScore(claim: { triggerType: string; incomeLosstHours: number; payoutAmount: number; triggeredAt: string }, workerClaims: { triggeredAt: string; triggerType: string }[]): { score: number; flags: string[] } {
  let score = 0;
  const flags: string[] = [];

  // Check claim frequency (more than 3 claims in a week is suspicious)
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
  const recentClaims = workerClaims.filter(c => new Date(c.triggeredAt) > oneWeekAgo);
  if (recentClaims.length >= 3) { score += 30; flags.push("high_frequency"); }
  else if (recentClaims.length >= 2) { score += 15; flags.push("moderate_frequency"); }

  // Duplicate time window check
  const claimTime = new Date(claim.triggeredAt).getTime();
  const duplicateWindow = workerClaims.some(c => {
    const diff = Math.abs(new Date(c.triggeredAt).getTime() - claimTime);
    return diff < 3600000 && diff > 0; // within 1 hour
  });
  if (duplicateWindow) { score += 25; flags.push("duplicate_window"); }

  // Unusually high hours claimed
  if (claim.incomeLosstHours > 10) { score += 15; flags.push("excessive_hours"); }

  // High payout relative to income loss
  if (claim.payoutAmount / claim.incomeLosstHours > 150) { score += 10; flags.push("high_hourly_rate"); }

  return { score: Math.min(score, 100), flags };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // === WORKERS ===
  app.get("/api/workers", async (_req, res) => {
    const workers = await storage.getAllWorkers();
    res.json(workers);
  });

  app.get("/api/workers/:id", async (req, res) => {
    const worker = await storage.getWorker(req.params.id);
    if (!worker) return res.status(404).json({ error: "Worker not found" });
    res.json(worker);
  });

  app.post("/api/workers", async (req, res) => {
    const parsed = insertWorkerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const existing = await storage.getWorkerByPhone(parsed.data.phone);
    if (existing) return res.status(409).json({ error: "Phone number already registered" });

    const worker = await storage.createWorker(parsed.data);
    const riskScore = calculateRiskScore(worker);
    await storage.updateWorkerRiskScore(worker.id, riskScore);
    worker.riskScore = riskScore;
    res.status(201).json(worker);
  });

  // === POLICIES ===
  app.get("/api/policies", async (_req, res) => {
    const policies = await storage.getAllPolicies();
    res.json(policies);
  });

  app.get("/api/policies/worker/:workerId", async (req, res) => {
    const policies = await storage.getPoliciesByWorker(req.params.workerId);
    res.json(policies);
  });

  app.post("/api/policies", async (req, res) => {
    const worker = await storage.getWorker(req.body.workerId);
    if (!worker) return res.status(404).json({ error: "Worker not found" });

    const riskScore = worker.riskScore || calculateRiskScore(worker);
    const weeklyPremium = calculateWeeklyPremium(riskScore, req.body.planTier, worker.avgWeeklyEarnings);

    const maxCoverage: Record<string, number> = { basic: 1500, standard: 3000, premium: 5000 };
    const policyData = {
      ...req.body,
      weeklyPremium,
      maxWeeklyCoverage: maxCoverage[req.body.planTier] || 3000,
      startDate: new Date().toISOString().split("T")[0],
    };

    const parsed = insertPolicySchema.safeParse(policyData);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const policy = await storage.createPolicy(parsed.data);
    res.status(201).json(policy);
  });

  // === CLAIMS ===
  app.get("/api/claims", async (_req, res) => {
    const claims = await storage.getAllClaims();
    res.json(claims);
  });

  app.get("/api/claims/worker/:workerId", async (req, res) => {
    const claims = await storage.getClaimsByWorker(req.params.workerId);
    res.json(claims);
  });

  app.post("/api/claims", async (req, res) => {
    const parsed = insertClaimSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const claim = await storage.createClaim(parsed.data);

    // Run fraud detection
    const workerClaims = await storage.getClaimsByWorker(claim.workerId);
    const { score, flags } = calculateFraudScore(
      { triggerType: claim.triggerType, incomeLosstHours: claim.incomeLosstHours, payoutAmount: claim.payoutAmount, triggeredAt: claim.triggeredAt },
      workerClaims.filter(c => c.id !== claim.id)
    );

    // Auto-approve if fraud score < 30
    if (score < 30) {
      await storage.updateClaimStatus(claim.id, "approved", score, flags.length > 0 ? flags : undefined);
      claim.status = "approved";
      claim.autoApproved = true;
    } else {
      await storage.updateClaimStatus(claim.id, "pending", score, flags);
    }

    claim.fraudScore = score;
    claim.fraudFlags = flags.length > 0 ? flags : null;
    res.status(201).json(claim);
  });

  app.patch("/api/claims/:id/status", async (req, res) => {
    const { status } = req.body;
    if (!["approved", "rejected", "paid"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const claim = await storage.updateClaimStatus(req.params.id, status);
    if (!claim) return res.status(404).json({ error: "Claim not found" });
    res.json(claim);
  });

  // === WEATHER ALERTS ===
  app.get("/api/alerts", async (_req, res) => {
    const alerts = await storage.getActiveAlerts();
    res.json(alerts);
  });

  app.post("/api/alerts", async (req, res) => {
    const parsed = insertWeatherAlertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const alert = await storage.createAlert(parsed.data);
    res.status(201).json(alert);
  });

  app.patch("/api/alerts/:id/resolve", async (req, res) => {
    const alert = await storage.resolveAlert(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json(alert);
  });

  // === PAYOUTS ===
  app.get("/api/payouts", async (_req, res) => {
    const payouts = await storage.getAllPayouts();
    res.json(payouts);
  });

  app.post("/api/payouts", async (req, res) => {
    const claim = await storage.getClaim(req.body.claimId);
    if (!claim) return res.status(404).json({ error: "Claim not found" });
    if (claim.status !== "approved") return res.status(400).json({ error: "Claim not approved" });

    const payout = await storage.createPayout({
      claimId: claim.id,
      workerId: claim.workerId,
      amount: claim.payoutAmount,
      method: req.body.method || "upi",
    });

    // Simulate instant payout processing
    const txId = `TXN${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await storage.updatePayoutStatus(payout.id, "completed", txId);
    await storage.updateClaimStatus(claim.id, "paid");
    payout.status = "completed";
    payout.transactionId = txId;
    res.status(201).json(payout);
  });

  // === DASHBOARD ===
  app.get("/api/dashboard", async (_req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  // === PREMIUM CALCULATOR ===
  app.post("/api/calculate-premium", async (req, res) => {
    const { city, zone, vehicleType, avgDailyHours, experienceMonths, avgWeeklyEarnings, planTier } = req.body;
    const riskScore = calculateRiskScore({ city, zone, vehicleType, avgDailyHours, experienceMonths, avgWeeklyEarnings });
    const premium = calculateWeeklyPremium(riskScore, planTier, avgWeeklyEarnings);
    const maxCoverage: Record<string, number> = { basic: 1500, standard: 3000, premium: 5000 };
    res.json({ riskScore, weeklyPremium: premium, maxWeeklyCoverage: maxCoverage[planTier] || 3000 });
  });

  // === SIMULATE TRIGGER ===
  app.post("/api/simulate-trigger", async (req, res) => {
    const { city, zone, alertType, severity, value, threshold } = req.body;

    // Create weather alert
    const alert = await storage.createAlert({
      city, zone, alertType, severity, value, threshold,
      triggeredAt: new Date().toISOString(),
    });

    // Find affected workers and auto-create claims
    const allWorkers = await storage.getAllWorkers();
    const affected = allWorkers.filter(w => w.city === city);
    const autoClaims = [];

    for (const worker of affected) {
      const policies = await storage.getPoliciesByWorker(worker.id);
      const activePolicy = policies.find(p => p.status === "active" && p.coverageTypes.includes(alertType));
      if (!activePolicy) continue;

      const hoursLost = severity === "extreme" ? 10 : severity === "severe" ? 6 : 3;
      const hourlyRate = worker.avgWeeklyEarnings / (worker.avgDailyHours * 6);
      const payoutAmount = Math.min(hoursLost * hourlyRate, activePolicy.maxWeeklyCoverage);

      const claim = await storage.createClaim({
        policyId: activePolicy.id,
        workerId: worker.id,
        triggerType: alertType,
        triggerValue: value,
        incomeLosstHours: hoursLost,
        payoutAmount: Math.round(payoutAmount * 100) / 100,
        triggeredAt: new Date().toISOString(),
      });

      // Auto-approve parametric claims with low fraud risk
      const workerClaims = await storage.getClaimsByWorker(worker.id);
      const { score, flags } = calculateFraudScore(
        { triggerType: alertType, incomeLosstHours: hoursLost, payoutAmount, triggeredAt: claim.triggeredAt },
        workerClaims.filter(c => c.id !== claim.id)
      );

      if (score < 30) {
        await storage.updateClaimStatus(claim.id, "approved", score, flags.length > 0 ? flags : undefined);
        claim.status = "approved";
        claim.autoApproved = true;
      } else {
        await storage.updateClaimStatus(claim.id, "pending", score, flags);
      }

      claim.fraudScore = score;
      autoClaims.push(claim);
    }

    res.status(201).json({ alert, affectedWorkers: affected.length, claimsCreated: autoClaims.length, claims: autoClaims });
  });

  return httpServer;
}
