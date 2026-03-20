import { log } from "./logger";
import { startWeatherCron, stopWeatherCron } from "./weatherCron";

log("starting GigShield scheduler process", "scheduler");
startWeatherCron();

const shutdown = (signal: string) => {
  log(`received ${signal}, stopping scheduler`, "scheduler");
  stopWeatherCron();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
