# Tam sayfa belge yüzeyi (document-page)

Satış ve satınalma belgelerinin (talep, teklif, sipariş, irsaliye / mal kabul, fatura, iade)
detay ekranlarının ortak yapısı. Liste sayfaları için `list-page/README.md`, kayıt formları
için `record-form/README.md` geçerlidir; bu klasör yalnızca kayıtlı bir belgenin detayını kapsar.

## Bölümler

1. **Başlık çubuğu** – geri düğmesi, belge türü ve numarası, altında cari adı gibi kısa bilgi,
   durum etiketi, sağda işlemler. Kaydırırken uygulamanın üst çubuklarının altında sabit kalır.
2. **Gövde** – belgenin sekmeleri, üst bilgileri, satırları, toplamları ve alt işlemleri.

## Kurallar

- **Detay pencere değil, sayfadır.** `DocumentSurface`, içinde bulunduğu çalışma alanı
  görünümünün (`.workspace-view`) tek görünen içeriği olur. Liste gizlenir ama bellekte kalır;
  geri dönünce filtreleri, seçimi ve kaydırma konumu korunur.
- **Üst üste açılan belgeler yığılır.** Siparişten faturaya geçildiğinde fatura görünür,
  geri düğmesi siparişe döner.
- **Başlık metinleri tek tiptir.** `title` belge türünün tekil adıdır ("Satış teklifi",
  "Alış faturası"); numara `code`, cari adı `subtitle` ile verilir. "… Detay", "… DETAYI" gibi
  ekler ve büyük harfli üst başlıklar kullanılmaz.
- **Durum adları `documentStatus.ts` içinden gelir.** Aynı durum her ekranda aynı adla ve aynı
  tonla görünür; ekran içinde durum adı yazılmaz.
- **Yalnızca kayıtlı belge.** Yeni kayıt ve düzenleme `RecordFormPage` ile yapılır. Belgenin
  içinden açılan kısa formlar (irsaliye oluşturma, tahsilat) `variant="dialog"` ile gövdede kalır.
- **Davranış değişmez.** API çağrıları, yetki kontrolleri ve kayıtlı ekran ayarları korunur.
- **Yeni metinlerin İngilizce karşılığı** `locales/en/document-page.ts` sözlüğüne eklenir.

## Örnek

```tsx
{detail && (
  <DocumentSurface
    title="Satış teklifi"
    code={detail.code}
    subtitle={detail.customerName}
    status={salesQuoteStatus(detail.status)}
    onClose={() => setDetail(null)}
  >
    …sekmeler, üst bilgiler, satırlar…
  </DocumentSurface>
)}
```

## Pencereden taşınan ekranlar

Bu yapıya taşınan ekranların gövdesi, iç stilleri bozulmasın diye eski pencere sınıflarını
`bodyClassName` ile korur ("modal ledger-modal …"); arka plan sınıfına bağlı stiller için
`className` kullanılır. Pencereye özgü ölçü, gölge ve iç kaydırma `document-page.css` içinde
kaldırılır. Yeni yazılan belge ekranlarında bu iki özellik gerekmez.
