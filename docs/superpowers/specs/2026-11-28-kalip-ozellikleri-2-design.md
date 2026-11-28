# Kalıp özellikleri 2 (tasarım)

Durum: uygulandı, PR'da. Tarih: 2026-11-28. Önceki: `2026-11-28-ozel-alan-satir-tablosu-design.md` (özel alan bloğu, pencere satır tablosu), `2026-11-27-pencere-grup-5b2b-design.md`. Kaynak: Satış-Cari, Stok-Depo, Finans, İK-Üretim yeniden tasarım taslaklarının "Kalıplarda eksik" listeleri.

Kural: yalnız yeniden tasarlanan ekranların gerçekten istediği dört özellik; kalıpsız eski sayfalar ve mevcut kalıplı sayfalar değişmez. Yeni sayfa ayarı eklenmez; eski, var olan ayarlar kalıplı sayfalarda açılır.

## 1. Pencere tablosunda satır eylemi

Pencerenin içindeki veri listesi (`dataTable`, `dialog` yeri) eski `rowActions` ayarını (en çok 6 düğme) kullanır; eylem Liste'deki satır eylemleriyle aynı davranır: `<tablo>.seciliSatir` satır bindirmesi, `visibleWhen` / `disabledWhen` / `disabledReason`; sorgu, kayıt dizisi, pencere, sayfa, bağlantı eylemleri; gerekçe sorusu düğmenin `promptLabel` ayarıyla (Ters kayıt).

**Biçim.** Satır eylemi düğmeleri üst düzeyde `rowActions` yerinde durur (`button`). Liste'de yer zaten vardı; Kayıt kartı ve Serbest gövdede de açılır.

**Sunucu kuralları (`PageTemplateRules`).**
- `rowActions` yeri Kayıt kartında ve Serbest gövdede yalnız `button` alır.
- Kayıt kartı ve Serbest gövdede `rowActions` yerindeki her düğme, pencerenin içindeki bir veri listesinin `rowActions` listesinde olmalı. Hata: `Satır işlemi düğmesi pencerenin içindeki bir veri listesinin 'rowActions' listesinde olmalı: {kimlik}.`
- Tablo adı ve sorguya bağlılık eski şema kurallarıdır.

**ERP.** Değişiklik gerekmedi: pencere içeriği aynı çizicidir; düğme tabloya ait olduğundan sayfada ayrıca çizilmez. Test: `TemplateFeatures2.test.tsx`.

**Studio.** Pencere tablosuna satır eylemi eklenince düğme zaten `rowActions` yerine konuyordu; sunucu artık kabul eder.

## 2. Kayıt kartı: bağımlı seçici, koşullu bölüm, salt okunur alan

Yeni ayar yok; var olan eski ayarların Kayıt kartında geçerli olduğu testle sabitlenir:
- Bağımlı seçici: seçim (`select`/`lookup`) alanında `optionsQuery`; sorgu parametresinin başka alana bağlanması (`{{il.value}}`); kaynak alanda `clearsOnChange`; `optionsWhen`; `disabledWhen` + `disabledReason` (kaynak seçilmeden pasif ve nedeni yazılı).
- Koşullu bölüm: bölümün (`formCard`, kayıt yeri `section`) `visibleWhen` ayarı. Sekme etiketi `Etiket=kimlikler` olduğundan koşul sekmeye değil bölüme konur.
- Salt okunur bölüm: bölümdeki alanlara `disabledWhen` (örn. `1 == 1`) verilir.

Test: `TenantCustomPageSchemaTemplateFeatures2Tests`.

## 3. Belgeden belge

Teklif → sipariş, sipariş → irsaliye, irsaliye → fatura, satınalma siparişi → mal kabul: durum geçişi değil, **yeni belgeyi var olan bir ERP işlemiyle yaratıp açan** eylem. Belge modeli taşır, sayfa ayarı yoktur.

**Model.** `DocumentModelView.Creations` (`code`, `label`, `from` durumlar, `operation` ERP işlem kodu, `target` yaratılan belgenin model kodu). `satis.teklif`: `siparisOlustur` "Siparişe dönüştür", `from: [Accepted]`, işlem `satis.teklif.siparisOlustur` (`POST /api/sales/quotes/{id}/convert-to-order`), hedef `satis.siparis`.

**Belge yanıtı.** `allowedCreations`: şu an yaratılabilenler. Teklifte kabul edilmiş ve siparişi olmayan teklif (`SalesQuoteWorkflow.CanConvertToOrder`) ve kullanıcının `erp.sales-quotes.execute` izni (geçişlerle aynı denetim). Örnek belge (Studio tuvali) aynı kuralla gelir. İş kuralı hataları (onay bekliyor, satırsız…) işlemden Türkçe döner, Belge'nin mesaj şeridinde görünür.

**ERP.** `DocumentBinding`: `creationRoutes` (kod → uç) ve `pageKey` (belgeyi gösteren sistem sayfası). `DocumentTemplate` modelin `creations` ile belgenin `allowedCreations` kesişimini kabuk eylemi (birincil) olarak çizer; tıklanınca işlemi çağırır, yanıttaki `id` ile hedef belgenin sayfasını (`sales-order-document`) `openWorkspacePage` ile açar; kayıtsız değişiklik varsa sorar; önizlemede çalışmaz.

**Sonraki kullanımlar** modele bir `Creations` kaydı ve ERP bağına bir uç ekler (belge modelleri geldikçe).

**Studio.** Belge panelinin Eylemler bölümünde "Belgeden belge" salt görünür çipleri; ayar yoktur.

## 4. Pencere satır tablosu: seçim sütunu, salt okunur sütun, sorgudan doldurma

Pencerenin satır tablosu (`editableGrid`, `dialog` yeri, `list` kipi) eski motorun şu ayarlarını da alır; hesap ve formül dışarıda kalır:
- Seçim sütunu: `kod|Etiket|lookup:<sorgu>:<değer>:<etiket>[:<açıklama>]` (yalnız `required`, `unique`, `readOnly` kuralları), `columnOptionsWhen`, `columnStaticOptions`.
- Salt okunur sütun: `readOnly` kuralı.
- Sorgudan doldurma: `fillQuery` (sayfanın okuma sorgusu), `fillColumns`, `skipWhenZero` (iade satırları fatura satırlarından, mal kabul satırları sipariş satırlarından).

**Sunucu kuralları.** Hâlâ reddedilen: hesaplanan `calc:` sütunu (`Pencerede satır tablosu yalnız metin, sayı, tarih, onay kutusu ve seçim (lookup) sütunlarını alır: {kod}.`), `step:` kuralı, `formulas`, `lookupFills`, `rowNumberColumn`, `lockColumnsWhen`, `totals`, `fixedRowLabel` (`'{ayar}' pencerede satır tablosunda kullanılamaz.`). Seçim ve doldurma sorgularının geçerliliğini eski şema denetler.

**ERP.** Pencere ve sayfa tabloları aynı `gridSpecOf` motorunu kullanır; ek çizim gerekmedi.

**Studio.** Pencere satır tablosu panelinde sütun türü "Seçim (arama)" (sorgu, değer, etiket sütunu), "Salt okunur" onayı ve "Satırları sorgudan doldur" seçicisi (aynı kodlu sütunlar dolar).

## Testler

- Sunucu: `TenantCustomPageSchemaTemplateFeatures2Tests`, `TenantCustomPageSchemaTemplateExtrasTests`, `SalesQuoteDocumentModelTests`.
- ERP: `TemplateFeatures2.test.tsx`, `DocumentTemplateQuote.test.tsx`.
- Studio: `extrasModel.test.ts`.
