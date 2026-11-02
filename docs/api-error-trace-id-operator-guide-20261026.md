# API hata korelasyonu ve güvenli destek kaydı

**Güncel ortak kaynak:** API ve Development Studio destek kaydı ile trace eşleştirmesi için [API ve Studio hata destek rehberi](api-studio-error-support-guide.md) kullanın. Bu API rehberi API'ye özgü ayrıntılar için korunmaktadır.

Bu rehber, ERP Web'de görülen API hatalarını `X-Trace-Id` ile sunucu loglarına bağlamak için kullanıcı ve operasyon ekibinin izleyeceği güvenli toplama adımlarını tanımlar. İstek gövdesi, kimlik bilgileri veya firma/kişi verileri destek kaydına kopyalanmaz.

## Kullanıcıdan istenecek kayıt

Chrome DevTools'ta **Network** sekmesini açın, **Preserve log** seçeneğini etkinleştirin ve hatayı bir kez yeniden oluşturun. İstek listesinden hata durum kodlu ilgili API çağrısını seçin. Hatayı yeniden oluşturduğunuz anda bilgisayarın yerel saatini kaydedin ve saat dilimini ekleyin; DevTools **Timing** sekmesi süreleri karşılaştırmak için yardımcı olur. Örneğin `2026-10-26T14:32:10+03:00`.

Aşağıdaki alanları destek kaydına ekleyin:

- **Request URL:** Network > Headers > General içindeki tam URL. Operasyon ekibi orijinal URL'yi yalnız onaylı, erişimi kısıtlı destek kanalında kullanmalıdır. Destek kaydı veya ekran görüntüsü paylaşılacaksa URL yapısını koruyup firma/tenant adını ve kimliklerini, kişi/çalışan/müşteri/tedarikçi kimliklerini, belge numaralarını ve bunları taşıyan path/query değerlerini `[REDACTED]` ile değiştirin. Hassas bir değer URL'nin içinde bulunuyorsa onu açık biçimde göndermeyin; kurumun güvenli destek kanalını kullanın.
- **Method:** `GET`, `POST` gibi Request Method.
- **Status:** HTTP durum kodu.
- **Response header:** **Response Headers** içindeki `X-Trace-Id`. Başlık görünmüyorsa `yok` yazın; kendiniz üretmeyin.
- **Zaman:** İstek başlangıç zamanı ve saat dilimi.
- **Response body:** Yalnız kullanıcıya gösterilmek üzere hazırlanmış güvenli `error`/`title` mesajı ve `traceId` değerini kaydedin. JSON'da başka alanlar varsa (ör. `errors`, firma/belge bilgisi, sayısal iç değerler), onları kopyalamayın. `message` isimli güvenli bir alan varsa yalnız genel kullanıcı mesajını alın. Ham body'yi bütünüyle eklemeyin.

Örnek kayıt:

```text
URL: https://erp.example.com/api/orders/[REDACTED]?period=[REDACTED]
Method: GET
Status: 500
Timestamp: 2026-10-26T14:32:10+03:00
X-Trace-Id: 0H...
Safe response message: İstek sunucuda tamamlanamadı.
```

## Göndermeyin veya eklemeyin

- `Authorization`, `Cookie`, `Set-Cookie`, bearer/access/refresh token, API key, parola, oturum kimliği veya secret.
- Request body, form verisi, dosya, SQL/stack trace veya ham exception.
- Ham response body, HAR dosyası, **Copy as cURL** çıktısı ya da temizlenmemiş ekran görüntüsü. Bunlar header, payload ve oturum bilgilerini içerebilir.
- Firma/tenant adı veya kimliği, vergi/kimlik numarası, kullanıcı/çalışan bilgisi, müşteri/tedarikçi bilgisi, ticari belge numarası/tutarı ya da başka gerçek üretim verisi.

Destek ekibi ağ kaydı isterse önce bu alanları temizleyin. Temizlenemiyorsa HAR, cURL, payload veya görüntüyü paylaşmayın; yukarıdaki alanları elle yazın. Kayıt içindeki `traceId` ve onaylı kanalın sağladığı erişim sınırlaması dışında hassas ek kullanmayın.

## Operasyon ekibinin log eşleştirmesi

1. Önce API host'un yapılandırılmış uygulama loglarında `X-Trace-Id`/`TraceId` değerini birebir arayın. API response header'ı ASP.NET `HttpContext.TraceIdentifier` değerini taşır; API exception handler kayıtlarında da aynı değer `TraceId` alanı/mesajıyla kullanılır.
2. **5xx** için eşleşen `Unhandled API exception` kaydı varsa exception ayrıntısını yalnız yetkili operasyon/sorumlu ekip incelemelidir. Bu ayrıntılar kullanıcıya veya normal destek kaydına aktarılmaz. Depolama kotası doğrulama hatasında `Tenant storage quota verification failed` uyarısı da aynı TraceId ile eşleştirilebilir.
3. **403/404** yanıtları her zaman exception üretmez. API'nin istek/yetkilendirme loglarını durum kodu, method, path ve zaman aralığıyla inceleyin; varsa TraceId alanını kullanın. Reverse proxy/ingress erişim logları, isteğin doğru API host'una ulaşıp ulaşmadığını ve upstream durumunu doğrulamak için kullanılabilir. Proxy'nin kendi ürettiği yanıt API TraceId'si taşımayabilir.
4. Uygulama logunda kayıt bulunmuyorsa URL/path, method, status ve zaman aralığıyla ilgili API instance'ı, ingress/reverse proxy ve dağıtım logları arasında arama yapın. Saat dilimi ve sistem saat farkını hesaba katın. TraceId yoksa yalnız zaman/path eşleşmesine dayanarak kesin kök neden atamayın.
5. Firma/tenant bağlamı log incelemesi için gerçekten gerekliyse, erişimi kısıtlı iç loglarda yetkili operasyon sorumlusu doğrulasın. Firma kimliğini destek bileti, kullanıcı arayüzü veya harici kanala kopyalamayın. Logda bulunmayan bir tenant kimliğini kullanıcıdan istemeyin.

TraceId istekle korelasyon anahtarıdır; tek başına kullanıcıya, firmaya veya iş kaydına dair bilgi vermez. Log erişimi en az yetki ilkesine göre tutulmalı ve ilgili saklama/olay müdahale kuralları uygulanmalıdır.

## Kullanıcı arayüzü ve destek yanıtı

Arayüz yalnız güvenli, genel hata mesajını ve kullanıcıya destek başvurusunda verebileceği TraceId'yi gösterebilir. Ham exception, stack trace, SQL ayrıntısı, token, firma/kişi verisi veya hassas response alanları UI'ya taşınmamalı ya da kullanıcıya yansıtılmamalıdır. Operasyon ekibi de kullanıcıya log exception'ını göndermek yerine güvenli durum mesajı ve gerekiyorsa sonraki adımı paylaşmalıdır.

API yanıt header'ı `X-Trace-Id` olarak verir; web istemcisi 403/404/5xx JSON hatalarında bu değeri hata metnine ekler ve body'de `traceId` yoksa ekler. DevTools'ta body'de gösterilen traceId ile response header'ındaki değer aynı olmalıdır. Header yoksa ya da body JSON değilse, ekranda traceId görünmeyebilir; Network kaydında header'ı kontrol edin.

