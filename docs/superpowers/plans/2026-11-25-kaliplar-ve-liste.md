# Sayfa kalıpları, ortak kabuk ve Liste (alt proje 3) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sayfa tanımına `template` alanını eklemek ve ERP'de bunu ortak bir kabuk içinde çizmek. İlk kalıp olarak **Liste**'yi (basamak 1 ve 2) uçtan uca kurmak. Studio'da Liste için taslak 01'deki sekmesiz paneli sunmak.

**Architecture:**
- **Biçim yalnızca eklemeli genişler (§5.2-C).** Liste kalıbı bugünkü parçalarla saklanır: `dataTable`, `filterBar`, `metric`, `button`, `contextPanel`. Her bileşene kalıptaki yerini söyleyen bir `slot` özelliği eklenir. Kökte `template: { "name": "list" }` durur.
- **ERP çizicisi.** `template` taşıyan sayfalar için yeni bir dal açılır: ortak kabuk, Liste düzeni ve container query ile otomatik yerleşim. `template` taşımayan sayfalar bugünkü 12 kolonlu çizimle, birebir aynı kalır (§10).
- **Studio.** Kalıplı sayfalarda bileşen paneli §6.2'deki tek tip, sekmesiz kalıba geçer. Kalıpsız sayfalarda bugünkü sekmeli panel kalır. Tuval, 1. alt projedeki ERP çerçevesidir.

**Tech Stack:** .NET 10 minimal API (şema doğrulayıcı), xUnit; React + Vite + TypeScript, vitest (erp-web: jsdom ve `@testing-library` kalıbı; development-studio: `renderToString` ve saf fonksiyonlar).

**Spec:** `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md`: §5.2-C, §5.4, §6.1, §6.2 (panel kalıbı), §6.3, §6.5 (Liste maddeleri), §9, §10. Taslaklar: `docs/design-proposals/studio-sadelestirme/01-liste-paneli.html` (Liste paneli) ve `04-sayfa-kaliplari.html` (Liste kalıbı). İkisini kullanıcı onayladı. Ekranlar bu taslaklardan sapmamalı ([[design-approval-first]]).

## Kapsam

- **Bu planda:**
  - `template` biçimi ve ortak kabuk.
  - **Liste** kalıbı, basamak 1 (kalıp) ve 2 (kalıp + üst/alt ek alan).
  - Liste paneli ve sekmesiz panel kalıbının kendisi.
  - "Yeni ekran → önce kalıp seç" akışı.
  - Ekranlar listesinde her ekranın kalıbı ve basamağı.
- **Sonraki alt projelerde:**
  - Kayıt kartı, 3. basamak (serbest gövde) ve detay ekranı → 4. alt proje.
  - Öteki bileşenlerin yeni paneli → 5.
  - Canlı sayfaların kalıba taşınması → 5b.
  - Belge kalıbı → 6.
  - Rapor, Tanım, Pano ve Sihirbaz kalıpları → 4–6 arasında, ayrı planlarla.
  - 4. basamak (yazılımcı sayfası) → yazılımcı bileşenleriyle (2c/5).

## Taban dal

- Bu plan 1., 2a ve 2b alt projelerinin üstüne kurulur.
- **Üçü de master'a birleştiyse:** güncel `origin/master`'dan yeni bir dal aç (`claude/kaliplar-ve-liste`).
- **Birleşmediyse:**
  - Dalı `claude/studio-rol-yapisi`'den (PR #169) aç.
  - Üstüne `claude/yapi-tasi-katalogu-plan`'ı (2a, yerel dal) birleştir.
  - 2a ve 2b'nin ikisi de PlatformDB'ye migration ekliyor. Bu yüzden EF model anlık görüntüsünde (`PlatformDbContextModelSnapshot.cs`) çakışma beklenir.
  - **Çakışmayı uygulayıcı değil, yürütücü (controller) çözer:** iki tarafın da eklediği satırlar korunur. Sonra `dotnet ef migrations has-pending-model-changes` üç bağlam için de "değişiklik yok" demeli.
  - Bu birleştirme 1. görevden önce ayrı bir commit olarak yapılır.
- Bu planın kendisi migration eklemez.

## Global Constraints

- **Eski sayfalar değişmez.** `template` alanı olmayan sayfa, sistem standardı dahil, bugünkü gibi çizilir. Şema, Studio ve ERP'de mevcut davranış korunur (§10).
- **`template` biçimi:** `{ "name": "list" }`.
  - Bu planda kabul edilen tek ad `list`.
  - Başka bir ad ya da fazladan bir anahtar sunucuda reddedilir.
  - Basamak saklanmaz, hesaplanır: `above` ya da `below` yerinde bileşen varsa 2, yoksa 1.
- **`slot` değerleri:**

  | Değer | Ne olur |
  |---|---|
  | `indicators` | göstergeler; yalnız `metric` |
  | `filters` | yalnız `filterBar` |
  | `list` | tam olarak bir tane `dataTable` |
  | `actions` | listenin üstündeki `button`'lar |
  | `rowActions` | satır sonundaki `button`'lar |
  | `detail` | en fazla bir `contextPanel` |
  | `above`, `below` | ek alanlar |

  Kalıplı sayfada `slot`'u olmayan bileşen sunucuda reddedilir.
- **Kalıplı sayfada yasak olanlar:**
  - `width` ve `widthWhen` özellikleri.
  - `actionBar` bileşeni.
  - `spacer` ve `divider` bileşenleri.

  "Daralma kuralı" ve 3/4/6/8/9/12 genişlik seçimi kalıplı sayfada yoktur (§6.3).
- **Ortak kabuk (§6.1):** başlık ve konum satırı, işlem çubuğu ve alt bilgi. İşlem çubuğu kuralı:
  - `actions` yerindeki ilk düğme ana düğmedir ve en solda durur.
  - Arama kutusu ortada durur.
  - Sorgusu `delete` türünde olan düğme en sağda durur.
  - Sığmayan düğmeler "⋯" menüsüne girer, ana düğme her zaman görünür.
- **Liste yerleşimi (§6.1, §6.5):**
  - Başlıkta kayıt sayısı görünür.
  - Göstergeler listenin üstünde, sığdığı kadar yan yana dizilir.
  - Detay paneli sağda açılır, açıldığında liste kendiliğinden daralır.
  - Sayfalama altta durur.
  - Yerleşim kuralları:

    | Kendi kutusunun genişliği | Davranış |
    |---|---|
    | < 720 px | ilk 4 kolon görünür, satır eylemleri "⋯" menüsüne girer |
    | < 480 px | kart listesi: 1. kolon başlık, 2. ve 3. kolon alt satır, sayı kolonu sağda |

  - Tablo kendi kutusunda yatay kayar.
  - Veri gelene kadar iskelet görünür, sayfa zıplamaz.
  - Bunlar ekran genişliğine göre değil, **container query** ile kurulur.
- **Panel kalıbı (§6.2):**
  - Sırayla beş parça: Ad → *Ne gösterilsin?* → temel ayarlar → Eylemler → kapalı duran **Görünüm**.
  - Sekme yok, açılır pencere yok.
  - Teknik bilgi yeşil, "Yazılımcının hazırladığı" notuyla gösterilir.
- **Katalog gerçekleri (2a'da uygulandığı gibi):**
  - Öğenin kimliği `code`. `key` yalnız kolon bayrağıdır (`columns[].key`).
  - Eylem `target` değerleri: `row`, `page`, `bulk`.
  - Sayfa sorgusunun parametre adları ve türleri katalog öğesiyle birebir aynı olmalı.
  - Katalog listesi: `GET /api/custom-pages/catalog`.
- **Arayüz metinleri:**
  - Kullanıcıya görünen her metin Türkçe.
  - Kodda kalıp adı `pageTemplate` / `PageTemplate` olur. Studio'daki mevcut `templates` / `applyTemplate` / `templateId` bileşen ön ayarlarıdır; onlarla karıştırılmaz.
- **Dağıtım sırası:** platform-api ve erp-web önce, development-studio sonra.

## Kararlar

Karar 1'i kullanıcı 2026-11-25'te onayladı. Ötekiler benim kararlarım; kullanıcı düzeltebilir.

1. **Danışmanın katalog başvurusu kaydedebilmesi (yetki değişikliği; kullanıcı onayladı).**
   - **Bugün:** 2a'nın geçici kuralına göre, SQL'e dayanan bir veri kaynağına ya da *herhangi bir* katalog eylemine başvuran sayfayı yalnız doğrulanmış TenantAdmin kaydedebiliyor.
   - **Sonuç:** Liste panelinin asıl kullanıcısı olan Danışman, yazılımcının hazırladığı kaynak ve eylemleri seçtiği anda taslak kaydı 403 verir. Tuval de güncellenmez.
   - **Önerim:**
     - Katalog başvurusu, veri kaynağı da eylem de olsa, sayfa yazma iznine sahip her kullanıcıya açılsın.
     - Satır içi SQL kuralı TenantAdmin'de kalsın.
     - Gerekçe: katalog sürümünü yalnız TenantAdmin etkinleştirebiliyor ve SQL her çalıştırmada yeniden doğrulanıyor. Sayfa yalnız kodu taşıyor, SQL taşımıyor.
   - **Görev 1** bunu uygular.
2. **Onay metni ve kolon adları tasarım anında kopyalanır.**
   - Panel, katalog eylemini seçince onun `confirm.text`'ini düğmenin `confirmText`'ine, kolon etiketlerini de `columnLabels`'a yazar.
   - Katalog sonradan değişirse sayfa eski metni gösterir. Danışman bunu panelden düzeltebilir.
   - Sunucuda çözümlenmiş sayfaya katalog bilgisi eklenmez (YAGNI).
3. **Arama:**
   - Veri kaynağında `q` adlı `text` parametresi varsa, arama kutusu bu parametreye bağlanır (sunucu araması, `{{<filtre>.q}}`, mevcut `filterBar` yolu).
   - Yoksa arama tablonun kendi istemci aramasıdır.
4. **Parametreli kaynaklar:**
   - Bu planda Liste için yalnız iki tür kaynak kullanılabilir: parametresiz olanlar ve yalnız `q` parametresi olanlar.
   - Başka parametre isteyen kaynak panelde seçilemez görünür: "Bu kaynak ek bilgi istiyor; Listede henüz kullanılamaz."
   - Sayfalama istemci tarafındadır.
5. **Satır eylemi bağlama:**
   - Eylem sorgusunun her parametresi, aynı adlı liste kolonuna `{{<liste>.seciliSatir.<kolon>}}` ile bağlanır.
   - Eşleşmeyen parametresi olan eylem seçilemez: "Bu eylemin <ad> bilgisi listede yok."
   - `target: bulk` eylemleri yalnız `delete` türündeyse kullanılabilir; bunlar mevcut `bulkDeleteQuery` yolundan geçer.
6. **Satıra çift tıklama:**

   | Seçim | Ne olur |
   |---|---|
   | *Kartı aç* | Veri kaynağının `opens` değerine giden bir `button` (`actionType: "page"`) üretir ve `rowOpenAction` ile bağlanır. Parametre, `key: true` kolonudur. |
   | *Yan panelde göster* | `detail` yerine bir `contextPanel` koyar. |
   | *Hiçbir şey* | İkisini de kaldırır. |

   `opens` ya da anahtar kolon yoksa *Kartı aç* seçilemez.
7. **Yedek tuval.** 1. alt projedeki kopya çizici kalıpları çizemez. ERP tuvali kullanılamadığında kalıplı sayfa için tuval alanında "Bu ekran ERP önizlemesi açılınca görünür." yazar. Panel çalışmaya devam eder.

## Review Focus

1. **Kaydedildikten sonra katalogdan kaldırılan kod.**
   - Liste alanında katalog hatası görünür, kabuk ve öteki bileşenler çizilmeye devam eder.
   - Studio panelinde kaynak "Katalogda yok" olarak işaretlenir.
   - Test: Görev 4 ve Görev 8.
2. **Yetki.** Yönetici olmayan Danışman, SQL'e dayanan kaynak ya da eylem seçer. Karar 1 gereği kaydedilir; hiçbir durumda sessiz 403 olmaz. Test: Görev 1 ve Görev 8.
3. **Anahtar kolonu ya da `opens`'u olmayan kaynak.** *Kartı aç* seçilemez ve ERP'de çift tıklama hiçbir şey yapmaz. Test: Görev 8 ve Görev 4.
4. **Eski sayfa.** `template`'siz bir sayfa ve bir sistem standardı (`customers`) önceki çıktıyı birebir verir. Test: Görev 3.
5. **Çok kolonlu liste dar alanda.** 20 kolonluk listede 600 px'te 4 kolon görünür, 400 px'te kart listesi olur, satır eylemleri "⋯" menüsündedir. Test: Görev 5.

---

## PR A — biçim, sunucu ve ERP çizimi (Görev 1–5)

### Task 1: Şema — `template`, `slot` ve kalıp kuralları; katalog başvurusu yetkisi

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`
  - `RootKeysV2`
  - `Validate`
  - `SafePropsV2`
  - tür başına özellik tablosu
- Create: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateRules.cs`
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (`QueryPageWriteAllowedAsync`; Karar 1)
- Test:
  - `tests/IntegrationTests/TenantCustomPageSchemaListTemplateTests.cs`
  - `tests/IntegrationTests/TenantCustomPageCatalogWriteGateTests.cs`

**Interfaces:**
- Produces:
  - `static class PageTemplateRules`
    - `string? ValidateTemplate(JsonElement root, JsonElement components, JsonElement queries)`: hata metni döner, geçerliyse `null`.
    - `static readonly IReadOnlySet<string> Slots`
  - Yeni özellikler `SafePropsV2`'ye eklenir: `slot`, `hideOnMobile` (bool), `striped` (bool).
- Kurallar (`ValidateTemplate`):
  - `template` bir nesnedir ve tek anahtarı `name`'dir. Değeri `"list"`'tir.
  - Her bileşenin geçerli bir `slot`'u olmalı.
  - `list` yerinde tam bir `dataTable` olmalı. Onun `query`'si `kind: "read"` olan bir sayfa sorgusuna işaret etmeli.
  - `indicators` yalnız `metric`, `filters` yalnız `filterBar`, `detail` yalnız ve en fazla bir `contextPanel` alır.
  - `actions` ve `rowActions` yalnız `button` alır.
  - `width` ve `widthWhen` yasak; `actionBar`, `spacer` ve `divider` yasak.
  - Hata metinleri Türkçe ve tektir:
    - `"Kalıp yalnız \"list\" olabilir."`
    - `"Kalıplı sayfada her bileşenin bir yeri (slot) olmalı."`
    - `"Liste kalıbında tam bir liste (dataTable) olmalı."`
    - `"Kalıplı sayfada genişlik ayarı kullanılmaz."`
    - `"Kalıplı sayfada işlem çubuğu bileşeni kullanılmaz; düğmeler 'actions' yerine konur."`
- `template` yoksa `ValidateTemplate` çağrılmaz ve davranış tamamen bugünkü gibidir. `slot` özelliği kalıpsız sayfada da kabul edilir, ama yok sayılır.

- [ ] **Step 1: Write the failing tests** (`Accepted`/`Rejected` yardımcıları `TenantCustomPageSchemaListLookTests.cs`'teki gibi)
  - `List_template_minimal_page_is_accepted`: `template:{name:"list"}` ve `slot:"list"` taşıyan bir `dataTable`, `kind:"read"` sorguya bağlı.
  - `Unknown_template_name_is_rejected` (`"card"`).
  - `Extra_template_key_is_rejected` (`{name:"list", level:2}`).
  - `Component_without_slot_is_rejected_on_template_page`.
  - `Two_list_tables_are_rejected`.
  - `Width_is_rejected_on_template_page`; `ActionBar_is_rejected_on_template_page`.
  - `Metric_only_in_indicators`.
  - `Legacy_page_with_slot_prop_still_accepted_and_unchanged`: `template`'siz sayfada `slot` hata vermez.
  - `System_standard_envelope_with_template_is_accepted`: `SystemPageStandards` doğrulaması aynı yoldan geçer.
  - `Template_round_trips_through_draft_preview_publish_history_restore`: sayfa uçlarıyla. `definitionJson` içinde `template` her adımda korunur.
  - `Non_admin_can_save_page_referencing_catalog_action_and_sql_data_source` (200) ve `Non_admin_still_cannot_save_inline_sql` (403).
- [ ] **Step 2:** Run `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~ListTemplate|FullyQualifiedName~CatalogWriteGate"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - `RootKeysV2`'ye `template` eklenir; `Validate` içinde, `template` varsa `ValidateTemplate` çağrılır.
  - Karar 1 için `QueryPageWriteAllowedAsync` içinde katalog başvuruları "SQL taşıyan sorgu" sayılmaz. Satır içi `sql` kuralı aynı kalır.
  - `TenantCustomPageQueries.HasSqlQueries` ile Studio'nun `hasSqlQueries`'i aynı tanımı paylaşır. 2a'daki "bilerek sayıyor" notu güncellenir.
- [ ] **Step 4:** Tests PASS. Ayrıca `--filter "FullyQualifiedName~TenantCustomPage|FullyQualifiedName~SystemPage|FullyQualifiedName~Catalog"` → PASS. Derlemeler çok yavaşsa tek filtreli çalıştırma yeterli.
- [ ] **Step 5: Commit** — `feat(custom-pages): Liste kalıbı biçimi ve doğrulaması`

### Task 2: ERP — kalıp okuma ve ortak kabuk

**Files:**
- Create:
  - `frontend/erp-web/src/page-templates/pageTemplate.ts`
  - `frontend/erp-web/src/page-templates/PageShell.tsx`
  - `frontend/erp-web/src/page-templates/page-templates.css`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`
  - tanım ayrıştırma (`definitionJson` okunan yer)
  - `PageBody`'ye `pageTemplate` aktarımı
- Test: `frontend/erp-web/src/page-templates/PageShell.test.tsx`

**Interfaces:**
- Produces:
  - `type PageTemplate = { name: "list" }`
  - `readPageTemplate(definition: unknown): PageTemplate | null`: geçersiz ya da eksikse `null`, yani eski çizim.
  - `type ShellAction = { id: string; label: string; kind: "primary" | "normal" | "danger"; disabled?: boolean; disabledReason?: string; run: () => void }`
  - `<PageShell title crumbs count? actions: ShellAction[] search?: ReactNode footer?: ReactNode>{children}</PageShell>`
    - İşlem çubuğu: `primary` en solda, `search` ortada, `danger` en sağda, `normal`'lar aralarında.
    - Kendi genişliğine sığmayan `normal` ve `danger` düğmeler "⋯" menüsüne girer. `primary` hiç girmez.
  - `orderShellActions(actions: ShellAction[]): { left: ShellAction[]; right: ShellAction[] }` (saf fonksiyon)
- Kabuk, mevcut `list-page/` parçalarını kullanır: `ListPageHeader` başlık, kayıt sayısı ve konum satırı içindir, `ListFooter` alt bilgi içindir. Kabuk, eski `.tenant-custom-page-content` ızgarasının **dışında** çizilir. O ızgaranın `!important` medya kuralları kalıplı sayfaya dokunmaz.

- [ ] **Step 1: Write the failing tests**
  - `orderShellActions puts primary first and danger last`: girdi `[normal a, danger sil, primary yeni, normal b]`, çıktı `left=[yeni,a,b]`, `right=[sil]`.
  - `readPageTemplate returns null for missing or unknown template`.
  - `PageShell renders title, count, crumbs and footer`.
  - `PageShell never hides the primary action in the overflow menu`: dar kapsayıcı, jsdom'da `ResizeObserver` taklidiyle.
- [ ] **Step 2:** `cd frontend/erp-web && npx vitest run src/page-templates` → FAIL.
- [ ] **Step 3:** Implement. `TenantCustomPage` tanımı ayrıştırırken `readPageTemplate` çağırır. Sonuç `null` ise hiçbir şey değişmez.
- [ ] **Step 4:** PASS; `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): sayfa kalıbı okuma ve ortak kabuk`

### Task 3: ERP — eski çizimin değişmediğini sabitle

> **Sıra:** Bu görev **Görev 2'den önce** uygulanır. Anlık görüntüler, ERP çizicisi henüz değişmemişken üretilmeli. Görev 2 ve 4 bunları bozmadan geçmelidir.

**Files:**
- Test: `frontend/erp-web/src/page-templates/legacyUnchanged.test.tsx`

**Interfaces:**
- Consumes: yok (mevcut `TenantCustomPage`).

- [ ] **Step 1: Write the tests**
  - `legacy custom page renders the same markup as before`: kalıpsız bir v2 tanımı (bir `actionBar`, bir `dataTable`, bir `metric`). Çıktı, vitest anlık görüntüsüyle (`toMatchSnapshot`) sabitlenir.
  - `customers system standard renders unchanged`: `customers.json`'un `definition`'ı ile aynı yöntem.
  - `page with slot props but no template renders as legacy`.
- [ ] **Step 2:** Run `npx vitest run src/page-templates/legacyUnchanged`. Expected: PASS (bu görev davranışı sabitler).
- [ ] **Step 3: Commit** — `test(erp): kalıpsız sayfaların çıktısı sabitlendi`

### Task 4: ERP — Liste kalıbının çizimi

**Files:**
- Create:
  - `frontend/erp-web/src/page-templates/ListTemplate.tsx`
  - `frontend/erp-web/src/page-templates/listTemplateModel.ts`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (`template` geçerliyse `PageBody` yerine `ListTemplate`)
- Test:
  - `frontend/erp-web/src/page-templates/ListTemplate.test.tsx`
  - `frontend/erp-web/src/page-templates/listTemplateModel.test.ts`

**Interfaces:**
- Consumes: Task 2 (`PageShell`, `ShellAction`, `PageTemplate`).
- Produces:
  - `type ListLayout = { indicators: Component[]; filters: Component | null; list: Component; actions: Component[]; rowActions: Component[]; detail: Component | null; above: Component[]; below: Component[] }`
  - `layoutListTemplate(components: Component[]): ListLayout`: `slot`'a göre ayırır, kayıt sırasını korur.
  - `templateLevel(layout: ListLayout): 1 | 2`
- Çizim:
  - Bileşenler mevcut `renderComponent` ile çizilir. `<Anchored>` işaretleri, 1. alt projedeki tuval seçimi için korunur.
  - Düzen: `PageShell` içinde `above` → göstergeler → süzgeçler → [liste | detay paneli] → `below`.
  - `actions` düğmeleri kabuğun işlem çubuğuna `ShellAction` olarak geçer: ilk düğme `primary`, sorgusu `delete` olan `danger`.
  - Süzgecin arama alanı kabuğun ortasına taşınır.
  - Detay paneli, satır seçilince sağda açılır. Liste esnek kutu olduğu için kendiliğinden daralır.
  - Kayıt sayısı tablonun satır sayısıdır.
  - Katalog hatası (`catalogError`) liste alanında gösterilir, öteki parçalar çizilmeye devam eder.

- [ ] **Step 1: Write the failing tests** (`TenantCustomPageListLook.test.tsx`'teki `erpApi` taklidiyle)
  - `layoutListTemplate groups by slot and keeps order`.
  - `templateLevel is 2 when above or below has components`.
  - `list template renders shell with primary action left and delete right`.
  - `selecting a row opens the detail panel on the right`.
  - `catalog error shows in the list area while indicators still render` (Review Focus 1).
  - `double click with no rowOpenAction does nothing` (Review Focus 3).
  - `anchors are emitted for every slotted component`.
- [ ] **Step 2:** `npx vitest run src/page-templates` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` ve `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): Liste kalıbı çizimi`

### Task 5: ERP — Liste için otomatik yerleşim

**Files:**
- Modify:
  - `frontend/erp-web/src/page-templates/page-templates.css`
  - `ListTemplate.tsx`
- Create: `frontend/erp-web/src/page-templates/listResponsive.ts`
- Test: `frontend/erp-web/src/page-templates/listResponsive.test.ts`

**Interfaces:**
- Produces:
  - `listMode(width: number): "full" | "narrow" | "cards"`: eşikler 720 ve 480, Global Constraints'teki gibi.
  - `cardFields(columns: string[], numeric: Set<string>): { title: string; sub: string[]; amount: string | null }`: 1. kolon başlık, 2. ve 3. kolon alt satır, ilk sayı kolonu sağda.
- CSS:
  - Liste kutusu `container-type: inline-size` taşır; kurallar `@container` ile yazılır.
  - `narrow` kipte 5. kolondan sonrası gizlenir, satır eylemleri "⋯" menüsüne girer.
  - `cards` kipte satırlar kart olarak çizilir.
  - Göstergeler `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` ile dizilir.
  - Yüklemede iskelet, liste yüksekliğini korur.
  - `hideOnMobile: true` olan bileşen `cards` kipte gizlenir.
  - `striped: true` çizgili satır demektir.
- JS:
  - Kip, `ResizeObserver` ile `listMode`'dan hesaplanır. CSS'teki `@container` ile aynı eşikleri kullanır.
  - "⋯" menüsü ve kart çizimi bunun için gerekir.

- [ ] **Step 1: Write the failing tests**
  - `listMode thresholds`: 721 → full, 600 → narrow, 400 → cards.
  - `cardFields picks title, two sub fields and first numeric`.
  - `twenty columns at 600px show four and move row actions to menu` (Review Focus 5; jsdom, `ResizeObserver` taklidi).
  - `cards mode at 400px`.
  - `hideOnMobile hides the component in cards mode`.
- [ ] **Step 2:** `npx vitest run src/page-templates/listResponsive` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): Liste kalıbında kutu genişliğine göre yerleşim`

**PR A burada açılır.** Elle yazılmış bir JSON ile doğrulanabilir: Görev 9'daki tarayıcı adımının ERP kısmı.

---

## PR B — Studio (Görev 6–9)

### Task 6: Studio — `template`'in korunması, "önce kalıp seç" ve Ekranlar'da kalıp

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`
  - `PageDefinition`
  - `emptyDefinition`
  - `normalizeDefinition`
  - `startNew` / `createFromDialog`
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/NewPageDialog.tsx`
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/pageTemplates.ts`
- Modify: `frontend/development-studio/src/platform-tools/erp-src/pageCatalogModel.ts` ve sayfa kataloğu tablosu (`LowCodeDesignerPage.tsx`)
- Test:
  - `page-designer/pageTemplates.test.ts`
  - `pageCatalogModel.test.tsx` (genişletilir)
  - `designerPersistence` testi (genişletilir)

**Interfaces:**
- Produces:
  - `type PageTemplate = { name: "list" }`
  - `PAGE_TEMPLATE_CHOICES = [{ id: "list", label: "Liste", description: "Kayıtları aramak, süzmek ve seçmek için." }, { id: "free", label: "Serbest (bugünkü tasarımcı)", description: "Kalıpsız sayfa." }]`
  - `newListTemplateDefinition(): PageDefinition` döner. Tanım:
    - `{ schemaVersion: 2, template: { name: "list" }, queries: [], components: [{ id: "liste", type: "dataTable", props: { slot: "list" } }] }`
  - `templateLabel(definition): "Liste" | "Kalıpsız"`
  - `templateLevel(definition): 1 | 2 | null`
- Davranış:
  - `normalizeDefinition`, geçerli bir `template`'i korur.
  - Yeni sayfa penceresinde ilk adım kalıp seçimidir:
    - **Liste** → `newListTemplateDefinition`.
    - **Serbest** → bugünkü bileşen ön ayarları (`templates`) adımı.
  - Ekranlar listesinde (sayfa kataloğu) her satırda kalıp ve basamak görünür: "Liste · 1. basamak", "Kalıpsız".
  - Listenin üstüne kalıp süzgeci gelir: Tümü / Liste / Kalıpsız. Taslak 07'deki Kayıt kartı, Belge ve Rapor süzgeçleri, o kalıplar gelince eklenir.

- [ ] **Step 1: Write the failing tests**
  - `normalizeDefinition keeps template`
  - `wireDefinition sends template`
  - `newListTemplateDefinition shape`
  - `templateLevel 2 with below component`
  - `catalog row shows Liste · 1. basamak`
  - `legacy row shows Kalıpsız`
  - `new page dialog offers Liste first`
- [ ] **Step 2:** `cd frontend/development-studio && npx vitest run src/platform-tools/erp-src/page-designer/pageTemplates src/platform-tools/erp-src/pageCatalogModel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): kalıplı yeni sayfa ve Ekranlar'da kalıp`

### Task 7: Studio — katalog istemcisi ve tek tip panel kabuğu

**Files:**
- Create:
  - `frontend/development-studio/src/platform-tools/erp-src/page-designer/catalogClient.ts`
  - `page-designer/panel/ComponentPanel.tsx`
  - `page-designer/panel/component-panel.css`
- Test:
  - `page-designer/catalogClient.test.ts`
  - `page-designer/panel/ComponentPanel.test.tsx`

**Interfaces:**
- Produces:
  - `type CatalogColumn = { code: string; label: string; type: string; key: boolean }`
  - `type CatalogDataSource = { code: string; label: string; source: "sql" | "erpOperation"; erpOperation: string | null; parameters: { name: string; type: string }[]; columns: CatalogColumn[]; opens: string | null }`
  - `type CatalogAction = { code: string; label: string; kind: "insert" | "update" | "delete"; target: "row" | "page" | "bulk"; source: "sql" | "erpOperation"; erpOperation: string | null; parameters: { name: string; type: string }[]; confirmText: string | null }`
  - `type ActiveCatalog = { version: string; dataSources: CatalogDataSource[]; actions: CatalogAction[] }`
  - `loadCatalog(token: string): Promise<ActiveCatalog | null>`
    - `GET /api/custom-pages/catalog`.
    - 404 ya da etkin sürüm yoksa `null`; öteki hatalar fırlatılır.
    - Alan adları 2a yanıtıyla birebir aynıdır; uygulayıcı `src/Hosts/AIERP.Api/Catalog/TenantCatalogEndpoints.cs`'teki `DataSourceView` / `ActionView`'dan doğrular.
  - `<ComponentPanel name onRename what basics actions appearance />`
    - Beş parça bu sırayla çizilir.
    - `appearance` varsayılan olarak kapalı bir `<details>` içindedir: "Görünüm".
    - Sekme ve açılır pencere yoktur.
  - `<ProvidedByDeveloper>{text}</ProvidedByDeveloper>`: yeşil not, metni "Yazılımcının hazırladığı · …".
  - `<LegacySettings props={Record<string, unknown>} known={Set<string>} />`: panelin karşılamadığı özellikleri salt okunur listeler. Kayıtta bunlar korunur (§5.2).

- [ ] **Step 1: Write the failing tests**
  - `ComponentPanel renders five parts in order and Görünüm collapsed`
  - `ComponentPanel has no tablist role`
  - `loadCatalog maps response and returns null on 404`
  - `LegacySettings lists unknown props only`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel src/platform-tools/erp-src/page-designer/catalogClient` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(studio): katalog istemcisi ve tek tip bileşen paneli`

### Task 8: Studio — Liste paneli ve tasarımcıya bağlanması

**Files:**
- Create:
  - `page-designer/panel/ListPanel.tsx`
  - `page-designer/panel/listPanelModel.ts`
- Modify: `CustomPagesPage.tsx`
  - kalıplı sayfada inspector yerine `ComponentPanel` / `ListPanel`
  - ek alan ekleme
  - yedek tuval mesajı
- Test:
  - `page-designer/panel/listPanelModel.test.ts`
  - `page-designer/panel/ListPanel.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`PageTemplate`, `templateLevel`), Task 7 (`ActiveCatalog`, `ComponentPanel`, `ProvidedByDeveloper`, `LegacySettings`).
- Produces. `listPanelModel.ts` içindeki saf fonksiyonların hepsi yeni bir `PageDefinition` döner; girdiyi değiştirmez.
  - `dataSourceUsable(ds: CatalogDataSource, isTenantAdmin: boolean): { usable: true } | { usable: false; reason: string }`
    - Karar 1 gereği `isTenantAdmin` yalnız satır içi SQL için anlamlıdır; katalog kaynakları için yok sayılır.
    - Karar 4 kuralı uygulanır.
    - Metinler Kararlar bölümündeki gibidir.
  - `chooseDataSource(def: PageDefinition, listId: string, ds: CatalogDataSource): PageDefinition`
    - `kind:"read"` olan bir `{ id, name, kind, dataSource: ds.code, parameters }` sorgusu ekler ya da günceller.
    - Liste tablosunun `query`'sini ona bağlar.
    - `columns` olarak ilk 6 kolonu, `columnLabels` olarak katalog etiketlerini yazar.
    - Kaynakta `q` varsa `filters` yerine bir `filterBar` (`search: true`, `searchParam: "q"`) ekler.
  - `actionUsable(action: CatalogAction, listColumns: string[]): { usable: true } | { usable: false; reason: string }` (Karar 5)
  - `addListAction(def, listId, action: CatalogAction, place: "above" | "row"): PageDefinition`
    - Bir eylem sorgusu ve bir `button` (`actionType: "query"`, `queryId`, `confirmEnabled`, `confirmText` katalogdan, `slot: "actions" | "rowActions"`) ekler.
    - `row` için düğmeyi liste tablosunun `rowActions`'ına da yazar.
    - `bulk` + `delete` için `bulkDeleteQuery`'yi kullanır.
  - `setRowDoubleClick(def, listId, choice: "card" | "panel" | "none", ds: CatalogDataSource): PageDefinition` (Karar 6)
  - `setColumns(def, listId, columns: string[], labels: Record<string, string>): PageDefinition` (sıra = önem sırası)
  - `missingCatalogCodes(def, catalog: ActiveCatalog): string[]` (Review Focus 1)
- Panel (taslak 01, sırasıyla):
  1. *Ne listelensin?* Katalog kaynakları listelenir, kullanılamayanlar gerekçesiyle soluk görünür. Altında yeşil not ve kayıt sayısı yer alır.
  2. **Kolonlar:** işaretlenir, sürüklenerek sıralanır, başlık değiştirilir.
  3. Arama kutusu.
  4. Sayfa başına: 10 / 25 / 50 / 100 (`pageSize`).
  5. *Satıra çift tıklayınca*: Kartı aç / Yan panelde göster / Hiçbir şey yapma.
  6. **Kullanıcı araçları:** Kolon filtreleri, Kolon seçici, Pivot, Dışa aktar (mevcut `show*` özellikleri). Altında şu not durur: "“Dışa aktar” açıkken kullanıcı Excel ya da CSV seçebilir, sadece seçili satırları da aktarabilir."
  7. **Küçük ekranlarda:** taslaktaki iki açıklama satırı ve "Mobilde bu ızgarayı gizle" (`hideOnMobile`).
  8. **Eylemler:** *Listenin üstünde* ve *Her satırın sonunda*. Altında: "Bu eylemleri yazılımcı hazırlar, sen sadece hangilerinin görüneceğini seçersin."
  9. **Görünüm** (kapalı):
     - Satır yüksekliği Sıkı / Normal / Rahat (`density`).
     - Çizgili satırlar (`striped`).
     - Liste boşken yazılacak (`emptyText`).
     - Ne zaman görünsün (`visibleWhen`).
  - En altta "Aradığın alan ya da liste yok mu?" ve "Yazılımcıdan iste →" bağlantısı. Bağlantı 2b'deki yeni talep penceresini açar.
- Tasarımcı:
  - Kalıplı sayfada bileşen seçilince `ComponentPanel` açılır. Liste için `ListPanel`, öteki bileşenler için `ComponentPanel` içinde bugünkü ayar alanları kullanılır; yeni panelleri 5. alt projede gelir.
  - Kalıpsız sayfada inspector bugünkü gibidir.
  - Kalıplı sayfada "＋ Ekle" bileşeni `below` yerine koyar. Panelin Ad bölümünün altında "Yeri: Listenin üstü / altı" seçimi vardır.
  - Yedek tuval mesajı Karar 7'deki gibidir.

- [ ] **Step 1: Write the failing tests**
  - `dataSourceUsable rejects sources with non-q parameters`
  - `dataSourceUsable SQL source for non-admin` (Karar 1 gereği `usable: true`)
  - `chooseDataSource writes read query bound to catalog code and first six columns`
  - `chooseDataSource adds filterBar with searchParam q when source has q`
  - `actionUsable rejects action whose parameter has no matching column`
  - `addListAction row binds parameters to seciliSatir and appends to rowActions`
  - `addListAction copies confirm text`
  - `setRowDoubleClick card creates page button with key column param and sets rowOpenAction`
  - `setRowDoubleClick card unavailable without opens or key` (Review Focus 3)
  - `setRowDoubleClick panel adds contextPanel in detail slot`
  - `missingCatalogCodes lists removed codes` (Review Focus 1)
  - `ListPanel renders sections in mockup order without tabs`
  - `functions never mutate input`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Liste paneli`

### Task 9: Uçtan uca doğrulama ve belgeler

**Files:**
- Modify:
  - `docs/phase-status.md` (3. alt proje girdisi: doğrulanan / doğrulanmayan / kalan)
  - spec §10 (bu planın Kararlar 1–7 özeti)

- [ ] **Step 1:** Run `dotnet test AIERP.slnx`. Then run `npm test` and `npm run build` in both frontends.
  - Bu makinede paralel oturumlar varken zaman aşımına düşen entegrasyon sınıflarını tek başına yeniden çalıştır.
  - Sonuçları belgeye yaz.
- [ ] **Step 2: Tarayıcıda üç genişlik (§9; zorunlu).**
  - Gerçek arka uç ya da Docker Compose yığını kullanılır. Yoksa 2b'deki gibi sahte arka uçla (`/api/custom-pages/catalog`, önizleme ve sorgu uçları) yapılır, ve bu belgede açıkça yazılır.
  - Danışman olarak yeni bir **Liste** ekranı aç. Kaynak seç, kolonları sırala, bir satır eylemi ve *Kartı aç* ekle.
  - Aynı taslağı Studio tuvalinde ve ERP'de 1280, 768 ve 375 px'te aç. Görüntüleri karşılaştır; tuval ile ERP aynı olmalı.
  - Taslak 01 ve 04 ile karşılaştır.
  - Bulunan görünüm sorunlarını aynı turda düzelt ve yeniden bak.
- [ ] **Step 3:** Kalıpsız bir eski sayfayı ve `customers` sistem sayfasını ERP'de aç; görünüş değişmemiş olmalı.
- [ ] **Step 4: Commit** — `docs: kalıplar ve Liste (alt proje 3) durumu`

**PR B burada açılır.**
