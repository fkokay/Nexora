# Kalan işler için önerilen karar ve kapanış paketi

**Hazırlama tarihi:** 6 Kasım 2026  
**Durum:** Öneri taslağı; sahip onayı, kimlik bilgisi veya müşteri kabulü değildir.

Bu paket, mevcut kod ve repodaki karar kayıtlarından uygulanabilir öneriler çıkarır. Teknik kanıt ile ticari, muhasebesel ve güvenlik sahiplerinin onayını birbirinden ayırır. Harici bir kişinin imzası, DBA onayı, sağlayıcı hesabı, parola veya gizli anahtar bu belgeyle oluşturulmuş sayılmaz.

## Tamamlanan yerel kanıt

- ERP Web, Development Studio ve Platform API derlemeleri geçti. API Release derlemesi sıfır uyarı ve sıfır hatayla tamamlandı.
- Tam .NET Release koşusu 390 API entegrasyon testi ve 1.021 Platform birim testi geçti; bağlantısız koşuda 37 SQL/ortam testi atlandı.
- Yerel SQL Server 2025 ile API SQL kabul koşusu 424/427 geçti; kalan 3 test özel Vault/legacy fixture ayarı istedi. Low-code odaklı koşu 67/67 geçti.
- Platform ve Tenant low-code migration adayları, kaynak migration zincirinden oluşturulmuş ayrı veritabanlarına iki kez uygulandı. Hedef migration kayıtları ve `DBCC CHECKDB` doğrulandı; geçici DB’ler kaldırıldı. Bu temiz şema provasıdır, hedef yedeği geri yükleme provası değildir.
- Trendyol E-Faturam bireysel sandbox hesabında `POST /api/auth/signin` iki kez HTTP 200 ile doğrulandı; `x-access-token` ve `x-refresh-token` başlık adları teyit edildi. Kimlik bilgileri ve token değerleri repoya/kanıt dosyasına yazılmadı; fatura oluşturma çağrısı yapılmadı.
- SQL dosyaları ve SHA-256 değerleri [migration paketinde](../artifacts/migrations/2026-11-06-low-code/README.md); test kayıtları [faz durumunda](phase-status.md) bulunur.

## Önerilen kararlar

| Alan | Önerilen disposition | Gereken onay / kanıt | Kod ve yayın etkisi |
|---|---|---|---|
| Üretim yayını | **NO-GO sürsün.** Önce müşteri eşdeğeri staging, sabit aday commit/hash, sağlık/geri dönüş kanıtı ve release sahibi onayı. | Release sahibi staging hedefini ve change window’u seçsin; DBA hedef bazında migration geçmişi, checksum yedeği, restore ve `DBCC CHECKDB` kanıtını onaylasın. | Bu turdaki dirty çalışma ağacını release adayı sayma; hedef DB’ye SQL uygulama veya servis deploy’u yok. |
| Siparişsiz mal kabul/fatura maliyet farkı | Mevcut hareket geçmişi dağıtımını ilk sürüm için koru: tüketilen miktar farkı COGS’a, kalan pozitif depo bakiyeleri stok maliyet düzeltmesine dağıtılsın; gelecekteki ters hareket/negatif bakiye gibi belirsiz akışlarda posting reddedilsin. | Muhasebe sahibi bu maliyet dağıtım politikasını ve fatura kuru/tarihini yazılı onaylasın. SQL hedef kabulü ayrı kapı olarak kalsın. | Kaynak ve sentetik test mevcut; bu öneri tam bir valuation-layer taahhüdü değildir. Genel maliyet katmanı gereksinimi ayrıca ürün kapsamına alınmalı. |
| Faturaya bağlı sabit kıymet edinimi | Otomatik toplam maliyet varsayımı yapma. Açılacak tasarım; fatura satırı/ek gideri kıymete açık tutarla dağıtmalı, indirilebilir/indirilemeyen KDV niteliğini satırda saklamalı ve edinim yevmiyesini fatura posting’inden idempotent biçimde ayırmalı. | Mali müşavir/muhasebe sahibi dağıtım yöntemi, KDV sınıfı, döviz kuru tarihi/kaynağı, hesap eşlemesi ve ters kayıt politikasını imzalı karar olarak versin. | Karar gelene kadar mevcut `409 requiresAccountingPolicyDecision` fail-closed davranışı korunsun. |
| Bordro | Belgelenmiş ürün varsayılanlarını koru: takvim ayı, aylık/günlük/saatlik ücret, firma tanımlı kurallar, değişmez run snapshot’ı. Bunları 2026 yasal hesaplama kuralı sayma. | Mali müşavir her profil/yürürlük dönemi için resmi kaynak, oran/eşik, matrah/formül sırası, istisna/teşvik ve anonim beklenen sonuçları onaylasın; muhasebe sahibi hesap eşlemesini, İK işyeri/izin/puantaj kurallarını versin. | Onaylı girdiler gelmeden run kesinleştirme ve resmi beyan payload’ı kapalı kalsın. Kaynaklı referans JSON’u çalıştırılabilir kural setine dönüştürme. |
| E-belge sağlayıcısı | Kullanıcının seçtiği Trendyol E-Faturam hedefini koru. Bireysel sandbox girişi doğrulandı. Çok firmalı kullanım için entegratör/partner onboarding modeli sağlayıcıyla doğrulanmadan `PARTNER`, şirket kimliği veya kullanıcı modelini varsayma. Timeout/sonucu belirsiz gönderimde `Indeterminate` ve mutabakat; otomatik yeniden gönderim yok. | Fatura sandbox kabulü için sentetik belge senaryosu, alan/status mapping’i ve UUID/idempotency davranışı yazılı alınsın. Güvenlik/operasyon secret sahibi, Vault kaynağı/rotasyonu, tenant bağlama, merkezi HTTPS host allowlist’i ve redakte audit alanlarını karara bağlasın. | Bu kararlar olmadan tenant credential API’si, host allowlist yönetimi veya IntegrationHost gönderim kapısı açılmasın; secret/anahtar üretilmesin. |
| Tarayıcı kabulü | Yerel/QA ortamında salt okunur modül taraması yap; business verisi oluşturan eylemler tetiklenmesin. | Operatör test URL’sini ve test tenant’ını seçsin; Playwright için `NEXORA_UI_EMAIL` / `NEXORA_UI_PASSWORD` veya geçerli storage-state’i yalnızca yerel process environment’a koysun. Kimlik bilgilerini repoya ya da sohbete yazmasın. | Şu anda Nexora oturumu yok; authenticated browser acceptance açık. |
| Özel SQL/Vault kabul testleri | Sadece isimlendirilmiş, disposable SQL instance ve test Vault’unda çalıştır. | Güvenlik/DBA sahibi disposable-instance onayı, test bağlantı ayarları ve Vault test adresi/root token/mount değerlerini güvenli ortamda sağlasın; bunlar chate veya repo’ya konmasın. | Mevcut local SQL instance’ında önceden var olan `AIERPPhase1Smoke` bulunduğu için onu “disposable instance” olarak işaretleme; bu 3 test atlanmış kalsın. |

## Kapanış sırası

1. Muhasebe sahibi standalone fatura maliyet farkı ve sabit kıymet fatura politikalarını tek yazılı karar olarak onaylasın.
2. Mali müşavir/İK/muhasebe bordro profili, kaynaklı kural seti, örnek sonuçlar ve hesap eşlemesini onaylasın.
3. Güvenlik/operasyon ve Trendyol onboarding sahibi e-belge credential/config/sandbox sözleşmesini onaylasın.
4. DBA ve release sahibi staging hedefini, target migration geçmişi/yedeğini ve change window’u onaylasın.
5. Test operatörü test URL/tenant/kimlik bilgisini yerel güvenli environment’a eklesin; authenticated browser ve dedicated Vault/SQL kabul testleri çalıştırılsın.
6. Tüm kanıtlar PASS olduktan sonra güncel commit’ten temiz, hash’li release adayı oluşturulsun; promotion ayrı onay ve bakım penceresinde yapılsın.
