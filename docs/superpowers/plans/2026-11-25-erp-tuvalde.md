# Tuvalde gerçek ERP sayfası — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studio sayfa tasarımcısının tuvalinde, taklit çizici yerine ERP'nin kendi çizdiği gerçek sayfayı (iframe) göstermek. Böylece "tasarımcıda düzgün, ERP'de kaymış" sorunu kökünden kalkar.

**Architecture:**
- ERP'ye **yalnızca tuvale özel bir mod** eklenir: `?designerCanvas=1&embeddedStudio=1&preview=<id>`. Bu modda ERP kabuğu (menü, üst çubuk) çizilmez. Oturum, var olan `NEXORA_STUDIO_AUTH` aktarımıyla gelir. Sayfa, mevcut önizleme yoluyla (`previewId`) çizilir. Her bileşenin kutusu Studio'ya `postMessage` ile bildirilir.
- Studio tuvali bu iframe'i içerik yüksekliğinde gösterir ve seçim/bırakma katmanını iframe'in üstüne çizer.
- Taslak her değişiklikte otomatik kaydedilir, ardından ERP'ye "yeniden yükle" mesajı gönderilir. Sunucu kaydedilmemiş tanım ya da SQL çalıştırmaz.

**Tech Stack:** React 19 + TypeScript + Vite (iki ayrı uygulama: `frontend/erp-web`, `frontend/development-studio`), Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` (§6.8, §10, §9)

## Global Constraints

- Kullanıcıya görünen bütün metinler Türkçe.
- Yeni npm bağımlılığı eklenmez. Studio ile ERP ortak paket kullanmaz: protokol tipleri iki tarafta ayrı dosyalarda **birebir aynı** tutulur.
- Mesajlar yalnızca güvenilen origin'e gönderilir ve yalnızca güvenilen origin + doğru `source` ile gelenler işlenir:
  - ERP: `trustedStudioOrigin` + `window.parent`
  - Studio: `platformOrigin` + `iframe.contentWindow`
- Önizlemede yazma işlemleri engelli kalır (mevcut `isPreview` davranışı).
- Sunucu kaydedilmemiş tanım ya da SQL çalıştırmaz. Tuval yalnızca kaydedilmiş taslağı çizer.
- **Canlı sayfalar etkilenmez:** tuval moduna özel DOM (bileşen işaretçileri) yalnızca `designerCanvas` modunda üretilir. Normal ERP sayfalarının DOM'u değişmez.
- Protokol adı `"nexora-canvas"`, sürümü `1`.
- Tanıtıcılar `^[A-Za-z0-9_-]{1,64}$` kalıbına uymalı.
- İşlemi tamamlanan her görev ayrı commit olarak kaydedilir. Commit mesajının sonunda şu satır bulunur: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Spesifikasyondan bilinçli sapmalar (Task 1'de spec'e işlenir)

1. **Oturum aktarımı.** §10 "kısa ömürlü, salt okunur önizleme belirteci" diyor. Bunun yerine var olan `NEXORA_STUDIO_AUTH` aktarımı kullanılır: ERP `App.tsx` ~L176-217, Studio `App.tsx` ~L2420. Studio aynı belirteci gömülü ERP araçlarına zaten veriyor, dolayısıyla yeni bir açık oluşmuyor. Salt okunurluk önizleme modu tarafından sağlanıyor.
2. **Kopya çiziciyi silmek bu projede yapılmaz.** Kart içi tasarım modu (`focusOwner`: form kartı ve pencere içleri) ERP'de sayfa yüzeyinde görünmediği için bir süre eski tuvalde kalır. Eski tuval, ERP'ye bağlanılamadığında yedek olarak da kullanılır. `CanvasPreviews.tsx`, `useCanvasSamples.tsx`, `canvasSamples.ts` ve `preview-samples.ts` alt proje 4'te (Detay ekranı: Sekme → Bölüm → Alan), kart içi mod kalktığında silinir.
3. **Nonce kullanılmaz.** Kod köprüsü (`codeBridgeStub.ts`) nonce kullanıyor, çünkü sandbox'lı çerçevenin origin'i opak. Tuval iframe'inin origin'i gerçek bir origin olduğu için origin + source kontrolü yeterli.

## Review Focus

1. **Henüz kaydedilmemiş yeni sayfa** (ad ya da kod boş). Tuval hata mesajı yağdırmamalı. Bunun yerine sakin bir yer tutucu gösterir: "Önizleme için sağdan sayfa adı ve kodunu girin". Otomatik kayıt denenmez. → Task 6 testi.
2. **Düzenleme yetkisi olmayan kullanıcı** (`canEdit=false`). Otomatik kayıt hiç çalışmaz. Tuval son kaydedilmiş hali gösterir. → Task 6 testi.
3. **ERP'ye ulaşılamıyor** (`platformOrigin` yok, iframe yüklenmiyor, origin uyuşmuyor). 10 saniye içinde `ready` gelmezse eski tuvale dönülür ve "ERP önizlemesine bağlanılamadı, yerleşik önizleme gösteriliyor." uyarısı çıkar. → Task 5 testi.
4. **Hızlı ardışık düzenlemeler.** Kayıtlar 800 ms'lik bekleme ile birleştirilir. Geç gelen eski bir `layout` mesajı (daha küçük `revision`) yeni yerleşimi ezmemeli. → Task 5 testi.
5. **Başka bir origin'den ya da başka bir pencereden gelen mesaj** hiçbir zaman işlenmez (iki tarafta da). → Task 1, Task 3 ve Task 5 testleri.

---

### Task 1: ERP tuval protokolü + spec güncellemesi

**Files:**
- Create: `frontend/erp-web/src/designer-canvas/canvasProtocol.ts`
- Test: `frontend/erp-web/src/designer-canvas/canvasProtocol.test.ts`
- Modify: `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` (§6.8 ve §10'a "Spesifikasyondan bilinçli sapmalar" 1–3 işlenir)

**Interfaces:**
- Produces:
  ```ts
  export const CANVAS_PROTOCOL = "nexora-canvas";
  export const CANVAS_VERSION = 1;
  export type CanvasBlock = { id: string; x: number; y: number; width: number; height: number };
  export type StudioToCanvas = { nx: "nexora-canvas"; v: 1; type: "reload"; revision: number };
  export type CanvasToStudio =
    | { nx: "nexora-canvas"; v: 1; type: "ready"; revision: number }
    | { nx: "nexora-canvas"; v: 1; type: "layout"; revision: number; height: number; blocks: CanvasBlock[] }
    | { nx: "nexora-canvas"; v: 1; type: "error"; revision: number; message: string };
  export type CanvasParams = { previewId: string; systemScreenKey?: string };
  export function readCanvasParams(search: string): CanvasParams | null;
  export function parseStudioCanvasMessage(data: unknown): StudioToCanvas | null;
  export function collectBlocks(root: HTMLElement): CanvasBlock[];
  export const ANCHOR_ATTRIBUTE = "data-cp-anchor";
  ```

- [ ] **Step 1: Write the failing tests** (`canvasProtocol.test.ts`)
  - `readCanvasParams("?designerCanvas=1&embeddedStudio=1&preview=abc-1")` → `{ previewId: "abc-1" }`
  - `readCanvasParams("?designerCanvas=1&embeddedStudio=1&preview=abc&page=customers")` → `{ previewId: "abc", systemScreenKey: "customers" }`
  - `null` döner:
    - `embeddedStudio` yoksa
    - `designerCanvas` yoksa
    - `preview` boşsa
    - `preview=a/b` ise (kalıba uymuyor)
    - `page` 65 karakterse
  - `parseStudioCanvasMessage({ nx: "nexora-canvas", v: 1, type: "reload", revision: 3 })` aynı nesneyi döner.
  - `parseStudioCanvasMessage` şu girdilerde `null` döner:
    - `v: 2`
    - `type: "layout"`
    - `revision: -1`
    - `revision: 1.5`
    - `"string"`
    - `null`
  - `collectBlocks`: jsdom'da `<div id=root>` içine `<template data-cp-anchor="a"></template><section></section>` yerleştirilir. `section.getBoundingClientRect` `{left:10, top:30, width:100, height:40}`, `root.getBoundingClientRect` `{left:0, top:20}` döndürecek şekilde ayarlanır. Beklenen sonuç: `[{ id: "a", x: 10, y: 10, width: 100, height: 40 }]`.
  - `collectBlocks`: işaretçiden sonra öğe gelmiyorsa ya da öğenin genişliği/yüksekliği 0 ise o blok atlanır.

- [ ] **Step 2: Run to verify fail**
  - Run: `cd frontend/erp-web && npx vitest run src/designer-canvas/canvasProtocol.test.ts`
  - Expected: FAIL (modül yok)

- [ ] **Step 3: Implement `canvasProtocol.ts`**
  - Kimlik kalıbı: `/^[A-Za-z0-9_-]{1,64}$/`
  - `collectBlocks`, `root.querySelectorAll('template[data-cp-anchor]')` ile işaretçileri bulur. Her işaretçinin `nextElementSibling` öğesinin kutusunu `root`'a göreli olarak hesaplar ve sayıları `Math.round` ile yuvarlar.

- [ ] **Step 4: Run to verify pass**
  - Same command → PASS

- [ ] **Step 5: Spec güncellemesi**
  - §10 "Tuvalin oturumu ve verisi" maddesi: "kısa ömürlü, salt okunur bir önizleme belirteci" yerine "mevcut `NEXORA_STUDIO_AUTH` aktarımı (Studio'nun gömülü ERP araçlarına verdiği belirteç)" yazılır.
  - §6.8'in son maddesine sapma 2 eklenir: silme alt proje 4'e kalır, eski tuval bu süre boyunca yedek olarak kullanılır.

- [ ] **Step 6: Commit**
  - Mesaj: `feat(erp-web): tasarımcı tuvali protokolü`

---

### Task 2: ERP çizicisinde bileşen işaretçileri (yalnızca tuval modunda)

**Files:**
- Create: `frontend/erp-web/src/designer-canvas/anchorContext.ts` (bağlam burada durur; böylece `DesignerCanvasHost` ve testler, tembel yüklenen `TenantCustomPage`'i içe aktarmadan bağlama erişebilir)
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`
  - L953 `renderComponent`: gövdesi `renderComponentBody` olarak yeniden adlandırılır. Yeni `renderComponent` bu gövdeyi çağırır ve sonucu `Anchored` ile sarar. İç içe çağrılar (L962, L1071, L1113, L1228) `renderComponent`'i çağırmaya devam ettiği için iç içe bileşenler de işaretlenir.
- Test: `frontend/erp-web/src/custom-page/designerAnchors.test.tsx`

**Interfaces:**
- Consumes: `ANCHOR_ATTRIBUTE` (Task 1)
- Produces (`designer-canvas/anchorContext.ts` içinden export):
  ```ts
  export const CanvasAnchorContext: React.Context<boolean>; // varsayılan false
  ```
  Yardımcı bileşen (dosya içinde): `function Anchored({ id, children }: { id: string; children: ReactNode }): ReactNode`
  - Bağlam `true` ise ve `children` null değilse: `<><template data-cp-anchor={id} />{children}</>`
  - Aksi halde `children` olduğu gibi döner.

- [ ] **Step 1: Write the failing tests**
  - `"tuval modunda her bileşenin önünde işaretçi var"`: `<CanvasAnchorContext.Provider value={true}>` içinde bir `heading` (`id:"h1"`) ve `tabs` içinde bir `text` (`id:"t1"`) olan tanım çizilir. `document.querySelectorAll("template[data-cp-anchor]")` sonucunda `["h1", …, "t1"]` id'leri bulunur. İşaretçinin `nextElementSibling` öğesi `h2.tenant-page-heading` olmalı.
  - `"normal modda işaretçi yok"`: Provider olmadan aynı tanım çizildiğinde `template[data-cp-anchor]` sayısı 0 olmalı.
  - `"görünmeyen bileşen için işaretçi yok"`: `visibleWhen` koşulu tutmayan bileşenin işaretçisi çıkmamalı.
  - Sayfa yükleme için mevcut testlerdeki `api` sahteleme (mock) kalıbı kullanılır. `custom-page/CustomPageTable.test.tsx` içinde nasıl kurulduğuna bakın.

- [ ] **Step 2: Run to verify fail**
  - Run: `cd frontend/erp-web && npx vitest run src/custom-page/designerAnchors.test.tsx`
  - Expected: FAIL

- [ ] **Step 3: Implement**
  - `Anchored`, `useContext(CanvasAnchorContext)` okur.
  - `<template>` öğesi `display:none` olduğu için grid hücresi kaplamaz ve yerleşimi değiştirmez.

- [ ] **Step 4: Run to verify pass**
  - Aynı komut çalıştırılır.
  - Ek olarak bütün ERP testleri çalıştırılır: `cd frontend/erp-web && npx vitest run` → PASS (canlı DOM değişmediği için mevcut testler bozulmamalı)

- [ ] **Step 5: Commit**
  - Mesaj: `feat(erp-web): tuval modunda bileşen işaretçileri`

---

### Task 3: ERP tuval sunucusu (`DesignerCanvasHost`) ve App bağlantısı

**Files:**
- Create: `frontend/erp-web/src/designer-canvas/DesignerCanvasHost.tsx`
- Create: `frontend/erp-web/src/designer-canvas/designer-canvas.css`
- Modify: `frontend/erp-web/src/App.tsx`
  - ~L80: `const canvasParams = readCanvasParams(window.location.search)`
  - ~L897: `if (embeddedStudioTool && (!token || !tenant)) return <EmbeddedStudioWaitingPage />;` satırının hemen arkasına `if (canvasParams) return <DesignerCanvasHost …/>` eklenir.
- Test: `frontend/erp-web/src/designer-canvas/DesignerCanvasHost.test.tsx`

**Interfaces:**
- Consumes: Task 1'in tümü, `CanvasAnchorContext` (Task 2)
- Produces:
  ```ts
  export default function DesignerCanvasHost(props: {
    token: string; params: CanvasParams; studioOrigin: string;
  }): JSX.Element
  ```

**Davranış:**
- Kök öğe `<div className="designer-canvas-root">` olur. İçinde `<CanvasAnchorContext.Provider value={true}>` ve onun içinde şu çizilir:
  `<TenantCustomPage key={revision} token previewId={params.previewId} systemScreenKey={params.systemScreenKey} />`
- `revision` başlangıçta 0'dır. Geçerli bir `reload` mesajı (origin `studioOrigin`, `source === window.parent`) geldiğinde `revision = message.revision` olur. Bu `key` değişikliği sayfanın yeniden yüklenmesini sağlar.
- İlk çizimde `window.parent.postMessage({ type: "ready", revision }, studioOrigin)` gönderilir.
- `ResizeObserver` ve `MutationObserver` (subtree, childList, attributes) değişiklikleri `requestAnimationFrame` ile tek bir bildirime indirilir. Her bildirimde `layout` mesajı gönderilir: `{ revision, height: root.scrollHeight, blocks: collectBlocks(root) }`.
- Sayfa yüklenemezse (`.tenant-custom-page-error` görünür hale gelirse) `error` mesajı gönderilir. İçerik o öğenin metnidir.
- CSS: `html:has(.designer-canvas-root), body:has(.designer-canvas-root) { overflow: hidden; background: transparent; }`. İçerik yüksekliğini Studio taşıyacak.

- [ ] **Step 1: Write the failing tests**
  - `vi.mock("../TenantCustomPage")` ile basit bir sahte bileşen kullanılır. Bu sahte bileşen `CanvasAnchorContext` değerini okuyup `<template data-cp-anchor="x"/><div style="height:50px"/>` çizer.
  - `window.parent.postMessage` bir `vi.fn` ile izlenir.
  - `"ilk çizimde ready gönderir"`: `postMessage` şu argümanlarla çağrılmalı: `{ nx:"nexora-canvas", v:1, type:"ready", revision:0 }` ve hedef `"https://studio.test"`.
  - `"layout mesajı blokları taşır"`: `requestAnimationFrame` sahtelenir ve tetiklenir. Gönderilen son mesajın tipi `"layout"` olmalı, `blocks[0].id === "x"` olmalı.
  - `"güvenilen reload sayfayı yeniden yükler"`: `MessageEvent("message", { origin:"https://studio.test", source: window.parent, data:{nx:"nexora-canvas",v:1,type:"reload",revision:4} })` gönderilir. Sahte bileşen 2 kez bağlanmış (mount) olmalı. Bundan sonraki `layout` mesajlarında `revision: 4` olmalı.
  - `"başka origin'den reload yok sayılır"`: origin `"https://evil.test"` olduğunda bağlanma sayısı 1 kalmalı.

- [ ] **Step 2: Run to verify fail**
  - Run: `cd frontend/erp-web && npx vitest run src/designer-canvas/DesignerCanvasHost.test.tsx`
  - Expected: FAIL

- [ ] **Step 3: Implement `DesignerCanvasHost` ve App bağlantısı**
  - `App.tsx`: `studioOrigin={trustedStudioOrigin}`, `token={token}`, `params={canvasParams}`.
  - Kabuk (menü, üst çubuk, sekmeler) çizilmez.
  - `TenantCustomPage`, `lazy` ile yüklenir ve `Suspense` ile sarılır (`WorkspacePageRouter.tsx` L28'deki kalıp).

- [ ] **Step 4: Run to verify pass**
  - Aynı komut çalıştırılır, ardından `cd frontend/erp-web && npx vitest run && npx tsc --noEmit -p .` → PASS

- [ ] **Step 5: Commit**
  - Mesaj: `feat(erp-web): Studio tuvali için ERP önizleme modu`

---

### Task 4: Studio protokol kopyası ve isabet hesapları

**Files:**
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/erpCanvasProtocol.ts`
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/canvasHitTest.ts`
- Test: `…/page-designer/erpCanvasProtocol.test.ts`, `…/page-designer/canvasHitTest.test.ts`

**Interfaces:**
- Produces:
  - `erpCanvasProtocol.ts`: `CanvasBlock`, `StudioToCanvas` ve `CanvasToStudio` tipleri, Task 1 ile **birebir aynı**. Dosya başında şu yorum bulunur: `// erp-web/src/designer-canvas/canvasProtocol.ts ile aynı tutulmalı.`
    ```ts
    export function parseCanvasMessage(data: unknown): CanvasToStudio | null;
    export function canvasFrameUrl(platformOrigin: string, target: { previewId: string; systemScreenKey?: string }): string;
    export function reloadMessage(revision: number): StudioToCanvas;
    ```
  - `canvasHitTest.ts`:
    ```ts
    /** (x,y)'yi içeren en küçük blok; yoksa null. */
    export function pickBlock(blocks: CanvasBlock[], x: number, y: number): string | null;
    /** Üst düzey bileşenler arasında y için ekleme sırası (0..topLevelIds.length). */
    export function dropIndex(blocks: CanvasBlock[], topLevelIds: string[], y: number): number;
    ```

- [ ] **Step 1: Write the failing tests**
  - `canvasFrameUrl("https://erp.test", { previewId: "p1" })` → `"https://erp.test/?designerCanvas=1&embeddedStudio=1&preview=p1"`
  - `systemScreenKey: "customers"` verildiğinde sonuna `&page=customers` eklenmeli.
  - `parseCanvasMessage`:
    - geçerli `ready`, `layout` ve `error` mesajlarını kabul eder
    - `blocks` içinde id'si kalıba uymayan bir öğe varsa `null` döner
    - `height` negatifse `null` döner
    - `type: "reload"` için `null` döner
  - `pickBlock`: dış blok `{id:"tabs",x:0,y:0,width:500,height:300}`, iç blok `{id:"t1",x:10,y:40,width:200,height:50}`.
    - `(20, 50)` → `"t1"`
    - `(400, 250)` → `"tabs"`
    - `(600, 10)` → `null`
  - `dropIndex`: üst düzey `["a","b"]`, `a` y=0..100, `b` y=120..220.
    - `y=40` → 0 (a'nın üst yarısı)
    - `y=80` → 1
    - `y=230` → 2
    - Blokları hiç bildirilmemiş bir id hesaba katılmaz.

- [ ] **Step 2: Run to verify fail**
  - Run: `cd frontend/development-studio && npx vitest run src/platform-tools/erp-src/page-designer/erpCanvasProtocol.test.ts src/platform-tools/erp-src/page-designer/canvasHitTest.test.ts`
  - Expected: FAIL

- [ ] **Step 3: Implement**
  - `dropIndex`: `y`'nin altında kalan ilk üst düzey bloğun sırası alınır. `y` bloğun alt yarısındaysa sıra bir artırılır. Hiçbiri tutmazsa sona eklenir.

- [ ] **Step 4: Run to verify pass**
  - Same command → PASS

- [ ] **Step 5: Commit**
  - Mesaj: `feat(studio): ERP tuval protokolü ve isabet hesapları`

---

### Task 5: Studio `ErpCanvasFrame` (iframe + seçim katmanı)

**Files:**
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/ErpCanvasFrame.tsx`
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer-extras.css` (`.pd-erp-canvas*` kuralları)
- Test: `…/page-designer/ErpCanvasFrame.test.tsx`

**Interfaces:**
- Consumes: Task 4'ün tümü
- Produces:
  ```ts
  export type CanvasTenant = { id: string; name: string; slug: string; role: string };
  export default function ErpCanvasFrame(props: {
    platformOrigin: string; token: string; tenant: CanvasTenant;
    target: { previewId: string; systemScreenKey?: string };
    revision: number;                       // değişince reload gönderilir
    device: "desktop" | "tablet" | "mobile"; // iframe genişliği: 100% / 768px / 375px
    topLevelIds: string[];
    selectedId: string | null;
    interactive: boolean;                   // true: tıklamalar ERP'ye geçer (sekme değiştirme vb.)
    onSelect: (id: string | null) => void;
    onBlocks?: (blocks: CanvasBlock[]) => void; // bırakma hesabı için üst bileşene
    onUnavailable: (reason: string) => void;
  }): JSX.Element
  ```

**Davranış:**
- **Yükleme:** iframe `onLoad` olayında `{ type: "NEXORA_STUDIO_AUTH", token, tenant }` mesajı `platformOrigin`'e gönderilir. Bu, Studio `App.tsx` ~L2420'deki kalıbın aynısı.
- **Gelen mesajlar:** yalnızca `event.origin === platformOrigin && event.source === iframeRef.current?.contentWindow` koşulunu sağlayanlar işlenir.
  - `ready`: zaman aşımı sayacı durdurulur.
  - `layout`: yalnızca `revision >= sonGörülenRevision` ise işlenir. İframe yüksekliği `height` px'e ayarlanır, bloklar saklanır ve `onBlocks` çağrılır.
  - `error`: `onUnavailable(message)` çağrılır.
- **Zaman aşımı:** 10 000 ms içinde `ready` gelmezse şu çağrılır: `onUnavailable("ERP önizlemesine bağlanılamadı, yerleşik önizleme gösteriliyor.")`
- **Revision değişimi:** `revision` prop'u değişince `reloadMessage(revision)` gönderilir. Yükseklik, yeni `layout` gelene kadar eski değerinde kalır (titreme olmasın diye).
- **Seçim katmanı:**
  - Katman `position:absolute; inset:0` ile iframe'in üstünü kaplar.
  - `interactive` false iken tıklamaları katman yakalar: `pickBlock(blocks, offsetX, offsetY)` sonucu `onSelect`'e verilir.
  - `interactive` true iken katmanın `pointer-events` değeri `none` olur.
- **Seçili bileşen:** seçili bloğun kutusu mor çerçeveyle çizilir (`.pd-erp-canvas-selected`). Üzerine gelinen blok ince bir çerçeveyle gösterilir.

- [ ] **Step 1: Write the failing tests**
  - `"yüklenince oturum mesajı gönderir"`: iframe'de `fireEvent.load` tetiklenir. `contentWindow.postMessage` şu argümanlarla çağrılmalı: `{ type:"NEXORA_STUDIO_AUTH", token:"t", tenant }` ve `"https://erp.test"`.
  - `"layout yüksekliği ve seçim"`: `source` olarak iframe'in `contentWindow`'u verilip `layout` mesajı gönderilir (`blocks:[{id:"a",x:0,y:0,width:300,height:80}]`, `height: 640`). iframe `style.height` değeri `"640px"` olmalı. Katmanda (20, 20)'ye tıklanınca `onSelect("a")` çağrılmalı.
  - `"eski revision ezmez"`: önce `revision:2, height:500`, ardından `revision:1, height:300` gönderilir. Yükseklik `"500px"` kalmalı.
  - `"yabancı origin yok sayılır"`: origin `"https://evil.test"` olan `layout` mesajı gönderilir. Yükseklik değişmemeli.
  - `"zaman aşımında yedek"`: `vi.useFakeTimers()`, 10 000 ms ilerletilir. `onUnavailable` şu metinle çağrılmalı: `"ERP önizlemesine bağlanılamadı, yerleşik önizleme gösteriliyor."`
  - `"revision değişince reload"`: `rerender` ile `revision=1` verilir. `postMessage` şununla çağrılmalı: `{ nx:"nexora-canvas", v:1, type:"reload", revision:1 }`
  - `"etkileşim modunda katman tıklamayı geçirir"`: `interactive=true` iken katmanın `style.pointerEvents` değeri `"none"` olmalı.

- [ ] **Step 2: Run to verify fail**
  - Run: `cd frontend/development-studio && npx vitest run src/platform-tools/erp-src/page-designer/ErpCanvasFrame.test.tsx`
  - Expected: FAIL

- [ ] **Step 3: Implement `ErpCanvasFrame.tsx` ve CSS**

- [ ] **Step 4: Run to verify pass**
  - Same command → PASS

- [ ] **Step 5: Commit**
  - Mesaj: `feat(studio): ERP önizlemesini gösteren tuval çerçevesi`

---

### Task 6: Tasarımcıya bağlama — firma bilgisinin aktarılması, otomatik kayıt, yedek tuval

**Files:**
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/useDraftAutosave.ts`
- Test: `…/page-designer/useDraftAutosave.test.tsx`
- Modify:
  - `frontend/development-studio/src/App.tsx` ~L2396: `<NativePlatformTool … tenant={tenant} />`
  - `frontend/development-studio/src/platform-tools/NativePlatformTool.tsx`: `tenant?: CanvasTenant` prop'u eklenip `LowCodeDesignerPage`'e geçirilir.
  - `frontend/development-studio/src/platform-tools/erp-src/LowCodeDesignerPage.tsx` L270: `<CustomPagesPage … tenant={tenant} />`
  - `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
    - L1073 Props'a `tenant?: CanvasTenant` eklenir.
    - L2138 `saveDraft` seçeneklerine `quiet?: boolean` eklenir: true iken başarı bildirimi gösterilmez, ad ya da kod boşsa hata yazmadan `null` döner.
    - L3584 `pd-canvas-scroll` içinde, sayfa düzeyindeki tuval `ErpCanvasFrame` ile değiştirilir. Bunun için şu dört koşulun hepsi sağlanmalı: `platformOrigin && tenant && !focusOwner && !canvasFallback`.
    - Bırakma hesabı (~L1709-1733): ERP tuvali etkinken `dropIndex(blocks, definition.components.map(c => c.id), y)` kullanılır.
    - L3581 tuval bilgi metni: ERP tuvali etkinken `"ERP önizlemesi · otomatik yerleşim"` yazar.
    - Tuval araç çubuğuna **Seç / Dene** geçişi eklenir (`interactive` durumunu değiştirir).

**Interfaces:**
- Consumes: `ErpCanvasFrame` ve `CanvasTenant` (Task 5), `dropIndex` (Task 4)
- Produces:
  ```ts
  export function useDraftAutosave(options: {
    enabled: boolean;          // canEdit && ad && kod
    changeKey: unknown;        // tanım nesnesi (referans değişimi = değişiklik)
    delayMs?: number;          // varsayılan 800
    save: () => Promise<boolean>;
  }): { revision: number; saving: boolean };
  ```
  `revision` yalnızca `save()` başarılı (`true`) döndüğünde 1 artar. Bir kayıt sürerken yeni bir değişiklik gelirse, o kayıt bittikten sonra bir kayıt daha yapılır. Kayıtlar paralel çalışmaz.

- [ ] **Step 1: Write the failing tests** (`useDraftAutosave.test.tsx`, `vi.useFakeTimers()`)
  - `"bekleme süresi sonunda bir kez kaydeder"`: `changeKey` 3 kez hızlıca değiştirilir, ardından 800 ms ilerletilir. `save` 1 kez çağrılmış olmalı, `revision === 1` olmalı.
  - `"kapalıyken kaydetmez"`: `enabled:false` iken `changeKey` değiştirilir ve 2 000 ms ilerletilir. `save` hiç çağrılmamalı, `revision === 0` olmalı. (Review Focus 1 ve 2)
  - `"başarısız kayıt revision artırmaz"`: `save` `false` döndürdüğünde `revision === 0` kalmalı.
  - `"kayıt sürerken gelen değişiklik sıraya girer"`: ilk `save` henüz çözülmemiş bir Promise döndürür. Bu sırada `changeKey` değişir. İlk Promise çözüldükten ve 800 ms ilerletildikten sonra `save` 2 kez çağrılmış olmalı ve çağrılar hiçbir zaman çakışmamalı.

- [ ] **Step 2: Run to verify fail**
  - Run: `cd frontend/development-studio && npx vitest run src/platform-tools/erp-src/page-designer/useDraftAutosave.test.tsx`
  - Expected: FAIL

- [ ] **Step 3: Implement**
  - Hook ve bağlantılar yukarıda belirtilen dosyalarda yapılır.
  - `CustomPagesPage` içinde `save` şöyle tanımlanır: `async () => Boolean(await saveDraft({ quiet: true }))`
  - `enabled = canEdit && Boolean(name.trim() && code.trim())`
  - **Önizleme hedefi:** `current?.id` varsa `{ previewId: current.id, systemScreenKey }`. Yoksa tuval yerine yer tutucu gösterilir: `"Önizleme için sağdan sayfa adı ve kodunu girin."`
  - **Yedek tuval:** `onUnavailable(reason)` çağrıldığında `canvasFallback = true` yapılır, `setNotice(reason)` ile uyarı gösterilir ve eski tuval çizilir.

- [ ] **Step 4: Run to verify pass**
  - Run: `cd frontend/development-studio && npm test && npx tsc --noEmit -p .`
  - Expected: PASS

- [ ] **Step 5: Commit**
  - Mesaj: `feat(studio): sayfa tasarımcısı tuvalinde gerçek ERP sayfası`

---

### Task 7: Uçtan uca doğrulama (3 genişlik)

**Files:**
- Create: `docs/superpowers/plans/2026-11-25-erp-tuvalde-dogrulama.md`. Bu dosyaya sonuçlar ve ekran görüntülerinin yolları yazılır. Ekran görüntüleri `docs/superpowers/plans/erp-tuvalde-ekran/` altına kaydedilir.

- [ ] **Step 1: Yerel geliştirme sunucularını başlat**
  - ERP: `frontend/erp-web`, port 5173. `VITE_STUDIO_URL=http://localhost:5175/` ile başlatılmalı. Varsayılan değer 5174 ve Studio'nun gerçek portuyla uyuşmuyor.
  - Studio: `frontend/development-studio`, port 5175.
  - Platform API ayakta olmalı. Studio, ERP bağlantısından (`platformOrigin` dolu olacak şekilde) açılmalı.

- [ ] **Step 2: Sistem sayfası taslağını üç genişlikte karşılaştır**
  - Bir sistem sayfası taslağı kullanılır, örneğin Stok Kartları (`inventory-stock`).
  - Masaüstü, tablet ve mobil genişliklerinde ekran görüntüsü alınır:
    - (a) Studio tuvalinden
    - (b) `customPagePreview` ile yeni sekmede açılan ERP önizlemesinden
  - Beklenen: bileşenlerin konumları ve boyutları aynı olmalı. Görsel fark yalnızca ERP kabuğunun kendisi (menü, üst çubuk) olabilir.

- [ ] **Step 3: Review Focus maddelerini elle dene**
  - Yeni, adsız bir sayfa açıldığında yer tutucu görünmeli.
  - Yetkisiz kullanıcıda otomatik kayıt hiç çalışmamalı.
  - `platformOrigin` boş bırakıldığında yedek tuval ve uyarı görünmeli.
  - Hızlı ardışık 5 düzenleme yapıldığında kayıt sayısı 1–2 olmalı.

- [ ] **Step 4: Canlı sayfa DOM'unun değişmediğini kontrol et**
  - Normal ERP'de (tuval modu dışında) bir firma sayfası açılır.
  - Tarayıcı konsolunda `document.querySelectorAll("template[data-cp-anchor]").length` çalıştırılır.
  - Beklenen sonuç: `0`

- [ ] **Step 5: Commit**
  - Mesaj: `docs: ERP tuvali doğrulama sonuçları`

---

## Bu planın kapsamı dışında kalanlar

- Kopya çizicinin silinmesi: alt proje 4.
- Tuvalde pencere ve kart içlerinin ERP'de tasarlanması: alt proje 4 (Sekme → Bölüm → Alan yapısı).
- Canlıya alma: ayrı bir dağıtım adımı. ERP (`erp-web`) ve Studio birlikte yayınlanmalı. Yalnızca Studio yayınlanırsa ERP tuval modunu tanımayacağı için Studio yedek tuvale düşer. Bu güvenli, ama bilinmesi gereken bir durum.
