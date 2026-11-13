# Satış ve Satınalma Belge Ekranları — Ortak Tasarım

Tarih: 2026-11-13 · Durum: kullanıcı tarafından onaylandı (ikinci taslak)

## Amaç ve neden

Satış ve satınalmadaki altı belge (talep, teklif, sipariş, irsaliye, fatura, iade) aynı
yapıda ve aynı tasarımda çalışmalı. Bir belgeyi kullanmayı öğrenen kişi diğer on birini de
kullanabilmeli. Kullanıcı tasarımı "ERP sistemlerine göre sıfırdan" yapmamızı ve kullanıcı
deneyimini üst düzeye çıkarmamızı istedi.

## Bugünkü durum

- Tüm ekranlar `frontend/erp-web/src/App.tsx` içinde (441 KB, `SalesPage`, `PurchasingPanel`,
  `SalesOrderModal`, `SalesInvoiceModal`, `PurchaseInvoiceModal`).
- 12 belgeden yalnızca 5'inin liste sayfası var: satış teklifi, satış siparişi, satış faturası,
  satınalma talebi, satınalma siparişi. Diğerleri başka belgenin açılır penceresine gömülü.
- Menü tek: "Satış & Satın Alma" (Talepler, Teklifler, Siparişler, Faturalar, Satın Alma).
  "Talepler" aslında satınalma talebi.
- Sunucu: satış iadesi ve alış iadesi için liste/detay servisi yok; tedarikçi teklifi yalnızca
  talep altında listeleniyor; mal kabulün detay servisi yok; satış talebi hiç yok.
- Belge üretimi zincirlidir: sipariş ← teklif, irsaliye ← sipariş, fatura ← irsaliye,
  iade ← fatura (satınalmada: teklif ← talep, mal kabul ← sipariş, fatura ← mal kabul,
  iade ← fatura). Güncelleme/silme servisi yok.

## Hedefler

1. 12 belgenin hepsi aynı iki ekranla çalışır: **liste ekranı** ve **belge ekranı**.
2. Menü ikiye ayrılır: **Satış** ve **Satınalma**; her birinde aynı altı madde aynı sırayla:
   Talepler, Teklifler, Siparişler, İrsaliyeler, Faturalar, İadeler.
3. Bugün pencerelerde yapılabilen her işlem yeni ekranlarda da yapılabilir (özel alanlar,
   rezervasyon, tahsilat/ödeme, iade, iptal, maliyet dağıtımı, tedarikçi teklifi karşılaştırma).

## Kapsam dışı

- İş kurallarını değiştirmek (zincir, stok ve cari hareketleri aynı kalır).
- Sipariş iptali, kayıtlı belgeyi düzenleme, yazdırma (sunucuda yok; ayrı iş).
- Kayıtlı görünümleri/sütunları/taslakları sunucuda saklamak (tarayıcıda tutulur).

## Kaçınılacaklar

- Mevcut bir işlemin yeni ekranda kaybolması.
- Belgeden belgeye değişen sütun sırası, düğme yeri veya adlandırma.
- Görünümü mevcut Nexora temasından (mor vurgu, DM Sans/Manrope) koparmak.

## Yaklaşımlar

1. **Yalnızca görsel birleştirme** — mevcut sayfa ve pencereleri aynı CSS'e çekmek. Hızlı, ama
   irsaliye/iade gibi belgeler yine pencerelere gömülü kalır; "aynı yapı" sağlanmaz.
2. **Tanım tabanlı ortak ekranlar (seçilen)** — her belge bir tanım kaydıdır (servis yolu,
   sütunlar, durumlar, sonraki adım); liste ve belge ekranı tek kez yazılır, belgeye özgü
   bölümler sekme olarak takılır. Tutarlılık yapıdan gelir, yeni belge eklemek ucuzdur.
3. **Belge modelini sunucuda da tekleştirmek** — tek "belge" tablosu/servisi. En temizi, ama
   canlı verinin taşınmasını gerektirir; risk/fayda oranı kötü.

Kullanıcı tasarım kararını bize bıraktı; 2. yaklaşım seçildi.

## Tasarım

### Liste ekranı (hepsinde aynı)

- Başlık (üstte modül adı), sağda `Excel`, `Sütunlar`, `Yeni <belge>` (kısayol `N`).
- Sekmeler, adetleriyle: Tümü + durumlar + varsa işe dönük sekme
  (sipariş: "Teslimi geciken"; alış faturası: "Vadesi geçen"; alış siparişi: "Teslimi geciken").
- Arama (`/`), tarih aralığı, filtre; "Kayıtlı görünümler".
- Sütun sırası sabit: Belge no · Tarih · Cari · Kaynak belge · (belgeye özgü) · Tutar · Durum.
- Altta kayıt sayısı, filtrelenmiş toplam tutar (para birimi başına), sayfalama.
- Satıra tıklayınca sağda **önizleme paneli**: özet, satırlar, ilerleme, ana işlem düğmesi, "Aç".
- Klavye: `↑/↓` gezinme, `Enter` aç, `Esc` önizlemeyi kapat.
- Boş durum: belgeyi anlatan tek cümle + "Yeni" düğmesi.

### Belge ekranı (tam sayfa, hepsinde aynı)

- Üst çubuk (sabit): geri, belge adı + no, durum, ikincil işlemler (`…`), tek ana işlem
  (bir sonraki belgeyi üretir veya durumu ilerletir).
- **Belge akışı şeridi:** Talep → Teklif → Sipariş → İrsaliye → Fatura → İade; bağlı belge
  numaraları tıklanabilir, kısmi durumlar "1 / 2" olarak görünür.
- **Sıradaki adım şeridi:** belgenin neyi beklediğini yazar, işlemi tek tıkla başlatır.
- Başlık alanları (cari, tarihler, depo, para birimi, açıklama) + yanda **cari durumu kartı**
  (bakiye, risk limiti, limit doluluk uyarısı).
- Sekmeler: Satırlar · Özel alanlar · İlgili belgeler (irsaliye, tahsilat/ödeme, iade…) · Geçmiş.
- Satır tablosu: # · Stok · Miktar · Birim · Birim fiyat · İsk % · KDV % · Tutar; satır altında
  stok durumu (eldeki, eksik).
- Yeni belgede hızlı giriş: stok kodu/adıyla arama, `Enter` yeni satır, `Tab` sonraki alan;
  taslak tarayıcıda saklanır, kayıt sonrası silinir.
- Altta sabit toplam satırı: ara toplam, iskonto, KDV, genel toplam.
- Kaynak belgeden üretilen belgelerde "Yeni": önce kaynak belge seçilir, sonra aynı ekran
  dolu açılır.

### Kod yapısı

- Yeni klasör `frontend/erp-web/src/documents/`:
  belge tanımları, ortak liste ekranı, ortak belge ekranı, akış şeridi, ortak yardımcılar,
  tek CSS dosyası. `api`/`loadAllPages` gibi yardımcılar `App.tsx`'ten ortak bir modüle taşınır.
- Belgeye özgü bölümler (rezervasyon, tahsilat, iade, maliyet dağıtımı, teklif karşılaştırma,
  özel alan kataloğu) mevcut pencerelerden ayrı bileşenlere çıkarılır ve sekme olarak takılır.
- `SalesPage`, `PurchasingPanel` ve üç pencere bileşeni taşıma bitince silinir.

## Aşamalar

1. **Ortak ekranlar + menü + hazır 7 belge:** satış teklifi, siparişi, irsaliyesi, faturası;
   satınalma talebi, siparişi, faturası. Veritabanı ve sunucu değişmez. Listeler bugünkü gibi
   tüm sayfaları yükler; arama, sekme adetleri, toplam ve Excel tarayıcıda hesaplanır.
   Henüz hazır olmayan belgeler menüde görünmez.
2. **Eksik servisler + 4 belge:** satış iadesi, alış iadesi (liste + detay), tedarikçi teklifi
   (liste), mal kabul (detay); ekranları açılır. Veritabanı değişmez.
3. **Satış talebi:** yeni varlık, Platform + Tenant göçü, servisler, yetki kaynağı, ekran,
   "talepten teklif" bağlantısı. Canlı veritabanını etkileyen tek aşama; `docs/release-migrations.md`
   kurallarına (önce genişlet) uyar.

Her aşama ayrı planlanır ve kendi başına çalışır durumda biter.

## Uygulayıcıya bırakılanlar (bizim kararlarımız, kullanıcı onayı değil)

- Belge ekranı adresi: tarayıcı geri tuşu çalışsın diye `location.hash` ile eşlenir.
- Tarayıcı saklama anahtarları firma + kullanıcı + belge türü bazında ayrılır.
- Excel aktarımı CSV (UTF-8 BOM, `;` ayraç) olarak üretilir; ek bağımlılık yok.
- Dar ekranda önizleme paneli listenin altına iner.
- Doğrulama: `npm run build` (tsc) + saf mantık için birim testleri + uygulamada elle deneme.
