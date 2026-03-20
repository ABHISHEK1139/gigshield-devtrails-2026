import { log } from "./logger";

export interface CityWeather {
  city: string;
  lat: number;
  lon: number;
  temperature: number;
  humidity: number;
  rainfall: number;
  windSpeed: number;
  weatherCode: number;
  description: string;
  aqi: number | null;
  fetchedAt: string;
}

export interface WeatherThreshold {
  type: string;
  label: string;
  check: (
    weather: CityWeather,
  ) =>
    | {
        breached: boolean;
        severity: "warning" | "severe" | "extreme";
        value: string;
        threshold: string;
      }
    | null;
}

export interface MonitoredCity {
  city: string;
  lat: number;
  lon: number;
  zone: string;
}

const MONITORED_CITIES: MonitoredCity[] = [
  { city: "Delhi", lat: 28.6139, lon: 77.209, zone: "Central Delhi" },
  { city: "Mumbai", lat: 19.076, lon: 72.8777, zone: "Mumbai City" },
  { city: "Bangalore", lat: 12.9716, lon: 77.5946, zone: "Central Bangalore" },
  { city: "Chennai", lat: 13.0827, lon: 80.2707, zone: "Central Chennai" },
  { city: "Hyderabad", lat: 17.385, lon: 78.4867, zone: "Central Hyderabad" },
  { city: "Kolkata", lat: 22.5726, lon: 88.3639, zone: "Central Kolkata" },
  { city: "Pune", lat: 18.5204, lon: 73.8567, zone: "Central Pune" },
];

const THRESHOLDS: WeatherThreshold[] = [
  {
    type: "extreme_heat",
    label: "Extreme Heat",
    check: (weather) => {
      if (weather.temperature >= 45) {
        return { breached: true, severity: "extreme", value: `${weather.temperature} C`, threshold: "42 C" };
      }
      if (weather.temperature >= 42) {
        return { breached: true, severity: "severe", value: `${weather.temperature} C`, threshold: "42 C" };
      }
      if (weather.temperature >= 40) {
        return { breached: true, severity: "warning", value: `${weather.temperature} C`, threshold: "42 C" };
      }
      return null;
    },
  },
  {
    type: "heavy_rain",
    label: "Heavy Rain",
    check: (weather) => {
      if (weather.rainfall >= 100) {
        return { breached: true, severity: "extreme", value: `${weather.rainfall}mm/hr`, threshold: "65mm/hr" };
      }
      if (weather.rainfall >= 65) {
        return { breached: true, severity: "severe", value: `${weather.rainfall}mm/hr`, threshold: "65mm/hr" };
      }
      if (weather.rainfall >= 40) {
        return { breached: true, severity: "warning", value: `${weather.rainfall}mm/hr`, threshold: "65mm/hr" };
      }
      return null;
    },
  },
  {
    type: "pollution",
    label: "Pollution",
    check: (weather) => {
      if (weather.aqi === null) {
        return null;
      }
      if (weather.aqi >= 300) {
        return { breached: true, severity: "extreme", value: `${weather.aqi} AQI`, threshold: "150 AQI" };
      }
      if (weather.aqi >= 200) {
        return { breached: true, severity: "severe", value: `${weather.aqi} AQI`, threshold: "150 AQI" };
      }
      if (weather.aqi >= 150) {
        return { breached: true, severity: "warning", value: `${weather.aqi} AQI`, threshold: "150 AQI" };
      }
      return null;
    },
  },
];

function getWeatherDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

async function fetchCityAqi(lat: number, lon: number, city: string) {
  const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=Asia/Kolkata`;

  try {
    const airQualityRes = await fetch(airQualityUrl);
    if (!airQualityRes.ok) {
      log(`Air quality API error for ${city}: ${airQualityRes.status}`, "weather");
      return null;
    }

    const airQualityData = await airQualityRes.json();
    const aqi = airQualityData.current?.us_aqi;
    return typeof aqi === "number" && Number.isFinite(aqi) ? Math.round(aqi) : null;
  } catch (err) {
    log(`Failed to fetch air quality for ${city}: ${err}`, "weather");
    return null;
  }
}

async function fetchCityWeather(city: string, lat: number, lon: number): Promise<CityWeather> {
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=Asia/Kolkata`;
  const [weatherRes, aqi] = await Promise.all([fetch(weatherUrl), fetchCityAqi(lat, lon, city)]);

  if (!weatherRes.ok) {
    throw new Error(`Weather API error for ${city}: ${weatherRes.status}`);
  }

  const weatherData = await weatherRes.json();
  const current = weatherData.current;

  return {
    city,
    lat,
    lon,
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    rainfall: current.precipitation,
    windSpeed: current.wind_speed_10m,
    weatherCode: current.weather_code,
    description: getWeatherDescription(current.weather_code),
    aqi,
    fetchedAt: new Date().toISOString(),
  };
}

function distanceKm(latA: number, lonA: number, latB: number, lonB: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(latB - latA);
  const deltaLon = toRadians(lonB - lonA);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(latA)) *
      Math.cos(toRadians(latB)) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 100) / 100;
}

export function findNearestMonitoredCity(lat: number, lon: number) {
  return MONITORED_CITIES.reduce((nearest, city) => {
    const currentDistance = distanceKm(lat, lon, city.lat, city.lon);
    if (!nearest || currentDistance < nearest.distanceKm) {
      return { ...city, distanceKm: currentDistance };
    }
    return nearest;
  }, null as (MonitoredCity & { distanceKm: number }) | null);
}

export async function fetchWeatherByCoordinates(
  lat: number,
  lon: number,
  cityLabel = "Current Location",
) {
  return fetchCityWeather(cityLabel, lat, lon);
}

export function detectTriggeredThresholds(weather: CityWeather) {
  return THRESHOLDS.flatMap((threshold) => {
    const result = threshold.check(weather);
    if (!result?.breached) {
      return [];
    }

    return [
      {
        type: threshold.type,
        label: threshold.label,
        severity: result.severity,
        value: result.value,
        threshold: result.threshold,
      },
    ];
  });
}

export async function fetchAllCitiesWeather(): Promise<CityWeather[]> {
  log("Fetching live weather for all monitored cities...", "weather");
  const settled = await Promise.allSettled(
    MONITORED_CITIES.map((cityInfo) => fetchCityWeather(cityInfo.city, cityInfo.lat, cityInfo.lon)),
  );
  const results: CityWeather[] = [];

  settled.forEach((result, index) => {
    const cityInfo = MONITORED_CITIES[index];
    if (result.status === "fulfilled") {
      results.push(result.value);
      return;
    }

    log(`Failed to fetch weather for ${cityInfo.city}: ${result.reason}`, "weather");
  });

  log(`Weather fetched for ${results.length}/${MONITORED_CITIES.length} cities`, "weather");
  return results;
}

export async function fetchCityWeatherByName(cityName: string): Promise<CityWeather | null> {
  const cityInfo = MONITORED_CITIES.find((city) => city.city.toLowerCase() === cityName.toLowerCase());
  if (!cityInfo) {
    return null;
  }

  try {
    return await fetchCityWeather(cityInfo.city, cityInfo.lat, cityInfo.lon);
  } catch (err) {
    log(`Failed to fetch weather for ${cityName}: ${err}`, "weather");
    return null;
  }
}

export async function checkWeatherTriggers(): Promise<{
  weather: CityWeather[];
  triggers: { city: string; zone: string; type: string; severity: string; value: string; threshold: string }[];
}> {
  const weather = await fetchAllCitiesWeather();
  const triggers: { city: string; zone: string; type: string; severity: string; value: string; threshold: string }[] = [];

  for (const cityWeather of weather) {
    const cityInfo = MONITORED_CITIES.find((city) => city.city === cityWeather.city);
    if (!cityInfo) {
      continue;
    }

    for (const threshold of THRESHOLDS) {
      const result = threshold.check(cityWeather);
      if (result?.breached) {
        triggers.push({
          city: cityWeather.city,
          zone: cityInfo.zone,
          type: threshold.type,
          severity: result.severity,
          value: result.value,
          threshold: result.threshold,
        });
      }
    }
  }

  log(`Trigger check complete: ${triggers.length} thresholds breached`, "weather");
  return { weather, triggers };
}

export function getMonitoredCities() {
  return MONITORED_CITIES;
}
