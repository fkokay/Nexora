import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { pickBlock } from "./canvasHitTest";
import { canvasFrameUrl, parseCanvasMessage, previewStateMessage, reloadMessage, showTabMessage, tabBoxOf, type CanvasBlock } from "./erpCanvasProtocol";

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
  /** Yalnız ERP'ye hiç bağlanılamadığında (ready zaman aşımı): kalıcı olarak yerleşik tuvale dönülür. */
  onUnavailable: (reason: string) => void;
  /** ERP sayfası yüklenemedi (`error`): tuval açık kalır, sonraki revizyonda yeniden denenir. Sonraki düzen gelince `null`. */
  onError: (message: string | null) => void;
  /**
   * Seçim katmanının üstüne çizilen ek denetimler (Kayıt kartı). Yalnız "Seç" kipinde çizilir; `showTab` ERP'ye sekme gösterme
   * isteği yollar ve istek, ERP belgesi yeniden açıldığında (ready) yinelenir.
   */
  overlay?: (frame: { blocks: CanvasBlock[]; showTab: (tabsId: string, index: number) => void }) => ReactNode;
  /** Belge kalıbı: tuvalin örnek belgesinin durumu ("Önizlenen durum"); değişince ve ERP belgesi yeniden açılınca gönderilir. */
  previewState?: string | null;
  /**
   * Kaplamasız tuvalde (serbest gövde) gösterilmesi istenen sekme: değişince (ya da `key` değişince) `showTab` yollanır; istek
   * overlay'deki gibi ERP belgesi yeniden açıldığında yinelenir.
   */
  tabRequest?: { tabsId: string; index: number; key?: string } | null;
};

const READY_TIMEOUT_MS = 10_000;
const AUTH_RESEND_MS = 1_000;
const FALLBACK_MESSAGE = "ERP önizlemesine bağlanılamadı, yerleşik önizleme gösteriliyor.";
const DEVICE_WIDTH = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;
const INITIAL_HEIGHT = 600;
/** Kaplamalı tuvalde ERP sayfasının altındaki boşluk (px). */
export const OVERLAY_BOTTOM_SPACE = 44;

export default function ErpCanvasFrame(props: Props) {
  const { platformOrigin, token, tenant, target, revision, device, selectedId, interactive } = props;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const lastRevision = useRef(-1);
  const readySeen = useRef(false);
  const errored = useRef(false);
  const handlers = useRef(props);
  handlers.current = props;
  const shownTabs = useRef(new Map<string, number>());
  const showTab = useCallback((tabsId: string, index: number) => {
    const message = showTabMessage(tabsId, index);
    shownTabs.current.set(tabsId, index);
    iframeRef.current?.contentWindow?.postMessage(message, platformOrigin);
  }, [platformOrigin]);

  useEffect(() => {
    readySeen.current = false;
    errored.current = false;
    lastRevision.current = -1;
    shownTabs.current = new Map();
    setBlocks([]);
    setHoverId(null);
    let authTimer: number | undefined;
    const stopAuth = () => {
      if (authTimer !== undefined) window.clearInterval(authTimer);
      authTimer = undefined;
    };
    const timer = window.setTimeout(() => {
      stopAuth();
      if (!readySeen.current) handlers.current.onUnavailable(FALLBACK_MESSAGE);
    }, READY_TIMEOUT_MS);
    // ERP dinleyicisini iframe load olayından sonra kaydedebilir; ready gelene kadar oturum bilgisini yeniden gönder.
    authTimer = window.setInterval(() => {
      const { token: t, tenant: tn } = handlers.current;
      iframeRef.current?.contentWindow?.postMessage({ type: "NEXORA_STUDIO_AUTH", token: t, tenant: tn }, platformOrigin);
    }, AUTH_RESEND_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== platformOrigin || event.source !== iframeRef.current?.contentWindow) return;
      const msg = parseCanvasMessage(event.data);
      if (!msg) return;
      if (msg.type === "ready") {
        readySeen.current = true;
        // Taze ERP belgesi revision'ı 0'dan başlatır; eski belgeden kalan sayaç yeni layout'ları düşürmesin.
        lastRevision.current = msg.revision;
        setBlocks([]);
        setHoverId(null);
        window.clearTimeout(timer);
        stopAuth();
        // Taze ERP belgesi ilk sekmeden başlar: Studio'nun gösterdiği sekmeler yeniden istenir.
        for (const [tabsId, index] of shownTabs.current) iframeRef.current?.contentWindow?.postMessage(showTabMessage(tabsId, index), platformOrigin);
        // Belge kalıbı: taze ERP belgesi Taslak'tan başlar; seçili önizleme durumu yeniden istenir.
        const state = handlers.current.previewState;
        if (state) iframeRef.current?.contentWindow?.postMessage(previewStateMessage(state), platformOrigin);
      } else if (msg.type === "layout") {
        if (msg.revision < lastRevision.current) return;
        lastRevision.current = msg.revision;
        setHeight(msg.height);
        setBlocks(msg.blocks);
        handlers.current.onBlocks?.(msg.blocks);
        if (errored.current) { errored.current = false; handlers.current.onError(null); }
      } else if (msg.type === "error") {
        if (msg.revision < lastRevision.current) return;
        lastRevision.current = msg.revision;
        // Hata sayfasında bileşen yoktur: eski bloklar seçilemesin; yükseklik korunur.
        setBlocks([]);
        setHoverId(null);
        handlers.current.onBlocks?.([]);
        errored.current = true;
        handlers.current.onError(msg.message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(timer);
      stopAuth();
      window.removeEventListener("message", onMessage);
    };
  }, [platformOrigin, target.previewId, target.systemScreenKey]);

  const previewState = props.previewState ?? null;
  useEffect(() => {
    if (previewState) iframeRef.current?.contentWindow?.postMessage(previewStateMessage(previewState), platformOrigin);
  }, [previewState, platformOrigin]);
  // Etkiler sırayla çalışır: yukarıdaki sıfırlamadan (yeni hedef) sonra istenen sekme yeniden kaydedilir.
  const tabRequest = props.tabRequest;
  const tabRequestKey = tabRequest ? JSON.stringify([tabRequest.tabsId, tabRequest.index, tabRequest.key ?? ""]) : null;
  useEffect(() => {
    if (tabRequest) showTab(tabRequest.tabsId, tabRequest.index);
  }, [tabRequestKey, showTab, platformOrigin, target.previewId, target.systemScreenKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Sekme düğmesi kutuları ("<tabsId>#tab<i>") bileşen değildir: seçilmez, üstüne gelince çizilmez.
  const pickable = blocks.filter((b) => !tabBoxOf(b.id));
  const selected = selectedId ? blocks.find((b) => b.id === selectedId) : undefined;
  const hovered = hoverId && hoverId !== selectedId ? blocks.find((b) => b.id === hoverId) : undefined;
  const box = (b: CanvasBlock, className: string) => (
    <div className={className} style={{ left: b.x, top: b.y, width: b.width, height: b.height }} />
  );

  return (
    // Kaplama ERP sayfasının altına da denetim koyar ("+ Bölüm ekle"); kırpılmasın diye altta yer açılır.
    <div className="pd-erp-canvas" style={{ width: DEVICE_WIDTH[device], paddingBottom: props.overlay && !interactive ? OVERLAY_BOTTOM_SPACE : undefined }} data-device={device}>
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
          props.onSelect(pickBlock(pickable, p.x, p.y));
        }}
        onMouseMove={(event) => {
          const p = localPoint(event);
          setHoverId(pickBlock(pickable, p.x, p.y));
        }}
        onMouseLeave={() => setHoverId(null)}
      >
        {hovered && box(hovered, "pd-erp-canvas-hover")}
        {selected && box(selected, "pd-erp-canvas-selected")}
        {!interactive && props.overlay?.({ blocks, showTab })}
      </div>
    </div>
  );
}
