// Tuvaldeki yalıtılmış kod bileşeni ve taklit köprü ana sayfası (protokol: codeBridgeStub.ts).
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { MAX_IN_FLIGHT, MAX_PER_MINUTE, RATE_LIMITED, answerStubRequest, codePreviewDocument, fail, type Reply, type StubHostData } from "./codeBridgeStub";

type FrameProps = { title: string; css: string; javascript: string; hidden: boolean; className: string; style?: CSSProperties; host: MutableRefObject<StubHostData> };

/** Tuvaldeki kod bileşeni: yalıtılmış iframe + taklit köprü ana sayfası. Görünmez bileşen kesik çizgili bir çip olarak gösterilir. */
export function CodePreviewFrame({ title, css, javascript, hidden, className, style, host }: FrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const srcDoc = codePreviewDocument(css, javascript);
  useEffect(() => {
    setHeight(null);
    let inFlight = 0;
    const stamps: number[] = [];
    let active = true;
    const listener = (event: MessageEvent) => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame) return;
      const data = event.data as unknown;
      if (!data || typeof data !== "object" || (data as { nx?: unknown }).nx !== 1) return;
      const request = data as Record<string, unknown>;
      if (typeof request.id !== "number") return; // beforeSave yanıtları tasarımcıda istenmez.
      const post = (reply: Reply) => { if (!active) return; try { frame.postMessage({ nx: 1, replyTo: request.id, ...reply }, "*"); } catch { /* çerçeve kaldırıldı */ } };
      const now = Date.now();
      while (stamps.length > 0 && now - stamps[0] >= 60_000) stamps.shift();
      if (inFlight >= MAX_IN_FLIGHT || stamps.length >= MAX_PER_MINUTE) { post(fail(RATE_LIMITED)); return; }
      stamps.push(now);
      inFlight += 1;
      try {
        let outcome: ReturnType<typeof answerStubRequest>;
        try { outcome = answerStubRequest(request, host.current, (px) => { if (active) setHeight(px); }); }
        catch { outcome = { reply: fail("İstek işlenemedi.") }; }
        post(outcome.reply);
        if (request.type === "on" && request.event === "load" && outcome.reply.ok && active) {
          try { frame.postMessage({ nx: 1, event: "load", payload: {} }, "*"); } catch { /* çerçeve kaldırıldı */ }
        }
      } finally { inFlight -= 1; }
    };
    window.addEventListener("message", listener);
    return () => { active = false; window.removeEventListener("message", listener); };
  }, [srcDoc, host]);
  const frameStyle: CSSProperties = hidden
    ? { position: "absolute", width: 0, height: 0, border: 0, opacity: 0, pointerEvents: "none" }
    : height !== null ? { ...style, height } : style ?? {};
  const frame = <iframe ref={frameRef} className={hidden ? undefined : className} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer" style={frameStyle} srcDoc={srcDoc} tabIndex={hidden ? -1 : undefined} aria-hidden={hidden || undefined} />;
  if (!hidden) return frame;
  return <div className="pd-query-manual" style={{ position: "relative", justifySelf: "start", width: "fit-content", maxWidth: "100%", margin: style?.margin }}>Görünmez kod: {title}{frame}</div>;
}
