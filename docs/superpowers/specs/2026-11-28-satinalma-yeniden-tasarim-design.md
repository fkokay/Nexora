# Satın alma: sistem standartlarını kalıplarla yeniden tasarlama (taslak)

Durum: tasarım taslağı, kod yok. Çizim: `docs/design-proposals/studio-sadelestirme/18-satinalma.html`.

## Çerçeve

- Canlıdaki formlar deneme verisidir (karar 2026-11-27). Kalan sistem standartları doğrudan kalıplara çizilir; davranış eski ekranla birebir olmak zorunda değildir, ama iş akışı (talep, onay, teklif, sipariş, mal kabul, fatura, ödeme, iade, iptal) yapılabilir kalır.
- Kalıba yalnız yeniden tasarlanan ekranın gerçekten istediği özellik eklenir; eski ayarı yansıtmak için özellik eklenmez.
- Bu modülde kalıplı ekran yok. Bugünkü standartlar kalıpsız `components` ile yazılmış (süzgeç, tablo, detay kartı); çoğu "eski ekranda aç" (`legacyScreen`) düğmesine yaslanıyor. Yeniden tasarımda bu düğmeler kalkar; eski sayfaya yalnız iki iş bırakılır: siparişsiz mal kabul, lot/seri izlemeli kabul.
- Kalıp yetenekleri (`PageTemplateRules.cs`): Liste = gösterge, süzgeç, tablo, eylemler/satır eylemleri, detay (bağlam paneli ya da tek kart grubu), komut çubuğu, pencere. Kayıt kartı = özet, bölümler, alanlar, sekmeler, satırlar, not. Belge = yalnız belge modeli. Serbest = bloklar. Pencere = özet, gruplar, form, sekme, tablo, kendi Kaydet'i.
- Onay kuralları (talep sahibi kendi talebini onaylayamaz; teklif ekleme ve siparişe çevirme yalnız TenantAdmin) sunucu kuralıdır; düğmelerin `disabledWhen` nedenleri aynen taşınır.

## Özet

| Standart | Kalıp | Yeni belge modeli |
|---|---|---|
| sales-purchase-quotes | Liste (+ pencere) | yok |
| sales-purchase-returns | Liste + pencere | yok |
| sales-purchase-receipts | Liste + pencere | yok (siparişsiz kabul sonra) |
| sales-purchase-delivery-notes | Liste + pencere | yok |
| sales-purchase-invoices | Liste + pencere | yok (Yeni → `satinalma.fatura`) |
| sales-purchase-invoice-drafts | Liste (düzenleme Belge'de) | `satinalma.fatura` ile paylaşır |
| sales-requests | Liste + pencereler | yok |
| sales-purchasing | Liste + pencere | yok (Yeni → `satinalma.siparis`) |
| sales-purchase-order-create | Belge | `satinalma.siparis` (yeni) |
| sales-purchase-invoice-entry | Belge | `satinalma.fatura` (yeni) |

Belge modeli kararı: satın almada beş satır-tablolu belge var (talep, sipariş, mal kabul, fatura/taslak, iade). **İki model yeter:** `satinalma.siparis` ve `satinalma.fatura`. Talep, mal kabul, irsaliye ve iade bugün "kaynaktan satır seç, miktar gir" biçiminde pencerede çalışıyor (miktar kaynaktan sınırlı, fiyat yok ya da kaynaktan gelir); bunlar için ayrı belge sayfası gerekmez, Liste penceresi kalır.

## 1. sales-requests

- **Amaç:** ihtiyaç talebi kaydetmek, onaylatmak, onaylı talebe tedarikçi teklifi eklemek, siparişe çevirmek.
- **Sorgular:** `satinalma.talep.listele` (liste + dört sayaç), `kalemleri`, `teklifleri`, `ozelAlanDegerleri`, `onayla`, `reddet`, `olustur`, `teklifKaydet`, `siparisOlustur` (talepten ve tekliften); `stok.kart.listele/birimleri`, `cari.listele`, `depo.listele`.
- **Komutlar:** Yeni talep, Aç, Onayla, Reddet (not istemli; ret gerekçesi zorunlu), Teklif ekle (onaylı + TenantAdmin), Siparişe dönüştür (onaylı, siparişsiz + TenantAdmin), Tekliften sipariş, Siparişi aç, Alanlar (eski sayfa). **Pencereler:** yeni talep, teklif, talepten sipariş, tekliften sipariş.
- **Öneri: Liste.** Göstergeler (onay bekliyor, onaylandı, siparişe döndü, reddedildi), süzgeç (arama + durum çipleri), tablo, sağda bağlam paneli (talep eden, durum, gereken tarih, satır ve teklif sayısı, sipariş). Satır eylemleri durumdan görünür: Onayla / Reddet (Gönderildi), Teklif ekle / Siparişe dönüştür (Onaylı), Siparişi aç (Sipariş). Aç → pencere (sekmeler Satırlar, Teklifler, Özel alanlar).
- **Kalır:** hepsi; Yeni talep ve Teklif ekle pencereleri aynen. **Sadeleşir:** "Talepten sipariş" ve "Tekliften sipariş" tek "Siparişe dönüştür" penceresi olur (kaynak: talep satırları ya da seçili teklif); "Alanlar" düğmesi kalkar; satır tablosu ve tutarlar detay panelinden Aç penceresine iner.
- **Belge modeli:** yok. Belgeden belge eylemi gelince Siparişe dönüştür, `satinalma.siparis` Belge'sini önceden dolu açar (aşağıda "eksik"); o zamana dek pencere.

## 2. sales-purchase-quotes

- **Amaç:** talebe gelen tedarikçi tekliflerini, geçerlilik tarihini ve seçili teklifi izlemek.
- **Sorgular:** `satinalma.teklif.listele`, `getir`, `kalemleri`. **Komutlar:** Talepsiz teklif (eski sayfa), Aç (talebi aç), Siparişi aç. **Pencere:** yok.
- **Öneri: Liste.** Süzgeç (arama + durum çipleri: Gönderildi, Seçildi, Seçilmedi), tablo (teklif, talep, tedarikçi, tarih, geçerlilik, durum, toplam), sağda bağlam paneli (özet, tutarlar, not). Satır eylemleri: Talebi aç, Siparişi aç (sipariş oluşmuşsa). Aç → pencere (Satırlar sekmesi).
- **Kalır:** hepsi (izleme ekranı). **Kalkar:** "Talepsiz teklif" (eski sayfa): iş akışı talepten başlar. **Karar bekler:** talepsiz teklif kullanılıyorsa, talepteki Teklif ekle penceresi bu listeden "Yeni teklif" olarak (talep seçicili) da açılır.
- **Belge modeli:** yok.

## 3. sales-purchasing

- **Amaç:** tedarikçi siparişlerini, teslim alınan miktarı ve mal kabul → fatura zincirini izlemek; mal kabul oluşturmak.
- **Sorgular:** `satinalma.siparis.listele` (+ üç sayaç), `getir`, `satirlari`, `malKabulleri`, `ozelAlanDegerleri`, `satinalma.malKabul.olustur`; `depo.listele`, `depo.konumlari`.
- **Komutlar:** Yeni sipariş (ayrı sayfa), Aç (liste ↔ belge görünümü), Mal kabul oluştur (pencere), Faturala, Mal kabulü aç, Eski ekranda aç. **Pencere:** mal kabul.
- **Öneri: Liste + pencere.** Göstergeler (açık, kısmen teslim, gecikmiş), süzgeç (arama, durum çipleri, gecikmiş), tablo (sipariş, tedarikçi, tarih, beklenen teslim, durum, teslim %, toplam), sağda bağlam paneli. Satır eylemleri: Mal kabul oluştur (Açık/Kısmen), Aç. Aç → pencere: özet + rozetler, sekmeler **Satırlar** (sipariş/alınan/kalan), **Mal kabuller** (kabul, durum, fatura; satır eylemleri Faturala, Mal kabulü aç), **Özel alanlar**; altta Mal kabul oluştur. Yeni sipariş → Belge (madde 4).
- **Sadeleşir:** liste ↔ belge iç görünümü ve "Siparişi eski ekranda aç" kalkar. Sipariş oluşturulduktan sonra düzenlenemiyor (`guncelle` sorgusu yok); salt okunur pencere bu yüzden doğru. Düzenleme eklenirse Aç, Belge'yi açar.
- **Sonra:** lot/seri izlemeli mal kabul (pencerede izleme alanı yok); o zamana dek eski sayfa bağlantısı kalır.
- **Belge modeli:** liste için yok.

## 4. sales-purchase-order-create

- **Amaç:** tedarikçiye doğrudan sipariş açmak: başlık, stok satırları, alış fiyatı, tutarlar.
- **Sorgular:** `cari.listele`, `depo.listele`, `stok.kart.listele/birimleri`, `satinalma.siparis.olustur`. **Komutlar:** Kaydet (sonra Siparişi aç), Sipariş listesi.
- **Öneri: yeni Belge `satinalma.siparis`.** Alanlar: tedarikçi (cari seçici, tür/durum sabit süzgeç; seçince kartın dövizi gelir), sipariş no, döviz, sipariş tarihi, beklenen teslim, hedef depo, not. Satırlar: stok (seçince kartın alış fiyatı, iskontosu, KDV'si, birimi gelir), miktar, birim, fiyat, iskonto, KDV. Özet: net, KDV, genel toplam (sunucu iki ondalığa yuvarlayarak hesaplar). Durumlar: Açık → Kısmen alındı → Teslim alındı; İptal.
- **Sadeleşir:** "* zorunlu" ve döviz açıklama notları alan ipucuna iner; iki form kartı belge alanlarında birleşir.
- **Belge modeli:** evet, `satinalma.siparis` (talep/teklif dönüşümünde de aynı model).

## 5. sales-purchase-receipts

- **Amaç:** siparişten depoya giren mal kabulleri incelemek, faturalamak, iptal etmek (stok ters hareketle geri alınır).
- **Sorgular:** `satinalma.malKabul.sayfaliListe`, `getir`, `satirlari`, `iptal`. **Komutlar:** Siparişsiz mal kabul (eski sayfa), Aç, Faturala, İptal et, Alış faturasını aç, Eski ekranda aç. **Pencere:** belge penceresi.
- **Öneri: Liste + pencere.** Göstergeler (fatura bekleyen, iptal), süzgeç (arama, durum, faturalanmamış), tablo (kabul, sipariş, tedarikçi, depo, tarih, durum, fatura), satır eylemleri: Faturala (İşlendi + faturasız → fatura Belge'si), Faturayı aç, İptal et (onaylı). Aç → pencere: özet + zincir (sipariş → kabul → fatura), sekme Satırlar.
- **Sadeleşir:** "Eski ekranda aç" kalkar; fatura bekleyen kabulleri seçmek için bugünkü ayrı fatura girişi listesi bu ekrandaki "Faturalanmamış" süzgecine iner.
- **Sonra:** "Siparişsiz mal kabul" pencere olur; o zamana dek eski sayfa bağlantısı kalır.
- **Belge modeli:** yok.

## 6. sales-purchase-delivery-notes

- **Amaç:** tedarikçi irsaliye numarasını ve sipariş miktarlarını kaydetmek; mal kabule öncesinde ya da sonrasında bağlamak.
- **Sorgular:** `satinalma.irsaliye.listele/getir/satirlari`, `siparisSatirlari`, `siparisIrsaliyeleri`, `satinalma.siparis.listele/malKabulleri`, `olustur`, `malKabulBagla`, `malKabulBaglantisiKaldir`. **Komutlar:** Yeni irsaliye, Aç, Mal kabul bağla, Bağlantıyı kaldır, Siparişi aç, Mal kabulü aç. **Pencereler:** yeni irsaliye, mal kabul bağla (liste ve belge için iki kopya).
- **Öneri: Liste + pencere.** Gösterge (bağlantısız), süzgeç (arama, bağlı/bağlantısız), tablo (irsaliye no, sipariş, tedarikçi, tarih, mal kabul), satır eylemleri: Mal kabul bağla (bağlantısızsa), Bağlantıyı kaldır (bağlıysa; onaylı). Aç → pencere: özet, sekme Satırlar, aynı bağla/kaldır düğmeleri. Yeni irsaliye penceresi aynen (sipariş seç, satır miktarı, not).
- **Sadeleşir:** liste ↔ belge iç görünümü ve çift bağla penceresi tek "Mal kabul bağla" penceresine iner.
- **Belge modeli:** yok.

## 7. sales-purchase-invoice-drafts

- **Amaç:** mal kabulsüz hizmet ve masraf faturalarını gider hesaplı satırlarla taslak girmek, düzenlemek, muhasebeleştirmek.
- **Sorgular:** `satinalma.faturaTaslagi.listele/getir/satirlari`, `giderHesaplari`, `tedarikciler`, `malKabulSatirlari`, `olustur`, `guncelle`, `muhasebelestir`. **Komutlar:** Yeni taslak, Düzenle (yalnız Taslak), Muhasebeleştir (yevmiye fişi + tedarikçi borcu), Eski ekranda aç. **Pencereler:** yeni taslak, düzenle (iki kopya).
- **Öneri: Liste; Yeni/Düzenle `satinalma.fatura` Belge'sini açar.** Göstergeler (taslak, muhasebeleşen), süzgeç (arama, durum), tablo (fatura no, tedarikçi, tarih, vade, durum, toplam), satır eylemleri: Düzenle (Taslak), Muhasebeleştir (Taslak, onaylı).
- **Sadeleşir:** yeni + düzenle pencere kopyaları tek Belge olur; taslak durumu belge durumu (Taslak → Muhasebeleşti). Mal kabulsüz taslak = "Mal kabul" alanı boş belge.
- **Belge modeli:** `satinalma.fatura` (madde 8) ile paylaşır.

## 8. sales-purchase-invoice-entry

- **Amaç:** işlenmiş mal kabulü seçip fatura kesmek; fatura sipariş ve stok kabulüyle bağını korur.
- **Sorgular:** `satinalma.faturaGirisi.malKabulleri`, `onizleme`, `onizlemeSatirlari`, `mevzuatProfilleri`, `satinalma.malKabul.faturala`. **Komutlar:** Fatura gir (kabul seç), Mal kabul değiştir, Faturayı kaydet (sonra fatura listesi), Eski ekranda aç.
- **Öneri: yeni Belge `satinalma.fatura`.** Alanlar: **mal kabul** (seçici; yalnız işlenmiş, faturasız kabuller; boşsa gider faturası), tedarikçi fatura no, fatura tarihi, vergi mevzuatı profili (boşsa firma varsayılanı), e-belge alanları (UUID/ETTN, senaryo, tür kodu, gönderen etiketi). Satırlar: mal kabulden dolar (stok, miktar, birim, fiyat; fiyatsız satırda fiyat girilebilir, 0 olabilir); mal kabulsüzde satırda gider hesabı. Özet: sunucu önizlemesi (satır tutarları, profil vergileri, tevkifat, vade, genel toplam). Geçişler: Faturayı kaydet (mal kabullü, doğrudan işler), Taslak kaydet, Muhasebeleştir.
- **Sadeleşir:** ayrı adım 1 listesi kalkar (mal kabul alanı seçici; liste Mal kabuller'deki "Faturalanmamış" süzgecidir); e-belge alanları "e-Belge ayrıntıları" penceresinde toplanır; önizleme hatası üstte uyarı kalır.
- **Belge modeli:** evet, `satinalma.fatura` (taslak düzenleme dahil).

## 9. sales-purchase-invoices

- **Amaç:** tedarikçi faturalarını, vadeleri, kalan borcu izlemek; ödeme eklemek/iptal etmek; fatura iptali; iade başlatmak.
- **Sorgular:** `satinalma.fatura.listele/getir/satirlari/odemeleri/iadeleri/odemeHesaplari/iptal/odemeEkle/odemeIptal/iadeEdilebilirSatirlar`, `satinalma.iade.olustur`, `depo.listele/konumlari`. **Komutlar:** Yeni (fatura girişi), Aç, Ödeme ekle, İade oluştur, İptal et (ters kayıt), Mal kabulsüz fatura, tedarikçi çipi, Eski ekranda aç. **Pencereler:** belge (sekmeli), ödeme, iade.
- **Öneri: Liste + pencere.** Göstergeler (vadesi geçen, kısmi ödenen, iptal), süzgeç (arama, durum, tedarikçi), tablo (fatura, tedarikçi, tarih, vade, durum, toplam, kalan), satır eylemleri: Ödeme ekle (İşlendi + kalan > 0), İptal et (ters kayıt, onaylı). Aç → pencere: özet + tutarlar + akış, sekmeler Satırlar, Ödemeler (satır eylemi Ödemeyi iptal et), İadeler; altta Ödeme ekle, İade oluştur. Yeni → `satinalma.fatura` Belge'si.
- **Sadeleşir:** tedarikçi çipi süzgeçteki tedarikçi alanına iner; "Mal kabulsüz fatura" düğmesi kalkar (aynı belge, mal kabul boş); İade oluştur, İade ekranının Yeni iade penceresini fatura seçili açar (eksik #5); "Eski ekranda aç" kalkar.
- **Belge modeli:** liste için yok; Yeni → `satinalma.fatura`.

## 10. sales-purchase-returns

- **Amaç:** tedarikçiye geri gönderilen ürünler; stoktan düşer, tedarikçi borcunu azaltır; iptalde ters kayıt.
- **Sorgular:** `satinalma.iade.listele/getir/satirlari/iptal/olustur`, `satinalma.fatura.listele/iadeEdilebilirSatirlar`, `depo.listele/konumlari`. **Komutlar:** Yeni iade, Aç, İadeyi iptal et, Faturayı aç, Eski ekranda aç. **Pencereler:** belge, yeni iade.
- **Öneri: Liste + pencere.** Gösterge (iptal), süzgeç (arama, durum), tablo (iade, fatura, tedarikçi, depo, tarih, durum, toplam), satır eylemleri: Faturayı aç, İptal et (onaylı). Aç → pencere: özet, tutarlar, akış, sekme Satırlar, işlendi/iptal notu. Yeni iade penceresi: fatura seç → iade edilebilir satırlar, depo/konum, miktar, not.
- **Sadeleşir:** "Eski ekranda aç" ve ayrı oluşturma notu kalkar (not pencere ipucuna iner).
- **Belge modeli:** yok.

## Kalıplarda eksik

Yalnız yukarıdaki ekranların gerçekten istediği; çoğu satış taslağındaki maddelerle aynı.

1. **Belgeden belge eylemi** (satış #2 ile ortak): talep/teklif → sipariş, sipariş → mal kabul, mal kabul → fatura; yeni belgeyi önceden dolu açar, "kaynaktan doldur" dahil.
2. **Belge modellerinde ek pencere/komut** (satış #3 ile ortak): `satinalma.siparis` için Mal kabul oluştur penceresi, `satinalma.fatura` için "e-Belge ayrıntıları" penceresi.
3. **Özel alan bloğu** (satış #1 ile ortak): talep ve sipariş özel alanları; Liste penceresinde ve Belge'de.
4. **Yeni belge modelleri:** `satinalma.siparis`, `satinalma.fatura`.
5. **Doğrulanacak (küçük):** Liste penceresinin sayfa parametresiyle (örn. `faturaId`) açılması, faturadan "İade oluştur" için. Yoksa İade ekranına yalnız bağlantı gider, fatura pencerede seçilir.

## Uygulama sırası (küçükten büyüğe)

1. `sales-purchase-quotes` (Liste, salt izleme).
2. `sales-purchase-returns` (Liste + pencere).
3. `sales-purchase-receipts` (Liste + pencere; Faturala başta mevcut fatura giriş sayfasına gider).
4. `sales-purchase-delivery-notes` (Liste + pencere).
5. `sales-purchase-invoices` (Liste + pencere; ödeme/iade/iptal).
6. `sales-requests` (Liste + üç pencere; onay akışı).
7. `sales-purchasing` (Liste + pencere; Mal kabul oluştur).
8. `satinalma.siparis` Belge + `sales-purchase-order-create`.
9. `satinalma.fatura` Belge + `sales-purchase-invoice-entry`, `sales-purchase-invoice-drafts` düzenleme (en büyüğü: önizleme, mevzuat profili, tevkifat).
10. Siparişsiz mal kabul ve lot/seri izlemeli kabul pencereleri; eski sayfa bağlantıları o zaman kalkar.
