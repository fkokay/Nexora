# Stok Kartları (inventory-stock): eşdeğerlik envanteri

Bu belge, uyarlanabilir ERP pilotu (Proje 4) ve eksik bileşenler (Proje 2) için girdidir. Kod okunarak çıkarılmıştır
(2026-11-18).

Kaynaklar:
- `frontend/erp-web/src/InventoryPage.tsx`
- `inventory/useStockListScreen.tsx`
- `inventory/components/{InventoryStockGrid, InventoryStockFilters, InventoryStockDetailPanel, StockCardAside}.tsx`
- `src/Hosts/AIERP.Api/Program.cs`, satır 1817–2410 (stok) ve 2887–3190 (bakiye ve hareket)
- `PlatformContracts.cs`

Bu envanterin dışında kalanlar:
- transferler,
- maliyet yöneticisi (`inventory-cost`),
- depo özel alan kataloğu,
- CSV içe aktarma.

## 1. Liste

### Veri kaynağı

Liste satırları `/api/stock/items` uç noktasından **gelmez**. Satırların kaynağı:
- `GET /api/warehouses/balances/page?page&pageSize=25&belowMinimumOnly&q` (tüm depolar), ya da
- `GET /api/warehouses/{warehouseId}/balances/page` (tek depo).

Yanıt `InventoryBalancePage{items[{balance, stockItem}], page, pageSize, totalCount, belowMinimumCount}` biçimindedir
ve yalnız aktif kartları içerir.

Arama ve sayfalama:
- Arama `q` ile yapılır; stok kodu, adı, barkodu ve kategorisi içinde aranır. 250 ms gecikmeyle çalışır ve
  sayfayı 1'e döndürür.
- Sayfa başına 25 kayıt.

### Sütunlar

Sütunlar `inventory-stock` ekran görünümüne göre gelir:

| Sütun | Gösterim |
|---|---|
| Stok kodu | |
| Stok adı | |
| Kategori | |
| Depo bakiyesi | miktar ve birim |
| Rezerve | |
| Kullanılabilir | eksikse kırmızı; seviye çubuğu var (kullanılabilir/minimum oranı: %50 altı kötü, %100 altı uyarı) |
| Minimum | |
| Stok değeri | para birimiyle |
| Maliyetsiz miktar | |
| Durum | öncelik sırası: Pasif > Minimum altı > Maliyetsiz > Yeterli |

### Üst çubuk ve özet

- **Depo seçici:** aranabilir; "Tüm depolar" seçeneği var.
- **"Minimum altı" çipi:** sayısıyla birlikte gösterilir.
- **Yenile** düğmesi.
- **Dört özet kartı:**
  - Stok değeri (sayfa toplamı),
  - Kullanılabilir,
  - Minimum altı (tıklayınca süzer),
  - Maliyetsiz.
- **Alt bilgi:** seçili kayıt sayısı ve değeri, "N / toplam", sayfalayıcı.
- **Detay paneli aç/kapat:** Ctrl+.

### Komutlar

| Komut | Kısayol | Koşul / davranış |
|---|---|---|
| Yeni | F2 | |
| Aç | Enter | |
| Sil | Ctrl+Delete | Yalnız TenantAdmin. Toplu yapılabilir; kısmi hataları listeler; tehlike onayı ister. |
| Toplu Excel | | |
| Devre dışı bırak | | `POST /{id}/deactivate {rowVersion, confirmation:true}`. Sunucu 409 döner: bakiye ≠ 0, açık satış siparişi veya açık satınalma siparişi satırı varsa. |
| Hareketler / ekle | | Depo seçili olmalı. |
| Kategorileri yönet | | TenantAdmin. |
| Özel alanlar | | |
| CSV dışa aktar | Ctrl+E | |

## 2. Detay paneli

Başlık:
- stok kodu ve adı,
- durum etiketi,
- Lot/Seri etiketi,
- Aç ve Kapat düğmeleri.

Sekmeler:
- **Özet:** bakiye, kullanılabilir, rezerve, minimum, değer, maliyetsiz, kategori, birim.
- **Depolar:** bugün her depo için ayrı bakiye çağrısı yapılıyor. Yerine tek bir uç nokta önerilir:
  `GET /api/stock/items/{id}/balances`.
- **Hareketler:** son 5 hareket, `GET /api/stock/items/{id}/transactions?pageSize=5` ile.

Yalnız açık olan sekme yüklenir. Seçim değiştikten 150 ms sonra istek atılır; eski yanıtlar atılır.

## 3. Hareket penceresi

Pencere depo seçili olduğunda açılır.

Alanlar:
- Yön * (Giriş / Çıkış)
- Tarih * (kapalı dönem → 409)
- Hareket birimi: ana birim ve dönüşümler, `GET /{id}/units` ile gelir.
- Miktar * (> 0, 4 ondalık)
- Açıklama * (≤ 240 karakter)
- Depo konumu: yalnız deponun aktif konumları varsa gösterilir.
- Birim maliyet: yalnız Giriş'te.
- Lot / seri kodu *: takip türü varsa zorunlu. Seri girişinde her kodun miktarı 1'dir.
- Son kullanma tarihi *: yalnız Lot'ta.

İşlemler:
- **Kaydet:** `POST /api/warehouses/{wid}/stock/{sid}/transactions`.
- **Liste:** depo bazında, 50'şer kayıtla sayfalanır.
- **Ters kayıt:** zorunlu bir gerekçe istenir, `POST .../transactions/{entryId}/reverse {reason}` ile gönderilir.

## 4. Stok kartı formu

### Çerçeve

- **Düzenleme açılışı:** form liste satırından doldurulur; tek kayıt okuma (GET by id) uç noktası yoktur. Ardından
  şunlar paralel yüklenir:
  - birimler,
  - özel alan tanımları,
  - özel alan değerleri,
  - varyantlar,
  - reçeteler.
- **Değişiklik izleme:** her değişen alanda "Önceki: …" gösterilir; sayaç vardır; kaydedilmemiş değişiklik varsa
  çıkışta onay istenir.
- **Sekme durumları:** tamam / boş / hata.
- **Kısayollar:**
  - Ctrl+S kaydeder, Esc kapatır.
  - F2 yeni kayıt açar; kaydedilmemiş değişiklik varsa önce onay ister.
  - PgUp / PgDn önceki ve sonraki kayda geçer.
- **Eşzamanlılık:** `rowVersion` ile; çakışmada 409.

### Skaler alanlar (yaklaşık 33 alan)

| Bölüm | Alanlar |
|---|---|
| Kimlik | `code` * (≤ 64, benzersiz, büyük harf); `name` * (≤ 200); `barcode` (≤ 64, benzersiz); `category`; `trackingMode` (None/Lot/Serial, hareket varsa değişmez); `unitCode` * (≤ 8) |
| Stok yönetimi | `minimumStock` (≥ 0); `maximumStock` (≥ minimum); `reorderPoint`; `safetyStock`; `procurementLeadTimeDays` ve `manufacturingLeadTimeDays` (0–3650) |
| Fiyat | alış ve satış liste fiyatı (≥ 0); `priceCurrencyCode` * (3 harf) |
| Vergi | KDV alış/satış, ÖTV, ÖİV, tevkifat, damga (0–100) |
| İndirim | alış ve satış indirimi (0–100) |
| Lojistik | net ve brüt ağırlık; en, boy, yükseklik |
| Muhasebe | alış, satış ve maliyet hesap kodu (≤ 40) |
| Görsel | `productImageUrl` (≤ 1000; yükleme yok, yalnız bağlantı) |
| Pazaryeri | `marketplaceProductId` (≤ 120) |

### Bileşik bloklar

- **Birim dönüşümleri** (yalnız TenantAdmin):
  - tablo: ana birim satırı ve alternatif birimler;
  - ekle / sil (`POST` ve `DELETE /{id}/units`);
  - değişiklikler kart kaydından sonra uygulanır; kısmi hatada bildirim gösterilir.
- **Özel alanlar:**
  - girişler tanımlardan dinamik olarak çizilir (Metin, Ondalık, Tarih, Evet/Hayır);
  - zorunlu alan boşsa kayıt engellenir;
  - oluştururken değerler POST gövdesinin `customFields` alanında gider;
  - düzenlemede ayrı bir `PUT /{id}/custom-fields` çağrısı yapılır.
- **Varyantlar:**
  - oluştururken boyut satırları girilir ve kartezyen önizleme gösterilir (en fazla 200 varyant); POST gövdesinin
    `variants[]` alanında gider;
  - düzenlemede salt okunur liste gösterilir.
- **Üretim reçeteleri:** salt okunur. Bugün tüm reçeteler yüklenip istemcide süzülüyor; bunun için sunucu tarafında
  süzme eklenmeli.
- **Özel alan tanım yönetimi, geçmiş ve geri yükleme, kategori yöneticisi:** yönetici işleri.

### Yalnız sunucuda kalan kurallar

Bunlar sayfalara kopyalanmaz:
- Özel alan değer geçmişi veya ilişkili kayıt varsa silme 409 döner.
- Devre dışı bırakma için bakiye 0 olmalı ve açık sipariş satırı bulunmamalı.
- Takip türü, hareket varsa değiştirilemez.
- Kapalı döneme hareket girilemez.
- Stok kodu ve barkod benzersizdir.

## 5. Eksikler

### Katalog ve uç nokta eksikleri

- **G1. Eksik işlemler:**
  - `stok.bakiye.sayfa` (iki bakiye yolu; isteğe bağlı `warehouseId`)
  - `depo.listele`
  - `stok.kart.birimleri`, `stok.kart.birimEkle`, `stok.kart.birimSil`
  - `stok.kart.ozelAlanKaydet`
  - `stok.hareket.listele`, `stok.hareket.ekle`, `stok.hareket.tersKayit`
  - `depo.konumlari`
  - `uretim.recete.listele` (ürüne göre süzmeli)
  - `ayar.negatifStok`
  - kategori işlemleri
  - özel alan tanım ve geçmiş işlemleri
- **G2. Tek kayıt okuma yok.** `GET /api/stock/items/{id}` eklenmeli. Proje 1, Task 1 bunu ekliyor.
- **G3. Liste sonucu yetmiyor.**
  - İç içe satır yolu ve düzleştirme gerekiyor: `{balance, stockItem}` satırları `balance.*` ve `stockItem.*`
    olarak açılmalı.
  - Yanıttaki üst bilgiler bağlanabilir olmalı: `{{q.meta.totalCount}}`, `{{q.meta.belowMinimumCount}}`.
- **G7. Parametre sınırı.** Bir sorgu en fazla 20 parametre alabiliyor. İşlem sorgularında sınır 60'a çıkarılıyor
  (Proje 1, Task 2 kararı).
- **G8. Bileşik kayıt.** Tek bir "Kaydet" birden çok işlemi sırayla çalıştırabilmeli:
  - kart PUT veya POST,
  - özel alan PUT,
  - birim DELETE ve POST çağrıları.

  Bunun için İşlem Çubuğu ve düğmeye sıralı bir `saveSequence` eklenir: hata olursa dur ya da devam et seçeneği
  olur, ve sonraki adım `{{onceki.sonuc.id}}` ile önceki sonucu alabilir.
- **G9. Kart bazında depo bakiyeleri** için tek bir uç nokta: `GET /api/stock/items/{id}/balances`.

### Yeni genel bileşenler (Proje 2)

1. **tabs.** Sekme durumu (tamam / boş / hata) ve sayaç gösterir. Alt bileşenler bağlı kalır, böylece doğrulama
   sekmeler arasında çalışır. Geçersiz kayıtta ilk hatalı sekmeye geçer.
2. **lookupSelect.** Sunucuda arama yapan seçim kutusu: arama parametresi, etiket ve değer sütunları, statik
   seçenekler, temizleme.
3. **Sunucu sayfalı tablo.** Sayfa ve sayfa boyutu parametreleri, toplam kayıt yolu, arama girişi, satır yolu, toplu
   işlemler, seviye çubuğu biçimi.
4. **dependentList.** Seçime bağlı alt liste: üst kayıt değişince yeniden yüklenir, eski yanıtları atar. Satır
   eylemleri onay ya da gerekçe sorabilir.
5. **editableGrid.** Satır düzenlenen tablo:
   - doğrulama kuralları: zorunlu, uzunluk, en küçük değer, benzersizlik;
   - ekle / sil / güncelle sorguları;
   - "kayda kadar beklet" kipi;
   - sabit satırlar;
   - gövde listesi kipi (varyantlar).
6. **customFieldsBlock.** Tanım ve değer sorgularından dinamik girişler çizer; tek başına kaydedilir ya da form
   gövdesinin parçası olur.
7. **imageField.** Bağlantı alanı, görsel gösterimi ve yüklenemezse yer tutucu.
8. **visibleWhen / disabledWhen.** Tüm bileşenlerde ortak özellik. Rol, giriş değeri ve satır değerine göre ifade
   alır; devre dışı nedenini gösterir.
9. **formCard değişiklik izleme.** Önceki değer gösterimi, değişen alan sayacı ve kayıtlar arası gezinme.
10. **Gerekçe soran onay.** Düğme ve satır eylemlerinde kullanılır, örneğin ters kayıt gerekçesi.

Küçük eklemeler:
- giriş doğrulama özellikleri: `min`, `max`, `step`, `maxLength`, `pattern`, `upperCase`;
- istemci tarafı toplamlarla gösterge;
- pencere / çekmece kabı.

## 6. Pilot v1 kapsamı

**v1'de (eski ekrandan az iş yapmama kuralı için zorunlu):**
- Liste: sunucu sayfalı tablo, arama, depo seçimi, Minimum altı çipi, 4 özet kartı.
- İşlem Çubuğu: Yeni, Aç, Sil, Yenile, Excel; menüde Devre dışı bırak ve Hareketler.
- Detay paneli: Özet, Depolar, Hareketler sekmeleri.
- Kart formu:
  - tüm skaler alanlar,
  - doğrulama,
  - oluşturma ve güncelleme (`rowVersion` ile),
  - devre dışı bırakma ve etkinleştirme,
  - birim dönüşümleri,
  - özel alan değerleri,
  - varyantlar,
  - reçeteler (salt okunur).
- Hareket penceresi: giriş, liste ve ters kayıt.
- Rol koşulları ve kısayollar.

**Sonraya kalanlar:**
- özel alan tanım yönetimi,
- değer geçmişi ve geri yükleme,
- kategori yöneticisi,
- denetim kaydı ("Geçmiş"),
- PgUp/PgDn gezinme ve "Önceki" gösterimi,
- duyarlı (responsive) çekmece.

Bunlar için geri dönüş süresince eski ekrana bir "Eski ekranda aç" bağlantısı bırakılır.

**Taşınmayacaklar:**
- Erişilemeyen "devre dışı kartlar" paneli; yerine sunucuda "pasifleri de getir" süzgeci eklenir.
- Her depo için ayrı bakiye çağrısı.
- Tüm reçeteleri yükleyip istemcide süzme.
