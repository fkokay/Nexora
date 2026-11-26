import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { api } from '../erpApi';
import { recordKeyParam } from '../page-templates/recordTemplateModel';
import { readPageTemplate } from '../page-templates/pageTemplate';
import { setPageParams, type PageParams } from '../pageNavigation';
import { CanvasAnchorContext, CanvasTabsContext, type CanvasTabRequest } from './anchorContext';
import { CANVAS_PROTOCOL, CANVAS_VERSION, collectBlocks, parseStudioCanvasMessage, type CanvasParams, type CanvasToStudio } from './canvasProtocol';
import './designer-canvas.css';

const TenantCustomPage = lazy(() => import('../TenantCustomPage'));
// Yalnızca sayfa yükleme hatası (tenant-custom-page-state); blok sorgu hataları (tenant-page-query-error) düzeni durdurmaz.
const ERROR_SELECTOR = '.tenant-custom-page-state.tenant-custom-page-error';
// Sayfa yüklenirken (her yeniden yüklemede kısa süre) düzen gönderilmez; Studio son yükseklik ve blokları korur.
const LOADING_SELECTOR = '.tenant-custom-page-state:not(.tenant-custom-page-error)';
const NO_TABS: ReadonlyMap<string, CanvasTabRequest> = new Map();

/** Uçtan gelen örnek kayıt parametrelerinin yalnız metin değerleri; başka her şey yok sayılır. */
function sampleParams(value: unknown): PageParams {
  const params = (value as { params?: unknown } | null)?.params;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return {};
  return Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

const PAGE_PARAM = /^\s*\{\{\s*sayfa\.parametre\.([^\s}.]+)\s*\}\}\s*$/;
/**
 * Örnek kaydı belirleyen taslak parçası (`GET /preview` yanıtından): kayıt sorgusunun okuduğu sayfa parametresi ve kayıt
 * sorgusunun kaynağı. Kayıt kartı değilse ya da parametre bulunamazsa `null` (sunucu da boş döner; uç çağrılmaz); tanım
 * okunamazsa `undefined` (örnek saklanmadan istenir).
 */
export function sampleKeyOf(preview: unknown): string | null | undefined {
  const json = (preview as { definitionJson?: unknown } | null)?.definitionJson;
  if (typeof json !== 'string') return undefined;
  let definition: { components?: unknown; queries?: unknown };
  try { definition = JSON.parse(json) as typeof definition; } catch { return undefined; }
  if (readPageTemplate(definition)?.name !== 'record') return null;
  type Query = { id: string; name?: string; dataSource?: unknown; parameters?: { name: string; binding?: string }[] };
  const components = Array.isArray(definition.components) ? (definition.components as Parameters<typeof recordKeyParam>[0]) : [];
  const queries = Array.isArray(definition.queries) ? (definition.queries as Query[]).filter((query) => query && typeof query.id === 'string') : [];
  const param = recordKeyParam(components, queries);
  if (!param) return null;
  const source = queries.find((query) => (query.parameters ?? []).some((parameter) => PAGE_PARAM.exec(parameter.binding ?? '')?.[1] === param))?.dataSource;
  return JSON.stringify([param, typeof source === 'string' ? source : null]);
}

export default function DesignerCanvasHost({ token, params, studioOrigin }: { token: string; params: CanvasParams; studioOrigin: string }) {
  // İstenen sürüm (reload) ve örnek kayıt parametreleri yazıldıktan sonra çizilen sürüm; arada önceki çizim kalır.
  const [revision, setRevision] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  // Studio'nun showTab ile istediği sekmeler; yeniden yüklemede (key değişimi) korunur.
  const [tabs, setTabs] = useState(NO_TABS);
  // Belge kalıbı: Studio'nun "Önizlenen durum" seçimi; tuval örnek belgeyi bu durumda çizer.
  const [belgeState, setBelgeState] = useState('Draft');
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
      if (message.type === 'previewState') {
        setBelgeState(message.state);
      } else if (message.type === 'showTab') {
        const { tabsId, index } = message;
        // Her istek yeni bir sayaçla: kullanıcı başka sekmeye tıkladıktan sonra aynı sekme yeniden istenebilir.
        setTabs((current) => new Map(current).set(tabsId, { index, signal: (current.get(tabsId)?.signal ?? 0) + 1 }));
      } else {
        setRevision(message.revision);
      }
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

  // Kayıt kartı taslağı örnek bir kayıtla açılır: uç, sayfa parametresini (`{ <p>: anahtar }`) verir; kalıp `record` değilse,
  // kaynak ya da satır yoksa boş döner; hata da boş sayılır. Her sürümde taslak (`/preview`, kaynak çalıştırmaz) okunur:
  // kayıt kartı değilse uç hiç çağrılmaz. Uç yanıtı (boş da olsa) taslak + kayıt parametresi + kayıt kaynağı başına saklanır:
  // sonraki sürümler liste kaynağını yeniden çalıştırmaz; kayıt kaynağı ya da parametresi değişince yeniden istenir. Hata
  // saklanmaz. Parametreler sayfanın okuduğu sekme anahtarına (TenantCustomPage: systemScreenKey ?? `custom-page-preview:<id>`) yazılır.
  const { previewId, systemScreenKey } = params;
  const samples = useRef(new Map<string, PageParams>());
  useEffect(() => {
    let active = true;
    const tabKey = systemScreenKey ?? `custom-page-preview:${previewId}`;
    const base = `/api/custom-pages/${encodeURIComponent(previewId)}/preview`;
    const load = async (): Promise<PageParams> => {
      const key = await api<unknown>(base, token).then(sampleKeyOf, () => undefined);
      if (key === null) return {};
      const cacheKey = key === undefined ? null : `${previewId}\n${key}`;
      const cached = cacheKey ? samples.current.get(cacheKey) : undefined;
      if (cached) return cached;
      try {
        const sample = sampleParams(await api<unknown>(`${base}/sample-params`, token));
        if (cacheKey) samples.current.set(cacheKey, sample);
        return sample;
      } catch { return {}; }
    };
    void load()
      .then((sample) => {
        if (!active) return;
        setPageParams(tabKey, sample);
        revisionRef.current = revision;
        setShown(revision);
        notifyRef.current();
      });
    return () => { active = false; };
  }, [revision, token, previewId, systemScreenKey]);

  // Canlı çalışma alanıyla aynı ata zinciri (WorkspaceShellPage: .app-shell › .main-area › .content.workspace-content ›
  // .workspace-page-main): `.app-shell` kapsamlı sayfa kuralları tuvalde de uygulanır. Ölçüm ve blok konumları en dıştaki
  // kabuktan alınır (iframe'in sol üst köşesi); kabuğun 100vh alt sınırı designer-canvas.css'te kaldırılır.
  return (
    <div className="app-shell designer-canvas-shell designer-canvas-root" ref={rootRef}>
      <main className="main-area">
        <section className="content workspace-content">
          <div className="workspace-page-main">
            <CanvasAnchorContext.Provider value={true}>
              <CanvasTabsContext.Provider value={tabs}>
                <Suspense fallback={null}>
                  {shown !== null && <TenantCustomPage key={shown} token={token} previewId={previewId} systemScreenKey={systemScreenKey} belgePreviewState={belgeState} />}
                </Suspense>
              </CanvasTabsContext.Provider>
            </CanvasAnchorContext.Provider>
          </div>
        </section>
      </main>
    </div>
  );
}
