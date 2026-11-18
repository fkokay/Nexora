# Sayfa tasarımcısı · tasarım dili adım 2a (Özet kartı, Durum etiketi, Liste tablosu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onaylı taslaktaki üç görünüm bileşenini (Özet kartı, Durum etiketi, Liste tablosu ayarları) özel sayfa şemasına, Studio tasarımcısına ve ERP gösterimine eklemek.

**Architecture:** Yeni bileşen türü eklenmez; mevcut `metric`, `badge`, `dataTable` türleri yeni özellikler alır. Sunucu (`TenantCustomPageSchema`) yeni özellikleri doğrular; ERP (`frontend/erp-web`) ve Studio tuvali (`frontend/development-studio`) aynı saf biçimlendirme kurallarını ayrı birer küçük modülle uygular (iki uygulama kod paylaşmaz; `pageCounts.ts` / `usePageCounts.ts` emsali).

**Tech Stack:** .NET 10 / xUnit (şema), React + TypeScript + Vite, Vitest (yalnız erp-web), lucide-react.

**Spec:** `docs/design-proposals/erp-design-language/06-sayfa-tasarimcisi-bilesen-ve-sablonlar.html` (bölüm 1: Özet kartı, Durum etiketi, Liste tablosu) ve `docs/superpowers/specs/2026-11-16-erp-design-language-design.md` §5.1, §5.2, §5.6.

Adım 2'nin kalanı ayrı planlardır: **2b** Form kartı, Bağlam paneli, Filtre çipleri, Yan filtre paneli; **2c** İşlem Çubuğu bağlama (`usePageCommands`).

## Global Constraints

- Renk anlam taşır: olumlu `--nx-ok`/`--nx-ok-bg`, dikkat `--nx-warn`/`--nx-warn-bg`, hata `--nx-bad`/`--nx-bad-bg`, nötr/bilgi `--nx-primary-strong`/`--nx-primary-soft`. Dekoratif renk yok. ERP'de yalnız `--nx-*` token'ları; Studio tuvalinde `.pd-frame` altındaki `--dl-*` karşılıkları.
- Sayılar `font-variant-numeric: tabular-nums`, sağa hizalı, Türkçe biçim `1.234,56`; kodlar `Consolas` eş aralıklı.
- Ton değerleri şemadaki mevcut küme: `info`, `success`, `warning`, `danger` (alert/badge `variant` ile aynı). Yeni ton adı icat edilmez.
- Tüm yeni özellikler yalnız `schemaVersion: 2` sayfalarda geçerlidir (Studio her zaman v2 kaydeder).
- Şema `SafeValue` kuralı: dizi öğeleri yalnız metin, `<`, `>`, `{{`, `}}`, `javascript:`, `data:` içeremez; yeni dizi özellikleri bu kurala ek olarak aşağıdaki biçim kurallarına uyar.
- ERP'deki eski `.app-shell` genel kuralları (`input`, `table … :is(th, td)`, `.content button`; kısmen `!important`) yeni CSS'i ezer; yeni ERP kuralları `.app-shell .tenant-custom-page …` önekiyle yazılır (adım 1'deki yaklaşım).
- Yeni Türkçe metinler mevcut tasarımcı/ERP sözcükleriyle aynı dilde; erp-web'de `src/locales/en/` karşılığı yalnız ortak çeviri anahtarı kullanılan yerlerde gerekir (özel sayfa gösterimi şu an sabit Türkçe metin kullanır, aynı biçimde devam edilir).

## Review Focus

1. **Eşleşmeyen durum değeri:** `toneMap` tanımlı ama hücre/rozet metni hiçbir anahtarla eşleşmiyor → rozet kendi `variant` tonunda kalır; tablo hücresi tonsuz (nötr gri) etiket olarak çizilir; boş değer `—` kalır. (Task 1 ve Task 4 testleri)
2. **Bağlama ile gelen metin:** rozet metni `{{liste.seciliSatir.Durum}}` gibi bağlamadan geliyor ve büyük/küçük harf ya da baş/son boşluk farklı (`" aktif "`) → eşleme Türkçe yerelinde harf duyarsız ve kırpılmış yapılır (`İ`/`i` dahil). (Task 1)
3. **Toplam satırında sayı olmayan değerler:** toplam sütununda metin, `null` veya ondalık metin (`"12,5"` değil, sunucu sayıyı number olarak gönderir) → sayı olmayan hücreler toplama katılmaz; hiç sayı yoksa hücre `—`. Sonuç `truncated` ise etiket "Toplam · ilk N satır". (Task 1 ve Task 4)
4. **Silinen giriş / sorgu referansı:** göstergenin `filterInput`'u ya da `trendQuery`'si sayfadan silinmiş bileşen/sorguyu gösteriyor → sunucu kaydı reddeder (anlamlı hata); Studio silmede referansı temizler (mevcut `dropQueryReferences` ve bileşen silme). (Task 2 ve Task 3)
5. **Tıkla-süz geri alma:** gösterge zaten süzmedeyken tekrar tıklanırsa giriş boşaltılır; giriş elle değişip `filterValue`'dan farklılaşırsa kart vurgusu kalkar. (Task 5)

---

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` | Yeni özelliklerin doğrulanması |
| `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs` | Şema testleri |
| `frontend/erp-web/src/custom-page/cellFormat.ts` (yeni) | Saf kurallar: ton eşleme, sütun biçimi, toplam, eğilim noktaları |
| `frontend/erp-web/src/custom-page/cellFormat.test.ts` (yeni) | Vitest |
| `frontend/erp-web/src/custom-page/MetricCard.tsx` (yeni) | ERP özet kartı (ikon, ton, eğilim, tıkla-süz) |
| `frontend/erp-web/src/TenantCustomPage.tsx` | metric/badge/dataTable gösterimini yeni modüllere bağlar |
| `frontend/erp-web/src/TenantReportWidget.tsx` | rapor kaynaklı tablo ve göstergede biçim/ton |
| `frontend/erp-web/src/tenant-custom-page.css` | yeni sınıflar |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/cellFormat.ts` (yeni) | Studio kopyası (aynı imzalar) |
| `frontend/development-studio/src/platform-tools/erp-src/page-designer/DesignLanguageFields.tsx` (yeni) | Müfettiş alanları: ikon/ton seçimi, ton eşleme editörü, sütun biçimi editörü |
| `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx` | palet örnekleri, müfettiş bölümleri, tuval önizlemesi |
| `frontend/development-studio/src/platform-tools/erp-src/custom-pages.css` | tuval ve müfettiş stilleri |

---

### Task 1: ERP saf biçimlendirme modülü

**Files:**
- Create: `frontend/erp-web/src/custom-page/cellFormat.ts`
- Test: `frontend/erp-web/src/custom-page/cellFormat.test.ts`

**Interfaces:**
- Produces:
  - `export type Tone = "info" | "success" | "warning" | "danger"`
  - `export type ColumnFormat = "text" | "code" | "number" | "money" | "date" | "status"`
  - `export const TONES: readonly Tone[]`, `export const COLUMN_FORMATS: readonly ColumnFormat[]`
  - `export function parseToneMap(entries: unknown): { key: string; tone: Tone }[]` — `"Değer=success"` dizisinden; geçersiz öğe atlanır.
  - `export function toneFor(text: string, map: { key: string; tone: Tone }[]): Tone | null` — `toLocaleLowerCase("tr-TR")` + `trim` karşılaştırma.
  - `export function parseColumnFormats(entries: unknown): Record<string, ColumnFormat>` — `"kod=money"` dizisinden.
  - `export function formatCell(value: unknown, format: ColumnFormat | undefined, dataType?: string): string` — `null`/`""` → `"—"`; `number`: tr-TR en fazla 2 ondalık; `money`: tam 2 ondalık; `date`: `dd.MM.yyyy` (ISO metin ya da Date); `code`/`text`/`status`: metin; biçim yoksa `dataType` `number|decimal` ise `number` gibi.
  - `export function isRightAligned(format: ColumnFormat | undefined, dataType?: string): boolean` — `number`, `money` ya da biçimsiz sayı türü.
  - `export function columnTotal(rows: Record<string, unknown>[], code: string): number | null` — yalnız `typeof === "number"` ve sonlu değerler; hiç yoksa `null`.
  - `export function trendPoints(rows: Record<string, unknown>[], max = 30): number[]` — ilk sayısal sütunun değerleri, satır sırasıyla, en fazla `max`.
  - `export function sparklinePath(points: number[], width: number, height: number): string` — SVG `points` özniteliği; tek nokta/boş → `""`; tüm değerler eşitse yatay orta çizgi.

- [ ] **Step 1: Write the failing tests** — `describe("cellFormat")` içinde:
  - `parseToneMap(["Aktif=success", "Pasif=danger", "bozuk", "X=mor", 5])` → `[{key:"Aktif",tone:"success"},{key:"Pasif",tone:"danger"}]`
  - `toneFor(" aktif ", map)` → `"success"`; `toneFor("İPTAL", parseToneMap(["iptal=danger"]))` → `"danger"`; eşleşmeyen → `null`
  - `formatCell(1234.5, "money")` → `"1.234,50"`; `formatCell(1234.567, "number")` → `"1.234,57"`; `formatCell(null, "number")` → `"—"`; `formatCell("2026-11-17T09:18:24+00:00", "date")` → `"17.11.2026"`; `formatCell(1250, undefined, "decimal")` → `"1.250"`
  - `isRightAligned("money")` → `true`; `isRightAligned(undefined, "number")` → `true`; `isRightAligned("code")` → `false`
  - `columnTotal([{a:1.5},{a:"x"},{a:null},{a:2}], "a")` → `3.5`; `columnTotal([{a:"x"}], "a")` → `null`
  - `trendPoints([{t:"a",v:3},{t:"b",v:5}])` → `[3,5]`
  - `sparklinePath([1,1], 70, 26)` → her iki y değeri `13`; `sparklinePath([5], 70, 26)` → `""`

- [ ] **Step 2: Run to verify failure** — Run: `cd frontend/erp-web && npx vitest run src/custom-page/cellFormat` · Expected: FAIL (modül yok)

- [ ] **Step 3: Implement** the exports above in `cellFormat.ts` (tarih için `Date` ayrıştırıp `Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })`; geçersiz tarih metni olduğu gibi döner).

- [ ] **Step 4: Run to verify pass** — same command · Expected: PASS

- [ ] **Step 5: Commit** — `git add frontend/erp-web/src/custom-page/cellFormat.ts frontend/erp-web/src/custom-page/cellFormat.test.ts && git commit -m "Özel sayfa: hücre biçimi, ton eşleme ve toplam kuralları"`

---

### Task 2: Şema doğrulaması

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` (`SafePropsV2`, `ValidateComponent` içindeki `variant` kontrolü, `ValidateV2Props`, `Context`, `Validate`)
- Test: `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs`

**Interfaces:**
- Produces (sayfa tanımı sözleşmesi; Task 3–6 bu adları kullanır):
  - `metric`: `variant` (`info|success|warning|danger`), `icon` (`box|users|receipt|wallet|chart|clock|check|alert`), `trendQuery` (sayfadaki okuma sorgusu id'si), `filterInput` (sayfadaki `input` bileşeni id'si), `filterValue` (≤200 karakter metin; `filterInput` olmadan geçersiz).
  - `badge`: `toneMap` (≤20 öğe, her biri `^[^=]{1,60}=(info|success|warning|danger)$`).
  - `dataTable`: `density` (`dense|comfort`), `columnFormats` (≤20 öğe, `^[^=]{1,128}=(text|code|number|money|date|status)$`), `toneMap` (badge ile aynı kural), `totals` (≤12 öğe, 1–128 karakter; yalnız `query` dolu tabloda).

- [ ] **Step 1: Write failing tests** — yeni `[Fact]`'ler, mevcut `V2`, `Query`, `AssertRejected` yardımcılarıyla:
  - `Accepts_design_language_props`: `metric` `{query:"q1", variant:"danger", icon:"alert", trendQuery:"q1", filterInput:"in1", filterValue:"kritik"}` + `input` `{id:"in1", name:"durum"}` + `badge` `{toneMap:["Aktif=success"]}` + `dataTable` `{query:"q1", density:"dense", columnFormats:["Tutar=money","Durum=status"], toneMap:["Pasif=danger"], totals:["Tutar"]}` → `Validate` true.
  - `Rejects_invalid_design_language_props` (Theory/ayrı assert'ler): `variant:"mor"` metric'te; `icon:"rocket"`; `trendQuery:"yok"`; `filterInput:"yok"` (hata "giriş"); `filterInput` metin olmayan bileşeni gösteriyor (ör. `heading` id'si); `filterValue` tek başına; `toneMap:["Aktif=mor"]`; `toneMap` 21 öğe; `columnFormats:["Tutar=para"]`; `density:"tight"`; `totals` sorgusuz `dataTable`'da (`source:"customers"`); `totals` 13 öğe; `toneMap` `heading`'de.
  - `Filter_input_may_be_declared_after_metric`: input bileşeni dizide göstergeden sonra gelse de kabul.

- [ ] **Step 2: Run to verify failure** — Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchemaV2Tests"` · Expected: yeni testler FAIL

- [ ] **Step 3: Implement**
  - `SafePropsV2`'ye `trendQuery`, `filterInput`, `filterValue`, `toneMap`, `density`, `columnFormats`, `totals` ekle.
  - Mevcut `variant` kontrolünü `typeText is "alert" or "badge" or "metric"` yap (yalnız v2'de metric; v1'de metric variant daha önce serbestti → davranışı v1 için değiştirme: koşul `typeText is "alert" or "badge" || context.V2 && typeText == "metric"`).
  - `Context`'e `InputIds` (`HashSet<string>`, Ordinal) ve `PendingFilterInputs` (`List<string>`) ekle; `ValidateComponent` `input` türündeki id'leri `InputIds`'e ekler; `filterInput` değeri `PendingFilterInputs`'e eklenir; `Validate` bileşen döngüsünden sonra karşılığı olmayan ilk değer için `"Göstergenin süzeceği giriş bileşeni sayfada yok: {id}."` hatası verir.
  - `ValidateV2Props`'a yukarıdaki kuralları ekle; biçim kuralları için `static readonly Regex` (`RegexOptions.CultureInvariant`, `TimeSpan.FromMilliseconds(100)` zaman aşımı); hata metinleri Türkçe ve özelliği adlandırır.

- [ ] **Step 4: Run to verify pass** — same command · Expected: PASS (mevcut testler dahil)

- [ ] **Step 5: Commit** — `git commit -m "Özel sayfa şeması: özet kartı, durum etiketi ve liste tablosu özellikleri"`

---

### Task 3: Studio — biçim modülü ve müfettiş alanları

**Files:**
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/cellFormat.ts` — Task 1'in aynı imzaları (kopya; başına "erp-web/src/custom-page/cellFormat.ts ile aynı kurallar" notu).
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/DesignLanguageFields.tsx`
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx` (`contentFields`, `managedKeys`, müfettiş "Veri" bölümü, bileşen silme)

**Interfaces:**
- Consumes: Task 1 imzaları (kopya), Task 2 özellik adları.
- Produces:
  - `export function ToneSelect({ value, onChange, disabled }: { value: Tone | undefined; onChange: (tone: Tone) => void; disabled?: boolean })` — 4 düğmeli segment: Bilgi / Olumlu / Dikkat / Hata.
  - `export function IconSelect({ value, onChange, disabled }: { value: string | undefined; onChange: (icon: string | undefined) => void; disabled?: boolean })` — ikon yok + 8 ikon (lucide: `Box`, `Users`, `Receipt`, `Wallet`, `BarChart3`, `Clock`, `CheckCircle2`, `AlertTriangle`).
  - `export function ToneMapEditor({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean })` — satır başına "Değer" metni + `ToneSelect`; ekle/sil; en fazla 20; `=` içeren değer girişi engellenir.
  - `export function ColumnFormatEditor({ columns, value, onChange, disabled }: { columns: { code: string; label: string }[]; value: string[]; onChange: (next: string[]) => void; disabled?: boolean })` — her sütun için biçim açılır listesi (Metin, Kod, Sayı, Para, Tarih, Durum etiketi); "Metin" seçimi öğeyi diziden çıkarır.

- [ ] **Step 1: Implement** `cellFormat.ts` kopyası ve `DesignLanguageFields.tsx`.
- [ ] **Step 2: Bağla** — müfettişte:
  - `metric` → "Görünüm" bölümünün başına **Anlam** (`ToneSelect`, prop `variant`) ve **İkon** (`IconSelect`, prop `icon`); "Veri" bölümüne **Eğilim** (okuma sorgusu seçimi, "Yok" seçeneği; prop `trendQuery`, ipucu: "Sorgunun ilk sayısal sütunu, satır sırasıyla çizilir.") ve **Tıklayınca süz** (sayfadaki adlı `input` bileşenleri listesi → `filterInput`; seçiliyse "Süzme değeri" metni → `filterValue`).
  - `badge` → `contentFields.badge`'e ek olarak **Değere göre ton** (`ToneMapEditor`, prop `toneMap`; ipucu: "Metin bu değerlerden biriyse ton otomatik seçilir; eşleşmezse yukarıdaki ton kullanılır.").
  - `dataTable` → "Veri" bölümüne **Yoğunluk** (Sık / Rahat segmenti, prop `density`, varsayılan Sık), **Sütun biçimleri** (`ColumnFormatEditor`; sütunlar sorgu önizlemesinden ya da rapor kaynağı sütunlarından), biçimlerden biri `status` ise **Durum tonları** (`ToneMapEditor`, prop `toneMap`), yalnız sorgu bağlıysa **Toplam satırı** (sayı/para biçimli ya da sayı türlü sütunlar için onay kutuları, prop `totals`).
  - `managedKeys`'e yeni özellik adlarını ekle (yoksa müfettiş onları "diğer" alan olarak çizer).
  - Bileşen silinince diğer bileşenlerdeki `filterInput === silinenId` temizlensin; sorgu silinince `trendQuery` temizlensin (`dropQueryReferences`'a `trendQuery` ekle); rapor kaynağına geçişte `totals` silinsin.
- [ ] **Step 3: Verify** — Run: `cd frontend/development-studio && npm run build` · Expected: `✓ built`
- [ ] **Step 4: Commit** — `git commit -m "Studio: özet kartı, durum etiketi ve liste tablosu ayarları"`

---

### Task 4: ERP — durum etiketi ve liste tablosu

**Files:**
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (`renderComponent` `badge` ve `dataTable` dalları, `QueryTable`)
- Modify: `frontend/erp-web/src/TenantReportWidget.tsx` (tablo hücreleri)
- Modify: `frontend/erp-web/src/tenant-custom-page.css`
- Test: `frontend/erp-web/src/custom-page/CustomPageTable.test.tsx` (yeni, Testing Library)

**Interfaces:**
- Consumes: Task 1 (`parseToneMap`, `toneFor`, `parseColumnFormats`, `formatCell`, `isRightAligned`, `columnTotal`).
- Produces: `QueryTable` yeni props `formats: Record<string, ColumnFormat>`, `toneMap`, `totals: string[]`, `density: "dense" | "comfort"`; `TenantReportWidget` yeni props `columnFormats?: unknown`, `toneMap?: unknown`, `density?: unknown`.

- [ ] **Step 1: Write failing tests** (`CustomPageTable.test.tsx`; `QueryTable`'ı test için `export` et):
  - `status` biçimli hücre `"Aktif"` → `.tenant-page-tag.tone-success` içinde; eşleşmeyen `"Beklemede"` → `.tenant-page-tag` nötr (ton sınıfı yok).
  - `money` biçimli `1234.5` → hücre metni `"1.234,50"` ve `num` sınıfı.
  - `totals: ["Tutar"]`, satırlar `[{Tutar:10},{Tutar:"x"},{Tutar:5.5}]` → `tfoot` satırı "Toplam · 3 kayıt" ve `"15,5"`; `truncated: true` → "Toplam · ilk 3 satır".
  - `density: "comfort"` → tabloda `is-comfort` sınıfı.
  - Rozet: `toneMap:["Pasif=danger"]`, `variant:"success"`, metin `"pasif"` → `tone-danger`; metin `"Aktif"` → `tone-success`.
- [ ] **Step 2: Run to verify failure** — Run: `cd frontend/erp-web && npx vitest run src/custom-page/CustomPageTable` · Expected: FAIL
- [ ] **Step 3: Implement** — hücreyi `formatCell` ile yaz, `status` biçiminde `<span className="tenant-page-tag tone-…">`; `tfoot` toplam satırı; `is-comfort` → satır `var(--nx-row-h-comfort)`. Rozette `toneFor(text, parseToneMap(props.toneMap)) ?? variant`. CSS: `.tenant-page-tag` (taslak `.tag`), `.tenant-page-table tfoot td` (taslak `tr.tot`), `.is-comfort`, kod biçimi `var(--nx-font-mono)`; `.app-shell .tenant-custom-page` önekiyle.
- [ ] **Step 4: Run to verify pass** — same command, then `npx vitest run` (tümü) · Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "ERP özel sayfa: durum etiketi ve liste tablosu biçimleri"`

---

### Task 5: ERP — özet kartı

**Files:**
- Create: `frontend/erp-web/src/custom-page/MetricCard.tsx`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (`metric` dalı: `QueryMetric` yerine `MetricCard`; değer/rapor/sorgu kaynağı mantığı korunur)
- Modify: `frontend/erp-web/src/TenantReportWidget.tsx` (`kind="metric"` çizimi `MetricCard`'a değer verir)
- Modify: `frontend/erp-web/src/tenant-custom-page.css`
- Test: `frontend/erp-web/src/custom-page/MetricCard.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`trendPoints`, `sparklinePath`), `PageRuntime.setInput`, `PageRuntime.inputValues`, `PageRuntime.states`/`queryNames` (eğilim sorgusu).
- Produces: `export function MetricCard(props: { title: string; value: ReactNode; description: string; tone: Tone; icon?: string; trend?: number[]; active?: boolean; onActivate?: () => void; style: CSSProperties }): JSX.Element` — `onActivate` varsa kart `button` rolünde, `aria-pressed={active}`, Enter/Boşluk ile çalışır.

- [ ] **Step 1: Write failing tests**:
  - ton `danger` → kökte `tone-danger`, ikon kutusu çizilir (`icon:"alert"`).
  - `trend:[1,3,2]` → `svg polyline` `points` boş değil; `trend:[4]` → svg yok.
  - `onActivate` verildiğinde tıklama çağırır ve `aria-pressed` `active`'i yansıtır; verilmediğinde `role="button"` yok.
- [ ] **Step 2: Run to verify failure** — `npx vitest run src/custom-page/MetricCard` · Expected: FAIL
- [ ] **Step 3: Implement** `MetricCard` (taslak `.mk` kartı: ikon kutusu 32px, etiket 11,5px, değer 16px/650, sağda 70×26 eğilim çizgisi; `active` → taslak `.act` görünümü) ve `metric` dalında bağla: `tone = props.variant` (yoksa `info`), `trend = trendQuery ? trendPoints(runtime.states[queryNames[trendQuery]].rows) : undefined`, `filterInput` varsa `active = String(runtime.inputValues[filterInput] ?? "") === filterValue` ve `onActivate = () => runtime.setInput(filterInput, active ? "" : filterValue)`.
- [ ] **Step 4: Run to verify pass** — tüm Vitest · Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "ERP özel sayfa: özet kartı (ikon, anlam, eğilim, tıkla-süz)"`

---

### Task 6: Studio tuvali önizlemesi, uçtan uca kontrol

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx` (tuval `metric`, `badge`, `dataTable` önizlemeleri; palet örneği: `metric` örneğine `variant:"info"`, `icon:"chart"`)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/custom-pages.css` (`.pd-frame` altında ERP ile aynı görünüm)

**Interfaces:**
- Consumes: Task 3 Studio `cellFormat.ts`, Task 2 özellikleri.

- [ ] **Step 1: Implement** — tuval göstergesi ERP `MetricCard` görünümünü (ikon, ton, eğilim önizleme verisinden) kopyalar; rozet `toneMap` uygular; ızgara `formatCell`, `status` etiketi, `tfoot` toplam ve yoğunluk uygular.
- [ ] **Step 2: Verify builds and tests** — Run: `cd frontend/development-studio && npm run build`; `cd frontend/erp-web && npm run build && npx vitest run`; `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPage"` · Expected: hepsi geçer.
- [ ] **Step 3: Görsel kontrol** — Studio ve ERP'yi yerelde ya da canlı test firmasında (yalnız `QA Test Firma 20261117`) açıp `qa-tasarim-dili-2a` sayfasıyla: özet kartı dört tonda, durum etiketi eşleme, para/tarih/kod/durum sütunları, toplam satırı ve Rahat/Sık. Taslak 06 bölüm 1 ile yan yana karşılaştır; ERP'de hesaplanmış stilleri ölç (değer 16px, etiket 11px/600, satır 30/38px).
- [ ] **Step 4: Commit** — `git commit -m "Studio tuvali: tasarım dili bileşen önizlemeleri"`
