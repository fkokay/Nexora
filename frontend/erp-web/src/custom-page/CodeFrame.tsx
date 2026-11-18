import { type CSSProperties, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRateLimiter, handleBridgeRequest, isolatedCodeDocument, parseBridgeRequest, type BridgeEvent, type BridgeHost } from "./codeBridge";
import type { BeforeSaveVerdict, PageEventFrame, PageEvents } from "./pageEvents";

export const RATE_LIMIT_MESSAGE = "Çok fazla istek; biraz bekleyin.";
const DEFAULT_CANCEL_MESSAGE = "Kod bileşeni işlemi iptal etti.";
const MAX_CANCEL_MESSAGE = 500;

/**
 * Yalıtılmış kod bileşeni çerçevesi ve köprünün sayfa tarafı. `sandbox="allow-scripts"` (asla allow-same-origin)
 * nedeniyle çerçevenin kökeni opaktır; bu yüzden yanıtlar `"*"` hedefiyle gider ve hiçbir zaman sır (belirteç, başka
 * bileşenin kodu) içermez. İleti yalnız `event.source === iframe.contentWindow` (boş olmayan) ise işlenir.
 */
export function CodeFrame({ id, css, javascript, hidden, style, title, host, events }: {
  id: string; css: string; javascript: string; hidden: boolean; style?: CSSProperties; title: string; host: BridgeHost; events: PageEvents;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Çalışma zamanı her çizimde yeniden kurulur; host en güncelden okunur, dinleyici yalnız belge değişince yeniden bağlanır.
  const hostRef = useRef(host);
  hostRef.current = host;
  const [height, setHeight] = useState<number | null>(null);
  const srcDoc = useMemo(() => isolatedCodeDocument(css, javascript), [css, javascript]);
  // Yeni kod gelince taze bir iframe öğesi (yeni anahtar) kurulur; yönlenip kapanmış çerçeve yalnız böyle sıfırlanır.
  const generationRef = useRef(0);
  const generation = useMemo(() => { generationRef.current += 1; return generationRef.current; }, [srcDoc]);

  // Düzen etkisi: dinleyici, iframe’i ekleyen aynı commit’te bağlanır; çerçevenin ilk satırdaki iletisi kaybolmaz.
  useLayoutEffect(() => {
    let disposed = false;
    const limiter = createRateLimiter(() => Date.now());
    const subscriptions = new Set<BridgeEvent>();
    const asks = new Map<number, (verdict: BeforeSaveVerdict) => void>();
    let askSequence = 0;
    const target = () => frameRef.current?.contentWindow ?? null;
    const post = (message: unknown) => {
      if (disposed) return;
      const frameWindow = target();
      if (!frameWindow) return;
      try { frameWindow.postMessage(message, "*"); } catch { /* klonlanamayan yanıt ya da kalkan çerçeve: düşer */ }
    };
    const endpoint: PageEventFrame = {
      subscribed: (event) => !disposed && subscriptions.has(event),
      post,
      ask: (query) => new Promise<BeforeSaveVerdict>((resolve) => {
        if (disposed) { resolve(null); return; }
        askSequence += 1;
        asks.set(askSequence, resolve);
        post({ nx: 1, event: "beforeSave", payload: { query }, ask: askSequence });
      }),
    };
    const bridgeHost: BridgeHost = {
      get: (path) => hostRef.current.get(path),
      setInput: (name, value) => hostRef.current.setInput(name, value),
      runQuery: (name) => hostRef.current.runQuery(name),
      callOperation: (name, values) => hostRef.current.callOperation(name, values),
      subscribe: (event) => {
        const known = event as BridgeEvent;
        const first = !subscriptions.has(known);
        subscriptions.add(known);
        hostRef.current.subscribe(event);
        // Sayfa zaten yüklendiyse load, abonelik yanıtından sonra bu çerçeveye iletilir.
        if (first && known === "load" && events.isLoaded()) setTimeout(() => post({ nx: 1, event: "load", payload: {} }), 0);
      },
      setHeight: (px) => { if (!disposed) setHeight(px); hostRef.current.setHeight(px); },
    };

    const onMessage = (event: MessageEvent) => {
      const frameWindow = target();
      if (!frameWindow || event.source !== frameWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (data && typeof data === "object" && data.nx === 1 && typeof data.answer === "number" && !("type" in data)) {
        const resolve = asks.get(data.answer);
        if (!resolve) return;
        asks.delete(data.answer);
        const message = typeof data.message === "string" && data.message.trim() ? data.message.trim().slice(0, MAX_CANCEL_MESSAGE) : DEFAULT_CANCEL_MESSAGE;
        resolve(data.cancel === true ? { cancel: true, message } : null);
        return;
      }
      const request = parseBridgeRequest(data);
      if (!request) return;
      if ("error" in request) {
        if (request.id !== undefined) post({ nx: 1, replyTo: request.id, ok: false, error: request.error });
        return;
      }
      if (!limiter.tryAcquire()) { post({ nx: 1, replyTo: request.id, ok: false, error: RATE_LIMIT_MESSAGE }); return; }
      void handleBridgeRequest(request, bridgeHost)
        .then((reply) => post({ nx: 1, replyTo: request.id, ...reply }))
        .finally(() => limiter.release());
    };

    const frameElement = frameRef.current;
    let shutDown = false;
    let unregister = () => undefined as void;
    const shutdown = () => {
      if (shutDown) return;
      shutDown = true;
      disposed = true;
      window.removeEventListener("message", onMessage);
      frameElement?.removeEventListener("load", onLoad);
      unregister();
      // Bekleyen sorular null ile çözülür; uçuştaki isteklerin yanıtları `disposed` nedeniyle düşer (yönlenen belgeye veri gitmez).
      asks.forEach((resolve) => resolve(null));
      asks.clear();
    };
    // srcdoc belgesi tek bir load verir. İkinci load, çerçevenin kendini başka bir belgeye yönlendirdiği anlamına gelir
    // (aynı contentWindow korunur, event.source denetimi tek başına yetmez): köprü bu çerçeve için kalıcı olarak kapanır.
    let loads = 0;
    function onLoad() {
      loads += 1;
      if (loads > 1) shutdown();
    }
    frameElement?.addEventListener("load", onLoad);
    window.addEventListener("message", onMessage);
    unregister = events.register(endpoint);
    return shutdown;
  }, [events, srcDoc]);

  const frameStyle: CSSProperties = hidden ? { display: "none" } : { ...style, ...(height !== null ? { height: `${height}px` } : {}) };
  return <iframe key={generation} ref={frameRef} data-component-id={id} className="tenant-page-code-frame" style={frameStyle} title={title}
    sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={srcDoc} aria-hidden={hidden || undefined} />;
}
