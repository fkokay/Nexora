# Belge kuralları PR 2: Belge kalıbı ve Studio Belge paneli — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir sayfa `template: belge` seçince, satış siparişi tasarımcıda tek bir formül, sorgu ya da komut ayarı olmadan çalışsın. Sayfa var olan satırları yükler (G-S7), tutarları ve KDV dökümünü sunucudan alır (G-S8), stok seçilince alanları doldurur (G-S9). Danışman yalnız alanları ve kolonları seçer.

**Architecture:**
- PR 1'in belge modeli birkaç bayrakla genişler.
- Sunucu şeması üçüncü kalıp adını (`belge`) ve üç kalıp bileşenini doğrular: `documentFields`, `documentLines`, `documentSummary`. Seçilen kodlar model kayıt defterine karşı denetlenir.
- ERP'de kalıp için yeni bir çizim dalı açılır: `DocumentTemplate`. Bu dal veriyi sayfa sorgularından değil, doğrudan model uçlarından alır.
- Studio'da yeni bir Belge paneli olur. `TemplateInspector` bu panele yönlendirir.
- Sipariş kartı yeni bir sistem standardı olarak gelir: `sales-order-document`.

**Tech Stack:** .NET 10 minimal API, xUnit; React + Vite + Vitest (erp-web, development-studio).

**Spec:** `docs/superpowers/specs/2026-11-25-belge-kurallari-design.md` (§5.2, §5.4, §5.5, §7). Onaylı taslaklar:
- `08-erp-belge-ekrani.html`: ERP görüntüsü
- `09-belge-paneli.html`: Studio paneli

**Dal:** `claude/belge-kurallari-2-belge-kalibi`. Bu dal PR 1'in (#180) üstünde duruyor ve origin/master ile (alt proje 4 dahil) birleşik. PR 2, #180 birleşene kadar **PR 1 dalına karşı** açılır; birleşince tabanı master'a çevrilir.

## Global Constraints

- UI metni Türkçe.
- Yeni uçların her biri izin kataloğunda yer alır.
- Kiracı kapsamı yalnız `tenant_id` talebinden gelir.
- Var olan sayfalar `template` taşımaz. Bu PR'dan sonra çizimleri aynen kalır: `legacyUnchanged` anlık görüntüsü bayt bayt değişmez.
- Hesaplama için yeni kod yazılmaz. `POST /api/sales/orders/preview` (SalesDocumentCalculator) adreslenir.
- Belge sayfasında §2 ayarları reddedilir: `editableGrid`, `actionBar`, `fillQuery`, `fillColumns`, `lookupFills`, `formulas`, `width`/`widthWhen` ve hesap kolonları.
- Migration yok.
- Alt proje 4'ün dosyalarına yalnız ekleme yapılır: `PageTemplateRules.cs`, `pageTemplate.ts`, `TenantCustomPage.tsx`, `TemplateInspector.tsx`, `CustomPagesPage.tsx`.
- Paralel .NET entegrasyon testleri zaman aşımına düşebilir; düşen sınıflar tek başına yeniden koşulur.

## Kararlar (plan onayıyla kesinleşir)

1. **Yeni sürüm değil, yeni ekran anahtarı.**
   - Spec §5.4 `sales-order-create`'in yeni sürümünün Belge kalıbını kullanacağını söyler. Ama `SystemPageStandards.Restrict` kök anahtarları aynen kopyalar.
   - Bu yüzden v2'ye kısıtlanan bir belge tanımı `actionBar` ve `lookupFills` taşıyan bir belge sayfası olur. `Every_restricted_version_validates` testi bunu reddeder. `SystemPageMerge` de kopyalara kalıp değişimi öneremez.
   - Karar: yeni standart `sales-order-document` (v1). Eski kart (`sales-order-create` v2) olduğu gibi kalır.
   - `sales-orders` liste standardı v4'e çıkar ve "Belgede aç" düğmesini önerir: Yeni, Onaylı ya da Taslak seçili satır için. Firma kopyalarına da "Yeni" öğe olarak önerilir.
   - Spec §5.4 buna göre düzeltilir.
2. **Kalıp biçimi.**
   - Kalıp tanımı: `"template": { "name": "belge", "document": "satis.siparis" }`. `document` yalnız belgede ve zorunlu.
   - Seçimler alt proje 3/4'ün slot yöntemiyle bileşen olarak durur:
     ```json
     {"id":"baslik","type":"documentFields","props":{"slot":"fields","fields":["code","customerId","orderDate","requestedDeliveryDate"],"labels":{"customerId":"Cari"}}}
     {"id":"satirlar","type":"documentLines","props":{"slot":"lines","columns":["stockItemId","quantity","unitCode","unitPrice","discountPercent","vatPercent","availableQuantity","lineTotal","deliveredQuantity"],"labels":{},"density":"normal"}}
     {"id":"toplamlar","type":"documentSummary","props":{"slot":"summary","vatBreakdown":true,"activity":true}}
     ```
   - `actions` slotu yalnız katalog eylemi `button` alır; kayıt kartının ek eylemleriyle aynıdır. `above` ve `below` her türü alır, ama belge yasakları orada da geçerlidir.
   - Sunucu şunları kontrol eder:
     - bilinen belge kodu
     - bilinen alan ve kolon kodları
     - tekrar yok
     - zorunlu alanlar ve kolonlar seçili (gizlenemez)
     - etiket en fazla 60 karakter
3. **Model genişler** (§5.2'deki "alan değişince dolanlar" artık modelde):
   - `DocumentFieldView.ReadOnly` (`code`).
   - `DocumentLineColumnView.VisibleFrom`: `deliveredQuantity` için "Open"; Taslak'ta gizlenir.
   - `DocumentModelView.Fills`: `{ "stockItemId": ["unitCode","unitPrice","vatPercent","discountPercent","currencyCode","availableQuantity"] }`.
   - `CreateOperation` / `UpdateOperation`: var olan `POST` / `PUT /api/sales/orders` uçlarının işlem kodları.
4. **Kaydet.**
   - Onaylı taslak 08'e göre Taslak'ta ana düğme **Kaydet**, yanında **Onayla** durur. Taslak 09'un tuvali bunu sadeleştirmişti; ERP 08'i izler.
   - Yeni belgede yalnız Kaydet vardır. Kayıttan sonra sayfa `id` parametresiyle yeniden açılır.
5. **Özel alanlar.**
   - Firmanın satış siparişi özel alan tanımları varsa Belge, başlık alanlarının altında var olan `customFieldsBlock` çizimini kendiliğinden gösterir.
   - PR 1'de zorunlu özel alan onayı engelliyor. Bu yüzden Belge'de bu alanların olmaması taslakları takılı bırakırdı; o yüzden kendiliğinden gösterilir.
6. **Tuval örneği.**
   - `GET /api/document-models/satis.siparis/sample?state=Draft|Open|Fulfilled` modelden sentetik bir belge döner. Bu uç veritabanından okumaz ve yazmaz.
   - Tuvaldeki "Önizlenen durum" seçici yeni `previewState` mesajını gönderir (Studio → ERP). Mesaj iki protokol kopyasında aynıdır.
   - Tuvalde doldurma ve hesaplama gerçek, yan etkisiz uçlara gider. Kaydet ve geçişler `blockedInPreview` ile engellidir.
7. **İzin yoksa panel.**
   - Danışman `erp.sales-orders.read` iznine sahip değilse panel şunu gösterir: "Bu belgenin modelini görmek için Satış siparişi okuma izni gerekir."
   - Bu durumda seçimler düzenlenemez, sayfa tanımı korunur.
8. **Hesap isteği.**
   - Satır değişikliğinden 400 ms sonra gönderilir.
   - Yeni değişiklik önceki isteği `AbortController` ile iptal eder. Sıra numarasıyla eski yanıt yok sayılır.
9. **Üç genişlik karşılaştırması** (§7).
   - Vitest testi aynı siparişi eski kart ve Belge ile çizer. Ara toplam, iskonto, KDV, genel toplam ve doğrulama mesajlarının aynı olduğunu doğrular.
   - Üç genişlikte ekran görüntüleri Playwright ile elle alınır ve PR açıklamasına eklenir. Görsel eşitlik iddia edilmez; görünüş kalıba göre değişir.

## Review Focus

1. Hesap yanıtları sıradan çıkarsa eski tutar yeni miktarın yanında kalmamalı.
2. Onaylı ya da Sevk edildi belgede satırlar ve başlık (teslim tarihi hariç) düzenlenemez. Kaydet gizli, geçişler `allowedTransitions`'tan gelir.
3. Başka firmanın sipariş kimliğiyle açılan Belge 404 gösterir. Sample ucu veritabanına dokunmaz.
4. Zorunlu alan ya da kolonu çıkaran bir sayfa yayınlanamaz. Studio'da bu kutular kilitlidir.
5. Kalıpsız sayfalar ve liste/kayıt kalıpları değişmez: `legacyUnchanged`, record ve list testleri yeşil kalır.

---

### Task 1: Modeli genişlet ve sample ucunu ekle (sunucu)

**Files:**
- Modify: `src/Hosts/AIERP.Api/DocumentModels/DocumentModel.cs`, `SalesOrderDocumentModel.cs`, `DocumentModelEndpoints.cs`
- Modify: `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs` (sample → read)
- Create: `src/Hosts/AIERP.Api/DocumentModels/DocumentModelRegistry.cs`: `internal static DocumentModelView? Find(string code)`; şema ve uçlar bunu kullanır
- Test: `tests/IntegrationTests/SalesOrderDocumentModelTests.cs`

**Interfaces:**
- Produces:
  - `DocumentFieldView(Code, Label, Type, Required, OptionsOperation, bool ReadOnly = false)`
  - `DocumentLineColumnView(..., string? VisibleFrom = null)`
  - `DocumentModelView` gains `IReadOnlyDictionary<string, IReadOnlyList<string>> Fills, string CreateOperation, string UpdateOperation`
  - `GET /api/document-models/{code}/sample?state=` → `SalesOrderDocumentView` (state yoksa Draft; bilinmeyen state 400)

- [ ] Testler:
  - `Model_carries_fills_readonly_and_visible_from`: `fills.stockItemId` altı kodu içerir; `code` için readOnly true; `deliveredQuantity` için visibleFrom "Open".
  - `Sample_document_has_requested_state_without_touching_the_database`: Open için `order.status=="Open"`, `allowedTransitions` dolu, satır sayısı 2 ya da daha fazla. Tenant DB'de sipariş sayısı 0 kalır.
  - `Sample_with_unknown_state_is_bad_request`.
  - `Sample_needs_sales_order_read`: Deny durumunda 403.
- [ ] RED'i gör → uygula → GREEN.
  - Sample'daki satırlar sabit örnek değerdir: iki satır; %20 ve %10 KDV.
  - Tutarlar `SalesDocumentCalculator` ile hesaplanır; böylece KDV dökümü tutarlı olur.
- [ ] Commit: `feat(satis): belge modeli doldurma, salt okunur ve örnek belge`

### Task 2: Şemada `belge` kalıbı (sunucu)

**Files:**
- Modify:
  - `src/Hosts/AIERP.Api/PageTemplates/PageTemplateRules.cs`: `DeclaredName`, `TemplateName` (belge için `document` izinli), `ValidateTemplate`, `UnknownTemplate`. Yeni `BelgeSlots = fields, lines, summary, actions, above, below` ve `ValidateBelge`.
  - `PageTemplateSummary.cs`: "belge" kabul edilir.
  - `TenantCustomPageSchema.cs`: üç yeni bileşen türünün prop doğrulaması.
- Test: `tests/IntegrationTests/TenantCustomPageSchemaBelgeTemplateTests.cs`. Kayıt kalıbı testindeki `Page/Accepted/Rejected` kalıbını izler.

**Interfaces:**
- Consumes: `DocumentModelRegistry.Find`.
- Produces: hata metinleri.
  - `UnknownDocument` = "Belge kalıbı bilinen bir belge ister (ör. \"satis.siparis\")."
  - `UnknownDocumentCode(kind, code)` = "'{code}' bu belgenin {alanı|kolonu} değil."
  - `RequiredDocumentCode(code)` = "'{label}' zorunlu, gizlenemez."
  - `NoDocumentSettings(type)` = "Belge sayfasında '{type}' kullanılamaz; satırlar ve hesap modelden gelir."
  - `UnknownTemplate` metnine "belge" eklenir.

- [ ] Testler:
  - minimal belge kabul edilir
  - `document` yok ya da bilinmiyor: red
  - `document` liste/kayıt kalıbında: red
  - eksik ya da çift `fields`/`lines`/`summary`: red
  - bilinmeyen alan kodu, bilinmeyen kolon kodu, tekrar: red
  - zorunlu `customerId` eksik: red
  - `editableGrid` `below`'da: red
  - `actionBar`: red
  - `width`: red
  - 61 karakterlik etiket: red
  - taslak → önizle → yayınla gidiş-dönüşü
  - `PageTemplateSummary.Read` "belge" döner
  - var olan record ve list testleri yeşil
- [ ] RED → uygula → GREEN.
- [ ] Commit: `feat(sayfa): belge kalıbı şeması`

### Task 3: ERP `DocumentTemplate` çizimi

**Files:**
- Modify: `frontend/erp-web/src/page-templates/pageTemplate.ts`
  - `PageTemplate` birliğine `{ name: "belge"; document: string }` eklenir.
- Create: `frontend/erp-web/src/page-templates/documentTemplateModel.ts`
  - `layoutDocumentTemplate(components)` → `{ fields, lines, summary, actions, above, below }`
  - `visibleColumns(model, lines, status)`
  - `fieldEditable(model, code, status)`
- Create: `frontend/erp-web/src/page-templates/documentApi.ts`
  - `loadDocumentModel(code, token)`
  - `loadSalesOrderDocument(id, token)`
  - `loadSampleDocument(code, state, token)`
  - `fillLine(code, field, value, ctx, token)`
  - `previewOrder(body, token, signal)`
  - `saveOrder(id | null, body, token)`
  - `runTransition(id, code, reason?, token)`
- Create: `frontend/erp-web/src/page-templates/useDocumentCalculation.ts`
  - 400 ms gecikme, `AbortController`, sıra numarası.
- Create: `frontend/erp-web/src/page-templates/DocumentTemplate.tsx`
  - Taslak 08'in görüntüsü:
    - `PageShell variant="record"`
    - belge no, durum rozeti, durum çizgisi
    - düğmeler: Kaydet ve geçişler; İptal et en sağda, sebep istemiyle
    - başlık alanları
    - `customFieldsBlock`
    - `EditableGrid` (modelden kolonlar; hesaplananlar salt okunur)
    - toplamlar ve KDV dökümü
    - işlem günlüğü ve "günlük sonradan başladı" notu
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`
  - `pageTemplate?.name === "belge"` dalı; eski başlık gizlenir.
  - Sayfa parametresi `id`.
  - Önizlemede yazmalar engellenir.
- Test: `frontend/erp-web/src/page-templates/DocumentTemplate.test.tsx`. Sahte `fetch` kullanır.

**Interfaces:**
- Consumes: Task 1'in JSON biçimleri; `EditableGrid`, `PageShell`, `ShellAction`.

- [ ] Kabul testleri (G-S7/8/9, §7), §2 ayarı taşımayan bir `template: belge` sayfasıyla:
  - `Loads_existing_order_lines_editable_in_draft`: satır stok, miktar ve fiyatı ızgarada görünür; Taslak'ta düzenlenebilir.
  - `Quantity_change_shows_server_amounts_and_vat_breakdown`: miktar değişince `/api/sales/orders/preview` bir kez çağrılır (gecikmeden sonra). Satır tutarı, KDV %20/%10 satırları ve genel toplam yanıttan gelir.
  - `Stock_pick_fills_unit_price_vat_discount_currency_available`.
  - `Stale_calculation_is_ignored`: ilk yanıt ikinciden sonra gelir; ekranda ikincinin tutarı kalır.
  - `Open_order_is_read_only_and_shows_delivered_column`: Kaydet yok; "Onayı geri al" ve "İptal et" var.
  - `Cancel_asks_reason`.
  - `Approve_posts_transition_and_reloads`.
  - `Preview_blocks_save_and_transitions`.
  - `Other_tenant_order_shows_not_found`.
  - `legacyUnchanged` anlık görüntüsü değişmez.
- [ ] RED → uygula → GREEN. Sonra `npm run build`.
- [ ] Commit: `feat(erp): belge kalıbı çizimi`

### Task 4: Tuval: örnek belge ve önizlenen durum

**Files:**
- Modify:
  - `frontend/erp-web/src/designer-canvas/canvasProtocol.ts` ve `DesignerCanvasHost.tsx`: `previewState` mesajı. Belge taslağında `sampleKeyOf` yerine sample ucu kullanılır.
  - `frontend/development-studio/src/platform-tools/erp-src/page-designer/erpCanvasProtocol.ts`: aynası.
- Test: `DesignerCanvasHost.test.tsx`, iki `canvasProtocol` testi.

- [ ] Testler:
  - `Belge_draft_renders_sample_document_without_params`.
  - `Preview_state_message_switches_sample_state`: Onaylı seçilince Kaydet kaybolur, Sevk kolonu görünür.
  - İki protokolün mesaj listesi aynı.
- [ ] RED → GREEN.
- [ ] Commit: `feat(tuval): belge örneği ve önizlenen durum`

### Task 5: Studio Belge paneli

**Files:**
- Modify: `page-designer/pageTemplates.ts`
  - `PAGE_TEMPLATE_CHOICES` + `{id:"belge", label:"Belge", description:"Satış siparişi gibi satırlı belgeler; hesap ve durumlar modülden gelir."}`
  - `newBelgeTemplateDefinition(model)`
  - `templateLabel` "Belge"
- Modify: `NewPageDialog.tsx`
  - id birliği genişler; belge seçilince "Hangi belge?" adımı gelir. Şimdilik tek seçenek: Satış siparişi.
- Create: `page-designer/documentModelClient.ts`
  - `loadDocumentModel(code, token)` → `DocumentModel | "forbidden" | null`
- Create: `page-designer/panel/belgeModel.ts`. Saf fonksiyonlardır:
  - `belgeParts(def)`
  - `toggleField`, `moveField`, `renameField`
  - `toggleColumn`, `moveColumn`, `renameColumn`
  - `setDensity`, `setVatBreakdown`, `setActivity`
  - `addExtraAction`, `removeExtraAction` (recordModel'in eşleriyle aynı biçim)
- Create: `page-designer/panel/BelgePanel.tsx` (taslak 09)
  - Bölümler: Hangi belge? (sabit), Başlık alanları, Satır kolonları, Kendiliğinden olanlar (bilgi), Eylemler, Görünüm, Yazılımcıdan iste.
  - Zorunlu kutular kilitli.
  - "hesaplanan" ve "onaydan sonra" etiketleri gösterilir.
- Modify: `panel/TemplateInspector.tsx`
  - `belge` prop'u verilirse `BelgePanel`.
- Modify: `CustomPagesPage.tsx`
  - `isBelgePage`; model yükleme; panel ve tuval bağlama.
  - Tuval üstünde "Önizlenen durum" seçici (Taslak / Onaylı / Sevk edildi).
- Modify: `panel/templateGuards.ts`
  - `BELGE_TEMPLATE_SLOTS`; `ensureTemplateSlots` belge yasaklarını uygular.
- Test:
  - `panel/belgeModel.test.ts`
  - `panel/BelgePanel.test.tsx`
  - `panel/belgeRoundTrip.test.ts`: panelin ürettiği tanım, sunucu fixture'ıyla `TenantCustomPageSchema`'yı geçer. Fixture `tests/IntegrationTests/Fixtures/Belge/` altındadır; C# tarafı `TenantCustomPageBelgeStudioFixtureTests`.
  - `pageTemplates.test.ts`

- [ ] Testler:
  - Kolon işaretlemek ve sıralamak tanımı değiştirir.
  - Etiket değiştirmek `labels`'a yazar; boş etiket kaldırır.
  - Zorunlu kutu disabled.
  - İzin yokken uyarı görünür ve düzenleme kapalı.
  - Yeni belge sayfası diyalogdan oluşur ve şemayı geçer.
  - Önizlenen durum seçici `previewState` gönderir.
- [ ] RED → GREEN. Sonra development-studio için `npm run build`.
- [ ] Commit: `feat(studio): belge paneli`

### Task 6: Sistem standardı `sales-order-document` ve liste düğmesi

**Files:**
- Create: `src/Hosts/AIERP.Api/SystemPages/Standards/sales-order-document.json` (v1, `template: belge`)
- Modify:
  - `sales-orders.json` → v4 + `belgedeAcDugmesi` (since 4)
  - `tests/IntegrationTests/SystemPageStandards.versions.txt`
  - frontend fixture(lar)ı
  - `ErpOperationCatalog` / names.txt (gerekirse)
- Test: `tests/IntegrationTests/SalesOrderDocumentStandardTests.cs`

- [ ] Testler:
  - `Standard_validates_and_carries_no_section_2_settings`: tanımda §2 ayarlarının hiçbiri yok.
  - `Standard_document_endpoints_meet_gs7_gs8_gs9`. Entegrasyon testidir; standart sayfanın kullandığı üç uç için:
    - belge satırları `enteredUnitPrice` ve `enteredUnitCode` ile gelir;
    - preview tutarları KDV dökümüyle gelir;
    - fill altı alanı doldurur.
  - `Tenant_copy_of_sales_orders_v3_is_offered_belgede_ac`.
  - `Old_card_and_belge_show_same_totals_and_messages` (Vitest, karar 9).
- [ ] RED → GREEN.
- [ ] Commit: `feat(satis): belge kalıbıyla sipariş kartı standardı`

### Task 7: Belgeler ve doğrulama

- [ ] Spec güncellemeleri:
  - §5.4: karar 1 (yeni ekran anahtarı).
  - §5.5: taslak 09'un üç eki (önizlenen durum, KDV dökümü anahtarı, işlem günlüğü anahtarı) ve karar 7.
  - §5.2: model genişlemesi.
- [ ] `docs/phase-status.md` girdisi: doğrulanan ve doğrulanmayan ayrı.
- [ ] Doğrulama koşuları:
  - `dotnet build AIERP.slnx`
  - etkilenen .NET sınıfları
  - erp-web ve development-studio: `npm run build` ve vitest
  - üç genişlikte ekran görüntüsü (Playwright, elle)
- [ ] Son inceleme (opus): Critical/Important düzeltmeleri; ardından PR (taban: PR 1 dalı).
