# Depolama ve HA ürün kararları

**Durum:** Depolama ölçümü ve aşım davranışı için kullanıcı kararı uygulandı (2026-10-25); paket eşikleri ve HA taahhütleri için ürün sahibi kararı bekleniyor.
**Kapsam:** Lisans ekranındaki depolama GB değerleri ve Large paketinin HA lisans işareti. Bu not bir kapasite veya HA taahhüdü değildir.

## Depolama

- **Sayım alanı — kararlaştırıldı:** Firma başına ayrılmış SQL veritabanındaki SQL `ROWS` data page kullanımı lisans kotasına girer. Transaction logları ve dış dosya deposu dahil değildir.
- **Aşım davranışı — kararlaştırıldı:** Kullanım lisans sınırına ulaştığında okumalar sürer; tahsisi artıran mutasyonlar reddedilir, tahsisi artırmayan mutasyonlar kabul edilebilir. Silmeler genel olarak muaf değildir; silme ve audit kaydı data page tahsisini artırabilir. Ölçüm doğrulanamazsa yazma fail-closed reddedilir. Eşzamanlı yazı ve lisans değişimi aynı tenant SQL application lock ile sıraya alınır.
- **Paket eşikleri — ratifikasyon bekliyor:** Kod profili Small 10 GB, Medium 100 GB ve Large için `int.MaxValue` GB kullanır. Ürün sahibi bu değerleri satış/kontrat taahhüdü olarak sunmadan önce onaylamalıdır. Kota sınırı uygulamada hesaplanır; ticari paket taahhüdü ayrıca ratifiye edilmelidir.
- **Operasyon notu:** SQL data page tahsisi, dosya boyutu veya transaction-log tüketimi ile aynı ölçü değildir; silme data page tahsisini hemen düşürmeyebilir. Firma ayarlarında kullanım ve eşik görünür. Dosya depolama eklenirse kapsam ayrıca kararlaştırılmalıdır.

## Yüksek erişilebilirlik (HA)

- **Topoloji ve kapsam:** HA’nın hangi bileşenleri kapsayacağını (uygulama, veritabanı, dosya deposu, ağ/region), yedeklilik ve otomatik/failover yaklaşımını, tek/çok bölge hedefini ve bakım kapsamını belirleyin.
- **Hizmet hedefleri:** RPO, RTO ve ölçüm penceresiyle erişilebilirlik SLA’sını; planlı bakım, destek saatleri ve istisnaları kararlaştırın.
- **Paket/taahhüt:** Large lisans işaretinin hangi doğrulanmış topoloji ve hizmet hedefi karşılandığında sunulabileceğini, ayrıca yedekleme ile HA’nın sözleşmesel ayrımını onaylayın. Şu an HA deployment özelliği ve SLA uygulanmıyor; lisans işareti operasyonel HA sağlamaz.

**Sahip:** Ürün sahibi atanmalı. Depolama ölçümü ve aşım davranışı uygulanmıştır. Paket eşikleri ticari taahhüt olarak ve HA lisans işareti gerçek hizmet olarak sunulmadan önce ayrıca onaylanmalı.
