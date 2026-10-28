# API ve Studio incident/ticket şablonu

Aşağıdaki alanları doldurun. Bilinmeyen alanlara `Bilinmiyor` yazın. URL'de path kullanın; path içindeki gerçek kayıt kimliklerini `[REDACTED]` ile değiştirin.

```text
Özet:
Zaman (yerel tarih/saat ve saat dilimi):
Uygulama/ekran:
Tenant ID (yalnız hash veya kısmi maskeli):
Request URL path:
HTTP method:
HTTP status:
Trace ID (X-Trace-Id; yoksa "yok"):
Redacted response (yalnız genel error/title/status/traceId alanları):
Tekrar üretme adımları:
Etki (kimler veya hangi işlem etkileniyor, başlangıç zamanı):
Remote service health (servis, durum, gözlem zamanı/kaynağı):
Ek not (güvenle temizlenmiş ekran görüntüsü gerekiyorsa):
```

**Bu ticket'a kesinlikle eklemeyin:** `Authorization` başlığı, token, cookie/`Set-Cookie`, API key, parola, secret, oturum bilgisi; request body/form/dosya; ham response body, HAR veya “Copy as cURL”; SQL/stack trace/exception; kişisel ERP verisi ya da gerçek tenant, kullanıcı, çalışan, müşteri, tedarikçi, proje veya belge kimlikleri. Ekran görüntüsünde bu bilgiler varsa paylaşmayın; alanları elle ve maskeli olarak yazın.

