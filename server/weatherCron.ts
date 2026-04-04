import { checkWeatherTriggers } from "./weatherService";
import { recomputeClaimsFromTriggers } from "./disruptionWorkflow";
import { log } from "./logger";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

let cronTimer: ReturnType<typeof setInterval> | null = null;
let lastRunAt: string | null = null;
let totalRuns = 0;
let totalEventsCreated = 0;
let totalClaimsCreated = 0;

async function cronTick() {
  totalRuns += 1;
  lastRunAt = new Date().toISOString();

  try {
    const { triggers } = await checkWeatherTriggers();
    if (triggers.length === 0) {
      log(`Hybrid poll #${totalRuns}: no disruption events`, "cron");
      return;
    }

    const results = await recomputeClaimsFromTriggers(
      triggers.map((trigger) => ({
        city: trigger.city,
        zone: trigger.zone,
        type: trigger.type,
        severity: trigger.severity,
        value: trigger.value,
        threshold: trigger.threshold,
      })),
      lastRunAt,
    );

    totalEventsCreated += results.length;
    totalClaimsCreated += results.reduce((sum, result) => sum + result.claims.length, 0);
    log(
      `Hybrid poll #${totalRuns}: ${results.length} events recomputed, ${results.reduce((sum, result) => sum + result.claims.length, 0)} claims created`,
      "cron",
    );
  } catch (error) {
    log(`Hybrid poll failed: ${String(error)}`, "cron");
  }
}

export function startWeatherCron() {
  if (cronTimer || process.env.DISABLE_WEATHER_CRON === "true") {
    return;
  }

  log(`Starting hybrid weather monitor every ${POLL_INTERVAL_MS / 1000}s`, "cron");
  cronTimer = setInterval(() => {
    void cronTick();
  }, POLL_INTERVAL_MS);
  setTimeout(() => {
    void cronTick();
  }, 10000);
}

export function stopWeatherCron() {
  if (!cronTimer) return;
  clearInterval(cronTimer);
  cronTimer = null;
}

export function getCronStatus() {
  return {
    running: cronTimer !== null,
    intervalMs: POLL_INTERVAL_MS,
    lastRunAt,
    totalRuns,
    totalEventsCreated,
    totalClaimsCreated,
  };
}
