# Yeni belge modeli ekleme (kontrol listesi)

Belge modeli: ERP'de Belge kalıbıyla çizilen bir belgenin (başlık alanları, satırlar, durumlar, geçişler, toplamlar, işlem günlüğü) sunucudaki tanımı. İki örnek var: `satis.siparis` (ilk) ve `satis.teklif` (ikinci, bu listenin çıkarıldığı iş). Yeni model için en kısa yol `satis.teklif`i kopyalayıp uyarlamaktır; aşağıdaki her madde teklifte gerçekten dokunulan yeri gösterir.

Sırayla gidin; her adımın sonunda ilgili testi çalıştırın. Şema değişikliği (EF migration) gerekmez: belge modeli yeni tablo istemez, işlem günlüğü ortak `TenantDocumentActivities` tablosundadır. Migration gerekiyorsa durun, model kapsamı fazla büyümüş demektir.

## 0. Önce karar verin

- **Kayıt tipi ve mevcut uçlar:** Belge hangi varlığı yazıyor (`SalesQuote`, `SalesInvoice`…)? Mevcut okuma, yazma (POST/PUT), hesap (`…/preview`) ve geçiş uçlarını (`/send`, `/accept`…) listeleyin. Model yeni iş işlemi icat etmez; yalnız var olan uçları belgeye bağlar.
- **Geçişler:** Yalnız aynı kaydın durum değiştirmesi model geçişi olur. Yeni belge üreten (tekliften sipariş, siparişten irsaliye), dosya üreten (yazdır/PDF) ya da yeni revizyon açan işlemler geçiş değildir; kalıpta karşılığı yok, listede satır eylemi olarak kalır ya da "kalıpta eksik" diye raporlanır.
- **Kayıtta silinebilecek veri:** Yazma ucu (PUT) gönderilmeyen alanı siler mi? Belge göstermediği her alanı (not, koşul, kayıtsız alıcı adı, kaynak satır bağı, özel alan, döviz kuru) geri göndermeli ya da modele alan olarak girmelidir. Teklifte bu yüzden `notes`, `deliveryTerms` model alanıdır; kayıtsız alıcı adı ve talep satırı numarası Belge'nin gövdesinde görünmeden geri gider.
- **Kapsam dışı:** Belge kuralları (Kurallar ekranı) ve onay akışı yalnız `satis.siparis`te vardır; yeni modele otomatik gelmez.

## 1. Sunucu: model (`src/Hosts/AIERP.Api/DocumentModels/`)

1. `<Ad>DocumentModel.cs` ekleyin (`SalesQuoteDocumentModel.cs` örnek):
   - `Code` = model kodu (`satis.teklif`); `DocumentActivityLog` içine aynı kodla sabit ekleyin (`DocumentActivityLog.SalesQuote`).
   - `Model` (`DocumentModelView`): alanlar (`code` salt okunur; zorunlu alanlar Studio'da gizlenemez), satır kolonları, durumlar (zincirde görünenler `terminal: false`, yan durumlar `terminal: true`), geçişler (kod, etiket, hangi durumlardan, hedef durum, mevcut işlem adı, gerekçe isteniyor mu) ve işlem adları (belge, hesap, doldur, oluştur, güncelle).
   - Satış belgeleri için ortak parçalar `SalesDocumentModelParts` içindedir: `LineColumns()`, `StockFills()`, `FillAsync` (stok seçince doldurma), `SampleAmounts`, `VatRows`, `ExecutableAsync` (geçiş düğmesinin izin denetimi). Aynı satırları kullanan belge bunları çağırır; kendine özel kolonu sona ekler (`[.. LineColumns(), new(...)]`). Satışla ilgisiz bir belgede bu ortak parçaların karşılığını yeni bir yardımcıya taşıyın, kopyalamayın.
   - `Candidates(durum, …)`: durum zincirinin izin verdiği geçiş kodları (yetki denetimi öncesi).
   - `Sample(durum)`: Studio tuvalinin örnek belgesi; veritabanına dokunmaz.
2. `DocumentModel.cs`: belge görünümü kaydı ekleyin (`SalesQuoteDocumentView(Quote, Amounts, AllowedTransitions, Activity, ActivityStartedLate)`). Kayıt anahtarı (`order`, `quote`…) ERP'deki bağda (adım 4) adlandırılır.
3. `DocumentModelRegistry.cs`: `Find` içine kodu ekleyin. Şema doğrulayıcı (`PageTemplateRules.ValidateBelge`) bilinen belgeyi buradan okur; başka yerde kayıt gerekmez.
4. `DocumentModelEndpoints.cs`: model başına **değişmez adlı** yollar (operasyon kataloğu yolu birebir eşler):
   - `GET /api/document-models/<kod>/sample` (`Sample(durum, ilkDurum, Model.Sample)` yardımcısıyla),
   - `POST /api/document-models/<kod>/fill`,
   - `GET <kayıt kökü>/{id}/document`: kaydı, tutarları, KDV dökümünü, `ExecutableAsync` ile süzülmüş geçişleri ve işlem günlüğünü döner. Kayıt okumasını inline bırakmayın; mevcut GET'ten ortak bir okuma sınıfına taşıyın (`SalesQuoteReads.ViewAsync`, davranış değişmeden) ve eski uç da onu kullansın.

## 2. Sunucu: yetki ve katalog

1. `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs`, `/api/document-models/` dalı: model kodunu **kendi belge kaynağına** eşleyin (`satis.teklif` → `erp.sales-quotes`, varsayılan `erp.sales-orders`). Aksi hâlde yeni modelin okuması siparişin iznine bağlı kalır. Test: yalnız yeni kaynağın okuma izni olan kullanıcı modeli okur, siparişi okuyamaz (`Model_routes_resolve_as_the_models_own_document_permission`).
2. `ErpOperationCatalog.SalesCards.cs` (ya da modülün katalog dosyası): `<modül>.<belge>.belge` (GET `…/document`) ve `<modül>.<belge>.doldur` (POST `…/fill`) işlemleri. Geçiş, hesap, oluştur ve güncelle işlemleri zaten kataloğa kayıtlıdır; modelin işlem adları var olan adlarla eşleşmelidir.
3. `tests/IntegrationTests/ErpOperationCatalog.names.txt`: yeni iki işlem adını **sıralı** (ordinal) ekleyin. Dosya CRLF'dir.
4. Geçiş uçlarının izni yalnız `…/execute` değil; `ExecutableAsync` aynı kaynağın `execute` iznini denetler.

## 3. Sunucu: işlem günlüğü

Geçiş uçları işlem günlüğünü kendi yazmıyorsa ekleyin: aynı işlemde, `SaveChanges`'ten önce `DocumentActivityLog.Add(db, tenantId, DocumentActivityLog.<Belge>, id, "<geçişKodu>", "<adım metni>", "core", "done", null, userId)`. Ek kayıt, şema ya da migration gerektirmez. Günlük, belge görünümünde `activity` olarak döner; günlüksüz eski kayıtlar `activityStartedLate` ile işaretlenir (durum Taslak'tan farklı ve günlük boşsa).

Not: eski geçiş uçlarındaki satır kilidi (`FromSqlInterpolated … UPDLOCK`) InMemory sağlayıcıda çalışmaz. Siparişteki gibi `db.Database.IsRelational()` dalıyla InMemory'de düz sorgu kullanın; böylece geçişler normal testlerde de sınanır.

## 4. ERP ön yüzü (`frontend/erp-web/src/`)

1. `page-templates/documentApi.ts`: `DOCUMENT_BINDINGS` içine bir `DocumentBinding` ekleyin. `DocumentTemplate` modele özgü hiçbir şey bilmez; her şey bağdadır:
   - `code`, `noun`, `newTitle`, `entity` (yanıttaki kayıt anahtarı; tipi `"order" | "quote"` birliğine ekleyin), `base` (uç kökü), `transitionRoutes` (geçiş kodu → uç yolu), `maxLines`,
   - `dateFields` / `textFields` (başlıkta düzenlenen alan kodları), `newValues` (yeni belge varsayılanları), `valuesOf` (sunucu kaydından başlık değerleri),
   - `previewBody` (hesap ucunun gövdesi; modele göre değişir: teklif döviz ve tarihleri ister, sipariş müşteriden türetir),
   - `writeBody` (kayıt gövdesi; **göstermediği ama yazma ucunun sildiği her veriyi geri gönderir**).
   Gerekirse `normalizeDocument` yeni kayıt şeklini ortak `DocView`a çevirir (satır alanı adı farkları orada ezilir).
2. `page-templates/DocumentTemplate.tsx`: bağ değişikliği gerekmez. Yeni alan türü (ör. çok satırlı metin) ya da satıra özgü gizli hücre gerekirse burada `field()` ve `rowsOf`/`lineRequest` genişletilir; sipariş testleri değişmeden geçmelidir (davranış koruması).
3. Yeni ekran anahtarı `<liste>-document` için kayıtlar (hepsi gerekli; biri eksikse sekme başlıksız ya da yanlış menüde açılır):
   - `erp-types.ts`: `SalesPageKey` birliğine ekleyin,
   - `App.tsx`: sayfa başlığı sözlüğü,
   - `workspace-navigation.ts`: TR ve EN başlık sözlükleri,
   - `shell/moduleMenus.ts`: parent eşlemesi (`"sales-quote-document": "sales-quotes"`) ve modül sayfa listesi,
   - `system-pages/systemPageKeys.ts`: sistem sayfası anahtarları (alfabetik),
   - `WorkspacePageRouter.tsx`: Belge sistem sayfası açık değilse eski karta düşen `LegacyDocumentCard` satırı. Eski karta düşüş **Belge sayfasına geri dönmemeli** (döngü olmasın): `openKey`/`openParam` eski ekranı gösterir.
4. Testler: `page-templates/DocumentTemplate<Belge>.test.tsx` (teklif örnek: yükleme, tarih ve metin alanları, kayıtta geri gönderilen veri, hesap gövdesi, geçiş ucu, Studio örneği, yeni belge varsayılanı), `system-pages/orderDocumentFallback.test.tsx` (eski karta düşüş).

## 5. Standartlar (`src/Hosts/AIERP.Api/SystemPages/Standards/`)

1. `<liste>-document.json`: Belge standardı (`sales-quote-document.json`; `sales-order-document.json`'dan kopya). `template.document` = model kodu; `baslik.fields` ve `satirlar.columns` modeldeki kodlardır, zorunlu olanlar eksik bırakılamaz, siparişe özgü kolon (`deliveredQuantity`) yoktur. `items` etiketleri en çok 80 karakter. `version: 1`, `stage: "preview"`.
2. Liste standardı (`sales-quotes.json`): Liste kalıbına yeniden yazın (`version` +1; tüm `items` `since: 1`; eski sürümler `Restrict` ile doğrulanır). Yeni ve Aç: `newAction`/`openAction: "page"`, `newPageCode`/`openPageCode: "@<liste>-document"`, `openParams: ["id={{liste.seciliSatir.id}}"]`; ayrıca satır eylemi `acDugmesi` (page). Eski sayfaya dışarıdan gelen bağlar için `openParam` korunur. Belge geçişleri ve belge üreten işlemler liste satır eylemi olarak kalır. Detay kartı ve pencere kalkar (Belge kalıbı liste sayfasında pencere taşımaz).
   Sayfa üretimi için bir betik kullanmak serbest; sonuç UTF-8 olmalıdır.
3. `StandardMenuEndpoints.cs`: `NavigablePageKeys` listesine yeni belge sayfa anahtarını ekleyin (erpPage ve menü).
4. `tests/IntegrationTests/SystemPageStandards.versions.txt`: yeni standart (`=1`) ve yükselen liste sürümü (sıralı). `SystemPageStandardsTests.cs` içindeki tam anahtar listesine yeni anahtarı ekleyin.
5. Liste standardının eski testleri (`tests/IntegrationTests/*SystemPagesTests.cs`, `frontend/erp-web/src/system-pages/<liste>Standard.test.tsx`, Studio `salesStandards.test.ts`) yeni yapıya uyarlanır.

## 6. Studio (`frontend/development-studio/src/platform-tools/erp-src/page-designer/`)

1. `pageTemplates.ts`: `BELGE_DOCUMENTS` listesine modeli ekleyin ve `BELGE_DEFAULTS` içine yeni belge sayfasının varsayılan alan ve kolonlarını yazın (sunucu doğrulaması bunları modele göre denetler). Panel alanları ve kolonları sunucudan `GET /api/document-models/<kod>` ile okur; başka kayıt gerekmez.
2. Test: `pageTemplates.test.ts` (yeni belge varsayılanları).
3. Belge kuralları ekranı (`DocumentRulesPage`) yalnız siparişe aittir; yeni modelde dokunmayın.

## 7. Testler (sunucu)

`tests/IntegrationTests/SalesQuoteDocumentModelTests.cs` ve `SalesQuoteDocumentStandardTests.cs` birebir uyarlanır:

- model (durumlar, geçişler, işlem adları, ortak satır kolonları siparişle aynı, doldurma tablosu),
- belge görünümü (satır, tutar, KDV dökümü, yazma ucunun sileceği veriler: not, koşul, kayıtsız alıcı, kaynak satır no),
- geçiş izinleri (duruma göre; `execute` reddi; kayıt başka belgeye bağlıysa boş),
- işlem günlüğü (geçişler yazar; eski kayıt `activityStartedLate`),
- doldurma, örnek (durumlar, durumsuz = ilk durum, bilinmeyen/sayısal durum = 400, veritabanına dokunmaz),
- yetki yolu (yalnız yeni kaynağa izinli kullanıcı), başka firmanın kaydı 404,
- standartlar (geçerli Belge sayfası, fazla alan/kolon reddi, Liste yeni/aç hedefi, korunan işlemler).

`SalesQuoteBelgeAcceptanceTests` ERP'nin kullandığı uçları (hesap gövdesi, kayıt gövdesi, belge görünümü) uçtan uca sınar.

## 8. Bitirmeden önce

1. `powershell -ExecutionPolicy Bypass -File scripts/Test-Affected.ps1` (dotnet test için ortak kilidi alın, CLAUDE.md), iki ön yüzde `npm run build`, erp-web `npx vitest run src/page-templates src/system-pages`.
2. `docs/phase-status.md`: ne yapıldı, neyin doğrulanmadığı (gerçek SQL'de PUT akışı, tarayıcıda görsel deneme), geçiş olmayıp kalanlar.
3. Sipariş davranışının korunduğunun kanıtı: `SalesOrderDocumentModelTests`, `DocumentTemplate.test.tsx` ve Studio Belge testleri **değiştirilmeden** geçer.

## Teklifte bilerek bırakılanlar (yeni model için karşılaştırın)

Yeni revizyon (yeni kayıt açar), Sipariş oluştur (belgeden belge), Yazdır/PDF (dosya), iptal (teklif API'sinde iptal işlemi yok), onay ve Kurallar (yalnız sipariş). Bunlar için kalıpta "belgeden belge", "ek pencere/yazdırma" ve "özel alan bloğu" yetenekleri gerekir (`docs/superpowers/specs/2026-11-28-satis-cari-yeniden-tasarim-design.md`, "Kalıplarda eksik").

## Fatura ve irsaliyeden öğrenilenler (üçüncü ve dördüncü model)

- **Kayıt tek yazmaysa** (fatura: taslak yok, PUT yok): yeni belge Taslak açılır, kaydet düğmesi geçişin kendisidir (`DocumentBinding.saveLabel`, `savedMessage`), kesilmiş kayıt değişmez. Taslak yalnız kaydedilmemiş belgedir: model durumları kendi `enum`ını (`SalesInvoiceDocumentState`) kullanır, varlığın durumunu değil; örnek (`Sample`) bu enum'la çalışır.
- **Tekrar deneme anahtarı** (`requestId`): `HeaderValues.requestId` şablonda tutulur ve her düzenlemede yenilenir; aynı anahtarla farklı içerik sunucuda 409 verir.
- **Başlıkta yeni alan türleri:** `select` (sabit seçenekler `DocumentFieldView.Options`), `lookup`un teklif/sipariş dışındaki hâli (`values[kod]` ve `values[kod + "Label"]`; depo, vergi profili). `code` yalnız `readOnly` ise salt okunur çizilir (irsaliye numarası kullanıcıdan gelir). Seçim ucu `OPTION_ROUTES` ve gerekirse `searchOptions`ta eşlenir.
- **Bağın ek ayarları:** `writeBase` (kayıt ucu okuma ucundan farklıysa), `transitionBases`, `customFields: false` (özel alan ucu yoksa kayıt engellenmesin), `unpricedLines` (fiyat isteğe bağlı; bedelsiz/fiyatsız satır boş fiyatla gider; izleme, son kullanma ve raf gizli hücre olarak geri gider), `previewBody` her zaman `null` ise hesap yok (tutarlar kayıttan).
- **Okuma iki tabloya bakabilir** (`SalesDeliveryReads`: siparişli/faturalı irsaliye ve siparişsiz irsaliye aynı `/document` ucundan açılır; kimlikler tablolar arasında benzersiz).
- **Geçiş uçları gövde alırsa** (`DocumentTransitionBody`: `requestId`, `reason`), eski uca isteğe bağlı gövde ekleyip gerekçeyi işlem günlüğüne yazın; gövdesiz eski çağıranlar bozulmaz.
- **İşlem günlüğü** fatura/irsaliye gibi birden çok yoldan doğan kayıtlarda her yazma yoluna eklenmelidir (fatura için üç yol), yoksa her kayıt "günlük sonradan başladı" sayılır.
- **Listeye taşınan eski standart** (`sales-deliveries`): her bileşene yuva (slot) verilir; özel alan bloğu gruptan çıkarılıp üst düzey pencere parçası olur ve sekmede listelenir; süzgeç girişleri `above` yuvasına; eski ekran düğmeleri silinir ve `items` ile `requires` listesinden çıkarılır. Belge'ye dönen eski karta düşüş döngü kurmasın diye `openParam` listenin kullanmadığı bir ad olur (`belgeFaturaId`, `belgeIrsaliyeId`).
