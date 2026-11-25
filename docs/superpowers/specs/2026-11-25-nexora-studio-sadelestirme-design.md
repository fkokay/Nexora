# Nexora Studio sadeleştirme — tasarım

Tarih: 2026-11-25 · Durum: taslak, onay bekliyor · Taban: `origin/master` `a2b0292f`

Taslak ekranlar (tıklanabilir HTML): `docs/design-proposals/studio-sadelestirme/`

| Dosya | Ne gösteriyor |
|---|---|
| `01-liste-paneli.html` | Liste (ızgara) bileşeninin sade ayar paneli, cihaz önizlemesi, detay paneli |
| `02-detay-ekrani.html` | Detay ekranı: Sekme → Bölüm → Alan, sürükle-bırak, 1/2/3 kolon |
| `03-bilesenler.html` | Kalan 10 bileşenin ayar paneli ve tuval görünümü |
| `04-sayfa-kaliplari.html` | Sayfa kalıpları: sabit iskelet (gri) ve danışman alanları (mor) |
| `05-belge-kurallari.html` | Belge kuralları: durum çizgisi, üç katman, cümle kurucu, "Dene", işlem günlüğü |
| `06-yazilimci-ekrani.html` | Yazılımcı ekranı: talep, firma modülü, veri kaynağı formu, uzantı, sürüm yayınlama |
| `07-studio-yapisi.html` | Studio'nun rol bazlı yeni menüsü ve ekranları; eski araçların yeni yerleri |

---

## 1. Amaç ve neden

Nexora Studio'yu **basit ama gelişmiş** bir geliştirme ortamına dönüştürmek. Bugün sayfa tasarımcısı kullanılamayacak kadar karmaşık:

- `CustomPagesPage.tsx` yaklaşık 4.200 satır, 51 `useState`. `page-designer/` altında 97 dosya var.
- 30 bileşen tipi var ve her birinin kendine ait bir ayar düzeni var. Örneğin ızgaranın dört sekmesi (Veri, Sütunlar, Satır eylemleri, Görünüm) ve 30'dan fazla ayarı var. Bu ayarların çoğu teknik: sorgu adı, `{{liste.seciliSatir}}`, `acDugmesi`, 12 kolonluk genişlik, "daralma kuralı".
- Ekran tasarlamak için beş ayrı araç var: Özel formlar, Sayfa tasarımcısı, LowCodeDesigner, Hazır ekran görünümleri, UIDesigner. Otomasyon için de iki ayrı araç var: İş akışları ve İş kuralları.

Karmaşıklığın üç kök nedeni tespit edildi:

1. **İki kitlenin işi aynı panelde.** Danışmanın ekran ayarlarıyla yazılımcının sorgu, formül ve komut işleri iç içe duruyor.
2. **Modül iş mantığı sayfa ayarlarına sızmış.** Yerleşik ekranlar sistem sayfalarına taşınırken eksik kalan her davranış tasarımcıya yeni bir ayar olarak eklenmiş. Satış envanterindeki G-S7, G-S8 ve G-S9 bunun örnekleri (`docs/superpowers/specs/2026-11-21-satis-ekranlari-envanteri.md`). `gridFormula`, `countWhen`, `conditions`, `wizardParts` ve `barCommands` bu ihtiyaçlardan doğmuş.
3. **İki ayrı çizici var.** Studio'nun tuvali (`CanvasPreviews.tsx` ve `CustomPagesPage.tsx`) ERP'nin çizicisinin (`frontend/erp-web/src/TenantCustomPage.tsx`, yaklaşık 3.500 satır, `custom-page/` altında 117 dosya) elle tutulan bir kopyası. Kodda onlarca "ERP ile aynı" yorumu var. İki taraf ayrıştıkça "tasarımcıda düzgün, ERP'de kaymış" sorunu çıkıyor. Kullanıcının en çok yaşadığı kayma sorunu bu.

## 2. Kitle ve roller (kullanıcının kararı)

- **Danışman:** ERP'yi ve müşterinin sürecini bilir, kod yazmaz. **Yalnızca ekran tasarlar** ve cümleyle kurulan basit kurallar ekler.
- **İş ortağının yazılımcısı:** **yalnızca kod yazar.** Sorgular, eylemler, uzantılar ve özel bileşenler onun işidir.
- **Nexora yazılımcısı:** modül çekirdeğini (satış, stok, cari…) Nexora deposunda, normal PR süreciyle yazar.
- Danışman ile iş ortağı yazılımcısı **aynı sayfa üzerinde** çalışır. Aralarındaki bağ, yazılımcının yayınladığı **yapı taşları kataloğu**dur. Danışman eksik bir şey gördüğünde "Yazılımcıdan iste" ile mevcut Geliştirme talepleri ekranında talep açar.

| | Nexora yazılımcısı | İş ortağı yazılımcısı | Danışman |
|---|---|---|---|
| Modül çekirdeği | ✓ | ✗ | ✗ |
| Firma modülü (veri kaynağı, eylem, uzantı, bileşen) | ✓ | ✓ | ✗ |
| Ekran tasarımı, cümle kuralları | ✓ | ✓ | ✓ |

## 3. Hedefler, hedef olmayanlar, anti-hedefler

**Hedefler**
- Tasarımcıda görünen ekran, ERP'de birebir aynı görünür.
- Kullanıcı her ERP ekranında aynı sayfa yapısını görür. Firmaya özel ekranlar sistem ekranlarından ayırt edilemez.
- Danışman 11 bileşen ve tek bir panel düzeniyle bütün ekranlarını kurabilir. Bir bileşenin ayarları 5–6 maddeyi geçmez, sekme ya da açılır pencere yoktur.
- Yerleşim cihaza göre otomatik olur. Danışman cihaz başına düzen kurmaz.
- Modül kuralları sunucuda, belgenin kendisinde durur. Sayfa kural tekrarlamaz.
- Yazılımcının her işi Git'te sürümlenir, denenebilir, incelenebilir ve geri alınabilir.

**Hedef olmayanlar**
- ERP'nin yayımlanmış sayfa formatını baştan tasarlamak (bkz. §5.2).
- Serbest (piksel ya da mutlak konumlu) sayfa tasarımı.
- Danışmana formül ya da kod yazdırmak.

**Anti-hedefler** (çalışsa bile başarısızlık sayılır)
- Canlıdaki bir müşteri sayfasının **davranışının** değişmesi: aynı veri, aynı eylemler, aynı yetkiler. **Görünüşün** kalıba uyacak şekilde değişmesine izin var. Bu değişiklik bütün sayfalarda toplu ve kontrollü bir geçişle yapılır (§7, kullanıcının kararı).
- Studio ile ERP'de aynı çizimin iki ayrı kodla sürdürülmeye devam etmesi.
- Danışman panelinde teknik bir terimin görünmesi: sorgu adı, `{{…}}` bağlama, iç kod adı, kolon sayısı (12'lik ızgara).
- Kalıbın iskeletinin sayfa sayfa değiştirilebilmesi. Bu, tutarlılığı yeniden bozar. Kalıba uymayan sayfalar için kabuğun içi serbestleşir, kabuğun kendisi değişmez (§6.1).

## 4. Kısıtlar

- **Canlı sayfalar var.** Firmaların yayımlanmış özel sayfaları ve sistem sayfası tasarımları canlıda kullanılıyor. Sorguları sayfa tanımının içinde. SQL sorguları canlıda açık.
- **Studio ve ERP ayrı uygulamalar.** `frontend/development-studio` ve `frontend/erp-web` ortak paket kullanmıyor, ayrı alan adlarında yayınlanıyor ve ayrı ayrı deploy ediliyor (Studio tek başına sık sık deploy ediliyor).
- **ERP Studio içinde çerçeveye alınabiliyor.** `deploy/docker/erp-web.nginx.conf:18` Studio'nun alan adına `frame-ancestors` izni veriyor. Platform API'si (`WebSecurityHeadersExtensions.cs`) `X-Frame-Options: DENY` kullanıyor, ancak bu yalnızca API yanıtları için geçerli.
- **ERP'de taslak önizleme modu var.** `TenantCustomPage` `previewId` aldığında `/api/custom-pages/{id}/preview` adresinden çizer ve yazma işlemlerini engeller (`writeAction.blockedInPreview`). Studio bugün bu önizlemeyi `customPagePreview=<taslakId>` (sistem sayfası için `page=<anahtar>&systemPreview=<taslakId>`) ile **yeni pencerede** açıyor (`CustomPagesPage.tsx` `openErpPreview`). Önizlemenin çalışması için taslağın önce kaydedilmesi gerekiyor.
- **Modüller bugün Rust ile yazılıp WASM'a derleniyor** (`moduleStarterFiles.ts`: `aierp_invoke` içinde `action` eşleşmesi, `manifest.json`). Kod çalışma alanı, Git bağlantısı, dosya gezgini, sürüm penceresi (`ReleaseDialog`) ve test keşfi (`TestDiscoveryDialog`) Studio'da zaten var.
- **ERP işlem kataloğu var:** `GET /api/custom-pages/erp-operations` (`erpOperations.ts`). Her işlemin parametreleri, sonuç kolonları ve okuma/yazma türü burada tanımlı.

## 5. Yaklaşımlar ve kararlar

### 5.1 Tek çizici — karar: **A, tuvalde gerçek ERP sayfası** (kullanıcı seçti)

| | Yaklaşım | Ödünleşim |
|---|---|---|
| **A ✓** | Studio tuvali ERP'nin önizleme sayfasını iframe içinde açar. Taslak çerçeveye `postMessage` ile gönderilir. Seçim çerçeveleri, sürükle-bırak ve bırakma alanları üstte ince bir katman olarak çizilir. Bileşenlerin konumlarını ERP sayfası bildirir. | Kopya çizim kodu tamamen kalkar. Sürükle-bırakın çerçeve üstünden çalışması incelik ister. Tuval için ERP'nin ayakta olması gerekir. |
| B | Çizici ortak bir pakete taşınır, iki uygulama da onu kullanır. | Sürükle-bırak en kolay olur. Ama 3.500 satırlık, sıkı bağlı kod yeniden düzenlenir ve ayrı deploy edilen iki uygulamada sürümler ayrışabilir. |
| C | Kopyalar kalır, otomatik eşdeğerlik testleri eklenir. | En ucuzu, ama çift kod kalır. |

### 5.2 Geçiş yolu — öneri: **C, yeni tasarımcı arayüzü + aynı kayıt formatı** (benim önerim; bkz. §11, açık onay)

| | Yaklaşım | Ödünleşim |
|---|---|---|
| A | Mevcut tasarımcıyı bileşen bileşen dönüştürmek | Risk düşük, ama 4.200 satırlık yapı uzun süre kalır. |
| B | Yeni tasarımcı ve yeni sayfa formatı, ayrıca dönüştürme aracı | Temiz, ama fayda en geç gelir ve canlı sayfaları dönüştürmek riskli. |
| **C** | Tasarımcının arayüzü yeniden yazılır. Sayfalar bugünkü formatta kaydedilir, format yalnızca **eklemeli** olarak genişler. "Metin → başlık stili" `heading` olarak, listenin filtreleri `filterBar` olarak saklanır. Yeni alanlar: `template` (kalıp ve basamak), katalog başvuruları (`dataSource`, `action`). | Bu alanları taşımayan sayfaları ERP bugünkü gibi çizer, canlı sayfalar olduğu gibi açılır. Kalıp kabuğu, otomatik yerleşim ve katalog çözümleme ERP çizicisine **yeni dallar** olarak eklenir. §5.1-A ile zorunlu olarak uyumludur: tuvalde ERP çizdiği için format ERP'nin anladığı format olmak zorunda. |

Yeni panelin karşılamadığı eski ayarlar silinmez. Yeni tasarımcı bu ayarları salt okunur bir "eski ayarlar" kutusunda gösterir ve kayıtta korur.

### 5.3 Yapı taşlarının yeri — karar: **firmanın Git modülünde dosya** (kullanıcı seçti)

| | Yaklaşım | Ödünleşim |
|---|---|---|
| **Git ✓** | Her firmanın kendi Git modülü olur. Studio bu dosyaların üstüne bir form editörü koyar. | Sürüm geçmişi, kod incelemesi ve başka müşterilerde yeniden kullanım mümkün olur. Her değişiklik bir sürüm yayınından geçer. |
| Studio'da doğrudan | Tanımlar form ve SQL editörüyle yazılıp anında yayınlanır. | Daha hızlı, ama sürüm takibi zayıf kalır. |

### 5.4 Ekran tutarlılığı — karar: **sayfa kalıpları, sayfaya bağlı ve kopyalanmayan** (taslak 04)

Bugün sayfa oluşturulurken seçilen şablon yalnızca bir **başlangıç kopyası**. Sonrasında her şey değiştirilebiliyor ve sayfalar zamanla birbirinden ayrışıyor. Yeni yapıda:

- Sayfa yalnızca kalıbının adını ve danışman alanlarının (mor alanlar) içeriğini saklar.
- İskeleti (başlık, işlem çubuğu ve buton sırası, sekmelerin yeri, toplamlar, alt bilgi) ERP **her seferinde kalıptan** çizer. Bir kalıp değiştiğinde onu kullanan bütün ekranlar birlikte değişir.
- **ERP'nin sistem ekranları da aynı kalıpları kullanır.**

### 5.5 Modül kuralları — karar: **üç katman, kural belgenin kendisinde** (taslak 05)

Kurallar sayfada değil, belge modelinde durur. Sayfa kural tekrarlamaz. Envanterin ilkesi de bu: *"istemci kural tekrarlamaz"*, hesaplama `satis.siparis.hesapla` gibi sunucu işlemleriyle yapılır. Ayrıntılar §6.6'da.

## 6. Tasarım

### 6.1 Sayfa kalıpları

| Kalıp | Sabit iskelet | Danışmanın doldurduğu |
|---|---|---|
| **Liste** | Başlık ve kayıt sayısı. + Yeni en solda, arama ortada, Sil en sağda. Detay paneli sağda, sayfalama altta. | Göstergeler (isteğe bağlı), kolonlar, filtreler, satır eylemleri, detay paneli alanları |
| **Kayıt kartı** | Kayıt özeti en üstte. Kaydet solda, Önceki / Sonraki sağda, Sil en sağda. Sekmeler işlem çubuğunun altında. Alt bilgi. | Öne çıkan değerler, sekmeler, bölümler, alanlar, ek eylemler |
| **Belge** | Belge no ve durum rozeti. Sıra her zaman başlık alanları → satırlar → toplamlar. Toplamlar sağ altta. Butonlar belgenin durumuna göre modelden gelir. | Başlık alanları, satır kolonları, ek eylemler |
| **Rapor** | Süzgeçler sonucun üstünde. Çalıştır / Excel / PDF hep aynı yerde. Kaydedilmiş görünümler sağda. | Süzgeçler, grafik (isteğe bağlı), tablo kolonları |
| **Tanım** | Basit liste, satır içinde düzenleme | Kolonlar |
| **Pano** | Gösterge ve kısayol ızgarası | Göstergeler, kısayollar |
| **Sihirbaz** | Adım göstergesi, İleri / Geri | Adımlar ve her adımın alanları |

Bu kalıplar, mevcut tasarım dili taslaklarına dayanır: `docs/design-proposals/erp-design-language/01`–`05`.

**Kalıba uymayan sayfalar: dört basamaklı merdiven** (kullanıcının sorusu üzerine eklendi, öneri)

**Ortak kabuk** her sayfada, hangi basamakta olursa olsun, değişmez:
- başlık ve konum satırı
- işlem çubuğunun yeri ve buton kuralları (ana buton solda, Sil en sağda)
- alt bilgi

Bu sayede kalıp dışı bir sayfa bile kullanıcıya tanıdık gelir. Basamaklar yalnızca kabuğun **içini** serbestleştirir:

1. **Kalıp.** Sayfaların büyük çoğunluğu buraya girmeli.
2. **Kalıp + ek alan.** Her kalıpta ana içeriğin üstünde ve altında birer "ek alan" bulunur. Danışman buraya 11 bileşenden istediğini koyabilir. Örnekler: listenin üstünde bir grafik, kayıt kartının altında bir bilgi kutusu. Kalıba "neredeyse uyan" sayfalar bu basamakta çözülür.
3. **Serbest gövde.** Kalıp seçilmez. Kabuğun içi Sekme → Bölüm → bileşen akışıyla (1/2/3 kolon) özgürce kurulur. Bileşenler ve otomatik yerleşim kuralları aynıdır. Piksel ya da konum ayarı burada da yoktur.
4. **Yazılımcı sayfası.** Planlama tahtası, harita ya da kasa ekranı gibi bileşenlerle kurulamayacak ekranlarda gövdenin tamamını bir yazılımcı bileşeni doldurur. Kabuk yine ERP'nindir.

Bu yapının yönetimi için iki kural:
- Sayfa listesinde her sayfanın basamağı görünür.
- Nexora ekibi 3. ve 4. basamaktaki sayfaları düzenli olarak gözden geçirir. Birden fazla firmada tekrar eden bir düzen görürse onu yeni bir kalıba dönüştürür. Danışman, serbest bir sayfayı yeni kalıba tek adımda taşıyabilir.

### 6.2 Bileşenler: 30'dan 11'e (taslak 03)

| Danışmanın gördüğü | Kayıtta karşılığı (bugünkü tipler) | Temel ayarlar |
|---|---|---|
| Metin | `heading`, `text`, `label`, `section` | Stil, metin (`{alan}` yazılabilir), hizalama |
| Bilgi kutusu | `card`, `alert`, `list` | Tür, başlık, metin ya da maddeler |
| Gösterge | `metric`, `progress`, `badge` | Tür, değer (katalogdan), karşılaştırma |
| Liste | `dataTable` + `filterBar` / `filterChips` / `facetPanel` | Taslak 01 ve §6.3 |
| Form | `formCard`, `form`, `input`, `customFieldsBlock` | Kayıt, alanlar, kolon sayısı, firmaya özel alanlar |
| Satır tablosu | `editableGrid` | Satırlar (katalogdan), kolonlar, ekle/sil, toplamlar |
| Kayıt özeti | `recordHeader`, `contextPanel` | Konum (üstte / yanda), öne çıkan değerler, logo |
| Bölümler | `tabs`, `steps` | Tür, adlar |
| Butonlar | `actionBar`, `button`, `dialog` | Eylemler (katalogdan), ana buton, konum |
| Görsel | `image` | Kaynak, yükseklik, açıklama |
| Yazılımcı bileşeni | `code` | Katalogdaki bileşen ve onun tanımladığı ayarlar |

`divider` ve `spacer` kaldırılır, aralıkları yerleşim otomatik ayarlar. Var olan sayfalardaki bu tipler okunmaya ve çizilmeye devam eder.

**Her bileşenin paneli aynı kalıpta:**
1. Ad
2. *Ne gösterilsin?* (yazılımcı kataloğundan)
3. 3–5 temel ayar
4. Eylemler
5. Kapalı duran **Görünüm** bölümü: yoğunluk ve renk, *ne zaman görünsün*, *mobilde gizle*

Panelde sekme yok, açılır pencere yok. Tuval her zaman görünür ve her değişiklik anında yansır. Teknik olan her şey (alan türü, doğrulama, sayfalama, parametreler, onay metni, yetki) katalogdan gelir ve yeşil bir "yazılımcının hazırladığı" notuyla gösterilir.

### 6.3 Liste bileşeni (taslak 01)

Panel sırası:
- *Ne listelensin?*
- Kolonlar: işaretlenir, sürüklenip sıralanır, başlıkları değiştirilebilir. Hesaplanan kolonlar etiketle gösterilir.
- Arama kutusu
- Sayfa başına kayıt
- *Satıra çift tıklayınca*: Kartı aç / Yan panelde göster / Hiçbir şey. Kart hangi anahtar ve parametreyle açılacak, veri kaynağının `key` ve `opens` alanlarından gelir.
- Kullanıcı araçları: Kolon filtreleri, Kolon seçici, Pivot, Dışa aktar. Excel ya da CSV seçimini ekranı kullanan kişi yapar.
- Eylemler: *Listenin üstünde* (`target: page`/`selected`) ve *Her satırın sonunda* (`target: row`)
- Görünüm, liste boşken yazılacak metin, *ne zaman görünsün*

Bugünkü "Daralma kuralı" ve 3/4/6/8/9/12 genişlik seçimi kaldırılır. Detay paneli açıldığında liste kendiliğinden daralır.

### 6.4 Detay ekranı (taslak 02)

- Yapı yalnızca **Sekme → Bölüm → Alan** zinciridir. Bölümler 1, 2 ya da 3 kolon olabilir. Genişlik, piksel ya da 12 kolon ayarı yoktur.
- Alanlar soldaki listeden sürüklenip bırakılır. Alan listesi veri kaynağından gelir ve kullanılan alanlar işaretli görünür.
- Alan ayarları: etiket, zorunlu, değiştirilemez, yardım metni, *ne zaman görünsün*. Alan türü, doğrulama ve varsayılan değer modelden gelir.
- Uzun metinler ve satır tabloları her zaman tam genişlikte durur.
- Ekran ilk açıldığında veri kaynağındaki alanlardan otomatik oluşturulur. Danışman boş sayfayla başlamaz.

### 6.5 Otomatik yerleşim

- Cihaz düğmeleri yalnızca önizleme içindir. Cihaz başına düzen kurulmaz.
- **Bileşen ekranın değil, kendisine kalan alanın genişliğine göre davranır.** Bu davranış container query ile kurulur. Bugünkü `deviceSpan` kuralı (tablette her şey yarım genişlik) kaldırılır.
- **Liste:**
  - Dar alanda ilk 4 kolon görünür, satır eylemleri “⋯” menüsüne girer.
  - Telefonda kart listesine dönüşür: 1. kolon başlık, 2. ve 3. kolon alt satır, tutar sağda. Kolon sırası aynı zamanda önem sırasıdır.
- **Bölümler:** dar alanda en fazla 2 kolon, telefonda 1 kolon olur.
- **Göstergeler** sığdığı kadar yan yana dizilir.
- **İşlem çubuğu:** sığmayan butonlar “⋯” menüsüne girer, ana buton her zaman görünür kalır.
- **Taşma:** tablolar kendi kutusunun içinde yatay kayar, uzun metinler kısaltılır ve üzerine gelince tamamı görünür.
- **Yükleme:** veri gelene kadar bileşenin yerinde iskelet görünür, sayfa zıplamaz.

### 6.6 Belge kuralları (taslak 05)

Bugünkü İş kuralları ve İş akışları araçları tek bir **Kurallar** ekranında birleşir. Ekran belge türüne göre açılır: Satış siparişi, Satış faturası…

- **Belge modeli (modül çekirdeği, sunucuda):**
  - alanlar, satırlar, toplamlar
  - hesaplamalar (`<modül>.<belge>.hesapla`)
  - bağımlı alanlar: stok seçilince birim, fiyat, KDV ve kullanılabilir miktar dolar
  - durumlar ve geçişler: Taslak → Onay bekliyor → Onaylı → Sevk edildi → Faturalandı
  - her geçiş için **önce kontroller** (biri engellerse geçiş olmaz, nedeni gösterilir) ve **sonra alt görevler** (sunucuda sırayla çalışır, hata olursa yeniden denenir)
- **Üç katman**, ekranda üç renkle gösterilir:
  1. **Modül çekirdeği** (gri, değiştirilemez): Nexora deposunda yazılır.
  2. **Yazılımcı uzantısı** (yeşil): firma modülünde tanımlanır ve şu uzantı noktalarına bağlanır: `<geçiş>Önce`, `<geçiş>Sonra`, `alanDeğişince`.
  3. **Danışman kuralı** (mor): doldurulabilir bir cümleyle kurulur: *"Eğer [alan] [işleç] [değer] ise [eylem]"*. Eylem türleri sınırlı tutulur: onay iste, uyar, engelle, e-posta ya da bildirim gönder, alan doldur. Her kuralın açma/kapama düğmesi vardır.
- **Dene:** geçiş örnek bir belgeyle çalıştırılır ve sonuç gösterilir. Gerçek kayıt değişmez, uzantıların bağlantıları test adresine gider.
- **İşlem günlüğü:** son kullanıcı belgede her adımın durumunu görür: ✓ tamamlandı, ⏳ bekliyor, ! yeniden denenecek.
- **Tasarımcıya etkisi:** Belge kalıbı modeli tanır. Butonlar, durum rozeti, toplamlar ve hesaplanan sütunlar modelden gelir. Tasarımcıda formül, koşullu sayım ya da komut kuralı ayarı kalmaz.

### 6.7 Yapı taşları kataloğu ve yazılımcı ekranı (taslak 06)

**Firma modülünün yapısı** (dosya adları örnektir, son biçim kurucunun kararıdır):

```
modules/<firma>/
  manifest.json
  veri/<ad>.sql + <ad>.json        ← veri kaynağı
  eylemler/<ad>.json               ← eylem
  uzantilar/src/lib.rs             ← uzantı kodu (bugünkü aierp_invoke yapısı)
  bilesenler/<ad>/                 ← yazılımcı bileşeni (bugünkü kod alanı + ayar şeması)
  testler/
```

**Veri kaynağı:**
```json
{ "code": "cariler", "label": "Cari hesaplar",
  "source": { "sql": "cariler.sql" },            // ya da { "erpOperation": "customers.list" }
  "columns": [ { "code": "Kod", "label": "Cari kodu", "type": "text", "key": true }, … ],
  "opens": "cariKarti" }
```

**Eylem:**
```json
{ "code": "ekstreAl", "label": "Ekstre al", "target": "row",
  "run": { "erpOperation": "customers.statement" }, "confirm": null, "permission": "cari.ekstre" }
```
`target` alanı eylemin danışman panelinde nerede görüneceğini belirler. `run` alanı bir ERP işlemi, SQL ya da bir modül eylemi olabilir.

**Uzantı (`manifest.json` içinde):**
```json
"uzantilar": [{ "belge": "satis.siparis", "an": "onaylandiktanSonra",
               "eylem": "lojistik.gonder", "ad": "Lojistik firmasına sipariş gönder" }]
```

**Yazılımcı ekranı:**
- Üstte talep görünür ve yazılımcı talebe ait ayrı bir Git dalında çalışır.
- Solda modül, dosya adına göre değil yapı taşı türüne göre gruplanır.
- **Veri kaynağı formu:** SQL editörü, **Önizle** düğmesi (deneme ortamındaki firma verisiyle, en fazla 50 satır) ve sorgudan otomatik algılanan kolon tablosu. Yazılımcı yalnızca danışmanın göreceği adı ve türü düzeltir. Form, arkadaki JSON dosyasını yazar ve bu dosya doğrudan da düzenlenebilir.
- **Uzantı formu:** belge, an, görünen ad, hata durumunda ne yapılacağı ve kullanılan bağlantı açılır listelerden seçilir. Altta kod editörü ve **Dene** düğmesi var.
- **Sürüm yayınla:** sürüm numarası, değişiklik listesi ve yayın öncesi kontroller (testler, deneme ortamında çalıştırma, kod incelemesi). Ardından firmaya kurulum yapılır. Önceki sürüme dönülebilir.
- Kurulum bittiğinde yapı taşları danışmanın listelerinde görünür, talep kapanır ve danışmana bildirim gider.

Mevcut sayfalardaki sayfa içi sorgular çalışmaya devam eder. Yeni tasarımcıda bunlar için **"Kataloğa taşı"** düğmesi bulunur.

### 6.8 Tuvalde gerçek ERP sayfası

- Studio tuvali ERP'nin önizleme rotasını iframe içinde açar. Bu rota bugünkü `customPagePreview` ya da `systemPreview` adreslerinin genişletilmiş hali olur.
- **Studio'dan ERP'ye mesajlar:**
  - taslak tanımı (kaydedilmemiş değişiklikler dahil)
  - cihaz genişliği
  - seçili bileşen
- **ERP'den Studio'ya mesajlar:**
  - bileşen kimliği ve kutu konumları (tanımda, kaydırmada ve yeniden boyutlanmada güncellenir)
  - tıklanan bileşen
  - bırakma alanları
- Protokol, kod bileşeni köprüsündeki güvenlik ilkelerini izler (`codeBridgeStub.ts`): sürüm numarası, kaynak kontrolü ve izinli origin listesi. Nonce kullanılmaz: kod köprüsünde sandbox'lı çerçevenin origin'i opak olduğu için gerekir, tuval iframe'inin origin'i gerçek olduğundan origin + source kontrolü yeterlidir.
- Önizlemede yazma işlemleri bugünkü gibi engellenir.
- Studio'daki kopya çizim kodu (`CanvasPreviews.tsx`, `useCanvasSamples`, `canvasSamples`, `preview-samples.ts` ve `CustomPagesPage.tsx` içindeki çizim dalları) bu projede silinmez; silme alt proje 4'e (Detay ekranı: Sekme → Bölüm → Alan) kalır. Kart içi tasarım modu ERP'de sayfa yüzeyinde görünmediği için eski tuval bu süre boyunca yedek olarak kullanılır (ERP'ye bağlanılamadığında da).

### 6.9 Studio'nun yapısı (taslak 07, kullanıcı onayladı)

Studio rol bazlı çalışır. Her rol yalnızca kendi menüsünü görür. Bugünkü 10 araçlık liste, "Platform uyarlama" ekranı ve akış kartları kalkar.

| Danışman | Yazılımcı | Yönetici |
|---|---|---|
| Ana sayfa | Ana sayfa | Ana sayfa |
| Ekranlar | Gelen talepler | Kişiler ve roller |
| Kurallar | Firma modülü | Modül pazaryeri |
| Menüler | Ekranlar | Bağlantılar |
| Taleplerim | Kurallar | Yapay zekâ |
| Yayınlar | Yayınlar | Yayınlar |

Menüler:
- **Ana sayfa** her role göre farklı kartlar gösterir.
  - Danışman: taslakta bekleyenler, açık talepler, yeni yapı taşları, son çalışılanlar.
  - Yazılımcı: gelen talepler, modül sürümü, son 24 saatteki uzantı hataları.
  - Yönetici: kullanıcılar, kurulu modüller, aylık yayın sayısı.
  - Bugünkü Analitik ekranı bu kartlara dönüşür.
- **Ekranlar:** sistem ekranları ve özel ekranlar tek bir listede durur. Liste kalıba (Liste, Kayıt kartı, Belge, Rapor, Serbest) göre süzülür ve her ekranın taslak/yayında durumu görünür. Bir satıra tıklayınca tasarımcı açılır. Yeni ekran oluştururken ilk adım kalıp seçmektir.
- **Kurallar:** §6.6.
- **Menüler:** ERP gezinme menüsü. Ekranlar sürüklenerek gruplanır, her menü öğesinin adı, simgesi ve kimin göreceği ayarlanır. Bugünkü Özel menüler'in yerini alır.
- **Taleplerim / Gelen talepler:** bugünkü Geliştirme talepleri ekranıdır. Danışman talep açar, yazılımcı gelenleri görür. Her talebin durumu görünür: yeni, deneme ortamında, yayında.
- **Firma modülü:** §6.7. Veritabanı mühendisi ve kaynak eşlemeleri bu ekranın "Araçlar" bölümüne taşınır.
- **Yayınlar:** taslaktan canlıya giden her şey (ekranlar, kurallar, modül sürümleri) bekleyen ve geçmiş olarak tek yerde listelenir. Geçmişte her yayın için "önceki sürüme dön" bulunur.
- **Kişiler ve roller:** davet etme ve rol verme. Roller §10'da tanımlı olanlardır (Danışman, Yazılımcı, ayrıca Yönetici).
- **Bağlantılar:** GitHub ve dış sistemler. Yazılımcı uzantıları yalnızca burada yöneticinin onayladığı bağlantıları kullanabilir.
- **Modül pazaryeri** ve **Yapay zekâ:** bugünkü ekranlar, yalnızca yöneticiye görünür.

Eski araçların yeni yerleri:

| Bugün | Yeni yer |
|---|---|
| Sayfa tasarımcısı, LowCodeDesigner, UIDesigner | Ekranlar |
| Özel formlar | Ekranlar (Kayıt kartı kalıbı) |
| Hazır ekran görünümleri | Ekranlar (sistem ekranları aynı listede) |
| Rapor oluşturucu | Ekranlar (Rapor kalıbı) |
| İş akışları, İş kuralları | Kurallar |
| Özel menüler | Menüler |
| Veri modelleri | Firma modülü, yazılımcıya ait "kayıt türü" yapı taşı (benim kararım). Var olan bir kayda alan eklemek danışmanda kalır (Form → firmaya özel alanlar). |
| Kod çalışma alanları | Firma modülü |
| Veritabanı mühendisi, kaynak eşlemeleri | Firma modülü → Araçlar |
| Geliştirme talepleri | Taleplerim / Gelen talepler |
| Analitik | Ana sayfa kartları |
| Modül pazaryeri, Yapay zekâ tanımlaması | Yönetici menüsü |

## 7. Alt projeler ve sıra

Her alt proje kendi planıyla ve kendi PR(lar)ıyla ilerler.

1. **Tuvalde gerçek ERP sayfası (§6.8).** Bugünkü tasarımcıyla da çalışır, kayma sorununu hemen çözer ve sonraki her adımın temelidir.
2. **Yapı taşları kataloğu (§6.7):** dosya formatı, sunucunun firma modülünden okuması, yazılımcı formları, ERP'nin katalog başvurularını çözmesi.
2b. **Studio'nun yeni yapısı (§6.9):**
   - rol bazlı menüler ve sunucuda zorlanan roller
   - Ana sayfa, Taleplerim / Gelen talepler, Yayınlar, Kişiler ve roller, Bağlantılar
   - Ekranlar listesi: önce bugünkü tasarımcıyı açar, 3. projeyle yeni tasarımcıyı açar
   
   Eski araçlar menüden ancak yerlerini alan ekranlar hazır olunca kalkar (§11). 1. projeden bağımsızdır, onunla paralel yürüyebilir.
3. **Sayfa kalıpları (§6.1) + yeni panel kabuğu + Liste (§6.3).**
4. **Detay ekranı (§6.4) ve otomatik yerleşim (§6.5).**
5. **Kalan bileşenlerin birleştirilmesi (§6.2).**
5b. **Toplu kalıp geçişi** (kullanıcının kararı: bütün canlı sayfalar tek seferde taşınır). 3., 4. ve 5. projelerden sonra yapılır:
   - **Dönüştürücü:** her sayfayı (firma sayfaları ve sistem standartları) bir kalıba ve basamağa eşler. Eşlenemeyen sayfa 3. basamağa (serbest gövde) düşer, hiçbir sayfa açıkta kalmaz.
   - **Kuru çalıştırma raporu:** sayfa başına seçilen kalıp, düşen ya da "eski ayarlar" kutusuna giden ayarlar ve üç genişlikte önce/sonra ekran görüntüleri. Rapor geçişten önce Nexora ekibi tarafından gözden geçirilir.
   - **Prova:** geçiş önce firma veritabanlarının geri yüklenmiş bir kopyasında yapılır (canlı yayınlarda kullanılan prova yöntemi). Davranış testleri burada çalıştırılır: sorgular aynı sonucu veriyor mu, eylemler aynı işlemi yapıyor mu, yetkiler aynı mı.
   - **Geri dönüş:** her sayfanın geçiş öncesi tanımı bir sürüm olarak saklanır. Tek komutla bütün sayfalar ya da tek bir sayfa eski haline döner.
   - **Geçişten sonra:** eski yerleşim dalı ERP'den kaldırılır. Bu da §10'daki "iki yerleşim dalı" durumunu sona erdirir.
6. **Belge kuralları (§6.6).** Önce bir modülde (öneri: satış siparişi) belge modeli, hesaplama ve durum geçişleri kurulur, sonra Kurallar ekranı. Bu proje satış envanterindeki G-S7, G-S8 ve G-S9'u da kapatır. 2. projeden bağımsız olarak başlayabilir.

## 8. Kurucuya bırakılanlar

- Mesaj protokolünün ayrıntılı alanları, konum bildirim sıklığı ve sürükle-bırakın tekniği.
- Firma modülündeki dosya ve klasör adları, JSON şemalarının son biçimi.
- Container query eşikleri (hangi genişlikte 4 kolon, hangi genişlikte kart listesi).
- Kalıpların ERP tarafında nasıl kodlanacağı (bileşen mi, düzen tanımı mı).
- Eski sayfa ayarlarının "eski ayarlar" kutusunda nasıl gruplanacağı.
- Durum makinesi ve alt görev kuyruğunun sunucu tarafındaki uygulaması (mevcut iş akışı motorunun yeniden kullanılıp kullanılmayacağı dahil).

## 9. Doğrulama

- **Tek çizici:** aynı taslak Studio tuvalinde ve ERP'de açılır, ekran görüntüleri üç genişlikte (masaüstü, tablet, telefon) karşılaştırılır.
- **Canlı sayfalar:** toplu geçişe kadar her alt projeden önce ve sonra, canlıdaki sayfa tanımlarının (sistem sayfası standartları dahil) ERP çıktısı değişmemeli. Toplu geçişte görünüş değişir, ama davranış testleri (sorgu sonuçları, eylemler, yetkiler) geçişin öncesi ve sonrası arasında birebir aynı kalmalı.
- **Panel sadeliği:** danışman panelinde teknik terim olmadığı bir denetim listesiyle kontrol edilir (§3 anti-hedefler).
- **Belge kuralları:** satış siparişi, envanterdeki G-S7, G-S8 ve G-S9 senaryolarını tasarımcıda tek bir ayar gerektirmeden karşılar.

## 10. Kurucu kontrolünden çıkan kararlar (benim kararlarım, kullanıcı düzeltebilir)

- **Eski sayfalar ve yerleşim.** Toplu geçişe kadar (§7, 5b), `template` alanı olmayan sayfalar bugünkü çizimle (12 kolon, mevcut ayarlar) çizilmeye devam eder. Yeni yerleşim kuralları (§6.5) ve kalıp kabuğu yalnızca yeni formattaki sayfalara uygulanır. Bu dönemde ERP'de iki yerleşim dalı birlikte yaşar. Toplu geçişten sonra eski dal kaldırılır.
- **Kaldırılan ayarlar** (`gridFormula`, `countWhen`, `conditions`, `wizardParts`, `barCommands`). Bu ayarları taşıyan sayfalarda ERP bunları çalıştırmaya devam eder. Bir sistem standardı belge modeline geçtiğinde, o standardın yeni sürümü bu ayarları bırakır. Geçiş, standardın eski ve yeni çıktısının üç genişlikte karşılaştırılmasıyla doğrulanır. Model ile eski ayar aynı sayfada birlikte çalışmaz: `template: belge` olan sayfada eski hesap ayarları yok sayılır.
- **Hangi sistem ekranları kalıp kullanır.** JSON standardı olan sistem sayfaları (`SystemPages/Standards`). Elle yazılmış React ekranları, süren eşdeğerlik programıyla sistem sayfasına taşındıkça kalıba geçer. Bu proje o ekranları ayrıca yeniden yazmaz.
- **Tuvalin oturumu ve verisi.** Studio, çerçeveye `postMessage` ile **mevcut `NEXORA_STUDIO_AUTH` aktarımı** (Studio'nun gömülü ERP araçlarına verdiği belirteç; salt okunurluğu önizleme modu sağlar) verir. Tuval, Studio'dan bu belgede geçerli bir `NEXORA_STUDIO_AUTH` mesajı gelene kadar sayfayı çizmez ("Studio oturumu bekleniyor…" gösterir) ve yalnız o mesajın belirtecini ve firmasını kullanır; ERP'nin `localStorage`'da bulunabilecek belirteci/firması tuvalde sayfa yüklemek için kullanılmaz (tarayıcılar alanlar arası çerçevede depolamayı zaten bölümlendirir; bölümlenmemiş durumda da yanlış firmanın verisi çekilmez). Tuval, firmanın canlı verisini **salt okunur** gösterir (bugünkü ERP önizlemesi de böyle çalışıyor). Yazma işlemleri engellidir. Yazılımcının "Önizle" ve "Dene" düğmeleri de aynı salt okunur canlı veriyi kullanır. Uzantıların dış bağlantıları "Dene" sırasında bağlantının test adresine gider. Ayrı bir veri sandbox'ı bu kapsamda yoktur.
- **Kaydedilmemiş değişiklikler tuvalde.** Tuval her değişiklikte taslağı **otomatik kaydeder** ve ERP önizlemeyi kaydedilmiş taslaktan çizer. Sunucu, istemcinin gönderdiği kaydedilmemiş SQL'i hiçbir zaman çalıştırmaz. §6.8'deki "kaydedilmemiş değişiklikler dahil" ifadesi bu anlama gelir: kullanıcı açısından kaydetmeye gerek yoktur, ama arka planda taslak her zaman kaydedilir.
- **Roller sunucuda zorlanır.** Studio'ya *Danışman* ve *Yazılımcı* rolleri eklenir. Veri kaynağı, eylem, uzantı ve bileşen yazan uçlar yalnızca *Yazılımcı* rolüne açıktır. Arayüzde araçları gizlemek tek başına yeterli sayılmaz. Bir iş ortağı birden çok firmaya bakabilir: rol, kişi ve firma çifti başına verilir.
- **Kurulum hızı.** JSON ve SQL yapı taşları derleme gerektirmez, sürüm yayınlanınca doğrudan kurulur. Rust derlemesi yalnızca uzantılar ve bileşenler için gerekir. Danışmanın bekleme süresi, bir sürüm yayınının süresi kadardır.
- **Danışman kuralları ve sayfa tasarımları** Git'e girmez, veritabanında durur. Sayfalarla aynı **taslak → yayınla → sürüm geçmişi** akışından geçer. "Dene" bu kuralları da kapsar.
- **Rol yapısı, alt proje 2b** (plan: `docs/superpowers/plans/2026-11-25-studio-rol-yapisi.md`).
  - Studio rolü ERP rolünden ayrı bir alandır. Yeni ERP rolü açılmaz, çünkü yeni rolün izin kuralı olmaz ve danışman ERP erişimini kaybederdi.
  - Varsayılan roller: `TenantDeveloper` ya da Studio proje yetkisi olan kişi Yazılımcı olur, diğerleri Danışman. Bugün Studio'yu kullanan kimse erişim kaybetmez.
  - Yönetici üç menüyü de görür ve rol düğmesiyle aralarında geçer. Yazılımcı, danışmanın yapabildiğini de yapar.
  - 2b'de sunucuda zorlanan uçlar AIService'in kod, çalışma alanı ve sürüm uçlarıdır (`/studio/projects/**`, `/studio/workspace-requests/**`). Veri modeli ve sayfa SQL'i bugünkü yetkileriyle kalır. Bunlar 2. alt projede Yazılımcıya kapanır, çünkü yerini alacak ekran olmadan kapatmak danışmanın işini bozardı.
- **Kalıplar ve Liste, alt proje 3** (plan: `docs/superpowers/plans/2026-11-25-kaliplar-ve-liste.md`).
  - Karar 1 (kullanıcı onayladı): katalog başvurusu (veri kaynağı ya da eylem) kaydetmek için sayfa yazma izni yeter; satır içi SQL TenantAdmin'de kalır.
  - Karar 2: onay metni ve kolon adları eylem seçildiği anda sayfaya kopyalanır; katalog sonradan değişirse sayfa eski metni gösterir.
  - Karar 3: veri kaynağında `q` adlı metin parametresi varsa arama sunucuya gider, yoksa tablonun kendi aramasıdır.
  - Karar 4: Liste yalnız parametresiz ya da yalnız `q` parametreli kaynakları kullanır; sayfalama istemcidedir.
  - Karar 5: eylemin her parametresi aynı adlı liste kolonuna bağlanır; eşleşmeyen eylem seçilemez, toplu eylem yalnız silme olabilir.
  - Karar 6: satıra çift tıklama "Kartı aç", "Yan panelde göster" ya da "Hiçbir şey" olur; kaynakta `opens` ya da anahtar kolon yoksa kartı aç seçilemez.
  - Karar 7: ERP tuvali kullanılamıyorsa tuval alanında "Bu ekran ERP önizlemesi açılınca görünür." yazar; panel çalışır.

## 11. Kullanıcının kararları (2026-11-25)

- **Canlı sayfalar kalıplara toplu taşınır** (§7, 5b). Görünüş değişebilir, davranış değişmez.
- **Eski araçlar kademeli kaldırılır.** Özel formlar, LowCodeDesigner, Hazır ekran görünümleri, UIDesigner, İş kuralları ve İş akışları şu sırayla ilerler:
  1. Yeni tasarımcı ve Kurallar ekranı hazır olunca eski araçlar **salt okunur** olur.
  2. Kayıtları yeni yapıya taşınır. Bu araçların yaptığı sayfalar ve formlar toplu geçişe dahildir.
  3. Araçlar menüden kalkar.
  
  Bu süre boyunca eski kurallar ve iş akışları canlıda çalışmaya devam eder. Bir belge türünün modeli ve Kurallar ekranı hazır olduğunda, o belge türünün eski kuralları yeni ekrana taşınır ve eşdeğerlikleri "Dene" ile doğrulanır. Ancak bundan sonra eski kurallar kapatılır. İki sistem aynı belge türünde aynı anda kural çalıştırmaz.
- **Firma modülleri iş ortağının GitHub'ında durur.** İş ortağı kendi GitHub hesabını Studio'ya bağlar ve her firma için ayrı bir depo kullanır. Studio'daki mevcut "GitHub deposu bağlayın" akışı kullanılır.
- **§5.2 geçiş yolu C:** kullanıcının "ERP tuvalde" kararı bu yolu gerektiriyor. Toplu geçiş kararıyla birlikte format yalnızca eklemeli olarak genişler, eski format geçişe kadar okunur.
