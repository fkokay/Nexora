# Depolama kotası: geçiş, aşım ve uyarı kararları

**Durum:** Ürün politikası onaylandı ve uygulandı: kota firma başına SQL `ROWS` data page kullanımıdır; okumalar devam eder, kota sınırında/aşımında tahsisi artıracak mutasyonlar reddedilir. Tahsisi artırmayan mutasyonlar kabul edilebilir; silmelerin de her durumda çalışacağı garanti edilmez. Bu not mevcut uygulamayı ve kalan geçiş/ürün kararlarını kaydeder. Small/Medium ticari limitleri, uyarı eşikleri ve migration büyüme raporlaması hâlâ karara bağlanmalıdır. Runtime staging SQL kabulü **NOT RUN**.

## Bugünkü uygulama

- [`TenantStorageQuotaInterceptor`](../../src/Hosts/AIERP.Api/TenantStorageQuotaInterceptor.cs) SQL Server `ROWS` dosyalarındaki `FILEPROPERTY(..., 'SpaceUsed') * 8192` toplamını ölçer. Transaction log ve dış dosya deposu sayılmaz.
- Yeni kayıt/güncelleme öncesi ve transaction içindeki değişiklikten sonra sayaç kontrol edilir; kota sınırında/aşımında tahsisi artıran mutasyon rollback edilir. Ölçüm/lock hatasında yazma fail-closed reddedilir. Salt okumalar devam eder. Silme dahil mutasyonlar ancak ölçülen ayrılmış page tahsisini artırmıyorsa kabul edilir; silme ve audit kaydı page tahsisini artırabileceğinden silmeler için genel istisna yoktur. Silme, SQL sayfa tahsisini düşürmeyebilir.
- Lisanssız başlangıç profili Small kotasını kullanır. Geçerli lisans yükseltmesi yeni sınırı sağlar. Kota hatası `license.storage_limit` (409), ölçüm hatası `license.storage_unavailable` (503) kodunu verir.
- Tenant migration/provisioning kodundaki akış doğrudan `Database.MigrateAsync` ve SQL kopyalama yapar; kota interceptor'ı bu altyapı adımlarına uygulanmaz. Ancak `TenantDatabaseProvisioner.ProvisionAsync` şu anda başta credential-isolation gereksinimiyle durduruluyor; bu akışın çalıştırılması mevcut durum olarak varsayılmamalıdır. Akış etkinleştirilecekse hazır tenant migration boyunca `Copying` durumuna alınır ve yönlendirme kapalıdır. Migration yeni tablo/indeks sayfaları tahsis edip tenant'ı kota üstüne çıkarabilir; sonraki normal büyüme yazıları reddedilir.

## Karar önerileri

| Durum | Seçenekler | Öneri |
| --- | --- | --- |
| Mevcut tenant etkinleştirme anında sınırın üstünde | (1) Eski kullanımı koruyup büyümeyi anında durdur; (2) ücretsiz/grace dönemi; (3) lisans etkinleştirmeyi kullanım düşene kadar engelle. | Onaylı davranış: eski veri korunur; okuma sürer, page tahsisini artırmayan mutasyonlar kabul edilir ve artıranlar reddedilir. Grace dönemi, onaylı lisans davranışını değiştireceği için ayrı ürün kararı gerektirir. Lisans yükseltme, kota kısıtını kaldıran çözüm olarak gösterilsin. |
| Migration sırasında data page artışı ve raporlama | (1) Migration'ı kota üstünde de bitir ve tenant'ı hizmete al; (2) kota kontrolü nedeniyle migration'ı durdur; (3) önceden kapasite/tenant uygunluğu kontrolü yapıp migration'ı operasyonel olarak onayla. | Migration büyüme raporu, tenant bazlı ön/son ölçüm ve kota üstü migration davranışı açık ürün/operasyon kararıdır. Kayda alınana kadar migration'ın kota üstüne çıkarabileceği varsayılmalı; bunu runtime kota politikasının staging kabulü veya onayı gibi sunma. Migration şema değişikliğini başaramadıysa tenant `Ready` olmamalı. |
| Firma yöneticisinin düzeltmesi | (1) TenantAdmin'e genel bypass; (2) kota altında çalışacak silme/temizlik ve ardından düzeltme; (3) sınırlı, izli remediation izni; (4) kota yükselttikten sonra düzeltme. | Genel bypass ekleme. Salt silme, büyüme dışı kalan düzeltme işlemleri ancak gerçekten SQL tahsisini artırmadığı ölçülüp doğrulanırsa yapılabilir. Düzeltme için yazma gerekiyorsa kota yükseltme veya ayrı, süreli ve audit'li remediation tasarımı gerekir. Mevcut uygulamada genel bir remediation istisnası yoktur. |
| Kota uyarıları | (1) Yalnız dolu/aşılmış durumda ekran uyarısı; (2) ön eşikte in-app uyarılar; (3) e-posta/harici bildirim. | İlk aşamada lisans ekranında ölçüm, sınır, “dolu/aşılmış” durumu ve okumalar ile page tahsisini artıran/artırmayan mutasyon ayrımını göster. 80%/95% gibi ön eşikleri ve bildirim kanallarını ürün sahibi onayladıktan sonra ekle; polling/e-posta altyapısı varsayma. 409 ve 503 istemci mesajları kod bazında farklı ve kurtarma adımı içermeli. |

## Kabul ölçütleri

Bu maddeler staging kabulü için hedef ölçütlerdir; uygulama kanıtı olarak değerlendirilmemelidir. Runtime staging SQL kabulü **NOT RUN**. Önceden kaydedilmiş yerel/disposable SQL kabul sonuçları staging ortamı için PASS değildir.

1. Sayaç lisans ekranında ilgili firmanın SQL `ROWS` ayrılmış data page kullanımı olarak görünür; transaction log veya dosya deposu dahilmiş izlenimi vermez. Kullanım ve sınır aynı GiB hesabıyla gösterilir.
2. Ölçüm sınırın altındayken normal büyüme yazısı tamamlanabilir; ölçüm sınırda veya üstündeyken yeni kayıt ve güncelleme rollback olur. Sınırdaki bir tenant'ta okuma endpointleri çalışmaya devam eder.
3. SQL data page tahsisini artırmayan mutasyon kabul edilir. Silme ve audit kaydı page tahsisini artırabileceği için silme otomatik olarak izinli sayılmaz. Silme sonrası tahsis düşmediyse ekran kota dolu/aşılmış uyarısını kaldırmaz ve yazma kilidini yanlışlıkla açmaz.
4. Sayaç okunamaz ya da kota kilidi alınamazsa büyüme yazısı fail-closed reddedilir; API `license.storage_unavailable` ve trace id verir. Kullanıcıya ölçüm arızası kota aşımından ayrı anlatılır.
5. Lisans sınırını aşan eski tenant, migration veya kota politikasının devreye alınması nedeniyle verisini kaybetmez; salt okuma devam eder, tahsisi artırmayan mutasyonlar kabul edilir, tahsisi artıranlar gerekçeli yanıt alır. Lisans yükseltme sonrası yeni limit tekrar okunur.
6. Tenant migration öncesinde/sonrasında data page ölçümü, uygulanan migration kimliği ve `Ready`/`Failed` sonucu tenant kimliğiyle operatör raporunda bulunur. Migration `Copying` iken normal tenant trafiği yönlendirilmez. Migration bitiminde kota üstüne çıkan tenant `Ready` olabilir ama büyüme yazısı kota davranışına tabidir.
7. Kota hatası kullanıcı akışında mevcut form verisi korunur ve düzeltilebilir kurtarma yolu (veri temizleme ya da yetkili lisans yükseltmesi) gösterilir. İşlemin başarısız olduğu anlaşılır; sessiz veri kaybı veya kısmi kayıt olmaz.
8. Genel kullanıcı/tier bypass yoktur. Her ilerideki remediation istisnası ayrı yetki, kapsam, süre, audit ve ölçüm sonrası kota kontrolü ile tasarlanıp kabul edilmelidir.

## Açık ürün ve operasyon kararları

- Small 10 GB, Medium 100 GB ve Large için sınırsız profilin sözleşme/satış taahhüdü olup olmadığı; Large `int.MaxValue` profili teknik olarak sınırsız sayılmamalıdır.
- Ön eşik uyarı yüzdeleri, uyarının tenant yöneticisine mi tüm yazıcılara mı gösterileceği ve e-posta/harici kanal ihtiyacı.
- Migration sırasında/bittikten sonra data page büyümesinin nasıl ölçülüp raporlanacağı, kota üstü migration'ın nasıl ele alınacağı ve sürüm öncesi tenant-bazlı rapor/eskalasyon sahibi.
- Düzeltme için upgrade dışında süreli remediation gerekip gerekmediği. Onaylanana kadar genel bypass tasarlanmaz.

## Güvenli uygulama sırası

1. Ürün sahibi Small/Medium paket limitlerini ve açık migration ölçüm/raporlama kararlarını yazılı olarak belirler. Aşımda okumaların sürmesi ve yalnızca page tahsisini artırmayan mutasyonların kabul edilmesi onaylanmıştır ve tekrar ratifikasyon beklemez.
2. Sürüm öncesi salt okunur preflight ile tenant bazında güncel kullanım, aktif profil, sınıra kalan/taşan miktar ve hedef migration sonrası beklenen büyüme raporlanır. Eşik üstü tenantlar için müşteri/operasyon iletişimi hazırlanır.
3. Migration normal backup, hedef ortam provası ve migration-release kapılarıyla yürütülür. Her tenant için önce `Copying`, sonra doğrulama ve `Ready` sırası korunur.
4. Yayın sonrası lisans ekranı ve kota hata kodlarıyla kullanım izlenir; kota üstü tenantlar için lisans yükseltme veya veri temizleme desteği sağlanır. Sayaç sayfa tahsisi olduğundan silme sonrası anında düşüş garantisi verilmez.

Bu not hiçbir tenant verisini veya lisansını değiştirmez; SQL preflight sorgusu ya da migration çalıştırmaz.
