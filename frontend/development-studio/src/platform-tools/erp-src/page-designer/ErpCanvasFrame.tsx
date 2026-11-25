import { useEffect, useRef, useState, type MouseEvent } from "react";
import { pickBlock } from "./canvasHitTest";
import { canvasFrameUrl, parseCanvasMessage, reloadMessage, type CanvasBlock } from "./erpCanvasProtocol";

export type CanvasTenant = { id: string; name: string; slug: string; role: string };

type Props = {
  platformOrigin: string;
  token: string;
  tenant: CanvasTenant;
  target: { previewId: string; systemScreenKey?: string };
  revision: number;
  device: "desktop" | "tablet" | "mobile";
  topLevelIds: string[];
  selectedId: string | null;
  interactive: boolean;
  onSelect: (id: string | null) => void;
  onBlocks?: (blocks: CanvasBlock[]) => void;
  onUnavailable: (reason: string) => void;
};

const READY_TIMEOUT_MS = 10_000;
const FALLBACK_MESSAGE = "ERP önizlemesine bağlanılamadı, yerleşik önizleme gösteriliyor.";
const DEVICE_WIDTH = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;
const INITIAL_HEIGHT = 600;

export default function ErpCanvasFrame(props: Props) {
  const { platformOrigin, token, tenant, target, revision, device, selectedId, interactive } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const lastRevision = useRef(-1);
  const readySeen = useRef(false);
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    readySeen.current = false;
    lastRevision.current = -1;
    const timer = window.setTimeout(() => {
      if (!readySeen.current) handlers.current.onUnavailable(FALLBACK_MESSAGE);
    }, READY_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== platformOrigin || event.source !== iframeRef.current?.contentWindow) return;
      const msg = parseCanvasMessage(event.data);
      if (!msg) return;
      if (msg.type === "ready") {
        readySeen.current = true;
        window.clearTimeout(timer);
      } else if (msg.type === "layout") {
        if (msg.revision < lastRevision.current) return;
        lastRevision.current = msg.revision;
        setHeight(msg.height);
        setBlocks(msg.blocks);
        handlers.current.onBlocks?.(msg.blocks);
      } else if (msg.type === "error") {
        handlers.current.onUnavailable(msg.message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [platformOrigin, target.previewId, target.systemScreenKey]);

  const sentRevision = useRef(revision);
  useEffect(() => {
    if (sentRevision.current === revision) return;
    sentRevision.current = revision;
    iframeRef.current?.contentWindow?.postMessage(reloadMessage(revision), platformOrigin);
  }, [revision, platformOrigin]);

  const localPoint = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const selected = selectedId ? blocks.find((b) => b.id === selectedId) : undefined;
  const hovered = hoverId && hoverId !== selectedId ? blocks.find((b) => b.id === hoverId) : undefined;
  const box = (b: CanvasBlock, className: string) => (
    <div className={className} style={{ left: b.x, top: b.y, width: b.width, height: b.height }} />
  );

  return (
    <div className="pd-erp-canvas" style={{ width: DEVICE_WIDTH[device] }} data-device={device}>
      <iframe
        ref={iframeRef}
        className="pd-erp-canvas-frame"
        title="ERP sayfa önizlemesi"
        src={canvasFrameUrl(platformOrigin, target)}
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ height: `${height}px` }}
        onLoad={(event) =>
          event.currentTarget.contentWindow?.postMessage({ type: "NEXORA_STUDIO_AUTH", token, tenant }, platformOrigin)
        }
      />
      <div
        className="pd-erp-canvas-overlay"
        style={{ pointerEvents: interactive ? "none" : "auto" }}
        onClick={(event) => {
          const p = localPoint(event);
          props.onSelect(pickBlock(blocks, p.x, p.y));
        }}
        onMouseMove={(event) => {
          const p = localPoint(event);
          setHoverId(pickBlock(blocks, p.x, p.y));
        }}
        onMouseLeave={() => setHoverId(null)}
      >
        {hovered && box(hovered, "pd-erp-canvas-hover")}
        {selected && box(selected, "pd-erp-canvas-selected")}
      </div>
    </div>
  );
}
