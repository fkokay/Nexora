/** Paylaşılan uçuş yuvası: aynı anda yalnız bir iş çalışır. */
export type FlightSlot<T> = { current: Promise<T> | null };

/**
 * Tek uçuşlu çalıştırma: yuvada süren bir iş varsa önce onun bitmesi beklenir (hatası yutulur). Bekleyen çağıran
 * `afterWait` ile yeniden karar verir: bir değer dönerse iş çalıştırılmadan o değer döner (ör. değişiklik kalmadıysa son
 * kaydedilen taslak); `undefined` dönerse iş sırayla çalışır. Böylece iki kayıt aynı `expectedRevision` ile ya da aynı kodla
 * iki kez gönderilmez.
 */
export async function runSingleFlight<T>(slot: FlightSlot<T>, task: () => Promise<T>, afterWait?: () => T | undefined): Promise<T> {
  let waited = false;
  while (slot.current) {
    waited = true;
    await slot.current.catch(() => undefined);
  }
  if (waited && afterWait) {
    const reuse = afterWait();
    if (reuse !== undefined) return reuse;
  }
  const run = task();
  slot.current = run;
  try {
    return await run;
  } finally {
    if (slot.current === run) slot.current = null;
  }
}
