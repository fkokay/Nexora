/**
 * Görüntüle on screens whose Aç (Düzenle) opens a record form (RecordFormPage): the bar runs the same Aç action after
 * arming a one-shot "view" request; the next edit-mode record form that mounts takes it and opens read-only. The request
 * expires (the Aç action may have opened something else) and Düzenle clears it.
 */
const TTL_MS = 10_000;
/** A form that mounts twice in a row (keep-alive, StrictMode) takes the same request again within this window. */
const REMOUNT_MS = 1_000;
let armedAt = 0;
let takenAt = 0;

export function armRecordView(now = Date.now()) {
  armedAt = now;
  takenAt = 0;
}

export function clearRecordView() {
  armedAt = 0;
  takenAt = 0;
}

/** True for a request armed within the last few seconds (and for an immediate remount of the form that took it). */
export function takeRecordView(now = Date.now()): boolean {
  if (armedAt !== 0 && now - armedAt <= TTL_MS) {
    armedAt = 0;
    takenAt = now;
    return true;
  }
  armedAt = 0;
  return takenAt !== 0 && now - takenAt <= REMOUNT_MS;
}
