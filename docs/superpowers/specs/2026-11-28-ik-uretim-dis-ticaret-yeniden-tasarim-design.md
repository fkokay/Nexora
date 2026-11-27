# İnsan Kaynakları, Üretim ve Dış Ticaret: sistem standartlarını kalıplarla yeniden tasarlama (taslak)

Durum: tasarım taslağı, kod yok. Çizim: `docs/design-proposals/studio-sadelestirme/16-ik-uretim-dis-ticaret.html`. Çerçeve `2026-11-28-satis-cari-yeniden-tasarim-design.md` ve `2026-11-28-stok-depo-yeniden-tasarim-design.md` ile aynıdır.

## Çerçeve

- Canlıdaki formlar deneme verisidir (karar 2026-11-27). Kalan standartlar doğrudan kalıplara çizilir; davranış eski ekranla birebir olmak zorunda değil, iş akışı (oluştur, onayla, reddet, çizelgele, serbest bırak, üretimi bildir, aşama ilerlet, iptal et) yapılabilir kalır.
- Kalıba yalnız yeniden tasarlanan ekranın gerçekten istediği özellik eklenir.
- Bu üç modülde kalıplı ekran yok; on bir ekranın hepsi aşağıdadır. `src/Hosts/AIERP.Api/SystemPages/Standards/<anahtar>.json` bugün kalıpsız bileşen listesidir.
- Kalıp yetenekleri (`PageTemplateRules.cs`): Liste = gösterge, süzgeç, tablo, eylem/satır eylemi, tek kart grubu, komut çubuğu, pencere. Kayıt kartı = özet, bölümler (formCard), alanlar, tek sekme bileşeni, satırlar, not, eylemler, pencere. Belge = yalnız bilinen belge modeli. Pencere türleri: `recordHeader, section, card, formCard, input, text, alert, metric, button, dataTable, tabs`; `editableGrid` pencerede yok.
- Kurallar değişmez: kendi kaydını onaylama engeli, kapalı dönem, sıralı operasyon, tamamlanan üretimin geri alınamaması, FEFO bileşen düşümü ve denetim kaydı sunucuda kalır.
- Ortak sadeleşme: "Eski ekranda aç" düğmesi, "Detay paneli" kutusu ve süzgeç çipleri (`filterChips`) kalkar; kart grubu hep sağda, dar ekranda altta durur.

## Özet

| Standart | Kalıp | Yeni belge modeli |
|---|---|---|
| hr-employees | Liste (+ kart grubu) | yok |
| hr-employee-create | Kayıt kartı | yok |
| hr-attendance | Liste (+ kart grubu, iki pencere) | yok |
| hr-leave-requests | Liste (+ kart grubu, iki pencere) | yok |
| hr-period-summary | Liste (rapor) | yok |
| manufacturing-orders | Liste (+ kart grubu, dört pencere) | yok |
| manufacturing-order-create | Kayıt kartı | yok |
| manufacturing-recipes | Liste + Belge | `uretim.recete` (yeni) |
| manufacturing-cost-variance | Liste (rapor + kart grubu) | yok |
| foreign-trade | Liste (+ kart grubu, dört pencere) | yok |
| foreign-trade-case | Kayıt kartı | yok |

## İnsan Kaynakları

### 1. hr-employees

- **Amaç:** personeli kod, ad, departman ve duruma göre bulmak; kartı açmak.
- **Sorgu:** `ik.personel.listele` (sunucu sayfalı). **Komutlar:** Yeni personel (yalnız TenantAdmin), Aç, Excel; izin ve puantaj bağlantıları. **Pencere:** yok.
- **Öneri: Liste.** Süzgeç: arama, durum, departman. Tablo: kod, ad soyad, departman, görev, kategori, durum. Sağda tek kart grubu: kimlik özeti ve iki bağlantı düğmesi (İzin talepleri, Puantaj).
- **Kalır:** süzgeçler, tablo, Yeni/Aç/Excel, bağlantılar. **Sadeleşir:** ortak sadeleşme (eski ekran, detay paneli kutusu, çipler).
- **Belge modeli:** gerekmez.

### 2. hr-employee-create

- **Amaç:** personel kaydı açmak/düzenlemek; yalnız iş bilgisi (T.C. kimlik no, IBAN, adres, telefon, sağlık bilgisi girilmez).
- **Sorgu:** `ik.personel.getir`; yazma `olustur`, `guncelle`. **Komutlar:** Kaydet, Yeni, kayıttan sonra listeye dön. **Pencere:** yok.
- **Öneri: Kayıt kartı.** Özet: ad soyad (yeni kayıtta "Yeni personel"), kod · departman, durum rozeti (Aktif / Ayrıldı). Sekmeler:
  - **Kimlik ve görev:** bölümler Kimlik (kod, ad soyad) ve Görev (departman, görev, kategori).
  - **Çalışma:** işe giriş (zorunlu), işten çıkış (kayıtlı kartta), iş e-postası, bağlı kullanıcı (yalnız yeni kayıtta girilir, sonra salt okunur).
  - KVKK notu ve zorunlu alan notu.
- **Kalır:** tüm alanlar, KVKK notu. **Sadeleşir:** işe giriş için iki ayrı alan (yeni/kayıtlı) tek alana iner; "bağlı kullanıcı yok" notu kalkar.
- **Belge modeli:** gerekmez.

### 3. hr-attendance

- **Amaç:** günlük çalışma ve fazla mesaiyi (dakika) kaydetmek, düzeltmek, onaylamak.
- **Sorgular:** `ik.puantaj.listele`, `ik.personel.listele` (iki seçici), `puantaj.getir`; yazma `kaydet`, `duzelt`, `onayla` (rowversion). **Pencereler:** Puantaj kaydı, Puantajı düzelt.
- **Öneri: Liste.** Süzgeç: tarih aralığı, personel, onay durumu. Tablo: personel, iş günü, çalışılan dk, fazla mesai dk, onay durumu. Kart grubu: seçili kaydın özeti. Komutlar: Puantaj kaydı (**pencere**: personel, iş günü, çalışılan, fazla mesai, not; kural notu), Düzelt (**pencere**; "Kayıt yeniden onaya düşer" uyarısı), Onayla (yalnız "Onay bekliyor" satırda; kendi kaydında kapalı), Excel.
- **Kalır:** hepsi (1440 dk sınırı, günde tek kayıt, düzeltmede yeniden onay). **Sadeleşir:** "pencere kayıttan sonra açık kalır" davranışı kalkar (Kaydet kapatır); personel seçici sayfa boyutu girdisi kalkar.
- **Belge modeli:** gerekmez.

### 4. hr-leave-requests

- **Amaç:** izin talebi açmak; bekleyenleri onaylamak ya da reddetmek; iptal etmek.
- **Sorgular:** `ik.izin.listele`, `ik.personel.listele`; yazma `talepEt`, `onayla`, `reddet`, `iptal` (rowversion). **Pencere:** İzin talebi.
- **Öneri: Liste**, açılışta "Bekliyor" süzgeciyle. Süzgeç: durum, tür, personel, tarih aralığı. Tablo: personel, departman, tür, başlangıç, bitiş, gün, durum. Kart grubu: talep özeti, not, Onayla / Reddet… / İptal et. Komut: İzin talebi.
  - **İzin talebi penceresi:** personel, tür, tarih aralığı, gün, not; çakışma kuralı notu.
  - **Red penceresi** (yeni): gerekçe sorar; bugünkü iki aynı işi yapan sorgu (`reddet`, `reddetPanel`) tek olur.
- **Kalır:** hepsi (`canReview`, `canCancel`). **Sadeleşir:** çift Onayla/Reddet düğmeleri tekil; personel seçici durum/sayfa boyutu girdileri kalkar.
- **Belge modeli:** gerekmez.

### 5. hr-period-summary

- **Amaç:** tarih aralığı için personel, puantaj ve izin özeti; yalnız firma yöneticisi, her çalıştırma denetime yazılır, en çok 366 gün.
- **Sorgu:** `ik.donemOzeti` (elle çalıştırılır). **Komutlar:** Excel. **Pencere:** yok.
- **Öneri: Liste (rapor).** Süzgeç: başlangıç (ayın 1'i), bitiş (bugün), **Çalıştır**. Göstergeler (yedi → altı): dönem sonu personel, puantajı olan personel, çalışılan dk, fazla mesai dk, izin talebi, talep edilen gün. Tablo: izin durumu kırılımı. Çalıştırılmadıysa tek ipucu.
- **Kalır:** dönem, göstergeler, tablo, denetim ve 366 gün notu. **Sadeleşir:** "Puantaj kaydı" sayısı göstergesi kalkar.
- **Eksik:** elle çalışan süzgeç (madde 1).
- **Belge modeli:** gerekmez.

## Üretim

### 6. manufacturing-orders

- **Amaç:** emirleri izlemek; kapasiteye çizelgelemek, serbest bırakmak, rota operasyonlarını yürütmek, üretimi bildirmek, iptal etmek.
- **Sorgular:** `uretim.emir.listele`, `emir.getir`, `emir.operasyonlari`, `emir.bilesenleri`, `uretim.operatorler`; yazma `cizelgele`, `serbestBirak`, `operasyonBaslat`, `operasyonTamamla`, `tamamla`, `iptal`. **Pencereler:** Operasyonu tamamla, Üretimi bildir.
- **Öneri: Liste.** Göstergeler (dört): açık emir, planlanan maliyet, çizelgelenmemiş, tamamlanan. Süzgeç: durum. Tablo (on → yedi sütun): kod, plan tarihi, mamul, reçete, depo, miktar, durum; kaynak, bileşen kodları ve rota özeti kart grubuna iner. Kart grubu: emir özeti, kaynak, planlanan maliyet.
  - Komutlar (duruma göre görünür): Yeni emir, **Kapasiteye çizelgele**, **Serbest bırak**, **Üretimi bildir**, **İptal et** (başlamış operasyon varsa uyarı metni), **Rota**, **Bileşenler**, Excel.
  - **Rota penceresi** (tablo): sıra, iş merkezi, durum, kurulum/çalışma dk (plan, fiili), başlangıç, operatör; satır eylemleri **Başlat** ve **Tamamla** (serbest bırakılmış emirde, sırayla).
  - **Operasyonu tamamla penceresi:** kurulum dk, çalışma dk, enerji kWh, baz para/kWh, operatör.
  - **Bileşenler penceresi** (tablo): bileşen, gereken miktar, standart maliyet, planlanan maliyet.
  - **Üretimi bildir penceresi:** iyi miktar, fire, fire nedeni, canlı toplam notu (iyi + fire = planlanan), stok hareketi uyarısı (FEFO, bugün, muhasebe fişi yok, geri alınamaz); takipli mamulde lot/seri.
- **Kalır:** hepsi. **Sadeleşir:** Rota ve Bileşenler sayfa altına yığılmaz, pencerede açılır; iki "İptal et" düğmesi tek (uyarı koşullu); "Aç" kalkar (satır seçmek kart grubunu doldurur).
- **Eksik:** pencere tablosunda satır eylemi (madde 2); pencerede lot/seri satırı (madde 3).
- **Belge modeli:** gerekmez.

### 7. manufacturing-order-create

- **Amaç:** aktif reçeteden stoka ya da satış siparişine emir planlamak; emir "Planlandı" açılır.
- **Sorgular:** `depo.listele`, `uretim.recete.tumunuListele`, `recete.bilesenleri`, `recete.getir`, `satis.siparis.listele`, `satis.siparis.kalemleri`; yazma `uretim.emir.olustur`. **Komutlar:** Planla, Vazgeç. **Pencere:** yok.
- **Öneri: Kayıt kartı.** Özet: "Yeni üretim emri", durum "Planlandı". Sekmeler:
  - **Emir:** bölüm Emir (kod elle, plan tarihi, depo, reçete, miktar, üretim türü) ve koşullu bölüm Satış siparişi (tür "Satış siparişi" iken: sipariş, sipariş satırı).
  - **Reçete içeriği:** bileşen tablosu (bileşen, birim miktar, fire %, standart maliyet) ve reçete özeti; kesin rakamlar kayıttan sonra emirde.
- **Kalır:** tüm alanlar, sipariş bağlantısı, reçete önizlemesi. **Sadeleşir:** özet kartı ile içerik tablosu tek sekme; reçete seçici durumu girdisi kalkar; iki not tek satıra iner.
- **Eksik:** bağımlı seçici ve seçime göre dolan salt okunur tablo (madde 4).
- **Belge modeli:** gerekmez.

### 8. manufacturing-recipes

- **Amaç:** reçeteleri (bileşen ve rota) listelemek, açmak, pasife almak, silmek. Yeni ve Aç bugün eski ekrana (`manufacturing-recipe-create`) gider; o ekranda reçete kodu, ad, mamul, çıktı miktarı, bileşen tablosu (stok, miktar, fire %, standart maliyet) ve en çok 50 operasyonluk rota (iş merkezi, kurulum, birim çalışma dk, bekleme günü, kurulum ailesi, enerji, en çok 19 alternatif iş merkezi) düzenlenir.
- **Sorgular:** `uretim.recete.tumunuListele`; yazma `sil`, `pasifeAl`, `etkinlestir`. **Pencere:** yok.
- **Öneri: Liste + yeni Belge `uretim.recete`.**
  - Liste: süzgeç (arama, durum), tablo (kod, ad, mamul, çıktı, bileşen, operasyon, emir sayısı, durum), kart grubu, komutlar Yeni reçete / Aç (belgeyi açar), Sil (emri yoksa), Pasife al / Etkinleştir (biri), Excel.
  - Belge `uretim.recete`: durumlar Aktif, Pasif; alanlar kod, ad, mamul, çıktı miktarı; satırlar bileşenler; ikinci satır grubu **Rota**. Özet: bileşen sayısı, operasyon sayısı, toplam standart maliyet. Geçişler: Kaydet, Pasife al, Etkinleştir (rowversion modelden).
- **Kalır:** bileşen ve rota düzenleme, fire, enerji, alternatif iş merkezi, pasife alma, silme koşulu. **Sadeleşir:** eski ekran kalkar; "kayıttan sonra aynı sayfada kal" seçeneği kalkar.
- **Eksik:** Belge'de ikinci satır grubu (madde 5). İlk aşamada yalnız Liste yeniden yazılır, Yeni/Aç eski ekranda kalır.
- **Belge modeli:** evet, `uretim.recete`.

### 9. manufacturing-cost-variance

- **Amaç:** plan tarihi aralığındaki emirlerin planlanan/fiili malzeme ve dönüşüm (işçilik, genel gider, enerji) maliyeti ve farkı.
- **Sorgu:** `uretim.maliyetAnalizi` (sayfalı). **Komutlar:** Excel. **Pencere:** yok.
- **Öneri: Liste (rapor).** Süzgeç: başlangıç, bitiş. Göstergeler: planlanan malzeme, planlanan dönüşüm, fiili malzeme. Tablo (on iki → yedi sütun): emir, plan tarihi, durum, miktar, fiili malzeme, dönüşüm farkı, toplam fark. Kart grubu: seçili emrin tam dökümü. Kapsam uyarısı koşullu.
- **Kalır:** aynı sayılar. **Sadeleşir:** geniş tablo kart grubuna dağılır; dar ekranda yatay kaydırma gerekmez.
- **Belge modeli:** gerekmez.

## Dış Ticaret

### 10. foreign-trade

- **Amaç:** siparişlere bağlı ithalat/ihracat dosyalarını aşama aşama izlemek: Taslak → Planlandı → Sevkte → Gümrükte → Ulaştı → Kapandı; iptal.
- **Sorgular:** `disTicaret.dosya.listele`, `dosya.ozet`, `dosya.getir`, `dosya.stokBelgeleri`; yazma `planla`, `sevkEt`, `gumrugeGecir`, `varisKaydet`, `kapat`, `iptalEt`, `stokBelgesiBagla`. **Pencereler:** Sevk, Gümrük, Varış, Stok belgesi.
- **Öneri: Liste.** Göstergeler: toplam, açık, ulaştı (kapatılacak), kapandı (bugünkü tek satırlık özet metin bunlara bölünür). Süzgeç: arama, yön, aşama. Tablo: referans, yön, sipariş, karşı taraf, güzergâh, Incoterms, sevk, varış, aşama. Kart grubu: seçili dosyanın özeti (beyan değeri, tarihler, taşıyıcı, gümrük referansı, bağlı stok belgesi).
  - Komutlar: **İthalat dosyası** / **İhracat dosyası** (`foreign-trade-case`), **Aç** (Taslak, Planlandı), aşamaya göre tek görünen ilerletme eylemi (**Planlandı'ya geçir**, **Sevkte'ye geçir…**, **Gümrükte'ye geçir…**, **Varışı kaydet…**, **Kapat**), **Stok belgesi bağla…**, **İptal et** (Taslak, Planlandı).
  - **Sevk penceresi:** gerçek tarih, taşıyıcı/takip referansı. **Gümrük penceresi:** gümrük referansı. **Varış penceresi:** gerçek tarih (boşsa bugün; gelecek tarih reddedilir). **Stok belgesi penceresi:** yöne göre mal kabul ya da irsaliye tablosu; "yalnız bağlar, stok ikinci kez işlenmez".
- **Kalır:** hepsi, kural koşulları (sevk için planlanan tarih, beyan değeri, Incoterms; ihracatta gümrük için irsaliye; kapatmada gerçek varış, ithalatta mal kabul). **Sadeleşir:** yedi eylem düğmesi aşamaya göre tek ilerletme düğmesi; özet metin göstergelere döner.
- **Eksik:** devre dışı eylemin nedenini göstermek (madde 6).
- **Belge modeli:** gerekmez.

### 11. foreign-trade-case

- **Amaç:** dosya açmak/düzenlemek: bağlı sipariş, güzergâh, değer, planlama, referanslar. Sevkiyat başlayınca temel bilgiler kilitlenir.
- **Sorgular:** `dosya.getir`, `siparis.ithalatSecenekleri`, `siparis.ihracatSecenekleri`; yazma `dosya.olustur`, `dosya.guncelle`. **Komutlar:** Kaydet, Yeni, listeye dön. **Pencere:** yok.
- **Öneri: Kayıt kartı.** Özet: referans, yön, aşama rozeti (yedi durum), bağlı sipariş ve karşı taraf. Sekmeler:
  - **Dosya:** Dosya kimliği (yön, bağlı sipariş [yeni dosyada seçilir], referans) ve Güzergâh ve teslim (çıkış/varış ülkesi, Incoterms 2020, HS kodu, taşıma).
  - **Değer ve planlama:** beyan değeri (boşsa sipariş toplamı), planlanan sevkiyat, planlanan varış.
  - **Referanslar ve not:** taşıyıcı referansı, gümrük referansı, operasyon notu.
  - Koşullu uyarılar: "Düzenlenemez" (Sevkte ve sonrası), "Sipariş bulunamadı".
- **Kalır:** tüm alanlar ve kurallar (yön sonradan değişmez, ülke kodu 2 harf ve farklı). **Sadeleşir:** dört başlık ve yedi rozet tek özet; iki "sipariş yok" uyarısı yöne göre tek koşullu uyarı.
- **Belge modeli:** gerekmez (satır yok; dosya belge değil, sipariş belgesine bağlı kayıt).

## Kalıplarda eksik

Yalnız yukarıdaki ekranların gerçekten istediği; hiçbiri eski ayarı korumak için değil.

1. **Liste'de elle çalışan süzgeç (Çalıştır) ve "çalıştırıldı" koşulu:** `hr-period-summary`. Mevcut koşullu görünürlükle olabiliyorsa özellik gerekmez (doğrulanacak).
2. **Pencere tablosunda satır eylemi:** `manufacturing-orders` Rota penceresi (Başlat / Tamamla).
3. **Pencerede düzenlenebilir lot/seri satırı:** `manufacturing-orders` Üretimi bildir; `inventory-stock` ile aynı eksik. Küçük çözüm: tek lot/SKT alanı.
4. **Kayıt kartında bağımlı seçici ve seçime göre dolan salt okunur tablo:** `manufacturing-order-create`.
5. **Yeni belge modeli `uretim.recete` ve Belge'de ikinci satır grubu (Rota).** İlk aşamada ertelenebilir.
6. **Devre dışı Liste eyleminin nedenini yazma (doğrulanacak):** `hr-attendance` onay, `foreign-trade` aşama koşulları.

## Uygulama sırası (küçükten büyüğe)

1. `hr-period-summary` (madde 1 doğrulaması).
2. `manufacturing-cost-variance`.
3. `hr-employees`.
4. `hr-employee-create`.
5. `hr-attendance` (iki pencere).
6. `hr-leave-requests` (iki pencere).
7. `manufacturing-order-create` (madde 4).
8. `foreign-trade-case`.
9. `foreign-trade` (göstergeler + dört pencere).
10. `manufacturing-orders` (dört pencere; madde 2 ve 3).
11. `manufacturing-recipes` Liste, sonra `uretim.recete` Belge modeli (en büyük iş).
