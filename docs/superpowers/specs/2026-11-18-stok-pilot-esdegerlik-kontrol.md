# Stok Kartları pilotu (inventory-stock v1 ve inventory-stock-create v1): eşdeğerlik kontrol listesi

Bu liste, Proje 4'ün canlı QA betiğidir. Her satır, eski ekranın bir öğesini
`src/Hosts/AIERP.Api/SystemPages/Standards/` altındaki standart tanımlardaki karşılığıyla eşler: liste, detay paneli ve
hareket penceresi `inventory-stock.json`, stok kartı formu `inventory-stock-create.json` ("Yeni stok kartı") tanımındadır. Bölümler
`2026-11-18-stok-esdegerlik-envanteri.md` belgesinin 1–4. ve 6. bölümlerini izler.

Kaynaklar:
- Standart tanımlar: `inventory-stock.json` (41 bileşen, 14 sorgu) ve `inventory-stock-create.json` (55 bileşen, 14 sorgu).
  Görünüm düzeltmeleri (2026-11-18, `fix/stok-gorunum`) ve liste/kart ayrımı (2026-11-18, `feat/stok-liste-kart-ayrimi`)
  sürüm 1'de yapıldı: iki standart da `preview` aşamasındadır ve hiçbir firma yayımlamadı.
- Liste ile kart, eski ekrandaki gibi ayrıdır: listenin Yeni ve Aç komutları "Yeni stok kartı" ekranını kendi sekmesinde
  açar (Aç seçili satırın `id`'sini verir). Kart ekranı `{{sayfa.parametre.id}}` okur: boşsa yeni kart, doluysa o kart düzenlenir.
- Çizim testleri: `frontend/erp-web/src/system-pages/inventoryStockStandard.test.tsx` (liste) ve
  `inventoryStockCreateStandard.test.tsx` (kart ekranı; "(kart test: …)" notları). Bu testler tanımı gerçek çalışma
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
| Arama: kod, ad, barkod, kategori; 250 ms gecikme; sayfa 1'e döner | `aramaKutusu` araç satırının (`suzgecKarti`) ilk girişidir ve `q` parametresine bağlıdır; `q` değişince sayfa anahtarı değiştiğinden liste 1. sayfaya döner. Gecikmeyi çalışma zamanının sorgu gecikmesi (300 ms) belirler. Sayfanın 1'e dönmesi canlıda kontrol edilecek. | karşılandı | |
| Sayfa başına 25 kayıt | `liste.paging: server`, `pageSize: 25` → `page=1&pageSize=25` (test: aynı) | karşılandı | |

### Sütunlar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Liste sütunları: Stok kodu, Stok adı, Kategori, Depo bakiyesi, Rezerve, Kullanılabilir, Minimum, Stok değeri, Maliyetsiz miktar, Durum | `liste.columns`: `balance.code`, `balance.name`, `stockItem.category`, `balance.quantityOnHand`, `balance.reservedQuantity`, `balance.availableQuantity`, `balance.minimumStock`, `balance.valuationAmountBase`, `balance.unvaluedQuantity`, `status`. Biçimler `columnFormats` ile verilir (kod, sayı, para, durum). Sütunlar `columns` sırasıyla çizilir (çalışma zamanı artık sorgunun sütun sırasını değil seçim sırasını izler). | karşılandı | |
| Liste tam genişlikte, 1440 px'te yatay kaydırma yok | `liste.width: 12`; yalnız detay paneli açıkken `widthWhen: "8=…"` ile 8'e iner. Kod hücresi tek satır (en az 100 px), metin hücresi sözcük sınırında kırılır (en az 160 px); dar tabloda harf harf kırılma olmaz. | karşılandı | |
| Sütun başlıkları ekran görünümünden gelir ("Depo bakiyesi") | `liste.columnLabels`: "Stok kodu", "Stok adı", "Kategori", "Depo bakiyesi", "Rezerve", "Kullanılabilir", "Minimum", "Stok değeri", "Maliyetsiz miktar", "Durum". `screenViews` yalnız görünürlüğü alır. | karşılandı | |
| Miktar ve birim tek hücrede ("12 ADET"); değer "0,00 TRY" | `liste.columnUnits`: miktar sütunlarına `balance.unitCode`, stok değerine `balance.baseCurrencyCode` eklenir. | karşılandı | |
| Satır onay kutuları, geçerli satır, yoğunluk; "Sütun filtreleri", "Sütunlar", "Pivot görünümü" | Çalışma zamanı tablosu bunları sunmaz. Eski `AdvancedDataGrid`'in veri listesine bağlanması ayrı iş olarak planlandı (rapor: "AdvancedDataGrid planı"). | kapsam dışı | |
| Klavye ipuçları satırı ("↑↓ gez · Boşluk işaretle · Enter aç · Ctrl+Del sil · Ctrl+. detay paneli") | Yok; alt satırda yalnız sayfalayıcı ve `footerMeta` vardır. | kapsam dışı | |
| Kullanılabilir sütununda seviye çubuğu (kullanılabilir/minimum oranı: %50 altı kötü, %100 altı uyarı) | Çubuk yok. Yerine `Durum` sütunu gelir: sunucunun hesapladığı durum, `toneMap` tonuyla gösterilir ("Minimum altı" kırmızı, "Maliyetsiz" sarı, "Yeterli" yeşil, "Pasif" mavi). | fark | |
| Durum önceliği: Pasif > Minimum altı > Maliyetsiz > Yeterli | `InventoryBalancePageItem.Status` sunucuda aynı öncelikle hesaplanır (`InventoryBalancePageSummary`). | karşılandı | |

### Üst çubuk ve özet

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Depo seçici: aranabilir, "Tüm depolar" seçeneği | `depoSecimi`: lookup, `optionsQuery: depolar`, `staticOptions: ["=Tüm depolar"]`, `allowClear` (test: `list requests balances page with filters and paging`) | karşılandı | |
| Tek araç satırı: arama, Depo, "Minimum altı N" çipi, "Detay paneli" | `suzgecKarti` (`layout: "inline"`): kartsız, başlıksız tek satır; `aramaKutusu` (etiket görsel olarak gizli), `depoSecimi` (~220 px), `minimumAlti` ve `pasifler` çip görünümlü onay kutuları, `detayPaneli` sağa yaslı. Göstergelerden sonra, listeden önce gelir. | karşılandı | |
| "Minimum altı" çipi, sayısıyla | `minimumAlti` onay kutusu (çip); etiketi "Minimum altı {{bakiye.meta.belowMinimumCount}}" (test: `metrics show formatted page meta and minimum filter toggles`) | karşılandı | |
| Başlıkta "N kayıt" sayısı | Sayfa başlığı çalışma zamanından gelir ve bağlama almaz; kayıt sayısı listenin alt satırındadır ("1–2 / 2"). | fark | |
| Sağ "Widgetler" rayı (Kritik stoklar, Stoksuz ve rezerve, Depo dağılımı, En çok hareket görenler, Hareketsiz stoklar, Yaklaşan SKT'ler) | Ray sayfanın değil kabuğun parçasıdır (`CustomerReferenceSidebar`, `page === "inventory-stock"`). Yayımlanan sistem sayfası aynı sayfa anahtarında çizildiği için ray aynen görünür; tanıma ayrıca eklenmedi (iki kez çizilirdi). "Kritik stokları listede göster" bağlantısı yalnız eski ekranı süzer (`inventory-stock-widget-filter` olayı). | fark | |
| Yenile düğmesi | İşlem Çubuğu'nun standart Yenile komutu (F5) | karşılandı | |
| Özet kartı: Stok değeri (sayfa toplamı) | `stokDegeriGostergesi`: `pageValuationAmountBase`, para biçimi, "bu sayfa · TRY" (test: aynı) | karşılandı | |
| Özet kartı: Kullanılabilir | `kullanilabilirGostergesi`: sayfa tek birimliyse `pageAvailableQuantity` ve birim. Birimler karışıksa yerine `kullanilabilirKartGostergesi` ("Kullanılabilir stoklu kart", kart sayısı) çıkar. (test: aynı) | fark | |
| Özet kartı: Minimum altı (tıklayınca süzer) | `minimumAltiGostergesi`: `filterInput: minimumAlti`. Tıklama onay kutusunu açıp kapatır ve `belowMinimumOnly=true` gönderir. (test: aynı) | karşılandı | |
| Özet kartı: Maliyetsiz | `maliyetsizGostergesi`: `pageUnvaluedCount` (test: aynı) | karşılandı | |
| Alt bilgi: "N / toplam" ve sayfalayıcı | Sunucu sayfalı tablonun alt satırı ("1–2 / 2", Önceki/Sonraki) ve `footerMeta` ("Minimum altı") | karşılandı | |
| Alt bilgi: seçili kayıt sayısı ve değeri | Liste tek seçimlidir; seçili sayısı ve değeri gösterilmez. Toplu seçim yoktur. | fark | |
| Detay paneli aç/kapat | `detayPaneli` anahtarı (varsayılan açık). Açıkken ve satır seçiliyken `detaySekmeleri` listenin sağında 4 sütunluk panel olur, liste 8'e iner. | karşılandı | |
| Detay paneli kısayolu: Ctrl+. | Kısayol yok. | kapsam dışı | |
| Negatif stok koruması bilgi şeridi (liste altında, "Etkin" rozeti) | `negatifStokKorumaAcik` / `negatifStokKorumaKapali` uyarıları (`alert`, tam genişlik, `ayar.negatifStok`'a göre); herkese görünür. Ayar okunamazsa şerit çıkmaz. Sağdaki "Etkin" rozeti yok. | fark | |

### Komutlar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Yeni (F2) | `komutlar.newButton: yeniDugme`: "Sayfa aç" düğmesi (`@inventory-stock-create`, yeni sekme). Eski ekran gibi kart ayrı sekmede açılır; liste kart formu taşımaz, form kaynaklarını okumaz. (test: `yeni opens the card screen in its own tab`) | karşılandı | |
| Aç (Enter) | `komutlar.openButton: acDugme`: kart ekranını seçili satırın kimliğiyle açar (`params: ["id={{liste.seciliSatir.stockItem.id}}"]`). Seçim yokken Aç "Önce bir kayıt seçin" nedeniyle pasiftir. Eski ekran kartı liste sekmesinde açıyordu; yeni tanımda kart ekranı ayrı sekmededir. (test: `aç opens the selected card on the card screen; Enter and double click too`) | fark | |
| Satıra çift tıklama kartı açar | Çift tıklama satırı seçer ve Aç komutunu çalıştırır (çalışma zamanı: `openButton` bağlamasının `<tablo>.seciliSatir` kökü olan tablo). (test: aynı) | karşılandı | |
| Odaklı satırda Enter | Aç seçili satıra göre çalışır. Odaklı ama seçili olmayan satırda Enter önce satırı seçer. | fark | |
| Sil (Ctrl+Delete), yalnız TenantAdmin, tehlike onayı | `komutlar.deleteQuery: kartSil` (`stok.kart.sil`). Silmeden önce tehlike onayı sorulur. Katalog `allowed:false` döndüğünde Sil "Bu işlem için yetkiniz yok" nedeniyle pasiftir. (test: `tenant user gating`) | karşılandı | |
| Toplu silme ve kısmi hataların listesi | Toplu seçim ve toplu silme yok | kapsam dışı | |
| Toplu Excel | İşlem Çubuğu Excel komutu (`exportTable: liste`). Yalnız görünen sayfayı (25 satır) dışa aktarır. | fark | |
| CSV dışa aktar (Ctrl+E) | CSV yok. Ctrl+E, Excel dışa aktarma komutudur. | fark | |
| Devre dışı bırak (`POST /{id}/deactivate {rowVersion, confirmation:true}`); sunucu 409 | `devreDisiBirak` (menü) → `pasifeAl`. Onay metni sorulur. `rowVersion` ve `confirmation:true` gider; 409 metni gösterilir. (test: `deactivate confirms and shows server conflict text`) | karşılandı | |
| Etkinleştir | `etkinlestir` (menü, yalnız pasif kartta görünür) → `aktifEt` | karşılandı | |
| Hareketler / ekle (depo seçili olmalı) | `hareketlerDugmesi` (menü). Depo seçili değilse "Hareket için önce bir depo seçin." nedeniyle pasiftir. (test: `movement dialog posts movement and reversal sends reason`) | karşılandı | |
| Kategorileri yönet (TenantAdmin) | Kategori yöneticisi yok. Kategori, `kategoriler` listesinden seçilir. | kapsam dışı | |
| Özel alanlar (tanım yönetimi) | Özel alan tanım yönetimi yok. Değer girişi kart ekranındadır. | kapsam dışı | |
| `inventory-stock-movements` ekran görünümünün içe aktarılması | Yalnız `inventory-stock` görünümü (`liste`) eşlenir. Hareket tablosu görünümü içe aktarılmaz. | kapsam dışı | |

## 2. Detay paneli

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Panel yeri: listenin sağında | `detaySekmeleri.width: 4`, listeden hemen sonra; liste `widthWhen` ile 8'e iner. İçerikleri paneli doldurur (`width: 12`). | karşılandı | |
| Başlık: stok kodu ve adı | `ozetBaslik` (başlık bileşeni): "{{kod}} · {{ad}}" | karşılandı | |
| Başlık: durum etiketi ve Lot/Seri etiketi | Etiket yerine panel alanları gelir: "Durum" ve "Lot / seri"; takip türü `liste.valueLabels` ile "Yok / Lot / Seri" yazılır (ham "None" değil). | fark | |
| Başlıkta Aç ve Kapat düğmeleri | Aç, İşlem Çubuğu'ndadır. Kapat yerine "Detay paneli" anahtarı ya da seçimin kaldırılması paneli gizler. | fark | |
| Özet sekmesi: bakiye, kullanılabilir, rezerve, minimum, değer, maliyetsiz, kategori, birim | Tasarımcıda tek tek seçilebilen bileşenler: `ozetBakiye`, `ozetKullanilabilir`, `ozetRezerve` (miktar + birim), `ozetStokDegeri` (para + birim) göstergeleri ve `ozetPaneli` ("Kart bilgileri": Minimum, Maliyetsiz, Kategori, Birim, Lot / seri, Durum). "Hareketler / ekle" düğmesi İşlem Çubuğu'nun menüsünde kalır (taşınan düğme sekmede çizilmez). | karşılandı | |
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
| Kayıttan sonra pencere açık kalır, liste seçimi korunur | Pencere kayıttan sonra kapanır (`closeOnSave`). `bakiye` yenilenir; aynı kimlikli satır seçili kalır, yeni hareket için pencere yeniden açılır (test: `movement dialog posts movement and reversal sends reason`). | fark | |
| Liste: depo bazında, 50'şer kayıtla sayfalı | `hareketTablosu` ← `hareketler`, `paging: server`, `pageSize 50` | karşılandı | |
| Ters kayıt: zorunlu gerekçe, `POST …/{entryId}/reverse {reason}` | `tersKayitDugmesi` (satır işlemi). "Ters kayıt gerekçesi" istemi zorunludur ve `{reason}` gönderilir. Ters kaydı olan veya kendisi ters kayıt olan satırda pasiftir. (test: aynı) | karşılandı | |
| Ters kayıttan sonra liste kullanılabilir kalır | Ters kayıttan sonra `liste` seçimi ve hareket satırları korunur; ikinci ters kayıt kendi `entryId`'siyle gider. (test: `reversal keeps the movement list usable`) | karşılandı | |
| Ters kayıttan sonra liste bakiyesi hemen güncellenir | Pencere açıkken `bakiye` yenilenmez (satır işlemi yalnız `refreshQueries`i yeniler). Pencereyi kapatmak da listeyi yenilemez; liste bakiyesi yalnız Yenile (F5) ile güncellenir. Depolar ve son hareketler hemen yenilenir. | fark | |

## 4. Stok kartı formu

### Çerçeve

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Düzenleme açılışı; birimler, özel alanlar, varyantlar ve reçeteler paralel yüklenir | Kart ayrı ekrandır (`inventory-stock-create`). `kart` (`stok.kart.getir`) `{{sayfa.parametre.id}}` ile okunur; ona bağlı `birimler`, `ozelTanimlar`, `ozelDegerler`, `varyantlar`, `receteler` sorguları yüklenir. Başlık yeni kartta "Yeni stok kartı", kayıtlı kartta "Stok kartı {kod}" olur (`pageTitle` başlıkları). Sekme başka bir kartla yeniden açılınca sayfa baştan kurulur, yazılanlar taşınmaz. (kart test: `header says …`, `opening another card starts fresh instead of carrying typed values`) | karşılandı | |
| Kaynak okumaları yüklenirken kayıt | Bir kaynak okuması (ör. özel alan değerleri) yüklenirken Kaydet hiçbir şey yazmaz ve "Kaynak kayıt yükleniyor; biraz sonra yeniden deneyin." gösterir. (kart test: `save while a source read loads writes nothing`) | karşılandı | |
| Değişiklik izleme: değişen alan sayacı, çıkışta onay | Yedi kart formCard'ı `trackChanges: true` ve `recordKey` taşır. Kirli kayıtta Yeni "Kaydedilmemiş değişiklikler kaybolacak" onayını sorar (kart test: `yeni on a dirty card asks before clearing`). Kart sekmesini kapatmak ya da listeden başka bir kartı açmak onay sormaz. | fark | |
| Her değişen alanda "Önceki: …" gösterimi | Yok | kapsam dışı | |
| Sekme durumları (tamam / boş / hata) | `kartSekmeleri` (8 sekme) yalnız hata durumunu gösterir: hata işareti ve hata sayısı. Geçersiz kayıtta ilk hatalı sekmeye geçilir. "Tamam" ve "boş" durumları yoktur. | fark | |
| Ctrl+S kaydeder | Ctrl+S, kart ekranının İşlem Çubuğu kayıt dizisini çalıştırır (`komutlar.saveSequence`). (kart test: `yeni then save posts exactly one card and returns to the list`) | karşılandı | |
| Esc kapatır; kayıttan sonra listeye dönülür | Kart bir pencere değil, ekrandır: Esc kapatmaz, sekme kapatılır. Tam başarılı kayıttan sonra (`afterSaveButton: listeyeDon`) kart alanları boşalır ve Stok Kartları listesine dönülür; açık liste yenilenir (eski ekrandaki `inventory-stock-refresh` gibi). Kısmi kayıtta ekran açık kalır. (kart test: `yeni then save …`, `retry after a partial create …`; liste test: `a save on the card screen refreshes the open list`) | fark | |
| F2 yeni kayıt; kaydedilmemiş değişiklikte onay | `komutlar.newButton: yeniKartDugmesi`: kirliyse önce onay sorulur, kart alanları boşalır ve ekran parametresiz (yeni kart) açılır. Kayıtlı kartta F2 yeni karta geçer; eski kartın değerleri taşınmaz. (kart test: `yeni on an opened card starts a fresh card that does not carry the old values`) | karşılandı | |
| PgUp / PgDn önceki ve sonraki kayda geçer | Yok | kapsam dışı | |
| Eşzamanlılık: `rowVersion`, çakışmada 409 | `guncelle`, `pasifeAl` ve `aktifEt`, `rowVersion`'ı kaynak `kart` satırından alır. 409 metni gösterilir. (kart test: `opened card saves PUT …`; liste test: `deactivate …`) | karşılandı | |
| Negatif stok kuralı | `negatifStokYasak` / `negatifStokIzinli` / `negatifStokBilinmiyor` metinleri, `ayar.negatifStok` değerine göre | karşılandı | |

### Skaler alanlar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Kimlik: `code` * (≤ 64, büyük harf), `name` * (≤ 200), `barcode` (≤ 64), `category`, `trackingMode`, `unitCode` * (≤ 8) | `kimlikKarti`: `kod` *, `ad` *, `barkod`, `kategori` (açılır liste, `kategoriler` + listede olmayan geçerli değer), `takipTuru` (açılır liste: Yok / Lot / Seri), `anaBirim` * (metin). Zorunlu girişlerin etiketinde "*" görünür. | karşılandı | |
| Pencere arkası | Kart tam sayfa ekrandır; pencere arkası yoktur. | fark | |
| Stok yönetimi: minimum, maksimum, yeniden sipariş, emniyet; tedarik ve üretim süresi (0–3650) | `stokKarti`: altı sayı girişi (`min 0`; süreler `max 3650`, `step 1`) | karşılandı | |
| Fiyat: alış ve satış liste fiyatı (≥ 0); `priceCurrencyCode` (3 harf) | `fiyatKarti`: `alisFiyati`, `satisFiyati`, `fiyatParaBirimi` (`^[A-Z]{3}$`) | karşılandı | |
| İndirim: alış ve satış (0–100) | `fiyatKarti`: `alisIndirimi`, `satisIndirimi` | karşılandı | |
| Vergi: KDV alış/satış, ÖTV, ÖİV, tevkifat, damga (0–100) | `vergiKarti`: altı giriş | karşılandı | |
| Lojistik: net ve brüt ağırlık; en, boy, yükseklik | `lojistikKarti`: beş giriş | karşılandı | |
| Muhasebe: alış, satış ve maliyet hesap kodu (≤ 40) | `muhasebeKarti`: üç giriş | karşılandı | |
| Görsel: `productImageUrl` (≤ 1000, yalnız bağlantı) | `gorsel` ve `gorselOnizleme` (görsel bileşeni) | karşılandı | |
| Pazaryeri: `marketplaceProductId` (≤ 120) | `pazaryeriKimligi` | karşılandı | |
| Oluşturma varsayılanları (TRY, KDV 20) | Boş alan gövdeye yazılmaz; varsayılanı sunucu uygular. Sayfa bunu yer tutucuyla gösterir ("TRY", "20"). | fark | |
| İsteğe bağlı alanı boşaltma (barkod, maksimum stok) | Boşaltılan metin alanı `""` olarak gider; sunucu barkodu `null` yapar, yani barkod temizlenir. Kullanıcının boşalttığı isteğe bağlı sayı alanı (maksimum stok, yeniden sipariş noktası, fiyatlar, ağırlık ve ölçüler) `null` olarak gider ve kaynak kaydın değerini ezer, yani temizlenir (kart test: `clearing an optional field on edit`). Boş bırakılamayan sayı alanları (minimum ve emniyet stoku, tedarik ve üretim süresi, iskonto ve vergi oranları) kayıtlı kart düzenlenirken `requiredWhen` ile zorunludur: boşaltılınca "Bu alan zorunludur." gösterilir, kayıt yapılmaz (kart test: `clearing a non-nullable number on edit is required`). Yeni kartta bu alanlar boş bırakılabilir, varsayılanı sunucu uygular. | karşılandı | |

### Bileşik bloklar

| Eski ekran öğesi | Yeni tanımda karşılığı (bileşen / sorgu / işlem) | Durum | Canlı sonuç |
|---|---|---|---|
| Birim dönüşümleri: ana birim satırı ve alternatif birimler | `birimIzgarasi` (stage). Sabit satır "Ana birim: {{anaBirim}} (1)", kaynağı `birimler`. | karşılandı | |
| Birim ekle / sil; kart kaydından sonra uygulanır; kısmi hatada bildirim | Dizi sırası: `guncelle` → `birimEkle` (her eklenen satır için POST) → `birimSil` (her silinen satır için DELETE) → `ozelKaydet`. Kısmi hatada "… başarısız … Önceki N işlem kaydedildi" uyarısı çıkar. (kart test: `unit staging sends POST and DELETE after card save`) | karşılandı | |
| Birim dönüşümleri yalnız TenantAdmin | `disabledWhen: kullanici.rol != 'TenantAdmin'`, nedeni "Birim dönüşümlerini yalnız firma yöneticisi değiştirebilir." TenantUser kart kaydını yapabilir; birim istekleri gitmez. (kart test: `tenant user gating`) | karşılandı | |
| Özel alanlar: tanımlardan dinamik giriş (Metin, Ondalık, Tarih, Evet/Hayır) | `ozelAlanlar` (customFieldsBlock) ← `ozelTanimlar`, `ozelDegerler` | karşılandı | |
| Zorunlu özel alan boşsa kayıt engellenir | customFieldsBlock doğrulaması | karşılandı | |
| Oluştururken değerler POST gövdesinin `customFields` alanında | `olustur.customFields = {{ozelAlanlar.degerler}}` (kart test: `yeni then save posts exactly one card and returns to the list`) | karşılandı | |
| Düzenlemede ayrı `PUT /{id}/custom-fields` | `ozelKaydet` (`stok.kart.ozelAlanKaydet`, `bodyMap`) (kart test: `opened card saves PUT …`) | karşılandı | |
| Varyantlar: oluştururken boyut satırları, kartezyen önizleme (en fazla 200), POST `variants[]` | `varyantMatrisi` (matrix, yalnız yeni kartta); `olustur.variants` | karşılandı | |
| Varyantlar: düzenlemede salt okunur liste | `varyantListesi` ← `varyantlar` (yalnız mevcut kartta) | karşılandı | |
| Üretim reçeteleri: salt okunur; bugün tümü yüklenip istemcide süzülüyor | `receteListesi` ← `receteler` (`uretim.recete.listele`). Süzme sunucudadır: `?productStockItemId=<id>`. Kart yüklenmeden istek gitmez. (kart test: `recipes are read only with product filter`) | karşılandı | |
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
| Yeni kart ekranı `inventory-stock-create` | Ayrı standart tanım (`inventory-stock-create.json`, "Yeni stok kartı"): eski ekran gibi liste ile kart ayrıdır. Liste Yeni ile boş, Aç ile seçili kartı açar. | karşılandı | |
| Rol koşulları | Sil ve birimler yalnız TenantAdmin'e açıktır. TenantUser kartı kaydedebilir (liste ve kart test: `tenant user gating`). Hareket girişi ve ters kayıt için sayfa hakkı vardır; izni katalog `allowed` değeri belirler. TenantUser için bu ikisi canlıda doğrulanacak. | karşılandı | |
| Duyarlı (responsive) çekmece | Çekmece yok: kart, çalışma zamanının sayfa düzeniyle tam sayfa açılır. | fark | |
| Taşınmayacaklar: her depo için ayrı bakiye çağrısı; tüm reçeteleri yükleyip istemcide süzme | Taşınmadı. Tek uç nokta (`kartDepolari`) ve sunucuda süzme (`receteler`) kullanılır. | karşılandı | |
| v1 dışında kalan her iş için geri dönüş | Sayfa başlığındaki "Eski ekranda aç" bağlantısı. Yükleme hatalarında da gösterilir. | karşılandı | |
