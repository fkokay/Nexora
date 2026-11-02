# Doğrudan nakit bütçesi izin kabulü — staging

Bu kısa runbook, `/api/finance/cash-budgets` için `erp.finance-cash-budgets` izin kaydını ve TenantUser salt-okunur varsayılanını staging’de doğrular. Yalnızca sentetik tenant ve test kullanıcıları kullanın.

## Rol ve izin davranışı

- `TenantAdmin`, mevcut tenant yöneticisi yetkisiyle listeleme, görüntüleme, oluşturma, düzenleme ve onay yapabilir.
- `TenantUser` varsayılanı `erp.finance-cash-budgets.read` iznidir. GET liste/detay okunabilir; varsayılan create/update/execute izni verilmez.
- Endpoint eşlemesi: GET → `read`; POST `/{id}/approve` → `execute`; diğer POST → `create`; PUT → `update`. POST, PUT ve approve ayrıca endpoint içinde TenantAdmin ister. TenantUser’a özel bir Allow kuralı bulunsa bile bu yazma/onay işlemlerini açmamalıdır.
- Mevcut özel rol/kullanıcı izin kurallarını silmeyin, değiştirmeyin veya varsayılanla topluca değiştirmeyin. Eksik TenantUser baseline izni eklenir; mevcut rol düzeyi kural varsa korunur. Eşleşen Deny, Allow’a üstün gelir. Bu nedenle mevcut özel Deny varsa salt-okunur GET de reddedilebilir; bunu ayrıca kaydedin, kuralı değiştirmeden önce izin sahibine yönlendirin.

## Oturumu yenileme

İzin kuralları API isteğinde güncel olarak değerlendirilir. Tenant rolü JWT claim’inde bulunduğundan rol veya üyelik değişikliğinden sonra test kullanıcısını uygulamadan çıkış yaptırıp yeniden giriş yaptırın (uygulama destekliyorsa geçerli oturumu yenileyin), sonra sayfayı yeniden yükleyin. Yalnız izin kuralı değiştiyse normalde yeni JWT gerekmez; staging kabulünde tutarlı bir başlangıç için yine de kullanıcı oturumunu yenileyin. Token/çerez değerlerini kanıta koymayın.

## Kabul adımları

1. Sürüm/commit, staging hostu, tenant ve test kullanıcılarının rollerini release kaydına yazın. İzin politikalarında `erp.finance-cash-budgets` kaydının bulunduğunu ve mevcut özel kuralların değişmediğini kontrol edin. Başlangıç/son durum kanıtını hassas değerleri maskeleyerek saklayın.
2. Bir TenantAdmin ile oturumu yenileyin. Network sekmesinde `GET /api/finance/cash-budgets/` ve varsa `GET /api/finance/cash-budgets/{id}` çağrılarını doğrulayın: beklenen `200`; response tenant’a ait bütçe listesi/detayıdır.
3. TenantAdmin ile yalnız sentetik veride taslak oluşturun (`POST /api/finance/cash-budgets/`, beklenen `201`). Taslağı düzenleyin (`PUT /api/finance/cash-budgets/{id}`, beklenen `200`). Onay için oluşturan kişiden farklı bir TenantAdmin kullanın (`POST /api/finance/cash-budgets/{id}/approve`, beklenen `200`). Böylece görevler ayrılığı şartı da korunur.
4. TenantUser oturumunu yenileyin ve aynı tenant’taki bütçeyi listeleyip/detayını açın; GET için `200` beklenir. Aynı test kullanıcısıyla sentetik gövde kullanarak create POST, mevcut taslak üzerinde PUT ve approve POST isteklerini deneyin; her biri `403` olmalı. Network’te status `403` olduğunu doğrulayın; bu denemelerde gerçek kayıt değişmemelidir.
5. İzin politikasındaki özel kuralları tekrar inceleyin. Önceden var olan custom permission’ların aynı kaldığını, yeni baseline’ın mevcut kuralı ezmediğini doğrulayın. Her adım için PASS / FAIL / NOT RUN ve kanıt kaydını doldurun. Herhangi bir TenantUser yazma/onay isteği 2xx alırsa kabulü durdurun.

## Kanıt kaydı — her Network isteği için

Chrome/Edge DevTools **Network**’te **Preserve log** açıkken ilgili isteği seçin ve aşağıdaki alanları kaydedin. Tam URL’de tenant/iş kaydı kimliği varsa paylaşım kopyasında maskeleyin. HAR, Copy as cURL, Authorization/Cookie başlıkları, token’lar ve ham request body paylaşmayın.

```text
Senaryo / kullanıcı rolü:
Request URL (maskeli):
Request Method:
Status:
Timestamp (Europe/Istanbul, ISO 8601):
Response Headers > X-Trace-Id (yoksa “yok”):
Response body > traceId (yoksa “yok”):
Response body > güvenli error/title (yoksa “yok”):
Sonuç (PASS / FAIL / NOT RUN) ve kanıt bağlantısı:
```

Başarılı istekte de URL, method, status ve zaman alanlarını kaydedin; `X-Trace-Id` varsa ekleyin. Hata/403’te header ve body’deki `traceId` değerlerini ayrı ayrı kaydedin; varsa eşleşmelerini kontrol edin. Trace ID yoksa üretmeyin. Genel hata mesajı ve ID dışında response body’yi kopyalamayın. Alanların güvenli toplanması ve log korelasyonu için [`api-error-trace-id-operator-guide-20261026.md`](api-error-trace-id-operator-guide-20261026.md) yönergesini izleyin.
