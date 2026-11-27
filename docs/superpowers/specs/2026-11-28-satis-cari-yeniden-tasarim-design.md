# Satış ve cari: sistem standartlarını kalıplarla yeniden tasarlama (taslak)

Durum: tasarım taslağı, kod yok. Çizim: `docs/design-proposals/studio-sadelestirme/13-satis-cari.html`.

## Çerçeve

- Canlıdaki formlar deneme verisidir (karar 2026-11-27). Kalan sistem standartları doğrudan kalıplara çizilir; davranış eski ekranla birebir olmak zorunda değildir, ama iş akışı (oluştur, onayla, sevk et, faturala, iptal et, yazdır) yapılabilir kalır.
- Kalıba yalnız yeniden tasarlanan ekranın gerçekten istediği özellik eklenir; eski ayarı yansıtmak için özellik eklenmez.
- Bu modülde zaten kalıplı: `sales-orders` (Liste), `sales-invoices` (Liste), `sales-order-document` (Belge, `satis.siparis`).
- Kalıp yetenekleri (`PageTemplateRules.cs`): Liste = gösterge, süzgeç, tablo, eylemler/satır eylemleri, tek kart grubu, komut çubuğu, pencere. Kayıt kartı = özet, bölümler (formCard), alanlar, tam bir sekme bileşeni, satırlar, not, eylemler, pencere. Belge = yalnız belge modeli (`satis.siparis`); alanlar, satırlar, özet modelden gelir. Serbest = bloklar.
- Kayıt kartı kalıbının izinli türleri `recordHeader, section, card, formCard, input, text, alert, metric, button, dataTable, tabs`; `customFieldsBlock` yok.

## Özet

| Standart | Kalıp | Yeni belge modeli |
|---|---|---|
| customers | Liste (+ kart grubu) | yok |
| customer-create | Kayıt kartı | yok |
| customer-ledger | Liste | yok |
| crm-opportunities | Liste (+ kart grubu) | yok |
| crm-opportunity-create | Kayıt kartı | yok |
| sales-quotes | Liste + Belge | `satis.teklif` (yeni) |
| sales-order-create | mevcut `sales-order-document` Belge'si ile değişir | yok (özel alan boşluğu) |
| sales-deliveries | Liste (pencereli) | `satis.irsaliye` (sonraki aşama) |
| sales-invoice-create | Belge | `satis.fatura` (yeni) |

## 1. customers

- **Amaç:** müşteri/tedarikçi/bayi kartlarını bulmak, seçilen cariden satış işlemi başlatmak.
- **Sorgular:** `cari.listele`, `cari.sayaclar`, `cari.getir`, `cari.bakiye`, `cari.pasifeAl`, `cari.aktifEt`, `cari.sil`.
- **Komutlar ve akış:** Yeni/Aç (cari kartı sayfası), Sil (yalnız kaydı olmayan), Excel; Yeni teklif/sipariş/irsaliye/fatura, Satış faturaları, Adresler, Pasife al, Etkinleştir, Cari Hesap Hareketleri. **Pencere:** yok.
- **Öneri: Liste.** Göstergeler (kart, pasif, e-Fatura, risk), süzgeç (arama, tür, durum), tablo, sağda tek kart grubu (rozetler, bakiye, vergi no, vade, risk, telefon, varsayılan adres). Eylemler: dört satış işlemi (müşteri/bayi dışında pasif, nedeni yazılı), Hesap hareketleri, Pasife al / Etkinleştir (duruma göre biri).
- **Kalır:** hepsi, yukarıdaki yerleşimle. **Sadeleşir:** "Adresler" düğmesi kalkar (adres kartın Adresler sekmesinde); "Satış faturaları" düğmesi kalkar (fatura listesinde cari süzgeci var); harita konumu ve döviz notu tek satır olur.
- **Belge modeli:** gerekmez.

## 2. customer-create

- **Amaç:** cari kartı oluşturma/düzenleme: kimlik, iletişim, birincil adres, finans, muhasebe/banka, vergi/e-Fatura, özel alanlar, adresler.
- **Sorgular:** `cari.getir`, `cari.gruplar`, `cari.iller`, `cari.ilceler`, `cari.anaFirmaSecenekleri`, `cari.ozelAlanTanimlari/Degerleri`, `cari.adresleri`; yazma: `cari.olustur`, `cari.guncelle`, `cari.ozelAlanKaydet`, `cari.adres.ekle/pasifeAl/aktifEt`.
- **Komutlar:** Kaydet (ardışık: kart, özel alan), Kaydet ve yeni, Yeni, kayıttan sonra listeye dön. **Pencere:** Yeni adres.
- **Öneri: Kayıt kartı.** Özet (ünvan, kod, durum rozeti, bakiye, vade). Sekmeler: Genel (kimlik, vergi ve e-Fatura + eksik e-Fatura bilgisi uyarısı), İletişim ve adres, Finans ve vergi (döviz, vade, risk, fiyat listesi, muhasebe hesapları, banka/IBAN), Adresler (tablo, satır eylemleri Pasife al/Etkinleştir, Yeni adres penceresi), Özel alanlar.
- **Kalır:** tüm alan grupları, il/ilçe zinciri, Kaydet ve yeni. **Sadeleşir:** harita enlem/boylam alanları kalkar; iki ayrı başlık (yeni/düzenle) tek özet olur.
- **Eksik:** Kayıt kartında özel alan bloğu yok (aşağıda).
- **Belge modeli:** gerekmez.

## 3. customer-ledger

- **Amaç:** cari ekstresi (borç, alacak, bakiye) tarih aralığında.
- **Sorgular:** `cari.listele` (seçici), `cari.ekstre`. **Komutlar:** Excel; satır başına "Belgeye git" (satış faturası, tahsilat, satış iadesi, alış faturası, alış iadesi, taslak). **Pencere:** yok.
- **Öneri: Liste.** Süzgeç: cari (cari kartından `customerId` ile dolu gelir), başlangıç, bitiş. Göstergeler: borç toplamı, alacak toplamı, dönem sonu bakiye. Tablo + satır eylemi "Belgeye git" (belge türüne göre görünür). Altta B/A/ters kayıt notu. Cari seçilmemişse tek satır ipucu.
- **Sadeleşir:** Bu ay / Son 3 ay / Yıl başından düğmeleri kalkar. Dövizli hareket uyarısı kalır.
- **Belge modeli:** gerekmez.

## 4. crm-opportunities

- **Amaç:** fırsatları aşama, tutar ve takip tarihine göre izlemek; aşama ilerletmek.
- **Sorgular:** `crm.firsat.listele`, `ozet`, `sil`, `nitelikliYap`, `teklifeGecir`, `muzakereyeGecir`, `kazanildi`, `kaybedildi`.
- **Komutlar:** Yeni, Aç, Sil, Excel; beş aşama düğmesi. **Pencere:** yok.
- **Öneri: Liste.** Göstergeler (açık, kazanıldı, açık değer, takibi geçmiş), süzgeç (arama, aşama), tablo, sağda kart grubu (müşteri, aşama rozet satırı, kapanış, takip, not, kayıp notu).
- **Sadeleşir:** beş düğme yerine duruma göre görünen tek "sıradaki aşama" eylemi + Kaybedildi. Çok dövizli değer göstergesi tek göstergeye iner.
- **Sonra:** `satis.teklif` Belge modeli gelince "Teklif oluştur" eylemi; o zamana dek eklenmez.
- **Belge modeli:** gerekmez.

## 5. crm-opportunity-create

- **Amaç:** fırsat kartı oluştur/düzenle.
- **Sorgular:** `crm.firsat.getir`, `cari.listele` (müşteri seçici), `crm.firsat.olustur`, `guncelle`. **Komutlar:** Kaydet, Kaydet ve yeni, kayıttan sonra listeye dön. **Pencere:** yok.
- **Öneri: Kayıt kartı.** Özet: ad, kod, müşteri, aşama rozeti, tutar, olasılık. Sekmeler: Fırsat (ad, kod, müşteri), Tahmin ve takip (tutar, para birimi, kapanış, takip, olasılık), Not. Kapanmış fırsatta alanlar kilitli + uyarı.
- **Sadeleşir:** altı aşama rozeti tek rozet; yeni/düzenle için ikili Para birimi ve Olasılık alanları tek alan; müşteri seçicinin cari tür/durum alanları sabit süzgeç.
- **Belge modeli:** gerekmez.

## 6. sales-quotes

- **Amaç:** teklifleri izlemek, kabul/ret/sipariş akışını yürütmek, revizyonları görmek.
- **Sorgular:** `satis.teklif.listele`, `getir`, `satirlari`, `revizyonlari`, `ilet`, `kabulEt`, `reddet`, `siparisOlustur`, `sil`. Düzenleme ayrı eski sayfada (`sales-quote-create`).
- **Komutlar:** Yeni teklif, Aç, Sil (TenantAdmin, taslak), Düzenle, İletildi yap, Kabul et, Reddet, Sipariş oluştur, Siparişi aç, Revizyonlar, Yazdır/PDF. **Pencere:** teklif penceresi (rozetler, sekmeler: satırlar, notlar, revizyonlar).
- **Öneri: Liste + yeni Belge.**
  - Liste: iki gösterge (tutar, yanıt bekleyen), süzgeç (durum, tarih), tablo, satır eylemleri (Kabul, Reddet, Siparişe çevir); Aç/Yeni belgeyi açar. Detay kartı ve pencere kalkar.
  - Belge `satis.teklif`: durumlar Taslak, İletildi, Kabul, Reddedildi (+ siparişe bağlı). Geçişler: İlet, Kabul et, Reddet. Alanlar: teklif no, müşteri, teklif tarihi, geçerlilik, plasiyer. Satırlar sipariş modeliyle aynı. Özet: toplamlar, KDV dökümü, işlem günlüğü.
  - Revizyon: "Yeni revizyon" geçişi; revizyon tablosu işlem günlüğüne/geçmişe iner. Yazdır/PDF belge komutu; Sipariş oluştur ayrı eylem (aşağıda "eksik").
- **Belge modeli:** evet, `satis.teklif`.

## 7. sales-order-create

- **Amaç:** sipariş oluştur/düzenle (belge bilgileri, plasiyer, satırlar, KDV dökümü, toplamlar, özel alanlar).
- **Sorgular:** `satis.siparis.getir`, `kalemleri`, `hesapla`, `hesaplaVergileri`, `olustur`, `guncelle`, `cari.listele`, `stok.kart.*`, `ik.personel.listele`, özel alan sorguları.
- **Öneri: mevcut `sales-order-document` Belge sayfasıyla değişir.** Yeni sipariş ve düzenleme aynı Belge sayfası; `sales-orders` Liste'sinin Yeni/Aç düğmeleri oraya gider; `sales-order-create` kaldırılır. Alanlar, satırlar (stok seçince dolum, kullanılabilir miktar, sevk), hesap, KDV dökümü, Onayla/Onayı geri al/İptal modelden gelir.
- **Kaybolan:** yalnız sipariş özel alanları (`customFieldsBlock`) Belge'de yok; özel alan kullanılıyorsa önce o boşluk kapanmalı.
- **Belge modeli:** yeni gerekmez.

## 8. sales-deliveries

- **Amaç:** sevk edilen siparişleri/irsaliyeleri izlemek, faturalaştırmak, iptal etmek.
- **Sorgular:** `satis.irsaliye.listele`, `getir`, `kalemleri`, `satis.fatura.ozelAlanTanimlari`, `iptal`, `sil`, `faturalastir`.
- **Komutlar:** Yeni irsaliye (eski sayfa `sales-delivery-create`), Aç, Sil (iptal edilmiş, bağımsız değil, TenantAdmin), Faturalaştır, Faturayı aç, İptal et, Eski ekranda aç. **Pencere:** irsaliye penceresi (rozet, kalemler, fatura bölümü).
- **Öneri: Liste, detayı pencere.** Göstergeler (faturalanmamış, iptal), süzgeç (arama, durum, fatura), tablo, satır eylemleri Faturalaştır / Faturayı aç / İptal et. Pencere: özet + rozetler, sekmeler Kalemler ve Faturalaştır, altta Faturalaştır ve İptal.
- **Sadeleşir:** "Eski ekranda aç" kalkar.
- **Belge modeli:** liste için yok. Yeni irsaliye ekranı için `satis.irsaliye` (sipariş seçince açık satırlar dolar, bağımsız irsaliye de aynı belge) sonraki aşamada; o zamana dek Yeni düğmesi eski sayfaya gider.

## 9. sales-invoice-create

- **Amaç:** siparişsiz satış faturası kesmek (belge bilgisi, e-belge alanları, satırlar, vergi önizleme, tevkifat, toplam).
- **Sorgular:** `cari.listele`, `stok.kart.listele`, `depo.listele`, `satinalma.faturaGirisi.mevzuatProfilleri`, `satis.fatura.ozelAlanTanimlari`, `satis.fatura.onizle`, `onizleVergileri`, `satis.fatura.olustur`.
- **Komutlar:** Faturayı kes, Yeni, kayıttan sonra fatura listesine dön. **Pencere:** yok (~35 alan sayfada).
- **Öneri: yeni Belge `satis.fatura`.** Alanlar: fatura tarihi, müşteri, fatura türü, vergi profili, e-belge senaryosu, tür kodu, alıcı etiketi, not. Satırlar: stok, depo, miktar, birim, fiyat, iskonto, KDV. Özet: ara toplam, KDV ve vergiler, tevkifat, genel toplam, vergi dökümü. Durumlar: Taslak, Kesildi, e-Belge gönderildi; geçiş "Faturayı kes" (`satis.fatura.olustur`; tekrar deneme kimliği modelden gizli gelir).
- **Sadeleşir:** e-Arşiv ödeme aracısı, aracı firma ve taşıyıcı alanları (~20 alan) "e-Arşiv ayrıntıları" penceresinde toplanır.
- **Belge modeli:** evet, `satis.fatura`.

## Kalıplarda eksik

Yalnız yukarıdaki ekranların gerçekten istediği; hiçbiri eski ayarı korumak için değil.

1. **Özel alan bloğu Kayıt kartında ve Belge'de.** `customer-create` (cari özel alanları), sipariş, teklif, fatura belgeleri.
2. **Belgeden belge üretme eylemi.** Tekliften sipariş, siparişten irsaliye, irsaliyeden fatura: durum geçişi değil, yeni belge yaratıp açan eylem. Belge geçiş modeli bunu taşımıyor.
3. **Belge modellerinde ek pencere ve yazdırma.** `satis.fatura` için "e-Arşiv ayrıntıları" penceresi; `satis.teklif` için Yazdır/PDF komutu ve yeni revizyon geçişi.
4. **Yeni belge modelleri:** `satis.teklif`, `satis.fatura`, sonra `satis.irsaliye` (sipariş seçince satır dolduran "doldur" işlemi dahil).
5. **Liste'de zorunlu süzgeç ipucu (küçük, doğrulanacak):** `customer-ledger` cari seçilmeden tablo yerine ipucu ister; mevcut koşullu görünürlükle yapılabiliyorsa kalıp özelliği gerekmez.

## Uygulama sırası (küçükten büyüğe)

1. `customers` (Liste, mevcut yetenekler yeter).
2. `crm-opportunities` (Liste).
3. `customer-ledger` (Liste; madde 5 doğrulaması).
4. `crm-opportunity-create` (Kayıt kartı).
5. `sales-deliveries` Liste + pencere (belge modeli olmadan).
6. `sales-order-create` → `sales-order-document` geçişi (özel alan kararı verilince).
7. `customer-create` (Kayıt kartı; özel alan bloğu eklenince ya da o sekme ertelenerek).
8. `satis.teklif` Belge modeli + `sales-quotes` (belgeden belge eylemi; sonra CRM "Teklif oluştur").
9. `satis.fatura` Belge modeli + `sales-invoice-create` (tevkifat, e-belge penceresi).
10. `satis.irsaliye` Belge modeli + `sales-delivery-create` değişimi.
