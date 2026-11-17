# Sayfa tasarımcısı · tasarım dili adım 2c (İşlem Çubuğu bağlama) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Özel sayfalarda ERP'nin üstteki İşlem Çubuğu'nu (Yeni, Aç, Kaydet, Sil, Yenile, Filtre, Yazdır, Excel, İşlemler) yöneticinin sayfaya koyduğu bir "İşlem Çubuğu" bileşeniyle sayfanın sorgularına, giriş kutularına, tablolarına ve düğmelerine bağlamak.

**Architecture:** Yeni v2 bileşen türü `actionBar` (sayfa başına en fazla bir). Kendisi sayfa gövdesinde düğme çizmez; ERP'de mevcut `usePageCommands` ile sayfa komutlarını kaydeder, kabuğun tek İşlem Çubuğu bu komutları gösterir. Sayfa gövdesinde yalnız bir durum satırı (yazma sonucu mesajı) çizer. Bağlanmayan komut çubukta soluk kalır ("Bu sayfada bağlanmadı"). Yazma işlemleri mevcut `QueryActionButton` mantığından çıkarılan ortak yardımcıyla çalışır (yetki, onay, önizleme uyarısı, tek uçuş, yenileme). `moreButtons`'taki düğmeler İşlemler menüsüne taşınır ve sayfada kendi yerlerinde çizilmez (2b'deki giriş sahipliği gibi).

**Tech Stack:** .NET 10 / xUnit, React + TypeScript + Vite, Vitest + Testing Library (erp-web), `xlsx` (zaten bağımlılık), lucide-react.

**Spec:** `docs/design-proposals/erp-design-language/06-sayfa-tasarimcisi-bilesen-ve-sablonlar.html` (bölüm 1 "İşlem Çubuğu"), `docs/superpowers/specs/2026-11-16-erp-design-language-design.md` §5.5, `frontend/erp-web/src/action-bar/README.md` (komut sözleşmesi).

## Global Constraints

- Sıra, kısayollar ve görünüm kabuğun mevcut İşlem Çubuğu'ndan gelir; bu iş onları değiştirmez. Komut kimlikleri: `new`, `open`, `save`, `delete`, `refresh`, `filter`, `print`, `export` (+ `more`). `open` özel sayfalarda bağlanmaz (soluk).
- Bağlanmamış komut: `disabledReason: "Bu sayfada bağlanmadı"`. Yetki yoksa: `"Bu işlem için yetkiniz yok"`. İşlem sürerken: `"İşlem sürüyor…"`.
- Birincil komut: `saveQuery` bağlıysa `save`, değilse `newInputs` bağlıysa `new`; ikisi de yoksa birincil yok.
- Komutlar ve özellikler (yalnız v2, `actionBar` üzerinde):
  - `newInputs`: giriş kimlikleri (1–12) → **Yeni (F2)** bu girişleri boşaltır (onay kutusu `false`), ilkine odaklanır.
  - `saveQuery`: `insert` ya da `update` türündeki sorgu kimliği → **Kaydet (Ctrl+S)**; onay sormaz (önizlemede sorar).
  - `deleteQuery`: `delete` türündeki sorgu kimliği → **Sil (Ctrl+Del)**; her zaman onay sorar: başlık "Kayıt silinsin mi?", düğme "Sil", ton `danger`.
  - **Yenile (F5)** her zaman bağlıdır: sayfadaki tüm `runOn: "load"` okuma sorgularını yeniden çalıştırır.
  - `focusInput`: giriş kimliği → **Filtre (Ctrl+F)** o girişe odaklanır.
  - `printEnabled`: `true` → **Yazdır (Ctrl+P)** `window.print()`.
  - `exportTable`: sorguya bağlı `dataTable` kimliği → **Excel (Ctrl+E)** tablonun o anki sorgu satırlarını `.xlsx` olarak indirir (dosya adı `<sayfa kodu>.xlsx`, sayfa adı tablo başlığı ya da "Liste"; tablonun `columns` seçimi varsa yalnız onlar, başlık satırı sütun etiketleri; değerler ham sayı/metin, metin hücreleri `downloadXlsx`'in formül kaçışından geçer). Sonuç `truncated` ise "Liste ilk N satırla sınırlı" uyarısı durum satırında gösterilir.
  - `moreButtons`: `button` bileşeni kimlikleri (1–10) → İşlemler menüsü öğeleri (etiket = düğme metni; sorgu eylemli düğmeler aynı yazma yardımcısıyla, iş akışı düğmeleri mevcut iş akışı başlatma ile çalışır). Bu düğmeler sayfada çizilmez.
- Sayfada en fazla bir `actionBar`; bir düğme en fazla bir kez `moreButtons`'ta.
- Yazma sonrası: başarı "<successMessage ya da 'İşlem tamamlandı.'> (N kayıt)", hata sunucu mesajı; ikisi de `actionBar`'ın sayfadaki durum satırında (`role="status"` / `role="alert"`). Sonra tüm `load` okuma sorguları yenilenir.
- Renk yalnız `--nx-*` (Studio tuvali `--dl-*`). ERP'de eski `.app-shell` kurallarını aşmak gerekirse seçici `#root .app-shell .tenant-custom-page …` ile başlar (2b'de ölçüldü).
- Yeni Türkçe metinlerin `src/locales/en/` karşılığı, ancak İşlem Çubuğu'nun kendi sözlüğü kullanılıyorsa eklenir (`action-bar/labels.ts`); özel sayfa metinleri sabit Türkçe kalır.

## Review Focus

1. **Bağlanmamış sayfa:** `actionBar` olmayan özel sayfada çubuk bugünkü gibi tamamen soluk kalır; `actionBar` silinince kayıtlı komutlar kalkar. (Task 3)
2. **Yetki ve tek uçuş:** kullanıcının Ekle/Güncelle/Sil yetkisi yoksa ilgili komut soluk ve nedenli; Kaydet'e hızlı iki kez basmak (ya da Ctrl+S) tek yazma isteği gönderir. (Task 2, 3)
3. **Sil onayı:** Sil her zaman onay sorar; Vazgeç hiçbir istek göndermez; önizlemede (taslak) uyarı metni eklenir. (Task 3)
4. **Excel boş/kırpılmış:** tablo henüz yüklenmemişse ya da hata verdiyse Excel soluk ("Liste henüz yüklenmedi" / hata metni); `truncated` sonuçta indirme yapılır ve uyarı gösterilir; formülle başlayan metin (`=SUM(...)`) hücrede düz metin kalır. (Task 2)
5. **Taşınan düğmeler:** `moreButtons`'a alınan düğme sayfada görünmez, İşlemler'de görünür; `actionBar` silinince düğme sayfadaki yerine döner. (Task 3, 4)

---

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` | `actionBar` türü, özellikler, tekillik ve başvuru doğrulaması |
| `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs` | Şema testleri |
| `frontend/erp-web/src/custom-page/pageActions.ts` (yeni) | Saf: `actionBarOf`, `movedButtonIds`, `buildPageCommands`, `exportRows` |
| `frontend/erp-web/src/custom-page/pageActions.test.ts` (yeni) | Vitest |
| `frontend/erp-web/src/custom-page/writeAction.ts` (yeni) | `QueryActionButton`'dan çıkarılan ortak yazma yardımcısı |
| `frontend/erp-web/src/TenantCustomPage.tsx` | Komut kaydı, durum satırı, taşınan düğmelerin atlanması; `QueryActionButton` ortak yardımcıyı kullanır |
| `frontend/erp-web/src/custom-page/PageActionBar.test.tsx` (yeni) | Sayfa düzeyi test (CommandProvider ile) |
| `frontend/erp-web/src/tenant-custom-page.css` | Durum satırı |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/pageActions.ts` (yeni) | `actionBarOf`, `movedButtonIds` kopyası |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/LayoutFields.tsx` | Düğme seçici (mevcut `InputPicker` deseni) |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/CanvasPreviews.tsx` | `ActionBarPreview` |
| `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx` | Palet, müfettiş, başvuru temizliği, kayıt öncesi denetim, tuval |
| `frontend/development-studio/src/platform-tools/erp-src/custom-pages.css` | Tuval/müfettiş stilleri |

---

### Task 1: Şema doğrulaması

**Files:** Modify `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`; Test `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs`

**Interfaces — Produces:** v2 tür `actionBar`, özellikler Global Constraints'teki gibi: `newInputs` (giriş kimlikleri 1–12), `saveQuery` (insert|update sorgusu), `deleteQuery` (delete sorgusu), `focusInput` (giriş kimliği), `printEnabled` (bool), `exportTable` (adı olması gerekmez, `query` bağlı `dataTable` kimliği), `moreButtons` (button kimlikleri 1–10). `actionBar`'ın `props` dışında `children`'ı olamaz.

- [ ] **Step 1: Write failing tests** — `Accepts_action_bar` (tüm özellikler dolu; bileşenler önce/sonra/iç içe) ve `Rejects_invalid_action_bar` (alt metinlerle): v1 sayfada → "İzin verilmeyen bileşen türü"; iki `actionBar` → "en fazla bir"; `saveQuery` delete ya da read sorgusu → "saveQuery"; `deleteQuery` insert sorgusu → "deleteQuery"; olmayan sorgu → "sayfada yok"; `newInputs`/`focusInput` giriş olmayan bileşen → "giriş bileşeni değil"; `exportTable` sorgusuz tablo → "exportTable"; `moreButtons` düğme olmayan bileşen → "düğme bileşeni değil"; `moreButtons` 11 öğe ya da aynı kimlik iki kez → "moreButtons"; `printEnabled: "evet"` → "printEnabled"; `actionBar` dışında `saveQuery` → "yalnızca İşlem Çubuğu".
- [ ] **Step 2: Run to verify failure** — `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPage"` · Expected: yeni testler FAIL
- [ ] **Step 3: Implement** — 2b'deki `ComponentTypesById` ve döngü sonrası `ResolveLayoutReferences` desenini genişlet (`ButtonIds`, sorgu türleri `Context.QueryKinds`'ten). Hata metinleri Türkçe ve özelliği adlandırır.
- [ ] **Step 4: Run to verify pass** — aynı komut · Expected: PASS
- [ ] **Step 5: Commit** — `Özel sayfa şeması: İşlem Çubuğu bileşeni`

---

### Task 2: ERP — saf komut kuralları ve ortak yazma yardımcısı

**Files:** Create `frontend/erp-web/src/custom-page/pageActions.ts`, `pageActions.test.ts`, `writeAction.ts`; Modify `frontend/erp-web/src/TenantCustomPage.tsx` (`QueryActionButton` yeni yardımcıyı kullanır, davranış aynı kalır)

**Interfaces — Produces:**
- `export function actionBarOf(components: { id: string; type: string; props?: Record<string, unknown> }[]): { id: string; props: Record<string, unknown> } | null` — düzleştirilmiş dizideki ilk `actionBar`.
- `export function movedButtonIds(components): Set<string>` — `actionBar.moreButtons` (2b `idList` kuralıyla).
- `export type PageActionDeps = { rights: Record<string, boolean>; busy: boolean; queryKind: (id: string) => string | undefined; inputIds: Set<string>; tableState: (tableId: string) => { loading: boolean; error?: string; rowCount: number } | undefined; buttonLabel: (id: string) => string | undefined; run: { clearInputs(ids: string[]): void; write(queryId: string, kind: "save" | "delete"): void; refresh(): void; focus(inputId: string): void; print(): void; exportTable(tableId: string): void; button(id: string): void } }`
- `export function buildPageCommands(props: Record<string, unknown>, deps: PageActionDeps): PageCommands` — Global Constraints'teki kurallarla tüm standart komutlar ve `more`; `open` her zaman `{ disabledReason: "Bu sayfada bağlanmadı" }`.
- `export function exportRows(columns: { code: string; label: string }[], rows: Record<string, unknown>[], chosen: string[]): (string | number | null)[][]` — başlık satırı + satırlar; seçili sütun yoksa hepsi; sayı ham, `null`/`undefined` → `null`, boolean → "Evet"/"Hayır", nesne → JSON.
- `writeAction.ts`: `export async function runWriteAction(opts: { query: PageQueryDefinition; kind: string; confirm: { enabled: boolean; text?: string; title?: string; confirmLabel?: string; tone?: "danger" | "default" }; isPreview: boolean; write: (query, confirmWrite: boolean) => Promise<{ affectedRows: number }>; inFlight: { current: boolean } }): Promise<{ ok: true; affectedRows: number } | { ok: false; cancelled: true } | { ok: false; error: string } | { ok: false; busy: true }>` — `QueryActionButton`'daki onay/önizleme uyarısı/tek uçuş mantığının aynısı.

- [ ] **Step 1: Write failing tests** — `buildPageCommands`:
  - boş props → `save`/`delete`/`new`/`filter`/`print`/`export`/`open` hepsi `disabledReason: "Bu sayfada bağlanmadı"`, `refresh.run` tanımlı, birincil yok;
  - `saveQuery` insert + `rights.insert=true` → `save.primary=true`, `run` → `deps.run.write(id,"save")`;
  - `rights.insert=false` → `save.disabledReason === "Bu işlem için yetkiniz yok"`; `saveQuery` update → `rights.update` bakılır;
  - `busy=true` → save/delete `"İşlem sürüyor…"`;
  - `newInputs` var, `saveQuery` yok → `new.primary=true`;
  - `exportTable` yükleniyor → `"Liste henüz yüklenmedi"`, hata → hata metni, hazır → `run` çağırır;
  - `moreButtons:["b1"]` → `more:[{id:"b1",label:"Onayla",…}]`.
  `exportRows`: seçili sütunlar sırası, `null`, boolean, nesne. `runWriteAction` (mock `confirmDialog`): Vazgeç → `cancelled`, `write` çağrılmaz; ikinci eşzamanlı çağrı `busy`; önizlemede onay her zaman sorulur.
- [ ] **Step 2: Run to verify failure** — `cd frontend/erp-web && npx vitest run src/custom-page/pageActions src/custom-page/writeAction` · Expected: FAIL
- [ ] **Step 3: Implement**; `QueryActionButton`'ı `runWriteAction` kullanacak şekilde değiştir (mevcut testler aynen geçmeli).
- [ ] **Step 4: Run to verify pass** — `npx vitest run`, `npm run build` · Expected: PASS
- [ ] **Step 5: Commit** — `ERP özel sayfa: İşlem Çubuğu komut kuralları ve ortak yazma yardımcısı`

---

### Task 3: ERP — komut kaydı, durum satırı, taşınan düğmeler

**Files:** Modify `frontend/erp-web/src/TenantCustomPage.tsx`, `frontend/erp-web/src/tenant-custom-page.css`; Create `frontend/erp-web/src/custom-page/PageActionBar.test.tsx`

**Interfaces — Consumes:** Task 2 imzaları; `usePageCommands` (`src/commands/CommandProvider.tsx`), `downloadXlsx` (`src/general-ledger/ledgerReportUtils.ts`), `PageRuntime` (`rights`, `states`, `queryNames`, `queryById`, `writeFor`, `rerun`, `setInput`, `isPreview`, `inputById`, `tableById`).

- [ ] **Step 1: Write failing tests** (`PageActionBar.test.tsx`, `CommandProvider` + mock `erpApi`, mevcut `TenantCustomPageLayout.test.tsx` deseniyle): `actionBar` olmayan sayfada `save` komutu kayıtlı değil (çubuk tamamen soluk); `saveQuery` bağlı sayfada Ctrl+S tek yazma isteği (iki kez basınca da bir); Sil → onay penceresi, Vazgeç istek yok, Sil istek var ve durum satırında "(1 kayıt)"; `moreButtons`'taki düğme sayfada yok, İşlemler menüsünde var; Excel → `downloadXlsx` (mock) doğru satırlarla çağrılır.
- [ ] **Step 2: Run to verify failure** — `npx vitest run src/custom-page/PageActionBar` · Expected: FAIL
- [ ] **Step 3: Implement** — sayfa gövdesinde `actionBar` varsa `usePageCommands(buildPageCommands(...))` (yalnız v2 ve runtime varken; `actionBar` yoksa hiç kaydetme); `renderComponent` `actionBar` için durum satırı çizer (`.tenant-page-action-status`, boşken hiçbir şey); `button` dalı `movedButtonIds`'teki düğmeleri atlar; yazma sonrası `rerun` tüm `load` okuma sorguları. CSS: durum satırı başarı `--nx-ok`/`--nx-ok-bg`, hata `--nx-bad`/`--nx-bad-bg`, 12px, köşe 6px.
- [ ] **Step 4: Run to verify pass** — `npx vitest run`, `npm run build` · Expected: PASS
- [ ] **Step 5: Commit** — `ERP özel sayfa: İşlem Çubuğu bağlama`

---

### Task 4: Studio — palet, müfettiş, tuval

**Files:** Create `.../page-designer/pageActions.ts` (Task 2'nin `actionBarOf`, `movedButtonIds` kopyası); Modify `.../page-designer/LayoutFields.tsx`, `.../page-designer/CanvasPreviews.tsx`, `.../CustomPagesPage.tsx`, `.../custom-pages.css`

- [ ] **Step 1: Palet** — "Tasarım dili" grubunun başına **İşlem Çubuğu** (ikon `PanelTop`); sayfada zaten varsa palet öğesi soluk ve "Sayfada zaten bir İşlem Çubuğu var" ipuçlu; varsayılan genişlik 12, iç boşluk 0; eklendiğinde boş props (tüm komutlar bağlanmamış — sunucu kabul eder).
- [ ] **Step 2: Müfettiş** — bölüm "Komutlar": Yeni → `InputPicker` (temizlenecek girişler); Kaydet → ekleme/güncelleme sorgusu seçimi (Yok); Sil → silme sorgusu (Yok); Filtre → giriş seçimi (Yok); Yazdır → onay kutusu; Excel → sorgu bağlı tablo seçimi (Yok); İşlemler → düğme seçici (sırası değiştirilebilir, en fazla 10). Her satırda kısayol rozeti (`F2`, `Ctrl+S` …) ve "Yenile (F5) her zaman sayfadaki sorguları yeniden çalıştırır" notu.
- [ ] **Step 3: Başvuru temizliği** — 2b'deki `reconcileLayoutRefs`'e `actionBar` kuralları: silinen/uygunsuz giriş, sorgu (tür değişirse de), tablo (sorgusu kalkarsa), düğme kaldırılır; ikinci `actionBar` eklenemez. Kayıt öncesi denetim değişmez (boş `actionBar` geçerlidir).
- [ ] **Step 4: Tuval** — `ActionBarPreview`: taslak 06'daki çubuk (sabit sıra, kısayol rozetleri, birincil mavi, bağlanmamış soluk, İşlemler sayısı) ve altında "Bu çubuk ERP'de sayfanın üstündeki İşlem Çubuğu'nda görünür" notu; `moreButtons` düğmeleri tuvalde kendi yerinde çizilmez. `useMemo` bağımlılıklarını kontrol et.
- [ ] **Step 5: Verify** — `cd frontend/development-studio && npm run build` · Expected: ✓ built
- [ ] **Step 6: Commit** — `Studio: İşlem Çubuğu bileşeni`

---

### Task 5: Görsel kontrol (denetleyici)

- [ ] Yalnız `QA Test Firma 20261117`'de `qa-tasarim-dili-2c` sayfası: ajanda listesi + Form kartı (başlık girişi) + ekleme/silme sorguları + `actionBar` (Yeni → başlık temizler, Kaydet → ekler, Sil → seçili satırı siler, Excel → indirir, İşlemler → bir sorgu düğmesi). ERP'de: çubukta bağlı komutlar etkin, bağlanmayan Aç soluk; Ctrl+S ekler ve liste yenilenir; Sil onay sorar. Studio tuvalinde çubuk önizlemesi.
