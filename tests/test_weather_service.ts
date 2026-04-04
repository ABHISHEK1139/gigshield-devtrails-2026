import assert from "node:assert/strict";
import { detectTriggeredThresholds, findNearestMonitoredCity } from "../server/weatherService";

function main() {
  const nearestDelhi = findNearestMonitoredCity(28.61, 77.21);
  assert.ok(nearestDelhi, "nearest monitored city should be found");
  assert.equal(nearestDelhi?.city, "Delhi", "Delhi coordinates should map to Delhi");

  const triggers = detectTriggeredThresholds({
    city: "Delhi",
    lat: 28.61,
    lon: 77.21,
    temperature: 44,
    humidity: 62,
    rainfall: 72,
    windSpeed: 14,
    weatherCode: 61,
    description: "Rain",
    aqi: 320,
    fetchedAt: new Date().toISOString(),
  });

  assert.equal(triggers.length, 3, "temperature, rain, and AQI should all trigger");
  assert.ok(triggers.some((trigger) => trigger.type === "extreme_heat"));
  assert.ok(triggers.some((trigger) => trigger.type === "heavy_rain"));
  assert.ok(triggers.some((trigger) => trigger.type === "pollution"));

  console.log("Weather helper checks passed.");
}

main();
