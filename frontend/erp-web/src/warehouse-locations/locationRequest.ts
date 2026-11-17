/**
 * Hand-off from Depolar to Raf ve Konumlar ("Lokasyon ekle" / "Tümünü yönet"): the target screen may be opened for
 * the first time or already be mounted (kept alive), so the request is stored for a mount and also announced.
 */
export const LOCATION_REQUEST_KEY = "nexora.warehouse-locations-request";
export const LOCATION_REQUEST_EVENT = "nexora:warehouse-locations-request";

export type LocationRequest = { warehouseId: string; create: boolean };

export function requestLocations(request: LocationRequest) {
  try {
    sessionStorage.setItem(LOCATION_REQUEST_KEY, JSON.stringify(request));
  } catch {
    // Storage may be unavailable; the event below still reaches a mounted screen.
  }
  window.setTimeout(() => window.dispatchEvent(new CustomEvent<LocationRequest>(LOCATION_REQUEST_EVENT, { detail: request })), 0);
}

/** Reads a stored request without clearing it (safe in a state initializer, which may run twice). */
export function peekLocationRequest(): LocationRequest | null {
  try {
    const raw = sessionStorage.getItem(LOCATION_REQUEST_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LocationRequest>;
    return typeof value.warehouseId === "string" ? { warehouseId: value.warehouseId, create: value.create === true } : null;
  } catch {
    return null;
  }
}

/** Clears a stored request once it has been applied. */
export function clearLocationRequest() {
  try {
    sessionStorage.removeItem(LOCATION_REQUEST_KEY);
  } catch {
    // Nothing stored or storage unavailable.
  }
}
