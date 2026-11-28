# Finans, genel muhasebe ve duran varlık: sistem standartlarını kalıplarla yeniden tasarlama (taslak)

Durum: tasarım taslağı, kod yok. Çizim: `docs/design-proposals/studio-sadelestirme/15-finans-muhasebe-varlik.html`.

## Çerçeve

- Canlıdaki formlar deneme verisidir (karar 2026-11-27). Kalan sistem standartları doğrudan kalıplara çizilir; davranış eski ekranla birebir olmak zorunda değildir, ama iş akışı (oluştur, kaydet, ters çevir, amortisman yaz, elden çıkar, iptal et) yapılabilir kalır.
- Kalıba yalnız yeniden tasarlanan ekranın gerçekten istediği özellik eklenir; eski ayarı yansıtmak için özellik eklenmez.
- Bu modüllerde şimdiye dek kalıplı ekran yok. Kalıp yetenekleri (`PageTemplateRules.cs`): Liste = gösterge, süzgeç, tablo, eylemler/satır eylemleri, tek kart grubu (detay paneli ya da kart), komut çubuğu, pencere. Kayıt kartı = özet (recordHeader), bölümler (formCard), alanlar, sekmeler, satırlar, not, eylemler, pencere. Belge = yalnız belge modeli. Pencere: en çok bir özet, bir sekme bileşeni, grup ve form; **pencereden pencere açılmaz**.
- Ortak karar: bugün sayfa içine gömülü işlem formları (hareket ekle, amortisman, elden çıkarma, hesap formu) **pencereye** taşınır; ekstre, muavin, fiş gibi ikinci adım ekranları da **görünüm penceresi** olur. Böylece "adımlar", gizli seçim kutuları ve "geri dön" düğmeleri kalkar.

## Özet

| Standart | Kalıp | Yeni belge modeli |
|---|---|---|
| finance-accounts (Kasalar) | Liste + kart grubu + pencereler | yok |
| finance-banks (Bankalar) | Kasalar ile aynı Liste | yok |
| finance-account-create | Kayıt kartı | yok |
| finance-trial-balance | Liste + Muavin penceresi | yok |
| finance-journal-ledger | Liste + Fiş penceresi | yok (isteğe bağlı sonra: salt okunur `muhasebe.fis`) |
| finance-journal-vouchers | Belge | `muhasebe.fis` (yeni) |
| finance-ledger-chart | Liste + kart grubu + pencereler | yok |
| fixed-assets | Liste + kart grubu + pencereler | yok |
| fixed-asset-card | Kayıt kartı (salt okunur) + pencereler | yok |
| fixed-asset-create | Kayıt kartı (3 sekme) | yok |

## 1. finance-accounts (Kasalar)

- **Amaç:** kasa hesaplarını, bakiyelerini ve ekstrelerini yönetmek; manuel hareket, transfer / döviz, ters kayıtla iptal.
- **Sorgular:** `finans.hesap.listele`, `ozet`, `ekstre`, `pasifeAl`, `aktifEt`, `sil`; `finans.hareket.ekle`, `iptal`, `nakitAkisi`; `finans.transfer.olustur`, `iptal`.
- **Komutlar ve akış:** Yeni, Düzenle, Aç, Ekstre / hareketler, Pasife al / Etkinleştir, Sil, Manuel hareket, Transfer / döviz, Hesap değiştir; ekstrede Hareketi iptal et, Transferi iptal et, Nakit akışı sınıfı (TenantAdmin). **Pencere:** Manuel hareket, Transfer / döviz, Nakit akışı sınıfı. Bugün iki adımlı tek sayfa (hesap seç, ekstre).
- **Öneri: Liste.** Göstergeler (toplam bakiye; çok dövizde "birden çok para birimi", aktif hesap), süzgeç (arama, durum), tablo, sağda tek kart grubu (rozetler, güncel bakiye, hareket, döviz; düğmeler Ekstre, Manuel hareket, Transfer / döviz, Pasife al ya da Etkinleştir). **Ekstre** görünüm penceresidir (özet, hareket tablosu, satır düğmeleri Hareketi iptal et / Transferi iptal et / Nakit akışı sınıfı, açıklama notu). Manuel hareket, Transfer / döviz ve Nakit akışı sınıfı kendi Kaydet'li pencerelerdir.
- **Kalır:** bütün işlemler, yetki kuralları, tekrar deneme kimliği, uyarı notları. **Sadeleşir:** adımlar bileşeni, gizli hesap seçimi ve "Hesap değiştir" kalkar; Aç ile Düzenle birleşir; ekstredeki "bu sayfa" giriş/çıkış toplamları kalkar (yanıltıcı).
- **Belge modeli:** gerekmez.

## 2. finance-banks (Bankalar)

Kasalar ile aynı yapıdır (aynı sorgular ve pencereler). Farklar: tür sabiti `Bank`, ek gösterge "Eksi bakiyeli hesap". İki standart aynı kalıptan üretilir; ayrı tasarım gerekmez. **Belge modeli:** yok.

## 3. finance-account-create

- **Amaç:** kasa/banka kartı oluşturma ve düzenleme: kod, ad, tür, döviz, yalnız yeni kartta açılış bakiyesi.
- **Sorgular:** `finans.hesap.getir`, `olustur`, `guncelle`. **Komutlar:** Kaydet, Yeni, Kartı aç, Kasalar ›, Bankalar ›. **Pencere:** yok.
- **Öneri: Kayıt kartı.** Özet (kod · ad, durum rozeti, bakiye, hareket sayısı), tek bölüm "Hesap bilgileri" (kod, ad, tür, döviz, açılış bakiyesi yalnız yeni kayıtta), açıklama notu. Komut çubuğu: Kaydet, Kaydet ve yeni, Yeni.
- **Sadeleşir:** iki başlık (yeni/düzenle) tek özet; Kasalar ›, Bankalar ›, Kartı aç kalkar (kayıttan sonra listeye dönülür).
- **Belge modeli:** gerekmez.

## 4. finance-trial-balance (Mizan)

- **Amaç:** dönem, standart (TDHP/IFRS), hesap düzeyi ve kapsamla mizan; genel toplam ve denge; TDHP alt hesapta muavin.
- **Sorgular:** `finans.mizan`, `finans.muhasebe.muavin`. **Komutlar:** Excel, Bu yıl, Bu ay, satır başına Muavin. **Pencere:** Muavin.
- **Öneri: Liste.** Göstergeler (dönem borç, dönem alacak, Dengede / Dengede değil + hareketli hesap sayısı), süzgeç (başlangıç, bitiş, standart, hesap düzeyi, yalnız hareketli, sınıf), tablo (açılış, dönem, bakiye; genel toplam satırı), satır eylemi Muavin (yalnız TDHP alt hesap). Muavin penceresi: özet (açılış, dönem, kapanış) ve hareket tablosu. IFRS eşleme uyarısı Liste'nin üstünde, açıklama notu altında.
- **Sadeleşir:** "Parametreler" kartı süzgece iner; Bu yıl / Bu ay düğmeleri ve "Tarih aralığı geçersiz" uyarısı kalkar.
- **Dikkat:** tarih ve sunucuya giden seçimli süzgeç Liste'de var mı doğrulanmalı (aşağıda).
- **Belge modeli:** gerekmez.

## 5. finance-journal-ledger (Yevmiye Defterleri)

- **Amaç:** yevmiye fişlerini tarih ve standartla süzmek, fiş ve zincirini görmek, izin verilen fişlerde ters kayıt.
- **Sorgular:** `finans.fis.listele`, `getir`, `satirlari`, `tersKayit` (iki sorgu: normal ve kaynaklı fiş). **Komutlar:** Yeni (yevmiye fişi sayfası), Aç, Ters kayıt oluştur (gerekçe sorulur, TenantAdmin), Excel. **Pencere:** Fiş.
- **Öneri: Liste.** Gösterge "Fiş sayısı", süzgeç (başlangıç, bitiş, standart, kaynak), tablo, satır eylemleri Aç ve Ters kayıt oluştur. Fiş görünüm penceresi: özet, rozetler (Ters çevrildi, Ters kayıt, Kaynaklı), satır tablosu, zincir ve kaynak notları; altında Ters kayıt oluştur.
- **Sadeleşir:** "Ters kayıt" göstergesi kalkar (yalnız görünen sayfayı sayıyor); "Süzgeç" kartı süzgece iner.
- **Belge modeli:** gerekmez. İsteğe bağlı sonra: "Aç", fişi `muhasebe.fis` ile salt okunur açar ve pencere kalkar.

## 6. finance-journal-vouchers (Yevmiye Fişi)

- **Amaç:** elle yevmiye fişi girişi: belge bilgileri, hesap seçicili satırlar, borç/alacak toplamı, denge göstergesi.
- **Sorgular:** `finans.muhasebe.hesap.listele` (aktif hesap seçici), `finans.fis.olustur`. **Komutlar:** Kaydet (yalnız TenantAdmin), Son fişler. Satır: en az 2, en çok 100. **Pencere:** yok. Bugün düzenlenebilir satır tablosu (`editableGrid`).
- **Öneri: yeni Belge `muhasebe.fis`.** Alanlar: fiş tarihi, muhasebe standardı, açıklama. Satırlar: hesap (aktif hesap seçici), satır açıklaması, borç, alacak. Özet: toplam borç, toplam alacak, fark, Dengeli / Dengede değil rozeti. Tek geçiş **Kaydet** (`finans.fis.olustur`; tekrar deneme kimliği modelden gizli gelir); dengesizse Kaydet kapalı; TenantAdmin değilse belge salt okunur ve nedeni yazılı. Kayıttan sonra Yevmiye Defterleri açılır; Yeni boş fiş açar.
- **Kalır:** hepsi (aktif hesap filtresi, boş satır açıklamasının fiş açıklamasıyla dolması, kapalı dönem notu). **Sadeleşir:** "Yeni yevmiye fişi" başlığı belge başlığı olur.
- **Belge modeli:** evet, `muhasebe.fis` (taslaksız, kayıt sonrası değişmez).

## 7. finance-ledger-chart (Hesap Planı)

- **Amaç:** Tek Düzen Hesap Planı'na göre muhasebe hesapları: liste, sınıf süzgeci, hesap kartı, pasife alma, muavin.
- **Sorgular:** `finans.muhasebe.hesap.listele`, `getir`, `olustur`, `guncelle`, `pasifeAl`, `aktifEt`, `sil`, `tekDuzen.onizle`, `tekDuzen.uygula`, `muavin`. **Komutlar:** Yeni, Kaydet (oluştur ya da güncelle dizisi), Pasife al / Etkinleştir, Sil, Hareketleri gör, Tek Düzen Hesap Planı (onaylı), Listeyi yenile; hepsi TenantAdmin. **Pencere:** Muavin.
- **Öneri: Liste + kart grubu.** Süzgeç (arama, sınıf, durum, hareket), tablo, sağda salt okunur kart grubu (rozetler Aktif/Pasif/Hareketli, detay paneli: tablo sınıfı, tip, çalışma şekli, döviz, IFRS kodu; düğmeler Düzenle, Hareketleri gör, Pasife al / Etkinleştir, Sil). Komut çubuğu: Yeni hesap, Tek Düzen Hesap Planı, Yenile, Excel. Pencereler: **Yeni hesap** (oluştur), **Hesabı düzenle** (güncelle; hareketli hesapta kod ve ad kilitli), **Muavin**. Pencere bölümleri: Hesap (kod, ad, tablo sınıfı, tip, çalışma şekli, döviz), IFRS (kod, ad, sınıf).
- **Sadeleşir:** yan karttaki üç gömülü form ve karışık "yeni/düzenle" Kaydet dizisi kalkar; yönetici olmayan için ayrı salt okunur panel kalkar (kart zaten salt okunur, düzenleme düğmeleri yöneticiye görünür); Listeyi yenile kalkar.
- **Belge modeli:** gerekmez.

## 8. fixed-assets (Duran Varlıklar)

- **Amaç:** edinim, amortisman, zimmet ve elden çıkarmaları kıymet kaydından yönetmek.
- **Sorgular:** `duranVarlik.kiymet.listele`, `ozet`, `getir`, `amortisman.plani`, `amortisman.kaydet`, `eldenCikarma.kaydet`. **Komutlar:** Yeni (edinim sayfası), Aç, Amortismanı kaydet, Elden çıkar, Zimmetle (eski ekranda), Sil (bugün hep kapalı), Eski ekranda aç. **Pencere:** Amortismanı kaydet, Elden çıkarma.
- **Öneri: Liste + kart grubu.** Dört gösterge (edinim maliyeti, birikmiş, net defter, bu ay amortisman), süzgeç (arama, durum), tablo, sağda kart grubu (rozet, maliyet, aylık amortisman, net defter, zimmet, bağlı fatura; düğmeler Kıymet kartını aç, Amortismanı kaydet, Elden çıkar, Zimmetle). Son iki işlem yalnız etkin kıymette ve pencere olarak açılır.
- **Sadeleşir:** "Detay paneli" girdisi ve süzgeç kartı kalkar; Sil kalkar (kıymet silinmez, elden çıkarılır); Eski ekranda aç ve ipucu metni kalkar.
- **Zimmetle:** iş akışı kalır; personel seçici İK ile gelene dek bugünkü zimmet ekranına gider.
- **Belge modeli:** gerekmez.

## 9. fixed-asset-card (Kıymet kartı)

- **Amaç:** kıymet kartı (salt okunur): genel bilgiler, amortisman, edinim muhasebesi, zimmet, elden çıkarma.
- **Sorgular:** `kiymet.getir`, `amortisman.plani`, `vergiAmortismani.plani` / `kaydet`, `edinim.muhasebe` / `yevmiyele`, `zimmet.listele`, `zimmet.iadeAl`, `amortisman.kaydet`, `eldenCikarma.kaydet`, `finans.muhasebe.hesap.listele`. **Komutlar:** Amortismanı kaydet, Elden çıkar, Zimmetle, Kapat, Eski ekranda aç. **Pencere:** Amortismanı kaydet, Elden çıkarma.
- **Öneri: Kayıt kartı (salt okunur).** Özet (kod · kategori, maliyet, birikmiş, net defter, zimmet, bağlı fatura, Etkin / Elden çıkarıldı rozeti). Sekmeler: **Genel** (kimlik, maliyet ve amortisman, VUK alt sınır, VUK profili; elden çıkarılmışsa elden çıkarma bölümü), **Amortisman** (göstergeler, tablo, not), **VUK vergi amortismanı** (yalnız tahmin uyarısı, göstergeler, tablo, Vergi kaydı oluştur), **Edinim muhasebesi** (fiş ve satırlar ya da fatura notu), **Zimmet geçmişi** (tablo, satır eylemi İade al). Komut çubuğu: Amortismanı kaydet, Elden çıkar, Edinimi yevmiyeleştir (karşı hesap pencerede), Zimmetle.
- **Sadeleşir:** "Defter görünümü" seçicisi iki sekmeye ayrılır; Elden çıkarma sekmesi Genel'e iner; Kapat, Eski ekranda aç, salt okunur notu kalkar; edinim formu sekmeden pencereye çıkar. Amortisman ve elden çıkarma pencereleri `fixed-assets` ile aynıdır.
- **Belge modeli:** gerekmez.

## 10. fixed-asset-create (Yeni edinim)

- **Amaç:** edinim kaydı: kıymet bilgileri, tarihler ve ömür, maliyet, bağlı alış faturası, isteğe bağlı VUK profili.
- **Sorgular:** `duranVarlik.alisFaturalari`, `vukOmurKatalogu`, `kiymet.olustur`. **Komutlar:** Kaydet. **Pencere:** yok (~20 alan tek sayfada).
- **Öneri: Kayıt kartı, 3 sekme.** Özet (yeni edinim; maliyet, ömür, aylık amortisman). Sekmeler: **Kıymet** (kimlik, tarihler ve faydalı ömür, alt sınır notu), **Maliyet ve muhasebe** (maliyet, kalıntı, referans, bağlı alış faturası + çift kayıt notu), **VUK vergi profili** (isteğe bağlı onay kutusu; açılınca 7 alan, doğrulama onayı, onaysız uyarı, GİB tablosu bağlantısı). Komut çubuğu: Kaydet, Yeni; kayıttan sonra kıymet kartı.
- **Sadeleşir:** durum başlığı ve "Edinim kaydı oluştur" başlığı özet ve sekme adlarına iner.
- **Belge modeli:** gerekmez.

## Kalıplarda eksik

Yalnız yukarıdaki ekranların gerçekten istediği; hiçbiri eski ayarı korumak için değil. "Doğrula" olanlar önce koddan bakılmalı, yoksa eklenir.

1. **Belge `muhasebe.fis` (yeni model).** Taslaksız, kayıt sonrası değişmeyen belge; satırda aktif-hesap seçici; özette toplam borç, alacak, fark ve "Dengeli" rozeti; denge sağlanmadıkça Kaydet kapalı; TenantAdmin dışında salt okunur ve nedeni yazılı.
2. **Liste süzgecinde tarih ve sunucu parametreli seçim (doğrula).** Mizan ve Yevmiye Defterleri başlangıç/bitiş tarihi, standart, hesap düzeyi, yalnız hareketli ister; Liste süzgeci bugün satır ya da sorgu bağlı seçim (`select`) biliyor, tarih tipi doğrulanmalı.
3. **Pencere tablosunda satır eylemi ve gerekçeli sorgu eylemi (doğrula).** Ekstre penceresindeki iptal düğmeleri, Fiş penceresindeki Ters kayıt (gerekçe sorulur), Zimmet sekmesindeki İade al.
4. **Kayıt kartında salt okunur bölüm ve koşullu bölüm/sekme (doğrula).** Kıymet kartı: Genel sekmesi salt okunur alanlardan, VUK sekmesi ve elden çıkarma bölümü profil/duruma göre görünür olmalı. Yoksa sekmede ipucu metni kullanılır.
5. **Zimmetle penceresi yok.** Personel seçici İK modülüyle gelene dek düğme bugünkü ekrana gider; kalıp özelliği gerekmez.

## Uygulama sırası (küçükten büyüğe)

1. `finance-account-create` (Kayıt kartı, tek bölüm).
2. `finance-accounts` + `finance-banks` (Liste + pencereler; aynı yapı, ikisi birlikte).
3. `finance-journal-ledger` (Liste + Fiş penceresi; madde 2 ve 3 doğrulaması).
4. `finance-trial-balance` (Liste + Muavin; madde 2).
5. `finance-ledger-chart` (Liste + üç pencere).
6. `fixed-assets` (Liste + iki pencere).
7. `fixed-asset-create` (Kayıt kartı, 3 sekme).
8. `fixed-asset-card` (Kayıt kartı; madde 4 doğrulaması).
9. `muhasebe.fis` Belge modeli + `finance-journal-vouchers` (en büyük; yeni model).
