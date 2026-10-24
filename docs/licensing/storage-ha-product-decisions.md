# Depolama ve HA ürün kararları

**Durum:** Ürün sahibi kararı bekleniyor  
**Kapsam:** Lisans ekranındaki depolama GB değerleri ve Large paketinin HA lisans işareti. Bu not bir kapasite veya HA taahhüdü değildir.

## Depolama

- **Sayım alanı:** Tenant kotasına hangi nesneler girecek? Dosya ekleri/yüklemeleri, sürümler, silinmiş dosyalar, dışa aktarımlar ve tenant SQL verisi için kapsamı; mantıksal kullanılan byte ile fiziksel altyapı byte’ı arasındaki tercihi ve GB/GiB birimini belirleyin.
- **Eşik:** Small/Medium/Large için sunulacak gerçek tenant kotalarını ve sınırda yazma davranışını onaylayın. Mevcut 10 GB ve 100 GB değerlerinin korunup korunmayacağı henüz kararlaştırılmadı.
- **Grace ve overage:** Kotaya yaklaşma/aşma uyarılarını, varsa tolerans miktarı veya süresini, aşımda yeni yükleme/yazma davranışını ve düzeltme süresini belirleyin. Mevcut davranış için grace/overage politikası yoktur.
- **Ürün/operasyon:** Kullanımın kime gösterileceğini, ölçüm gecikmesini, silme sonrası sayacın nasıl güncelleneceğini ve aşımın hangi API işlemlerini durduracağını kararlaştırın.

## Yüksek erişilebilirlik (HA)

- **Topoloji ve kapsam:** HA’nın hangi bileşenleri kapsayacağını (uygulama, veritabanı, dosya deposu, ağ/region), yedeklilik ve otomatik/failover yaklaşımını, tek/çok bölge hedefini ve bakım kapsamını belirleyin.
- **Hizmet hedefleri:** RPO, RTO ve ölçüm penceresiyle erişilebilirlik SLA’sını; planlı bakım, destek saatleri ve istisnaları kararlaştırın.
- **Paket/taahhüt:** Large lisans işaretinin hangi doğrulanmış topoloji ve hizmet hedefi karşılandığında sunulabileceğini, ayrıca yedekleme ile HA’nın sözleşmesel ayrımını onaylayın. Şu an HA deployment özelliği ve SLA uygulanmıyor.

**Sahip:** Ürün sahibi atanmalı. Bu kararlar ve gerekli operasyon kapasitesi onaylanmadan GB sınırı veya HA müşteri taahhüdü olarak sunulmamalı.
