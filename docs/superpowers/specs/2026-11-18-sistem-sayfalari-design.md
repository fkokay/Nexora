# Sistem sayfaları — tasarım eki (Proje 3)

Tarih: 2026-11-18 · Durum: taslak (onay bekliyor) · Ana belge: `2026-11-18-uyarlanabilir-erp-design.md`
(Yol haritası 3; kararlar 3, 4, 5)

Bu ek, yerleşik bir ekranın Nexora'nın yayımladığı sürümlü bir sayfa tanımıyla çizilmesini ve firmanın bu tanımın
kendi kopyasını tasarımcıda düzenlemesini anlatır. Proje 3 yalnız altyapıyı ve **tek bir küçük örnek tanımı**
(Depo Yönetimi listesi, `depo.listele`) kurar. Gerçek Stok Kartları tanımı Proje 4'tür.

## Terimler

- **Ekran anahtarı (`screenKey`).** ERP yönlendiricisinin ve standart menünün sayfa anahtarıdır
  (`StandardMenuEndpoints.Catalog`, `WorkspacePageRouter`; ör. `inventory-warehouses`).
  - `/api/screen-views/catalog` anahtarları ayrı bir uzaydır. Bunların bir kısmı alt listedir ve bir yönlendirici
    sayfası birden çok görünüm barındırabilir.
  - Standart tanım, hangi görünüm anahtarlarını içine aldığını kendisi bildirir (aşağıda `screenViews`).
- **Standart tanım.** Nexora'nın bir ekran için yayımladığı sayfa tanımıdır (şema v2).
- **Firma tasarımı (override).** Firmanın standart tanımdan türettiği, taslak/yayın düzeniyle yönetilen kopyadır.

## 1. Standart tanımın dağıtımı

**Karar: Api projesine gömülü JSON kaynakları.**
- Dosyalar `src/Hosts/AIERP.Api/SystemPages/Standards/<screenKey>.json` yolunda, `EmbeddedResource` olarak tutulur
  (`VukUsefulLifeCatalog` ile aynı yöntem).
- `SystemPageStandards` bunları ilk kullanımda bir kez yükler ve doğrular. Geçersiz bir dosya, uygulamanın açılışında
  hata verir; testler de aynı doğrulamayı çalıştırır.

Dosya biçimi bir zarftır. Sayfa tanımı `definition` alanında, değiştirilmeden durur. Şemanın kök anahtarları kapalıdır
(`schemaVersion`, `components`, `queries`), bu yüzden sürüm bilgisi tanımın içine değil zarfa yazılır.

```json
{
  "screenKey": "inventory-warehouses",
  "title": "Depo Yönetimi",
  "module": "Stok & Depo",
  "version": 1,
  "stage": "preview",
  "items": {
    "component:depoListesi": { "since": 1, "label": "Depo listesi", "requires": ["query:depolar"] },
    "query:depolar":     { "since": 1, "label": "Depoları listele" }
  },
  "screenViews": [
    { "key": "inventory-warehouses", "component": "depoListesi",
      "fields": { "code": "code", "name": "name", "status": "isActive" } }
  ],
  "definition": { "schemaVersion": 2, "components": [], "queries": [] }
}
```

**Kurallar.** Yükleyici ve testler bunları denetler.
- `version` bir tamsayıdır ve ekran başına artar. Bir kayıt dosyası (`SystemPageStandards.versions.txt`) sürümün
  düşmediğini doğrular.
  - ERP işlem kataloğundaki `since` alanı bir tarihtir. O, tasarımcıdaki işlem "Yeni"si içindir; buradaki sürüm ise
    ekran başına bir sayaçtır.
- `definition` sunucu şemasından geçmelidir (`TenantCustomPageSchema.Validate`). Ayrıca şu yasaklar vardır:
  - SQL sorgusu yoktur; yalnız ERP işlemine bağlı sorgu bulunur.
  - Kod bileşeni yoktur.
  - Bu sayede standart tanımın sunucuda çalıştırılacak bir sorgu yolu olmaz.
- Her üst düzey bileşen ve her sorgu `items` içinde yer alır. Kimlikler kalıcıdır; yayımlanmış bir kimlik başka bir şey
  için yeniden kullanılmaz.
- Standart tanım kaldırılmaz. Her `k` sürümü için, yalnız `since ≤ k` öğelerinden (ve `requires` bağımlılıklarından)
  kurulan tanım da şemadan geçmelidir. Böylece eski bir firma tasarımına her "Yeni" öğe tek başına eklenebilir.
- `stage: "preview"` olan bir tanım, eski ekranın bütün işlevlerini içermez. Studio bunu uyarıyla gösterir.

## 2. Firma tasarımının saklanması

**Karar: mevcut özel sayfa tablolarını yeniden kullanmak.** Yeni tablo açılmaz;
`TenantCustomPages` / `TenantCustomPageRevisions` genişletilir.

Gerekçe: özel sayfaların bütün akışı zaten sayfa koduna bağlıdır ve sistem sayfasının da bunlara ihtiyacı vardır. Yeni
tablo, bunların hepsini ikinci kez yazmak demektir:
- taslak, yayın, geçmiş ve geri yükleme uç noktaları;
- önizleme;
- sorgu çalıştırma (`/{code}/queries/{id}/run`) ve yazma denetim kaydı;
- erişim satırları (`TenantCustomPageAccess`, Platform DB);
- tasarımcının tamamı.

**Genişletme migration'ı.** Platform ve Tenant bağlamlarının ikisi de bu varlığı eşler.
- `TenantCustomPages.ScreenKey varchar(40) NULL`
- `TenantCustomPages.StandardVersion int NULL`: taban sürüm, yani firma tasarımının dayandığı ya da en son "gördüm"
  dediği standart sürüm.
- `TenantCustomPageRevisions.StandardVersion int NULL`
- CHECK kısıtı: `ScreenKey IS NULL OR (Code = '@' + ScreenKey AND StandardVersion >= 1)`.
- `(TenantId, ScreenKey)` üzerinde, `ScreenKey IS NOT NULL` süzgeçli bir indeks.

**Sayfa kodu `@<screenKey>`.**
- `@`, `ValidCode` içinde yasak bir karakterdir. Bu yüzden firma sayfalarıyla çakışma olamaz ve `/drafts` uç noktası
  bu kodu kabul etmez.
- Mevcut "kod başına tek taslak ve tek yayın" indeksleri, **firma başına ekran başına tek tasarım** kuralını (karar 5)
  kendiliğinden sağlar.
- InMemory sağlayıcısı süzgeçli indeksi ve CHECK kısıtını uygulamaz. Bu yüzden uç noktalar aynı kuralı serializable
  işlem içinde kendisi denetler; SQL Server tarafını bir `SqlServerAcceptanceFact` doğrular.

**Var olan uç noktalara etkisi** (yalnız ekleme):
- Liste özetine `screenKey` eklenir; Studio, özel sayfalar listesinde bu satırları göstermez.
- Menü hedefleri (`GetTargetsAsync`) sistem satırlarını dışarıda bırakır.
- `/{code}/published`, sistem satırı için 404 döner; çalışma zamanı ayrı bir uç noktadan okur.
- Erişim uç noktaları `@` kodunu da kabul eder.
- Geri yükleme, `ScreenKey` ve `StandardVersion` değerlerini de taşır.

**Geri dönüş (rollback) etkisi.** Eski sürüm yeni sütunları bilmez. Firma tasarımı oluşturulduktan sonra geri dönülürse
bu satırlar eski Studio'da özel sayfa gibi listelenir. Bu zararsızdır, çünkü kod `@` ile başlar ve menüye bağlı
değildir. Daraltma (contract) adımı gerekmez.

**Geçmiş, ekran anahtarı üzerinden okunur.** Yayın ve geri yükleme satır oluşturur ya da arşivler. Bu yüzden sistem
sayfasının geçmişi, aynı koda sahip bütün satırların revizyonlarından birleştirilir
(`GET /api/system-pages/{screenKey}/history`, her revizyonda `customPageId` bulunur). Geri yükleme mevcut
`/api/custom-pages/{id}/restore/{revisionId}` uç noktasıyla yapılır.

**"Standarda dön". Karar: standarttan kopyalanmış yeni bir revizyon.**
- Açık taslak varsa içeriği değiştirilir; yoksa yeni bir taslak açılır. `ChangeKind` değeri `ResetToStandard`,
  `StandardVersion` değeri güncel sürümdür.
- Yayımlanana kadar ERP'deki ekran değişmez. Geçmiş korunur ve işlem geri alınabilir.
- Sonucu: firma, o anki vN sürümüne sabitlenir. Sonraki standart güncellemeleri yine "Yeni" önerisi olarak gelir
  (karar 3: tasarım donmuştur).
- Ayrıca **"Firma tasarımını kaldır"** vardır: yayımlı satırı mevcut DELETE uç noktasıyla arşivler.
  - Ekran geçiş anahtarı açıksa ekran, canlı standart tanımı izler.
  - Anahtar kapalıysa eski React ekranına döner.
  - Studio bu sonucu onay metninde açıkça yazar.

## 3. ERP yönlendirmesi

Bir ekranın nasıl çizileceğine şu kural karar verir:

| Durum | Çizim |
|---|---|
| Yayımlı firma tasarımı var | Firma tasarımı |
| Yayımlı firma tasarımı yok (yalnız taslak olması sayılmaz), ekranın geçiş anahtarı açık | Standart tanım |
| Diğer bütün durumlar | Eski React ekranı |

**Geçiş anahtarı.**
- Dağıtım düzeyinde bir yapılandırmadır: `SystemPages:StandardEnabled` (ekran anahtarı dizisi).
- Başlangıçta boştur, yani hiçbir ekran için açık değildir.
- Firma bazında pilot için anahtar gerekmez: firma tasarımını yayımlamak, o firmada yeni çizime geçmek demektir.

**Yönlendirme haritası.**
- ERP Web, firma seçildikten sonra `GET /api/system-pages/runtime` çağrısıyla haritayı alır:
  `{ screens: { "<screenKey>": { mode: "override" | "standard", revision } } }`.
- Harita yüklenene kadar yerleşik ekranlarda yükleniyor durumu gösterilir. Hangi ekranın standart tanımı olduğu,
  harita gelmeden bilinmez; harita, firma seçimi başına tek bir küçük istektir.
- Çağrı başarısız olursa ya da 404 dönerse her ekran eski ekranla açılır.
- Harita eskimiş olabilir; örneğin firma tasarımı harita yüklendikten sonra kaldırılmıştır. Bu durumda sistem
  kipindeki `/published` çağrısı 404 döner ve o ekran hata göstermeden eski ekrana düşer.

**Çizim.**
- `WorkspacePageRouter`, haritada bulunan bir anahtar için `TenantCustomPage`'i sistem kipinde açar
  (`systemScreenKey`). Bu kip, tanımı `GET /api/system-pages/{screenKey}/published` uç noktasından okur. Yanıt,
  `PublishedPage` biçimine `screenKey`, `source` ve `standardVersion` alanlarının eklenmiş halidir.
- Firma tasarımının SQL sorguları, mevcut `/api/custom-pages/@<screenKey>/queries/{id}/run` yoluyla çalışır.
- Firma tasarımı yokken standart tanım şöyle sunulur:
  - Kimliği, ekran anahtarından türetilmiş sabit bir GUID'dir; revizyon, standart sürümdür. `PageBody` bileşeninin
    `id:revision` anahtarı bu yüzden kararlıdır.
  - Hakları yalnız görmedir.
  - SQL içermediği için sunucuda çalıştırılacak bir sorgusu yoktur; ERP işlemleri doğrudan kendi uç noktalarına gider.

**Geçiş dönemi.**
- Sistem sayfasının başlığında **"Eski ekranda aç"** bağlantısı bulunur. Bağlantı, o ekranı oturum boyunca eski
  ekrana çevirir.
  - Bu, yönlendiricinin kendi durumudur; sayfa anahtarı değişmez. Böylece App'in sekme, başlık ve `module:`
    denetimleri etkilenmez.
- Eski ekranın üstünde ince bir şerit görünür: "Eski ekran görüntüleniyor." ve "Yeni tasarıma dön".

## 4. "Yeni" bildirimleri

- `GET /api/system-pages/{screenKey}/new-items`, standart tanımın `items` girdilerini firma tasarımıyla karşılaştırır.
  Karşılaştırma açık taslakla yapılır; taslak yoksa yayımlı tasarımla yapılır.
- Bir öğe şu iki koşulu birlikte sağladığında önerilir:
  - `since` değeri, tasarımın `StandardVersion` değerinden büyüktür;
  - öğenin kimliği tasarımda yoktur.
- Firmanın sildiği eski öğeler (`since ≤ taban`) yeniden önerilmez; tasarım donmuştur.
- Yanıtta her öğe için etiket, tür, `since`, bileşenin ya da sorgunun JSON'u ve `requires` listesi bulunur.

**Studio'da.**
- Tasarımcıda bir şerit görünür: "Nexora standart tasarımında {n} yeni öğe var."
- Listedeki her öğenin **"Ekle"** düğmesi vardır. Ekleme istemcide yapılır:
  - bileşen sayfanın sonuna, eksik `requires` sorguları da sorgu listesine eklenir;
  - geri alma ve kaydetme her zamanki gibi çalışır.
- **"Tümünü yok say"** düğmesi taslağın `StandardVersion` değerini güncel sürüme çeker. Bu değer, PUT gövdesindeki
  isteğe bağlı `standardVersion` alanıyla yazılır. Değer düşürülemez ve güncel sürümü aşamaz.
- Öğelerin hepsi eklendiğinde de taban aynı şekilde güncellenir.

## 5. "Görünümü düzenle" ayarlarının aktarılması

Aktarma yalnız standart tanımı olan ekranlarda ve **ilk firma taslağı oluşturulurken** bir kez yapılır. Koşul, o kodla
hiç satır bulunmamasıdır (arşivlenmiş satırlar da sayılır).
- Kaynak: standart tanımın `screenViews` listesindeki her görünüm anahtarının yayımlı `TenantScreenView` satırı.
- Hedef: o görünümün bağlı olduğu `dataTable` bileşeninin `columns` listesi. Gizlenen alanların sütunları çıkarılır.
- Bugünkü `dataTable` sütun sırasını ve etiketini sonuç sütunlarından alır. Bu yüzden **yalnız görünürlük aktarılır**.
  Sıra, etiket, genişlik ve bölüm aktarılmaz.
  - Yayımlı özel sayfaların çizimini değiştireceği için bileşen davranışı bu amaçla değiştirilmez.
- Karşılığı olmayan alanlar atlanır. Örnek: `inventory-warehouses` görünümündeki `availability` alanının `WarehouseView`
  içinde karşılığı yoktur; `status` alanı `isActive` sütununa eşlenir.
- Aktarılmayan her ayar, yanıttaki `importNotes` listesinde Türkçe bir notla bildirilir. Studio bu notları taslak
  açılınca gösterir.
- `TenantScreenView` satırları silinmez; eski ekran onları kullanmaya devam eder.

## 6. Studio

- Sayfalar listesi `GET /api/system-pages` çağrısıyla standart tanımları da okur.
- **Standart tanımın içine aldığı bir görünüme ait yerleşik kart:**
  - **"Tasarımcıda aç"** düğmesini alır ve "Sistem sayfası" rozetini gösterir;
  - durum etiketlerinden biri görünür: "Standart", "Taslak var" veya "Firma tasarımı yayında";
  - `stage: "preview"` ise "Önizleme" etiketi de görünür.
- **Standart tanımı olmayan ekranların kartları:** "Görünümü düzenle" düğmesi aynen kalır.
- **Bir görünüm kartıyla eşleşmeyen standart tanım:** ayrı bir yerleşik kart olarak eklenir.
- "Tasarımcıda aç", `POST /api/system-pages/{screenKey}/draft` çağrısını yapar. Uç nokta idempotenttir:
  - açık taslak varsa onu döner;
  - yoksa, yayımlı firma tasarımı varsa ondan yeni bir taslak açar;
  - o da yoksa standarttan taslak oluşturur ve görünüm ayarlarını aktarır.
- Ardından aynı tasarımcı (`CustomPagesPage`) sistem kipinde açılır. Sistem kipinde:
  - kod alanı kilitlidir;
  - sayfayı silme düğmesi yerine "Firma tasarımını kaldır" bulunur;
  - "Standarda dön" düğmesi bulunur;
  - geçmiş, ekran anahtarı üzerinden okunur;
  - "Yeni" şeridi gösterilir;
  - `stage: "preview"` tanımlar için şu uyarı görünür: "Bu standart tanım önizleme aşamasında; eski ekranın tüm
    işlevlerini içermez."

## 7. Yetkiler

- **Düzenleme.** Firma tasarımı oluşturmak, düzenlemek, yayımlamak, geri yüklemek, standarda döndürmek ve kaldırmak
  için iki koşul birlikte aranır:
  - mevcut `erp.tenant-customizations` izinleri;
  - **doğrulanmış TenantAdmin** (`IsVerifiedTenantAdminAsync`: rol talebi ve güncel üyelik).

  Bu, özel sayfalardan sıkıdır: sistem sayfası her kullanıcının günlük ekranıdır. TenantUser kartı görür, ama
  "Tasarımcıda aç" düğmesi gerekçe metniyle devre dışıdır.
- **SQL, yazma ve kod kuralları** özel sayfalarla aynıdır (`QueryPageWriteAllowedAsync`, `QuerySqlVisibleAsync`).
- **Çalışma zamanında görme hakkı.**
  - Sistem satırında `pageHasQueries` yerine **yalnız SQL sorgusu varlığı** dikkate alınır. Erişim satırı yoksa her
    üye görür.
  - ERP işlemlerinin yetkisini gerçek uç noktalar verir (ana belge, Proje 1 kararı 3). Böylece ERP işlemi içeren bir
    firma tasarımı sıradan kullanıcılar için kaybolmaz.
  - Yayımlarken erişim satırı yalnız SQL sorgusu varsa istenir. Erişim satırı varsa her zamanki gibi o uygulanır.
- **Yeni rotalar** `PlatformPermissionCatalog` içinde eşlenir:
  - `GET /api/system-pages/runtime` ve `GET /api/system-pages/{screenKey}/published`: menü gezintisiyle aynı
    `erp.custom-menus` okuma izni;
  - diğer bütün rotalar: `erp.tenant-customizations`.
- Kiracı kapsamı yalnız doğrulanmış `tenant_id` talebinden gelir. Yeni ayrıcalık eklenmez.

## Kapsam dışı

- Stok Kartları standart tanımı ve eşdeğerlik doğrulaması (Proje 4).
- Liste, Kayıt kartı, Tanım, Rapor ve Ana sayfa şablonları. Bunlar Proje 4 ile ekran ekran gelir; Proje 3 yalnız
  zarf biçimini sabitler.
- Özelleştirme paketlerine (`TenantCustomizationPackageEndpoints`) sistem sayfalarının eklenmesi.
- Görünüm sütun sırası ve etiketinin aktarılması.
- `TenantScreenView` satırlarının daraltılması.
