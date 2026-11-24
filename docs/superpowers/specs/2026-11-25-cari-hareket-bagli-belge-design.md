# Cari Hesap Hareketleri: bağlı belgeye git — tasarım

Taslak: `docs/design-proposals/erp-design-language/28-cari-hareket-bagli-belge.html`

## Amaç

Cari Hesap Hareketleri (`customer-ledger`) ekranında her hareket satırından, hareketi oluşturan belgeye tek tıkla gidilebilsin.
Yedi kaynak türünün hepsi kapsanır (kullanıcı kararı, 2026-11-25).

## Hedefler / hedef dışı

- Hedef: eski ekran (bugün varsayılan) ve sistem sayfası (`customer-ledger.json`, önizleme) birlikte.
- Hedef: belge kendi ekranında, yeni sekmede açılır; ekstre kalır.
- Hedef dışı: cari kart hareket penceresi (`CustomersPage`, `/ledger` ucu); belge ekranlarının sistem sayfalarına kimlikle açma;
  ekstrede belge işlemi (iptal vb.).
- Anti-hedef: yanlış belgeye gitmek; ters kayıt satırının bağlantısız kalması; mevcut ekstre alanlarının değişmesi.

## Yaklaşımlar

- **A (seçildi):** Her hedef ekran belgeyi sayfa parametresiyle açar (satış faturasındaki "Karar 4" kuralı). Bir tık, belge
  kendi ekranında işlem yapılabilir hâlde; dört eski ekrana küçük ekleme.
- B: Ekstrede salt okunur belge özeti penceresi. Her tür için ayrı pencere, işlem yapılamaz.
- C: Belge numarasıyla listede arama. Ucuz ama belgeyi açmaz, belirsiz eşleşme.

## Tasarım

**Sunucu (`/api/customers/{id}/statement`, `cari.ekstre`).** `CustomerStatementLine`'a kurucu dışı üyeler (yalnız ekleme):
`SourceType` (`SalesInvoice | CustomerCollection | SalesReturn | PurchaseInvoice | PurchaseInvoiceDraft | SupplierPayment |
SupplierReturn | null`), `SourceId`, `SourceCode` (belge numarası), `OpenId` (açılacak kayıt: tahsilatta tahsilatın
faturası, tedarikçi ödemesinde ödemenin alış faturası, diğerlerinde `SourceId`). Ters kayıtta kaynak özgün hareketten
alınır (belge iptali ters kaydına kaynak FK kopyalanmıyor). Tahsilatın faturası `CustomerCollectionAllocations` üzerinden
(tek faturaya bağlı; birden çoksa ilk dağıtım). `cari.ekstre` sütunlarına `Append` + yeni `Label()` kodları; fixture ve
isim kayıtları güncellenir.

**Hedef ekranlar (eski, parametre bir kez okunur ve silinir).**
`sales-invoices`: `invoiceId` (var) + yeni `tab=transactions`; `sales-returns`: `returnId`; `sales-purchase-invoices`:
`invoiceId` (+ `tab` ödemeler); `sales-purchase-invoice-drafts`: `draftId`; `sales-purchase-returns`: `returnId`.

**Eski ekran (`CustomerLedgerPage.tsx`).** Yeni "Belge" sütunu (tür etiketi + tıklanabilir numara) ve satır sonu
"Belgeye git ›" düğmesi; `openWorkspacePage` ile yeni sekme. Kaynaksız satırda "—" ve pasif düğme, ipucu "Elle girilen
hareket; bağlı belge yok". Görünüm anahtarı `customer-ledger-entries`'e `source` alanı.

**Sistem sayfası.** `liste`'ye `sourceType` (valueLabels ile Türkçe) ve `sourceCode` sütunları; türe göre beş `erpPage`
düğmesi (`legacyScreen: true`, `target: newTab`, `visibleWhen` satırın `sourceType`'ına göre) `rowActions` olarak. Standart
sürüm 2, yeni öğeler `since: 2`; `SystemPageStandards.versions.txt` güncellenir.

**Yetki.** Ekstre belge yetkisini denetlemez; hedef ekran bugünkü yetki/404 davranışını gösterir.

## Yapanın kararına kalanlar

- Sistem sayfasında satır eylemlerinin `visibleWhen`'i satır başına değerlendirmiyorsa: tek satır seçimiyle çalışan
  araç çubuğu düğmeleri ya da küçük bir motor eki (en küçük değişiklik seçilir, PR'da belirtilir).
- Sekme parametresinin adı ve değerleri.
- Testler: ekstre kaynak alanları (tür, ters kayıt, tahsilat→fatura) için entegrasyon testi; eski ekran düğmesi ve hedef
  ekranların parametre okuması için ön yüz testleri.
