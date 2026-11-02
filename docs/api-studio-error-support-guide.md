# API ve Studio hata destek rehberi

Bu belge ERP Web ve Development Studio hataları için kullanıcıdan güvenli bilgi toplama ve ilgili sunucu kaydını bulma adımlarını tek yerde toplar. Kullanıcıdan hatayı bir kez yeniden oluşturmasını, yerel tarih/saat ile saat dilimini not etmesini ve tarayıcı Network kaydında ilgili isteğin **tam URL'sini, method'unu, status kodunu, `X-Trace-Id` response header'ını** kaydetmesini isteyin. Başlık yoksa `yok` yazın; trace değeri üretmeyin. URL'yi yalnız erişimi kısıtlı destek kanalına verin; paylaşılacak kopyada tenant/firma, kullanıcı, proje, belge ve diğer gerçek kayıt kimliklerini path/query içinde `[REDACTED]` ile değiştirin.

## Status ve body'den alınacaklar

| Status | Güvenli body alanı | İlk yorum |
|---|---|---|
| 401 | API: genel `error`; Studio: genel `title`, `status`, `traceId` | Oturum/kimlik doğrulama. API istemcisi otomatik token yenileme deneyebilir; son başarısız isteği kaydedin. |
| 403 | Varsa genel `error` veya `title`; trace body'de varsa `traceId` | İstek uygulamaya ulaşmış olabilir, erişim reddi olabilir. |
| 404 | Varsa genel `error` veya `title`; trace body'de varsa `traceId` | Yanlış yol/kaynak veya gizlenen yetkisiz kaynak olabilir. |
| 500 | API: genel `error`; Studio: genel `title`, `status`, `traceId` | Sunucu hatası; ayrıntı için trace'i servis logunda arayın. |

Body'den yalnız bu genel alanları ve body'deki `traceId` değerini alın. Ham body'yi, `detail`, `errors`, validation içeriğini veya kayıt/veri taşıyan diğer alanları kopyalamayın. Header ve body trace değerleri varsa uyuşup uyuşmadığını not edin. Örnek:

```text
Host: studio.example.com
URL: https://studio.example.com/studio/projects/[REDACTED]/...
Method: POST
Status: 500
Time: 2026-10-26T14:32:10+03:00
X-Trace-Id: 0123456789abcdef0123456789abcdef
Body: title=Sunucu hatası.; status=500; traceId=0123456789abcdef0123456789abcdef
```

## Doğru log ve host eşleştirmesi

- **API:** Tarayıcıdaki `/api/...` isteği Platform API'ye gider (`platform-api`, genellikle ERP Web Nginx proxy'si üzerinden). `X-Trace-Id`, `HttpContext.TraceIdentifier` değeridir. API 500 için Platform API uygulama logunda trace ile `Unhandled API exception` kaydını arayın.
- **Studio:** Tarayıcıdaki `/studio/...` isteği AI Service'e gider (`ai-service`; Studio Nginx veya ERP Web Nginx proxy'si üzerinden). Studio trace'i AI Service middleware'inin ürettiği ayrı GUID'dir; API trace'iyle aynı korelasyon alanı değildir. 500 için AI Service logunda trace ile `Unhandled Studio API error` kaydını arayın.
- Proxy host farkı önemlidir: Studio sayfasının servis edildiği host, API çağrısının gittiği upstream değildir. Yerel Compose'ta Development Studio kendi Nginx host/portunu (5174) kullanır; ayrıca ERP Web host'u da `/studio/` yolunu AI Service'e proxy eder. URL'nin host ve path bilgisini kaydedip önce ilgili erişim logundan upstream'i doğrulayın; `/api` için Platform API, `/studio` için AI Service loglarını inceleyin.
- 401/403/404 her zaman exception veya uygulama log satırı üretmez. İlgili servis logları ve varsa auth/yetkilendirme loglarında trace, method, path, status ve dar zaman aralığıyla arayın; ardından doğru Nginx/ingress erişim logunda upstream status'u kontrol edin. API `TraceId` ve Studio `TraceId` alan adları/formatları farklı olabilir. Trace bulunmazsa saat dilimi farkını hesaba katarak zaman/path eşleştirmesi yapın; bunu kesin kök neden olarak sunmayın.
- Proxy'nin kendisinin ürettiği yanıt uygulama middleware'ine uğramayabilir; bu durumda header/body trace'i olmayabilir ve servis uygulama logunda kayıt bulunmayabilir. Proxy erişim logu ve upstream durumuyla inceleyin.

## Kesinlikle paylaşmayın

`Authorization`, bearer/access/refresh token, cookie/`Set-Cookie`, `X-Studio-Session`, API key, parola, oturum/secret; request body/form/dosya; ham response body, HAR, “Copy as cURL”, temizlenmemiş ekran görüntüsü; SQL/stack trace/exception; firma/tenant, kullanıcı/çalışan, müşteri/tedarikçi, proje ve belge kimlikleri ile ticari veya kişisel veriler. HAR veya görüntü güvenle temizlenemiyorsa göndermeyin; gerekli alanları elle yazın. İç loglardaki exception ayrıntısını yalnız yetkili operasyon ekibi incelesin ve kullanıcıya iletmesin.

## Operasyon için yerel trace lookup

Yetkili operasyon kullanıcısı, repo kökünden aşağıdaki salt-okunur PowerShell aracını kullanabilir. Araç `nexora-remote` Docker context'ini seçer ve log sorgusundan önce context'in adını ve SSH endpoint'ini tam olarak `ssh://Administrator@212.18.121.24` ile karşılaştırır; uyuşmazsa durur. Compose proje adını `nexora-remote` olarak sabitler ve yalnız `platform-api` ile `ai-service` servislerinin son 24 saatindeki (en fazla 5000) loglarını sorgular. Trace ID 8–128 karakterli alfasayısal/dot/underscore/colon/dash değeri olmalıdır. Daha dar bir zaman penceresi `Since` ile verilebilir.

```powershell
.\scripts\Get-NexoraTraceLogs.ps1 -TraceId '0123456789abcdef0123456789abcdef'
.\scripts\Get-NexoraTraceLogs.ps1 -TraceId 'SYNTHETIC_TRACE_ID_001' -Since 2h
```

Çıktı yalnız yerel terminale yazılır ve her eşleşme için yalnız servis adı, timestamp, eşleşen traceId ve sabit `[REDACTED]` işaretini içerir; ham log mesajı veya payload hiçbir durumda yazdırılmaz. Tanınmayan satır biçimleri atlanır. Hata, endpoint/context uyuşmazlığı veya Compose dosyası durumunda araç durur; Docker'ın varsayılan context'ine geri dönmez. Aracın çalıştırılması için Docker yetkisi olan ve log erişimi onaylı bir operatör gerekir.

Eski API'ye özgü ayrıntılar için [API hata korelasyonu rehberi](api-error-trace-id-operator-guide-20261026.md) korunmaktadır; API ve Studio için birincil destek talimatı bu birleşik belgedir.
