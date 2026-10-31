# 2026 bordro resmi kaynak doğrulama senaryoları

Bu belge kaynak doğrulamasına dayalı sentetik kabul senaryoları tanımlar. GİB'in resmî V133.0 paketi üretici şeması ve kod listesi sağlar; bu dosyada resmî örnek beyan veya çalıştırılabilir GİB iş kuralı vakası bulunmamıştır. Buradaki senaryolar GİB tarafından yayımlanmış testler değildir ve resmi kabul kanıtı sayılmaz.

## Kaynakla hesap mutabakatı

[`fixtures/payroll/tr-4a-2026-minimum-wage-reference.json`](fixtures/payroll/tr-4a-2026-minimum-wage-reference.json), ÇSGB'nin 2026 aylık asgari ücret çizelgesini ve SGK'nın standart 4/a oran tablosunu tek bir sentetik senaryoda bir araya getirir. 33.030 TL brüt; çalışan için %14 SGK + %1 işsizlik, GİB çizelgesine göre 0 gelir/damga vergisi ve 28.075,50 TL net üretir. İşveren maliyeti örneğinde teşvik uygulanmaz; oranlar SGK tablosundaki %12 + %7,5 + %2,25 + %2'dir. Senaryo yalnız tam ay ve standart 4/a içindir; kalem/matrah kapsamını, kıst dönemi, birden fazla işvereni veya istisna hesabını doğrulamaz.

Ücret gelir tarifesi için sınır senaryoları ayrıca değerlendirilmelidir. 2026 ücret dilimi kümülatif yıllık matrahına uygulanacak baz vergi değerleri: 190.000 TL → 28.500 TL; 400.000 TL → 70.500 TL; 1.500.000 TL → 367.500 TL; 5.300.000 TL → 1.697.500 TL. Her sınırın bir kuruş üstünde yalnız marjinal fark ilgili üst dilim oranıyla artar. Bunlar yalnız GVK tarife aritmetiğidir; aylık kesinti değildir ve asgari ücret istisnası, işçi prim indirimi, gelir kalemi eşlemesi veya birden çok işveren hesabını kapsamaz.

Net hedef önizlemesi için firma formülleri, brüt adayı `calculation.grossCandidate` girdisine bağlamalıdır. Runtime bu girdiye göre kazanç-kesinti netini hesaplayıp net hedefe bir kuruş içinde yaklaşan tutarı arar. Birim uyuşmazlığı, formülün aday tutara bağlı olmaması, hesaplama taşması, aralık bulunamaması, örneklenen aralıkta monoton olmayan sonuç veya toleransa yakınsamama önizlemeyi reddeder. Bu solver algoritmasının senaryosudur; yasal oran veya GİB kabul vakası değildir. Önizleme sonucu saklanmış/ikinci kez onaylanmış tahakkuk oluşturmaz.

## GİB XSD yapısal senaryoları

Kullanılacak şema/kod listesi `schemas/gib/ebeyanname-v133-2026-10-02/` altındaki, `README.md` içinde hash'leri kayıtlı dosyalardır. Yerel XML yapısal doğrulaması `scripts/Validate-GibPayrollDeclaration.ps1 -Form 1003A -XmlPath <dosya>` veya `-Form 1003B` ile yapılabilir. 1003A ile 1003B ayrı XSD ve kod listesi kullanır; aynı XML'in iki formda da geçmesi beklenmemelidir. Validator DTD'leri kapatır; başarılı sonuç sadece seçilen XSD'ye göre yapısal uygunluk demektir.

Bir yapısal kabul örneği hazırlanırken anonim/sentetik kimlikler ve test işyeri bilgileri kullanılmalı; başvuruya özgü gerçek TCKN/VKN, SGK işyeri sicili veya müşavir evrakı fixture'a konmamalıdır. Formun gerekli `genel/idari`, `genel/mükellef` ve `ozel` alanları, XML sıra ve türleri seçilen XSD'den oluşturulur. Kod listesi referansları aynı arşivin form-özel `_Kodlar.xml` dosyalarıyla doğrulanır. XSD doğrulaması başarılı olsa dahi mükellef/işyeri uygunluğu, çapraz alan kontrolleri, beyan dönemi, vergi/PEK mutabakatı ve GİB kabulü ayrıca doğrulanmalıdır.

Asgari negatif senaryolar:

1. 1003A XML'i 1003B XSD'siyle doğrula: form şeması eşleşmiyorsa başarısız olmalı.
2. `kodVer` niteliğini çıkar veya kök `beyanname` öğesinin zorunlu `genel`/`ozel` sırasını boz: XSD doğrulaması başarısız olmalı.
3. Zorunlu vergi dairesi, dönem, mükellef kimliği, şube numarası veya takip eden dönem beyan değeri eksik olsun: XSD gerekli alanları reddetmeli.
4. Bir kod listesi alanına listede bulunmayan değer yaz: kod listesi doğrulayıcısı reddetmeli; XSD başarısı tek başına yeterli sayılmamalı.
5. XSD geçerli, fakat aynı bordro kaleminin toplamı/vergisiyle tutarsız tutar gönder: iş kuralı/mutabakat aşaması reddetmeli.
6. XSD geçerli fakat yanlış işyeri sicili veya yetkisiz 1003A/1003B seçimi: profil doğrulaması reddetmeli.

Bu senaryolar exporter ve validator acceptance kapsamıdır. Bugünkü kod, resmi XML üretmez, uygulama API'sinde XML doğrulama endpoint'i sunmaz, GİB'e iletmez ve test/fixture değerlerini hesaplama kuralı olarak seed etmez.
