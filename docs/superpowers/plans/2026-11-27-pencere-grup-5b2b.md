# Pencere ve grup (5b-2 adım 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kalıplı sayfalar (Liste, Kayıt kartı, Serbest) eski `dialog` bileşenini `dialogs` yerinde, içeriğini `dialog` yerinde ve tek katlı grupları (`section`/`card` + `children`) pencere içinde ve Liste detayında taşır; dönüştürücü bunları birebir eşler; ERP ve Studio taslak 12'deki gibi çizer.

**Architecture:** Biçim eski adlarla aynıdır (adım 1 Karar 1 örneği): `dialog` ayarları değişmez, yalnız `props.slot` eklenir. ERP çalışma zamanı pencereleri (aç / kaydet / sıfırla / `openParam`) kalıplı sayfada zaten çalıştırır (`renderComponent` `case "dialog"`, `runtime.openDialog`, `saveDialog`); bu adım kabuklara çizim noktası, pencere ve grup iskeletini ve sunucu kurallarını ekler. Studio pencereyi ERP tuvalinde yeni bir `showDialog` mesajıyla açar.

**Tech Stack:** .NET 10 / xUnit (InMemory), React + Vite + TS, vitest (erp-web jsdom, Studio renderToString).

**Spec:** `docs/superpowers/specs/2026-11-27-pencere-grup-5b2b-design.md` (taslak `docs/design-proposals/studio-sadelestirme/12-pencere-grup.html`, onay 2026-11-27). Üst program: `docs/superpowers/specs/2026-11-27-kalip-buyutme-5b2-design.md`.

## Global Constraints

- Pencere ayar adları ve değerleri eski `dialog` ile aynı: `presentation`, `size`, `title`, `contains`, `saveQuery`, `saveLabel`, `closeOnSave`, `resetOnOpen`, `refreshQueries` (ve var olan `saveSequence`, `backdropClose`). Kalıpta `presentation` yalnız `"dialog"`, `size` yalnız `sm`/`md`/`lg`/`xl`.
- Pencere yalnız `list`, `record`, `free` kalıbında; Belge'de yok.
- Pencere içeriği = `contains` ∪ pencerenin içindeki `tabs` bileşeninin sekmelerinin işaret ettiği kimlikler. Bir bileşen en çok bir pencereye ait; pencere içeriği pencere dışında hiçbir yerde (başka slot, başka sekme) durmaz.
- Pencere içinde izinli türler: `recordHeader` (≤1), `section`, `card`, `formCard`, `input`, `text`, `alert`, `metric`, `button`, `dataTable`, `tabs` (≤1). Pencere içinde pencere, `editableGrid`, `steps` yok.
- Grup: `section`/`card` + `children`, tek kat; çocuk grup ya da pencere olamaz. İzinli çocuklar: `badge`, `heading`, `text`, `metric`, `alert`, `button`, `formCard`, `dataTable`, `contextPanel`, `tabs`. Grup yalnız pencere içeriğinde ve Liste `detail` yerinde (kart). `title`, `description`, `variant`, `visibleWhen` korunur; `width` dönüşümde silinir; `widthWhen` yine reddedilir (adım 3).
- Liste `detail` yerinde en çok bir bileşen: `contextPanel` ya da `card` grubu.
- Açılış değişmez: `openDialog` düğmesi (`dialogId`) ve `openParam`. Komut çubuğunun `newAction`/`openAction: "dialog"` ayarı kalıpta yine yok.
- Davranış eşdeğerliği gevşetilmez; değişen tek şey yerleşim (`slot`, `width`).
- Yeni ekran metinleri yalnız taslak 12'deki ve bu plandaki hata metinleri. `.NET` testleri ortak kilitle sırayla (`CLAUDE.md`). Dal: `claude/kalip-pencere-grup` (taban `origin/master` 8c2ed6c6).

## Hata metinleri (aynen)

`PageTemplateRules` içinde `internal const string`:

| Ad | Metin |
|---|---|
| `PencereYeri` | `Kalıplı sayfada pencere (dialog) yalnız üst düzeyde, 'dialogs' yerinde durur.` |
| `PencereBelge` | `Belge kalıbında pencere (dialog) kullanılamaz.` |
| `PencereSunum` | `Kalıplı sayfada pencere yalnız 'dialog' sunumuyla ve sm, md, lg ya da xl boyutunda olur.` |
| `PencereIcerigi(id)` | `Pencerenin içeriği tam bir pencereye ait olmalı ve 'dialog' yerinde durmalı: {id}.` |
| `PencereTuru(type)` | `{type} pencerenin içinde kullanılamaz.` |
| `PencereOzet` | `Bir pencerede en fazla bir kayıt özeti (recordHeader) olabilir.` |
| `PencereSekme` | `Bir pencerede en fazla bir sekme bileşeni (tabs) olabilir.` |
| `GrupYeri` | `İç içe bileşenler (children) yalnız pencerenin içindeki ya da Liste detayındaki bölüm ve kartta olabilir.` |
| `GrupIcIce` | `Grubun içine grup ya da pencere konamaz.` |
| `GrupTuru(type)` | `{type} grubun içinde kullanılamaz.` |
| `TekDetay` | `Liste kalıbında detay yerinde en fazla bir bileşen (detay paneli ya da kart) olabilir.` |

Dönüştürücü nedenleri (`PageTemplateMigration`): `NestedGroupReason = "Grubun içinde grup kalıplarda yok."`, `GroupChildReason(type) = $"{type} grubun içinde kalıplarda yok."`, `DialogPartReason(type) = $"{type} pencerenin içinde kalıplarda yok."`, `DialogShapeReason = "Pencerenin sunumu ya da boyutu kalıplarda yok."`. `DialogReason` ve `NestedReason` sabitleri silinir.

## Review Focus

1. Sekmenin işaret ettiği ama `contains`'ta olmayan bileşen (ör. `sales-orders` › `teslimBolumu`): sunucu pencereye ait sayar, ERP kalıp gövdesinde **çizmez**, Studio "Pencere ekle/çıkar" bu bileşeni kaybetmez. → Task 1, Task 3, Task 6 testleri.
2. Pencere içindeki düğmenin `refreshQueries`/`visibleWhen`'i ve grup `visibleWhen`'i kalıplı sayfada eski gibi çalışır (grup koşulu bütün grubu gizler). → Task 4 testi.
3. `openParam` ile kalıplı Liste sayfası açılınca pencere açılır (`orderId` derin bağlantısı). → Task 3 testi.
4. Studio'da kalıplı sayfayı kaydetmek pencereyi / içeriğini `below`/`item`'a taşımaz (`ensureTemplateSlots`). → Task 6 testi.
5. Firma kopyası iki pencereye aynı bileşeni bağlamışsa ya da grup içinde grup varsa dönüştürücü taşımaz, gerekçe yazar (çökmez). → Task 2 testi.

---

### Task 1: Sunucu — pencere ve grup kuralları

**Files:**
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateRules.cs` (`Slots` :110, `RecordSlots` :113, `FreeSlots` :116, tip haritaları :119–:145, `ValidateList` :202, `ValidateRecord` :228, `ValidateBelge` :287, `ValidateFree` :376 ve `FreeNoChildren` :379, `Place` :446)
- Test: Create `tests/IntegrationTests/TenantCustomPageSchemaTemplateDialogsTests.cs`

**Interfaces:**
- Produces: `PageTemplateRules.DialogsSlot = "dialogs"`, `DialogSlot = "dialog"`; `internal static IReadOnlyDictionary<string, string> DialogOwners(JsonElement components)` (bileşen kimliği → pencere kimliği; `contains` ∪ pencere içindeki `tabs` sekme kimlikleri; iki pencereye ait kimlik sözlükte yok, ayrıca `PencereIcerigi` döner) ve `internal static readonly IReadOnlySet<string> DialogPartTypes`, `GroupChildTypes` (Global Constraints listeleri). Task 2 ve Task 6 (sunucu fixture) bunları kullanır.

- [ ] **Step 1: Failing tests** (her biri `TenantCustomPageSchema.Validate` ile; `TenantCustomPageSchemaTemplateCommandsTests.cs` yardımcılarını örnek al):
  - `List_with_dialog_in_dialogs_and_contents_in_dialog_is_valid` — `sales-orders` biçiminde: `acDugmesi` (`openDialog`), pencere `contains: [ozet, durum, islemler, sekmeler]`, `sekmeler` sekmesi `kalemTablosu,teslimBolumu` (ikisi `contains`'ta değil, `slot: "dialog"`), `durum` = `section` + `children` [badge, text], `teslimBolumu` = `section` + `visibleWhen` + children [formCard, button] → `true`.
  - `Record_and_free_accept_dialogs` → `true`; `Belge_rejects_dialog` → hata `PencereBelge`.
  - `Dialog_outside_dialogs_slot_is_rejected` (`slot: "below"`) → `PencereYeri`; `Dialog_drawer_or_full_size_is_rejected` → `PencereSunum`.
  - `Dialog_content_in_two_dialogs_or_outside_dialog_slot_is_rejected` → `PencereIcerigi("x")`; içerik `slot: "below"`'da → aynı; `slot: "dialog"` ama hiçbir pencereye ait değil → aynı.
  - `Dialog_with_editableGrid_steps_or_two_summaries_is_rejected` → `PencereTuru("editableGrid")`, `PencereTuru("steps")`, `PencereOzet`; iki `tabs` → `PencereSekme`.
  - `Group_rules`: grup `below`'da → `GrupYeri`; çocuğu `section` → `GrupIcIce`; çocuğu `steps` → `GrupTuru("steps")`; çocukta `widthWhen` → var olan genel ret metni.
  - `List_detail_accepts_one_card_group` → `true`; detayda `contextPanel` + `card` → `TekDetay`.
  - `Legacy_pages_unchanged` — kalıpsız sayfada `dialog` + `children` eskisi gibi geçerli.
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchemaTemplateDialogsTests"` (kilitle) → FAIL.
- [ ] **Step 3:** Uygula. `dialogs`/`dialog` her üç slot kümesine eklenir; `dialogs` tipi `dialog`, `dialog` tipi `DialogPartTypes`. `dialog` yerindeki bileşenler kalıbın kendi sayım/kurallarına (ör. Liste'nin tek `list` tablosu, Kayıt kartının tek `summary`'si, Serbest'in `members`/sekme kuralları) **girmez**. `FreeNoChildren` ve `Place`'in `Scan`'i `children`'ı yalnız `GrupYeri` kapsamı dışında reddeder. Liste `detail` tipi `contextPanel` ya da `card`.
- [ ] **Step 4:** Aynı filtre + `--filter "FullyQualifiedName~TenantCustomPageSchema"` → PASS (eski testler dahil).
- [ ] **Step 5:** Commit `feat(custom-pages): kalıplarda pencere (dialogs) ve tek katlı grup kuralları`.

### Task 2: Dönüştürücü ve eşdeğerlik

**Files:**
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateMigration.cs` (`Scan` :149, `BuildList` :227, `BuildRecord` :271, `BuildFree` :413, `Place` :575), `src/Hosts/AIERP.Api/PageTemplates/BehaviorEquivalence.cs` (`Check` :36, `PropsDifference` :179)
- Modify: `docs/runbooks/page-template-migration.md` (gerekçe tablosu: "Pencere…"/"İç içe…" satırları yerine yeni nedenler)
- Test: `tests/IntegrationTests/PageTemplateMigrationTests.cs`, `PageTemplateMigrationHardeningTests.cs`

**Interfaces:**
- Consumes: Task 1 `DialogOwners`, `DialogPartTypes`, `GroupChildTypes`, slot sabitleri.

- [ ] **Step 1: Failing tests:**
  - `Five_dialog_and_group_standards_convert_to_list` — `sales-orders`, `sales-invoices`, `inventory-cost`, `inventory-tracking`, `finance-ledger-chart` için `Classify(...).Target == "list"`, `BehaviorEquivalence.Check(önce, sonra) == null`, `TenantCustomPageSchema.Validate(sonra)` true. (Biri dönmezse uygulayıcı nedeni raporlar; kural gevşetilmez — denetleyiciye/kullanıcıya gider.)
  - `Converted_dialog_keeps_settings_and_contents` — `sales-orders` sonrası: pencere `slot == "dialogs"`, `width` yok, diğer ayarları önce ile aynı; `teslimBolumu.slot == "dialog"`, `visibleWhen` aynı, `width` yok.
  - `Nested_group_or_bad_child_is_refused_with_reason` → `NestedGroupReason`, `GroupChildReason("steps")`; pencere içinde `editableGrid` → mevcut `EditableGridReason` (Belge nedeni) kalır; `presentation: "drawer"` → `DialogShapeReason`.
  - `Equivalence_rejects_dialog_content_change` — sonrada pencerenin `contains`'ından bir kimlik çıkarılınca ya da grup `visibleWhen`'i değişince `Check` null değil.
  - Var olan `All_50_standards_classify_without_exception…` testine: hiçbir standart `"Pencere kalıplarda yok."` ya da `"İç içe bileşenler (children) kalıplarda yok."` nedeni taşımaz.
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~PageTemplateMigration"` → FAIL.
- [ ] **Step 3:** Uygula. `Scan`: `dialog` üst düzeyde artık neden değil (yalnız sunum/boyut → `DialogShapeReason`); `children` neden değil, ama çocukta `children` → `NestedGroupReason`, çocuk türü `GroupChildTypes` dışında → `GroupChildReason`. Build'ler: pencere → `Place(x, "dialogs")`, `DialogOwners` içindekiler → `Place(x, "dialog")` (gövde yerleşiminden önce ayrılır); Liste'de grup kartı (kart + `children`, `contextPanel` içeren ya da seçili satıra bağlı) → `detail`; grup çocuklarının `width`'i silinir. Pencere içeriğinde `DialogPartTypes` dışı tür → `DialogPartReason`. `BehaviorEquivalence`: çocuk bileşenlerde de `width` yerleşimdir (`AnyComponentLayout` çocuklara uygulanıyor mu bak; uygulanmıyorsa uygula); başka gevşetme yok.
- [ ] **Step 4:** Aynı filtre + `--filter "FullyQualifiedName~BehaviorEquivalence|FullyQualifiedName~SystemPage"` → PASS.
- [ ] **Step 5:** Runbook gerekçe tablosunu güncelle; commit `feat(custom-pages): dönüştürücü pencereleri ve grupları kalıba taşır`.

### Task 3: ERP — kabuklarda pencere çizimi ve Liste detay kartı

**Files:**
- Modify: `frontend/erp-web/src/page-templates/listTemplateModel.ts` (:8, :29), `recordTemplateModel.ts` (:23), `freeTemplateModel.ts` (:25), `ListTemplate.tsx` (:50–:59), `RecordTemplate.tsx`, `FreeTemplate.tsx`, `frontend/erp-web/src/TenantCustomPage.tsx` (kalıp dalları :3569–:3895)
- Test: `page-templates/listTemplateModel.test.ts`, `recordTemplateModel.test.ts`, `freeTemplateModel.test.ts`, Create `page-templates/TemplateDialogs.test.tsx`

**Interfaces:**
- Produces: her layout sonucuna `dialogs: LayoutComponent[]` (slot `dialogs`); `dialog` slotundakiler hiçbir layout dizisine girmez. Liste `detail`: `contextPanel` ya da `card`.

- [ ] **Step 1: Failing tests:**
  - model testleri: `layoutListTemplate` / `layoutRecordTemplate` / `layoutFreeTemplate` `dialogs`'u döndürür; `dialog` slotlu bileşen (sekmeden işaret edilen dahil) `above`/`below`/`item`/`detail` hiçbirinde yok; Liste detayı kart olabilir.
  - `TemplateDialogs.test.tsx` (`TenantCustomPage` + sahte `api`, `TemplateCommands.test.tsx` düzeni): (a) Liste kalıbında `Görüntüle` (komut çubuğu `openButton` → `openDialog` düğmesi) pencereyi açar, başlık `Satış siparişi · S-1`; (b) `setPageParams(key, { orderId })` + `openParam` ile açılışta pencere açık; (c) form penceresinde Kaydet `saveQuery` yazar, `closeOnSave` ile kapanır, `refreshQueries` listesini yeniden okur; (d) `resetOnOpen` ikinci açılışta alanı boşaltır; (e) detay kartı seçili satırın kodunu gösterir.
- [ ] **Step 2:** `cd frontend/erp-web && npx vitest run src/page-templates` → FAIL.
- [ ] **Step 3:** Uygula: layout fonksiyonları `dialogs`'u ayırır; her kabuk `{layout.dialogs.map(render)}`'ı gövdenin sonunda çizer (pencere kapalıyken bir şey çizmez); `dialog` slotlu bileşenler mevcut `dialogOwned`/sekme sahipliğiyle zaten gövdeden düşer — sekmeden işaret edilen içerik için `layoutRefs` sahipliğine güven, kalıp modelinde de `slot === "dialog"` olanı ele.
- [ ] **Step 4:** `npx vitest run src/page-templates src/custom-page` → PASS; `legacyUnchanged` anlık görüntüsü değişmez.
- [ ] **Step 5:** Commit `feat(erp): kalıplı sayfada pencereler ve Liste detay kartı`.

### Task 4: ERP — pencere ve grup iskeleti (kalıplı sayfada)

**Files:**
- Create: `frontend/erp-web/src/page-templates/templateSkeleton.ts`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (`case "dialog"` :1467–:1487 `renderOwned`; grup çocukları :1164 / :1297), `frontend/erp-web/src/custom-page/PageDialog.tsx` (alt satır için `footerStart?: ReactNode`)
- Test: Create `page-templates/templateSkeleton.test.ts`, `page-templates/TemplateGroups.test.tsx`

**Interfaces:**
- Produces: `orderDialogParts(ids: string[], typeOf: (id: string) => string | undefined): { body: string[]; footer: string[] }` — `recordHeader` başa, `tabs` sona, üst düzey `button`'lar `footer`'a; diğerleri `contains` sırasında. `orderGroupChildren<T extends { type: string }>(children: T[]): { badges: T[]; body: T[]; buttons: T[] }`.

- [ ] **Step 1: Failing tests:**
  - `templateSkeleton.test.ts`: `orderDialogParts(["a","ozet","b","tabs1","btn"])` (tipler text, recordHeader, section, tabs, button) → `{ body: ["ozet","a","b","tabs1"], footer: ["btn"] }`; `orderGroupChildren([text, badge, button, badge])` → badges iki, body bir, buttons bir, sıra korunur.
  - `TemplateGroups.test.tsx`: kalıplı sayfada pencere açıkken özet ilk, sekmeler son; pencerenin düğmesi alt satırda Kaydet'in solunda; koşulu yanlış olan grup (`visibleWhen`) hiç çizilmez, doğru olan rozetleri ilk satırda gösterir; çocuk `width: 6` kalıplı sayfada genişlik stili üretmez. Kalıpsız sayfada aynı tanım eski düzenle çizilir (anlık görüntü / sıra testi).
- [ ] **Step 2:** `npx vitest run src/page-templates/templateSkeleton src/page-templates/TemplateGroups` → FAIL.
- [ ] **Step 3:** Uygula: `renderComponent` kalıplı sayfada (`template` varken) pencere içeriğini `orderDialogParts` ile, grup çocuklarını `orderGroupChildren` ile çizer ve `width`/`widthWhen` sınıflarını uygulamaz; `footer` düğmeleri `PageDialog` alt satırının soluna gelir. Kalıpsız dal dokunulmaz.
- [ ] **Step 4:** `npx vitest run` (tümü) → PASS.
- [ ] **Step 5:** Commit `feat(erp): kalıplı pencere ve grup iskeleti`.

### Task 5: ERP tuvali — `showDialog` mesajı

**Files:**
- Modify: `frontend/erp-web/src/designer-canvas/canvasProtocol.ts` (:7–:12, ayrıştırıcı :35–:49), `designer-canvas/DesignerCanvasHost.tsx`
- Test: `designer-canvas/canvasProtocol.test.ts`, `designer-canvas/DesignerCanvasHost.test.tsx`

**Interfaces:**
- Produces: `StudioToCanvas` ek üyesi `{ nx: 'nexora-canvas'; v: 1; type: 'showDialog'; dialogId: string | null }` (`dialogId` `ID_PATTERN`'e uyar ya da null = kapat). Task 7 gönderir.

- [ ] **Step 1: Failing tests:** ayrıştırıcı geçerli `showDialog` döndürür, geçersiz kimlik / eksik alan için `null`; host mesajı alınca sayfanın `openDialog(id)`'ini (null'da `closeDialog`) çağırır, açılan pencere tuvalde görünür.
- [ ] **Step 2:** `npx vitest run src/designer-canvas` → FAIL.
- [ ] **Step 3:** Uygula `showTab` örneğiyle.
- [ ] **Step 4:** Aynı komut → PASS.
- [ ] **Step 5:** Commit `feat(erp): tuvalde pencere açma mesajı`.

### Task 6: Studio — kalıp korumaları ve gidiş-dönüş

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/panel/templateGuards.ts` (:12–:19, `ensureTemplateSlots` :67–:99)
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/panel/dialogsModel.ts`
- Test: `panel/templateGuards.test.ts`, Create `panel/dialogsModel.test.ts`, `panel/dialogsRoundTrip.test.ts`

**Interfaces:**
- Produces (`dialogsModel.ts`): `dialogOwners(components): Map<string, string>` (sunucu `DialogOwners` ile aynı kural); `dialogsOf(components): Component[]`; `addDialog(components): { components; dialogId }` — `{ type: "dialog", props: { slot: "dialogs", presentation: "dialog", size: "lg", title: "Yeni pencere", contains: [<metinId>] } }` + `{ type: "text", props: { slot: "dialog", text: "Pencere içeriği" } }`; `removeDialog(components, id)` — pencereyi ve yalnız ona ait içeriği siler; `setDialogContents(components, id, ids)` — sıra değişir, sekmeden işaret edilenler korunur; `addToGroup` / `removeFromGroup` / `moveInGroup(components, groupId, …)` yalnız `GroupChildTypes`.

- [ ] **Step 1: Failing tests:** `ensureTemplateSlots` `dialogs`/`dialog` slotlu bileşenleri ve grup `children`'ını olduğu gibi bırakır (`below`/`item`'a taşımaz), slotsuz `dialog`'u `dialogs`'a koyar; `addDialog` → `removeDialog` başlangıç tanımına döner; sekmeden işaret edilen içerik `setDialogContents` sonrası kalır; `dialogsRoundTrip`: `sales-orders` dönüştürülmüş fixture'ı (Task 2 çıktısı, `recordServerFixture.test.ts` örneğiyle dosyaya yazılmış) Studio modelinden geçip değişmeden döner.
- [ ] **Step 2:** `cd frontend/development-studio && npx vitest run src/platform-tools/erp-src/page-designer/panel` → FAIL.
- [ ] **Step 3:** Uygula.
- [ ] **Step 4:** Aynı komut → PASS.
- [ ] **Step 5:** Commit `feat(studio): kalıplı sayfada pencere ve grup korumaları`.

### Task 7: Studio — Pencereler bölümü

**Files:**
- Create: `panel/DialogsSection.tsx`
- Modify: `panel/TemplateInspector.tsx` (`ListPagePanel` :52 `CommandsSection` sonrası), `panel/FreePanel.tsx` (:132 sonrası), `panel/RecordPanel.tsx` (:245–:250 sonrası), tuval bağlantısı için `ErpCanvasFrame.tsx`
- Test: Create `panel/DialogsSection.test.tsx`

**Interfaces:**
- Consumes: Task 6 `dialogsModel`, Task 5 `showDialog`.

- [ ] **Step 1: Failing tests** (renderToString + olay simülasyonu, `CommandsSection.test.tsx` düzeni): bölüm başlığı `Pencereler`; her pencere satırı başlık ve boyut etiketini (`Küçük`/`Orta`/`Büyük`/`Çok büyük`) ve türü (`görünüm` / `form` = `saveQuery` ya da `saveSequence` varsa) gösterir; satır seçilince ayarlar: `Başlık`, `Boyut` (4 seçenek), `Kaydet eylemi` (yoksa `Yok (görünüm penceresi)`), `Kaydedince kapat`, `Açılışta alanları temizle`, `Kayıttan sonra yenilenecek veriler`, `İçerik (sırası)`; seçim `showDialog` gönderir, seçim kalkınca `dialogId: null`; `+ Pencere ekle` `addDialog` çağırır; açıklama satırı açan düğmeleri listeler (`dialogId` ile bağlı düğmeler, komut adı varsa komut adıyla, `openParam` varsa `sayfa bağlantısı <param>`).
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/DialogsSection` → FAIL.
- [ ] **Step 3:** Uygula; ayar alanları için var olan `DialogFields.tsx` / `DialogLookFields.tsx` parçalarını yeniden kullan, `drawer`/`full` seçeneklerini kalıplı sayfada gösterme.
- [ ] **Step 4:** `npx vitest run` (Studio tümü) → PASS.
- [ ] **Step 5:** Commit `feat(studio): Pencereler bölümü`.

### Task 8: Studio — grup paneli

**Files:**
- Create: `panel/GroupPanel.tsx`
- Modify: bileşen seçimi `section`/`card` + `children` iken kalıplı sayfada bu paneli açan yer (`TemplateInspector.tsx` `TemplateInspector` :155)
- Test: Create `panel/GroupPanel.test.tsx`

- [ ] **Step 1: Failing tests:** panel `Başlık`, `Açıklama`, `Ne zaman görünsün` (var olan koşul düzenleyicisi; boşsa `Her zaman`), `Üyeler` (çocuk etiketleri sırayla) ve `Grup içine eklenebilenler: rozet, başlık, metin, gösterge, uyarı, düğme, form, tablo, detay paneli, sekmeler.` notunu gösterir; `+ ekle` menüsü yalnız bu türleri sunar (bölüm / kart / pencere yok); üye çıkar/sırala `dialogsModel` fonksiyonlarını çağırır.
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/GroupPanel` → FAIL.
- [ ] **Step 3:** Uygula.
- [ ] **Step 4:** Studio tümü + `npm run build` → PASS.
- [ ] **Step 5:** Commit `feat(studio): grup paneli`.

### Task 9: Belgeler ve tam doğrulama

**Files:**
- Modify: `docs/phase-status.md` (yeni "5b-2 adım 2" bölümü: biçim, ERP, Studio, dönüştürücü; doğrulanan / doğrulanmayan ayrı), `docs/superpowers/specs/2026-11-27-pencere-grup-5b2b-design.md` (durum satırı), üst program belgesi durum satırı

- [ ] **Step 1:** Tam test: `dotnet test AIERP.slnx` (kilitle), `frontend/erp-web`: `npm test` + `npm run build`, `frontend/development-studio`: `npm test` + `npm run build`. Beklenen: hepsi yeşil; 50 standarttan taşınabilir sayısı (`Classify`) en az 5.
- [ ] **Step 2:** Sonuçları sayılarla `phase-status.md`'ye yaz (canlı rapor ve tarayıcı denemesi "doğrulanmadı").
- [ ] **Step 3:** Commit `docs: 5b-2 adım 2 durumu`.
