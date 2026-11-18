# Sayfa tasarımcısı · tasarım dili adım 2b (Form kartı, Bağlam paneli, Filtre çipleri, Yan filtre paneli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onaylı taslaktaki dört düzen bileşenini (Form kartı, Bağlam paneli, Filtre çipleri, Yan filtre paneli) özel sayfalara eklemek: sunucu şeması, ERP gösterimi, Studio paleti/müfettişi/tuvali.

**Architecture:** Studio tasarımcısı bileşenleri düz bir dizi olarak tutar (iç içe `children` düzenlenmez). Bu yüzden dört bileşen de **başvurulu** bileşendir: sayfadaki diğer bileşenleri kimlikleriyle (`id`) gösterir. Form kartı ve Yan filtre paneli listeledikleri giriş kutularının **sahibidir**: sahiplenilen giriş kutusu sayfada kendi yerinde çizilmez, yalnız sahibinin içinde çizilir. Filtre çipleri ve Bağlam paneli sahiplenmez, yalnız okur/değiştirir. Yeni türler yalnız `schemaVersion: 2` sayfalarda geçerlidir.

**Tech Stack:** .NET 10 / xUnit, React + TypeScript + Vite, Vitest + Testing Library (erp-web), lucide-react.

**Spec:** `docs/design-proposals/erp-design-language/06-sayfa-tasarimcisi-bilesen-ve-sablonlar.html` (bölüm 1: Filtre çipleri ve arama, Yan filtre paneli, Form kartı, Bağlam paneli; bölüm 3: palette "Tasarım dili" grubu) ve `docs/superpowers/specs/2026-11-16-erp-design-language-design.md` §5.3, §5.6, §6 (A, B tipleri).

Adım 2'nin kalanı: **2c** İşlem Çubuğu bağlama (`usePageCommands`), ayrı plan.

## Global Constraints

- Yeni bileşen türleri (yalnız v2): `formCard`, `contextPanel`, `filterChips`, `facetPanel`. Türkçe palet adları: Form kartı, Bağlam paneli, Filtre çipleri, Yan filtre paneli; palet grubu adı **"Tasarım dili"** (Studio'da diğer grupların önünde).
- Varsayılan genişlik (12 kolon): `formCard` 12, `contextPanel` 4, `filterChips` 12, `facetPanel` 3. Varsayılan iç boşluk 12px, köşe 8px (adım 1 kuralı; `filterChips` iç boşluk 0).
- Görünüm taslak 01'den: kart başlığı 13px/650; form ızgarası 1–3 sütun, aralık 10px 14px; alan etiketi 11,5px `--nx-muted` (zorunluysa `*` `--nx-bad`); çip `border-radius:999px`, `padding:3px 10px`, 12px, `--nx-primary-soft` zemin, `--nx-primary-strong` metin, kenar `color-mix(--nx-primary 30%, surface)`; yan panel başlığı 650, grup başlığı 11px büyük harf `--nx-muted`, seçenek satırı sağda sayı `--nx-muted`; bağlam paneli bölüm başlığı 11px büyük harf, alan ızgarası 2 sütun, alan kutusu zemin `--nx-table-head`, değer 14px tabular-nums. Renk yalnız `--nx-*` (Studio tuvalinde `--dl-*`).
- ERP'deki eski `.app-shell` kuralları düz seçicileri ezer; yeni ERP kuralları gerekirse `.app-shell .tenant-custom-page …` önekiyle ve eski kuralda `!important` olan özelliklerde `!important` ile yazılır.
- Hücre/değer biçimi adım 2a'nın `cellFormat.ts` kurallarıyla (`formatCell`, `parseColumnFormats`); yeni biçim kuralı yazılmaz.
- Sunucu sınırları (Task 1): `inputs` en fazla 12 giriş kimliği; `fields` en fazla 12 öğe `^[^=]{1,128}=[^=]{1,60}\z` ("sütun=Etiket"); `facetCounts` en fazla 12 öğe `^[^=]{1,64}=[^=]{1,128}\z` ("girişKimliği=sayıSütunu"); `columns` 1, 2 veya 3; bir giriş kutusu en fazla **bir** sahibe (`formCard` ya da `facetPanel`) ait olabilir.

## Review Focus

1. **Sahiplenilen giriş iki kez çizilmesin:** Form kartına alınan giriş kutusu sayfadaki kendi yerinde de çizilirse kullanıcı aynı kutuyu iki kez görür ve değerler karışır → sahiplenilen giriş yalnız sahibinde çizilir; sahip silinince giriş kendi yerinde yeniden görünür. (Task 2, Task 5)
2. **Seçili satır yokken bağlam paneli:** tablo henüz yüklenmemiş, satır seçilmemiş ya da sorgu yeniden çalışınca seçim düşmüş → panel "Bir satır seçin" der, eski satırın değerlerini göstermez. (Task 4)
3. **Yan filtre panelinde "Tümü":** seçili seçeneğe yeniden tıklamak ya da "Tümü" seçmek girişi boşaltır; seçenek sorgusu hata verirse panel hatayı gösterir, sayfa çökmez; sayı sütunu yoksa sayı çizilmez. (Task 3)
4. **Filtre çipinde boş/biçimli değer:** boş giriş çip üretmez; onay kutusu girişi "Evet" olarak, tarih girişi `17.11.2026` olarak, seçim girişi seçeneğin etiketiyle gösterilir; ✕ yalnız o girişi boşaltır, "Temizle" listedeki hepsini. (Task 3)
5. **Silinen başvurular:** Studio'da giriş, tablo ya da sorgu silinince başvuran bileşenlerden temizlenir; sunucu sayfada olmayan kimliğe başvuran tanımı anlamlı Türkçe hatayla reddeder. (Task 1, Task 5)

---

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` | Yeni türler, özellikler, başvuru ve tek-sahip doğrulaması |
| `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs` | Şema testleri |
| `frontend/erp-web/src/custom-page/layoutRefs.ts` (yeni) | Saf yardımcılar: sahiplik, alan listesi ayrıştırma, çip metni |
| `frontend/erp-web/src/custom-page/layoutRefs.test.ts` (yeni) | Vitest |
| `frontend/erp-web/src/custom-page/LayoutComponents.tsx` (yeni) | `FormCard`, `FilterChips`, `FacetPanel`, `ContextPanel` |
| `frontend/erp-web/src/custom-page/LayoutComponents.test.tsx` (yeni) | Testing Library |
| `frontend/erp-web/src/TenantCustomPage.tsx` | Yeni türleri `renderComponent`'e bağlar, sahiplenilen girişleri atlar; `PageInput`'u dışa açar |
| `frontend/erp-web/src/tenant-custom-page.css` | Yeni stiller |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/layoutRefs.ts` (yeni) | ERP kopyası (aynı imzalar) |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/LayoutFields.tsx` (yeni) | Müfettiş alanları |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/CanvasPreviews.tsx` | Tuval önizlemeleri |
| `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx` | Palet, katalog, müfettiş bağlantısı, başvuru temizliği, tuval |
| `frontend/development-studio/src/platform-tools/erp-src/custom-pages.css` | Tuval ve müfettiş stilleri |

---

### Task 1: Şema doğrulaması

**Files:** Modify `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`; Test `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs`

**Interfaces — Produces (sayfa tanımı sözleşmesi):**
- `formCard`: `title` (bağlanabilir metin), `inputs` (giriş kimlikleri dizisi, 1–12), `columns` (1|2|3, varsayılan 2).
- `contextPanel`: `title`, `table` (sayfadaki **adlı** ve `query` bağlı `dataTable` bileşeninin kimliği), `fields` ("sütun=Etiket" dizisi, 1–12), `relatedQuery` (isteğe bağlı okuma sorgusu kimliği), `relatedTitle` (isteğe bağlı metin ≤60).
- `filterChips`: `inputs` (giriş kimlikleri, 1–12).
- `facetPanel`: `title`, `inputs` (yalnız `inputType: "select"` ve `optionsQuery` olan giriş kimlikleri, 1–12), `facetCounts` ("girişKimliği=sayıSütunu", isteğe bağlı).

- [ ] **Step 1: Write failing tests** — `[Fact] Accepts_layout_components` (her dört tür geçerli örnekle; giriş/tablo bileşenleri dizide sonra ya da önce gelebilir) ve `Rejects_invalid_layout_components` (her biri ayrı `AssertRejected`, beklenen hata alt metniyle):
  - v1 sayfada `formCard` → "İzin verilmeyen bileşen türü"
  - `inputs` boş dizi, 13 öğe, metin olmayan öğe → "inputs"
  - `inputs` sayfada olmayan kimlik → "sayfada yok"
  - `inputs` giriş olmayan bileşen (ör. `heading`) → "giriş bileşeni değil"
  - aynı giriş iki `formCard`'da ya da bir `formCard` ve bir `facetPanel`'de → "birden fazla"
  - `columns: 4` → "columns"
  - `contextPanel.table` adsız tablo, sorgusuz tablo, olmayan kimlik → "table"
  - `fields` 13 öğe, `"Tutar"` (eşittir yok) → "fields"
  - `relatedQuery` yazma sorgusu → "relatedQuery"
  - `facetPanel.inputs` `text` türünde giriş ya da `optionsQuery`'siz seçim → "seçenek sorgulu"
  - `facetCounts` listede olmayan giriş kimliği → "facetCounts"
- [ ] **Step 2: Run to verify failure** — `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPage"` · Expected: yeni testler FAIL
- [ ] **Step 3: Implement** — `ComponentTypesV2`'ye dört türü; `SafePropsV2`'ye `inputs`, `columns`, `table`, `fields`, `relatedQuery`, `relatedTitle`, `facetCounts` ekle (`title` zaten var). Başvurular adım 2a'daki `PendingFilterInputs` deseniyle **bileşen döngüsünden sonra** çözülür: `Context`'e `ComponentTypesById` (id→tür), `NamedQueryTables` (id→adı ve `query`'si olan dataTable), `SelectInputsWithOptions` (id kümesi), bekleyen başvuru listesi ve sahiplik sözlüğü (giriş id → sahip id). Düzenli ifadeler `static readonly`, `CultureInvariant`, 100 ms zaman aşımı, zaman aşımı = red. Mevcut "props'ta en fazla 30 anahtar" ve `SafeValue` kuralları geçerli kalır.
- [ ] **Step 4: Run to verify pass** — aynı komut · Expected: PASS (mevcut testler dahil)
- [ ] **Step 5: Commit** — `Özel sayfa şeması: form kartı, bağlam paneli, filtre çipleri ve yan filtre paneli`

---

### Task 2: ERP — sahiplik yardımcıları ve Form kartı

**Files:** Create `frontend/erp-web/src/custom-page/layoutRefs.ts`, `layoutRefs.test.ts`, `LayoutComponents.tsx`, `LayoutComponents.test.tsx`; Modify `frontend/erp-web/src/TenantCustomPage.tsx`, `frontend/erp-web/src/tenant-custom-page.css`

**Interfaces — Produces:**
- `export function ownedInputIds(components: { id: string; type: string; props?: Record<string, unknown> }[]): Set<string>` — `formCard` ve `facetPanel`'in `inputs` dizilerindeki kimlikler.
- `export function idList(value: unknown, max = 12): string[]` — metin dizisinden tekil, boş olmayan, en fazla `max` kimlik.
- `export function parseFieldList(value: unknown): { code: string; label: string }[]` — "sütun=Etiket".
- `export function FormCard(props: { title: string; columns: 1 | 2 | 3; children: ReactNode; style: CSSProperties }): JSX.Element` — taslak `.card` + `.fg3`; içindeki her giriş kutusu ızgara hücresi.
- `TenantCustomPage.tsx`: `PageInput` dışa açılır (export); `renderComponent` üst düzeyde `ownedInputIds`'deki girişleri atlar; `formCard` dalı sahiplendiği girişleri sırayla `PageInput` ile `FormCard` içinde çizer (girişin kendi `width`'i form içinde yok sayılır).

- [ ] **Step 1: Write failing tests** — `layoutRefs.test.ts`: `ownedInputIds` iki sahipten birleşik küme döndürür, `filterChips`/`contextPanel` sahiplenmez; `idList(["a","a"," ",5,"b"])` → `["a","b"]`; `parseFieldList(["Tutar=Tutar (TL)","bozuk"])` → bir öğe. `LayoutComponents.test.tsx`: `FormCard` başlığı ve `columns=3` için `is-cols-3` sınıfı; çocuklar ızgarada.
- [ ] **Step 2: Run to verify failure** — `cd frontend/erp-web && npx vitest run src/custom-page/layoutRefs src/custom-page/LayoutComponents` · Expected: FAIL
- [ ] **Step 3: Implement** — yukarıdaki imzalar; CSS: `.tenant-page-form-card` (taslak `.card`), `.tenant-page-form-card-grid.is-cols-1|2|3`, form içindeki `.tenant-page-input` etiket/kutu ölçüleri adım 1 kurallarıyla.
- [ ] **Step 4: Run to verify pass** — aynı komut, sonra `npx vitest run` ve `npm run build` · Expected: PASS
- [ ] **Step 5: Commit** — `ERP özel sayfa: form kartı ve giriş sahipliği`

---

### Task 3: ERP — Filtre çipleri ve Yan filtre paneli

**Files:** Modify `frontend/erp-web/src/custom-page/LayoutComponents.tsx`, `LayoutComponents.test.tsx`, `layoutRefs.ts`, `layoutRefs.test.ts`, `TenantCustomPage.tsx`, `tenant-custom-page.css`

**Interfaces:**
- Consumes: Task 2 (`idList`), `PageRuntime.inputValues`, `PageRuntime.setInput`, `PageRuntime.states`/`queryNames` (seçenek sorgusu), adım 2a `formatCell`.
- Produces:
  - `export function chipText(raw: unknown, inputType: string, options?: { value: string; label: string }[]): string | null` — boş → `null`; `checkbox` true → "Evet" (false → `null`); `date` → `formatCell(raw, "date")`; `select` → eşleşen seçeneğin etiketi, yoksa değer; diğerleri metin.
  - `export function FilterChips(props: { chips: { id: string; label: string; text: string }[]; onClear: (id: string) => void; onClearAll: () => void; style: CSSProperties }): JSX.Element | null` — çip yoksa `null`; her çipte "Etiket: değer ✕" (✕ `button`, `aria-label="<Etiket> süzgecini kaldır"`); en az bir çip varken "Temizle" düğmesi.
  - `export function FacetPanel(props: { title: string; groups: { id: string; label: string; options: { value: string; label: string; count?: number }[]; selected: string; loading: boolean; error?: string }[]; onSelect: (inputId: string, value: string) => void; style: CSSProperties }): JSX.Element` — taslak `.facet`: başlık + "Temizle" (tüm grupları boşaltır); her grupta "Tümü" + seçenekler (radio rolünde düğmeler, `aria-checked`); seçili seçeneğe tekrar tıklamak `""` gönderir; sayı varsa sağda.

- [ ] **Step 1: Write failing tests** — `chipText`: `""`→null, `true`/"checkbox"→"Evet", `false`/"checkbox"→null, `"2026-11-17"`/"date"→"17.11.2026", `"TR"`/"select" seçenek `{value:"TR",label:"Türkiye"}`→"Türkiye". `FilterChips`: iki çip çizer, ✕ `onClear("in1")`, "Temizle" `onClearAll`, boş listede hiçbir şey çizmez. `FacetPanel`: "Tümü" seçili başlar; seçeneğe tıklama `onSelect("in1","Merkez")`; seçili olana tekrar tıklama `onSelect("in1","")`; `error` verilince hata metni; `count` yoksa sayı yok.
- [ ] **Step 2: Run to verify failure** — `npx vitest run src/custom-page` · Expected: FAIL
- [ ] **Step 3: Implement** ve `renderComponent`'e bağla: `filterChips` → listedeki girişlerin etiketleri (girişin `label`'ı, yoksa `name`), değerleri `chipText` ile; `facetPanel` → her giriş için seçenekler `optionsQuery` sonucundan (`optionValueColumn`/`optionLabelColumn` mantığı `PageInput` ile aynı), sayı `facetCounts`'taki sütundan. CSS: `.tenant-page-chips` (taslak `.chips`/`.chip`), `.tenant-page-facet` (taslak `.facet`).
- [ ] **Step 4: Run to verify pass** — `npx vitest run`, `npm run build` · Expected: PASS
- [ ] **Step 5: Commit** — `ERP özel sayfa: filtre çipleri ve yan filtre paneli`

---

### Task 4: ERP — Bağlam paneli

**Files:** Modify `frontend/erp-web/src/custom-page/LayoutComponents.tsx`, `LayoutComponents.test.tsx`, `TenantCustomPage.tsx`, `tenant-custom-page.css`

**Interfaces:**
- Consumes: Task 2 `parseFieldList`, `PageRuntime.selections` (tablo **adıyla**), adım 2a `formatCell`/`parseColumnFormats` (tablonun `columnFormats`'ı alan değerlerine uygulanır), `PageRuntime.states` (`relatedQuery`).
- Produces: `export function ContextPanel(props: { title: string; row: Record<string, unknown> | null; fields: { code: string; label: string; text: string }[]; related?: { title: string; rows: string[]; loading: boolean; error?: string }; style: CSSProperties }): JSX.Element` — `row` null ise "Bir satır seçin" (taslak `.det`); doluysa `.st4` benzeri 2 sütunlu alan kutuları ve isteğe bağlı ilgili liste (ilk 5 satırın ilk iki sütunu "değer · değer").

- [ ] **Step 1: Write failing tests** — `row=null` → "Bir satır seçin" ve alan yok; dolu satırda iki alan etiket+değer; `related.loading` → "Yükleniyor…"; `related.error` → hata metni; `related.rows` 5'ten fazlaysa ilk 5.
- [ ] **Step 2: Run to verify failure** — `npx vitest run src/custom-page/LayoutComponents` · Expected: FAIL
- [ ] **Step 3: Implement** ve `renderComponent`'e bağla: `table` kimliğinden tablonun `name`'i bulunur, `runtime.selections[name]` satırı; alan metni `formatCell(row[code], formats[code])`; `relatedQuery` durumu `runtime.states[queryNames[relatedQuery]]`. CSS: `.tenant-page-context` (taslak `.det`, `.st4`, `.sect`, `.tl`).
- [ ] **Step 4: Run to verify pass** — `npx vitest run`, `npm run build` · Expected: PASS
- [ ] **Step 5: Commit** — `ERP özel sayfa: bağlam paneli`

---

### Task 5: Studio — palet, müfettiş ve başvuru temizliği

**Files:** Create `.../page-designer/layoutRefs.ts` (Task 2–3'ün `ownedInputIds`, `idList`, `parseFieldList`, `chipText` kopyası; başlık notu), `.../page-designer/LayoutFields.tsx`; Modify `.../CustomPagesPage.tsx`, `.../custom-pages.css`

**Interfaces — Produces:**
- `export function InputPicker({ inputs, value, onChange, owned, filter, disabled }: { inputs: { id: string; label: string; inputType: string; hasOptions: boolean }[]; value: string[]; onChange: (next: string[]) => void; owned?: Record<string, string>; filter?: (input) => boolean; disabled?: boolean })` — onay kutulu liste, seçilenler sırayla yukarı/aşağı taşınabilir, en fazla 12; başka bir sahibe ait giriş soluk ve "Başka kartta" ipuçlu.
- `export function FieldListEditor({ columns, value, onChange, disabled }: { columns: { code: string; label: string }[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean })` — sütun seç + etiket metni (`=` ve `SafeValue`'nun reddettiği parçalar temizlenir), en fazla 12.

- [ ] **Step 1: Palet ve katalog** — `paletteGroups` başına "Tasarım dili"; dört katalog girdisi (ikonlar: `ClipboardList` Form kartı, `PanelRight` Bağlam paneli, `Filter` Filtre çipleri, `SlidersHorizontal` Yan filtre paneli), örnek props ve varsayılan genişlikler Global Constraints'teki gibi; `defaultSpan`/`defaultPadding` güncelle; `contentFields` (`title` olanlara); `managedKeys`'e yeni özellik adları.
- [ ] **Step 2: Müfettiş** — `formCard`: `InputPicker` (sahiplik gösterimiyle) + Sütun sayısı segmenti (1/2/3); `filterChips`: `InputPicker` (sahiplik yok); `facetPanel`: `InputPicker` (`filter`: seçim türü ve seçenek sorgulu) + her seçili giriş için "Sayı sütunu" açılır listesi (seçenek sorgusunun önizleme sütunlarından, "Yok" seçeneği) → `facetCounts`; `contextPanel`: Tablo seçimi (yalnız adlı ve sorgulu tablolar), `FieldListEditor` (tablonun sorgu önizleme sütunları), "İlgili liste" okuma sorgusu seçimi (Yok seçeneği) + başlık.
- [ ] **Step 3: Başvuru temizliği** — bileşen silinince tüm `inputs` dizilerinden ve `contextPanel.table`'dan kaldırılır (`facetCounts` girdisi de); sorgu silinince `relatedQuery` kaldırılır; bir tablonun adı silinir ya da sorgusu kaldırılırsa ona bağlı `contextPanel.table` kaldırılır; giriş türü değişip seçim/seçenek sorgusu dışına çıkarsa `facetPanel`'den çıkar. Sunucunun reddedeceği tanım üretilmez.
- [ ] **Step 4: Verify** — `cd frontend/development-studio && npm run build` · Expected: ✓ built
- [ ] **Step 5: Commit** — `Studio: düzen bileşenleri için palet ve müfettiş`

---

### Task 6: Studio tuvali önizlemesi ve görsel kontrol

**Files:** Modify `.../page-designer/CanvasPreviews.tsx`, `.../CustomPagesPage.tsx`, `.../custom-pages.css`

**Interfaces — Consumes:** Task 5 `layoutRefs.ts`; ERP görünümü (Task 2–4) referans.

- [ ] **Step 1: Implement** — tuvalde sahiplenilen girişler kendi yerinde çizilmez (sahibinin içinde çizilir); `FormCardPreview`, `FilterChipsPreview` (girişlerin varsayılan değerlerinden; hiç değer yoksa soluk örnek çip "Örnek: değer" gösterilir ki bileşen görünür kalsın), `FacetPanelPreview` (seçenek sorgusunun önizleme satırlarından; önizleme yoksa "Seçenekler için sorguyu önizleyin"), `ContextPanelPreview` (tablonun önizlemesindeki ilk satırla dolu gösterilir; önizleme yoksa "Bir satır seçin"). Görünüm `.pd-frame` altında `--dl-*` ile ERP'nin aynısı. Tuval öğe listesinin `useMemo` bağımlılıklarına yeni kullanılan her durumun eklendiğini kontrol et (2a'daki `counts` hatasının tekrarı olmasın).
- [ ] **Step 2: Verify builds and tests** — `cd frontend/development-studio && npm run build`; `cd frontend/erp-web && npm run build && npx vitest run`; `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPage"` · Expected: hepsi geçer.
- [ ] **Step 3: Görsel kontrol (denetleyici yapar)** — yalnız `QA Test Firma 20261117` firmasında `qa-tasarim-dili-2b` sayfası: yan filtre + çipler + tablo + bağlam paneli (taslak 06 "A · Liste ekranı" düzeni) ve form kartlı bir ekleme formu; ERP'de seçenek seçme → çip görünür → ✕ kaldırır; satır seçme → bağlam paneli dolar; Studio tuvalinde aynı düzen.
- [ ] **Step 4: Commit** — `Studio tuvali: düzen bileşeni önizlemeleri`
