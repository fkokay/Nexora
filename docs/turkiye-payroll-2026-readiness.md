# Türkiye bordro kapsamı ve 2026 mevzuat girdileri

**Araştırma tarihi:** 23 Ekim 2026  
**Kapsam:** Ücretli bordro motoru için ürün kararları ve 2026 yılı resmi girdi özeti. Bu not bir hukuki/mali müşavir görüşü veya bordro hesaplama talimatı değildir. Kaynaklar değişebileceğinden canlı kullanımdan önce yürürlük ve uygunluk yeniden teyit edilmelidir.

## Mevcut ürün sınırı

HR modülü personel, izin, puantaj ve dönem özeti sunuyor. Dönem özeti personel sayısı, puantaj ve izin kayıtlarını toplar; bordro, SGK bildirimi veya vergi beyannamesi üretmez. `docs/human-resources-operations.md` bu sınırı açıkça belirtir.

Buna ek olarak ürün, `PayrollRuleSet` ile Türkiye (`TR`) için kaynak bağlantılı ve yürürlük tarihli JSON taslakları saklayabiliyor. Alanlar `TaxYear`, `EffectiveFrom`, `EffectiveTo`, `Version`, `RulesJson`, `OfficialSourceUrl` ve `Status`; durum yeni kayıtta `Draft` olur. API HTTPS kaynak bağlantısını ve JSON boyut sınırını doğrular. Taslağı oluşturan kullanıcı kendi taslağını onaylayamaz; ayrı bir firma yöneticisi onaylayabilir. UI de oranların önceden tanımlı olmadığını ve ekranın hesap yapmadığını bildirir.

Bu altyapı kural verisini saklama ve ikinci kişi onayı içindir. JSON şeması hukuki kalemleri tanımlamıyor; motor, hesap dökümü, ücret bordrosu, SGK bildirgesi veya vergi beyanı üretimi yok. Mevcut tarih kontrolü yalnızca bitiş tarihinin başlangıçtan önce olmamasını denetliyor; çakışan aralıkları veya takvim yılıyla aralık uyumunu garanti etmiyor. Her taslak tek `OfficialSourceUrl` taşıyor; çok kaynaklı kural kalemleri için kaynak izi ayrıca tasarlanmalı.

## 2026 resmi girdileri

| Konu | 2026’da yayımlanan resmi değer / kural | Yürürlük ve kapsam | Kaynak |
|---|---|---|---|
| Asgari ücret | Brüt aylık 33.030,00 TL; açıklanan net aylık 28.075,50 TL. Asgari ücretli çalışan kesintisi: SGK %14 (4.624,20 TL), işsizlik %1 (330,30 TL); GİB çizelgesinde gelir ve damga vergisi kesintisi sıfır. | 01.01.2026–31.12.2026; aylık asgari ücret çizelgesi. Bakanlık hesabı bilgilendirme amaçlıdır. | [ÇSGB 2026 asgari ücret ve işveren maliyeti](https://www.csgb.gov.tr/poco-pages/asgari-ucret), [GİB asgari ücret hesabı](https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fyardim-kaynaklar%2Fyararli-bilgiler%2FAsgariUcrettenYapilanKesintiler.pdf) |
| SGK prime esas kazanç (4/a) | Özel sektör için günlük alt sınır 1.101 TL, aylık alt sınır 33.030 TL; günlük üst sınır 9.909 TL, aylık üst sınır 297.270 TL. SGK, aylık üst sınırın günlük alt sınırın 9 katı olduğunu belirtir. | 01.01.2026–31.12.2026; 5510 sayılı Kanun 4/1-(a) kapsamındaki özel sektör çalışanları. Kamu ücret dönemi ayrıca farklı tarih sınırlarıyla ele alınıyor. | [SGK Prime Esas Kazanç Miktarları](https://www.sgk.gov.tr/Content/Post/2e0c9e1a-2cfe-4456-af10-49d3de0c58ba/Prime-Esas-Kazanc-Miktarlari-2026-01-14-10-35-39) |
| Çalışan primleri | Standart 4/a hizmet akdinde MYÖ %9 + GSS %5 = SGK çalışan payı %14; işsizlik çalışan payı %1. SGDP veya fiili hizmet gibi statüler farklı olabilir. | SGK oran tablosu hizmet akdine tabi sigortalıları esas alır; kapsam dışı statülere otomatik genellenmemeli. | [SGK İşveren Prim Oranları](https://www.sgk.gov.tr/Content/Post/c7812ea8-5087-413f-aeb5-d3c1d153e11a/Isveren-Prim-Oranlari-2026-01-13-04-52-38), [ÇSGB 2026 asgari ücret hesabı](https://www.csgb.gov.tr/poco-pages/asgari-ucret) |
| İşveren primi ve indirim | ÇSGB’nin 2026 asgari ücret örneğinde işveren SGK payı imalatta %16,75 (5 puan indirimli), diğer sektörlerde %19,75 (2 puan indirimli); işveren işsizlik payı ayrıca %2. SGK, 5 puanlık imalat uygulamasını 2026 sonuna kadar ve diğer sektörlerde 2 puan indirim şartlarını açıklar. | İndirimler işyeri, sektör ve yasal koşullara bağlıdır; varsayılan/garantili hak gibi uygulanmamalı. | [ÇSGB 2026 asgari ücret ve maliyet hesabı](https://www.csgb.gov.tr/poco-pages/asgari-ucret), [SGK Güncel Sigorta Primi Teşvik, Destek ve İndirimleri](https://sgk.gov.tr/Content/Post/c52f99f0-da6c-4029-9b9a-a0d6f96a6a42/Guncel-Sigorta-Primi-Tesvik-Destek-ve-Indirimleri-2026-08-04-10-29-55) |
| Ücret gelir vergisi tarifesi | Kümülatif vergi matrahında ücret gelirleri için: 190.000 TL’ye kadar %15; 400.000 TL’ye kadar 28.500 TL + aşan kısım %20; 1.500.000 TL’ye kadar 70.500 TL + aşan kısım %27; 5.300.000 TL’ye kadar 367.500 TL + aşan kısım %35; üzeri 1.697.500 TL + aşan kısım %40. | 2026 takvim yılı gelirleri. Ücret sütunundaki eşikler genel gelir tarifesinin 1,5 milyon TL üst dilim eşiğinden ayrılır. | [GİB 2026 Gelir Vergisi Tarifesi](https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fyardim-kaynaklar%2Fyararli-bilgiler%2Fgelir-vergisi-tarifeleri%2Fgelir-vergisi-tarifesi-2026.pdf), [GİB GVK Madde 103](https://gib.gov.tr/mevzuat/kanun/433/madde/6937) |
| Asgari ücret vergi istisnası | Ücretlinin o ay geçerli brüt asgari ücretinden çalışan SGK ve işsizlik payı düşüldükten sonra kalan kısma isabet eden ücret gelir vergisi istisnası kapsamındadır. İstisna, aylık asgari ücret üzerinden hesaplanan vergiyi aşamaz; birden çok işverende yalnız en yüksek ücret için uygulanır. Aynı dönemde ücret sayılan maaş, prim ve benzeri ödemelerde kümülatif matrah ve istisna bir kez dikkate alınır. Asgari ücrete isabet eden brüt kısım için damga vergisi istisnası da vardır. | 01.01.2022’den beri yürürlükte olan çerçeve; 2026 tutarları aylık asgari ücretle belirlenir. İstisna standart %14 prim varsayımından farklı statülerde ayrıca değerlendirilmelidir. | [GİB 2026 ücret geliri rehberi](https://intvrg.gib.gov.tr/hazirbeyan/assets/pdf/DUYURU_UNIVERSAL_2026_2026_Ucret_Geliri.pdf), [GİB asgari ücret kesintileri](https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv%2Fyardim-kaynaklar%2Fyararli-bilgiler%2FAsgariUcrettenYapilanKesintiler.pdf) |

Bu değerler araştırma notudur, `PayrollRuleSet` taslağı değildir ve uygulama ortamına seed edilmemelidir. Tek resmi URL alanı farklı SGK/GİB/ÇSGB girdilerinin kaynaklarını eksiksiz temsil etmez. Uygulamaya alınacak her kural için kaynağın madde/ek numarası, yayım/erişim tarihi, yürürlük başlangıç-bitişi ve hangi çalışan profiline uygulandığı birlikte sürümlenmelidir.

## Motor başlamadan önce ürün sahibi ve mali müşavir kararları

Önerilen başlangıç kapsamı: yalnız Türkiye’de özel sektör 4/a çalışanları, aylık TL bordrosu, brüt ücret girişi, kaynaklı kural paketi ve bordro önizleme/dökümü. Bu öneri onaylanmış ürün kapsamı değildir.

| Karar | Onay sorusu | Varsayılan öneri |
|---|---|---|
| Kapsam ve çalışan profili | MVP yalnız özel sektör 4/a mı? Kamu, SGDP, kısmi süreli, yabancı, stajyer, emekli ve fiili hizmet kapsamı dahil mi? | İlk sürümü 4/a özel sektörle sınırla; istisnai sigortalılık statülerini açıkça desteklenene kadar engelle. |
| Bordro dönemi ve tarih | Aylık dönem hangi tarihle seçilir: çalışma ayı, tahakkuk ayı, ödeme günü? İşe giriş/çıkış ve eksik gün nasıl günlükleştirilir? | Takvim ayı ve ayrı çalışma/ödeme tarihleri; günlükleştirme yasal bildirim ve ücret politikası teyidinden sonra. |
| Ücret modeli ve kalemler | Brüt mü net ücret mi esas alınır? Prim, ikramiye, fazla mesai, ayni/nakdi yan hak, avans, nafaka ve icra kesintileri nasıl sınıflanır? | Brüt ücret ana girdi; her kazanç/kesinti kaleminde SGK, gelir vergisi ve damga vergisi matrahlarına dahil olma özellikleri açık ve müşavir onaylı olsun. |
| Zaman ve izin girdileri | Fazla mesai, hafta tatili, ulusal bayram, ücretsiz izin ve puantaj düzeltmeleri hangi iş hukuku politikasıyla ücretlendirilecek? | HR kayıtlarını otomatik ücrete çevirmeden önce politika, katsayı ve onay akışı tanımlansın; mevcut dakika kayıtları tek başına yeterli kabul edilmesin. |
| Kümülatif gelir vergisi | Önceki işverenden gelen kümülatif matrah, aynı ay birden fazla işveren ve yıl ortası giriş/çıkış nasıl ele alınacak? | Vergi matrahını çalışan ve takvim yılı bazında taşı; çok işveren/önceki işveren durumlarında kullanıcıdan belge ve açık seçim iste. |
| SGK tabanı ve teşvikler | PEK dışı/istisnalı ödemeler, üst sınır aşımı, geçmiş aya ait ödeme ve teşvik uygunluğu nasıl yönetilecek? | Teşviksiz hesap ayrı ve açıklanabilir olsun; teşvik yalnız koşullar kanıtlanıp müşavir onaylı profil seçildiğinde hesaplansın. |
| İstisna ve kişisel durumlar | Asgari ücret GV/DV istisnası, engellilik indirimi, SGDP, BES/özel sağlık ve icra kesintileri hangi kanıt ve sırayla uygulanacak? | Her istisnayı profil ve belge koşullu bir kural yap; kanıtlanmamış hak/istisna varsayma. |
| Yuvarlama ve geriye dönük değişiklik | Kalem, matrah ve toplam hangi hassasiyette yuvarlanır? Onaylı döneme sonradan gelen düzeltme yeniden hesap mı, fark bordrosu mu üretir? | Ara işlemlerde kuruş hassasiyetini koru; yasal/işyeri yuvarlama noktalarını müşavir onayıyla belirle; onaylı sonucu değiştirmek yerine sürümlü düzeltme kaydı üret. |
| Çıktı ve beyan sınırı | İlk teslimat bordro pusulası/önizleme mi; MUHSGK, Muhtasar ve Prim Hizmet Beyannamesi, e-Beyanname, SGK e-Bildirge veya e-imza/gönderim de bekleniyor mu? | İlk sürümde hesap özeti ve kontrol edilebilir bordro dökümü; resmi beyan, e-imza ve gönderim ayrı kapsam ve kurum entegrasyon onayı gerektirsin. |
| Yetki ve onay | Kural hazırlama/onay, bordro çalıştırma/onay, ödeme talimatı ve düzeltme yetkileri kimlerde olacak? | Mevcut iki kişilik kural onayını koru; bordro onayı ve muhasebe/ödeme gönderimini ayrı rol ve denetim olaylarıyla tasarla. |

## Kural seti taslağıyla izlenebilirlik

Mevcut `PayrollRuleSet` alanları Türkiye/yıl/tarih/sürüm/kural JSON’u/kaynak URL’si ve taslak-onay statüsünü karşılıyor. 2026 girdileri ancak her yasal kalemin kendi profil koşulu ve yürürlük aralığı saklanarak bu JSON taslağına ilerletilebilir. Tek `EffectiveFrom`/`EffectiveTo` çifti içinde vergi yılı boyunca geçerli tarife ile farklı tarihlerde değişebilen SGK veya teşvik girdilerini temsil etmek için JSON içindeki alt kalemler de etkili tarih ve profille sürümlenmelidir.

Hesap motorundan önce önerilen kontrol noktaları:

1. Mali müşavir ve ürün sahibi yukarıdaki kapsam kararlarını ve hukuk/uygulama kaynak haritasını onaylar.
2. JSON kural şeması tür, birim, profil, kapsam, yürürlük aralığı, kaynak, yayım tarihi, istisna ve yuvarlama alanlarını zorunlu kılar.
3. Her kural maddesi en az bir resmi kaynağa bağlanır; kaynak URL’si belge kimliği, ilgili madde/ek ve doğrulama tarihiyle saklanır.
4. Aynı profil için tarih çakışması, kapsanmayan dönem, bilinmeyen kural türü ve onaysız kural seti hesaplamayı durdurur.
5. Motor geliştirilirken müşavirce onaylı referans bordrolar ve beklenen beyan karşılaştırmaları ayrıca hazırlanır.

Bu araştırmada herhangi bir hesaplama kodu, migration, veritabanı değişikliği, oran seed’i veya beyan gönderimi yapılmadı.
