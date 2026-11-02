# Çek ve senet hareketlerinin muhasebeleştirilmesi

Payment instrument API hareketleri tenant kapsamlı genel defter fişleriyle aynı `SaveChanges` işlemi içinde kaydedilir. Her fiş dengelidir ve `SourceType=PaymentInstrumentEvent`, `SourceId=<event id>` ile olay günlüğüne bağlanır. Tekrar istekleri mevcut `RequestId`/olay idempotency davranışını kullanır.

## Firma hesap eşleştirmeleri

`GET /api/finance/general-ledger/mappings` ekranı aşağıdaki firma eşleştirmelerini gösterir; hesaplar aynı firmaya ait ve etkin olmalıdır. Tenant yöneticisi mevcut mapping yazma uçlarıyla hesap seçebilir.

- `instrument.receivable-portfolio`: Alacak çek/senet portföy kontrol hesabı.
- `instrument.receivable-offset`: Alınan çek/senedin karşı cari/alacak hesabı.
- `instrument.payable-portfolio`: Borç çek/senet portföy kontrol hesabı.
- `instrument.payable-offset`: Verilen çek/senedin karşı cari/borç hesabı.
- `instrument.endorsement-offset`: Ciro edilen alacak çekinde borç/ciro karşı hesabı.
- Tahsil/ödeme sırasında `financial-account.<financialAccountId>`: Seçilen kasa/banka hesabına bağlı defter hesabı.

Eksik, pasif veya başka firmaya ait eşleştirme muhasebe etkili isteği reddeder. Varsayılan hesap kodu veya otomatik hesap oluşturma yoktur.

## Çek/senet portföyü ekran düzeni

`payment-instruments` yerleşik ekran görünümü kataloğunda firma kapsamlı taslak, güvenli önizleme, yayımlama ve sürüm geçmişi akışını kullanır. Alan sırası, görünürlüğü, etiketi ve bölüm başlığı firma yöneticisi tarafından düzenlenebilir. Sunucu `actions` sütununu görünür ve listenin sonunda sabit tutar; taslak API'si bu işlem sütununun gizlenmesini veya taşınmasını reddeder. Böylece portföy ekranındaki tahsil, ciro, karşılıksız ve iptal işlemleri yerleşim değişiklikleriyle kaybolmaz.

Finance endpoints have dedicated permission resources for budgets, cash-flow forecasts, and payment instruments. The cash-flow forecast aggregates tenant-scoped cash movements, posted sales and purchase invoices, collections/payments and returns, portfolio instruments, and credit-facility schedules. A user granted `erp.finance-cash-flow.read` can therefore infer summarized invoice, instrument, and credit activity; grant it only to roles allowed to see those aggregates. Endpoint tenant filters remain in force, and budget approval and instrument mutations retain their inline TenantAdmin checks.

## Fiş davranışı

- Portföye kayıt: Alacak enstrümanı için Dr alacak portföy / Cr alacak karşı hesabı; borç enstrümanı için Dr borç karşı hesabı / Cr borç portföyü.
- Ciro: Dr ciro karşı hesabı / Cr alacak portföy hesabı.
- Tahsil: Dr kasa/banka / Cr alacak portföy hesabı. Ödeme: Dr borç portföy hesabı / Cr kasa/banka.
- Tahsil edilmiş enstrümanın karşılıksız kaydı, özgün tahsilat fişini aynı satırlarda ters çevirir ve mevcut kasa/banka ters hareketini oluşturur. Ciro edilmiş enstrümanın karşılıksız kaydı özgün ciro fişini ters çevirir. Portföydeki karşılıksız durumunda finansal hareket olmadığı için ek fiş üretilmez.
- Portföy kaydının iptali, özgün portföy fişini ters çevirir. Kaynak fiş eksik veya dengesizse ters işlem güvenli biçimde reddedilir.

Olay tarihi kapalı mali dönemdeyse muhasebe ve hareket kaydı reddedilir. Cari kart adı şu an serbest metin olduğu için karşı hesap fişi, her cari için alt hesap/cari defter ilişkilendirmesi değildir; gerçek cari alt hesapları ayrı bir ilişkilendirme çalışması gerektirir. İş senedi kabulünde oluşturulan portföy fişi de yalnızca bu API olayının muhasebe etkisidir; kaynak satış/alış faturasını otomatik kapattığı anlamına gelmez.
