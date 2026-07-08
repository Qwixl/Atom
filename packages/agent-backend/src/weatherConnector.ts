import { DEFAULT_CONNECTOR_READ_CACHE_TTL_MS } from "./connectorCache.js";
import type { ConnectorInvokeContext, ConnectorInvokeResult, ConnectorOperationSpec } from "./webcalConnector.js";

export const WEATHER_CONNECTOR_ID = "weather";
const GEOCODING_API = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_API = "https://api.open-meteo.com/v1/forecast";

export const WEATHER_CONNECTOR_OPERATIONS: ConnectorOperationSpec[] = [
  {
    id: "getStatus",
    permission: "read",
    description: "Open-Meteo weather is always available (no API key).",
    cacheTtlMs: 0,
  },
  {
    id: "getForecast",
    permission: "read",
    description:
      "Current and daily forecast. Provide input.latitude + input.longitude, or input.location (city name).",
    cacheTtlMs: DEFAULT_CONNECTOR_READ_CACHE_TTL_MS,
  },
];

export function weatherConnectorOperation(id: string): ConnectorOperationSpec | undefined {
  return WEATHER_CONNECTOR_OPERATIONS.find((op) => op.id === id);
}

const WEATHER_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  95: "Thunderstorm",
};

function describeWeatherCode(code: number | undefined): string | undefined {
  if (code === undefined) return undefined;
  return WEATHER_CODES[code] ?? `Code ${code}`;
}

async function resolveCoordinates(input: Record<string, unknown>): Promise<{ latitude: number; longitude: number; label?: string }> {
  const lat = Number(input.latitude);
  const lon = Number(input.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon };
  }
  const location = String(input.location ?? "").trim();
  if (!location) {
    throw new Error("latitude+longitude or location required");
  }
  const url = `${GEOCODING_API}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const raw = (await fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Geocoding failed (${response.status})`);
    }
    return response.json();
  })) as { results?: Array<{ latitude: number; longitude: number; name: string; country?: string }> };
  const hit = raw.results?.[0];
  if (!hit) {
    throw new Error(`No geocoding match for "${location}"`);
  }
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    label: hit.country ? `${hit.name}, ${hit.country}` : hit.name,
  };
}

export async function invokeWeatherConnector(
  _ctx: ConnectorInvokeContext,
  operationId: string,
  input: Record<string, unknown>,
): Promise<ConnectorInvokeResult> {
  const operation = weatherConnectorOperation(operationId);
  if (!operation) {
    throw new Error(`Unknown connector operation "${operationId}"`);
  }

  switch (operationId) {
    case "getStatus":
      return {
        operation: operationId,
        result: { connected: true, provider: "open-meteo", vaultOnly: false },
      };
    case "getForecast": {
      const coords = await resolveCoordinates(input);
      const url =
        `${FORECAST_API}?latitude=${coords.latitude}&longitude=${coords.longitude}` +
        "&current=temperature_2m,weather_code,wind_speed_10m" +
        "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max" +
        "&timezone=auto&forecast_days=7";
      const raw = (await fetch(url).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Forecast failed (${response.status})`);
        }
        return response.json();
      })) as {
        current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
        daily?: {
          time?: string[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          weather_code?: number[];
          precipitation_probability_max?: number[];
        };
      };
      const daily = (raw.daily?.time ?? []).map((date, index) => ({
        date,
        tempMaxC: raw.daily?.temperature_2m_max?.[index],
        tempMinC: raw.daily?.temperature_2m_min?.[index],
        weather: describeWeatherCode(raw.daily?.weather_code?.[index]),
        precipProbabilityMax: raw.daily?.precipitation_probability_max?.[index],
      }));
      return {
        operation: operationId,
        result: {
          location: coords.label,
          latitude: coords.latitude,
          longitude: coords.longitude,
          current: {
            tempC: raw.current?.temperature_2m,
            weather: describeWeatherCode(raw.current?.weather_code),
            windSpeedKmh: raw.current?.wind_speed_10m,
          },
          daily,
          source: "open-meteo",
        },
      };
    }
    default:
      throw new Error(`Unhandled operation "${operationId}"`);
  }
}
