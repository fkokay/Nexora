# Uyarlanabilir ERP — yerleşik ekranların sayfa tasarımcısına taşınması

Tarih: 2026-11-18 · Durum: taslak (onay bekliyor)

## Amaç ve neden

Nexora'yı **uyarlanabilir bir ERP** yapmak. Firma yöneticisi, yerleşik ekranları (ör. Stok Kartları) Studio'daki
sayfa tasarımcısında açıp kendi istediği tasarıma çevirebilmeli. Bunu, özel sayfayı nasıl düzenliyorsa öyle yapmalı:
- alanları ve bölümleri taşıyabilmeli,
- kaldırabilmeli,
- kendi göstergelerini, düğmelerini ve listelerini ekleyebilmeli,
- gerektiğinde kod yazabilmeli.

Yerleşik ekranlar "özel sayfa tasarımcısından oluşturulmuş gibi" olmalı: aynı bileşenler, aynı tasarımcı, aynı yayım akışı.

Bugünkü durum:
- **Yerleşik ekranlar.** Her biri ERP'de elle yazılmış React ekranı. Stok ekranı 6.500 satırı aşıyor. İş kuralları API uç
  noktalarının (`Program.cs` ve `*Endpoints.cs`) içinde yazılı.
- **"Görünümü düzenle".** Yalnız alan listesini düzenliyor: göster/gizle, sıra, etiket, bölüm, genişlik.
- **Özel sayfalar.** Bileşen + SQL sorgusu (şema v2) ve tasarım dili bileşenleriyle çalışıyor.

## Kararlar (kullanıcıyla netleşenler)

1. **Tamamen parçalara ayırma.** Yerleşik ekranlar büyük kapalı bloklara değil, tasarımcının genel bileşenlerine bölünür
   (liste tablosu, form kartı, sekmeler…). Her alan ve her düğme tasarımcıda ayrı ayrı yerleştirilebilir.
   Hazır bloklar yolu reddedildi.
2. **İş kuralları korunur ve tek yerde kalır.** Kurallar SQL'e ya da sayfaya kopyalanmaz. Sayfalar ERP'nin mevcut
   işlemlerine "ERP işlemi" olarak bağlanır; kural, yetki, denetim kaydı ve hata mesajları aynı koddan gelir.
3. **Firmanın tasarımı ona aittir ve donmuştur.** Nexora standart ekranı güncellese de firmanın yayımladığı sayfa
   kendiliğinden değişmez.
   - Yeni alan veya işlemler tasarımcıda **seçilebilir** olarak gelir; firma isterse ekler.
   - Hata düzeltmeleri kodda (bileşenlerde ve ERP işlemlerinde) yapılır, tasarımı bozmadan herkese ulaşır.
4. **Sayfada yalnız düzen ve bağlama vardır, mantık koddadır.** Bunun sonucu: sayfaların bağlandığı ERP işlem adları
   (ör. `stok.kart.kaydet`) **geriye dönük uyumludur**. Bir işlemin sözleşmesi değişecekse yeni ad eklenir; eskisi
   kaldırılmaz ve bozulmaz.
5. **Her ekranın firma başına tek tasarımı olur.** Rol veya kullanıcı başına ayrı görünüm yoktur. Farklı ihtiyaç için
   ayrı bir özel sayfa tasarlanır ve menüye eklenir.
6. **Kullanıcı kodu hedefin parçasıdır.**
   - Tarayıcı tarafında yalıtılmış kod bileşeni zaten var.
   - Sunucu tarafında "kaydetmeden önce" gibi kural kancaları ileride eklenecek (Proje 5). Bunlar mevcut WASM eklenti
     altyapısıyla yalıtılır (`AIERP.PluginHost`).

## Hedefler, hedef olmayanlar, kaçınılacaklar

**Hedefler**
- Yerleşik ekran, sistem sayfası olarak bir sayfa tanımıyla çizilir ve tasarımcıda düzenlenebilir.
- Eski ekranın yaptığı her işi aynı kurallarla yapar.
- Tasarımcıda ERP işlemleri, SQL sorguları gibi seçilip bağlanabilir.
- Yeni işlemleri kataloğa açmak ucuz olmalı: bir tanım ve bir test.

**Hedef olmayanlar**
- Rol bazlı görünümler.
- Bu turda sunucu tarafı kullanıcı kodu (Proje 5'e kaldı).
- 94 ekranın hepsini birden taşımak.

**Kaçınılacaklar.** Teknik olarak çalışsa bile başarısızlık sayılacak durumlar:
- Bir sayfanın ERP kuralını atlayarak yazabilmesi. Örnek: doğrudan SQL ile stok hareketi silmek, ters kayıt yerine
  güncellemek.
- Bir Nexora güncellemesinin firmanın yayımlı tasarımını sessizce değiştirmesi veya bozması.
- Sayfanın katalog dışında rastgele bir API yoluna istek atabilmesi.
- Taşınan ekranın eski ekrandan daha az iş yapması. Geçiş ancak eşdeğerlik doğrulanınca olur.

## Yaklaşımlar (ERP işlem kataloğu için)

**A. Katalog = mevcut API uç noktalarının tarifi (seçildi).** Her ERP işlemi sabit adlı bir tanımdır. Tanımda şunlar
bulunur:
- HTTP yöntemi ve yol şablonu,
- parametreler,
- sonuç biçimi,
- etiket.

ERP sayfa çalışma zamanı, işlemi kullanıcının kendi oturum belirteciyle bugünkü uç noktaya gönderir. Aynı kod çalıştığı
için kurallar, yetki zinciri (izin kataloğu, Allow/Deny, satır görünürlüğü), denetim kaydı ve hata mesajları birebir
korunur. Ucuzdur ve yeni işlem açmak bir tanım satırıdır.

**B. Sunucu üzerinden tek kapı.** Sayfa `/api/custom-pages/.../islem/<ad>` adresine gider, sunucu işlemi içeride
çalıştırır. Kurallar korunur ama araya ikinci bir katman girer ve şimdilik bir kazancı yoktur. Sunucu tarafı kullanıcı
kancaları (Proje 5) gerektiğinde, yalnız o işlemler için eklenecek.

**C. Kuralları uygulama servislerine taşımak.** Mimari olarak en temizi, ama yüzlerce satır içi uç noktanın yeniden
düzenlenmesi demek. Tek başına büyük ve riskli bir proje olduğu için reddedildi. Taşıma sırasında dokunulan uç noktalar
zamanla servislere çıkarılabilir; bu katalog sözleşmesini etkilemez.

Seçim, kullanıcının yapım yolunu bırakmasıyla yapıldı (Claude'un kararı). Gerekçe: kural tekrarı sıfır, yetki modeli
aynı, en hızlı genişleyen yol.

## Yol haritası

Her proje ayrı tasarım, plan ve PR dizisiyle ilerler. Sıra bağımlılığa göredir.

1. **ERP veri kaynakları ve işlem kataloğu.** Bu belgede ayrıntılı.
2. **Eksik genel bileşenler.** Stok ekranının ihtiyacına göre:
   - sekmeler,
   - kaynaktan seçim kutusu (arama ile),
   - satır düzenlenen tablo (birim dönüşümleri, varyantlar),
   - özel alanlar bloğu,
   - seçime bağlı alt liste (hareket geçmişi, depo bakiyeleri),
   - sayfalı ve sunucu taraflı arama yapan liste.
3. **Sistem sayfaları.**
   - Yerleşik ekran, Nexora'nın yayımladığı sürümlü bir sayfa tanımı olur.
   - Firma "Tasarımcıda aç" ile kendi kopyasını taslak/yayın düzeniyle düzenler.
   - ERP, yayımlı firma kopyası varsa onu, yoksa standart tanımı çizer.
   - "Standarda dön" her zaman mümkündür.
   - Studio'daki Sayfalar listesinde yerleşik kartlar da "Tasarımcıda aç" düğmesini alır.
   - Standart tanımda olup firma kopyasında olmayan yeni alan ve işlemler tasarımcıda "Yeni" bildirimiyle önerilir.
   - Bugünkü alan düzeni ayarları, ilk açılışta firma kopyasına aktarılır.
   - Adım 3'teki şablon çalışması (Liste, Kayıt kartı, Tanım, Rapor, Ana sayfa) buraya katılır; şablonlar, sistem
     sayfalarının ortak iskeletleri olur.
4. **Pilot: Stok Kartları.**
   - Standart tanım yazılır.
   - Eski ekranla eşdeğerlik listesi çıkarılır ve doğrulanır.
   - Ekran başına bir anahtarla yeni çizime geçilir.
   - Eski ekran bir sürüm boyunca geri dönüş için kalır.
5. **Sunucu tarafı kullanıcı kodu.** Seçili işlemler için "önce/sonra" kancaları. WASM ile yalıtılır, ağ ve gizli
   bilgiye erişimi olmaz. Yaklaşım B bu işlemler için burada devreye girer.
6. **Diğer ekranların taşınması.** Ekran ekran ilerler: önce katalog işlemleri, sonra standart tanım, sonra eşdeğerlik.

Durdurulan iş: tasarım dili Adım 3 (şablonlar) Proje 3'e katıldı. `feat/design-language-step3` dalında kod yok.

## Proje 1 — ERP veri kaynakları ve işlem kataloğu

### Ne yapar

Tasarımcının Sorgular panelinde SQL sorgusunun yanında **ERP işlemi** seçeneği olur. Kullanıcı modül gruplu katalogdan
bir işlem seçer (ör. Stok › Stok kartı kaydet). Parametreler kataloğa göre otomatik dolar ve sayfa değişkenlerine
(`{{stokKodu.value}}`, `{{liste.seciliSatir.Id}}`…) bağlanır. ERP işlemine dayanan sorgu, SQL sorgusu gibi
davranır:
- Okuma işlemleri tablo, form ve göstergeleri besler.
- Yazma işlemleri düğmelere ve İşlem Çubuğu'nun Kaydet/Sil'ine bağlanır.

Mevcut bağlama altyapısı (sorgu kimliği, `refreshQueries`, `saveQuery`/`deleteQuery`, onay, mesajlar) değişmeden
kullanılır.

### Katalog tanımı

Sunucuda tek bir kaynak dosyada statik liste tutulur (Api projesi; ör. `ErpOperationCatalog`). Her kayıt:

| Alan | Açıklama |
|------|----------|
| `name` | Sabit ad, `modul.nesne.eylem` (ör. `stok.kart.listele`). Değişmez, kaldırılmaz. |
| `label`, `module` | Tasarımcıda görünen ad ve grup (Türkçe). |
| `kind` | `read` veya `write`. |
| `method`, `route` | Ör. `PUT /api/stock/items/{id}`. |
| `parameters` | Ad, konum (`route` / `query` / `body`), tip (`text`, `int`, `decimal`, `date`, `bool`, `guid`, `object`), zorunluluk. |
| `result` | Okuma için biçim: `list` (satırlar hangi JSON yolunda, sütunlar ve tipleri), `record` (alanlar) veya `none`. |
| `since` | Eklendiği sürüm. Tasarımcıdaki "Yeni" bildirimi için. |
| `deprecated` | İsteğe bağlı. Yeni sayfalarda seçilemez, var olan sayfalar çalışmaya devam eder. |

Yetki ayrıca tanımlanmaz. İstek gerçek uç noktaya gittiği için mevcut zincir uygulanır: izin kataloğu, Allow/Deny
kuralları, rol kontrolü, satır görünürlüğü. Tasarımcı, kullanıcının çağıramayacağı işlemleri gri gösterir. Bunun için
izin kataloğundaki rota/yöntem eşlemesi kullanılır.

### Sayfa şeması (v2'ye ekleme)

`queries[]` öğesine `operation` alanı eklenir. `operation` olan sorguda `sql` bulunmaz. `kind` katalogdan türetilir ve
tutarlı olmalıdır: okuma işlemi `read`, yazma işlemi `insert` / `update` / `delete` türlerinden biri.

Sunucu doğrulaması (`TenantCustomPageSchema`):
- İşlem adı katalogda olmalı.
- Parametre adları ve tipleri katalogla eşleşmeli; zorunlu parametreler bağlanmış olmalı.
- `deprecated` işlemler yalnız mevcut sayfalarda kabul edilir.
- Okuma ve yazma kuralları SQL sorgularıyla aynıdır. Örnek: `saveQuery` yazma, tablo `query` okuma olmalı.

### Çalışma zamanı (ERP Web)

- Sorgu çalıştırma katmanı (`usePageQueries`) ERP işlemine dayanan sorgu için şunları yapar:
  - Yol şablonunu tipli ve URL kodlanmış parametrelerle doldurur. Guid ve sayı dışı değer yol parametresi olamaz;
    yol enjeksiyonu engellenir.
  - Query string'i ve JSON gövdesini kurar.
  - Mevcut kimlikli istemciyle isteği gönderir.
- Yalnız katalogdaki işlemler çağrılabilir. Çalışma zamanı kataloğu sunucudan alır, sayfa tanımındaki yol bilgisine
  güvenmez.
- Sonuç eşleme: `list` sonucu tabloya satır olarak, `record` sonucu forma ve değişkenlere gider. Bağlama yolları
  bugünkü gibidir: `{{sorgu.rows}}`, `{{sorgu.ilkSatir.X}}`.
- Hatalar:
  - **400 doğrulama yanıtı:** alan hataları, ilgili parametreye bağlı giriş kutusunun altında gösterilir; diğerleri
    durum satırına yazılır.
  - **403:** "Bu işlem için yetkiniz yok."
  - **404 ve 409:** sunucunun mesajı aynen gösterilir.
- Eşzamanlılık: `RowVersion` alan uç noktalarda değer okuma sonucundan alınıp yazmaya geri bağlanır. Katalogdaki
  parametre tanımı bunu belirtir.
- Tekrar korumalı uç noktalar için işlem başına bir tekrar koruma anahtarı üretilir.

### Studio

- Sorgular panelinde "SQL sorgusu / ERP işlemi" seçimi bulunur.
- ERP işlemi modül gruplu ve aranabilir bir listeden seçilir.
- Parametre bağlama alanları katalogdan otomatik oluşturulur.
- Okuma işlemleri taslakta önizlenebilir; önizleme, Platform API'ye kullanıcının belirteciyle gider.
- Yazma işlemleri önizlemede asla çalışmaz.
- Değişkenler panelinde ERP sorgu sonuçlarının alanları listelenir.

### Gözden geçirmede netleşenler (Claude'un kararları)

1. **Tam kayıt değiştiren yazmalar (oku → değiştir → yaz).** `PUT /api/stock/items/{id}` gibi uç noktalar kaydın
   tamamını ister. Firma bir alanı formdan kaldırsa bile o alan silinmemelidir.
   - Katalog, böyle bir yazma işlemi için **kaynak okuma işlemini** belirtir. Örnek: `stok.kart.guncelle` için
     `stok.kart.getir`.
   - Çalışma zamanı gövdeyi kaynak okuma sonucundan başlatır. Sayfanın bağladığı alanlar bunun üstüne yazılır.
   - Böylece gizlenen alanlar mevcut değerini korur, `RowVersion` da okuma sonucundan gelir. Uç noktalar
     değiştirilmez.
   - Şema doğrulaması, böyle bir yazma işleminin sayfada kaynak okuma sorgusu da bulunmasını şart koşar.
2. **Gövde parametre modeli.** Gövdenin her üst düzey JSON alanı ayrı bir parametredir ve düz bağlanır. İç içe ve dizi
   alanlar (birim dönüşümleri, varyantlar) `list` tipindedir. Proje 1'de bunlar kaynak okumadan aynen taşınır; sayfadan
   düzenlenmeleri Proje 2'deki satır düzenlenen tabloyla gelir.
3. **Yetki otoritesi ERP'dir.** ERP işlemlerinde geçerli olan, kullanıcının ERP yetkileridir: izin kataloğu,
   Allow/Deny ve rol.
   - SQL sorguları ERP kurallarını atladığı için onlarda ek sayfa yazma hakkı vardı.
   - ERP işlemi ise kullanıcının eski ekranda zaten yapabildiğinden fazlasını yapamaz. Bu yüzden sayfa düzeyinde ek
     yazma hakkı aranmaz; sayfayı görme hakkı yeterlidir.
   - Studio önizlemesi yazma işlemi hiç çalıştırmaz.
4. **Yazma sonucu bağlanabilir.** Yazma işleminin yanıt gövdesi `{{sorguAdi.sonuc.X}}` olarak sayfaya açılır. Örnek:
   yeni kartın `Id` ve `RowVersion` değeri. Ayrıca yazmadan sonra `refreshQueries` ile okumalar yenilenir. Yeni kart
   kaydedilince sayfa düzenleme kipine geçebilir ve ikinci kayıtta 409 almaz.
5. **Rapor kaynakları.** Her rapor kaynağı ayrı ve kararlı bir katalog adı alır (`rapor.<kaynak>`, ör.
   `rapor.stockItems`). Hepsi `POST /api/reports/run` uç noktasına gider. Bir test, rapor kaynakları listesiyle katalog
   kayıtlarının eşit olduğunu doğrular.
6. **Kod bileşeni.** Proje 1'de yalıtılmış kod bileşeninin ERP işlemlerine erişimi yoktur. Kataloğa sınırlı bir köprü,
   kullanıcı kodu çalışmasında (Proje 5) ayrıca tasarlanır.
7. **Toplu içe aktarma kapsam dışıdır.** Dosya yükleme ve kendi tekrar korumasıyla ayrı bir biçim; ilk katalogda
   yoktur.

### İlk katalog kapsamı

Pilot ekranın (Stok Kartları) ihtiyacı kadardır.
- **Stok kartı:** listele (arama ve sayfa), getir, oluştur, güncelle, sil, pasife al, aktifleştir.
- **İlişkili okumalar:** hareketler, varyantlar, özel alan tanımları ve değerleri, kategoriler, depo bakiyeleri.
- Mevcut rapor kaynakları (`/api/reports/catalog`) okuma işlemi olarak katalogda yer alır.

Uç noktaların tam listesi ve istek/yanıt tipleri koddan çıkarılır (`Program.cs` 1817–2240 civarı).

### Güvenlik

- Yeni ayrıcalık yoktur. İstekler kullanıcının kendi belirteciyle mevcut uç noktalara gider.
- Sayfa yalnız katalog işlemlerini çağırabilir. Kiracı kapsamı yine yalnız doğrulanmış `tenant_id` talebinden gelir.
- Studio önizlemesi yazma işlemi çalıştırmaz.

### Testler

- **Katalog-uç nokta tutarlılık testi.** Katalogdaki her `method` + `route` çiftinin uygulamada gerçekten kayıtlı bir
  uç noktaya karşılık geldiğini doğrular (EndpointDataSource üzerinden). Her yazma işleminin izin kataloğunda bir
  karşılığı olduğunu da denetler.
- **Ad kararlılığı testi.** Katalogdaki adların bir kayıt dosyasıyla karşılaştırılması: ad silinemez veya
  değiştirilemez, yalnız eklenebilir.
- Şema doğrulama testleri: v2 testlerine ek.
- ERP Web Vitest testleri: yol doldurma, kodlama, hata eşleme, sonuç eşleme.
- QA test firmasında canlı görsel kontrol: ERP işlemlerine bağlı bir deneme sayfası.

## Yapımcıya kalanlar

- Katalog dosyasının yeri ve tam C# biçimi.
- Katalogun Studio'ya hangi uç noktadan verileceği.
- Kullanıcının çağıramayacağı işlemlerin tespiti için izin kataloğu eşlemesinin nasıl yeniden kullanılacağı.
- Varsayılan liste sayfa boyutu.
- Okuma işlemlerinde sonuçların önbelleğe alınması.
