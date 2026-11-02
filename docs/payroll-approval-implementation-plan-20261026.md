# Türkiye bordro: onay sonrası uygulama ve doğrulama planı

**Durum:** Plan; dışarıdan onaylı mali müşavir girdileri bekleniyor. Hesaplama ve resmî beyan üretimini etkinleştirme onayı değildir.
**Tarih:** 26 Ekim 2026
**Girdi formu:** `docs/payroll-approval-inputs-20261026.md`

## Başlangıç koşulları

Bu plana göre davranış değişikliği ancak girdi formunun kapsamla ilgili bölümleri tarihli olarak onaylandığında başlar. Başlangıç öncesinde:

- Resmî kaynaklar, yürürlük tarihleri, profil kapsamı ve dış GİB şema paketi güncel resmî yayınla karşılaştırılır.
- Mali müşavir onaylı sentetik örnekler ve beklenen sonuçlar dosyalanır; gerçek kimlik, sicil veya bordro verisi fixture/test verisine alınmaz.
- Onaylı formül, parametre, kalem, dönem, önceki işveren `baseCode`/birim ve muhasebe eşlemelerinin şemaya sığıp sığmadığı incelenir.
- Var olan fail-closed kontrolleri ve değişmez snapshot semantiği korunur. Eksik veya çakışan girdi başarıya/varsayılan değere dönüştürülmez.

## Uygulama dilimleri

### A. Onaylı kural ve beyan profili

- Var olan kural şeması, parametre doğrulayıcı/runtime ve deklarasyon metadata alanları onaylı girdi formuna göre karşılaştırılır.
- Her değerde tip, birim, profil, yürürlük aralığı, kaynak izi ve ikinci yetkili onayı doğrulanır; çakışan aralık, boşluk, bilinmeyen tür veya birim uyuşmazlığı run'ı bloke eder.
- Her firma/işyeri için seçilen beyan türü, format, şema sürümü ve dönem kuralı ayrı onaylı profil olarak çözülür. XSD varlığı iş kuralı doğrulaması yerine sayılmaz.

### B. Çalışan girdileri ve ücret hesabı

- Değişmez run snapshot'ına yalnızca onaylı dönem girdileri alınır; snapshot özeti ve kaynak sürümleri hesap sonucuna bağlanır.
- Onaylı kalem sınıflarıyla brüt/net hedef, kazanç/kesinti, vergi ve PEK matrahı ile muhasebe eşlemeleri değerlendirilir. Kullanılacak yasal formül ve sıra yalnız onaylı referans örneklerinden alınır.
- Net hedef ters çözümü yalnız müşavirce onaylanan formüller için açılır. Tekil/monoton çözüm ve onaylı tolerans koşulları sağlanmazsa sonuç üretilmez.
- Önceki işveren girdileri tam `baseCode` ve birim eşleşmesiyle alınır; belirsiz, eksik veya mükerrer eşleşme bloke edilir. Sistem kodun hukukî anlamını kendiliğinden çıkarmaz.

### C. Zaman, izin ve düzeltme akışları

- Onaylı çalışma takvimi ve puantaj tamlığı önkoşulları; izin, fazla mesai, hafta tatili ve diğer zaman girdilerinin firma politikalarına bağlanmasıyla birlikte uygulanır.
- Ücret etkisi tanımlanmamış izin veya zaman durumu sıfır ücret varsayılmaz; onaylı karar yoksa hesap durur.
- Kesinleşen sonuçlar kaynak snapshot'ından ayrıştırılmaz. Sonradan gelen değişiklik, onaylı düzeltme politikasına göre ayrı ve izlenebilir yeni sürüm/fark kaydı oluşturur.

### D. İnceleme ve resmî çıktı

- Hesap dökümü ve ikinci yetkili incelemesi, onaylı kaynak sürümleri ve girdilerin hash'leriyle ilişkilendirilir.
- Seçilmiş beyan profili için alan eşlemesi ve iş kuralı kontrolleri tamamlanmadan payload üretimi açılmaz.
- Paket yalnız onaylı, hash'i tekrar doğrulanan dosyalardan hazırlanır; farklı ikinci yetkili onayı ve yetkili operatörün manuel teslim kaydı uygulanır. Nexora onayı kurum kabulü veya nitelikli e-imza/mali mühür sayılmaz.

## Doğrulama planı

Testler, onaylı sentetik beklenen sonuçlar geldikten sonra eklenir ve çalıştırılır. Beklenen tutarlar veya mevzuat formülleri bu planla üretilmez.

1. **Şema ve kaynak doğrulama:** geçerli/bozuk JSON, zorunlu kaynak ve profil alanları, yürürlük aralığı çakışması/boşluğu, tip-birim uyuşmazlığı, bilinmeyen kural; geçersiz durumda fail-closed.
2. **Formül birim testleri:** onaylı örneklerde decimal hassasiyeti, formül sınırları, overflow/hatalı AST, eksik bağımlılık, net hedef yakınsaması ve çözüm yokluğu.
3. **Hesap mutabakatı:** mali müşavir kabul örnekleri için kalem, matrah, net, işveren maliyeti ve muhasebe toplamlarını beklenen değerlerle karşılaştırma; sınır değerlerinde bir kuruş altı/eşit/üstü vakaları yalnız onaylı beklentiyle doğrulama.
4. **Dönem ve girdi bütünlüğü:** dönem sınırları, işe giriş/çıkış, puantaj/takvim tamlığı, izin/mesai etkisi, işyeri ataması ve kural sürümü; eksik/çakışan girdide blokaj.
5. **Önceki işveren:** onaylı tutar/kod/birim eşleşmesi, `NoPriorEmployer`, eksik/çift/yanlış birim eşleşmesi ve yıl uyuşmazlığı; ikinci kişi onayı olmadan kullanılamama.
6. **Yetki ve değişmezlik entegrasyonu:** hazırlayanın kendi kural/sonuç onayını verememesi, yetkisiz okuma/değişiklik reddi, snapshot/hash değişikliğinin tespiti, onaylı sonucu geriye dönük değiştirememe ve audit kaydı.
7. **Beyan ve paket kabulü:** firma/işyeri form seçimi, doğru XSD/kod listesi, zorunlu alanlar, yanlış formda ret, XSD geçerli ama iş kuralı/mutabakatı hatalı örneklerin reddi, hash değişikliğinde paket onayının geçersizleşmesi.
8. **UI/API kabulü:** bloke nedenlerinin anlaşılır gösterimi, role göre ücret ve bordro verisi görünürlüğü, sentetik fixture ile uçtan uca önizleme ve operatör adımlarının doğru sunumu.

## Repo yüzeyleri ve mevcut sınır

- API ve run yaşam döngüsü: `src/Hosts/AIERP.Api/HumanResourcesEndpoints.cs`
- Parametre/formül çalışma zamanı: `src/Hosts/AIERP.Api/PayrollParameterSetValidator.cs`, `PayrollExpressionSchemaValidator.cs`, `PayrollExpressionEvaluator.cs`, `PayrollRuleSetRuntime.cs`
- Çalışma takvimi kontrolü: `src/Hosts/AIERP.Api/PayrollWorkCalendarSchedule.cs`
- HR ekranı: `frontend/erp-web/src/HumanResourcesPage.tsx`
- Mevcut HR/bordro entegrasyon örnekleri: `tests/IntegrationTests/HumanResourcesEndpointsIntegrationTests.cs`
- GİB yerel şema arşivi ve doğrulama senaryoları: `docs/schemas/gib/ebeyanname-v133-2026-10-02/`, `docs/payroll-2026-source-validation-scenarios.md`

Repo şu anda değişmez run snapshot'ı, bileşen önizlemesi ve ikinci incelemeye sunulan iç formül sonucu uçlarını içeriyor. Bunlar kesinleşmiş yasal bordro tahakkuku veya GİB kabulü değildir; run blokajındaki `calculation-engine-not-enabled` ve `declaration-business-validation-not-configured` gibi kapılar ayrı onay ve doğrulama tamamlanmadan kaldırılmaz.

Bu belge testleri çalıştırmaz ve kod/şema/migration/deployment değişikliği yapmaz. Kabul girdileri geldiğinde önce uygulama dilimleri, sonra bu doğrulama planının ilgili vakaları ele alınır.
