# Stok & Depo: sistem standartlarını kalıplarla yeniden tasarlama (taslak)

Durum: tasarım taslağı, kod yok. Çizim: `docs/design-proposals/studio-sadelestirme/14-stok-depo.html`. Çerçeve `2026-11-28-satis-cari-yeniden-tasarim-design.md` ile aynıdır.

## Çerçeve

- Canlıdaki formlar deneme verisidir (karar 2026-11-27). Kalan standartlar doğrudan kalıplara çizilir; davranış eski ekranla birebir olmak zorunda değil, iş akışı (oluştur, güncelle, pasife al, hareket gir, transfer yap, iptal et / ters kayıt) yapılabilir kalır.
- Kalıba yalnız yeniden tasarlanan ekranın gerçekten istediği özellik eklenir.
- Bu modülde zaten kalıplı: `inventory-cost` (Liste), `inventory-tracking` (Liste).
- Defter kuralı değişmez: stok hareketleri silinmez/güncellenmez; düzeltme ters kayıtla, transfer iptali bağlı ters hareketlerle yapılır. Negatif stok engeli ve ana birime normalleştirme sunucuda kalır.

## Özet

| Standart | Kalıp | Yeni belge modeli |
|---|---|---|
| inventory-warehouses | Liste (+ kart grubu, Depo penceresi) | yok |
| inventory-locations | Liste (+ kart grubu, pencereler) | yok |
| inventory-stock-movements | Liste | yok |
| inventory-stock | Liste (+ kart grubu, hareket penceresi) | yok |
| inventory-stock-create | Kayıt kartı | yok |
| inventory-transfers | Liste + Belge | `stok.transfer` (yeni) |

## 1. inventory-warehouses

- **Amaç:** depo tanımlamak, pasife almak; deponun konumlarına ulaşmak.
- **Sorgular:** `depolar`, `konumlar`, `ozelTanimlar`, `ozelDegerler`; yazma: `olustur`, `guncelle`, `ozelKaydet`, `pasifeAl`, `aktifEt`.
- **Komutlar:** Yeni (formu temizler), Kaydet (ardışık: oluştur / özel alan kaydet / güncelle), Devre dışı bırak, Etkinleştir, Excel; arama + durum süzgeci. Sağ bölmede kayıt formu (kod, ad, özel alanlar, pasif notu). **Pencere:** yok.
- **Öneri: Liste.** Süzgeç (arama, durum), tablo (kod, ad, durum, konum sayısı), sağda tek kart grubu (kod, ad, durum, konum sayısı, not). Komut çubuğunda Yeni depo / Düzenle (aynı **Depo penceresi**: kod, ad, Kaydet); satır eylemleri Pasife al / Etkinleştir (duruma göre biri) ve "Konumlar" (`inventory-locations`'a depo süzgeciyle gider).
- **Kalır:** kod/ad, pasife al/etkinleştir, konum bağlantısı. **Sadeleşir:** sağ bölme formu pencereye iner (Liste'de düzenlenebilir kart yok); "kayıttan sonra yenile" kalıbın kendi davranışı olur; konum listesi depo kartından kalkar (konum ekranı var).
- **Eksik:** depo özel alanları pencerede yok (aşağıda madde 1).
- **Belge modeli:** gerekmez.

## 2. inventory-locations

- **Amaç:** deponun raf/konum ağacını tanımlamak; konumdaki bakiyeyi ve konumsuz stok farkını izlemek.
- **Sorgular:** `depolar`, `konumlar`, `bakiyeler`, `denetim`; yazma: `olustur`, `guncelle`, `pasifeAl`.
- **Komutlar:** Yeni/Kaydet, Pasife al (TenantAdmin; etkin alt konumu ya da bakiyesi olan konum pasife alınamaz), arama + depo + durum süzgeci; depo seçilmediyse "Depo seçin" notu. Sağ bölme: kimlik (kod, ad), yerleşim (üst konum, aktif), özet, konum bakiyesi tablosu. Altta "Konumlandırma denetimi" tablosu. **Pencere:** yok.
- **Öneri: Liste.** Süzgeç: Depo (zorunlu; seçilmezse tablo yerine ipucu), arama, durum. Göstergeler: konum sayısı, aktif, konumsuz kalan kart. Tablo (kod, ad, üst konum, durum). Sağ kart grubu: konum özeti (kod, ad, üst konum, durum). Komutlar Yeni konum / Düzenle (**Konum penceresi**: kod, ad, üst konum, aktif); satır eylemi Pasife al; "Bakiyeler" ve "Konumlandırma denetimi" iki ayrı **tablo penceresi**.
- **Kalır:** hepsi. **Sadeleşir:** denetim ve bakiye tabloları sayfanın altına yığılmaz, pencerede açılır; yeni/düzenle formu pencereye iner.
- **Belge modeli:** gerekmez.

## 3. inventory-stock-movements

- **Amaç:** bir stok kartının depo hareket geçmişini görmek.
- **Sorgular:** `stokBakiyeleri` (seçici), `depolar`, `stokOzeti`, `gecmis` (sunucu sayfalı). **Komutlar:** yalnız Excel; yeni/kaydet/sil yok. **Pencere:** yok.
- **Öneri: Liste.** Süzgeç: Stok (arama seçici; stok kartından `stockItemId` ile dolu gelir), Depo (varsayılan tümü), tarih aralığı (hareket sayısı büyüyünce gerekli). Göstergeler: mevcut miktar, stok değeri (seçili stok için). Tablo: tarih, yön, miktar (girilen birimle), depo, konum, lot/seri, açıklama, birim maliyet. Satır eylemi **Ters kayıt** (gerekçe sorar; ters kaydı olan ya da kendisi ters kayıt olan satırda kapalı, nedeni yazılı). Stok seçilmemişse ipucu.
- **Kalır:** hepsi. **Eklenen:** Ters kayıt eylemi eski stok penceresinden buraya gelir (geçmiş tek yerde). **Sadeleşir:** "seçili stok özeti" başlığı iki göstergeye iner.
- **Belge modeli:** gerekmez.

## 4. inventory-stock

- **Amaç:** stok kartlarını depo bakiyeleriyle birlikte bulmak; kart açmak, pasife almak, hareket girmek.
- **Sorgular:** `bakiye` (sunucu sayfalı), `depolar`, `negatifStok`, `kartDepolari`, `sonHareketler`, `birimler`, `konumlar`, `hareketler`; yazma: `pasifeAl`, `aktifEt`, `kartSil`, hareket oluştur, `tersKayit`.
- **Komutlar:** Yeni (stok kartı sayfası), Aç, Sil (hareketsiz), Excel, Devre dışı bırak / Etkinleştir, Hareketler / ekle. Süzgeç: arama, depo, pasifler, minimum altı; detay paneli aç/kapa. **Pencere:** hareket penceresi (yeni hareket formu, lot/seri satırları, geçmiş tablosu, ters kayıt).
- **Öneri: Liste.**
  - Göstergeler (beşten dörde): stok değeri, kullanılabilir, minimum altı, maliyetsiz. "Kullanılabilir stoklu kart" kalkar (kullanılabilir ile aynı bilgi).
  - Süzgeç: arama, depo, pasifler, minimum altı. Negatif stok koruması tek satır koşullu bilgi notu olur (açık/kapalı iki ayrı uyarı yerine).
  - Tablo + sağ kart grubu: bakiye, kullanılabilir, rezerve, minimum, stok değeri, maliyetsiz miktar, kategori, birim.
  - Komutlar: Yeni, Aç, Sil, Excel; seçili karta göre Devre dışı bırak / Etkinleştir; **Hareket gir** (pencere) ve **Hareketler** (`inventory-stock-movements`'a kartla gider).
  - **Hareket penceresi (yalnız giriş):** yön (giriş/çıkış), tarih, birim, miktar, açıklama, konum, birim maliyet (girişte); takipli kartta lot/seri alanları. Geçmiş tablosu ve ters kayıt pencereden çıkar, movements ekranına gider.
- **Kalır:** dört gösterge, süzgeçler, kart grubu, hareket girme, pasife alma. **Sadeleşir:** depo dağılımı ve son hareketler tabloları kart grubundan kalkar (depo süzgeci ve movements ekranı var); pencere tek iş yapar (giriş), geçmiş ayrı ekranda; detay paneli aç/kapa düğmesi kalkar (kart grubu hep sağda, dar ekranda altta).
- **Eksik:** lot/seri çoklu satır girişi için pencerede düzenlenebilir satır tablosu yok (aşağıda madde 2).
- **Belge modeli:** gerekmez.

## 5. inventory-stock-create

- **Amaç:** stok kartı oluşturma/düzenleme: kimlik, stok yönetimi, fiyat, vergi, lojistik, muhasebe, görsel, birimler, özel alanlar, varyantlar, reçeteler.
- **Sorgular:** `kart`, `kategoriler`, `negatifStok`, `birimler`, `ozelTanimlar/Degerler`, `varyantlar`, `receteler`; yazma: `olustur`, `guncelle`, `birimEkle(Yeni)`, `birimSil`, `ozelKaydet`.
- **Komutlar:** Kaydet (ardışık: kart, birimler, özel alanlar), Yeni stok kartı, kayıttan sonra listeye dön. **Pencere:** yok.
- **Öneri: Kayıt kartı.** Özet: kod, ad, kategori, durum rozeti, ana birim, mevcut miktar (kayıtlı kartta). Sekmeler:
  - **Genel:** kimlik (kod, ad, barkod, kategori, takip türü, ana birim), stok yönetimi (min, maks, yeniden sipariş, emniyet, tedarik/üretim süresi), negatif stok notu (koşullu `alert`).
  - **Fiyat ve vergi:** liste fiyatları, iskontolar, para birimi, KDV/ÖTV/ÖİV/tevkifat/damga.
  - **Lojistik ve muhasebe:** ağırlık/ölçü, hesap kodları, görsel bağlantısı, pazaryeri kimliği.
  - **Birimler:** birim tablosu (`dataTable`), satır eylemi Sil, **Birim ekle penceresi** (birim, ana birim katsayısı). Yalnız TenantAdmin.
  - **Varyantlar ve reçeteler:** kayıtlı kartın varyant tablosu ve reçete tablosu (yeni kartta ipucu).
  - **Özel alanlar:** eksik (madde 1).
- **Kalır:** tüm alan grupları, birim dönüşümü, kayıttan sonra listeye dönüş. **Sadeleşir:** sekmeler 8'den 6'ya iner (Görsel Lojistik'e katılır; görsel önizleme kalkar, Kayıt kartında `image` türü yok; Varyantlar ve Reçeteler birleşir); varyant matrisi (yeni kartta boyut üretme) bu aşamada kalkar, varyantlar kayıttan sonra tabloda izlenir; yeni/düzenle için iki başlık tek özet olur; birimler satır içi düzenlenmez, pencereyle eklenir.
- **Eksik:** özel alan bloğu; varyant üretme (madde 1 ve 3).
- **Belge modeli:** gerekmez.

## 6. inventory-transfers

- **Amaç:** depolar arası stok aktarmak; geçmişi izlemek; hatalı transferi iptal etmek (ters hareket).
- **Sorgular:** `transferler`, `kalemDetayi`, `depolar`, `kaynakKonumlar`, `hedefKonumlar`, `stoklar`, `birimler`; yazma: `transferOlustur` (tekrar deneme kimliğiyle), `transferIptal`.
- **Komutlar:** Yeni transfer, Transferi iptal et (yalnız "Posted" durumu), Kalemler, arama + durum süzgeci. **Pencere:** Kalemler; Yeni transfer (3 alan + düzenlenebilir kalem ızgarası, 100 kalem sınırı).
- **Öneri: Liste + yeni Belge `stok.transfer`.**
  - Liste: göstergeler (bu ay transfer, iptal), süzgeç (arama, durum, tarih), tablo (kod, tarih, kaynak, hedef, kalem sayısı, durum); komutlar Yeni transfer / Aç (belgeyi açar), satır eylemi İptal et (yalnız Kaydedildi). Kalemler penceresi kalkar: kalemler belgenin satırlarında.
  - Belge `stok.transfer`: durumlar Kaydedildi, İptal edildi (transfer tek işlemde kaydedilir, taslak yok). Alanlar: transfer no (otomatik), tarih, kaynak depo, hedef depo, açıklama. Satırlar: stok, birim, miktar, kaynak konum, hedef konum (aynı stok bir kez; en çok 100). Özet: kalem sayısı, toplam miktar. Geçişler: **Transferi kaydet** (tekrar deneme kimliğini model üretir), **İptal et** (bağlı ters hareketler). Kaydedilmiş belge salt okunur.
- **Kalır:** hepsi (tek işlemde düş/ekle, kilit altında bakiye doğrulama, iptal). **Sadeleşir:** Kalemler penceresi, tekrar deneme kimliği alanı ve elle kalem sayacı notu kalkar; liste + belge ikilisi "Yeni transfer" penceresinin yerine geçer.
- **Belge modeli:** evet, `stok.transfer`.

## Kalıplarda eksik

Yalnız yukarıdaki ekranların gerçekten istediği; hiçbiri eski ayarı korumak için değil.

1. **Özel alan bloğu Kayıt kartında ve pencerede.** `inventory-stock-create` (kart özel alanları) ve depo penceresi (depo özel alanları). Satış-cari taslağındaki madde 1 ile aynı iş.
2. **Pencerede düzenlenebilir satır tablosu.** Yalnız `inventory-stock` hareket penceresinde çoklu lot/seri satırı için. Küçük çözüm: ilk aşamada tek lot/seri alanı, çoklu satır sonra.
3. **Varyant üretme.** Boyut matrisiyle kart ve varyantları birlikte üretme. Kayıt kartında matris bileşeni yok; kart kaydedilince "Varyant üret" penceresiyle ayrı sorgu olarak eklenebilir. Zorunlu değil, ertelenebilir.
4. **Yeni belge modeli:** `stok.transfer` (tek işlemde kaydedilen, iptali olan belge; taslak durumu yok).
5. **Liste süzgecinde stok arama seçicisi ve sayfa parametresiyle dolu gelme (doğrulanacak):** `inventory-stock-movements` için. Mevcut süzgeç türü `select` ise büyük stok listesine yetmez.
6. **Liste'de zorunlu süzgeç ipucu (küçük, doğrulanacak):** `inventory-locations` ve `inventory-stock-movements`'ta depo/stok seçilmeden tablo yerine ipucu; koşullu görünürlükle olabiliyorsa özellik gerekmez.

## Uygulama sırası (küçükten büyüğe)

1. `inventory-stock-movements` (Liste; madde 5-6 doğrulaması, Ters kayıt eylemi).
2. `inventory-warehouses` (Liste + Depo penceresi; özel alan sonra).
3. `inventory-locations` (Liste + üç pencere).
4. `inventory-stock` Liste (göstergeler, kart grubu) + giriş penceresi (tek lot/seri alanı).
5. `inventory-stock-create` (Kayıt kartı; özel alan ve varyant üretme ertelenerek).
6. `stok.transfer` Belge modeli + `inventory-transfers` Liste + Belge (en büyük iş: model, geçişler, iptal).
