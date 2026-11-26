# Kalıpları büyütme, adım 1 (5b-2a): Komutlar + Kayıt kartına eşleme — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Taslak onayı:** `docs/design-proposals/studio-sadelestirme/11-komutlar.html` 2026-11-27'de kullanıcı onayından geçti ([[design-approval-first]]). Ekranlar bu taslaktan, sapmalar bölümündekiler dışında, ayrılmaz.

**Goal:** Eski sayfaların standart komut çubuğu (`actionBar`) dört kalıptan üçüne (Liste, Kayıt kartı, Serbest) birebir aynı davranışla gelir; ERP kabuğu komutları sabit sırayla ve tek "⋯" menüsüyle çizer ve ortak komut sistemine kaydeder; Studio'da sayfa panelinde Komutlar bölümü açılır; dönüştürücü işlem çubuğunu ve form sayfalarını (Kayıt kartı) tanır; yeni sayfa yalnız kalıpla oluşturulur.

**Architecture:**
- **Biçim: kalıplı sayfada üst düzey, tek bir `actionBar` bileşeni, `props.slot: "commands"`.** Ayarlar eski çubuğun ayarlarıyla aynı ad ve değerdedir (Karar 1). Böylece sunucu doğrulaması (`ValidateActionBarProps`, `PendingActionRefs`), standart kısıtlama (`Restrict`/`StripReferences`), `items` bildirimi (`component:komutlar`), Studio'nun `patchBarCommands`'i ve ERP'nin `buildPageCommands`'i olduğu gibi kullanılır; dönüştürücü çubuğa yalnız `slot` ekler.
- **ERP:** kalıp dallarında eski çubuğun `PageActionCommands`'i aynen bağlanır (`usePageCommands` → kayıt defteri; kısayollar, Görüntüle gibi kayıt defteri eklemeleri, gizli komut engeli, Ctrl+F2). Kabuk (`PageShell`) çubuğu kayıt defterinin **bu görünüm için** birleştirdiği komutlardan çizer; ortak `ActionBar` o görünümde çizmez (`shell` bayrağı), F1 yardımını ve Alt+İ'yi kabuğa bırakır.
- **Dönüştürücü:** Liste → Kayıt kartı → Serbest sırasıyla dener; davranış eşdeğerliği dönüştürücüden bağımsız olarak çubuğun her ayarının kalıpta karşılığını denetler.

**Tech Stack:** .NET 10 minimal API, xUnit (InMemory); React + Vite + TypeScript, vitest (erp-web: jsdom + `@testing-library`; development-studio: vitest + `renderToString`).

**Spec:**
- `docs/superpowers/specs/2026-11-27-kalip-buyutme-5b2-design.md` §5.1 madde 1, §5.2 (Taslak 11 kararları dahil), §5.3, §5.4, §5.5.
- Üst belge: `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` §3 ("davranış değişmez, görünüş değişebilir"), §7 madde 5b.
- Taslak: `docs/design-proposals/studio-sadelestirme/11-komutlar.html`.
- Önceki plan: `docs/superpowers/plans/2026-11-26-toplu-kalip-gecisi-5b1.md` (dönüştürücü, gerekçe tablosu, eşdeğerlik Karar 5).

## Kapsam

- **Bu planda:** A biçim + sunucu doğrulaması; B ERP çizimi ve komut kaydı; C Studio Komutlar bölümü ve yeni sayfa penceresi; D sunucuda kalıpsız yeni sayfanın reddi; E dönüştürücü (çubuk + Kayıt kartı) ve eşdeğerlik; F "Yeni" önerilerinde kalıp uyumsuzluğu; G belgeler.
- **Bu planda yok:**
  - **Canlı raporun yeniden çıkarılması ve standartların gömülü JSON'unun dönüştürülmesi** (§5.4): ayrı PR. Bu planın sonunda yerel rapor (Görev 4 testi) Kayıt kartına **0** standardın eşlendiğini gösterecektir (aşağıdaki "Beklenen sonuç"); taşınacak standart olmadığından o PR şimdilik yalnız rapordur.
  - **ScreenKey atlamasının kaldırılması** (§5.5): yalnız "standardı o dalgada taşınmış" kopyalar için kaldırılır; taşınmış standart olmadığından bu plan `PageTemplateMigrationRunner`'daki `SystemPageReason` atlamasına dokunmaz. Koşul (standardın gömülü tanımı kalıplıysa kopyayı sınıflandır) standart taşıma PR'ının ilk görevidir.
  - **Belge kalıbında komutlar:** Karar 6.
  - Açılış odağı (taslakta "öneri · hedef dışı").

## Beklenen sonuç (kod incelemesi, 2026-11-27)

50 standart üzerinde katı Kayıt kartı kuralıyla yapılan sayım: form taşıyan 49 standardın **hiçbiri** eşlenemez. Pencere/iç içe/satır tablosu/sihirbaz engellerinden bağımsız kalan "yeni kayıt" ekranlarının (crm-opportunity-create, finance-account-create, hr-employee-create, fixed-asset-create, foreign-trade-case) engeli **kayıt özeti**: hiç `recordHeader` yok ya da koşullu 4 tane var; Kayıt kartı tam bir özet ister. Bu, §7'deki "ilk adımlarda taşınan sayı sıfır kalabilir" riskinin gerçekleşmesidir; ilerleme raporda `İşlem çubuğu` (50), `hiddenCommands` (46), `commandWhen` (14) ve `Form alanları` (49) nedenlerinin kaybolmasıyla ölçülür.

## Taban dal

- Dal: `claude/kalip-buyutme-5b2`, `origin/master` `36ace0b2`'den (5b-1, PR #189 birleşik). Migration yok.
- PR bölümlemesi: **PR A** sunucu (Görev 1–4), **PR B** ERP (Görev 5–7), **PR C** Studio (Görev 8–9) + Görev 10 belgeler. Dağıtım: platform-api ve erp-web birlikte, development-studio sonra (eski Studio'nun "Eski tasarımcı" seçimi sunucunun Türkçe hatasını alır; veri bozulmaz).

## Görev bağımlılıkları

| Görev | Bağlı olduğu | Paralel çalışabilir (ayrı worktree) |
|---|---|---|
| 1 Şema: `commands` yeri | — | 2, 5, 8 ile |
| 2 Kalıpsız yeni sayfa reddi | — | 1, 5, 8 ile |
| 3 "Yeni" önerileri | 1 | 4 ile |
| 4 Dönüştürücü + eşdeğerlik | 1 | 3 ile |
| 5 Kayıt defteri: görünüm komutları, `shell` | — | 1, 2, 8 ile |
| 6 Kabuk çubuğu (`PageShell`) | 5 | — |
| 7 ERP kalıp dalları | 5, 6 (ve 1'in biçimi; sunucu gerekmez) | 9 ile |
| 8 Studio komut modeli | — (biçim Global Constraints'te donuk) | 1, 2, 5 ile |
| 9 Studio paneller + yeni sayfa penceresi | 8 | 7 ile |
| 10 Belgeler | hepsi | — |

## Global Constraints

- **Biçim (Karar 1).** Liste, Kayıt kartı ve Serbest kalıbında en çok bir üst düzey `{ "id": "komutlar", "type": "actionBar", "props": { "slot": "commands", … } }`. Kimlik serbesttir (dönüştürücü eski kimliği korur; Studio yeni çubuğa `komutlar` ya da boş ilk `komutlarN` verir). `commands` yerine yalnız `actionBar` konur; `actionBar` başka yerde, iç içe ya da ikinci kez olamaz.
- **İzinli ayarlar** (eski çubukla aynı tip ve doğrulama): `hiddenCommands`, `commandWhen`, `newAction` (`off` | `clear` | `page`), `newPageCode`, `newTarget`, `newInputs`, `newButton`, `openAction` (`off` | `page`), `openPageCode`, `openTarget`, `openTable`, `openParams`, `openButton`, `saveQuery`, `saveSequence`, `sequenceWhen`, `stopOnError`, `afterSaveAction` (`off` | `page`), `afterSavePageCode`, `afterSaveTarget`, `afterSaveRefresh`, `afterSaveButton`, `saveAndNew`, `deleteQuery`, `deleteConfirmText`, `exportTable`, `titleCount`, `focusInput`, `moreButtons`, `slot`.
- **Karşılığı olmayanlar:** `barLook`, `formDialog`, `printEnabled`, `exportCsv`, `visibleWhen`, `disabledWhen` ve listede olmayan her ayar. `newAction`/`openAction` `dialog` de reddedilir (pencere adım 2).
- **Kalıpta anlamı eski çubukla aynıdır**, şu üç fark dışında: (1) görünen Yazdır yazdırır (`printEnabled: true` sayılır); (2) CSV her zaman "⋯" menüsündedir (`exportCsv` yok = açık); (3) bağlanmamış komut (`"Bu sayfada bağlanmadı"`) çizilmez (eski `barLook unbound=hide`). Kısayollar üçünde de aynıdır: tarayıcı kısayolları (Ctrl+S/P/F/E/D, F5) çalışma alanında her zaman engellenir.
- **Komutların bağladığı düğmeler** (`moreButtons`, `newButton`, `openButton`, `afterSaveButton`) üst düzey `button`'dır ve `slot: "actions"` taşır; çubukta ayrıca çizilmez (`movedButtonIds`). Serbest gövdenin 8 düğme sınırı yalnız bağlanmamış `actions` düğmelerini sayar.
- **Kayıt kartı:** Kaydet ya çubukta (`saveQuery`/`saveSequence`) ya da `actions`'taki kayıt dizisi düğmesindedir; Sil ya çubukta (`deleteQuery`) ya da silme sorgulu düğmededir. Çubukta Kaydet varsa hakları eski çubuğunki (bütün adım türleri), kayıttan sonrası `afterSave*` varsa o, yoksa `afterRecordSave`; Sil'den sonra her zaman `afterRecordDelete`; yeni kayıtta Sil çizilmez **ve** kayıt defterinde `hidden`'dır. Kayıt kartında `titleCount` yoktur.
- **Kabuk sırası (Taslak 11 kararı):** ana düğme (Kaydet bağlıysa Kaydet, yoksa Yeni) solda; ardından `Yeni · Düzenle · Görüntüle · Kaydet ve yeni · Yenile · Filtre · Yazdır · Excel`; sonra sayfanın `actions` düğmeleri; Sil en sağda. Sığmayan "⋯" içine. Danışman sıralayamaz.
- **Tek "⋯" menüsü:** önce taşan düğmeler, sonra ayraç ve `Diğer` başlığıyla `moreButtons` ve `CSV olarak dışa aktar`. Alt+İ bu menüyü açar; `hiddenCommands` `more` menünün `Diğer` kısmını kaldırır.
- **İpucu:** düğmede rozet yok; üzerine gelince ya da odakta `"<Etiket> · <Kısayol>"` (`tooltipText`), pasifken `"<Neden> · <Kısayol>"`.
- **Sunucu hata metinleri:**
  - `KomutYeri = "Kalıplı sayfada işlem çubuğu yalnız üst düzeyde, 'commands' yerinde ve bir kez kullanılır; düğmeler 'actions' yerine konur."` (bugünkü `NoActionBar`'ın yerine)
  - `KomutAyari(key) = $"Kalıplı sayfanın komutlarında '{key}' kullanılamaz."`
  - `KomutDugmesi(id) = $"Komutların bağladığı düğme 'actions' yerinde olmalı: {id}."`
  - `IkiKaydet = "Kayıt kartında Kaydet ya Komutlar'da ya da Kaydet düğmesinde tanımlanır; ikisi birden olamaz."`
  - `IkiSil = "Kayıt kartında Sil ya Komutlar'da ya da Sil düğmesinde tanımlanır; ikisi birden olamaz."`
  - `KayitSayisi = "Kayıt kartında başlıkta kayıt sayısı (titleCount) kullanılmaz."`
  - `BelgeKomut = "Belge kalıbında komutlar belge modelinden gelir; işlem çubuğu (actionBar) kullanılamaz."`
  - `YeniSayfaKalipli = "Yeni sayfa bir kalıpla (Liste, Kayıt kartı, Belge ya da Serbest) oluşturulmalıdır."`
- **Davranış eşdeğerliği gevşetilmez:** 5b-1 kuralları aynen; yalnız Görev 4'teki eklemeler.
- **Danışman panelinde teknik terim yok** (§3): `slot`, `actionBar`, kimlik, `{{…}}` görünmez; ham adımlar yalnız "Gelişmiş" altında, salt okunur.
- **`.NET` testleri ortak kilitle sırayla** (CLAUDE.md):
  `LOCK=C:/Users/FATIH/AppData/Local/Temp/nexora-dotnet-test.lock; until mkdir "$LOCK" 2>/dev/null; do sleep 20; done; dotnet test tests/IntegrationTests --filter "..."; rc=$?; rmdir "$LOCK"`
  Aşağıda kısaca **[kilitli] `--filter "…"`** yazılır.
- **Studio testleri CI'da koşmaz:** her Studio görevinde yerelde `npm test` ve `npm run build` (`frontend/development-studio`).

## Kararlar (benim kararlarım; kullanıcı düzeltebilir)

1. **Biçimin yeri: `commands` yerindeki `actionBar`.** `template.commands` düşünüldü ve elendi: `PageTemplateRules.TemplateName` fazladan `template` anahtarını reddeder ve iki `readPageTemplate` yalnız `{name}` döner; şema doğrulaması bileşen tipine ve döngü sonrası `PendingActionRefs`'e bağlı; `Restrict`/`StripReferences` ve `items` (`component:komutlar`) üst düzey bileşen kimliğine bağlı; Studio `patchBarCommands` çubuk kimliğiyle çalışır; eşdeğerlik bileşenin silinmesini ve tip değişmesini reddeder. Bileşen biçiminde bunların hepsi değişmeden çalışır; değişen yalnız `Scan`'deki `actionBar` yasağı ve yer tabloları.
2. **`newButton`/`openButton`/`afterSaveButton` birebir taşınır** (taslaktaki "Ekran aç'a çevrilir" uygulanmaz; bkz. sapmalar). Studio'da "Gelişmiş › Eski düğme bağı" salt okunur gösterilir.
3. **Yazdır:** eski sayfada Yazdır görünür ve `printEnabled` yoksa (bağlı değil) sayfa taşınmaz; neden: `"Yazdır görünür ama bağlı değil; kalıpta görünen Yazdır yazdırır."` (bugün 4 standart; hepsinin başka engelleri de var).
4. **Kayıt kartına eşleme katıdır:** tam bir üst düzey `recordHeader`, ilk `formCard`'ın `recordKey`'i sayfa parametresine bağlı bir sorgudan (`recordKeyParam` boş değil), her `input` tam bir `formCard`'da. Dönüştürücü kayıt özeti **uydurmaz** (eşdeğerlik yalnız `section`/`tabs` eklemeye izin verir). Sekme yoksa tek sekme `Genel` eklenir.
5. **Var olan kalıplı sayfalar değişmez:** `commands` çubuğu olmayan kalıplı sayfa bugünkü gibi çizilir ve komut kaydetmez.
6. **Belge kalıbında komutlar bu adımda yok** (`BelgeKomut` hatası). Belge `DocumentTemplate` yolundan, `PageBody` dışında çizilir; Kaydet/Onayla belge modelindendir ve belge standardı yoktur. Belge modelleriyle (adım 5) birlikte ele alınır.
7. **Kayıt kartının Kaydet/Sil düğmeleri komut sistemine kaydedilmez** (bugün de kaydedilmiyor; Ctrl+S bugünkü gibi yalnız engellenir). Studio'da Komutlar › Kaydet/Sil bu düğmeleri düzenler (Görev 8 "sahip" kuralı).

## Onaylı taslaktan sapmalar

| Konu | Taslak 11 | Bu plan | Neden |
|---|---|---|---|
| Kayıt kartında sıra | Kaydet · Kaydet ve yeni · Yeni · Yenile | Kaydet · Yeni · Kaydet ve yeni · Yenile | Spec §5.2'deki karar listesindeki sabit sıra (taslak metni ve spec ayrışıyor; spec esas alındı) |
| `newButton` vb. | "Ekran aç"a çevrilir | Birebir taşınır | Spec: her ayar birebir; çevirme eylem değiştirir |
| Belge | Dört kalıp | Üç kalıp | Karar 6 |

## Review Focus

1. **Gizli ya da çizilmeyen komutun kısayolu:** yeni kayıtta Sil çizilmez; Ctrl+Del bir şey yapmamalı; `hiddenCommands: ["print"]` iken Ctrl+P yazdırmamalı. Test: Görev 7 `hidden and undrawn commands do nothing on shortcut`.
2. **İki çubuk / yanlış menü:** kalıplı sayfada ekranda tek araç çubuğu olmalı; arka plandaki sekmenin kabuğu etkin sekmenin komutlarını göstermemeli; Alt+İ yalnız etkin sekmenin "⋯" menüsünü açmalı. Test: Görev 5 ve Görev 6.
3. **Studio kaydı çubuğu kaybeder:** `ensureTemplateSlots` bilinmeyen yeri olan bileşeni taşır/atar; kaydet–aç döngüsünde `commands` çubuğu ve ayarları aynen kalmalı. Test: Görev 8 `round trip keeps the commands bar`.
4. **Var olan sayfanın yeni taslağı:** yayındaki kalıpsız sayfadan "yeni taslak" açmak (aynı kodla `POST /drafts`) çalışmaya devam etmeli; arşivlenmiş kodu yeniden kullanmak "yeni sayfa" sayılır. Test: Görev 2.
5. **Çok düğmeli menü:** 9 `moreButtons` düğmeli Serbest sayfa 8 düğme sınırına takılmamalı. Test: Görev 1 `Free_bar_owned_buttons_do_not_count_toward_eight`.

---

## PR A — sunucu (Görev 1–4)

### Task 1: Şema — `commands` yeri ve kalıplı çubuğun kuralları

**Files:**
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateRules.cs` (`Slots`, `RecordSlots`, `FreeSlots`'a `"commands"`; `SlotTypes`/`RecordSlotTypes`/`FreeSlotTypes`'a `["commands"] = "actionBar"`; `Scan`: üst düzey `commands` çubuğu dışında `actionBar` → `KomutYeri`; Belge'de → `BelgeKomut`; `ValidateFree` 8 sınırı bağlı düğmeleri saymaz; `ValidateRecord` `IkiKaydet`/`IkiSil`/`KayitSayisi`; en çok bir `commands`)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` (`ValidateActionBarProps`: `context.Template != null` iken `TemplateBarProps` dışındaki anahtar → `KomutAyari`; `newAction`/`openAction` `dialog` reddi; döngü sonrası bağlı düğmelerin `slot: "actions"` denetimi → `KomutDugmesi`)
- Test: `tests/IntegrationTests/TenantCustomPageSchemaTemplateCommandsTests.cs` (yeni; `TenantCustomPageSchemaRecordTemplateTests.cs` kurulum kalıbı); eski `NoActionBar` metnini bekleyen testler güncellenir

**Interfaces:**
- Produces: `PageTemplateRules.CommandsSlot = "commands"`; `internal static readonly IReadOnlySet<string> TemplateBarProps` (Global Constraints "İzinli ayarlar"); `internal static string? CommandBarId(JsonElement components)` (üst düzey `commands` çubuğunun kimliği ya da null); Global Constraints'teki hata metinleri `PageTemplateRules` sabitleri olarak.

- [ ] **Step 1: Write the failing tests**
  - `List_page_with_commands_bar_is_valid` (customers standardının çubuk ayarları + `slot: "commands"`, düğmeler `actions`)
  - `Record_and_free_page_with_commands_bar_are_valid`
  - `Commands_bar_outside_commands_slot_or_nested_or_twice_is_rejected` → `KomutYeri`
  - `Commands_slot_with_button_is_rejected` → `'commands' yerine 'button' bileşeni konamaz; bu yere yalnız 'actionBar' konabilir.`
  - `Each_unmappable_setting_is_rejected` (`barLook`, `formDialog`, `printEnabled`, `exportCsv`, `visibleWhen`) → `Kalıplı sayfanın komutlarında 'barLook' kullanılamaz.` …
  - `New_action_dialog_is_rejected_on_template_page`
  - `Bar_button_outside_actions_slot_is_rejected` → `Komutların bağladığı düğme 'actions' yerinde olmalı: yeniTeklif.`
  - `Record_with_bar_save_and_sequence_button_is_rejected` → `IkiKaydet`; `Record_with_bar_delete_and_delete_button_is_rejected` → `IkiSil`
  - `Record_bar_titleCount_is_rejected` → `KayitSayisi`
  - `Belge_with_action_bar_is_rejected` → `BelgeKomut`
  - `Free_bar_owned_buttons_do_not_count_toward_eight` (9 `moreButtons` + 1 bağlanmamış düğme → geçerli; 9 bağlanmamış → `Serbest gövdede en fazla 8 düğme olabilir.`) (Review Focus 5)
  - `Legacy_action_bar_rules_unchanged` (kalıpsız sayfada `barLook`, `printEnabled` hâlâ geçerli)
- [ ] **Step 2:** [kilitli] `--filter "FullyQualifiedName~TenantCustomPageSchemaTemplateCommandsTests"` → FAIL.
- [ ] **Step 3:** Implement. Çubuk ayarlarının kendisi bugünkü `ValidateActionBarProps`/`ValidateBarCommands`/`ValidateSequenceProps` ile denetlenir; yalnız izin listesi ve yer kuralları eklenir.
- [ ] **Step 4:** Aynı filtre PASS; ardından [kilitli] `--filter "FullyQualifiedName~TenantCustomPageSchema|FullyQualifiedName~PageTemplate|FullyQualifiedName~SystemPage"` PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): kalıplı sayfada komutlar yeri`

### Task 2: Kalıpsız yeni sayfanın reddi

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (`POST /drafts`: `liveDefinitions` boşsa ve tanımda geçerli `template` yoksa (`PageTemplateRules.TemplateName(root) is null`; sürüm 1 dahil) 400 `{ error = YeniSayfaKalipli }`)
- Modify: kalıpsız tanımı yeni kodla `POST /drafts`'a gönderen 18 test dosyası (`grep -rln "custom-pages/drafts" tests/`)
- Create: `tests/IntegrationTests/TemplatelessPageSeed.cs`
- Test: `tests/IntegrationTests/TenantCustomPageEndpointsIntegrationTests.cs` (yeni testler)

**Interfaces:**
- Produces: `internal static class TemplatelessPageSeed { static Task<Guid> SeedDraftAsync(IServiceProvider services, Guid tenantId, Guid userId, string code, string name, string definitionJson, bool published = false) }` — `TenantDbContext`'e sayfa + `DraftCreated` sürümü yazar (eski sayfaları temsil eder). Üretimde atlatma yolu, yapılandırma bayrağı **yoktur**.

- [ ] **Step 1: Write the failing tests**
  - `New_templateless_draft_is_rejected` → 400, `error == "Yeni sayfa bir kalıpla (Liste, Kayıt kartı, Belge ya da Serbest) oluşturulmalıdır."`, sayfa sayısı değişmez
  - `New_schema_v1_draft_is_rejected` (aynı metin)
  - `New_templated_draft_is_created` (list, record, free, belge) → 201
  - `New_draft_of_existing_templateless_page_is_allowed` (yayındaki kalıpsız sayfanın koduyla) → 201 (Review Focus 4)
  - `Archived_code_reuse_counts_as_new_page` → 400 (Review Focus 4)
  - `Existing_templateless_page_put_and_publish_still_work`
  - `System_page_draft_is_unaffected` (`POST /api/system-pages/{key}/draft` → 201)
- [ ] **Step 2:** [kilitli] `--filter "FullyQualifiedName~TenantCustomPageEndpointsIntegrationTests"` → FAIL.
- [ ] **Step 3:** Implement uç noktayı.
- [ ] **Step 4:** Kırılan testleri taşı: testin konusu yeni sayfa oluşturmak değilse kalıpsız tanım `TemplatelessPageSeed` ile yazılır; konusu oluşturmaksa tanım en küçük geçerli kalıplı tanıma (`free`, tek boş bölüm) çevrilir. Testin beklediği davranış değiştirilmez.
- [ ] **Step 5:** [kilitli] `--filter "FullyQualifiedName~CustomPage|FullyQualifiedName~SystemPage"` PASS.
- [ ] **Step 6: Commit** — `feat(custom-pages): yeni sayfa yalnız kalıpla oluşturulur`

### Task 3: "Yeni" önerilerinde kalıp uyumsuzluğu

**Files:**
- Modify: `src/Hosts/AIERP.Api/SystemPages/SystemPageMerge.cs` (`NewItems`)
- Test: `tests/IntegrationTests/SystemPageMergeTests.cs` (var olan dosya; yoksa `SystemPage*` testlerinin yanına yeni)

**Interfaces:**
- Consumes: `PageTemplateRules.TemplateName(JsonElement)`.
- Produces: `NewItems` standardın ve tasarımın kalıp adı farklıysa (biri kalıpsız, öteki kalıplı ya da farklı kalıplar) boş liste döner. `SystemPageEndpoints.cs` satır 49 (sayaç) ve 262–264 (`OfferedItems`) bunu kendiliğinden kullanır.

- [ ] **Step 1: Write the failing tests**
  - `No_items_offered_from_templated_standard_to_templateless_copy` → `Assert.Empty(...)`
  - `No_items_offered_from_templateless_standard_to_templated_copy`
  - `Items_offered_between_same_template` (`list`↔`list`) → beklenen öğe
  - `Restrict_strips_removed_ids_from_commands_bar` (çubuğun `moreButtons`'ındaki v2 düğmesi v1 kısıtlamasında listeden düşer; kısıtlanmış tanım şemadan geçer)
- [ ] **Step 2:** [kilitli] `--filter "FullyQualifiedName~SystemPageMerge"` → FAIL (ilk ikisi; dördüncüsü bugünkü `StripReferences` sayesinde geçebilir, o zaman yalnız güvence testidir).
- [ ] **Step 3:** Implement `NewItems` başındaki denetimi.
- [ ] **Step 4:** Aynı filtre PASS.
- [ ] **Step 5: Commit** — `feat(system-pages): kalıplı ve kalıpsız tasarım arasında bileşen önerilmez`

### Task 4: Dönüştürücü (çubuk + Kayıt kartı) ve eşdeğerlik

**Files:**
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateMigration.cs` (`Scan`, `BlockedSettings`, `BuildList`/`BuildFree` çubuğu taşır, yeni `BuildRecord`, deneme sırası `list` → `record` → `free`)
- Modify: `src/Hosts/AIERP.Api/PageTemplates/BehaviorEquivalence.cs`
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateMigrationRunner.cs` (yalnız `TargetLabel`: `record` → `Kayıt kartı`)
- Test: `tests/IntegrationTests/PageTemplateMigrationTests.cs` (genişletilir), `tests/IntegrationTests/BehaviorEquivalenceTests.cs` (varsa genişletilir; yoksa `PageTemplateMigrationTests` içinde)

**Interfaces:**
- Consumes: Görev 1'in `CommandsSlot`, `TemplateBarProps`.
- Produces:
  - `MigrationResult.Target`: `"list"` | `"record"` | `"free"` | null.
  - Kaldırılan nedenler: `ActionBarReason` (yalnız çubuk eşlenemiyorsa çıkar), `FormReason`; `BlockedSettings`'ten `commandWhen`, `hiddenCommands` çıkar (`barLook` kalır).
  - Yeni neden sabitleri:
    - `ActionBarSettingReason(key) = $"İşlem çubuğunun {key} ayarının kalıpta karşılığı yok."` (`barLook`, `formDialog`, `printEnabled`, `exportCsv`, `visibleWhen`, `disabledWhen`, izin listesi dışı her ayar; `newAction`/`openAction` `dialog`)
    - `PrintUnboundReason = "Yazdır görünür ama bağlı değil; kalıpta görünen Yazdır yazdırır."`
    - `RecordNeedsSummaryReason = "Kayıt kartı tam bir kayıt özeti (recordHeader) ister."`
    - `RecordNeedsKeyReason = "Kayıt kartının bölümleri sayfa parametresiyle okunan bir kayda bağlı değil."`
    - `RecordFieldOutsideSectionReason(id) = $"Kayıt kartında her alan bir bölümde olmalı: {id}."`
    - `RecordBetweenSectionsReason(id) = $"Kayıt kartında bölümlerin arasına yalnız açıklama (text) konabilir: {id}."`
    - `RecordTitleCountReason = "Kayıt kartında başlıkta kayıt sayısı yok."`
  - `BuildRecord` yerleşimi (Karar 4): `recordHeader` → `summary`; `formCard` → `section`; bölümlerin `inputs`'undaki `input` → `field`; `tabs` (en çok bir) → `tabs`, yoksa eklenen `{ id: <boş kimlik "sekmeler">, type: "tabs", props: { slot: "tabs", tabs: ["Genel=<bölüm ve tablo kimlikleri sırayla>"] } }`; sekmedeki `dataTable` → `lines`; ilk ve son bölüm arasındaki `text` → `note` (sekmede, önceki bölümden sonra); ilk bölümden önceki öteki bileşenler → `above`, sonrakiler → `below`; `button` → `actions`; `actionBar` → `commands`; `width` silinir.
  - `BehaviorEquivalence.Check` eklemeleri (dönüştürücüden bağımsız, ortak yardımcı yok):
    - Sonraki tanım kalıplıysa üst düzey `actionBar`'ın özelliklerinde `slot` dışındaki her anahtar `TemplateBarProps` içinde olmalı → değilse `"İşlem çubuğunun '{key}' ayarının kalıpta karşılığı yok."`.
    - Sonraki tanım kalıplı ve çubukta `print` gizli değilse önceki çubukta `printEnabled == true` olmalı → değilse `"Kalıpta görünen Yazdır yazdırır; önceki sayfada bağlı değildi."`.
    - Çubuğun `slot` dışındaki özellikleri derin eşit (bugünkü kural; değişiklik yok).

- [ ] **Step 1: Write the failing tests**
  - `List_page_with_mappable_bar_becomes_list_with_commands_slot` (çubuk kimliği, özellikleri ve düğme kimlikleri aynı; `moreButtons` düğmeleri `actions`'ta)
  - `Each_unmappable_bar_setting_reports_its_reason` (beş ayar + `newAction: dialog`) → `İşlem çubuğunun barLook ayarının kalıpta karşılığı yok.` …
  - `Visible_unbound_print_is_not_converted` → `PrintUnboundReason`
  - `Form_page_with_one_summary_becomes_record` (özet, iki bölüm, alanlar, eklenen `Genel` sekmesi, `above`'daki başlık; `Converted_definition_passes_schema_and_template_validation`)
  - `Form_page_without_summary_reports_reason` → `RecordNeedsSummaryReason`; dört özetli → aynı neden
  - `Form_page_without_param_key_reports_reason` → `RecordNeedsKeyReason`
  - `Loose_input_reports_reason` → `Kayıt kartında her alan bir bölümde olmalı: musteriTuru.`
  - `Badge_between_sections_reports_reason` → `RecordBetweenSectionsReason`
  - `Record_bar_title_count_reports_reason` → `RecordTitleCountReason`
  - `Equivalence_rejects_unmappable_bar_key_after_conversion` (elle bozulmuş sonraki tanım: kalıplı + `barLook`)
  - `Equivalence_rejects_visible_print_without_printEnabled`
  - `Equivalence_rejects_changed_hiddenCommands_and_saveSequence`
  - `All_50_standards_classify_without_exception_and_none_reports_action_bar_or_form_reason` (sonuçlarda `İşlem çubuğu kalıplarda yok.` ve `Form alanları (Kayıt kartı adayı).` hiç yok; `Target == "record"` sayısı test çıktısına yazılır, beklenen 0)
- [ ] **Step 2:** [kilitli] `--filter "FullyQualifiedName~PageTemplateMigration|FullyQualifiedName~BehaviorEquivalence"` → FAIL.
- [ ] **Step 3:** Implement. Emin olunmayan her durumda hedef verilmez.
- [ ] **Step 4:** Aynı filtre PASS; [kilitli] `--filter "FullyQualifiedName~PageTemplate"` PASS (rapor testleri dahil).
- [ ] **Step 5: Commit** — `feat(custom-pages): dönüştürücü işlem çubuğunu ve kayıt kartını tanır`

## PR B — ERP (Görev 5–7)

Bütün yollar `frontend/erp-web/src/` altındadır; komut: `npx vitest run <yol>` (`frontend/erp-web`).

### Task 5: Kayıt defteri — görünüm komutları ve `shell` bayrağı

**Files:**
- Modify: `commands/types.ts` (`PageCommands.shell?: boolean`: "bu görünümün çubuğunu sayfanın kabuğu çizer")
- Modify: `commands/registry.ts` (`compute(viewKey)` parametreli; `getView`; `claimMoreMenu`/`moreMenuClaim`; `shell` yalnız etkin `page` kaynağından birleşir, `look` gibi)
- Modify: `commands/CommandProvider.tsx` (`structureSignature`'a `shell`; `useViewPageCommands`)
- Modify: `action-bar/ActionBar.tsx` (`commands?.shell` iken çubuk ve portal çizilmez, yalnız `ShortcutHelpDialog`; Alt+İ önce `moreMenuClaim(activeView)`)
- Test: `commands/registry.test.ts`, `action-bar/ActionBar.test.tsx`

**Interfaces:**
- Produces:
  - `CommandRegistry.getView(viewKey: string): PageCommands | undefined` (etkin görünümden bağımsız aynı birleştirme)
  - `CommandRegistry.claimMoreMenu(viewKey: string, toggle: () => void): () => void`
  - `CommandRegistry.moreMenuClaim(viewKey: string | undefined): (() => void) | undefined`
  - `useViewPageCommands(): PageCommands | undefined` (`ViewKeyContext`'in görünümü; `useSyncExternalStore`)

- [ ] **Step 1: Write the failing tests**
  - `getView merges sources of a background view` (görünüm `a` etkinken `getView("b")` b'nin `page > list > grid` birleşimini döner)
  - `shell flag comes only from the page source`
  - `Alt+İ calls the claimed menu of the active view only` (iki görünüm iddia eder; yalnız etkinin `toggle`'ı bir kez çağrılır) (Review Focus 2)
  - `ActionBar draws nothing for a shell view but F1 still opens help` (`queryByRole("toolbar", { name: "İşlemler çubuğu" })` null; F1 → `getByRole("dialog")`)
- [ ] **Step 2:** `npx vitest run src/commands src/action-bar` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Aynı komut PASS (var olan testler değişmeden).
- [ ] **Step 5: Commit** — `feat(erp): kayıt defterinde görünüm komutları ve kabuk çubuğu bayrağı`

### Task 6: Kabuk çubuğu — sabit sıra, ipucu, tek "⋯"

**Files:**
- Create: `page-templates/templateCommands.ts`
- Modify: `page-templates/PageShell.tsx` (`ShellAction.shortcut`, `menu`, `moreMenuHidden`; ipucu `useActionTooltip`; "⋯" menüsü taşanlar + `Diğer`; Alt+İ iddiası)
- Modify: `custom-page/pageActions.ts` (`UNBOUND_REASON` dışa açılır: `export const UNBOUND_REASON = "Bu sayfada bağlanmadı"`)
- Modify: `page-templates/page-templates.css` (`.page-shell-menu-heading`, ayraç)
- Test: `page-templates/templateCommands.test.ts`, `page-templates/PageShell.test.tsx` (genişletilir)

**Interfaces:**
- Consumes: Görev 5 `claimMoreMenu`, `ViewKeyContext`; `STANDARD_SHORTCUTS`, `formatShortcut`, `tooltipText`, `COMMAND_LABELS`, `offersCommand`, `SAVE_AND_NEW_COMMAND_ID`.
- Produces:
  - `export type ShellMenuItem = { id: string; label: string; shortcut?: string; disabledReason?: string; run: () => void }`
  - `ShellAction` += `shortcut?: string`
  - `PageShell` += `menu?: ShellMenuItem[]`, `moreMenuHidden?: boolean`
  - `export const TEMPLATE_COMMAND_ORDER = ["new", "open", "view", SAVE_AND_NEW_COMMAND_ID, "refresh", "filter", "print", "export"] as const`
  - `export function shellCommandActions(commands: PageCommands | undefined, pageButtons: ShellAction[]): { actions: ShellAction[]; menu: ShellMenuItem[]; moreMenuHidden: boolean }` — Global Constraints'teki sıra; `primary` taşıyan komut `kind: "primary"` (Kaydet sırada değilse ana düğme olarak); `delete` `danger`; `UNBOUND_REASON`'lu ve `hidden` komutlar alınmaz; `offersCommand` (form ekranında liste komutları yok); komut varken sayfa düğmelerinin `primary`'si `normal` olur; `menu` = `commands.more` (`moreHidden` ise boş ve `moreMenuHidden: true`).
  - `export function templateBarProps(props: Record<string, unknown>): Record<string, unknown>` → `{ ...props, printEnabled: true }`

- [ ] **Step 1: Write the failing tests**
  - `orders commands with primary left and Sil right` (Kaydet bağlı kayıt: `["Kaydet","Yeni","Kaydet ve yeni","Yenile","Ekstre al","Sil"]`; liste: `["Yeni","Düzenle","Görüntüle","Yenile","Filtre","Excel","Sil"]`)
  - `unbound and hidden commands are not drawn; reasoned disabled ones are` (`Düzenle` `"Önce bir kayıt seçin"` ile pasif çizilir)
  - `form screen drops list commands`
  - `templateBarProps turns print on and keeps every other key`
  - `PageShell shows "Kaydet · Ctrl+S" on hover and "Önce bir kayıt seçin · Enter" on a disabled Düzenle`
  - `overflow and Diğer share one ⋯ menu` (dar genişlik: taşanlar, ayraç, başlık `Diğer`, `Yeni teklif`, `CSV olarak dışa aktar`)
  - `Alt+İ opens the ⋯ menu; moreMenuHidden hides Diğer but keeps overflow`
  - `a shell in a background view does not answer Alt+İ` (Review Focus 2)
- [ ] **Step 2:** `npx vitest run src/page-templates/templateCommands src/page-templates/PageShell` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Aynı komut PASS; `npx vitest run src/page-templates` anlık görüntüler güncellenmeden PASS.
- [ ] **Step 5: Commit** — `feat(erp): kalıp kabuğunda komut sırası, ipucu ve tek menü`

### Task 7: ERP kalıp dallarında komutlar

**Files:**
- Modify: `TenantCustomPage.tsx` (`PageActionCommands` yeni özellikler; Liste, Kayıt kartı, Serbest dallarında `commands` çubuğu varsa `<PageActionCommands … shell />`; kabuk eylemleri `shellCommandActions(useViewPageCommands(), shellActionsFor(layout.actions minus runtime.movedButtons))`; Liste/Serbest başlık sayısı: `titleCount` varsa `pageTitleCount(...)` (bugünkü `countTableHidden` kuralıyla), yoksa kalıbın sayısı; Kayıt kartında çubuk Kaydet varsa `afterSaveFallback = recordDone`, Sil sonrası `afterRecordDelete`, yeni kayıtta `hide: ["delete"]`)
- Modify: `page-templates/listTemplateModel.ts`, `recordTemplateModel.ts`, `freeTemplateModel.ts` (`slot: "commands"` yerleşime girmez; `commandsBarOf(components): C | null`)
- Test: `page-templates/TemplateCommands.test.tsx` (yeni; `RecordTemplateSave.test.tsx` kurulum kalıbı: `CommandProvider` + `ActionBar` + `ViewKeyContext`), `page-templates/legacyUnchanged.test.tsx` (değişmeden geçer)

**Interfaces:**
- Consumes: Görev 5–6 adları; Görev 1 biçimi.
- Produces: `PageActionCommands` özellikleri += `shell?: boolean` (kayıtlı komutlara `shell: true`), `afterSaveFallback?: () => void` (`barPlan.afterSave.mode === "off"` iken başarılı Kaydet'ten sonra), `afterDeleteFallback?: () => void` (başarılı Sil'den sonra), `hide?: StandardCommandId[]` (kayıttan önce `{ hidden: true }`); `barProps` olarak `templateBarProps(bar.props)` verilir. Tuvalde kabuk çubuğunun önüne çubuğun işareti konur (`AnchorMark id={bar.id}`), Studio çubuğa tıklamayı sayfa seçimine çevirir (Görev 9).

- [ ] **Step 1: Write the failing tests**
  - `templated page registers the same commands as the legacy page with the same bar` (aynı çubuk ayarlarıyla kalıpsız ve kalıplı sayfa; `registry.getView(...)` sonuçlarının yapı imzası `print` dışında eşit) — temel eşlik testi
  - `exactly one toolbar is on screen` (`getAllByRole("toolbar")` uzunluğu 1, adı `İşlemler`) (Review Focus 2)
  - `hiddenCommands hide the command and its shortcut` (`["print","save"]`: Yazdır yok, Ctrl+P `window.print` çağırmaz, `defaultPrevented`)
  - `commandWhen saveNew shows Kaydet ve yeni only for a new record` (koşul `kart.rows[0].id == null`; Ctrl+F2 var olan kayıtta bir şey yapmaz)
  - `saveSequence runs steps in order and stops on error` (`stopOnError: true`, 2. adım 500 → 3. adım gitmez)
  - `afterSaveAction page opens the target in the same tab and refreshes it`
  - `record bar save without afterSave keeps the card rule` (yeni kayıt, açan sekme var → açan sekmeye döner, bildirim `Kaydedildi.`)
  - `hidden and undrawn commands do nothing on shortcut` (yeni kayıtta Ctrl+Del silme isteği göndermez) (Review Focus 1)
  - `Sil confirm title comes from deleteConfirmText and selected row` (`"C-1001 · Akdeniz Gıda A.Ş. cari kartı silinsin mi?"`; metin boşken `"Kayıt silinsin mi?"`)
  - `Excel exports exportTable visible rows and CSV sits in the ⋯ menu`
  - `titleCount shows the bound total next to the title` (`{{cariler.meta.totalCount}}` = 1248 → başlıkta 1.248)
  - `Filtre and Ctrl+F focus focusInput` (`document.activeElement.id == "page-input-suzgec"`)
  - `moreButtons run their buttons from the ⋯ menu and are not drawn in the bar`
  - `Görüntüle opens the Düzenle page read-only` (`openAction: page` → parametrelerde `mode=view`)
  - `templated page without commands bar renders and registers as before` (Karar 5)
- [ ] **Step 2:** `npx vitest run src/page-templates/TemplateCommands` → FAIL.
- [ ] **Step 3:** Implement. Komut kuralları yeniden yazılmaz: yalnız `PageActionCommands` bağlanır ve kabuk kayıt defterinden okur.
- [ ] **Step 4:** Aynı komut PASS; `npm test` ve `npm run build` PASS (`legacyUnchanged` anlık görüntüleri güncellenmeden).
- [ ] **Step 5: Commit** — `feat(erp): kalıplı sayfalarda standart komutlar`

## PR C — Studio (Görev 8–9)

Bütün yollar `frontend/development-studio/src/platform-tools/erp-src/page-designer/` altındadır; komut: `npx vitest run <yol>` (`frontend/development-studio`).

### Task 8: Komut modeli (saf)

**Files:**
- Create: `panel/commandsModel.ts`
- Modify: `panel/templateGuards.ts` (`commands` yeri bütün kalıplarda tanınır; `ensureTemplateSlots` çubuğu taşımaz)
- Modify: `barCommands.ts` (yalnız gerekirse dışa açma; davranış değişmez)
- Test: `panel/commandsModel.test.ts`, `panel/templateGuards.test.ts` (genişletilir), `panel/commandsRoundTrip.test.ts` (yeni; `recordRoundTrip.test.ts` kalıbı)

**Interfaces:**
- Consumes: `patchBarCommands`, `barModes` (`barCommands.ts`); `ModelDefinition`, `ModelComponent`, `freeId` (`listPanelModel`); `recordQuery`, `recordKey`, `saveActions`, `deleteAction`, `setDeleteAction`, `setSaveActions` (`recordModel`); `CatalogAction` (`catalogClient`).
- Produces (hepsi yeni tanım döner, girdiyi değiştirmez):
  - `COMMANDS_SLOT = "commands"`, `COMMANDS_ID = "komutlar"`
  - `type TemplateCommandId = "new" | "open" | "save" | "saveNew" | "delete" | "refresh" | "filter" | "print" | "export"`
  - `TEMPLATE_COMMAND_ROWS: Record<"list" | "record" | "free", { id: TemplateCommandId; label: string; key: string }[]>` — record: Yeni F2, Kaydet Ctrl+S, Kaydet ve yeni Ctrl+F2, Sil Ctrl+Del, Yenile F5, Yazdır Ctrl+P; list ve free: Yeni F2, `Düzenle · Görüntüle` Enter, Kaydet Ctrl+S, Sil Ctrl+Del, Yenile F5, Filtre Ctrl+F, Yazdır Ctrl+P, Excel Ctrl+E
  - `commandsBar(def): ModelComponent | null`; `ensureCommandsBar(def): { def; barId: string }` (yoksa `{ id: freeId(def, COMMANDS_ID), type: "actionBar", props: { slot: "commands" } }`)
  - `commandShown(def, id): boolean`; `toggleCommand(def, id)` (`hiddenCommands`; `saveNew` için `saveAndNew`; ayarlar korunur)
  - `type WhenChoice = "always" | "new" | "edit" | "cond"`; `commandWhenChoice(def, id): { choice: WhenChoice; condition: string | null }`; `setCommandWhen(def, id, choice, condition?)` — `new` = `` `${recordQuery(def).name}.rows[0].${recordKey(def)} == null` ``, `edit` aynı ifadenin `!=` hali; `cond` kural kurucunun ifadesi
  - `type StepOwner = "bar" | "button"`; `saveSteps(def): { owner: StepOwner | null; steps: { queryId: string; label: string; when: string | null; raw: boolean }[]; stopOnError: boolean }` — sahip: çubukta `saveQuery`/`saveSequence` varsa `bar`, yoksa kayıt dizisi düğmesi; `raw` = katalog eylemine bağlı olmayan sorgu
  - `addSaveStep(def, action: CatalogAction): D`, `removeSaveStep(def, queryId): D` (ham adım silinemez: değişmeden döner), `setStopOnError(def, on: boolean): D`
  - `deleteCommand(def): { owner: StepOwner | null; actionCode: string | null; confirmText: string }`; `setDeleteCommand(def, action: CatalogAction | null)`; `setDeleteConfirmText(def, text)` (düğme sahibinde `confirmText`, çubukta `deleteConfirmText`; `{Alan}` ifadeleri `consultantText` ile bağlamaya çevrilir)
  - `afterSaveChoice(def): "card" | "page"`; `setAfterSave(def, choice, page?: { pageCode: string; target: "sameTab" | "newTab"; refresh: boolean })` (`card` → `afterSave*` anahtarları silinir)
  - `newCommand`/`setNewCommand`, `openCommand`/`setOpenCommand`, `setFocusInput`, `setExportTable`, `moreButtons`/`setMoreButtons`, `titleCountOn`/`setTitleCount(def, on)` (`on` → `{{<liste sorgusu>.meta.totalCount}}`, yoksa silinir) — hepsi `patchBarCommands` üzerinden

- [ ] **Step 1: Write the failing tests**
  - `ensureCommandsBar adds one bar in the commands slot and reuses it`
  - `toggleCommand keeps settings of a hidden command` (Sil gizlenip açılınca `deleteQuery` aynı)
  - `setCommandWhen new writes the record-key condition` (`"kayit.rows[0].id == null"`)
  - `saveSteps reads bar steps as raw and button steps as catalog actions`; `removeSaveStep keeps raw steps`
  - `addSaveStep appends a catalog action step to the owner`
  - `setDeleteCommand on a Studio record edits the Sil button; on a converted page edits the bar`
  - `setAfterSave card removes afterSave keys`
  - `titleCount uses the list query total`
  - `round trip keeps the commands bar` (kaydet–aç: `wireDefinition` + `ensureTemplateSlots` sonrası çubuk, yeri ve ayarları derin eşit) (Review Focus 3)
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/commandsModel src/platform-tools/erp-src/page-designer/panel/commandsRoundTrip src/platform-tools/erp-src/page-designer/panel/templateGuards` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Aynı komut PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): kalıplı sayfa komut modeli`

### Task 9: Komutlar bölümü, Sil'in yeri ve yeni sayfa penceresi

**Files:**
- Create: `panel/CommandsSection.tsx`
- Modify: `panel/RecordPanel.tsx` (sayfa seçiminde Komutlar bölümü; "Kaydet düğmesi"nden "Sil düğmesi" satırı kalkar)
- Modify: `panel/FreePanel.tsx` (sayfa seçiminde Komutlar)
- Modify: `panel/TemplateInspector.tsx` (Liste'de seçim yokken ya da `commands` çubuğu seçiliyken sayfa paneli: Ad, `Liste <kaynak> veri kaynağı · <n> kolon`, Komutlar; Serbest/Kayıt kartında çubuk seçimi sayfa paneline gider)
- Modify: `BarCommandRows.tsx` (isteğe bağlı `rows` özelliği; varsayılan bugünkü `BAR_COMMAND_ROWS`)
- Modify: `pageTemplates.ts`, `NewPageDialog.tsx` (`LEGACY_TEMPLATE_CHOICE` kaldırılır; `newPageDefinitionFor` yalnız dört kalıp; "Şablonla başla" (`mode: "template"`) var olan boş kalıpsız sayfa için kalır)
- Modify: `../CustomPagesPage.tsx` (`pageTemplate ?? "legacy"` dalı kalkar)
- Test: `panel/CommandsSection.test.tsx`, `panel/RecordPanel.test.tsx`, `panel/TemplateInspector.test.tsx`, `pageTemplates.test.ts`, `NewPageDialog.test.tsx` (yoksa yeni)

**Interfaces:**
- Consumes: Görev 8'in bütün adları; `BarCommandRows`, `BarCommandFields`, `SequenceFields` (salt okunur ham adımlar), `ConditionBuilder` (`prop: "commandWhen"`).
- Produces: `CommandsSection({ def, template: "list" | "record" | "free", catalog, pages, tokens, disabled, onChange })`. Tuvalde çubuğa tıklamak sayfayı seçer: ERP'deki kabuk çubuğu `commands` çubuğunun işaretini (`AnchorMark id={bar.id}`) taşır (Görev 7'de `PageShell`'e verilir; bu görev Studio tarafında seçimin sayfa paneline gitmesini sağlar).
- **Metinler (taslak 11, birebir):** başlık `Komutlar`, ipucu `göz = çubukta göster`; gizli satır özeti `Çubukta gizli · kısayolu çalışmaz`, ayrıntı `Gizli komutun ayarları korunur; göz açılınca geri gelir.`; `Ne zaman görünsün?`: `Her zaman` / `Yalnız yeni kayıtta` / `Yalnız var olan kayıtta` (yalnız Kayıt kartı) / `Koşula göre`; Yeni: `Ne yapsın?` `Formu temizle` / `Ekran aç`, `Hangi ekran`, `Nerede` `Bu sekmede` / `Yeni sekmede`, Gelişmiş `Temizlenecek alanlar` (`Yalnız "Formu temizle"de kullanılır.`), `Eski düğme bağı`; Kaydet (liste) `Liste sayfası kaydetmez; Kaydet çubukta yoktur.`; Kaydet (kart) `Kaydetme sırası`, `+ Adım ekle`, `Bir adım hata verirse dur`, `Adımlar yazılımcının hazırladığı eylemlerdir; yetki ve onay sorusu ondan gelir.`, Gelişmiş `Standarttan gelen adımlar (salt okunur)`, `Kaydettikten sonra` `Kartın kuralı` / `Ekran aç`, kural metni `Var olan kayıt yeniden yüklenir, kartta kalınır. Yeni kayıtta kart, kartı açan sekmeye döner; açan yoksa form temizlenir.`, `Açılan ekranı yenile`; Kaydet ve yeni `Kaydeder; başarılı olursa "Kaydettikten sonra" yerine Yeni'yi çalıştırır. Kaydet ya da Yeni gizliyse bu da gizlidir.`; Sil `Silme eylemi`, `Onay metni`, `Boşsa "Kayıt silinsin mi?" sorulur.` + liste `Alanlar seçili satırdan doldurulur.` / kart `Yeni kayıtta Sil gösterilmez.`; Düzenle `Hangi ekran`, `Nerede`, `Görüntüle aynı ekranı salt okunur açar; Düzenle gizlenince o da gizlenir.`, Gelişmiş `Hangi liste`, `Gönderilen bilgi`; Filtre `Odaklanacak alan`, `Filtre (Ctrl+F) bu alana odaklanır.`; Excel `Hangi liste`, `Görünen satırlar Excel olarak iner; "CSV olarak dışa aktar" menüdedir.`; Yazdır `Sayfayı yazdırır.`; Yenile `Sayfanın sorgularını yeniden çalıştırır. Ayarı yok.`; `⋯ Diğer menüsü` `Alt+İ`, boşken `Boş · menü çizilmez`; liste `Başlıkta kayıt sayısı`; alt not `Komutların yeri kabuk kuralıyla belirlenir: ana düğme solda, Sil en sağda. Danışman sırayı değiştirmez.`

- [ ] **Step 1: Write the failing tests**
  - `record page panel shows Komutlar rows in mockup order with keys` (`Yeni F2`, `Kaydet Ctrl+S`, …) and only one row open at a time
  - `eye hides a command and the summary reads "Çubukta gizli · kısayolu çalışmaz"`
  - `Yalnız yeni kayıtta writes the record-key condition; Koşula göre opens the rule builder`
  - `raw standard steps are listed read-only under Gelişmiş; catalog steps can be added and removed`
  - `Kaydet düğmesi section has no Sil row; Komutlar › Sil edits the delete action and confirm text`
  - `list page panel opens with nothing selected and shows Filtre, Excel and Başlıkta kayıt sayısı`
  - `no technical terms in the section` (`renderToString` çıktısında `actionBar`, `slot`, `{{` yok)
  - `new page dialog offers exactly Liste, Kayıt kartı, Belge, Serbest` (`Eski tasarımcı (kalıpsız)` yok)
  - `Şablonla başla still opens for an empty templateless page`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Aynı komut PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): sayfa panelinde Komutlar; yeni sayfa yalnız kalıpla`

## Görev 10 — belgeler

### Task 10: Durum, spec ve yordam

**Files:**
- Modify: `docs/phase-status.md` (en üste "5b-2 adım 1 — Komutlar + Kayıt kartına eşleme" bölümü: neler doğrulandı (testler), neler doğrulanmadı (canlı rapor yeniden çıkmadı, standart taşınmadı, Belge'de komut yok), beklenen sonuç "0 standart Kayıt kartına"; ana engel kayıt özeti)
- Modify: `docs/superpowers/specs/2026-11-27-kalip-buyutme-5b2-design.md` (başa durum satırı: `Durum: adım 1 planı yazıldı (2026-11-27, docs/superpowers/plans/2026-11-27-komutlar-kayit-karti-5b2a.md); uygulama sürüyor.`; uygulama bitince "PR #… birleşik"); §5.2'ye Karar 1 (biçimin yeri) ve Karar 6 (Belge) notu
- Modify: `docs/runbooks/page-template-migration.md` (neden listesi: kaldırılan ve eklenen nedenler, Görev 4'teki metinlerle)

- [ ] **Step 1:** Belgeleri yaz; iddialar yalnız yeşil testlere dayanır.
- [ ] **Step 2:** Birleşik dalda [kilitli] `dotnet test AIERP.slnx`; `frontend/erp-web` `npm test` + `npm run build`; `frontend/development-studio` `npm test` + `npm run build`. Yük kaynaklı zaman aşımı olan test tek başına yeniden.
- [ ] **Step 3: Commit** — `docs: 5b-2 adım 1 durumu`

### Sonraki PR (bu planda değil)

Canlı rapor (`--page-template-migration-report`, salt okunur, kullanıcı onayıyla) yeniden çıkar ve kullanıcıya gösterilir; taşınabilir standart çıkarsa: ScreenKey atlamasının "standardı kalıplı" koşuluna çevrilmesi, gömülü JSON'un dönüştürücü çıktısıyla değişmesi (`version` artar, önce/sonra eşdeğerlik testi), firma kopyalarının prova + onayla taşınması.
