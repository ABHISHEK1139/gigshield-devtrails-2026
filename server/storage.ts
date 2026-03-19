import {
  type Worker, type InsertWorker,
  type Policy, type InsertPolicy,
  type Claim, type InsertClaim,
  type WeatherAlert, type InsertWeatherAlert,
  type Payout, type InsertPayout,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Workers
  getWorker(id: string): Promise<Worker | undefined>;
  getWorkerByPhone(phone: string): Promise<Worker | undefined>;
  getAllWorkers(): Promise<Worker[]>;
  createWorker(worker: InsertWorker): Promise<Worker>;
  updateWorkerRiskScore(id: string, score: number): Promise<Worker | undefined>;

  // Policies
  getPolicy(id: string): Promise<Policy | undefined>;
  getPoliciesByWorker(workerId: string): Promise<Policy[]>;
  getAllPolicies(): Promise<Policy[]>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicyStatus(id: string, status: string): Promise<Policy | undefined>;

  // Claims
  getClaim(id: string): Promise<Claim | undefined>;
  getClaimsByWorker(workerId: string): Promise<Claim[]>;
  getClaimsByPolicy(policyId: string): Promise<Claim[]>;
  getAllClaims(): Promise<Claim[]>;
  createClaim(claim: InsertClaim): Promise<Claim>;
  updateClaimStatus(id: string, status: string, fraudScore?: number, fraudFlags?: string[]): Promise<Claim | undefined>;

  // Weather Alerts
  getActiveAlerts(): Promise<WeatherAlert[]>;
  getAlertsByCity(city: string): Promise<WeatherAlert[]>;
  createAlert(alert: InsertWeatherAlert): Promise<WeatherAlert>;
  resolveAlert(id: string): Promise<WeatherAlert | undefined>;

  // Payouts
  getPayoutsByClaim(claimId: string): Promise<Payout[]>;
  getPayoutsByWorker(workerId: string): Promise<Payout[]>;
  getAllPayouts(): Promise<Payout[]>;
  createPayout(payout: InsertPayout): Promise<Payout>;
  updatePayoutStatus(id: string, status: string, txId?: string): Promise<Payout | undefined>;

  // Dashboard Stats
  getDashboardStats(): Promise<DashboardStats>;
}

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
  weeklyTrend: { week: string; premiums: number; claims: number }[];
}

export class MemStorage implements IStorage {
  private workers: Map<string, Worker> = new Map();
  private policies: Map<string, Policy> = new Map();
  private claims: Map<string, Claim> = new Map();
  private alerts: Map<string, WeatherAlert> = new Map();
  private payouts: Map<string, Payout> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Seed workers
    const workerData: { name: string; phone: string; email: string; platform: string; city: string; zone: string; vehicleType: string; avgWeeklyEarnings: number; avgDailyHours: number; experienceMonths: number }[] = [
      { name: "Rajesh Kumar", phone: "9876543210", email: "rajesh@mail.com", platform: "zomato", city: "Delhi", zone: "South Delhi", vehicleType: "bike", avgWeeklyEarnings: 4500, avgDailyHours: 10, experienceMonths: 24 },
      { name: "Amit Sharma", phone: "9876543211", email: "amit@mail.com", platform: "swiggy", city: "Mumbai", zone: "Andheri", vehicleType: "bike", avgWeeklyEarnings: 5200, avgDailyHours: 11, experienceMonths: 36 },
      { name: "Priya Singh", phone: "9876543212", email: "priya@mail.com", platform: "zepto", city: "Bangalore", zone: "Koramangala", vehicleType: "ev", avgWeeklyEarnings: 3800, avgDailyHours: 8, experienceMonths: 12 },
      { name: "Suresh Yadav", phone: "9876543213", email: "suresh@mail.com", platform: "zomato", city: "Delhi", zone: "North Delhi", vehicleType: "bicycle", avgWeeklyEarnings: 2800, avgDailyHours: 9, experienceMonths: 6 },
      { name: "Kavita Devi", phone: "9876543214", email: "kavita@mail.com", platform: "swiggy", city: "Hyderabad", zone: "Madhapur", vehicleType: "bike", avgWeeklyEarnings: 4100, avgDailyHours: 10, experienceMonths: 18 },
      { name: "Mohammed Ali", phone: "9876543215", email: "ali@mail.com", platform: "zomato", city: "Chennai", zone: "T Nagar", vehicleType: "bike", avgWeeklyEarnings: 3900, avgDailyHours: 9, experienceMonths: 30 },
      { name: "Deepak Verma", phone: "9876543216", email: "deepak@mail.com", platform: "zepto", city: "Pune", zone: "Hinjewadi", vehicleType: "ev", avgWeeklyEarnings: 4300, avgDailyHours: 10, experienceMonths: 15 },
      { name: "Anjali Mishra", phone: "9876543217", email: "anjali@mail.com", platform: "swiggy", city: "Kolkata", zone: "Salt Lake", vehicleType: "bike", avgWeeklyEarnings: 3600, avgDailyHours: 8, experienceMonths: 9 },
    ];

    const riskScores = [32, 18, 45, 65, 28, 22, 40, 55];
    workerData.forEach((w, i) => {
      const id = randomUUID();
      this.workers.set(id, { ...w, id, riskScore: riskScores[i], createdAt: new Date(Date.now() - (30 - i) * 86400000) });
    });

    // Seed policies
    const workerIds = Array.from(this.workers.keys());
    const tiers = ["basic", "standard", "premium", "standard", "basic", "premium", "standard", "basic"];
    const premiums = [29, 49, 79, 49, 29, 79, 49, 29];
    const coverages = [1500, 3000, 5000, 3000, 1500, 5000, 3000, 1500];
    const coverageTypes = [
      ["extreme_heat", "heavy_rain"],
      ["extreme_heat", "heavy_rain", "flood", "pollution"],
      ["extreme_heat", "heavy_rain", "flood", "pollution", "curfew", "strike"],
      ["extreme_heat", "heavy_rain", "flood", "pollution"],
      ["extreme_heat", "heavy_rain"],
      ["extreme_heat", "heavy_rain", "flood", "pollution", "curfew", "strike"],
      ["extreme_heat", "heavy_rain", "flood", "pollution"],
      ["extreme_heat", "heavy_rain"],
    ];

    workerIds.forEach((wid, i) => {
      const pId = randomUUID();
      this.policies.set(pId, {
        id: pId,
        workerId: wid,
        planTier: tiers[i],
        weeklyPremium: premiums[i],
        maxWeeklyCoverage: coverages[i],
        coverageTypes: coverageTypes[i],
        status: "active",
        startDate: "2026-03-10",
        endDate: null,
        autoRenew: true,
        createdAt: new Date(Date.now() - (25 - i) * 86400000),
      });
    });

    // Seed claims
    const policyIds = Array.from(this.policies.keys());
    const claimData = [
      { policyId: policyIds[0], workerId: workerIds[0], triggerType: "extreme_heat", triggerValue: "46°C", incomeLosstHours: 6, payoutAmount: 612, status: "paid", fraudScore: 5, autoApproved: true, triggeredAt: "2026-03-12T14:00:00Z" },
      { policyId: policyIds[1], workerId: workerIds[1], triggerType: "heavy_rain", triggerValue: "85mm/hr", incomeLosstHours: 8, payoutAmount: 945, status: "paid", fraudScore: 8, autoApproved: true, triggeredAt: "2026-03-13T10:00:00Z" },
      { policyId: policyIds[2], workerId: workerIds[2], triggerType: "flood", triggerValue: "Water level 2.1m", incomeLosstHours: 12, payoutAmount: 1425, status: "approved", fraudScore: 12, autoApproved: true, triggeredAt: "2026-03-14T08:00:00Z" },
      { policyId: policyIds[3], workerId: workerIds[3], triggerType: "pollution", triggerValue: "AQI 480", incomeLosstHours: 5, payoutAmount: 389, status: "paid", fraudScore: 3, autoApproved: true, triggeredAt: "2026-03-15T06:00:00Z" },
      { policyId: policyIds[4], workerId: workerIds[4], triggerType: "extreme_heat", triggerValue: "44°C", incomeLosstHours: 4, payoutAmount: 410, status: "pending", fraudScore: 72, autoApproved: false, triggeredAt: "2026-03-16T13:00:00Z" },
      { policyId: policyIds[0], workerId: workerIds[0], triggerType: "heavy_rain", triggerValue: "92mm/hr", incomeLosstHours: 7, payoutAmount: 714, status: "paid", fraudScore: 6, autoApproved: true, triggeredAt: "2026-03-17T16:00:00Z" },
      { policyId: policyIds[5], workerId: workerIds[5], triggerType: "curfew", triggerValue: "Section 144", incomeLosstHours: 10, payoutAmount: 1083, status: "approved", fraudScore: 4, autoApproved: true, triggeredAt: "2026-03-18T00:00:00Z" },
      { policyId: policyIds[1], workerId: workerIds[1], triggerType: "extreme_heat", triggerValue: "47°C", incomeLosstHours: 6, payoutAmount: 709, status: "rejected", fraudScore: 88, autoApproved: false, triggeredAt: "2026-03-18T14:00:00Z", fraudFlags: ["gps_mismatch", "duplicate_window"] },
    ];

    claimData.forEach((c) => {
      const cId = randomUUID();
      this.claims.set(cId, {
        id: cId,
        policyId: c.policyId,
        workerId: c.workerId,
        triggerType: c.triggerType,
        triggerValue: c.triggerValue,
        incomeLosstHours: c.incomeLosstHours,
        payoutAmount: c.payoutAmount,
        status: c.status,
        fraudScore: c.fraudScore,
        fraudFlags: c.fraudFlags || null,
        autoApproved: c.autoApproved,
        triggeredAt: c.triggeredAt,
        processedAt: c.status !== "pending" ? new Date(new Date(c.triggeredAt).getTime() + 3600000).toISOString() : null,
        createdAt: new Date(c.triggeredAt),
      });
    });

    // Seed weather alerts
    const alertData = [
      { city: "Delhi", zone: "South Delhi", alertType: "extreme_heat", severity: "extreme", value: "47°C", threshold: "42°C", triggeredAt: "2026-03-19T10:00:00Z", isActive: true },
      { city: "Mumbai", zone: "Andheri", alertType: "heavy_rain", severity: "severe", value: "95mm/hr", threshold: "65mm/hr", triggeredAt: "2026-03-19T08:00:00Z", isActive: true },
      { city: "Delhi", zone: "North Delhi", alertType: "pollution", severity: "warning", value: "AQI 410", threshold: "AQI 300", triggeredAt: "2026-03-19T06:00:00Z", isActive: true },
      { city: "Chennai", zone: "T Nagar", alertType: "flood", severity: "severe", value: "Water level 1.8m", threshold: "1.5m", triggeredAt: "2026-03-18T20:00:00Z", isActive: false },
    ];

    alertData.forEach((a) => {
      const aId = randomUUID();
      this.alerts.set(aId, { id: aId, ...a, resolvedAt: a.isActive ? null : "2026-03-19T04:00:00Z" });
    });

    // Seed payouts for paid claims
    Array.from(this.claims.values())
      .filter((c) => c.status === "paid")
      .forEach((c) => {
        const pId = randomUUID();
        this.payouts.set(pId, {
          id: pId,
          claimId: c.id,
          workerId: c.workerId,
          amount: c.payoutAmount,
          method: "upi",
          status: "completed",
          transactionId: `TXN${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          createdAt: new Date(c.triggeredAt),
        });
      });
  }

  // Workers
  async getWorker(id: string) { return this.workers.get(id); }
  async getWorkerByPhone(phone: string) { return Array.from(this.workers.values()).find(w => w.phone === phone); }
  async getAllWorkers() { return Array.from(this.workers.values()); }
  async createWorker(w: InsertWorker): Promise<Worker> {
    const id = randomUUID();
    const worker: Worker = { ...w, id, riskScore: null, createdAt: new Date() };
    this.workers.set(id, worker);
    return worker;
  }
  async updateWorkerRiskScore(id: string, score: number) {
    const w = this.workers.get(id);
    if (!w) return undefined;
    w.riskScore = score;
    return w;
  }

  // Policies
  async getPolicy(id: string) { return this.policies.get(id); }
  async getPoliciesByWorker(workerId: string) { return Array.from(this.policies.values()).filter(p => p.workerId === workerId); }
  async getAllPolicies() { return Array.from(this.policies.values()); }
  async createPolicy(p: InsertPolicy): Promise<Policy> {
    const id = randomUUID();
    const policy: Policy = { ...p, id, status: "active", createdAt: new Date() };
    this.policies.set(id, policy);
    return policy;
  }
  async updatePolicyStatus(id: string, status: string) {
    const p = this.policies.get(id);
    if (!p) return undefined;
    p.status = status;
    return p;
  }

  // Claims
  async getClaim(id: string) { return this.claims.get(id); }
  async getClaimsByWorker(workerId: string) { return Array.from(this.claims.values()).filter(c => c.workerId === workerId); }
  async getClaimsByPolicy(policyId: string) { return Array.from(this.claims.values()).filter(c => c.policyId === policyId); }
  async getAllClaims() { return Array.from(this.claims.values()); }
  async createClaim(c: InsertClaim): Promise<Claim> {
    const id = randomUUID();
    const claim: Claim = { ...c, id, status: "pending", fraudScore: null, fraudFlags: null, autoApproved: false, processedAt: null, createdAt: new Date() };
    this.claims.set(id, claim);
    return claim;
  }
  async updateClaimStatus(id: string, status: string, fraudScore?: number, fraudFlags?: string[]) {
    const c = this.claims.get(id);
    if (!c) return undefined;
    c.status = status;
    if (fraudScore !== undefined) c.fraudScore = fraudScore;
    if (fraudFlags) c.fraudFlags = fraudFlags;
    c.processedAt = new Date().toISOString();
    return c;
  }

  // Weather Alerts
  async getActiveAlerts() { return Array.from(this.alerts.values()).filter(a => a.isActive); }
  async getAlertsByCity(city: string) { return Array.from(this.alerts.values()).filter(a => a.city === city); }
  async createAlert(a: InsertWeatherAlert): Promise<WeatherAlert> {
    const id = randomUUID();
    const alert: WeatherAlert = { ...a, id, isActive: true, resolvedAt: null };
    this.alerts.set(id, alert);
    return alert;
  }
  async resolveAlert(id: string) {
    const a = this.alerts.get(id);
    if (!a) return undefined;
    a.isActive = false;
    a.resolvedAt = new Date().toISOString();
    return a;
  }

  // Payouts
  async getPayoutsByClaim(claimId: string) { return Array.from(this.payouts.values()).filter(p => p.claimId === claimId); }
  async getPayoutsByWorker(workerId: string) { return Array.from(this.payouts.values()).filter(p => p.workerId === workerId); }
  async getAllPayouts() { return Array.from(this.payouts.values()); }
  async createPayout(p: InsertPayout): Promise<Payout> {
    const id = randomUUID();
    const payout: Payout = { ...p, id, status: "processing", transactionId: null, createdAt: new Date() };
    this.payouts.set(id, payout);
    return payout;
  }
  async updatePayoutStatus(id: string, status: string, txId?: string) {
    const p = this.payouts.get(id);
    if (!p) return undefined;
    p.status = status;
    if (txId) p.transactionId = txId;
    return p;
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    const allPolicies = Array.from(this.policies.values());
    const allClaims = Array.from(this.claims.values());
    const allPayouts = Array.from(this.payouts.values());

    const activePolicies = allPolicies.filter(p => p.status === "active");
    const paidClaims = allClaims.filter(c => c.status === "paid");
    const totalPremiumCollected = activePolicies.reduce((sum, p) => sum + p.weeklyPremium * 2, 0); // 2 weeks simulated
    const totalClaimsPaid = paidClaims.reduce((sum, c) => sum + c.payoutAmount, 0);

    const claimsByType: Record<string, number> = {};
    allClaims.forEach(c => {
      claimsByType[c.triggerType] = (claimsByType[c.triggerType] || 0) + 1;
    });

    const avgFraudScore = allClaims.reduce((sum, c) => sum + (c.fraudScore || 0), 0) / Math.max(allClaims.length, 1);

    return {
      totalWorkers: this.workers.size,
      activePolicies: activePolicies.length,
      totalClaims: allClaims.length,
      totalPayouts: allPayouts.length,
      totalPremiumCollected,
      totalClaimsPaid,
      lossRatio: totalPremiumCollected > 0 ? totalClaimsPaid / totalPremiumCollected : 0,
      avgFraudScore,
      claimsByType,
      weeklyTrend: [
        { week: "Week 1", premiums: 308, claims: 1326 },
        { week: "Week 2", premiums: 308, claims: 2508 },
        { week: "Week 3", premiums: 308, claims: 1083 },
      ],
    };
  }
}

export const storage = new MemStorage();
