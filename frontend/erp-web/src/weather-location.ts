export type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  /** Open-Meteo geocoding id. Only searched cities have one; only they are remembered. */
  geocodingId?: number;
};

export const DEFAULT_WEATHER_LOCATION: WeatherLocation = {
  name: "İstanbul",
  latitude: 41.0082,
  longitude: 28.9784,
  timezone: "Europe/Istanbul",
};

const WEATHER_LOCATION_STORAGE_KEY = "nexora.weather-location";
const WEATHER_LOCATION_CHANGE_EVENT = "nexora:weather-location-change";

/** What is persisted: a city reference and its display name, never coordinates. */
type SavedWeatherCity = { geocodingId: number; name: string };

function readSavedCity(): SavedWeatherCity | null {
  try {
    const saved = window.localStorage.getItem(WEATHER_LOCATION_STORAGE_KEY);
    if (!saved) return null;
    const value = JSON.parse(saved) as Partial<SavedWeatherCity> & { latitude?: unknown };
    if (typeof value.geocodingId === "number" && Number.isInteger(value.geocodingId) && typeof value.name === "string") {
      return { geocodingId: value.geocodingId, name: value.name };
    }
    // Earlier versions stored coordinates (including device positions). Drop them instead of reusing them.
    window.localStorage.removeItem(WEATHER_LOCATION_STORAGE_KEY);
  } catch {
    // Storage may be unavailable or hold an invalid value; fall back to the default city.
  }
  return null;
}

/** Synchronous initial value; the remembered city (if any) is resolved by loadSavedWeatherLocation. */
export function getSavedWeatherLocation(): WeatherLocation {
  return DEFAULT_WEATHER_LOCATION;
}

/** Resolves the remembered city's coordinates from Open-Meteo, so they never have to be stored. */
export async function loadSavedWeatherLocation(signal?: AbortSignal): Promise<WeatherLocation | null> {
  const city = readSavedCity();
  if (!city) return null;
  try {
    const params = new URLSearchParams({ id: String(city.geocodingId) });
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/get?${params}`, { signal });
    if (!response.ok) return null;
    const value = await response.json() as { latitude?: number; longitude?: number; timezone?: string };
    if (typeof value.latitude !== "number" || typeof value.longitude !== "number") return null;
    return {
      name: city.name,
      latitude: value.latitude,
      longitude: value.longitude,
      timezone: value.timezone,
      geocodingId: city.geocodingId,
    };
  } catch {
    return null;
  }
}

/** Remembers a searched city by reference only and notifies other widgets in this tab. */
export function saveWeatherLocation(location: WeatherLocation) {
  if (typeof location.geocodingId === "number") {
    const city: SavedWeatherCity = { geocodingId: location.geocodingId, name: location.name };
    try {
      window.localStorage.setItem(WEATHER_LOCATION_STORAGE_KEY, JSON.stringify(city));
    } catch {
      // The active page state can still use this location for the current session.
    }
  }
  window.dispatchEvent(
    new CustomEvent<WeatherLocation>(WEATHER_LOCATION_CHANGE_EVENT, {
      detail: location,
    }),
  );
}

export function subscribeToWeatherLocation(
  onChange: (location: WeatherLocation) => void,
) {
  let storageRequest: AbortController | null = null;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WEATHER_LOCATION_STORAGE_KEY) return;
    storageRequest?.abort();
    storageRequest = new AbortController();
    void loadSavedWeatherLocation(storageRequest.signal).then((location) => onChange(location ?? DEFAULT_WEATHER_LOCATION));
  };
  const onLocalChange = (event: Event) => {
    const location = (event as CustomEvent<WeatherLocation>).detail;
    if (location) onChange(location);
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(WEATHER_LOCATION_CHANGE_EVENT, onLocalChange);
  return () => {
    storageRequest?.abort();
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(WEATHER_LOCATION_CHANGE_EVENT, onLocalChange);
  };
}
