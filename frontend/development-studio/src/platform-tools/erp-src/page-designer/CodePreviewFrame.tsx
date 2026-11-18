// Tuvaldeki yalıtılmış kod bileşeni ve taklit köprü ana sayfası (protokol: codeBridgeStub.ts).
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { MAX_PER_MINUTE, RATE_LIMITED, RATE_WINDOW_MS, answerStubRequest, codePreviewDocument, createBridgeNonce, fail, type Reply, type StubHostData } from "./codeBridgeStub";

type FrameProps = { title: string; css: string; javascript: string; hidden: boolean; className: string; style?: CSSProperties; host: MutableRefObject<StubHostData> };

/**
 * Tuvaldeki kod bileşeni: yalıtılmış iframe + taklit köprü ana sayfası. Görünmez bileşen kesik çizgili bir çip olarak
 * gösterilir. ERP CodeFrame ile aynı güvenlik kuralları: ileti yalnız bu çerçeveden (`event.source`) ve belge başına
 * anahtarla (`k`) gelirse işlenir; ikinci `load` (çerçeve başka belgeye yönlendi) köprüyü kalıcı olarak kapatır.
 * Kalan risk: itilen `load` olayı yönlenen belgeye ikinci load gelene kadar ulaşabilir (yalnız boş yük taşır).
 */
export function CodePreviewFrame({ title, css, javascript, hidden, className, style, host }: FrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  // Yeni kod: yeni anahtar ve taze iframe öğesi (yeni React anahtarı); yönlenip kapanmış çerçeve yalnız böyle sıfırlanır.
  const generationRef = useRef(0);
  const { srcDoc, nonce, generation } = useMemo(() => {
    generationRef.current += 1;
    const key = createBridgeNonce();
    return { srcDoc: codePreviewDocument(css, javascript, key), nonce: key, generation: generationRef.current };
  }, [css, javascript]);
  // Düzen etkisi: dinleyici iframe'i ekleyen aynı commit'te bağlanır; çerçevenin ilk iletisi kaybolmaz. hidden değişince
  // sarmalayıcı değişir ve iframe öğesi yeniden kurulur; dinleyici ve load izleyicisi yeni öğeye bağlanır.
  useLayoutEffect(() => {
    setHeight(null);
    const stamps: number[] = [];
    let active = true;
    let loadSent = false;
    const frameElement = frameRef.current;
    const target = () => frameRef.current?.contentWindow ?? null;
    const send = (message: Record<string, unknown>) => {
      if (!active) return;
      const frame = target();
      if (!frame) return;
      try { frame.postMessage({ ...message, k: nonce }, "*"); } catch { /* çerçeve kaldırıldı */ }
    };
    const listener = (event: MessageEvent) => {
      const frame = target();
      if (!frame || event.source !== frame) return;
      // Ucuz ön denetim (biçim ve belge anahtarı) boyut denetiminden ve hız sınırından önce.
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object" || data.nx !== 1 || data.k !== nonce) return;
      if (typeof data.id !== "number") return; // beforeSave yanıtları tasarımcıda istenmez.
      const id = data.id;
      const post = (reply: Reply) => send({ nx: 1, replyTo: id, ...reply });
      // setHeight ve on kotadan muaf (ERP ile aynı); geçerli biçim ve boyut yine gerekir.
      if (data.type !== "setHeight" && data.type !== "on") {
        const now = Date.now();
        while (stamps.length > 0 && now - stamps[0] >= RATE_WINDOW_MS) stamps.shift();
        if (stamps.length >= MAX_PER_MINUTE) { post(fail(RATE_LIMITED)); return; }
        stamps.push(now);
      }
      let outcome: ReturnType<typeof answerStubRequest>;
      try { outcome = answerStubRequest(data, host.current, (px) => { if (active) setHeight(px); }); }
      catch { outcome = { reply: fail("İstek işlenemedi.") }; }
      post(outcome.reply);
      // Taklit sayfa hemen "yüklenmiş" sayılır: load, çerçeve başına bir kez, abonelik yanıtından sonra gider.
      if (data.type === "on" && data.event === "load" && outcome.reply.ok && !loadSent) {
        loadSent = true;
        send({ nx: 1, event: "load", payload: {} });
      }
    };
    let loads = 0;
    const shutdown = () => {
      if (!active) return;
      active = false;
      window.removeEventListener("message", listener);
      frameElement?.removeEventListener("load", onLoad);
    };
    // srcdoc belgesi tek bir load verir; ikinci load çerçevenin başka belgeye yönlendiği anlamına gelir.
    function onLoad() {
      loads += 1;
      if (loads > 1) shutdown();
    }
    frameElement?.addEventListener("load", onLoad);
    window.addEventListener("message", listener);
    return shutdown;
  }, [srcDoc, nonce, host, hidden]);
  const frameStyle: CSSProperties = hidden
    ? { position: "absolute", width: 0, height: 0, border: 0, opacity: 0, pointerEvents: "none" }
    : height !== null ? { ...style, height } : style ?? {};
  const frame = <iframe key={generation} ref={frameRef} className={hidden ? undefined : className} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" style={frameStyle} srcDoc={srcDoc} tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined} />;
  if (!hidden) return frame;
  return <div className="pd-query-manual" style={{ position: "relative", justifySelf: "start", width: "fit-content", maxWidth: "100%", margin: style?.margin }}>Görünmez kod: {title}{frame}</div>;
}
