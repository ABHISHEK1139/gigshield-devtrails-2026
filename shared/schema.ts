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
  platform: text("platform").notNull(), // zomato, swiggy, zepto
  city: text("city").notNull(),
  zone: text("zone").notNull(),
  vehicleType: text("vehicle_type").notNull(), // bike, bicycle, ev
  avgWeeklyEarnings: real("avg_weekly_earnings").notNull(),
  avgDailyHours: real("avg_daily_hours").notNull(),
  experienceMonths: integer("experience_months").notNull(),
  riskScore: real("risk_score"), // AI-calculated 0-100
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkerSchema = createInsertSchema(workers).omit({
  id: true,
  riskScore: true,
  createdAt: true,
});
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workers.$inferSelect;

// Insurance Policies
export const policies = pgTable("policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").notNull(),
  planTier: text("plan_tier").notNull(), // basic, standard, premium
  weeklyPremium: real("weekly_premium").notNull(),
  maxWeeklyCoverage: real("max_weekly_coverage").notNull(),
  coverageTypes: text("coverage_types").array().notNull(), // extreme_heat, heavy_rain, flood, pollution, curfew, strike
  status: text("status").notNull().default("active"), // active, expired, cancelled
  startDate: text("start_date").notNull(),
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

// Claims
export const claims = pgTable("claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull(),
  workerId: varchar("worker_id").notNull(),
  triggerType: text("trigger_type").notNull(), // extreme_heat, heavy_rain, flood, pollution, curfew, strike
  triggerValue: text("trigger_value").notNull(), // e.g. "45°C", "120mm rainfall"
  incomeLosstHours: real("income_loss_hours").notNull(),
  payoutAmount: real("payout_amount").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected, paid
  fraudScore: real("fraud_score"), // 0-100, AI-calculated
  fraudFlags: text("fraud_flags").array(),
  autoApproved: boolean("auto_approved").default(false),
  triggeredAt: text("triggered_at").notNull(),
  processedAt: text("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClaimSchema = createInsertSchema(claims).omit({
  id: true,
  status: true,
  fraudScore: true,
  fraudFlags: true,
  autoApproved: true,
  processedAt: true,
  createdAt: true,
});
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type Claim = typeof claims.$inferSelect;

// Weather Alerts (Parametric Triggers)
export const weatherAlerts = pgTable("weather_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  city: text("city").notNull(),
  zone: text("zone").notNull(),
  alertType: text("alert_type").notNull(), // extreme_heat, heavy_rain, flood, pollution
  severity: text("severity").notNull(), // warning, severe, extreme
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

// Payouts
export const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id").notNull(),
  workerId: varchar("worker_id").notNull(),
  amount: real("amount").notNull(),
  method: text("method").notNull(), // upi, bank_transfer
  status: text("status").notNull().default("processing"), // processing, completed, failed
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
