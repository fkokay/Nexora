# 5b-2: Kalıpları büyütme ve standartları dalga dalga taşıma (tasarım)

Tarih: 2026-11-27. Üst belge: `2026-11-25-nexora-studio-sadelestirme-design.md` §7 madde 5b. Önceki parça: 5b-1 (PR #189, sınıflandırıcı + rapor + geri alınabilir taşıma; canlıda).

## 1. Amaç ve neden

Kullanıcının kararı (2026-11-27): **kalıplar büyüsün**; amaç **ERP'deki iki yerleşim dalını kapatmak**. Bugün `template` alanı olmayan sayfalar eski çizimle (12 kolon), kalıplı sayfalar kalıp kabuğuyla çiziliyor. Eski dal ancak hiçbir canlı sayfa kalıpsız kalmadığında silinebilir (§7 5b "Geçişten sonra").

Canlı kuru çalıştırma raporu (2026-11-27, 4 firma): 63 firma sayfa satırının ve 50 sistem standardının **hiçbiri** bugün Liste ya da Serbest kalıba eşlenemiyor. Firma satırlarının 59'u standartların firma kopyası (ScreenKey), 4'ü eski şema/taslak test sayfası. Yani işin özü **50 standardın** kalıba geçmesi.

Rapordaki engeller (standart sayısı):

| Engel | Sayı |
|---|---:|
| İşlem çubuğu (`actionBar`) | 50 |
| Form alanları (Kayıt kartı adayı) | 49 |
| `hiddenCommands` | 46 |
| Açılır pencere (`dialog`) | 26 |
| İç içe bileşen (`children`) | 26 |
| `recordHeader` (Liste'de yok) | 23 |
| Koşullu genişlik (`widthWhen`) | 17 |
| Düzenlenebilir satır tablosu (`editableGrid`) | 15 |
| `commandWhen` | 14 |
| Sihirbaz adımları (`steps`), `filterChips`, satır tablosu ayarları (`formulas`, `fillQuery`, `fillColumns`, `lookupFills`, `lockColumnsWhen`, `skipWhenZero`, `rowNumberColumn`) | daha az |

## 2. Hedefler, hedef dışı, karşı hedefler

**Hedefler**
- Kalıplar, standartların bugün kullandığı davranışları taşıyacak kadar büyür; her standart bir kalıba (Liste, Kayıt kartı, Belge, Serbest) **davranışı aynı kalarak** taşınır.
- Her adımdan sonra canlı rapor yeniden çıkar; taşınabilir standart sayısı ilerlemenin ölçüsüdür.
- Son adımda eski yerleşim dalı ERP'den ve eski Studio tuvali Studio'dan silinir.

**Hedef dışı**
- Standartların akışını sadeleştirmek (pencere yerine ayrı ekran vb.). Kullanıcı bunu reddetti.
- Yeni ERP özelliği eklemek: her kalıp özelliği yalnız bugün eski sayfada var olan bir davranışı karşılar.

**Karşı hedefler (teknik olarak çalışsa bile başarısızlık sayılır)**
- Taşınan bir ekranda kullanıcının yapabildiği bir şeyin kaybolması ya da farklı çalışması (kaydetme sırası, koşullu düğme, kayıttan sonra gidilen ekran, silme onayı, dışa aktarma…).
- Eski çizimi kalıbın içine "eski bileşen kutusu" olarak taşımak: iki dalı gerçekte kapatmaz (elenen yol, §4).
- Kalıpların her şeyi serbestçe açan bir ayar yığınına dönmesi: kalıbın iskeleti ERP'de sabit kalır, yeni özellikler danışmana sınırlı, adlı seçenekler olarak gelir.

## 3. Kısıtlar

- **Ekran değişikliği önce taslak:** her adımın ERP ve Studio görünümü, kod yazılmadan önce taslakla (`docs/design-proposals/studio-sadelestirme/NN-*.html`) kullanıcı onayından geçer.
- **Davranış eşdeğerliği:** 5b-1'in `BehaviorEquivalence` kuralı (sorgu, eylem, yetki, bileşen kümesi, sekme içeriği aynı; yalnız yerleşim değişir) her adımda yeni özelliklerle birlikte genişletilir; gevşetilmez.
- **Geri alınabilirlik:** taşıma yalnız 5b-1 komutlarıyla (rapor → prova → doğrulama → canlı → gerekirse geri dönüş) yapılır; her canlı çalıştırma ayrı kullanıcı onayı ister.
- **Standartlar ve firma kopyaları:** sistem standartları gömülü JSON (`SystemPages/Standards`) olarak PR ile değişir; firmalardaki ScreenKey kopyaları aynı standardın firmada düzenlenmiş halidir ve 5b-1'de atlanır. Bir standart taşınınca, onun firma kopyaları da aynı adımda dönüştürücüyle taşınır (§5.5).
- **Expand → migrate → contract:** eski dal ancak bütün sayfalar taşındıktan sonra silinir; arada her iki dal yaşar.
- Var olan kurallar: `.NET` testleri ortak kilitle sırayla; güncel `origin/master`'dan başla.

## 4. Yaklaşımlar

Kullanıcının seçtiği yaklaşım **A**'dır.

- **A) Önce özellik, sonra dalga dalga taşıma (seçildi).** Kalıplara her seferinde bir özellik eklenir (kendi taslağı ve PR'ı); dönüştürücü o özelliği tanır; rapor yeniden çıkar; taşınabilir olan standartlar taşınır. Kazanç: her özellik bir kez yapılır, ilerleme ölçülür. Bedel: ilk adımlarda taşınan sayı az olabilir, çünkü çoğu standart birden fazla engel taşır.
- **B) Modül modül.** Bir modülün standartları için gereken bütün özellikler birlikte eklenir. Elendi: ilk modül neredeyse bütün özellikleri birden ister, ilk PR çok büyür; sonraki modüllerde aynı özelliğin kenarları yeniden açılır.
- **C) Kalıpta "eski bileşen" kutusu.** Elendi: eski çizim kodunu kalıba taşır, iki dalı kapatmaz (karşı hedef).

## 5. Kararlar

### 5.1 Adım sırası (sıklığa göre)

Her adım ayrı bir alt proje: tasarım taslağı → plan → uygulama → PR → canlı → yeniden rapor → (taşınabilir standart varsa) taşıma.

1. **Komutlar + Kayıt kartına eşleme (kullanıcının kararı: tek adım).** Engeller: `actionBar` 50, `hiddenCommands` 46, `commandWhen` 14, form alanları 49, `recordHeader` (Kayıt kartında) 23. Komutlar dört kalıbın hepsine gelir; Kayıt kartında Kaydet / Sil / kayıt sonrası ayarları dahil. Dönüştürücü `formCard`/`input`/`recordHeader`/sekmeleri `record` yuvalarına eşler. Aynı adımda yeni sayfalar yalnız kalıpla oluşturulabilir hale gelir (§5.5). Ayrıntı §5.2.
2. **Açılır pencere ve iç içe bileşen.** `dialog` 26, `children` 26.
3. **Liste kalıbında kayıt başlığı ve koşullu genişlik.** `recordHeader` (Liste'de), `widthWhen` 17.
4. **Sihirbaz adımları ve filtre çipleri.** `steps` 8, `filterChips`.
5. **Satır tablosu: Belge kalıbı ve belge modelleri.** `editableGrid` 15 ve tablo ayarları. Belge kalıbı bugün yalnız `satis.siparis` modelini bilir; diğer 14 ekran için önce belge modeli gerekir (alt proje 6 ile ortak yol).
6. **Kapanış:** kalan her sayfa taşındığında eski yerleşim dalının ve eski Studio tuvalinin silinmesi.

Sıra, rapor yeniden çıktıkça değişebilir (ör. bir adım taşınabilir sayıyı beklenenden çok artırırsa). Sırayı değiştirmek kullanıcıya sorulur.

### 5.2 Adım 1'in kapsamı (Komutlar + Kayıt kartı)

Eski `actionBar` bir **standart komut çubuğudur**: yerleşik komutlar (yeni, aç, kaydet, sil, filtre, yazdır, dışa aktar, yenile) ve bunların ayarları. 50 standartta kullanılan ayarlar (sayı): `hiddenCommands` 46 (gizlenen: print 46, delete 40, save 33, open 25, filter 18, export 12, new 11, refresh 1), `exportTable` 37, `titleCount` 36, `moreButtons` 33, `focusInput` 31, `newButton` 22, `openButton` 20, `newAction`/`newPageCode`/`newTarget` 17/14/14, `commandWhen` 14, `afterSaveAction`/`afterSavePageCode`/`afterSaveTarget` 11, `saveSequence`/`stopOnError`/`sequenceWhen` 10, `afterSaveRefresh` 9, `deleteQuery`/`deleteConfirmText` 7, `saveQuery` 6, `saveAndNew` 5, `afterSaveButton` 5, `newInputs` 3, `openAction`/`openPageCode`/`openTarget`/`openTable`/`openParams` 2. Her standartta tam bir `actionBar` var.

Kalıplı sayfa bugün düğmeleri `actions` yuvasından alır ve kabuk (`PageShell`) çizer: ana düğme solda, `danger` en sağda, sığmayan "⋯" menüsüne. Kayıt kartında Kaydet/Sil ve kayıttan sonra ne olacağı sabit kurallardır (`recordAfterSave.ts`).

Adım 1 kalıplara bu komutların karşılığını ekler: **hangi yerleşik komutların görüneceği, ne zaman görüneceği/çalışacağı ve ne yapacağı** (kaydetme sırası ve koşulları, yeni/aç hedefi, kayıttan sonra gidilecek ekran, silme sorgusu ve onay metni, dışa aktarılacak tablo, başlıkta kayıt sayısı, odak alanı, "Diğer" menüsü). Bunların sayfa biçimindeki yeri ve adları, ERP'deki çizimi ve Studio'daki danışman paneli adım 1'in kendi tasarımında ve taslağında belirlenir. Bu belge yalnız şunları bağlar:

- Kabuğun buton sırası kuralları (ana solda, Sil en sağda, taşan "⋯") korunur; eski çubuktaki sıra farkı "görünüş değişebilir" sayılır.
- Kayıt kartının bugünkü sabit kayıt sonrası kuralları, sayfada açıkça bir ayar yoksa varsayılan olarak kalır; standarttan gelen ayar varsa o geçerlidir (davranış eşdeğerliği).
- Dönüştürücü, `actionBar`'ın her ayarını yeni biçime birebir eşler; eşleyemediği ayar varsa sayfayı taşımaz (bugünkü gibi gerekçe yazar).
- **Klavye kısayolları ve ortak komut sistemi korunur (karar, "davranış değişmez" kuralından):** eski çubuk komutlarını ERP'nin ortak `CommandProvider`'ına kaydeder (`usePageCommands`): F tuşları, Ctrl+F2 "Kaydet ve yeni", kayıt defterinin eklediği komutlar (ör. Görüntüle) ve gizli komutların tarayıcı kısayollarının engellenmesi. Kalıp kabuğu da komutlarını aynı sisteme kaydeder; kabuğun "⋯" menüsü ile kayıt defteri komutları tek listeden gelir. Başlık satırı ve `PageCommandsSlot` davranışı da aynen sürer.
- **Taslak 11 (`docs/design-proposals/studio-sadelestirme/11-komutlar.html`, kullanıcı onayı 2026-11-27) ve kararları:**
  - Komut listesi: Yeni, Düzenle (eski "Aç"), Görüntüle, Kaydet, Kaydet ve yeni, Sil, Yenile, Filtre, Yazdır, Excel (eski "Dışa aktar"); CSV dışa aktarma "⋯" menüsünde.
  - `focusInput` ayrı bir açılış odağı değildir; Filtre komutunun (Ctrl+F) odaklandığı alandır ve öyle kalır.
  - Kısayollar düğmede rozet değil, bugünkü ERP gibi üzerine gelince ipucu olarak gösterilir; kalıp kabuğu da bu ipucunu gösterir.
  - **Tek "⋯" menüsü:** eski çubuğun İşlemler menüsü (`moreButtons`, Alt+İ, CSV) ile kabuğun taşan düğmeler menüsü tek "⋯" menüsünde birleşir; Alt+İ bu menüyü açar.
  - **Kaydetme adımları:** danışman adımları katalog eylemi olarak seçer; standartlardan gelen ham sorgu adımları ve `sequenceWhen` ifadeleri "Gelişmiş" altında okunur ve korunur. Sil eylemi "Kaydet düğmesi" bölümünden Komutlar › Sil'e taşınır.
  - **Başlıkta kayıt sayısı:** varsayılan sunucudaki toplam (standartların bağladığı `meta.totalCount`), yoksa görünen satır sayısı; danışmana ayrı seçenek açılmaz.
  - **Düğme sırası sabittir:** Yeni · Düzenle · Görüntüle · Kaydet ve yeni · Yenile · Filtre · Yazdır · Excel (ana düğme solda, Sil en sağda); danışman sıralayamaz.
  - Standartlarda hiç kullanılmayan eski çubuk ayarları (`barLook`, `formDialog`, `printEnabled`, `exportCsv`) yeni biçimde karşılık bulmaz; bunları kullanan firma sayfası gerekçesiyle taşınmaz kalır.
  - `afterSaveRefresh`, yalnız "kayıttan sonra ekran aç" seçiliyken geçerli "açılan sayfayı yenile" seçeneğidir.
- **Kayıt kartı:** bugünkü sabit Kaydet / Sil / kayıt sonrası kuralları (`recordDoneFor`, `recordSequenceGate`, `afterRecordSave`) sayfada ayar yoksa varsayılandır; `saveQuery`, `saveSequence`/`sequenceWhen`/`stopOnError`, `afterSave*`, `deleteQuery`/`deleteConfirmText`, `saveAndNew`, `newInputs` karşılıkları bu kurallara takılır.

### 5.3 Davranış eşdeğerliği nasıl sınanır (karar)

- **.NET (yapısal):** `BehaviorEquivalence`, kaldırılan bileşenin (ör. `actionBar`) her ayarının yeni biçimde birebir karşılığı olduğunu denetleyecek şekilde genişletilir. Kaldırılan bileşen ancak bu eşleme tam ise kabul edilir; eşleme dışı her ayar başarısızlıktır. Her standart için önce/sonra bu denetimden geçer (fixture testi).
- **ERP (çalışma):** her komut türü (görünürlük, koşul, kaydetme sırası, kayıt sonrası gidiş, silme onayı, dışa aktarma, kısayol) için kalıplı sayfada vitest çalışma testi; standart başına ayrı ekran testi yazılmaz.

### 5.4 Her adımın "bitti" tanımı

- Taslak onaylı; ERP ve Studio değişikliği, yeni özelliğin sayfa doğrulaması ve davranış eşdeğerliği testleri yeşil.
- Dönüştürücü yeni özelliği tanıyor; 5b-1 gerekçe tablosu güncel (kaldırılan engelin gerekçesi artık çıkmıyor).
- PR birleşmiş ve canlıda; canlı rapor yeniden çıkmış, sonuç kullanıcıya gösterilmiş.
- Taşınabilir standart varsa: standartların gömülü JSON'u ayrı bir PR ile kalıplı hale getirilir ve firma kopyaları 5b-1 komutlarıyla (prova + kullanıcı onayı) taşınır.

### 5.5 Standartlar, firma kopyaları ve yeni sayfalar

- Gömülü standart JSON'u dönüştürücünün çıktısıyla PR'da değiştirilir (elle değil); PR'da her standardın önce/sonra davranış eşdeğerliği testi bulunur ve `version` artırılır.
- Firma kopyaları (ScreenKey satırları) aynı dalgada 5b-1 komutlarıyla taşınır; bunun için 5b-1'in "Sistem sayfası; standartlar ayrı geçirilir." atlaması, **standardı o dalgada taşınmış ScreenKey'ler** için kaldırılır.
- **Standart güncelleme önerileri ("Yeni"):** standardın `items` bildirimi (`since`/`requires`) taşınan sürümle birlikte yeniden yazılır. Kalıplı bir standarttan kalıpsız bir firma kopyasına (ya da tersine) bileşen önerilmez (`SystemPageMerge.NewItems`).
- **Hiç taşınamayan firma kopyası:** raporda gerekçesiyle kalır; ne olacağı (ör. standarda sıfırlama) kapanış adımında kullanıcıya sorulur. Kullanıcı onayı olmadan hiçbir firma kopyası sıfırlanmaz.
- **Yeni sayfalar (kullanıcının kararı):** adım 1'den itibaren Studio ve sunucu, yeni bir sayfanın yalnız kalıpla (`template`) oluşturulmasına izin verir. Var olan kalıpsız sayfalar düzenlenmeye devam eder.
- Eski şemadaki (sürüm 1) firma sayfaları kullanıcıya bildirilir; tasarımcıda bir kez kaydedilmeleri gerekir (dönüştürücü sürüm 1 okumaz).

## 6. Builder'a bırakılanlar

- Her adımın sayfa biçimi (alan adları, nerede durduğu), ERP bileşen yapısı ve Studio paneli — adım tasarımı ve taslağında.
- Dönüştürücüdeki kod yapısı (5b-1 `PageTemplateMigration` genişletilir).
- Adım içi PR bölümlemesi.

## 7. Açık riskler

- Bir standart birden çok engel taşıdığından, ilk 2–3 adım bitmeden canlıda taşınan standart sayısı sıfır kalabilir. Bu beklenen bir durumdur; ilerleme rapordaki engel sayılarının düşmesiyle izlenir.
- Satır tablolu 14 ekran belge modeli ister; bu adım alt proje 6'nın hızına bağlıdır.
- Firma kopyaları standarttan ayrışmış olabilir; dönüştürücü onları da tek tek sınıflandırır, eşlenemeyen kopya gerekçesiyle raporda kalır.
