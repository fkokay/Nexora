export type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

export const DEFAULT_WEATHER_LOCATION: WeatherLocation = {
  name: "İstanbul",
  latitude: 41.0082,
  longitude: 28.9784,
  timezone: "Europe/Istanbul",
};

const WEATHER_LOCATION_STORAGE_KEY = "nexora.weather-location";
const WEATHER_LOCATION_CHANGE_EVENT = "nexora:weather-location-change";

export function getSavedWeatherLocation(): WeatherLocation {
  try {
    const saved = window.localStorage.getItem(WEATHER_LOCATION_STORAGE_KEY);
    if (!saved) return DEFAULT_WEATHER_LOCATION;
    const value = JSON.parse(saved) as Partial<WeatherLocation>;
    if (
      typeof value.name === "string" &&
      typeof value.latitude === "number" &&
      typeof value.longitude === "number"
    ) {
      return {
        name: value.name,
        latitude: value.latitude,
        longitude: value.longitude,
        timezone: value.timezone,
      };
    }
  } catch {
    // Keep the dashboard usable when browser storage is unavailable or invalid.
  }
  return DEFAULT_WEATHER_LOCATION;
}

export function saveWeatherLocation(location: WeatherLocation) {
  try {
    window.localStorage.setItem(WEATHER_LOCATION_STORAGE_KEY, JSON.stringify(location));
  } catch {
    // The active page state can still use this location for the current session.
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
  const onStorage = (event: StorageEvent) => {
    if (event.key === WEATHER_LOCATION_STORAGE_KEY) {
      onChange(getSavedWeatherLocation());
    }
  };
  const onLocalChange = (event: Event) => {
    const location = (event as CustomEvent<WeatherLocation>).detail;
    if (location) onChange(location);
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(WEATHER_LOCATION_CHANGE_EVENT, onLocalChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(WEATHER_LOCATION_CHANGE_EVENT, onLocalChange);
  };
}
