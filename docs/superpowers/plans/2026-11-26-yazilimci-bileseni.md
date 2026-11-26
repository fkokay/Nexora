# Yazılımcı bileşeni (katalogda bileşen türü) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Taslak onayı:** `10-yazilimci-bileseni.html` 2026-11-26'da çizildi ve kullanıcı onayladı ([[design-approval-first]]); Görev 1 tamam. Ekranlar bu taslaktan sapmamalı. Danışman paneli onaylı taslak 03'teki `yazilimci` panelidir; taslak 10 yazılımcının bileşen formunu, önizlemesini ve ERP'deki görünüşü gösterir.

**Goal:** Yazılımcının firma modülünde bir **bileşen** (CSS + JavaScript + ayar şeması) yazıp katalog sürümüyle yayınlaması; danışmanın bu bileşeni paletten "Yazılımcı bileşeni" olarak seçip yalnız yazılımcının tanımladığı ayarları doldurması; ERP'nin bileşeni bugünkü yalıtılmış kod çerçevesinde çizmesi.

**Architecture:**
- **Katalog yeni bir öğe türü kazanır: `components`.** Bileşen, firma modülünde `bilesenler/<kod>/` klasöründe durur (`bilesen.json`, `stil.css`, `kod.js`). Studio'nun yayın adımı veri kaynakları ve eylemler gibi bunları da pakete gömer; sunucu paketi doğrular ve sürümler (bugünkü yayın / etkinleştirme akışı değişmez).
- **Sayfa yalnız başvuru taşır.** Bugünkü `code` bileşenine iki yeni özellik: `catalogComponent` (bileşen kodu) ve `componentSettings` (ayar değerleri). Sayfada CSS/JS yoktur.
- **Sunucu başvuruyu çözer.** Veri kaynakları gibi (`TenantCustomPageQueries.ResolveCatalogReferences`), sayfa okunurken `catalogComponent` etkin katalogdaki bileşenin `css` ve `javascript`'ine çözülür. ERP'nin `CodeFrame`'i ve köprüsü değişmeden çalışır; ayarlar köprünün `get("ayarlar.<ad>")` yoluyla okunur.

**Tech Stack:** .NET 10 minimal API, xUnit; React + Vite + TypeScript, vitest (erp-web: jsdom; development-studio: `renderToString` ve saf fonksiyonlar).

**Spec:**
- `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md`: §6.2 ("Yazılımcı bileşeni | `code` | Katalogdaki bileşen ve onun tanımladığı ayarlar"), §6.7 (firma modülünde `bilesenler/<ad>/`: "bugünkü kod alanı + ayar şeması"), §6.1 (4. basamak), §10 (roller sunucuda zorlanır; JSON ve SQL yapı taşları derleme gerektirmez).
- Taslaklar: `03-bilesenler.html` (`yazilimci` paneli, onaylı), `06-yazilimci-ekrani.html` (yazılımcı ekranı), `10-yazilimci-bileseni.html` (onaylı, 2026-11-26).

## Kapsam (benim kararım; kullanıcı düzeltebilir)

- **Bu planda:**
  - Katalog şemasında `components`, doğrulama ve listeleme.
  - Yazılımcı ekranında (katalog çalışma alanı, `studio-projects/catalog`) "Bileşenler" grubu: bileşen formu, CSS/JS düzenleyicileri, örnek ayarlarla **Önizle**, yayına dahil etme.
  - Sayfa biçiminde `catalogComponent` + `componentSettings`; sunucuda doğrulama ve çözüm.
  - ERP'de ayarların köprüden okunması.
  - Danışman paneli (taslak 03) ve paletin "Yazılımcı bileşeni"ni Liste'de ek alanlarda, Kayıt kartının ek alanlarında ve serbest gövdede kullanılabilir yapması.
- **Bu planda yok:**
  - Rust/WASM derlemesi: bileşenler tarayıcıda çalışan JS'dir (§10: JSON ve SQL derlemesizdir; bileşen de derlemesiz).
  - 4. basamak "yazılımcı sayfası" ayrı kalıp olarak: serbest gövdede tek bir tam genişlik bileşenle aynı sonuç alınır; ayrı kalıp sonraya.
  - Bileşenin kendi veri kaynağı/eylem tanımlaması: bileşen sayfadaki sorguları ve ERP işlemlerini bugünkü köprüyle (`runQuery`, `callOperation`) kullanır.
  - Harici kaynak (CDN, font, görsel URL'si) yükleme: bugünkü kod alanının yasakları aynen geçerli.

## Taban dal

- Dal: `claude/yazilimci-bileseni`, güncel `origin/master`'dan (5c birleşik, `7c6afc31`).
- Belge kuralları PR'ları (#180, #182) birleşirse `origin/master` bu dala alınır; `TenantCustomPageSchema.cs`, `consultantPalette.ts` ve `TemplateInspector.tsx` çakışabilir.
- Migration yok: katalog paketi bugünkü sürüm tablosunda JSON olarak durur.

## Global Constraints

- **Eski sayfalar değişmez.** `catalogComponent` taşımayan `code` bileşeni bugünkü gibi kendi CSS/JS'iyle çizilir; satır içi kod yazma kuralı (yalnız doğrulanmış TenantAdmin) aynen kalır.
- **Katalog bileşeni biçimi** (pakette, `components` dizisinde):

  | Anahtar | Kural |
  |---|---|
  | `code` | `^[a-z][a-zA-Z0-9]{0,39}$`, katalogda tekil (veri kaynağı ve eylem kodlarıyla birlikte) |
  | `label` | 1–80 karakter |
  | `description` | isteğe bağlı, en çok 200 karakter |
  | `css` | en çok 4000 karakter, harici kaynak yok (bugünkü `HasExternalCss` kuralı) |
  | `javascript` | en çok 20000 karakter (bugünkü v2 sınırı) |
  | `height` | isteğe bağlı 80–1200, varsayılan 240 |
  | `settings` | 0–10 ayar |

  Ayar: `{ "name": "^[a-z][a-zA-Z0-9]{0,31}$", "label": 1–60, "type": "text" | "number" | "bool" | "choice", "options": [1–20 metin, yalnız choice], "default": türüne uygun, isteğe bağlı }`. Bilinmeyen anahtar reddedilir. En çok 100 bileşen.
- **Modül dosyaları:** `modules/<firma>/bilesenler/<kod>/bilesen.json` (yukarıdaki biçim, `css`/`javascript` olmadan), `stil.css`, `kod.js`. Klasör adı = `code`. Yayın adımı ikisini `css` ve `javascript` olarak gömer.
- **Sayfa biçimi:** `code` bileşeninde (yalnız `schemaVersion: 2`):
  - `catalogComponent`: katalog bileşen kodu.
  - `componentSettings`: `{ "<ad>": metin | sayı | bool }`, yalnız bileşenin tanımladığı adlar, türüne uygun, choice değeri seçeneklerden biri.
  - `catalogComponent` varken `css` ve `javascript` yasak.
  - Kaydetme izni: sayfa yazma izni yeter (alt proje 3, Karar 1: katalog başvurusu danışmana açık); satır içi kod kuralı etkilenmez.
- **Çözüm:** sayfa okunurken (önizleme ve yayın dahil) etkin katalogda bileşen varsa `css`, `javascript` ve `height` sayfaya çözülür, `componentSettings` olduğu gibi kalır. Bileşen katalogda yoksa ERP o kutuda `"Bu bileşen katalogda yok."` gösterir, sayfanın geri kalanı çizilir.
- **Köprü:** `get("ayarlar.<ad>")` ayar değerini, yoksa bileşenin `default`'unu döner. Başka yeni köprü isteği yok.
- **Hata metinleri** (sunucu, Türkçe):
  - `"Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı."`
  - `"Katalog bileşeninin kodu ve JavaScript'i olmalı."`
  - `"Katalog bileşeni en fazla 10 ayar tanımlayabilir."`
  - `"Bileşen ayarı '{ad}' bileşende tanımlı değil."`
  - `"Bileşen ayarı '{ad}' için değer türü uygun değil."`
  - `"Katalogdan seçilen bileşende kod (css, javascript) yazılmaz."`
  - `"Seçilen bileşen etkin katalogda yok."` (kayıtta)
- **Danışman panelinde teknik terim yok** (§3): kod adı, CSS, JavaScript, `ayarlar.` görünmez. Yazılımcının yazdığı ayar etiketleri gösterilir.
- **Roller (§10):** bileşen dosyası yazma ve yayınlama yalnız Yazılımcı (bugünkü katalog yazılımcı erişimi, `CatalogDeveloperAccess`) ve etkinleştirme yalnız TenantAdmin (bugünkü kural).
- **Studio testleri CI'da koşmaz:** her Studio görevinde yerelde odaklı testler ve `npm run build`; tam `npm test` birleşik dalda bir kez.
- **Dağıtım sırası:** platform-api ve erp-web önce, development-studio sonra.

## Kararlar (benim kararlarım; kullanıcı düzeltebilir)

1. **Bileşen türü `code` bileşeninin üstüne kurulur.** Yeni bir çizim yolu yok; güvenlik (opak kökenli sandbox, belirteç yok, hız sınırı) bugünkü `CodeFrame`'den gelir.
2. **Kod sayfaya kopyalanmaz, okunurken çözülür.** Yazılımcı yeni sürüm yayınlayıp etkinleştirince bütün sayfalar yeni kodu kullanır; danışmanın sayfası değişmez.
3. **Ayar türleri dört:** metin, sayı, evet/hayır, seçim. Danışman panelinde sırasıyla metin kutusu, sayı kutusu, anahtar ve düğme grubu (≤4 seçenek) ya da açılır liste.
4. **Önizle (yazılımcı ekranı):** bileşen, örnek ayar değerleriyle (varsayılanlar) aynı `CodeFrame` mantığının Studio eşinde çalışır; köprü istekleri boş/örnek yanıt döner (`get` → ayarlar ve boş kapsam, `runQuery`/`callOperation` → "Önizlemede sayfa verisi yok."). Firma verisine dokunmaz.
5. **Palet:** "Yazılımcı bileşeni" etkin katalogda en az bir bileşen varsa kullanılabilir; yoksa soluk ve `"Henüz yayınlanmış bir yazılımcı bileşeni yok."`. Liste'de ve Kayıt kartında ek alana, serbest gövdede seçili bölüme eklenir.
6. **Yükseklik:** bileşenin `height`'ı varsayılandır; bileşen köprünün `setHeight`'ı ile kendini büyütebilir (bugünkü sınır 2000). Danışman panelinde yükseklik ayarı yok.

## Review Focus

1. **Katalogdan kaldırılan bileşen.** Sayfa kaydedilmiş, bileşen yeni sürümde yok: ERP o kutuda "Bu bileşen katalogda yok." gösterir, sayfa çizilir; Studio panelinde "Katalogda yok" ve bileşen seçimi boş. Test: Görev 3, 4, 6.
2. **Ayarı kaldırılan ya da türü değişen bileşen.** Sayfadaki eski ayar değeri ERP'de görmezden gelinir (varsayılan kullanılır), kayıt yeniden yapılınca panel eski değeri temizler; kayıt hata vermez. Test: Görev 3 ve 6.
3. **Kod enjeksiyonu.** Danışman `componentSettings`'e metin yazar; bu metin yalnız köprüden değer olarak gelir, CSS/JS'e karışmaz. `catalogComponent` ile birlikte `css`/`javascript` gönderilirse sunucu reddeder. Test: Görev 3.
4. **Önizleme yalıtımı.** Yazılımcı ekranındaki Önizle firma verisine istek atmaz, belirteç görmez. Test: Görev 5.
5. **Eski kod bileşeni.** `catalogComponent`'siz `code` bileşeni ve onu taşıyan sistem standartları önceki çıktıyı verir; satır içi kodu TenantAdmin olmayan hâlâ kaydedemez. Test: Görev 3 ve 4.

---

## Görev 1 — taslak (controller yapar)

### Task 1: Taslak `10-yazilimci-bileseni.html` ve onay

**Files:**
- Create: `docs/design-proposals/studio-sadelestirme/10-yazilimci-bileseni.html` (06'nın yazılımcı ekranı dili)

- [x] **Step 1:** Taslağı çiz:
  - Yazılımcı ekranında sol listede "Bileşenler" grubu.
  - Bileşen formu: Kod, Ad, Açıklama, Yükseklik, Ayarlar tablosu (ad, etiket, tür, seçenekler, varsayılan; ekle/sil/sırala), CSS ve JavaScript düzenleyicileri (sekmesiz, alt alta), "Dosyalar: bilesen.json · stil.css · kod.js" notu.
  - Önizle: sağda örnek ayar değerleri ve çerçevede bileşen; "Önizlemede sayfa verisi yok." notu.
  - Sürüm yayınla penceresinde bileşen sayısı.
  - ERP'de bileşenin görünüşü ve "Bu bileşen katalogda yok." kutusu.
  - Danışman paneli: taslak 03'teki `yazilimci` paneline bağlantı.
- [x] **Step 2:** Tarayıcıda etkileşimleri hatasız aç.
- [x] **Step 3:** Kullanıcıya göster, onay al; değişirse plan da güncellenir.
- [x] **Step 4: Commit** — `docs: yazılımcı bileşeni taslağı`

## PR A — sunucu ve ERP (Görev 2–4)

### Task 2: Katalog şemasında `components`

**Files:**
- Modify: `src/Hosts/AIERP.Api/Catalog/TenantCatalogSchema.cs` (`RootKeys` + `components`; `CatalogComponent` kaydı; `CatalogBundle.Components`; doğrulama ve sınırlar; kod tekilliği veri kaynakları/eylemlerle ortak)
- Modify: `src/Hosts/AIERP.Api/Catalog/TenantCatalogEndpoints.cs` (katalog listesinde bileşenler: `code`, `label`, `description`, `height`, `settings` — **css/javascript listelenmez**)
- Test: `tests/IntegrationTests/TenantCatalogSchemaTests.cs`, `TenantCatalogEndpointsIntegrationTests.cs` (genişletilir)

**Interfaces:**
- Produces:
  - `record CatalogComponentSetting(string Name, string Label, string Type, IReadOnlyList<string> Options, JsonElement? Default)`
  - `record CatalogComponent(string Code, string Label, string? Description, string Css, string JavaScript, int Height, IReadOnlyList<CatalogComponentSetting> Settings)`
  - `CatalogBundle.Components: IReadOnlyList<CatalogComponent>`, `CatalogBundle.FindComponent(string code)`
  - `GET /api/custom-pages/catalog` yanıtına `components: [{ code, label, description, height, settings: [{ name, label, type, options, default }] }]`

- [ ] **Step 1: Write the failing tests**
  - `Component_is_parsed_with_settings_and_defaults`
  - `Component_code_must_be_unique_across_items`
  - `Component_without_javascript_is_rejected`
  - `Component_css_with_external_resource_is_rejected`
  - `Component_over_limits_is_rejected` (11 ayar, 20001 karakter JS, 101 bileşen)
  - `Choice_setting_needs_options_and_default_in_options`
  - `Catalog_listing_includes_components_without_code`
  - `Bundle_without_components_still_valid` (bugünkü paketler)
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCatalogSchemaTests|FullyQualifiedName~TenantCatalogEndpointsIntegrationTests"` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Aynı filtre PASS.
- [ ] **Step 5: Commit** — `feat(katalog): yazılımcı bileşeni öğe türü`

### Task 3: Sayfada `catalogComponent` — doğrulama ve çözüm

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` (`SafePropsV2`: `catalogComponent`, `componentSettings`; biçim kuralları; `css`/`javascript` ile birlikte yasak)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageQueries.cs` (`HasCatalogReferences` bileşen başvurusunu da görür; `ResolveCatalogReferences` `css`, `javascript`, `height`'ı çözer; bileşen yoksa `catalogMissing: true` işaretler)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (kayıtta: bileşen etkin katalogda olmalı; ayar adları ve türleri bileşene uymalı; yazma izni katalog başvurusu kuralıyla)
- Test: `tests/IntegrationTests/TenantCustomPageCatalogComponentTests.cs` (yeni)

**Interfaces:**
- Consumes: Task 2 (`CatalogBundle.FindComponent`).
- Produces: çözülmüş sayfada `code` bileşeni `{ catalogComponent, componentSettings, componentDefaults, css, javascript, height }` ya da `{ catalogComponent, componentSettings, catalogMissing: true }`. `componentDefaults`: `{ "<ad>": varsayılan }`, yalnız varsayılanı olan ayarlar; çözülmüş biçimde kalır, kayıtta yasaktır (yalnız sunucu yazar).

- [ ] **Step 1: Write the failing tests**
  - `Page_with_catalog_component_saves_for_page_writer` (TenantAdmin olmayan kullanıcı)
  - `Inline_code_still_needs_tenant_admin` (Review Focus 5)
  - `Catalog_component_with_css_or_javascript_is_rejected` (Review Focus 3)
  - `Unknown_setting_and_wrong_type_are_rejected`
  - `Unknown_component_is_rejected_on_save`
  - `Read_resolves_code_from_active_catalog`
  - `Read_marks_missing_component_after_new_release` (Review Focus 1)
  - `Read_keeps_stale_setting_values` (Review Focus 2: değer korunur, ERP görmezden gelir)
  - `Read_adds_component_defaults` / `Saved_page_with_componentDefaults_is_rejected`
  - `Page_without_catalog_component_is_unchanged`
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageCatalogComponentTests"` → FAIL.
- [ ] **Step 3:** Implement. Çözüm, veri kaynağı çözümüyle aynı yerde ve aynı katalog sürümüyle yapılır.
- [ ] **Step 4:** Aynı filtre ve `--filter "FullyQualifiedName~TenantCustomPage|FullyQualifiedName~TenantCatalog"` PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): sayfada katalog bileşeni başvurusu`

### Task 4: ERP — ayarlar köprüde, eksik bileşen kutusu

**Files:**
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (`code` dalı: `catalogMissing` ise uyarı kutusu; `codeHost.get` `ayarlar.<ad>` yolunu o bileşenin ayarlarından çözer — bileşen başına ayrı host ya da bileşen kimliğiyle bağlam)
- Modify: `frontend/erp-web/src/custom-page/CodeFrame.tsx` gerekirse (host bileşen başına)
- Test: `frontend/erp-web/src/custom-page/TenantCustomPageCode.test.tsx` (genişletilir)

**Interfaces:**
- Consumes: Task 3 çözülmüş biçim.
- Produces: `get("ayarlar.<ad>")` → `componentSettings[ad]`, yoksa `componentDefaults[ad]`, o da yoksa `null`. ERP katalogu ayrıca okumaz.

- [ ] **Step 1: Write the failing tests**
  - `catalog component frame receives settings through bridge get`
  - `missing setting falls back to default` (Review Focus 2)
  - `catalogMissing shows Bu bileşen katalogda yok and rest of page renders` (Review Focus 1)
  - `two catalog components on one page get their own settings`
  - `inline code component unchanged` (Review Focus 5; `legacyUnchanged` anlık görüntüleri güncellenmeden)
- [ ] **Step 2:** `npx vitest run src/custom-page/TenantCustomPageCode` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npx vitest run src/page-templates src/custom-page` ve `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): katalog bileşeninin ayarları köprüden`

## PR B — Studio (Görev 5–7)

### Task 5: Yazılımcı ekranında Bileşenler

**Files:**
- Modify: `frontend/development-studio/src/studio-projects/catalog/catalogFiles.ts` (`CatalogKind` + `component`; `bilesenler/<kod>/bilesen.json` + `stil.css` + `kod.js` okuma/yazma; `buildBundle` `components`'i gömer)
- Create: `frontend/development-studio/src/studio-projects/catalog/ComponentForm.tsx`, `componentFormModel.ts`, `ComponentPreview.tsx`
- Modify: `CatalogWorkbench.tsx` (sol listede "Bileşenler" grubu; yeni bileşen), `CatalogReleaseDialog.tsx` (bileşen sayısı)
- Test: `catalogFiles.test.ts`, `componentFormModel.test.ts`, `ComponentForm.test.tsx`, `ComponentPreview.test.tsx`

**Interfaces:**
- Produces:
  - `readCatalogEntries` bileşenleri `{ kind: "component", code, jsonPath, cssPath, jsPath, json, css, javascript }` olarak döner; eksik dosya: `"<kod>: stil.css ya da kod.js bulunamadı."`.
  - `componentFormModel`: `addSetting`, `removeSetting`, `moveSetting`, `setSetting(index, patch)`, `componentProblems(json, css, js): string[]` (Global Constraints sınırları, Studio'da kayıttan önce).
  - `ComponentPreview({ css, javascript, height, settings })`: sandbox'lı iframe; köprü isteklerine Karar 4'teki yanıtlar; belirteç ya da firma isteği yok.

- [ ] **Step 1: Write the failing tests**
  - `reads component folder into entry and builds bundle components`
  - `missing css or js file reports error`
  - `entryFiles writes bilesen.json stil.css kod.js`
  - `componentProblems mirrors server limits`
  - `ComponentForm renders settings table and code editors without tabs`
  - `ComponentPreview answers get with default settings and refuses runQuery` (Review Focus 4)
  - `release dialog counts components`
- [ ] **Step 2:** ilgili `npx vitest run …` → FAIL.
- [ ] **Step 3:** Implement. Önizleme iframe belgesi erp-web `codeBridge.ts`'teki belge kurucusunun Studio eşidir (aynı CSP ve sandbox).
- [ ] **Step 4:** PASS; `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): yazılımcı ekranında bileşenler`

### Task 6: Danışman paneli ve palet

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/page-designer/catalogClient.ts` (`CatalogComponent` tipi ve okuma)
- Create: `page-designer/panel/developerComponentModel.ts`, `page-designer/panel/DeveloperComponentPanel.tsx`
- Modify: `page-designer/panel/consultantPalette.ts` (`developer` kullanılabilirliği: Karar 5; `createConsultantComponent("developer")` → `code` bileşeni, `catalogComponent` boş değil — ilk bileşen seçilir)
- Test: `catalogClient.test.ts`, `developerComponentModel.test.ts`, `DeveloperComponentPanel.test.tsx`, `consultantPalette.test.ts`

**Interfaces:**
- Produces:
  - `type CatalogComponent = { code; label; description: string | null; height: number; settings: { name; label; type: "text"|"number"|"bool"|"choice"; options: string[]; default: string|number|boolean|null }[] }`
  - `chooseComponent(def, id, comp: CatalogComponent): D` (ayarları varsayılanlarla değil boş başlatır; eski, artık tanımsız ayarları siler)
  - `setComponentSetting(def, id, name, value): D` (türe uymayan değer yazılmaz)
  - `developerComponentOf(def, id, catalog): { comp: CatalogComponent | null; missing: boolean; values: Record<string, unknown> }`
  - Panel (taslak 03 sırası): Hangi bileşen? → `ProvidedByDeveloper("Yazılımcının yayınladığı bileşen · danışman kodunu görmez")` → yazılımcının ayarları (Karar 3 kontrolleri) → not "Bu ayarları yazılımcı tanımladı." → Görünüm (ortak). Katalogda yoksa "Katalogda yok".

- [ ] **Step 1: Write the failing tests**
  - `catalog client reads components`
  - `palette enables developer only when catalog has components`
  - `chooseComponent writes catalogComponent and drops undefined settings` (Review Focus 2)
  - `setComponentSetting rejects wrong type and choice outside options`
  - `panel marks missing component` (Review Focus 1)
  - `panel shows no technical words`
  - `functions never mutate input`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/developerComponentModel src/platform-tools/erp-src/page-designer/panel/DeveloperComponentPanel src/platform-tools/erp-src/page-designer/panel/consultantPalette src/platform-tools/erp-src/page-designer/catalogClient` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): danışman için yazılımcı bileşeni paneli`

### Task 7: Bağlama, uçtan uca doğrulama ve belgeler

**Files:**
- Modify: `page-designer/panel/TemplateInspector.tsx` (`code` + `catalogComponent` → `DeveloperComponentPanel`; Liste/Kayıt kartı ek alanları ve serbest gövde öğeleri), `consultantPalette.ts` `consultantKindOf` (`code` + `catalogComponent` → `developer`; satır içi `code` → `null`, eski panel)
- Modify: `CustomPagesPage.tsx` (`managedKeys`: `catalogComponent`, `componentSettings`)
- Modify: `docs/phase-status.md`, `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` §7 (5. madde, katalog planı)
- Test: `TemplateInspector.test.tsx`, `consultantRoundTrip.test.ts` ve `freeRoundTrip.test.ts` (yazılımcı bileşeni eklenir); sunucu fikstürü: `freeServerFixture` tanımına bir katalog bileşeni ve fikstür kataloğuna bir bileşen eklenir

- [ ] **Step 1: Write the failing tests**
  - `inspector opens developer panel for catalog component in list extra area, record extra area and free item`
  - `inline code component keeps old panel` (Review Focus 5)
  - `round trips keep catalogComponent and componentSettings server-valid`
  - sunucu fikstürü katalog bileşenli serbest sayfayı kabul eder
- [ ] **Step 2:** odaklı `npx vitest run …` ve fikstür `dotnet test` filtresi → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Birleşik dalda bir kez: development-studio `npm test` + `npm run build`; erp-web `npm test` + `npm run build`; `dotnet test AIERP.slnx` (yük altında zaman aşımına düşen sınıflar tek başına yeniden).
- [ ] **Step 5:** Belgeleri güncelle; doğrulanmayanları açıkça yaz (tarayıcı turu, gerçek arka uç, yayın akışı).
- [ ] **Step 6: Commit** — `feat(studio): yazılımcı bileşeninin bağlanması; belgeler`
