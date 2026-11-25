# Kayıt kartı ve otomatik yerleşim (alt proje 4) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `template: { name: "record" }` taşıyan sayfaları ERP'de Kayıt kartı kalıbıyla çizmek. Studio'da danışmanın bu kartı Sekme → Bölüm → Alan olarak kaynaktan kurmasını, sürükle-bırakla düzenlemesini ve sekmesiz panelden ayarlamasını sağlamak.

**Architecture:**
- **Saklama.** Biçim yalnız eklemeli genişler (yaklaşım A). Kart bugünkü parçalarla saklanır: `recordHeader`, `tabs`, `formCard`, `input`, `dataTable`, `text`, `button`. Her parça `props.slot` ile yerini söyler.
- **ERP.** Alt proje 3'teki `PageShell` içinde yeni bir `RecordTemplate` dalı çizer. Parçalar bugünkü `renderComponent` ile çizilir, bu yüzden doğrulama, değişiklik rozeti ve kaydetme sırası hazır gelir. Bölüm kolonları container query ile azalır.
- **Studio.** Saf bir `recordModel.ts` tanımı düzenler. `RecordPanel` ve tuval üstündeki sürükle-bırak katmanı bu modeli çağırır.

**Tech Stack:** .NET 10 minimal API ve xUnit (entegrasyon testleri); React + Vite + TypeScript ve vitest. erp-web'de jsdom ile `@testing-library`, development-studio'da `renderToString` ve saf fonksiyonlar.

**Spec:** `docs/superpowers/specs/2026-11-25-kayit-karti-design.md` (onaylı). Üst belge: `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md`. Taslak: `docs/design-proposals/studio-sadelestirme/08-kayit-karti.html` (onaylı). Ekran bu taslaktan sapmamalı ([[design-approval-first]]).

## Taban dal

- Dal: `claude/detay-ekrani-bb8e12`. `claude/kaliplar-ve-liste`'nin (PR #172) üstünde açıldı.
- Zincir (#169, #171, #172, #173) master'a birleştikçe `origin/master` bu dala birleştirilir. PR, zincir birleşince master'a karşı açılır. Birleşmemişse `claude/kaliplar-ve-liste`'ye karşı açılır.
- Bu plan migration eklemez.

## Global Constraints

- **Eski sayfalar değişmez.** `template` alanı olmayan sayfanın ve sistem standardının ERP çıktısı birebir aynı kalır. `customer-create` ve form kartlı kalıpsız sayfalar da buna dahildir.
- **Eski Studio tuvali silinmez** (5b'ye kaldı). `CanvasPreviews.tsx`, `useCanvasSamples`, `canvasSamples`, `preview-samples.ts` ve `CustomPagesPage.tsx` içindeki çizim dallarına dokunulmaz.
- **`template`:**
  - Kabul edilen adlar `{ "name": "list" }` ve `{ "name": "record" }`. Fazladan anahtar reddedilir.
  - Basamak saklanmaz: `above` ya da `below` yerinde bileşen varsa 2, yoksa 1.
- **Kayıt kartında yerler (`slot`):**

  | slot | parça | kural |
  |---|---|---|
  | `summary` | `recordHeader` | tam 1 |
  | `actions` | `button` | 0..n |
  | `tabs` | `tabs` | tam 1 |
  | `section` | `formCard` | ≥1 |
  | `field` | `input` | tam 1 `formCard`'ın `inputs`'unda |
  | `lines` | `dataTable` | 0..n |
  | `note` | `text` | 0..n |
  | `above`, `below` | Liste'deki ek alan kuralı | |

  - Her `section`, `lines` ve `note` tam olarak bir sekmede listelenir (`tabs` öğesi `Etiket=id1,id2`).
  - Liste'deki yasaklar burada da geçerlidir: `width`, `widthWhen`, `actionBar`, `spacer`, `divider`.
- **Hata metinleri** (sunucu, tek ve Türkçe):
  - `"Kalıp yalnız \"list\" ya da \"record\" olabilir."`. Bu, Liste'nin bugünkü `"Kalıp yalnız \"list\" olabilir."` metninin yerine geçer; o metni bekleyen test güncellenir.
  - `"Kayıt kartında tam bir kayıt özeti (recordHeader) olmalı."`
  - `"Kayıt kartında tam bir sekme bileşeni (tabs) olmalı."`
  - `"Kayıt kartında her bölüm, tablo ve açıklama tam bir sekmede yer almalı."`
  - `"Kayıt kartında her alan tam bir bölüme ait olmalı."`
  - Yanlış yerdeki parça için Liste'deki biçim kullanılır: `'{slot}' yerine '{type}' bileşeni konamaz; bu yere yalnız '{expected}' konabilir.`
- **Katalog kolonu**, isteğe bağlı yeni anahtarlar:
  - `longText`: bool, yalnız `type: "text"`.
  - `required`: bool.
  - `maxLength`: 1–4000 arası tam sayı, yalnız `type: "text"`.
- **Girdi:**
  - Yeni `inputType: "textarea"`. Her sayfada geçerli, ERP'de çok satırlı.
  - Yeni `readOnly` (bool). Girdi düzenlenemez.
  - Yardım metni bugünkü `description` özelliğidir.
- **Kayıt kartında bağlar** (Studio üretir, ERP okur):
  - Kayıt sorgusu: kimliği `kayit`, `kind: "read"`, `dataSource: <kod>`. Tek parametresi `{{sayfa.parametre.<p>}}`'ye bağlanır.
  - `<p>`: anahtar kolondan `pageParamName` ile türetilir. Bu fonksiyon `listPanelModel.ts`'te zaten var.
  - Her bölüm şunları taşır: `recordKey: "{{kayit.rows[0].<anahtar>}}"`, `trackChanges: true`.
  - Her alan `defaultValue: "{{kayit.rows[0].<kolon>}}"` taşır.
  - Kaydet:
    - `button`, `actionType: "sequence"`, `saveSequence: [ekle?, guncelle?]`.
    - `sequenceWhen: ["<ekle>=kayit.rows[0].<anahtar> == null", "<guncelle>=kayit.rows[0].<anahtar> != null"]`.
    - Eylem parametreleri `{{<alanKimliği>.value}}` ile bağlanır.
  - Sil: `button`, `actionType: "query"`, `kind: "delete"` olan sorgu.
- **Anahtar alanı:**
  - Anahtarı kullanıcı yazıyorsa (*ekle* eyleminde anahtarla aynı adlı parametre var): `disabledWhen: "kayit.rows[0].<anahtar> != null"`, `disabledReason: "Kayıt kodu değiştirilemez."`.
  - Anahtarı sistem üretiyorsa: `readOnly: true`, `placeholder: "(otomatik)"`.
- **Otomatik yerleşim:** bölüm kutusu `container-type: inline-size` taşır.

  | Kutu genişliği | Kolon sayısı |
  |---|---|
  | > 720 px | seçilen sayı |
  | ≤ 720 px | en çok 2 |
  | ≤ 480 px | 1 |

  - `textarea` ve satır tablosu her zaman tam genişliktedir.
  - Kurallar yalnız `.record-template-page` altında geçerlidir. Eski form kartının 900/560 px medya kuralları değişmez.
- **Arayüz metinleri** Türkçedir. Danışman panelinde teknik terim geçmez: sorgu adı, `{{…}}`, `saveSequence`, kimlik.
- **Dağıtım sırası:** platform-api ve erp-web önce, development-studio sonra.

## Kararlar (tasarım §8'den; plan bunları uygular)

1. Açıklama metni sekmede ayrı bir blok olarak durur. `formCard` yalnız girdi taşır.
2. Otomatik kurulum: tek bir "Genel" sekmesi ve onun içinde 2 kolonlu tek bir "Genel bilgiler" bölümü.
3. Kayıt kaynağı olarak, tek parametresi anahtar kolonla aynı adı taşıyan kaynak kullanılabilir. ERP işlemine dayanan kaynakta işlemin zorunlu bilgilerine bakılır (`withOperationParameters`).
4. Zorunluluk kilidi yalnız Studio'da uygulanır.
5. Kaydetten sonra (kullanıcı onayladı):
   - Var olan kayıt: okuma sorguları yeniden çalışır.
   - Yeni kayıt, anahtarı kullanıcı yazdı: sayfa parametresi yazılan anahtar olur ve kart var olan kayıt olarak yeniden açılır.
   - Yeni kayıt, anahtarı sistem üretti: "Kaydedildi" bildirimi gelir. Kart bir listeden açıldıysa o listeye döner, doğrudan açıldıysa form temizlenir.
6. Sil'den sonra (kullanıcı onayladı) kart açıldığı listeye döner. Doğrudan açıldıysa kart kapanır.
7. Liste panelinde "Kartı aç" seçiliyse listeye **+ Yeni** gelir. Bu düğme parametresiz bir `page` düğmesidir, `slot: "actions"`, ilk sıradadır.
8. Yeni Kayıt kartı için sayfa kodu olarak, katalogda henüz sayfası olmayan bir `opens` kodu önerilir.
9. Tuval, kartı açan listenin ilk kaydıyla dolu çizilir. Böyle bir liste yoksa kart yeni kayıt kipinde çizilir.
10. Yeni kayıt kipinde kayıt sorgusu boş anahtarla çalışır ve boş döner.
11. Alt bilgide "son değişiklik" bilgisi yoktur. Ctrl+S bu projede yoktur.
12. Kaydet'in kendiliğinden bağlanması için eylemin her bilgisinin kartta bir alanı olmalıdır.

## Review Focus

1. **Kaydetmede çift ekleme.** Yeni kayıtta Kaydet'e iki kez basılır. İkinci basış ekleme yapmamalı. Kart, yazılan anahtarla var olan kayda geçer ya da listeye döner. Test: Görev 6.
2. **Kaynaktan düşen kolon.** Katalogdan bir kolon kaldırılır, ama sayfa o kolona bağlı bir alan taşır.
   - ERP'de alan boş görünür, kart çizilmeye devam eder.
   - Studio'da alan "Katalogda yok" olarak işaretlenir.
   - Test: Görev 5 ve Görev 9.
3. **Bölümden son alanı taşımak.** Bölüm boş kalır ve yer tutucu gösterir, silinmez. Sekmedeki son bölüm silinirse sekme boş kalır. Kart sunucuda yine geçerli olmalı. Bu yüzden boş `formCard` (`inputs: []`) kalıplı sayfada kabul edilir. Test: Görev 2 ve Görev 9.
4. **Eski kart.** `customer-create` ve form kartlı kalıpsız bir sayfa önceki çıktıyı birebir verir. Test: Görev 3.
5. **Dar tuvalde 3 kolonlu bölüm.** 600 px'te 2 kolon, 400 px'te 1 kolon olur. `textarea` her genişlikte tam satırdır. Test: Görev 5.

---

## PR A — sunucu ve ERP (Görev 1–7)

### Task 1: Katalog kolonunda `longText`, `required`, `maxLength`

**Files:**
- Modify: `src/Hosts/AIERP.Api/Catalog/TenantCatalogSchema.cs`
  - `ColumnKeys`
  - `CatalogColumn`
  - kolon ayrıştırma (`key` okunan yer, ~262)
- Modify: `src/Hosts/AIERP.Api/Catalog/TenantCatalogEndpoints.cs` (kolon görünümü)
- Test: `tests/IntegrationTests/TenantCatalogSchemaTests.cs` (genişletilir)

**Interfaces:**
- Produces:
  - `CatalogColumn(string Code, string Label, string Type, bool Key, bool LongText = false, bool Required = false, int? MaxLength = null)`
  - `GET /api/custom-pages/catalog` kolon JSON'u: `{ code, label, type, key, longText, required, maxLength }`. `maxLength` yoksa `null`.

- [ ] **Step 1: Write the failing tests**
  - `Column_long_text_required_max_length_are_parsed`
  - `Long_text_on_non_text_column_is_rejected`
  - `Max_length_out_of_range_is_rejected` (0 ve 4001)
  - `Required_must_be_bool`
  - `Catalog_view_returns_new_column_flags`
  - `Old_catalog_without_flags_still_parses`: bayraklar `false`, `null` döner.
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCatalogSchemaTests"` → FAIL.
- [ ] **Step 3:** Implement. Hata metinleri öteki kolon hatalarının biçimindedir. `TenantCatalogStore`'un gevşek okuması yeni alanları da taşır.
- [ ] **Step 4:** Aynı filtre ve `--filter "FullyQualifiedName~Catalog"` → PASS.
- [ ] **Step 5: Commit** — `feat(katalog): kolonda uzun metin, zorunlu ve en çok uzunluk`

### Task 2: Şema — Kayıt kartı kuralları, `textarea`, `readOnly`, satır tablosunda `pageSize`

**Files:**
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateRules.cs` (`ValidateTemplate` kalıp adına göre dallanır: `ValidateList` (bugünkü gövde), `ValidateRecord`)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`
  - izinli `inputType` listesi (~159, ~816) + `"textarea"`
  - `SafePropsV2` + `readOnly`; tür tablosunda `readOnly` yalnız `input`
  - `IsListTemplate` (~1619) → `pageSize` istisnası `record` kalıbının `slot: "lines"` tablosunu da kapsar
  - `formCard` `inputs` 1..n kuralı (~926): kalıplı sayfada 0'a izin verir
- Test: `tests/IntegrationTests/TenantCustomPageSchemaRecordTemplateTests.cs` (yeni; `Accepted`/`Rejected` yardımcıları `TenantCustomPageSchemaListTemplateTests.cs`'teki gibi)

**Interfaces:**
- Produces: `PageTemplateRules.RecordSlots = { "summary","actions","tabs","section","field","lines","note","above","below" }`. `Slots` (Liste'nin) adı ve içeriği değişmez.
- `field` dışındaki her yerdeki parça üst düzeydedir. Sekmeye ait olmak sekme listesiyle, bölüme ait olmak `inputs` ile anlatılır. Üst düzey ve ait olma kuralları bugünkü şemanın `tabs`/`formCard` kurallarıdır, değişmez.

- [ ] **Step 1: Write the failing tests**
  - `Minimal_record_page_is_accepted`: özet, tek sekmeli `tabs`, bir `formCard` (bir `input`), `kayit` okuma sorgusu.
  - `Unknown_template_name_is_rejected`: yeni metin.
  - `Record_without_summary_is_rejected`.
  - `Record_with_two_tabs_components_is_rejected`.
  - `Section_not_in_any_tab_is_rejected`; `Lines_table_not_in_any_tab_is_rejected`.
  - `Field_without_section_is_rejected`.
  - `Metric_in_section_slot_is_rejected`: Liste biçimindeki metin.
  - `Empty_section_is_accepted_on_record_page` (Review Focus 3).
  - `Empty_form_card_still_rejected_on_legacy_page`.
  - `Textarea_input_is_accepted_on_legacy_page`; `ReadOnly_only_on_input`.
  - `Lines_table_page_size_is_accepted_on_record_page`; `Page_size_still_rejected_on_legacy_table`.
  - `Width_and_action_bar_rejected_on_record_page`.
  - `Record_template_round_trips_through_draft_preview_publish`.
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~RecordTemplate|FullyQualifiedName~ListTemplate"` → FAIL.
- [ ] **Step 3:** Implement. `ValidateList` bugünkü davranışı birebir korur; yalnız bilinmeyen ad metni değişir.
- [ ] **Step 4:** Aynı filtre ve `--filter "FullyQualifiedName~TenantCustomPage|FullyQualifiedName~SystemPage"` → PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): Kayıt kartı kalıbı biçimi ve doğrulaması`

### Task 3: ERP — eski kartların çıktısını sabitle

> **Sıra:** Görev 4'ten önce. Anlık görüntüler, ERP değişmeden üretilmeli.

**Files:**
- Modify: `frontend/erp-web/src/page-templates/legacyUnchanged.test.tsx`

- [ ] **Step 1:** Alt proje 3'teki yöntemle (`toMatchSnapshot`) iki test ekle:
  - `customer-create system standard renders unchanged` (`src/Hosts/AIERP.Api/SystemPages/Standards/customer-create.json` `definition`'ı).
  - `legacy page with formCard tabs and inputs renders unchanged`: kalıpsız; `formCard` 3 kolon, iki sekme, `select` ve `date` girdisi.
- [ ] **Step 2:** `cd frontend/erp-web && npx vitest run src/page-templates/legacyUnchanged` → PASS (anlık görüntü yazılır).
- [ ] **Step 3: Commit** — `test(erp): eski kayıt kartlarının çıktısı sabitlendi`

### Task 4: ERP — `textarea`, `readOnly` ve kalıp modelinin okunması

**Files:**
- Modify:
  - `frontend/erp-web/src/page-templates/pageTemplate.ts`
  - `frontend/erp-web/src/TenantCustomPage.tsx` (`PageInput` ~876–958: `textarea` ve `readOnly`)
- Create: `frontend/erp-web/src/page-templates/recordTemplateModel.ts`
- Test:
  - `frontend/erp-web/src/page-templates/recordTemplateModel.test.ts`
  - `frontend/erp-web/src/custom-page/TenantCustomPageTextarea.test.tsx`

**Interfaces:**
- Produces:
  - `type PageTemplate = { name: "list" } | { name: "record" }`. `readPageTemplate` her iki adı tanır, ötekiler için `null` döner.
  - `type RecordTab<C> = { label: string; blocks: C[] }`: bloklar `section`/`lines`/`note`, sekme sırasıyla.
  - `type RecordLayout<C extends Component = Component> = { summary: C | null; actions: C[]; tabs: C | null; tabList: RecordTab<C>[]; above: C[]; below: C[] }`
  - `layoutRecordTemplate<C extends Component>(components: C[]): RecordLayout<C>`. `tabs` bileşeninin `tabs` özelliği `custom-page/layoutRefs.ts` `parseTabs` ile okunur. Sekmede listelenip bulunamayan kimlik atlanır.
  - `recordKeyParam(components: Component[], queries: { id: string; parameters?: { name: string; binding?: string }[] }[]): string | null`
    - İlk `section` bileşeninin `recordKey`'inden (`{{X.rows[0].k}}`) sorgu `X` bulunur.
    - O sorgunun `{{sayfa.parametre.<p>}}` bağlı parametresinin `<p>`'si döner.
    - Bulunamazsa `null`.
  - `recordTemplateLevel(layout: RecordLayout): 1 | 2`

- [ ] **Step 1: Write the failing tests**
  - `readPageTemplate accepts record and list, rejects card`.
  - `layoutRecordTemplate groups tabs and keeps tab order`: iki sekme, bölüm + tablo + not.
  - `missing tab id is skipped`.
  - `recordKeyParam finds the page parameter bound to the record query`; `recordKeyParam returns null without recordKey`.
  - `textarea input renders a multi-line field and keeps value`: kalıpsız bir v2 sayfada, `TenantCustomPageListLook.test.tsx`'teki `erpApi` taklidiyle.
  - `readOnly input cannot be edited and is not validated as changed`.
- [ ] **Step 2:** `npx vitest run src/page-templates/recordTemplateModel src/custom-page/TenantCustomPageTextarea` → FAIL.
- [ ] **Step 3:** Implement. `textarea` için `PageInput` `<textarea rows={3}>` çizer. `maxLength`, `required` ve `description` bugünkü gibi işler. `readOnly`, sayfa görüntüleme kipinin girdiye yaptığını yapar.
- [ ] **Step 4:** PASS. `npx vitest run src/page-templates/legacyUnchanged` → PASS (değişmedi).
- [ ] **Step 5: Commit** — `feat(erp): çok satırlı ve salt okunur girdi; Kayıt kartı modeli`

### Task 5: ERP — Kayıt kartı çizimi ve otomatik yerleşim

**Files:**
- Create: `frontend/erp-web/src/page-templates/RecordTemplate.tsx`
- Modify:
  - `frontend/erp-web/src/page-templates/page-templates.css` (`.record-template-page` kuralları)
  - `frontend/erp-web/src/TenantCustomPage.tsx`: `listLayout` dalının yanına `recordLayout` dalı. Aynı `templateComponents` süzgeci, aynı `ShellAction` üretimi. Ortak kısım bir yardımcıya taşınır: `shellActionsFor(buttons, runtime)`.
- Test:
  - `frontend/erp-web/src/page-templates/RecordTemplate.test.tsx`
  - `frontend/erp-web/src/page-templates/RecordTemplateResponsive.test.tsx`

**Interfaces:**
- Consumes: Görev 4 (`RecordLayout`, `recordKeyParam`), alt proje 3 (`PageShell`, `ShellAction`, `orderShellActions`).
- Produces:
  - `<RecordTemplate layout render title crumbs actions isNew notices />`
  - `sectionColumns(chosen: 1 | 2 | 3, width: number): 1 | 2 | 3`: kolon kuralı (Global Constraints), `ResizeObserver` ile kullanılır.
- Çizim sırası:
  1. kabuk başlığı ve konum satırı
  2. `above`
  3. özet
  4. işlem çubuğu
  5. sekmeler (`tabs` bileşeni bugünkü `PageTabs` ile)
  6. `below`
  7. alt bilgi
- İşlem çubuğu: Kaydet (`actionType: "sequence"`) ana düğmedir. `delete` sorgulu düğme en sağdadır. Yeni kayıt kipinde (`isNew`: `recordKeyParam` boş) Sil gizlenir.
- `lines` tablosu yeni kayıt kipinde çizilmez. Yerinde `"Kayıt kaydedilince burada görünür."` yazar.
- Kayıt sorgusu yüklenirken bölümlerin yerinde iskelet görünür (`.record-skeleton`, bölümün yüksekliği kadar).
- Bölümün kendi kutusu `container-type: inline-size` taşır. `textarea` girdisi ve `lines` tablosu tam satırdır (`grid-column: 1 / -1`).
- Taşma (§6.5): özet değerleri ve alt satırı tek satırda kısaltılır (`text-overflow: ellipsis`), tam metin `title`'da durur. Satır tablosu kendi kutusunda yatay kayar.
- `<Anchored>` işaretleri korunur. Ek olarak her sekme düğmesi `<AnchorMark id={`${tabsId}#tab${index}`} />` taşır (Görev 7 kullanır).

- [ ] **Step 1: Write the failing tests**
  - `record template renders shell, summary, bar, tabs in order`.
  - `save is primary on the left and delete on the right`.
  - `new record mode hides delete and shows lines placeholder`.
  - `missing catalog column leaves field empty and card renders` (Review Focus 2).
  - `skeleton shows while record query loads`.
  - `tab anchors are emitted`.
  - `sectionColumns thresholds`: (3, 721) → 3, (3, 600) → 2, (3, 400) → 1, (1, 900) → 1, (2, 600) → 2.
  - `three-column section at 600px shows two columns and textarea spans the row` (Review Focus 5; `ResizeObserver` taklidi).
- [ ] **Step 2:** `npx vitest run src/page-templates/RecordTemplate` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. `npm test` ve `npm run build` PASS. `legacyUnchanged` değişmedi.
- [ ] **Step 5: Commit** — `feat(erp): Kayıt kartı kalıbı çizimi ve kutuya göre yerleşim`

### Task 6: ERP — kaydetme ve silme sonrası; açan sekme

**Files:**
- Modify:
  - `frontend/erp-web/src/pageNavigation.ts` (açan sekme deposu)
  - `frontend/erp-web/src/useWorkspaceTabs.ts` (sekme kapatma olayı)
  - `frontend/erp-web/src/TenantCustomPage.tsx` (sıra sonu ~2684–2691 ve silme sonrası; yalnız kayıt kartı dalında)
- Create: `frontend/erp-web/src/page-templates/recordAfterSave.ts`
- Test:
  - `frontend/erp-web/src/page-templates/recordAfterSave.test.ts`
  - `frontend/erp-web/src/page-templates/RecordTemplateSave.test.tsx`

**Interfaces:**
- Produces:
  - `openerOf(page: string): string | undefined`. `openWorkspacePage`, `request.from` verilmişse `request.page` için açanı kaydeder. Sekme kapanınca kayıt silinir.
  - `CLOSE_PAGE_EVENT = "nexora:close-page"`; `requestClosePage(page: string)`. `useWorkspaceTabs` dinler ve sekmeyi değişiklik sorusu sormadan kapatır.
  - `type AfterSave = { kind: "reload" } | { kind: "reopen"; param: string; value: string } | { kind: "backToOpener"; opener: string } | { kind: "clear" }`
  - `afterRecordSave(input: { isNew: boolean; keyParam: string | null; typedKey: string | null; opener: string | undefined }): AfterSave`
    - `!isNew` → `reload`
    - `isNew && typedKey` → `reopen`
    - `isNew && opener` → `backToOpener`
    - diğer → `clear`
  - `afterRecordDelete(opener: string | undefined): { kind: "backToOpener"; opener: string } | { kind: "close" }`
- Uygulama:
  - `reopen`: `setPageParams(page, { ...params, [param]: value })`. Kayıt sorgusu yeni anahtarla çalışır.
  - `backToOpener`: `openWorkspacePage({ page: opener, params: {}, replace: true, from: page, refresh: true })`. Bildirim: `"Kaydedildi."`.
  - `clear`: kart yeniden kurulur (`key` artırılır).
  - `close`: `requestClosePage(page)`.
  - `typedKey`: anahtar kolona bağlı girdinin kaydetme anındaki değeri. Yalnız o girdi `readOnly` değilse dolu sayılır.
  - Bugünkü kalıpsız sayfaların sıra sonu davranışı değişmez.

- [ ] **Step 1: Write the failing tests**
  - `afterRecordSave` dört dalı; `afterRecordDelete` iki dalı.
  - `openWorkspacePage records opener and openerOf returns it`.
  - `new record with typed key reopens as existing and second save updates` (Review Focus 1). Sahte sorgu ucu: ilk Kaydet → `ekle` çağrılır. Parametre yazılır, kayıt sorgusu satır döner. İkinci Kaydet → `guncelle` çağrılır, `ekle` çağrılmaz.
  - `new record with system key returns to opener after save`.
  - `delete returns to opener; without opener requests close`.
  - `legacy sequence button still only reruns load queries`.
- [ ] **Step 2:** `npx vitest run src/page-templates/recordAfterSave src/page-templates/RecordTemplateSave` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): Kayıt kartında kaydetme ve silme sonrası davranış`

### Task 7: Tuval — örnek kayıt ve sekme gösterme

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (yeni uç)
- Modify: `frontend/erp-web/src/designer-canvas/canvasProtocol.ts`, `DesignerCanvasHost.tsx`
- Test:
  - `tests/IntegrationTests/TenantCustomPageSampleParamsTests.cs`
  - `frontend/erp-web/src/designer-canvas/canvasProtocol.test.ts` (genişletilir)
  - `frontend/erp-web/src/designer-canvas/DesignerCanvasHost.test.tsx` (yoksa oluştur)

**Interfaces:**
- Produces:
  - **Uç:** `GET /api/custom-pages/{id}/preview/sample-params` → `{ params: Record<string, string> }`.
    - Yetki önizleme ucuyla aynı.
    - Sayfa taslağı `record` kalıplı değilse `{ params: {} }` döner.
    - Etkin katalogda `opens` değeri bu sayfanın kodu olan, parametresiz ya da yalnız `q` parametreli ilk kaynak bulunur. Mevcut katalog sorgu yürütücüsüyle çalıştırılır (`q` boş). İlk satırın anahtar kolonu `{ <pageParamName(anahtar)>: değer }` olarak döner. C#'ta aynı kural: `pageParamName`'in sunucu eşi.
    - Kaynak yoksa, satır yoksa ya da hata olursa `{ params: {} }` döner. Uç hata vermez.
  - **Protokol** (sürüm 1 korunur, mesajlar eklemelidir):
    - Studio→ERP: `{ type: "showTab"; tabsId: string; index: number }`.
    - ERP, sekme düğmesi kutularını `"<tabsId>#tab<i>"` kimliğiyle zaten bildirir (Görev 5).
    - Studio'daki kopya (`page-designer/erpCanvasProtocol.ts`) PR B'de, Görev 11'de aynı biçime getirilir.
  - `DesignerCanvasHost`: kalıp `record` ise yüklemeden önce bu ucu çağırır, sonucu `pageParams` olarak `TenantCustomPage`'e verir. `showTab` gelince ilgili `tabs` bileşeninin etkin sekmesini değiştirir. Bunun için `PageTabs`'a dışarıdan denetlenen bir `activeIndex` yolu eklenir; yalnız tuvalde kullanılır.

- [ ] **Step 1: Write the failing tests**
  - Uç:
    - `Sample_params_return_first_key_of_list_source_that_opens_this_page`
    - `Sample_params_empty_when_no_source_opens_page`
    - `Sample_params_empty_for_list_template`
    - `Sample_params_requires_preview_permission`
  - Protokol: `parseStudioCanvasMessage accepts showTab and rejects bad index`.
  - Tuval:
    - `canvas host passes sample params to record page`
    - `showTab switches the active tab`
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~SampleParams"` ve `npx vitest run src/designer-canvas` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): tuvalde örnek kayıt ve sekme gösterme`

**PR A burada açılır.** Elle yazılmış bir Kayıt kartı JSON'u ile doğrulanabilir.

---

## PR B — Studio (Görev 8–12)

Kök: `frontend/development-studio/src/platform-tools/erp-src/`. PD = `page-designer/`.

### Task 8: Studio — katalog bayrakları, Kayıt kartı seçimi, Ekranlar süzgeci

**Files:**
- Modify:
  - `PD/catalogClient.ts`
  - `PD/pageTemplates.ts`
  - `PD/NewPageDialog.tsx`
  - `PD/panel/templateGuards.ts`
  - `pageCatalogModel.ts` ve Ekranlar tablosu (`LowCodeDesignerPage.tsx`)
  - `CustomPagesPage.tsx` (`createFromDialog`)
- Test:
  - `PD/catalogClient.test.ts`
  - `PD/pageTemplates.test.ts`
  - `PD/panel/templateGuards.test.ts`
  - `pageCatalogModel.test.tsx`

**Interfaces:**
- Produces:
  - `CatalogColumn` += `longText: boolean; required: boolean; maxLength: number | null`. Yanıtta yoksa `false`, `false`, `null`.
  - `PageTemplate = { name: "list" } | { name: "record" }`
  - `PAGE_TEMPLATE_CHOICES` sırası:
    1. Liste
    2. `{ id: "record", label: "Kayıt kartı", description: "Tek bir kaydı görmek ve düzenlemek için." }`
    3. Serbest
  - `newRecordTemplateDefinition(): TemplatedDefinition`:
    - `{ schemaVersion: 2, template: { name: "record" }, queries: [], components: [{ id: "ozet", type: "recordHeader", props: { slot: "summary" } }, { id: "sekmeler", type: "tabs", props: { slot: "tabs", tabs: [] } }] }`
    - Bu tanım kaynak seçilene kadar sunucuda geçersizdir. Kayıt otomatik kaydetme gibi kaynak seçilince başlar: `RECORD_SOURCE_HINT = "Önce hangi kaydın gösterileceğini seçin."`. Liste'deki `listSourceProblem` ile aynı yol izlenir: `recordSourceProblem(definition)`.
  - `templateLabel` → `"Liste" | "Kayıt kartı" | "Kalıpsız"`. Ekranlar süzgeci: Tümü / Liste / Kayıt kartı / Kalıpsız.
  - `RECORD_TEMPLATE_SLOTS`: Global Constraints'teki küme. `ensureTemplateSlots`, kalıp adına göre doğru kümeyi kullanır.
  - `suggestRecordPageCode(catalog: ActiveCatalog, existingCodes: string[]): string | null`: sayfası olmayan ilk `opens` kodu. Yeni sayfa penceresinde Kayıt kartı seçilince kod kutusuna önerilir.

- [ ] **Step 1: Write the failing tests**
  - `loadCatalog maps longText required maxLength with defaults`
  - `new page dialog offers Kayıt kartı second`
  - `newRecordTemplateDefinition shape`
  - `recordSourceProblem until a source is chosen`
  - `templateLabel Kayıt kartı`
  - `catalog filter has Kayıt kartı`
  - `ensureTemplateSlots uses record slots`
  - `suggestRecordPageCode skips codes that already have pages`
- [ ] **Step 2:** `cd frontend/development-studio && npx vitest run src/platform-tools/erp-src/page-designer/catalogClient src/platform-tools/erp-src/page-designer/pageTemplates src/platform-tools/erp-src/page-designer/panel/templateGuards src/platform-tools/erp-src/pageCatalogModel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Kayıt kartı kalıbı seçimi ve katalog alan bilgileri`

### Task 9: Studio — `recordModel.ts` (saf düzenleme fonksiyonları)

**Files:**
- Create: `PD/panel/recordModel.ts`
- Test: `PD/panel/recordModel.test.ts`, `PD/panel/recordRoundTrip.test.ts`

**Interfaces:**
- Consumes: `listPanelModel.ts` (`ModelDefinition`, `ModelComponent`, `Usable`, `pageParamName`, `withOperationParameters`, `labelMap`, `safeLabel`), Görev 8 (`CatalogColumn` bayrakları).
- Produces. Hepsi yeni bir tanım döner ve girdiyi değiştirmez.
  - **Sabitler:**
    - `RECORD_QUERY_ID = "kayit"`
    - `RECORD_SOURCE_NEEDS_KEY = "Bu kaynak tek bir kaydı anahtarıyla okumuyor; Kayıt kartında kullanılamaz."`
    - `actionMissingField = (name) => \`Bu eylemin ${name} bilgisi kartta yok.\``
    - `LINES_PLACEHOLDER` ERP'dedir, burada değil.
  - **Kaynak:**
    - `recordSourceUsable(ds: CatalogDataSource): Usable` (Karar 3)
    - `chooseRecordSource(def, ds, catalog: ActiveCatalog): D`
      - Kayıt sorgusunu yazar ve kartı kurar (Karar 2).
      - Kurulan kart:
        - "Genel" sekmesi.
        - `genel` bölümü: `columns: 2`, `title: "Genel bilgiler"`.
        - Her kolon için bir alan, anahtar en başta.
        - Özet: başlık, anahtar olmayan ilk `text` kolonu; alt satır, anahtar.
      - Kolon bayrakları girdiye yazılır:
        - `longText` → `inputType: "textarea"`
        - `required` → `required: true`
        - `maxLength` → `maxLength`
        - Tür eşlemesi tasarım §5.1'deki gibi.
      - Anahtar alanı Global Constraints'teki gibi.
      - Kaydet ve Sil'i kendiliğinden bağlar (Karar 12).
      - Kaynak değişirse eski alanlar, bölümler ve sekmeler silinip yeniden kurulur.
  - **Alanlar:**
    - `fieldKey(def, inputId): string | null`: alanın kolonu.
    - `usedColumns(def): Set<string>`
    - `addField(def, column: CatalogColumn, sectionId: string, index: number): D`: kolon zaten kullanılıyorsa tanım değişmez.
    - `moveField(def, inputId, toSectionId, index): D`
    - `removeField(def, inputId): D`
  - **Bölümler ve sekmeler:**
    - `addSection(def, tabIndex: number): { def: D; sectionId: string }`: "Yeni bölüm", 2 kolon.
    - `removeSection(def, sectionId): D`: alanları da siler; kolonlar sol listede yeniden kullanılabilir olur.
    - `setSectionColumns(def, sectionId, columns: 1 | 2 | 3): D`
    - `setSectionTitle(def, sectionId, title): D`
    - `setSectionVisibleWhen(def, sectionId, condition: string | null): D`
    - `addTab(def): { def: D; tabIndex: number }`: "Yeni sekme" ve içinde bir yeni bölüm.
    - `renameTab(def, tabIndex, label): D`
    - `removeTab(def, tabIndex): D`: son sekme silinemez.
  - **Alan ayarları:**
    - `setFieldProps(def, inputId, patch: { label?: string; required?: boolean; readOnly?: boolean; description?: string; visibleWhen?: string }): D`
    - `fieldLocks(def, inputId, catalog): { required: boolean; readOnly: boolean }`: katalog `required` ya da anahtar ise kilitli.
    - Kilitli bir özellik `setFieldProps` ile gevşetilmeye çalışılırsa yok sayılır.
  - **Eylemler:**
    - `recordActionUsable(def, action: CatalogAction): Usable` (Karar 12)
    - `setSaveActions(def, insert: CatalogAction | null, update: CatalogAction | null): D`
    - `setDeleteAction(def, action: CatalogAction | null): D`
    - `addExtraAction(def, action): D`; `removeExtraAction(def, code): D`
    - Ek eylemler Kaydet ile Sil arasına girer.
  - **Özet:** `setSummary(def, title: string, subtitle: string[], values: { column: string; label: string }[]): D`. En çok 3 alt satır kolonu ve 3 değer.
  - **Satır tablosu ve not:**
    - `linesSourceUsable(def, ds): Usable`
    - `addLines(def, ds, tabIndex, index): D`: tablo, sayfa başına 10, ilk 6 kolon.
    - `addNote(def, tabIndex, index, text): D`
    - `moveBlock(def, blockId, tabIndex, index): D`
    - `setLinesProps(def, tableId, patch: { name?: string; columns?: string[]; labels?: Record<string, string>; pageSize?: 10 | 25; emptyText?: string }): D`
    - `setNoteText(def, noteId, text: string): D`
    - `removeBlock(def, blockId): D`
  - **Katalog denetimi:** `missingRecordColumns(def, catalog): string[]` (Review Focus 2).

- [ ] **Step 1: Write the failing tests** (`listPanelModel.test.ts` kalıbında; her test, girdinin değişmediğini de doğrular)
  - `recordSourceUsable rejects source without key-named parameter`
  - `chooseRecordSource builds Genel tab with one two-column section and key first`
  - `chooseRecordSource maps longText to textarea and copies required and maxLength`
  - `typed key gets disabledWhen; system key gets readOnly and (otomatik)`
  - `chooseRecordSource binds save when exactly one matching insert and update exist`
  - `chooseRecordSource leaves save empty when two insert actions match`
  - `addField ignores a column already used`
  - `moveField to another section keeps one owner`
  - `moving the last field leaves an empty section` (Review Focus 3)
  - `removeSection frees its columns`
  - `last tab cannot be removed`
  - `setFieldProps cannot unset catalog required`
  - `recordActionUsable names the missing field`
  - `extra actions sit between save and delete`
  - `addLines binds parameter to the page parameter and sets pageSize 10`
  - `missingRecordColumns lists removed columns`
  - `round trip`: `chooseRecordSource` çıktısı tel tanımına (`wireDefinition`) gider, `normalizeDefinition` ile geri gelir ve aynı kalır.
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/recordModel src/platform-tools/erp-src/page-designer/panel/recordRoundTrip` → FAIL.
- [ ] **Step 3:** Implement.
  - Kimlikler kolon adından türetilir. Çakışmada sonuna sayı eklenir.
  - Bölüm kimliği `bolum`, `bolum2`…; satır tablosu kimliği `tablo`, `tablo2`…
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(studio): Kayıt kartı modeli`

### Task 10: Studio — `RecordPanel`

**Files:**
- Create:
  - `PD/panel/RecordPanel.tsx`
  - `PD/panel/RecordFieldList.tsx` (sol alan listesi)
- Modify:
  - `PD/panel/TemplateInspector.tsx`: kalıp `record` ise `RecordPanel`
  - `CustomPagesPage.tsx`: kalıp `record` iken sol palet yerine `RecordFieldList`
- Test: `PD/panel/RecordPanel.test.tsx`, `PD/panel/RecordFieldList.test.tsx`

**Interfaces:**
- Consumes: Görev 9.
- Produces:
  - `<RecordPanel def catalog selection: RecordSelection onChange={(def) => void} onSelect={(sel) => void} onAskDeveloper={() => void} />`
  - `type RecordSelection = { kind: "page" } | { kind: "section"; id: string } | { kind: "field"; id: string } | { kind: "lines"; id: string } | { kind: "note"; id: string }`
  - `<RecordFieldList def catalog onDragStartColumn={(code) => void} onDragStartBlock={(kind: "lines" | "note") => void} />`
- Panel içerikleri taslak 08 ve tasarım §5.4 tablosuyla birebir aynıdır:
  - **Sayfa:**
    - Ad
    - *Hangi kayıt gösterilsin?*
    - *Kaydet düğmesi*: Yeni kayıtta / Var olan kayıtta / Sil düğmesi
    - *Öne çıkan değerler*
    - *Ek eylemler*
    - Görünüm (ek alan)
  - **Bölüm:**
    - Başlık
    - Kolon sayısı. Altında: "Dar alanda en çok 2, telefonda 1 kolon olur. Uzun metin ve satır tablosu her zaman tam genişliktir."
    - Görünüm: *Ne zaman görünsün?*
    - Bölümü kaldır. Yanında: "Alanlar sol listeye döner."
  - **Alan:**
    - Etiket
    - Zorunlu, Değiştirilemez. Kilitliyse altında: "Kilitli olanları yazılımcı belirledi; danışman yalnız kuralı sıkılaştırabilir."
    - Yardım metni
    - Yeşil not
    - Görünüm: *Ne zaman görünsün?*
    - Karttan çıkar
  - **Satır tablosu:** Ad, *Ne listelensin?*, Kolonlar, Sayfa başına (10/25), Görünüm: liste boşken metni.
  - **Açıklama metni:** Metin.
- Sol liste: kullanılan kolonlar işaretli ve soluk görünür. Katalogda olmayan kolona bağlı alan "Katalogda yok" etiketi taşır. Altta "Yazılımcıdan iste →" bağlantısı vardır (2b'deki talep penceresi; Liste panelindeki gibi).
- *Ne zaman görünsün?* seçicisi, Liste panelinin `visibleWhen` seçicisini yeniden kullanır.
- Sayfa panelinin Görünüm'ündeki "Kartın üstüne / altına ek alan", Liste'deki ek alan yolunu (`above`/`below`, `ComponentPanel` içinde bugünkü ayarlar) kullanır.

- [ ] **Step 1: Write the failing tests**
  - `page panel renders parts in mockup order without tablist`
  - `unusable source is shown faded with its reason`
  - `section panel column buttons call setSectionColumns`
  - `locked required toggle is disabled with note`
  - `green note lists type, key, required and max length`
  - `field list marks used columns and missing catalog columns`
  - `panel shows no technical words`: çizilen metinde `{{`, `saveSequence`, `query`, `kayit.rows` geçmez.
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/RecordPanel src/platform-tools/erp-src/page-designer/panel/RecordFieldList` → FAIL.
- [ ] **Step 3:** Implement. Görünüş, taslak 08'deki panel görünüşüyle aynıdır ve `component-panel.css`'i kullanır.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Kayıt kartı paneli ve alan listesi`

### Task 11: Studio — tuvalde sürükle-bırak ve bölüm denetimleri

**Files:**
- Create:
  - `PD/recordCanvasOverlay.tsx`
  - `PD/recordCanvasHit.ts`
- Modify:
  - `PD/ErpCanvasFrame.tsx`: kaplama yuvası ve `showTab` gönderimi
  - `PD/erpCanvasProtocol.ts`: `showTab`, Görev 7 ile aynı biçim
  - `CustomPagesPage.tsx`: kalıp `record` iken `dragOverCanvas` ve `dropAt` yerine kaplama
- Test:
  - `PD/recordCanvasHit.test.ts`
  - `PD/recordCanvasOverlay.test.tsx`
  - `PD/erpCanvasProtocol.test.ts`

**Interfaces:**
- Consumes: Görev 7 (sekme kutuları `"<tabsId>#tab<i>"`, `showTab`), Görev 9 (`addField`, `moveField`, `addSection`, `addTab`, `addLines`, `addNote`, `moveBlock`, `setSectionColumns`, `removeField`).
- Produces:
  - `type RecordDrop = { kind: "field"; sectionId: string; index: number } | { kind: "block"; tabIndex: number; index: number } | null`
  - `recordDropAt(blocks: CanvasBlock[], def: ModelDefinition, activeTab: number, point: { x: number; y: number }, dragging: "field" | "block"): RecordDrop`. Saf fonksiyon.
    - Alan sürüklenirken: noktayı içeren bölüm kutusu seçilir. Sıra, bölümdeki alan kutularının okuma sırasına (üstten alta, soldan sağa) göre belirlenir.
    - Blok sürüklenirken: sekmenin blok kutuları arasındaki dikey konum kullanılır.
    - Uymuyorsa `null`.
  - `<RecordCanvasOverlay blocks def activeTab selection onChange onSelect onShowTab />` şunları çizer:
    - bırakma çizgisi;
    - bölümün üstüne gelince 1/2/3 düğmeleri;
    - alan üstüne gelince ✕;
    - son bloğun altında "+ Bölüm ekle";
    - son sekme kutusunun sağında "+ Sekme".
  - Sekme kutusuna tıklayınca `onShowTab(index)` çağrılır, o da `showTab` gönderir. "Dene" kipinde kaplama devre dışıdır (bugünkü gibi).

- [ ] **Step 1: Write the failing tests**
  - `recordDropAt picks section under pointer and index by reading order`
  - `recordDropAt returns block position between sections for lines`
  - `recordDropAt null outside any section`
  - `overlay column buttons change columns`
  - `clicking a tab box sends showTab`
  - `plus section adds section to active tab`
  - `erpCanvasProtocol showTab round trip`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/recordCanvas src/platform-tools/erp-src/page-designer/erpCanvasProtocol` → FAIL.
- [ ] **Step 3:** Implement. Kalıpsız ve Liste sayfalarında tuval davranışı değişmez.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Kayıt kartında tuvalde sürükle-bırak`

### Task 12: Studio — Liste'de "+ Yeni"

**Files:**
- Modify: `PD/panel/listPanelModel.ts`, `PD/panel/ListPanel.tsx`
- Test: `PD/panel/listPanelModel.test.ts`, `PD/panel/ListPanel.test.tsx`

**Interfaces:**
- Produces:
  - `NEW_BUTTON_ID = "yeni"`
  - `setNewButton(def, listId, on: boolean, ds: CatalogDataSource): D`. `on` ise `actions` yerinin başına bir düğme koyar: `{ id: "yeni", type: "button", props: { slot: "actions", text: "+ Yeni", actionType: "page", pageCode: ds.opens } }`. `off` ise düğmeyi kaldırır.
  - `newButtonOn(def): boolean`
  - `setRowDoubleClick(def, listId, "card", ds)` artık "+ Yeni" düğmesini de açar. `"none"` ya da `"panel"` seçilince düğme kaldırılır.
  - Panelde *Satıra çift tıklayınca* altında bir onay kutusu: "Listede “+ Yeni” düğmesi". Yalnız "Kartı aç" seçiliyken görünür.

- [ ] **Step 1: Write the failing tests**
  - `card choice adds + Yeni first in actions`
  - `none removes + Yeni`
  - `toggle off keeps card open but removes button`
  - `ListPanel shows + Yeni toggle only for card choice`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/listPanelModel src/platform-tools/erp-src/page-designer/panel/ListPanel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(studio): Listede yeni kayıt düğmesi`

### Task 13: Uçtan uca doğrulama ve belgeler

**Files:**
- Modify:
  - `docs/phase-status.md`: 4. alt proje girdisi (doğrulanan / doğrulanmayan / kalan)
  - `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md`:
    - §6.8 son madde: eski tuval silme 5b'ye kaldı (kullanıcının kararı)
    - §7: 4 ve 5b
    - §10: bu projenin kararları

- [ ] **Step 1:** Run `dotnet test AIERP.slnx`. Then run `npm test` and `npm run build` in both frontends.
  - Paralel oturumlar varken zaman aşımına düşen entegrasyon sınıflarını tek başına yeniden çalıştır.
  - Sonuçları sayılarla yaz.
- [ ] **Step 2: Tarayıcıda üç genişlik (zorunlu).**
  - Gerçek arka uç ya da Compose yığını kullanılır. Yoksa sahte arka uçla yapılır (katalog, önizleme, örnek parametre ve sorgu uçları), ve bu belgede açıkça yazılır.
  - Danışman olarak bir Liste kur ve "Kartı aç" seç. Yeni bir Kayıt kartı aç: kod önerilmiş olmalı. Kaynağı seç, alanları taşı, 3 kolonlu bir bölüm ekle, bir satır tablosu ekle.
  - Aynı taslağı Studio tuvalinde ve ERP'de 1280, 768 ve 375 px'te aç. Taslak 08 ile karşılaştır. Görünüm sorunlarını aynı turda düzelt ve yeniden bak.
  - ERP'de şu akışı dene: Liste → "+ Yeni" → Kaydet → kart → Sil → listeye dönüş.
- [ ] **Step 3:** Kalıpsız bir eski sayfayı ve `customer-create`'i ERP'de aç; değişmemiş olmalı.
- [ ] **Step 4: Commit** — `docs: Kayıt kartı (alt proje 4) durumu`

**PR B burada açılır.**
