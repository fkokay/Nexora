# Bordro dışa aktarma ve manuel bildirim paketi

**Durum:** Ürün kararı kaydedildi; tasarım ve kapsam sözleşmesi. Gerçek bordro çıktısı üretmez.

**Girdi durumu:** GİB'in 2026-10-02 tarihli geliştirici paketindeki 1003A/1003B XSD ve kod listeleri `schemas/gib/ebeyanname-v133-2026-10-02/` altında saklanır. Bunlar resmî yapısal şemalardır; firma/işyeri için doğru form seçimini, GİB iş kurallarını, firma alan eşlemelerini veya kabul senaryolarını tek başına sağlamaz. Gerçek bildirim payload'ı üretimi, işverenin seçilmiş onaylı profil ve iş kuralı doğrulaması tamamlanana kadar kapalıdır.

## Kararlar

- İlk bildirim teslim yolu, onaylı dışa aktarma paketi ve yetkili operatörün kurum/sağlayıcı portalına manuel yüklemesidir. API üzerinden kuruma gönderim yapılmayacaktır.
- İlk paket imzası, paketi hazırlayan kişiden farklı ikinci yetkilinin Nexora içi onayıdır. Onay, değişmez manifest ve içerik hash'lerine bağlanır. Bu onay nitelikli elektronik imza veya mali mühür değildir; resmi kurum kabulü iddiası taşımaz.
- Beyan türü, format ve şema sürümü firma/işyeri profiline göre mali müşavirce seçilip onaylanmış olmalıdır. Ortak, sabit beyan türü veya dosya biçimi varsayılmaz; bir pakette bir veya daha fazla onaylı beyan dosyası bulunabilir.

## Paket sınırı

Paket ancak bir bordro run'ı hesaplanmış, gerekli firma ve yasal dönem parametreleri onaylı/yürürlükte, tüm gerekli girdi ve kalem eşlemeleri mevcut, run snapshot'ı değişmez ve run ayrıca onaylanmış olduğunda hazırlanabilir. Depoda seçilmiş personel/dönem kaynaklarını hash ile kilitleyen Blocked iç taslak snapshot vardır; hesaplama çıktısı, run onayı, düzeltme süreci ve paket üretimi henüz yoktur. Bu nedenle gerçek dosya üretimi kapalı kalır.

Gelecekteki taşıma zarfı yalnız şu nötr metadata'yı kapsar: şema ve paket sürümü, tenant/run kimliklerinin gizli/opaque biçimi, yargı alanı ve onaylı beyan profili, kapsanan dönem ve dönem kuralı sürümü, kaynak rule-set sürümü, dosya listesi, MIME türü, bayt uzunluğu ve her dosyanın SHA-256 özeti. Dosya listesi içindeki içerik, yalnız mali müşavir/kurum tarafından sağlanmış ve sürümü kaydedilmiş şemaya göre üretilir. Örnek/boş JSON veya vendor-neutral envelope, resmi beyan dosyası yerine geçmez. Makine tarafından okunabilir manifest sözleşmesi [`payroll-manual-submission-package-v1.schema.json`](schemas/payroll-manual-submission-package-v1.schema.json) dosyasındadır; bu yalnız yerel zarf şemasıdır, resmi payload şeması değildir.

## Onay ve indirme yaşam döngüsü

1. Sistem onaylı run snapshot'ından versiyonlu payload dosyalarını üretir; manifest ve hash'leri hesaplar.
2. Paket `AwaitingApproval` olarak kilitlenir. Hazırlayan farklı bir firma yetkilisi tam olarak bu manifest ve dosya hash'lerini onaylar; audit olayı kullanıcıyı, zamanı, run ve paket sürümünü bağlar. `approvedContentSha256`, sabit property sırasıyla UTF-8'e yazılan manifest çekirdeğinin (paket, dönem, run ve sıralı dosya girdileri; `approval` ve sonradan güncellenen `submissionRecord` hariç) SHA-256 değeridir; her dosyanın kendi SHA-256 değeri ayrıca kapsanır.
3. Onay hash'leri değişirse iptal olur ve yeni paket sürümü/ikinci onay gerekir. Yalnız onaylı, hash'i tekrar doğrulanmış baytlar indirilebilir. İndirme denetlenir.
4. Yetkili operatör portalda dışarıdan manuel gönderir. Nexora daha sonra kullanıcı tarafından sağlanan teslim tarihi, kurum referansı ve redakte edilmiş makbuz/kanıt kaydını ekleyebilir. Bu kayıt `OperatorReportedSubmitted` anlamına gelir; kurumun kabul/işleme sonucunu Nexora doğrulamış olduğu anlamına gelmez.

Hash yalnız baytların bütünlüğünü doğrular. Kimlik doğrulaması ve onay için korunmuş denetim kaydı gerekir; payload'a PIN/sertifika/private key eklenmez. Hassas maaş ve çalışan verisi içerdiği için paket indirme ayrı bordro dışa aktarma yetkisi, kısa ömürlü erişim, denetim izi ve şirketin onaylı saklama politikasına tabi olmalıdır. E-posta veya normal loglarda taşınmamalıdır.

## Gerçek üretimden önce gereken girdiler

- Her beyan türü için mali müşavir/işveren tarafından seçilmiş resmi form ve sürüm, zorunlu alan listesi, firma/işyeri alan eşlemeleri, GİB iş kuralı doğrulama ve kabul senaryoları. Resmî XSD/kod listesi arşiv kopyası depoda bulunur; gerçek dosya için ayrıca güncel GİB paketiyle karşılaştırılıp seçilen formun firma profiliyle uyumlu olduğu doğrulanmalıdır.
- Kaynağı, vergi/SGK matrah eşlemeleri, yuvarlama ve dönem anlamını mali müşavirce incelenmiş test vakaları; gerçek olmayan kimliklerle beklenen dosya ve hesap mutabakatı.
- İç run snapshot API'si seçilen girdileri ve SHA-256 özetini saklıyor. Önceki işveren durumu/matrahı için çalışan-yıl bazlı, ikinci kişi onaylı genel beyan kaydı da snapshot'a alınır; bu giriş yasal matrah eşlemesi veya belge doğrulaması değildir. Paket onayı, dosya hash'leri, hassas dosya saklama/izinleri, indirmede hash doğrulaması ve indirme denetimi uygulanmadı.
- Manuel gönderim yapan rol, iade/reddedilme/düzeltme/iptal durumlarının operasyon akışı ve kanıt saklama süresi.

Bu çalışma kapsamında run, payload, ZIP/UBL/XML/CSV, resmi form, imza sertifikası veya portal bağlantısı üretilmedi; kurum/entegratör hesabına erişilmedi ve gönderim yapılmadı. Bunlar belirtilen yetkili girdiler geldikten sonra uygulanabilir.

Rule-set v1 `declarations` metadata dizisi, onaylı beyan kodu, dosya formatı, dış şema sürümü, firma profili, dönem kuralı referansı, yürürlük aralığı ve kaynakları saklayabilir. 1003A (`XML`, `MUHSGK_21`) veya 1003B (`XML`, `MUHSGK2_12`) seçen, run profili ve tüm dönemi kapsayan geçerli kural seti ayrı yetkili onayı aldıysa run snapshot'ındaki `employer-declaration-profile-not-approved` engeli kalkar. Bu metadata, GİB XSD paketinin yerelde bulunması veya kural setinin onayı gerçek payload doğrulamasını, GİB iş kuralı doğrulamasını ya da resmi kabulü sağlamaz; `declaration-business-validation-not-configured` engeli kalır. Aynı beyan kodu/profil için çakışan yürürlük aralıkları reddedilir.
