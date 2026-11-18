# Stok Kartları pilotu (inventory-stock v1): eşdeğerlik kontrol listesi

Bu liste, Proje 4'ün canlı QA betiğidir. Her satır, eski ekranın bir öğesini
`src/Hosts/AIERP.Api/SystemPages/Standards/inventory-stock.json` standart tanımındaki karşılığıyla eşler. Bölümler
`2026-11-18-stok-esdegerlik-envanteri.md` belgesinin 1–4. ve 6. bölümlerini izler.

Kaynaklar:
- Standart tanım: `inventory-stock.json` (82 bileşen, 25 sorgu).
- Çizim testleri: `frontend/erp-web/src/system-pages/inventoryStockStandard.test.tsx`. Bu testler tanımı gerçek çalışma
  zamanıyla, sahte API yanıtlarıyla çizer. Katalog, `inventoryStockOperations.fixture.json` dosyasındaki
  `ErpOperationCatalog` anlık görüntüsünden gelir.
- Satırlarda geçen "(test: …)" notu, o davranışı doğrulayan çizim testinin adıdır.

**Durum** değerleri:
- `karşılandı`: yeni tanımda aynı iş yapılır.
- `fark`: iş farklı biçimde karşılanır; fark satırda yazılıdır.
- `sunucu kuralı`: kural uç noktada uygulanır; sayfa sunucunun hata metnini gösterir.
- `kapsam dışı`: v1'de yoktur. Geri dönüş yolu, sayfa başlığındaki "Eski ekranda aç" bağlantısıdır.

**Canlı sonuç** sütunu Task 8'de, QA firmasında doldurulur.

## 1. Liste

### Veri kaynağı, arama ve sayfalama

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Satırlar bakiye sayfasından gelir (tüm depolar ya da tek depo) | `liste` ← `bakiye` (`stok.bakiye.sayfa`). Depo seçilince `routeVariants` ile `/api/warehouses/{id}/balances/page` yoluna geçer. (test: `list requests balances page with filters and paging`) | karşılandı | |
| Yalnız aktif kartlar listelenir; "devre dışı kartlar" paneline erişilemez | `pasifler` onay kutusu ("Pasif kartları da göster") → `includeInactive=true` (test: aynı). Panel taşınmadı (envanter 6, "Taşınmayacaklar"). | fark | |
| Arama: kod, ad, barkod, kategori; 250 ms gecikme; sayfa 1'e döner | `aramaKutusu`, `liste.searchInput` üzerinden `q` parametresine bağlıdır. Gecikmeyi çalışma zamanının sorgu gecikmesi (300 ms) belirler. Sayfanın 1'e dönmesi canlıda kontrol edilecek. | karşılandı | |
| Sayfa başına 25 kayıt | `liste.paging: server`, `pageSize: 25` → `page=1&pageSize=25` (test: aynı) | karşılandı | |

### Sütunlar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Liste sütunları: Stok kodu, Stok adı, Kategori, Depo bakiyesi, Rezerve, Kullanılabilir, Minimum, Stok değeri, Maliyetsiz miktar, Durum | `liste.columns`: `balance.code`, `balance.name`, `stockItem.category`, `balance.quantityOnHand`, `balance.reservedQuantity`, `balance.availableQuantity`, `balance.minimumStock`, `balance.valuationAmountBase`, `balance.unvaluedQuantity`, `status`. Biçimler `columnFormats` ile verilir (kod, sayı, para, durum). | karşılandı | |
| Sütun başlıkları ekran görünümünden gelir ("Depo bakiyesi") | Başlıklar katalog etiketlerinden gelir: "Eldeki miktar", "Rezerve miktar", "Kullanılabilir miktar", "Maliyetsiz miktar", "Minimum stok". `screenViews` yalnız görünürlüğü alır. | fark | |
| Miktar ve birim tek hücrede ("12 ADET") | Birim ayrı gösterilir: detay panelindeki "Birim" alanı ve "Kullanılabilir" göstergesinin açıklaması ("Bu sayfa · ADET"). | fark | |
| Kullanılabilir sütununda seviye çubuğu (kullanılabilir/minimum oranı: %50 altı kötü, %100 altı uyarı) | Çubuk yok. Yerine `Durum` sütunu gelir: sunucunun hesapladığı durum, `toneMap` tonuyla gösterilir ("Minimum altı" kırmızı, "Maliyetsiz" sarı, "Yeterli" yeşil, "Pasif" mavi). | fark | |
| Durum önceliği: Pasif > Minimum altı > Maliyetsiz > Yeterli | `InventoryBalancePageItem.Status` sunucuda aynı öncelikle hesaplanır (`InventoryBalancePageSummary`). | karşılandı | |

### Üst çubuk ve özet

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Depo seçici: aranabilir, "Tüm depolar" seçeneği | `depoSecimi`: lookup, `optionsQuery: depolar`, `staticOptions: ["=Tüm depolar"]`, `allowClear` (test: `list requests balances page with filters and paging`) | karşılandı | |
| "Minimum altı" çipi, sayısıyla | `minimumAlti` onay kutusu; etiketi "Minimum altı ({{bakiye.meta.belowMinimumCount}})" (test: `metrics show formatted page meta and minimum filter toggles`) | karşılandı | |
| Yenile düğmesi | İşlem Çubuğu'nun standart Yenile komutu (F5) | karşılandı | |
| Özet kartı: Stok değeri (sayfa toplamı) | `stokDegeriGostergesi`: `pageValuationAmountBase`, para biçimi, "Bu sayfa · TRY" (test: aynı) | karşılandı | |
| Özet kartı: Kullanılabilir | `kullanilabilirGostergesi`: sayfa tek birimliyse `pageAvailableQuantity` ve birim. Birimler karışıksa yerine `kullanilabilirKartGostergesi` ("Kullanılabilir stoklu kart", kart sayısı) çıkar. (test: aynı) | fark | |
| Özet kartı: Minimum altı (tıklayınca süzer) | `minimumAltiGostergesi`: `filterInput: minimumAlti`. Tıklama onay kutusunu açıp kapatır ve `belowMinimumOnly=true` gönderir. (test: aynı) | karşılandı | |
| Özet kartı: Maliyetsiz | `maliyetsizGostergesi`: `pageUnvaluedCount` (test: aynı) | karşılandı | |
| Alt bilgi: "N / toplam" ve sayfalayıcı | Sunucu sayfalı tablonun alt satırı ("1–2 / 2", Önceki/Sonraki) ve `footerMeta` ("Minimum altı") | karşılandı | |
| Alt bilgi: seçili kayıt sayısı ve değeri | Liste tek seçimlidir; seçili sayısı ve değeri gösterilmez. Toplu seçim yoktur. | fark | |
| Detay paneli aç/kapat: Ctrl+. | Kısayol yok. Detay sekmeleri bir satır seçiliyken görünür (`visibleWhen`). | kapsam dışı | |

### Komutlar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Yeni (F2) | `komutlar.formDialog: kartPenceresi`, `newInputs: [kod]`. Yeni, seçimi kaldırır, pencereyi Genel sekmesinde açar ve odağı Stok kodu'na verir. Kayıt tek `POST /api/stock/items` gönderir, `PUT` göndermez. (test: `yeni then save posts exactly one card`) | karşılandı | |
| Aç (Enter) | Aç, seçili satırın kartını pencerede açar (test: `aç then save sends PUT with source rowVersion and custom field PUT`) | karşılandı | |
| Odaklı satırda Enter | Aç seçili satıra göre çalışır. Odaklı ama seçili olmayan satırda Enter önce satırı seçer. | fark | |
| Sil (Ctrl+Delete), yalnız TenantAdmin, tehlike onayı | `komutlar.deleteQuery: kartSil` (`stok.kart.sil`). Silmeden önce tehlike onayı sorulur. Katalog `allowed:false` döndüğünde Sil "Bu işlem için yetkiniz yok" nedeniyle pasiftir. (test: `tenant user gating`) | karşılandı | |
| Toplu silme ve kısmi hataların listesi | Toplu seçim ve toplu silme yok | kapsam dışı | |
| Toplu Excel | İşlem Çubuğu Excel komutu (`exportTable: liste`). Yalnız görünen sayfayı (25 satır) dışa aktarır. | fark | |
| CSV dışa aktar (Ctrl+E) | CSV yok. Ctrl+E, Excel dışa aktarma komutudur. | fark | |
| Devre dışı bırak (`POST /{id}/deactivate {rowVersion, confirmation:true}`); sunucu 409 | `devreDisiBirak` (menü) → `pasifeAl`. Onay metni sorulur. `rowVersion` ve `confirmation:true` gider; 409 metni gösterilir. (test: `deactivate confirms and shows server conflict text`) | karşılandı | |
| Etkinleştir | `etkinlestir` (menü, yalnız pasif kartta görünür) → `aktifEt` | karşılandı | |
| Hareketler / ekle (depo seçili olmalı) | `hareketlerDugmesi` (menü). Depo seçili değilse "Hareket için önce bir depo seçin." nedeniyle pasiftir. (test: `movement dialog posts movement and reversal sends reason`) | karşılandı | |
| Kategorileri yönet (TenantAdmin) | Kategori yöneticisi yok. Kategori, `kategoriler` listesinden seçilir. | kapsam dışı | |
| Özel alanlar (tanım yönetimi) | Özel alan tanım yönetimi yok. Değer girişi kart penceresindedir. | kapsam dışı | |
| `inventory-stock-movements` ekran görünümünün içe aktarılması | Yalnız `inventory-stock` görünümü (`liste`) eşlenir. Hareket tablosu görünümü içe aktarılmaz. | kapsam dışı | |

## 2. Detay paneli

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Başlık: stok kodu ve adı | `ozetPaneli.title`: "{{kod}} · {{ad}}" | karşılandı | |
| Başlık: durum etiketi ve Lot/Seri etiketi | Etiket yerine panel alanları gelir: "Durum" ve "Lot / seri" | fark | |
| Başlıkta Aç ve Kapat düğmeleri | Aç, İşlem Çubuğu'ndadır. Kapat düğmesi yok; satır seçimi kaldırılınca panel gizlenir. | fark | |
| Özet sekmesi: bakiye, kullanılabilir, rezerve, minimum, değer, maliyetsiz, kategori, birim | `ozetPaneli` (10 alan; ek olarak Lot / seri ve Durum) | karşılandı | |
| Depolar sekmesi (bugün her depo için ayrı çağrı) | `kartDepoTablosu` ← `kartDepolari` (`GET /api/stock/items/{id}/balances`, tek çağrı) | karşılandı | |
| Hareketler sekmesi: son 5 hareket | `sonHareketTablosu` ← `sonHareketler` (`stok.kart.hareketleri`), `limit: 5`. Uç noktanın varsayılan sayfası okunur, ilk 5 satır çizilir. | karşılandı | |
| Yalnız açık sekme yüklenir; seçimden 150 ms sonra; eski yanıtlar atılır | Üç detay sorgusu sekme açılmadan, seçimle birlikte yüklenir (300 ms gecikme). Eski yanıtları çalışma zamanı atar. | fark | |

## 3. Hareket penceresi

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Pencere depo seçili olduğunda açılır | `hareketPenceresi`. Başlık: "Stok hareketleri · {{kod}} · {{depo}}". (test: `movement dialog posts movement and reversal sends reason`) | karşılandı | |
| Yön * (Giriş / Çıkış) | `hareketYonu`: zorunlu, varsayılanı "Receipt" | karşılandı | |
| Tarih * | `hareketTarihi`: zorunlu, varsayılanı bugün | karşılandı | |
| Kapalı döneme hareket → 409 | Sunucu reddeder; hata metni pencerede gösterilir | sunucu kuralı | |
| Hareket birimi: ana birim ve dönüşümler | `hareketBirimi` ← `birimler`. Yer tutucu "Ana birim (…)"; boş bırakılırsa ana birim kullanılır. | karşılandı | |
| Miktar * (> 0, 4 ondalık) | `hareketMiktari`: zorunlu, `min 0.0001`, `step 0.0001` | karşılandı | |
| Açıklama * (≤ 240) | `hareketAciklamasi`: zorunlu, `maxLength 240` | karşılandı | |
| Depo konumu: yalnız deponun aktif konumları varsa | `hareketKonumu` ← `konumlar`, `visibleWhen: konumlar.rows[0].id != null` | karşılandı | |
| Birim maliyet: yalnız Giriş'te | `birimMaliyet`, `visibleWhen: hareketYonu.value == 'Receipt'` | karşılandı | |
| Lot / seri kodu *: takip türü varsa | `izlemeSatirlari` (liste tablosu) yalnız takipli kartta görünür. Kod sütunu zorunlu ve benzersizdir. Takipsiz kartta `tracking: []` gider. (test: aynı) | karşılandı | |
| Seri girişinde miktar 1; son kullanma tarihi yalnız Lot'ta | Tablonun açıklama metninde yazılıdır; denetimi sunucu yapar | sunucu kuralı | |
| Kaydet: `POST /api/warehouses/{wid}/stock/{sid}/transactions` | `saveQuery: hareketEkle` (test: aynı) | karşılandı | |
| Kayıttan sonra pencere açık kalır, liste seçimi korunur | Pencere kayıttan sonra kapanır (`closeOnSave`). `bakiye` yenilendiği için liste seçimi kalkar; yeni hareket için satır yeniden seçilir. | fark | |
| Liste: depo bazında, 50'şer kayıtla sayfalı | `hareketTablosu` ← `hareketler`, `paging: server`, `pageSize 50` | karşılandı | |
| Ters kayıt: zorunlu gerekçe, `POST …/{entryId}/reverse {reason}` | `tersKayitDugmesi` (satır işlemi). "Ters kayıt gerekçesi" istemi zorunludur ve `{reason}` gönderilir. Ters kaydı olan veya kendisi ters kayıt olan satırda pasiftir. (test: aynı) | karşılandı | |
| Ters kayıttan sonra liste kullanılabilir kalır | Ters kayıttan sonra `liste` seçimi ve hareket satırları korunur; ikinci ters kayıt kendi `entryId`'siyle gider. (test: `reversal keeps the movement list usable`) | karşılandı | |
| Ters kayıttan sonra liste bakiyesi hemen güncellenir | Pencere açıkken `bakiye` yenilenmez; yenilenseydi seçim düşerdi. Pencereyi kapatmak da listeyi yenilemez; liste bakiyesi yalnız Yenile (F5) ile güncellenir. Depolar ve son hareketler hemen yenilenir. | fark | |

## 4. Stok kartı formu

### Çerçeve

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Düzenleme açılışı; birimler, özel alanlar, varyantlar ve reçeteler paralel yüklenir | `kartPenceresi` (çekmece). `kart` (`stok.kart.getir`) ve ona bağlı `birimler`, `ozelTanimlar`, `ozelDegerler`, `varyantlar`, `receteler` sorguları yüklenir. | karşılandı | |
| Kaynak okumaları yüklenirken kayıt | Bir kaynak okuması (ör. özel alan değerleri) yüklenirken Kaydet hiçbir şey yazmaz ve "Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin." gösterir. (test: `save while a source read loads writes nothing`; Task 7 düzeltmesi) | karşılandı | |
| Değişiklik izleme: değişen alan sayacı, çıkışta onay | Yedi kart formCard'ı `trackChanges: true` ve `recordKey` taşır. Kirli kayıtta Yeni, kayıt değiştirme ve pencereyi kapatma "Kaydedilmemiş değişiklikler kaybolacak" onayını sorar. (test: `esc on a dirty card asks before closing`) | karşılandı | |
| Her değişen alanda "Önceki: …" gösterimi | Yok | kapsam dışı | |
| Sekme durumları (tamam / boş / hata) | `kartSekmeleri` (8 sekme) yalnız hata durumunu gösterir: hata işareti ve hata sayısı. Geçersiz kayıtta ilk hatalı sekmeye geçilir. "Tamam" ve "boş" durumları yoktur. | fark | |
| Ctrl+S kaydeder | Ctrl+S, kart penceresinin kayıt dizisini çalıştırır (test: `yeni then save posts exactly one card`) | karşılandı | |
| Esc kapatır | Esc pencereyi kapatır. Kirli kayıtta önce onay sorulur. (test: `esc on a dirty card asks before closing`) | karşılandı | |
| F2 yeni kayıt; kaydedilmemiş değişiklikte onay | `formDialog` Yeni yolu. Açık pencerede F2, kirliyse "Kaydedilmemiş değişiklikler kaybolacak" onayını sorar. | karşılandı | |
| PgUp / PgDn önceki ve sonraki kayda geçer | Yok | kapsam dışı | |
| Eşzamanlılık: `rowVersion`, çakışmada 409 | `guncelle`, `pasifeAl` ve `aktifEt`, `rowVersion`'ı kaynak `kart` satırından alır. 409 metni gösterilir. (test: `aç then save …`, `deactivate …`) | karşılandı | |
| Negatif stok kuralı | `negatifStokYasak` / `negatifStokIzinli` / `negatifStokBilinmiyor` metinleri, `ayar.negatifStok` değerine göre | karşılandı | |

### Skaler alanlar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Kimlik: `code` * (≤ 64, büyük harf), `name` * (≤ 200), `barcode` (≤ 64), `category`, `trackingMode`, `unitCode` * (≤ 8) | `kimlikKarti`: `kod`, `ad`, `barkod`, `kategori` (lookup), `takipTuru` (None/Lot/Serial), `anaBirim` | karşılandı | |
| Stok yönetimi: minimum, maksimum, yeniden sipariş, emniyet; tedarik ve üretim süresi (0–3650) | `stokKarti`: altı sayı girişi (`min 0`; süreler `max 3650`, `step 1`) | karşılandı | |
| Fiyat: alış ve satış liste fiyatı (≥ 0); `priceCurrencyCode` (3 harf) | `fiyatKarti`: `alisFiyati`, `satisFiyati`, `fiyatParaBirimi` (`^[A-Z]{3}$`) | karşılandı | |
| İndirim: alış ve satış (0–100) | `fiyatKarti`: `alisIndirimi`, `satisIndirimi` | karşılandı | |
| Vergi: KDV alış/satış, ÖTV, ÖİV, tevkifat, damga (0–100) | `vergiKarti`: altı giriş | karşılandı | |
| Lojistik: net ve brüt ağırlık; en, boy, yükseklik | `lojistikKarti`: beş giriş | karşılandı | |
| Muhasebe: alış, satış ve maliyet hesap kodu (≤ 40) | `muhasebeKarti`: üç giriş | karşılandı | |
| Görsel: `productImageUrl` (≤ 1000, yalnız bağlantı) | `gorsel` ve `gorselOnizleme` (görsel bileşeni) | karşılandı | |
| Pazaryeri: `marketplaceProductId` (≤ 120) | `pazaryeriKimligi` | karşılandı | |
| Oluşturma varsayılanları (TRY, KDV 20) | Boş alan gövdeye yazılmaz; varsayılanı sunucu uygular. Sayfa bunu yer tutucuyla gösterir ("TRY", "20"). | fark | |
| İsteğe bağlı alanı boşaltma (barkod, maksimum stok) | Ölçüldü (test: `clearing an optional field on edit`). Boşaltılan metin alanı `""` olarak gider; sunucu barkodu `null` yapar, yani barkod temizlenir. Boşaltılan sayı alanı `null`'a çözülür; çalışma zamanı da çözülmeyen değeri yazmadığı için kaynak kaydın değeri gövdede kalır (`maximumStock: 100`). **Maksimum stok ve öteki isteğe bağlı sayı alanları sayfadan temizlenemez.** Bu planda düzeltilmedi. | fark | |

### Bileşik bloklar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Birim dönüşümleri: ana birim satırı ve alternatif birimler | `birimIzgarasi` (stage). Sabit satır "Ana birim: {{anaBirim}} (1)", kaynağı `birimler`. | karşılandı | |
| Birim ekle / sil; kart kaydından sonra uygulanır; kısmi hatada bildirim | Dizi sırası: `guncelle` → `birimEkle` (her eklenen satır için POST) → `birimSil` (her silinen satır için DELETE) → `ozelKaydet`. Kısmi hatada "… başarısız … Önceki N işlem kaydedildi" uyarısı çıkar. (test: `unit staging sends POST and DELETE after card save`) | karşılandı | |
| Birim dönüşümleri yalnız TenantAdmin | `disabledWhen: kullanici.rol != 'TenantAdmin'`, nedeni "Birim dönüşümlerini yalnız firma yöneticisi değiştirebilir." TenantUser kart kaydını yapabilir; birim istekleri gitmez. (test: `tenant user gating`) | karşılandı | |
| Özel alanlar: tanımlardan dinamik giriş (Metin, Ondalık, Tarih, Evet/Hayır) | `ozelAlanlar` (customFieldsBlock) ← `ozelTanimlar`, `ozelDegerler` | karşılandı | |
| Zorunlu özel alan boşsa kayıt engellenir | customFieldsBlock doğrulaması | karşılandı | |
| Oluştururken değerler POST gövdesinin `customFields` alanında | `olustur.customFields = {{ozelAlanlar.degerler}}` (test: `yeni then save …`) | karşılandı | |
| Düzenlemede ayrı `PUT /{id}/custom-fields` | `ozelKaydet` (`stok.kart.ozelAlanKaydet`, `bodyMap`) (test: `aç then save …`) | karşılandı | |
| Varyantlar: oluştururken boyut satırları, kartezyen önizleme (en fazla 200), POST `variants[]` | `varyantMatrisi` (matrix, yalnız yeni kartta); `olustur.variants` | karşılandı | |
| Varyantlar: düzenlemede salt okunur liste | `varyantListesi` ← `varyantlar` (yalnız mevcut kartta) | karşılandı | |
| Üretim reçeteleri: salt okunur; bugün tümü yüklenip istemcide süzülüyor | `receteListesi` ← `receteler` (`uretim.recete.listele`). Süzme sunucudadır: `?productStockItemId=<id>`. Kart yüklenmeden istek gitmez. (test: `recipes are read only with product filter`) | karşılandı | |
| Üretim okuma yetkisi olmayan kullanıcı | Reçeteler sekmesi boş liste yerine yetki hatasını gösterir | fark | |
| Özel alan tanım yönetimi | Yok | kapsam dışı | |
| Özel alan değer geçmişi ve geri yükleme | Yok | kapsam dışı | |
| Kategori yöneticisi | Yok | kapsam dışı | |
| Denetim kaydı ("Geçmiş") | Yok | kapsam dışı | |

### Yalnız sunucuda kalan kurallar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Özel alan değer geçmişi veya ilişkili kayıt varsa silme 409 | `kartSil` hatası durum satırında gösterilir | sunucu kuralı | |
| Devre dışı bırakma için bakiye 0 olmalı, açık sipariş satırı olmamalı | `pasifeAl` 409 metni gösterilir (test: `deactivate …`) | sunucu kuralı | |
| Takip türü, hareket varsa değiştirilemez | `guncelle` hatası `takipTuru` altında ya da durum satırında gösterilir | sunucu kuralı | |
| Kapalı döneme hareket girilemez | `hareketEkle` ve `tersKayit` hatası gösterilir | sunucu kuralı | |
| Stok kodu ve barkod benzersizdir | `olustur` / `guncelle` 409 metni gösterilir | sunucu kuralı | |
| `maximumStock ≥ minimumStock` | Sunucunun doğrulama hatası, alan eşlemesiyle bağlı girişin altında ya da durum satırında gösterilir | sunucu kuralı | |

## 6. Pilot v1 kapsamı ve geri dönüş

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Yeni kart ekranı `inventory-stock-create` | Ayrı ekran olarak eski haliyle kalır. Yeni tanımda kart, Yeni ile kart penceresinde oluşturulur. | kapsam dışı | |
| Rol koşulları | Sil ve birimler yalnız TenantAdmin'e açıktır. TenantUser kartı kaydedebilir (test: `tenant user gating`). Hareket girişi ve ters kayıt için sayfa hakkı vardır; izni katalog `allowed` değeri belirler. TenantUser için bu ikisi canlıda doğrulanacak. | karşılandı | |
| Duyarlı (responsive) çekmece | Çekmece çalışma zamanının varsayılan düzeniyle açılır | kapsam dışı | |
| Taşınmayacaklar: her depo için ayrı bakiye çağrısı; tüm reçeteleri yükleyip istemcide süzme | Taşınmadı. Tek uç nokta (`kartDepolari`) ve sunucuda süzme (`receteler`) kullanılır. | karşılandı | |
| v1 dışında kalan her iş için geri dönüş | Sayfa başlığındaki "Eski ekranda aç" bağlantısı. Yükleme hatalarında da gösterilir. | karşılandı | |
