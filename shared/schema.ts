import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Workers (Delivery Partners)
export const workers = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  platform: text("platform").notNull(),
  city: text("city").notNull(),
  zone: text("zone").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  avgWeeklyEarnings: real("avg_weekly_earnings").notNull(),
  avgDailyHours: real("avg_daily_hours").notNull(),
  experienceMonths: integer("experience_months").notNull(),
  riskScore: real("risk_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkerSchema = createInsertSchema(workers).omit({
  id: true,
  riskScore: true,
  createdAt: true,
});
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workers.$inferSelect;

// Verified Earnings History
export const workerEarningsSnapshots = pgTable("worker_earnings_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  grossEarnings: real("gross_earnings").notNull(),
  activeHours: real("active_hours").notNull(),
  completedOrders: integer("completed_orders"),
  source: text("source").notNull().default("admin_import"),
  verificationStatus: text("verification_status").notNull().default("verified"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkerEarningsSnapshotSchema = createInsertSchema(workerEarningsSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertWorkerEarningsSnapshot = z.infer<typeof insertWorkerEarningsSnapshotSchema>;
export type WorkerEarningsSnapshot = typeof workerEarningsSnapshots.$inferSelect;

// Verified Activity Sessions
export const workerActivitySessions = pgTable("worker_activity_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  onlineMinutes: real("online_minutes").notNull(),
  activeMinutes: real("active_minutes").notNull(),
  ordersCompleted: integer("orders_completed").notNull().default(0),
  distanceKm: real("distance_km").notNull().default(0),
  source: text("source").notNull().default("admin_import"),
  verificationStatus: text("verification_status").notNull().default("verified"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkerActivitySessionSchema = createInsertSchema(workerActivitySessions).omit({
  id: true,
  createdAt: true,
});
export type InsertWorkerActivitySession = z.infer<typeof insertWorkerActivitySessionSchema>;
export type WorkerActivitySession = typeof workerActivitySessions.$inferSelect;

// Insurance Policies
export const policies = pgTable("policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  planTier: text("plan_tier").notNull(),
  weeklyPremium: real("weekly_premium").notNull(),
  maxWeeklyCoverage: real("max_weekly_coverage").notNull(),
  coverageTypes: text("coverage_types").array().notNull(),
  status: text("status").notNull().default("active"),
  underwritingStatus: text("underwriting_status").notNull().default("eligible"),
  underwritingNotes: text("underwriting_notes"),
  baselineWeeklyEarnings: real("baseline_weekly_earnings").notNull(),
  baselineHourlyEarnings: real("baseline_hourly_earnings").notNull(),
  baselineActiveHours: real("baseline_active_hours").notNull(),
  pricingVersion: text("pricing_version").notNull().default("hybrid-v1"),
  riskInputsSnapshot: text("risk_inputs_snapshot").notNull().default("{}"),
  startDate: text("start_date").notNull(),
  waitingPeriodEndsAt: text("waiting_period_ends_at").notNull(),
  endDate: text("end_date"),
  autoRenew: boolean("auto_renew").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPolicySchema = createInsertSchema(policies).omit({
  id: true,
  status: true,
  createdAt: true,
});
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policies.$inferSelect;

// Disruption Events
export const disruptionEvents = pgTable("disruption_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventKey: text("event_key").notNull(),
  city: text("city").notNull(),
  zone: text("zone").notNull(),
  triggerType: text("trigger_type").notNull(),
  severity: text("severity").notNull(),
  source: text("source").notNull().default("weather"),
  triggerValue: text("trigger_value").notNull(),
  threshold: text("threshold").notNull(),
  verificationPayload: text("verification_payload").notNull().default("{}"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDisruptionEventSchema = createInsertSchema(disruptionEvents).omit({
  id: true,
  eventKey: true,
  createdAt: true,
  isActive: true,
});
export type InsertDisruptionEvent = z.infer<typeof insertDisruptionEventSchema>;
export type DisruptionEvent = typeof disruptionEvents.$inferSelect;

// Claims
export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull(),
  workerId: varchar("worker_id").notNull(),
  eventId: varchar("event_id"),
  eventKey: text("event_key"),
  triggerType: text("trigger_type").notNull(),
  triggerValue: text("trigger_value").notNull(),
  incomeLossHours: real("income_loss_hours").notNull(),
  eventImpactHours: real("event_impact_hours").notNull().default(0),
  approvedCompensationHours: real("approved_compensation_hours").notNull().default(0),
  impactLossRatio: real("impact_loss_ratio").notNull().default(0),
  preEventActiveMinutes: real("pre_event_active_minutes").notNull().default(0),
  duringEventActiveMinutes: real("during_event_active_minutes").notNull().default(0),
  continuityScore: real("continuity_score").notNull().default(0),
  workProofScore: real("work_proof_score").notNull().default(0),
  measuredEarningsDrop: real("measured_earnings_drop").notNull().default(0),
  measuredActiveHoursDrop: real("measured_active_hours_drop").notNull().default(0),
  payoutAmount: real("payout_amount").notNull(),
  status: text("status").notNull().default("manual_review"),
  blockReason: text("block_reason"),
  fraudScore: real("fraud_score"),
  fraudFlags: text("fraud_flags").array(),
  decisionExplanation: text("decision_explanation"),
  autoApproved: boolean("auto_approved").default(false),
  triggeredAt: text("triggered_at").notNull(),
  processedAt: text("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClaimSchema = createInsertSchema(claims).omit({
  id: true,
  status: true,
  blockReason: true,
  fraudScore: true,
  fraudFlags: true,
  decisionExplanation: true,
  autoApproved: true,
  processedAt: true,
  createdAt: true,
});
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;

// Weather Alerts (legacy dashboard view + derived event cards)
export const weatherAlerts = pgTable("weather_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  city: text("city").notNull(),
  zone: text("zone").notNull(),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull(),
  value: text("value").notNull(),
  threshold: text("threshold").notNull(),
  isActive: boolean("is_active").default(true),
  triggeredAt: text("triggered_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const insertWeatherAlertSchema = createInsertSchema(weatherAlerts).omit({
  id: true,
  isActive: true,
  resolvedAt: true,
});
export type InsertWeatherAlert = z.infer<typeof insertWeatherAlertSchema>;
export type WeatherAlert = typeof weatherAlerts.$inferSelect;

// Payout Methods
export const workerPayoutMethods = pgTable("worker_payout_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  method: text("method").notNull().default("upi"),
  label: text("label").notNull(),
  accountRef: text("account_ref").notNull(),
  verificationStatus: text("verification_status").notNull().default("verified"),
  lastUpdatedAt: text("last_updated_at").notNull(),
  riskLockedUntil: text("risk_locked_until"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkerPayoutMethodSchema = createInsertSchema(workerPayoutMethods).omit({
  id: true,
  createdAt: true,
});
export type InsertWorkerPayoutMethod = z.infer<typeof insertWorkerPayoutMethodSchema>;
export type WorkerPayoutMethod = typeof workerPayoutMethods.$inferSelect;

// Fraud Signals
export const fraudSignals = pgTable("fraud_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  workerId: varchar("worker_id").notNull(),
  signalType: text("signal_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFraudSignalSchema = createInsertSchema(fraudSignals).omit({
  id: true,
  createdAt: true,
});
export type InsertFraudSignal = z.infer<typeof insertFraudSignalSchema>;
export type FraudSignal = typeof fraudSignals.$inferSelect;

// Fraud Reviews
export const fraudReviews = pgTable("fraud_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  reviewer: text("reviewer").notNull(),
  decision: text("decision").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFraudReviewSchema = createInsertSchema(fraudReviews).omit({
  id: true,
  createdAt: true,
});
export type InsertFraudReview = z.infer<typeof insertFraudReviewSchema>;
export type FraudReview = typeof fraudReviews.$inferSelect;

// Payouts
export const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  workerId: varchar("worker_id").notNull(),
  payoutMethodId: varchar("payout_method_id"),
  amount: real("amount").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("processing"),
  idempotencyKey: text("idempotency_key").notNull(),
  transactionId: text("transaction_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayoutSchema = createInsertSchema(payouts).omit({
  id: true,
  status: true,
  transactionId: true,
  createdAt: true,
});
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Payout = typeof payouts.$inferSelect;
