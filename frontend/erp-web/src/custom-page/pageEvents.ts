import type { BridgeEvent } from "./codeBridge";

export const BEFORE_SAVE_TIMEOUT_MS = 3000;
export const BEFORE_SAVE_TIMEOUT_MESSAGE = "Kod bileşeni yanıt vermedi; işlem iptal edildi.";

export type BeforeSaveVerdict = { cancel: true; message: string } | null;

/** Sayfaya kayıtlı bir kod çerçevesi (CodeFrame): abonelikleri, ileti gönderimi ve beforeSave sorusu. */
export type PageEventFrame = {
  subscribed(event: BridgeEvent): boolean;
  /** Çerçeveye olay iletisi gönderir; çerçeve kalktıysa sessizce düşer. */
  post(message: Record<string, unknown>): void;
  /** beforeSave sorusu; çerçeve kalkarsa ya da `signal` iptal edilirse (süre doldu) null ile çözülür ve bekleyen soru silinir. */
  ask(query: string, signal: AbortSignal): Promise<BeforeSaveVerdict>;
};

export type PageEvents = {
  emit(event: "load" | "select" | "afterSave", payload: unknown): void;
  /** Abone tüm çerçevelere sorar; toplam 3000 ms içinde yanıt yoksa yazma iptal edilir. İlk iptal eden kazanır. */
  beforeSave(query: string): Promise<BeforeSaveVerdict>;
  register(frame: PageEventFrame): () => void;
  /** `load` en az bir kez yayımlandı mı (sonradan abone olan çerçeveye `load` hemen iletilir). */
  isLoaded(): boolean;
};

/** Sayfadaki kod çerçeveleri arası olay merkezi. Yükler JSON'a çevrilerek klonlanır; çerçeveye yalnız veri gider. */
export function createPageEvents(): PageEvents {
  const frames = new Set<PageEventFrame>();
  let loaded = false;
  return {
    emit(event, payload) {
      if (event === "load") loaded = true;
      let cloned: unknown;
      try { cloned = payload === undefined ? null : JSON.parse(JSON.stringify(payload)); } catch { return; }
      for (const frame of [...frames]) if (frame.subscribed(event)) frame.post({ nx: 1, event, payload: cloned });
    },
    beforeSave(query) {
      const askers = [...frames].filter((frame) => frame.subscribed("beforeSave"));
      if (askers.length === 0) return Promise.resolve(null);
      return new Promise<BeforeSaveVerdict>((resolve) => {
        const deadline = new AbortController();
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          resolve({ cancel: true, message: BEFORE_SAVE_TIMEOUT_MESSAGE });
          // Süresi dolan sorular çerçevelerde silinir (geç yanıt beklenmez, bekleyen girdi sızmaz).
          deadline.abort();
        }, BEFORE_SAVE_TIMEOUT_MS);
        void Promise.all(askers.map((frame) => frame.ask(query, deadline.signal).catch((): BeforeSaveVerdict => null)))
          .then((verdicts) => {
            if (settled) return;
            clearTimeout(timer);
            resolve(verdicts.find((verdict) => verdict !== null) ?? null);
          });
      });
    },
    register(frame) {
      frames.add(frame);
      return () => { frames.delete(frame); };
    },
    isLoaded: () => loaded,
  };
}
