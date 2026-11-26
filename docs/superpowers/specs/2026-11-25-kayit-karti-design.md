# Kayıt kartı ve otomatik yerleşim (alt proje 4) — tasarım

Tarih: 2026-11-25 · Durum: kullanıcı onayı bekliyor · Üst belge: `2026-11-25-nexora-studio-sadelestirme-design.md` (§6.1, §6.4, §6.5, §6.8, §7, §10)

Taslak: `docs/design-proposals/studio-sadelestirme/08-kayit-karti.html` (kullanıcı 2026-11-25'te onayladı). Taslak 02'nin bu projedeki kararlarla güncellenmiş halidir.

## 1. Amaç ve neden

- Danışman, tek bir kaydı (cari, stok, personel…) gösteren ve düzenleyen ekranı kod ve teknik ayar olmadan kurabilmeli.
- Ekranın yapısı yalnız **Sekme → Bölüm → Alan** olmalı. Bölümler 1, 2 ya da 3 kolon olur.
- Bugün bu iş için form kartı, girdi, sekme kimlik listeleri ve kaydetme sırası gibi teknik ayarlar elle bağlanıyor. Örneğin `customer-create` sistem standardında `saveSequence`, `sequenceWhen` ve `recordKey` var.
- Yeni **Kayıt kartı** kalıbında bu bağların hepsini tasarımcı kurar. Kabuğu ERP her seferinde kalıptan çizer. Böylece bütün kayıt kartları aynı görünür (§5.4).
- Liste kalıbındaki "Kartı aç" bu kartları açar. Liste (alt proje 3) ile Kayıt kartı birlikte, danışmanın en sık kurduğu iki ekranı kapsar.

## 2. Hedefler, hedef olmayanlar, anti-hedefler

**Hedefler**
- Kökte `template: { name: "record" }` taşıyan sayfalar ERP'de Kayıt kartı kalıbıyla çizilir: 1. basamak (kalıp) ve 2. basamak (kalıp + üst/alt ek alan).
- Studio'da danışman:
  - kaynağı seçer; kart, kaynağın alanlarından kendiliğinden kurulur;
  - alanları sürükler, bölüm ve sekme ekler, kolon sayısını seçer;
  - alanı, bölümü ve sayfayı sekmesiz panelden ayarlar.
- Yazılımcı kataloğundaki kolonlar isteğe bağlı üç bilgi taşıyabilir: uzun metin, zorunlu, en çok uzunluk.
- Otomatik yerleşim (§6.5) Kayıt kartında çalışır:
  - bölüm kolonları kutunun genişliğine göre azalır;
  - işlem çubuğu taşınca düğmeler "⋯" menüsüne girer;
  - uzun değer kısaltılır, üzerine gelince tamamı görünür;
  - yüklemede iskelet görünür.

**Hedef olmayanlar** (kullanıcının kararı, 2026-11-25)
- **Eski Studio tuvalinin silinmesi.** Kopya çizim kodu (`CanvasPreviews.tsx`, `useCanvasSamples`, `canvasSamples`, `preview-samples.ts`, `CustomPagesPage.tsx` içindeki çizim dalları) **toplu geçişe (5b) kalır.** Gerekçe: kalıpsız sayfaların kart içi tasarım modu, sekmeye bileşen koyma, boyut tutamaçları ve ERP'ye ulaşılamadığında gösterilen yedek tuval bugün yalnız bu kodda var. `preview-samples.ts` ayrıca Hazır ekran görünümleri aracında kullanılıyor.
- **Önceki / Sonraki düğmeleri** sonraya kalır. İskelet her seferinde kalıptan çizildiği için düğmeler sonra eklendiğinde bütün kartlara kendiliğinden gelir.
- **Serbest gövde (3. basamak)** 5. alt projeye kalır, yeni bileşen panelleriyle birlikte gelir. Bu projede kurulan Sekme → Bölüm çizimi orada yeniden kullanılır.
- Belge kalıbı, Rapor ve öteki kalıplar.
- Canlı sayfaların kalıba taşınması (5b).

**Anti-hedefler**
- `template` taşımayan sayfanın ya da sistem standardının ERP çıktısının değişmesi. Bunlara `customer-create` gibi elle kurulmuş kartlar da dahil (§9, §10).
- Danışman panelinde teknik bir terimin görünmesi: sorgu adı, `{{…}}`, `saveSequence`, kimlik, 12'lik ızgara.
- Yazılımcının zorunlu dediği alanın danışman tarafından isteğe bağlı yapılabilmesi.
- Sunucunun istemciden gelen kaydedilmemiş SQL'i çalıştırması. Tuval her zaman otomatik kaydedilmiş taslaktan çizer (§10).

## 3. Kısıtlar

- Biçim yalnız **eklemeli** genişler (§5.2-C). Yeni kalıp bugünkü parçalarla saklanır. ERP bunları zaten çiziyor ve çalıştırıyor.
- Tuval, ERP'nin önizleme sayfasıdır (alt proje 1). Bugünkü mesaj protokolünde yalnız `reload`, `ready`, `layout` (bileşen kutuları) ve `error` var. Sürükle-bırak Studio tarafında, kutu konumlarına bakılarak yapılır.
- Katalog biçimi alt proje 2a'nınkidir:
  - Kolon `code`, `label`, `type`, `key` taşır. `type` şunlardan biridir: `text`, `int`, `decimal`, `date`, `bool`, `guid`.
  - Bilinmeyen anahtar bugün reddediliyor. Yeni anahtarlar bu yüzden ayrıştırıcıya, sunucunun katalog görünümüne ve Studio istemcisine birlikte eklenir.
- Sayfa yazma yetkisi alt proje 3'teki Karar 1 ile aynıdır: katalog başvurusu için sayfa yazma izni yeter.
- Dağıtım sırası: önce platform-api ve erp-web, sonra development-studio.

## 4. Yaklaşımlar

| | Yaklaşım | Ödünleşim |
|---|---|---|
| **A ✓ (kullanıcı seçti)** | Bugünkü parçalarla saklamak: `recordHeader`, `tabs`, `formCard`, `input`, `dataTable`, `text`, `button`. Her parça `slot` ile yerini söyler. | ERP bu parçaları zaten çalıştırıyor: doğrulama, "n değişiklik" rozeti, kayıt değişince sıfırlanma, görüntüleme kipi, ekle-ya-da-güncelle sırası. Tuval ilk günden doğru çizer. 5b'de `customer-create` gibi kartların bölüm, alan ve sekmeleri doğrudan eşlenir; ama onların `actionBar` üzerindeki kaydetme sonrası ayarları (`afterSaveAction`, `saveAndNew`, `commandWhen`) eşlenmez, kalıbın kabuk davranışına bırakılır. Bedeli: parçalar düz listede, kimlikle birbirine bağlı. Studio'nun bu bağları kuran saf fonksiyonları dikkatle test edilmeli. |
| B | Yeni iç içe yapı: `sekmeler → bölümler → alanlar` | Okuması ve düzenlemesi kolay. Ama ERP'de yeni bir çizici ve kaydetme yolu gerekir, "format eklemeli genişler" kararına ters düşer, 5b'deki dönüşüm zorlaşır. |
| C | Bölüm için `section` + `children` | Şemada `children` yalnız `section`/`card`'da var. Sekme yine kimlik listesi kalır. Form kartının doğrulama ve değişiklik takibi kaybolur. Elendi. |

## 5. Tasarım

### 5.1 Sayfa tanımı

- **Kök:** `template: { "name": "record" }`. Kabul edilen adlar artık `list` ve `record`. Basamak saklanmaz: `above` ya da `below` yerinde bileşen varsa 2, yoksa 1.
- **Yerler (`slot`) ve parçalar:**

  | `slot` | Parça | Kural |
  |---|---|---|
  | `summary` | `recordHeader` | tam bir tane |
  | `actions` | `button` | Kaydet, Sil ve ek eylemler |
  | `tabs` | `tabs` | tam bir tane; her sekme `Etiket=id1,id2,…` |
  | `section` | `formCard` | bölüm; `title`, `columns` 1/2/3, `inputs` |
  | `field` | `input` | tam olarak bir bölüme ait |
  | `lines` | `dataTable` | satır tablosu; sekmede tek başına bir blok |
  | `note` | `text` | açıklama metni; sekmede tek başına bir blok |
  | `above`, `below` | Liste'deki ek alan kuralları | ek alan |

  - Her `section`, `lines` ve `note` bileşeni tam olarak bir sekmede listelenir. Sekmedeki sıra, ekrandaki sıradır.
  - Liste'deki yasaklar burada da geçerlidir: `width`, `widthWhen`, `actionBar`, `spacer`, `divider`.
- **Kayıt okuma:**
  - Kalıbın tek okuma sorgusu kayıt sorgusudur. `kind: "read"`, `dataSource: <katalog kodu>`.
  - Anahtar parametresi `{{sayfa.parametre.<p>}}`'ye bağlanır. `<p>`, anahtar kolonun adından Liste'deki `pageParamName` kuralıyla türetilir. Böylece Liste'nin "Kartı aç" düğmesinin gönderdiği adla aynı olur.
  - Kaynağın parametresi tam olarak bir tane olmalı ve anahtar kolonla aynı adı taşımalı. Öteki kaynaklar Kayıt kartında seçilemez, gerekçesiyle soluk görünür.
  - ERP işlemine dayanan kaynak ve eylemlerde parametre katalogda yazılmaz. Bunlarda Liste'deki gibi işlemin zorunlu bilgilerine bakılır (`withOperationParameters`). Kartta karşılığı olmayan zorunlu bilgisi olan işlem (ör. gizli sürüm alanı isteyen güncelleme) seçilemez.
- **Alanlar:**
  - Her `input` bir kolona bağlıdır: `defaultValue: "{{kayit.rows[0].<kolon>}}"`.
  - Bölümün `formCard`'ı şunları taşır: `recordKey: "{{kayit.rows[0].<anahtar>}}"` ve `trackChanges: true`.
  - Girdi türü katalogdan gelir:

    | Katalog türü | Girdi |
    |---|---|
    | `text` | metin |
    | `text` + `longText` | çok satırlı metin (master'daki `multiline: true`) |
    | `int`, `decimal` | sayı |
    | `date` | tarih |
    | `bool` | onay kutusu |
    | `guid` | metin, değiştirilemez |

  - Anahtar kolon var olan kayıtta her zaman değiştirilemez. Yeni kayıtta:
    - *ekle* eyleminde anahtarla aynı adlı bir bilgi varsa, anahtarı kullanıcı yazar (ör. Cari kodu) ve alan yazılabilir olur;
    - yoksa anahtarı sistem üretir; alan değiştirilemez ve "(otomatik)" gösterir.
- **Kaydet:**
  - `button` (`actionType: "sequence"`, `slot: "actions"`, ilk düğme, yani ana düğme).
  - `saveSequence: [ekle, guncelle]` ve `sequenceWhen` ile çalışır: kayıt sorgusunda satır yoksa *ekle*, varsa *güncelle*.
  - Eylemlerin her parametresi aynı adlı alanın değerine bağlanır (`{{<alan>.value}}`). Bilgisi kartta olmayan eylem seçilemez: "Bu eylemin <ad> bilgisi kartta yok." Bu, Liste'deki Karar 5 ile aynı kural.
  - Yalnız biri seçilirse (ör. yalnız *güncelle*) sıra tek adımdır. Yeni kayıt kipinde Kaydet, gerekçesiyle devre dışı görünür.
  - **Kaydetten sonra** (kullanıcı onayladı, 2026-11-25). Bugün sıra düğmesi başarıdan sonra yalnız okuma sorgularını yeniden çalıştırıyor (`TenantCustomPage.tsx` sıra sonu). Yeni kayıtta bu, ikinci Kaydet'te aynı kaydın yeniden eklenmesi demek. Bu yüzden Kayıt kartı kabuğu sıra bittikten sonra şunu yapar:
    - var olan kayıtta: okuma sorguları yeniden çalışır (bugünkü gibi);
    - yeni kayıt, anahtarı kullanıcı yazdı: kart, yazılan anahtarla var olan kayıt olarak yeniden açılır (sayfa parametresi güncellenir);
    - yeni kayıt, anahtarı sistem üretti: "Kaydedildi" bildirimi; kart bir listeden açıldıysa o listeye döner, doğrudan açıldıysa form temizlenir ve yeni kayıt kipinde kalır.
  - Bu davranış danışman ayarı değildir; kalıbın kabuğundadır. Şemaya düğme başına yeni bir özellik eklenmez.
- **Sil:** `delete` türünde bir eylemi çalıştıran `button` (`actionType: "query"`). Kabuk onu en sağa koyar. Yeni kayıt kipinde görünmez. Başarılı silmeden sonra kart, açıldığı listeye döner; doğrudan açıldıysa kapanır (kullanıcı onayladı).
- "Açıldığı liste": kartı açan çalışma alanı sekmesidir. ERP, "Kartı aç" ve "+ Yeni" ile açılan karta bunu bildirir; mekanizma kurucuya kalır (§6).
- **Kayıt özeti** (`recordHeader`):
  - başlık (bir kolon);
  - alt satır (en çok 3 kolon, `·` ile);
  - değerler (en çok 3 `fields`).
- **Satır tablosu:**
  - Bu kayda ait satırları gösteren salt okunur bir `dataTable`.
  - Kaynağı, anahtarla aynı adlı tek parametre isteyen katalog kaynaklarından seçilir. Parametre `{{sayfa.parametre.<p>}}`'ye bağlanır.
  - Kolonlar Liste'deki gibi seçilir ve sıralanır. Ayrıca sayfa başına kayıt sayısı ve liste boşken yazılacak metin ayarlanır.
  - Sayfa başına kayıt (`pageSize`) bugün sunucu sayfalaması olmadan yalnız Liste kalıbının `list` tablosunda kabul ediliyor (`TenantCustomPageSchema.cs` `IsListTemplate`). Bu istisna Kayıt kartının `lines` tablosunu da kapsayacak şekilde genişler.
  - Yeni kayıt kipinde yerinde "Kayıt kaydedilince burada görünür." yazar.
- **Yeni kayıt kipi:** sayfa anahtar parametresi olmadan açılırsa yeni kayıt kipine girer:
  - kayıt sorgusu boş anahtarla çalışır ve satır döndürmez. Böylece bugünkü kaydetme güvenliği (`sequenceReadGuard`: kayıt okunmadan ekleme yapılmaz) değişmeden çalışır;
  - özet "Yeni <kart adı>" gösterir;
  - anahtar alanda "(otomatik)" yazar.

### 5.2 Katalog genişlemesi

- Kolonda üç yeni, isteğe bağlı anahtar:
  - `longText` (bool, yalnız `text` türünde)
  - `required` (bool)
  - `maxLength` (1–4000, yalnız `text` türünde)
- Bu anahtarları taşımayan kataloglar bugünkü gibi çalışır.
- Sunucu ayrıştırıcısı (`TenantCatalogSchema`), katalog görünümü (`TenantCatalogEndpoints`) ve Studio'nun `catalogClient`'ı birlikte genişler. Geçersiz değer, öteki katalog hataları gibi sürüm yayınında reddedilir.
- Studio bu bilgileri girdiye kopyalar: `required` → `required: true`, `maxLength` → `maxLength`. Bu, alt proje 3'teki Karar 2 ile aynı kopyalama yaklaşımı.
- Danışman paneli, katalogda `required` olan alanın "Zorunlu" düğmesini ve anahtar alanın "Değiştirilemez" düğmesini kilitler. Danışman kuralı yalnız sıkılaştırabilir.
- Sunucu, kalıplı sayfada katalogda zorunlu olan bir kolona bağlı alanın `required`'ını kaldırmayı reddetmez. Bu yalnız Studio'da uygulanan bir kılavuzdur, çünkü sayfa kaydı katalogla eşzamanlı değildir. Benim kararım.

### 5.3 ERP çizimi

- `readPageTemplate` artık `record`'u da tanır. ERP, kalıplı sayfayı alt proje 3'teki ortak kabuk (`PageShell`) ile çizer. Sıra taslak 04 ve 08'deki gibidir:
  1. konum satırı
  2. kayıt özeti
  3. işlem çubuğu: Kaydet en solda, ek eylemler ortada, Sil en sağda; sığmayanlar "⋯" menüsünde
  4. sekmeler
  5. alt bilgi (kabuğun ortak alt bilgisi; "son değişiklik" bilgisi katalogda olmadığı için gösterilmez, Ctrl+S bu projede yok)
- Bölüm, sekme, alan ve satır tablosu bugünkü bileşen çiziciyle (`renderComponent`) çizilir. Doğrulama, sekme başına hata sayısı, ilk hataya atlama, değişiklik rozeti ve görüntüleme kipi (`mode=view`) hazır gelir. Kabuk, Liste'deki gibi eski 12'lik ızgaranın **dışında** çizilir.
- **Otomatik yerleşim** (§6.5) container query ile, bölümün kendi kutusuna göre:

  | Bölüm kutusunun genişliği | Kolon sayısı |
  |---|---|
  | > 720 px | seçilen sayı (1, 2 ya da 3) |
  | ≤ 720 px | en çok 2 |
  | ≤ 480 px | 1 |

  - Çok satırlı metin ve satır tablosu her zaman tam genişliktir.
  - Uzun değer kısaltılır ve `title` ile tamamı görünür.
  - Kayıt yüklenirken bölümlerin yerinde iskelet görünür.
  - Bu kurallar yalnız kalıplı sayfanın kutusunda geçerlidir. Eski form kartının 900/560 px medya kuralları değişmez.
- Çok satırlı metin için master'a gelen `multiline: true` kullanılır; yeni girdi türü eklenmez. Girdiye yalnız `readOnly` (bool) eklenir.

### 5.4 Studio

- **Yeni ekran:** kalıp seçiminde **Kayıt kartı** çıkar. Ekranlar listesinde kalıp süzgecine "Kayıt kartı" eklenir.
- **Liste ile bağ:**
  - "Kartı aç", liste kaynağının katalogdaki `opens` koduna gider. Yeni Kayıt kartı oluşturulurken sayfa kodu olarak, henüz sayfası olmayan bir `opens` kodu önerilir. Böylece liste ile kart kendiliğinden bağlanır.
  - Liste panelinde "Kartı aç" seçiliyse listenin işlem çubuğuna **+ Yeni** düğmesi gelir (en solda, ana düğme). Kartı parametresiz, yani yeni kayıt kipinde açar. Panelde kapatılabilir.
- **Tuvaldeki örnek kayıt:** Tuval, kartı açan listenin (kaynağının `opens`'u bu sayfa olan) ilk kaydıyla dolu gösterilir. Böyle bir liste yoksa ya da boşsa kart yeni kayıt kipinde görünür. Örnek anahtarın önizlemeye nasıl iletileceği kurucuya kalır (§6).
- **Kaynak seçilince kart kendiliğinden kurulur:**
  - tek bir "Genel" sekmesi;
  - 2 kolonlu tek bir "Genel bilgiler" bölümü;
  - kaynağın bütün kolonları sırayla bu bölüme dizilir, anahtar başta ve değiştirilemez;
  - özetin başlığı anahtar olmayan ilk metin kolonu, alt satırı anahtardır.
  - Katalogda, her bilgisinin kartta bir alanı olan tek bir *ekle* ve tek bir *güncelle* eylemi varsa Kaydet'e kendiliğinden bağlanır. Aynı kuralla tek bir *sil* eylemi Sil'e bağlanır. Yoksa boş kalır, panel bunu gösterir.
- **Tuvalde düzenleme** (taslak 08):
  - soldaki listeden alanı bölüme sürükleme;
  - alanı bölümler arasında taşıma;
  - bölümün üstüne gelince 1/2/3 kolon seçimi;
  - "+ Bölüm ekle", "+ Sekme", sekmeler arasında geçiş;
  - alanı kaldırma.
- **Panel** alt proje 3'teki `ComponentPanel` kalıbını kullanır: Ad → Ne gösterilsin? → temel ayarlar → Eylemler → kapalı Görünüm. Sekme ve açılır pencere yoktur.

  | Seçili | Panelde ne var |
  |---|---|
  | hiçbiri | sayfa: ad, hangi kayıt, Kaydet (yeni kayıtta / var olan kayıtta), Sil, öne çıkan değerler, ek eylemler, Görünüm (ek alan) |
  | bölüm | başlık, kolon sayısı, Görünüm'de *ne zaman görünsün* (`visibleWhen`), bölümü kaldır (alanlar sol listeye döner) |
  | alan | etiket, zorunlu, değiştirilemez, yardım metni, yeşil "yazılımcının hazırladığı" notu (tür, anahtar, zorunlu, en çok uzunluk), Görünüm'de *ne zaman görünsün*, karttan çıkar |
  | satır tablosu | ad, ne listelensin, kolonlar, sayfa başına, Görünüm'de liste boşken metni |
  | açıklama metni | metin |

- *Ne zaman görünsün* bugünkü `visibleWhen` biçimini kullanır. Seçici, bugünkü koşul düzenleyicisinin (`conditions`) danışman metniyle gösterilir.
- **Yedek tuval:** ERP'ye ulaşılamazsa alt proje 3'teki Karar 7 geçerlidir: "Bu ekran ERP önizlemesi açılınca görünür." Panel çalışmaya devam eder.

## 6. Kurucuya bırakılanlar

- **Sürükle-bırak tekniği.** Bölüm, alan, sekme ve "+" düğmeleri ERP'nin bildirdiği kutulardan bulunur. Gerekirse protokole eklemeli alanlar gelir:
  - kutunun türü ya da yeri (`slot`);
  - Studio'dan ERP'ye "şu sekmeyi göster" mesajı.

  Protokolün iki kopyası (Studio ve ERP) birlikte güncellenir.
- Satır tablosu panelinde Liste panelinin hangi parçalarının yeniden kullanılacağı.
- `sequenceWhen` koşulunun tam yazımı. "Satır yok" denetimi bugünkü koşul dilinde nasıl ifade ediliyorsa öyle yazılır.
- Kimlik üretimi: girdi, bölüm ve sorgu kimlikleri. Kolon adından türetilir, çakışmada sayı eklenir.
- Yükleme iskeletinin görünüşü.
- Kartın "açıldığı listeyi" bilme ve oraya dönme yolu (çalışma alanı sekmesi kimliği ya da sayfa parametresi).
- Tuvaldeki örnek kaydın anahtarının önizlemeye iletilmesi (önizleme adresine parametre ya da protokol mesajı).

## 7. Doğrulama

- **Eski sayfalar:** alt proje 3'teki anlık görüntü testleri (`legacyUnchanged`) değişmeden geçer. `customer-create` standardı ve kalıpsız bir form kartlı sayfa için de anlık görüntü eklenir.
- **Şema testleri:**
  - geçerli en küçük Kayıt kartı kabul edilir;
  - kuralları bozan her durum tek bir Türkçe hata metniyle reddedilir: eksik özet, iki sekme bileşeni, sekmede olmayan bölüm, iki bölüme ait alan, yanlış yerde yanlış parça;
  - katalogdaki yeni üç anahtar kabul edilir, geçersiz değerleri reddedilir.
- **ERP testleri** (vitest, jsdom):
  - kabuğun sırası;
  - Kaydet ve Sil'in yeri;
  - yeni kayıt kipi;
  - kolon kuralının üç genişliği;
  - çok satırlı metnin tam genişliği.
- **Studio testleri:**
  - Saf model fonksiyonları: kaynak seçince kurulum, sürükleme, taşıma, bölüm ve sekme ekleme ya da silme, eylem eşleme, kilitli düğmeler. Hiçbiri girdiyi değiştirmez.
  - Panelin bölüm sırası ve sekmesizliği.
- **Tarayıcıda üç genişlik (zorunlu):**
  - Danışman olarak bir Liste ve ondan "Kartı aç" ile açılan bir Kayıt kartı kurulur.
  - Aynı taslak Studio tuvalinde ve ERP'de 1280, 768 ve 375 px'te açılır, taslak 08 ile karşılaştırılır.
  - Gerçek arka uç yoksa sahte arka uçla yapılır ve bu belgede açıkça yazılır.

## 8. Benim kararlarım (kullanıcı düzeltebilir)

1. **"Kapatılabilir bölüm"** taslak 02'den çıkarıldı, çünkü ERP'de karşılığı yok.
2. **Açıklama metni** bölümün içinde değil, sekmede tam genişlikte ayrı bir blok olarak durur. `formCard` yalnız girdi barındırır.
3. **Otomatik kurulum** tek sekme ve tek, 2 kolonlu bölüm olarak yapılır.
4. **Kayıt kartında kullanılabilecek kaynak**, tek parametresi anahtarla aynı adı taşıyan kaynaktır.
5. **Zorunluluk kilidi** yalnız Studio'da uygulanır (§5.2).
6. **Çok satırlı metin** master'daki `multiline` ile yapılır (planlama sırasında master'a geldi).
7. **Liste'ye "+ Yeni"** bu projede eklenir; yoksa yeni kayıt kipine ulaşılamaz.
8. **Kartın sayfa kodu**, Liste'nin `opens` koduyla eşleşecek şekilde önerilir.
9. **Tuval** kartı açan listenin ilk kaydıyla dolu gösterilir; yoksa yeni kayıt kipindedir.
10. **Yeni kayıt kipinde kayıt sorgusu** boş anahtarla çalışır ve boş döner.
11. **Alt bilgi** "son değişiklik" göstermez; Ctrl+S bu projede yok.
12. **Kaydet'in kendiliğinden bağlanması**: eylemin her bilgisinin kartta bir alanı olmalı.

Kullanıcının bu belgedeki kararları (2026-11-25): eski tuval 5b'ye kalır; katalog üç bilgiyle genişler; Önceki / Sonraki sonraya kalır; serbest gövde 5. projeye kalır; yaklaşım A; taslak 08 onaylı; kaydetme ve silme sonrası davranış §5.1'deki gibi.
