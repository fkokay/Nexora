import { useLayoutEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import {
  createBridgeNonce, createRateLimiter, handleBridgeRequest, isolatedCodeDocument, parseBridgeRequest, type BridgeHost,
} from "./previewBridge";
import { DEFAULT_HEIGHT, sampleSettingValues, type ComponentSetting } from "./componentFormModel";

export const PREVIEW_NO_DATA = "Önizlemede sayfa verisi yok.";
export const RATE_LIMIT_MESSAGE = "Çok fazla istek; biraz bekleyin.";
const SETTINGS_PREFIX = "ayarlar.";

type SampleValues = Record<string, string | number | boolean | null>;

/**
 * Önizlemenin sayfa tarafı (Karar 4): `get("ayarlar.<ad>")` örnek (varsayılan) değeri, başka her `get` null döner;
 * `runQuery` ve `callOperation` "Önizlemede sayfa verisi yok." hatasıyla reddedilir. Hiçbir istek ağa çıkmaz,
 * belirteç ya da firma verisi kullanılmaz.
 */
export function previewBridgeHost(values: SampleValues, setHeight: (px: number) => void): BridgeHost {
  return {
    get: path => {
      if (!path.startsWith(SETTINGS_PREFIX)) return null;
      const name = path.slice(SETTINGS_PREFIX.length);
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
    },
    setInput: () => undefined,
    runQuery: async () => { throw new Error(PREVIEW_NO_DATA); },
    callOperation: async () => { throw new Error(PREVIEW_NO_DATA); },
    subscribe: () => undefined,
    setHeight,
  };
}

const display = (setting: ComponentSetting, value: string | number | boolean | null) =>
  setting.type === "bool" ? (value === true ? "Evet" : "Hayır") : value === null ? "—" : String(value);

type Run = { generation: number; srcDoc: string; nonce: string; height: number; values: SampleValues };

/**
 * Yazılımcı ekranında bileşen önizlemesi: erp-web CodeFrame'in Studio eşi. `sandbox="allow-scripts"` (asla
 * allow-same-origin) ile opak kökenli çerçeve, aynı CSP'li belge (harici kaynak ve bağlantı yok). İleti yalnız
 * `event.source === iframe.contentWindow` ve belge anahtarı doğruysa yanıtlanır; ikinci load'da (çerçeve başka belgeye
 * yönlendi) köprü kapanır. Kod yalnız "Çalıştır" ile, o anki CSS/JS ve örnek ayar değerleriyle çizilir.
 */
export function ComponentPreview({ css, javascript, height, settings }: {
  css: string; javascript: string; height?: number; settings: ComponentSetting[];
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const values = sampleSettingValues(settings);

  const start = () => {
    const nonce = createBridgeNonce();
    setFrameHeight(null);
    setRun(current => ({
      generation: (current?.generation ?? 0) + 1,
      srcDoc: isolatedCodeDocument(css, javascript, nonce),
      nonce, height: height ?? DEFAULT_HEIGHT, values,
    }));
  };

  useLayoutEffect(() => {
    if (!run) return;
    let disposed = false;
    const limiter = createRateLimiter(() => Date.now());
    const target = () => frameRef.current?.contentWindow ?? null;
    const post = (message: Record<string, unknown>) => {
      if (disposed) return;
      const frameWindow = target();
      if (!frameWindow) return;
      try { frameWindow.postMessage({ ...message, k: run.nonce }, "*"); } catch { /* klonlanamayan yanıt ya da kalkan çerçeve */ }
    };
    const sample = previewBridgeHost(run.values, px => { if (!disposed) setFrameHeight(px); });
    const host: BridgeHost = {
      ...sample,
      // Önizlemede sayfa hemen "yüklenmiş" sayılır: load'a abone olan bileşen çizilebilsin.
      subscribe: event => { if (event === "load") setTimeout(() => post({ nx: 1, event: "load", payload: {} }), 0); },
    };
    const onMessage = (event: MessageEvent) => {
      const frameWindow = target();
      if (!frameWindow || event.source !== frameWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object" || data.nx !== 1 || data.k !== run.nonce) return;
      const request = parseBridgeRequest(data);
      if (!request) return;
      if ("error" in request) {
        if (request.id !== undefined) post({ nx: 1, replyTo: request.id, ok: false, error: request.error });
        return;
      }
      const metered = request.type !== "setHeight" && request.type !== "on";
      if (metered && !limiter.tryAcquire()) { post({ nx: 1, replyTo: request.id, ok: false, error: RATE_LIMIT_MESSAGE }); return; }
      void handleBridgeRequest(request, host)
        .then(reply => post({ nx: 1, replyTo: request.id, ...reply }))
        .finally(() => { if (metered) limiter.release(); });
    };
    const frameElement = frameRef.current;
    let loads = 0;
    const shutdown = () => {
      disposed = true;
      window.removeEventListener("message", onMessage);
      frameElement?.removeEventListener("load", onLoad);
    };
    function onLoad() { loads += 1; if (loads > 1) shutdown(); }
    frameElement?.addEventListener("load", onLoad);
    window.addEventListener("message", onMessage);
    return shutdown;
  }, [run]);

  return (
    <div className="sp-cw-prev">
      <div className="sp-cw-prev-head">
        <b>Önizle</b>
        <button type="button" className="ns-btn ns-btn-sm sp-cw-dev" onClick={start}><Play size={14} /> Çalıştır</button>
      </div>
      <div className="sp-cw-prev-frame">
        {run ? (
          <iframe
            key={run.generation} ref={frameRef} title="Bileşen önizlemesi" className="sp-cw-prev-iframe"
            style={{ height: `${frameHeight ?? run.height}px` }}
            sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={run.srcDoc}
          />
        ) : (
          <p className="sp-cw-hint">Çalıştır'a basınca bileşen burada örnek ayar değerleriyle çizilir.</p>
        )}
      </div>
      <div className="sp-cw-prev-body">
        <span className="ns-field-label">Örnek ayar değerleri</span>
        {settings.length === 0 && <p className="sp-cw-hint">Ayar yok.</p>}
        {settings.map((setting, index) => (
          <div className="sp-cw-prev-row" key={`${setting.name}-${index}`}>
            <span>{setting.label || setting.name}</span>
            <span className="sp-cw-hint">{display(setting, values[setting.name] ?? null)}</span>
          </div>
        ))}
        <p className="sp-cw-hint">
          Önizlemede sayfa verisi yok: <code>runQuery</code> ve <code>callOperation</code> boş yanıt döner. Firma verisine dokunulmaz.
        </p>
      </div>
    </div>
  );
}
