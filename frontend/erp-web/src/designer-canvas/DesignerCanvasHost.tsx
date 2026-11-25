import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CanvasAnchorContext } from './anchorContext';
import { CANVAS_PROTOCOL, CANVAS_VERSION, collectBlocks, parseStudioCanvasMessage, type CanvasParams, type CanvasToStudio } from './canvasProtocol';
import './designer-canvas.css';

const TenantCustomPage = lazy(() => import('../TenantCustomPage'));
// Yalnızca sayfa yükleme hatası (tenant-custom-page-state); blok sorgu hataları (tenant-page-query-error) düzeni durdurmaz.
const ERROR_SELECTOR = '.tenant-custom-page-state.tenant-custom-page-error';
// Sayfa yüklenirken (her yeniden yüklemede kısa süre) düzen gönderilmez; Studio son yükseklik ve blokları korur.
const LOADING_SELECTOR = '.tenant-custom-page-state:not(.tenant-custom-page-error)';

export default function DesignerCanvasHost({ token, params, studioOrigin }: { token: string; params: CanvasParams; studioOrigin: string }) {
  const [revision, setRevision] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef(0);
  const notifyRef = useRef<() => void>(() => {});

  useEffect(() => {
    const send = (message: CanvasToStudio) => window.parent.postMessage(message, studioOrigin);
    send({ nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: 'ready', revision: 0 });

    let frame = 0;
    let lastError: string | null = null;
    const notify = () => {
      frame = 0;
      const root = rootRef.current;
      if (!root) return;
      const current = revisionRef.current;
      const errorText = root.querySelector(ERROR_SELECTOR)?.textContent?.trim() ?? null;
      if (errorText) {
        const key = `${current}:${errorText}`;
        if (key !== lastError) {
          lastError = key;
          send({ nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: 'error', revision: current, message: errorText });
        }
        return;
      }
      lastError = null;
      if (root.querySelector(LOADING_SELECTOR)) return;
      send({ nx: CANVAS_PROTOCOL, v: CANVAS_VERSION, type: 'layout', revision: current, height: root.scrollHeight, blocks: collectBlocks(root) });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(notify); };
    notifyRef.current = schedule;

    const root = rootRef.current;
    const resizeObserver = new ResizeObserver(schedule);
    const mutationObserver = new MutationObserver(schedule);
    if (root) {
      resizeObserver.observe(root);
      mutationObserver.observe(root, { subtree: true, childList: true, attributes: true });
    }
    schedule();

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== studioOrigin || event.source !== window.parent) return;
      const message = parseStudioCanvasMessage(event.data);
      if (!message) return;
      revisionRef.current = message.revision;
      setRevision(message.revision);
      schedule();
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [studioOrigin]);

  // Canlı çalışma alanıyla aynı ata zinciri (WorkspaceShellPage: .app-shell › .main-area › .content.workspace-content ›
  // .workspace-page-main): `.app-shell` kapsamlı sayfa kuralları tuvalde de uygulanır. Ölçüm ve blok konumları en dıştaki
  // kabuktan alınır (iframe'in sol üst köşesi); kabuğun 100vh alt sınırı designer-canvas.css'te kaldırılır.
  return (
    <div className="app-shell designer-canvas-shell designer-canvas-root" ref={rootRef}>
      <main className="main-area">
        <section className="content workspace-content">
          <div className="workspace-page-main">
            <CanvasAnchorContext.Provider value={true}>
              <Suspense fallback={null}>
                <TenantCustomPage key={revision} token={token} previewId={params.previewId} systemScreenKey={params.systemScreenKey} />
              </Suspense>
            </CanvasAnchorContext.Provider>
          </div>
        </section>
      </main>
    </div>
  );
}
