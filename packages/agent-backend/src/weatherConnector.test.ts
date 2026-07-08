import { describe, expect, it, vi, afterEach } from "vitest";
import { invokeWeatherConnector } from "./weatherConnector.js";

describe("weatherConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getStatus reports open-meteo available", async () => {
    const result = await invokeWeatherConnector({ vault: {} as never }, "getStatus", {});
    expect(result.result).toMatchObject({ connected: true, provider: "open-meteo" });
  });

  it("getForecast geocodes location then fetches forecast", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("geocoding-api")) {
        return {
          ok: true,
          json: async () => ({ results: [{ latitude: 52.52, longitude: 13.41, name: "Berlin", country: "Germany" }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          current: { temperature_2m: 21, weather_code: 0, wind_speed_10m: 8 },
          daily: {
            time: ["2026-07-08"],
            temperature_2m_max: [24],
            temperature_2m_min: [15],
            weather_code: [1],
            precipitation_probability_max: [10],
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeWeatherConnector({ vault: {} as never }, "getForecast", {
      location: "Berlin",
    });
    expect(result.result).toMatchObject({
      location: "Berlin, Germany",
      current: { tempC: 21, weather: "Clear" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
