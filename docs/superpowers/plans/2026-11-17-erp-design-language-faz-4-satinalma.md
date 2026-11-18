# ERP Tasarım Dili — Faz 4: Satınalma Modülü Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satınalma'nın 10 ekranı onaylı taslaklar gibi görünsün: listeler Satış listeleriyle aynı liste tipinde, belgeler taslak 02 belge tipinde (Satış'ta uygulanan ortak belge takımıyla), oluşturma ekranları Satış oluşturma ekranlarıyla aynı başlık/toplamlarla. Ticari sözleşmeler kapsam dışı.

**Architecture:** Satış'ta (Faz 3) kurulan takımlar yeniden kullanılır: `src/list-page/` (ListPageHeader, ListSummaryCards, StatusTag, ListFooter, BulkActionBar), `AdvancedDataGrid` (`selectable`, `bulkActions`, `onCurrentRowChange`, `currentRowKey`), `src/document-page/` (DocumentSurface `detail`/`create`, DocumentStatusFlow, DocumentTotals, bağlam paneli), `src/record-form/` (`document` başlığı), Satış'ın liste yardımcıları (`src/sales/SalesListDetailPanel`, `SalesListPanels`, `SalesListFooter`, `salesListStatus.ts`, `SalesDocumentGrid` çift tıkla açma) ve komut katmanı (`usePageCommands`, `PageCommandsSlot`, `documentOpenCommands`). Satınalma İadeleri zaten bu düzende (`document-returns/`, side="purchase"). Satınalma ekranlarının çoğu `SalesPage.tsx` içindedir: `PurchaseInvoicesScreen` (~3746), `PurchaseOrderCreatePage` (~4179), `PurchasingPanel` (~4722–10029; talepler + siparişler). Menü sırası `workspace-navigation.ts` `purchasingNavigationPages`, yönlendirme `WorkspacePageRouter.tsx`.

**Tech Stack:** React + Vite + TS, düz CSS + `--nx-*`, Vitest + RTL, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-11-16-erp-design-language-design.md` · Taslaklar: `docs/design-proposals/erp-design-language/07-satinalma-modulu.html` (Satınalma eşlemesi + Satınalma Faturaları listesi, kullanıcı onayı 2026-11-17), `02-belge-satis-faturasi.html` (belge), `06-satis-modulu.html` (Satış liste dili), `01-liste-ve-kayit-stok.html` · Önceki plan: `docs/superpowers/plans/2026-11-17-erp-design-language-faz-3-satis.md` · Kit README'leri `frontend/erp-web/src/{list-page,record-form,action-bar,document-page,definition-layout}/README.md` · `docs/superpowers/notes/2026-11-17-erp-design-language-ertelenenler.md`.

## Global Constraints

- Taslaklar bağlayıcı; kartlar tek katman, kart yarıçapı 8px, kontrol 6px; sayılar `tabular-nums` sağa, normal ağırlık; başlık üstte + İşlem Çubuğu altta; kutu içinde kutu yok.
- Tüm renkler `--nx-*`; `src/design/*.test.ts` geçmeli.
- Davranış değişmez: API çağrıları, yetkiler (TenantAdmin kontrolleri, karar yetkisi), doğrulamalar, iptal/ters kayıt sırası (ödemesi olan fatura iptal edilemez vb.), tenant ekran düzenleri, mevcut komut bağlantıları ve testler.
- Yalnız mevcut veri: özet kartları ve paneller bugünkü uç noktalardan; sayfa kapsamlı rakam "bu sayfa" yazar; farklı para birimleri toplanmaz; uç noktada durum filtresi yoksa durum çipi yok.
- Satış'la aynı etkileşim: listede tek tık satırı seçer (sağ panel), çift tık / Enter / Aç / numara bağlantısı belgeyi açar; onay kutusu hücresine çift tık açmaz. Belge açıkken Excel/Filtre/Yenile belgeye bakar (gizli liste kuralı).
- Belge başlığındaki iş akışı düğmeleri İşlemler menüsüne (Alt+İ) taşınır; koşullar ve devre dışı nedenleri aynı. İşlenmiş / kabul edilmiş belge silinmez: Sil soluk + nedeni.
- Oluşturma ekranında kaydetmeden önce durum yoksa durum akışında geçerli adım yok (Satış kuralı).
- Yeni Türkçe metin → `src/locales/en/` karşılığı (tam anahtar ya da kalıp).
- Görsel doğrulama: depo dışı sahte API betiğiyle ekran görüntüsü, taslakla yan yana.

## Review Focus

1. **Belge durumuna göre komutlar:** işlenmiş / iptal fatura, kabul edilmiş / iptal mal kabul, onaylı / reddedilmiş / siparişe dönüşmüş talep, alınmış / iptal sipariş için Sil, İptal, Ödeme ekle, İade oluştur, Onayla/Reddet, Siparişe dönüştür, Mal kabul ekle, Faturala komutlarının etkin/soluk durumu ve nedenleri bugünkü koşullarla aynı.
2. **Eski `actions` yuvası:** Satınalma'daki tüm kullanıcılar İşlemler'e taşınınca yuva kaldırılır; hiçbir düğme kaybolmaz.
3. **Gizli liste hedefi** ve **klavye** (F2, Ctrl+S, Esc, Enter, Alt+İ, Ctrl+Shift+Enter satır ekle).
4. **Veri dürüstlüğü:** ödeme durumu etiketleri (İşlendi / Kısmen ödendi / Ödendi / Vadesi geçti / İptal) yalnız `paidAmount` / `outstandingAmount` / `dueDate` alanlarından; sipariş "Teslim alınan" sütunu bugünkü veri kaynağıyla.
5. **Dar ekran:** 1280 altında sağ panel kapalı, 390'da taşma yok.

---

### Task 1: Satınalma Faturaları (liste + belge)
**Files:** `SalesPage.tsx` `PurchaseInvoicesScreen`, `PurchaseInvoiceModal.tsx`, gerekirse `src/purchasing/*` (yeni yardımcılar), `purchase-list-v2.css`; Test `src/purchasing/purchaseInvoices.test.tsx`
- [ ] Liste taslak 07'deki gibi: ListPageHeader + çubuk, 4 özet kartı (fatura toplamı, ödenmemiş, vadesi geçen, iptal — "bu sayfa", para birimi karışıksa toplam yok), tedarikçi filtresi kalır (durum çipi yok), `selectable` + Excel (seçilenler), sütunlar: Fatura no, Tarih, Tedarikçi, Mal kabul, Vade (geçmişse "N gün geçti" kırmızı), Genel toplam, Ödenen, Kalan, Durum (StatusTag: İşlendi info, Kısmen ödendi warn, Ödendi ok, Vadesi geçti bad, İptal off); sağ detay paneli (Özet: Genel toplam, Kalan, Ödenen, Vade; belge zinciri sipariş → mal kabul → fatura liste kodlarından; satırlar detaydan); ListFooter.
- [ ] Tek tık seçer, çift tık / Enter / Aç açar (bugün tek tık açıyor — davranış değişikliği notu). "Fatura ekle" açılır menüsü Yeni (F2) düğmesinin menüsü: Mal kabulünden fatura · Mal kabulsüz fatura.
- [ ] Belge (PurchaseInvoiceModal): DocumentSurface detail + durum akışı (İşlendi, İptal), DetailTiles korunur (Toplam, Ödenen, Kalan, Vade), bağlam paneli (belge zinciri, tedarikçi), toplamlar; İade oluştur / Ödeme ekle / Faturayı iptal et → İşlemler (aynı koşullar ve nedenler: ödeme varsa iptal soluk); belge açıkken çubukta komutlar (ertelenen not "PurchaseInvoiceModal" maddesi kapanır).
- [ ] Testler + görüntüler → commit.

### Task 2: Satınalma Talepleri ve Teklifleri
**Files:** `SalesPage.tsx` `PurchasingPanel` mode="requests" (liste + detay ~9014), `PurchaseSupplierQuotesPage.tsx`, `purchase-supplier-quotes/*`; Test `src/purchasing/purchaseRequests.test.tsx`
- [ ] Talepler listesi: liste tipi, mevcut durum çipleri (sunucu filtresi var) korunur, özet kartları yalnız mevcut veriden (durum sayıları), `selectable`, StatusTag (Onay bekliyor warn, Onaylandı info, Siparişe dönüştü ok, Reddedildi off), sağ panel (özet, satır sayısı, sipariş bağlantısı), ListFooter; satır ⋯ menüsündeki İncele/Onayla/Reddet/Teklif ekle/Siparişe dönüştür/Siparişi aç İşlemler'de de (aynı koşullar).
- [ ] Talep belgesi: DocumentSurface detail + akış (Onay bekliyor → Onaylandı → Siparişe dönüştü; Reddedildi yan dal), başlık alanları, satırlar; tedarikçi teklifleri bölümü kart olarak (mevcut "Bu teklifle sipariş" ve teklif kaydetme formu aynen), karar paneli korunur; başlık düğmeleri İşlemler'e.
- [ ] Teklifler listesi: liste tipi, durum çipleri (sunucu filtresi var), StatusTag (Değerlendirmede warn, Seçildi ok, Seçilmedi off), sağ panel; salt okunur — Aç talebe gider. Kullanılmayan `SupplierQuotesSummary.tsx` dokunulmaz.
- [ ] Testler + görüntüler → commit.

### Task 3: Satınalma Siparişleri
**Files:** `SalesPage.tsx` `PurchasingPanel` mode="purchasing" (liste + aside + detay ~8292); Test `src/purchasing/purchaseOrders.test.tsx`
- [ ] Liste: liste tipi, mevcut istemci tarafı çipler (Açık, Kısmen alındı, Tam alındı, Gecikmiş) korunur, özet kartları "bu sayfa", `selectable`, StatusTag (Onay bekliyor warn, Açık info, Kısmen alındı warn, Tam alındı ok, Gecikmiş bad, İptal/Reddedildi off), sağ panel (bugünkü aside içeriği: Aç, Mal kabul ekle → İşlemler), ListFooter; "Teslim alınan" sütunu bugünkü kaynağıyla.
- [ ] Sipariş belgesi: DocumentSurface detail + akış (Onay bekliyor → Açık → Kısmen alındı → Tam alındı; İptal/Reddedildi), bakiye bandı yerine DetailTiles / toplamlar, mal kabulleri ızgarası kart olarak (Faturala, mal kabul iptali aynı koşullarla), Mal kabul ekle → İşlemler (diyalog aynen), özel alanlar kartı.
- [ ] Testler + görüntüler → commit.

### Task 4: İrsaliyeler, Mal kabulleri, İadeler
**Files:** `PurchaseDeliveryNotesPage.tsx`, `purchase-delivery-notes/*`, `PurchaseReceiptsScreen.tsx`, `document-returns/*` (yalnız ipucu); Test `src/purchasing/purchaseReceipts.test.tsx`
- [ ] İrsaliyeler: liste tipi, StatusTag türetilmiş (Mal kabul eşleşti ok / Bağlantısı yok warn), tutar sütunu yok; oluşturma çalışma alanı (siparişe irsaliye, mal kabul bağla/çöz) belge oluşturma görünümüne (davranış aynen).
- [ ] Mal kabulleri: liste tipi, sunucuda arama yoksa sayfa içi arama "bu sayfa" notuyla, StatusTag (Kabul edildi ok, İptal off), sağ panel (sipariş, depo, fatura bağlantısı), belge detay taslak 02 (Alış faturasını aç → İşlemler); siparişsiz mal kabul paneli yalnız çerçeve.
- [ ] İadeler: "İade, fatura detayından oluşturulur" ipucu metni geri gelir (ertelenen not maddesi).
- [ ] Testler + görüntüler → commit.

### Task 5: Oluşturma ekranları
**Files:** `SalesPage.tsx` `PurchaseOrderCreatePage`, `PurchaseInvoiceEntryPage.tsx` (+ `purchase-invoice-entry.css`), `StandaloneSupplierInvoiceDraftPage.tsx`, `supplier-invoice-draft/*`; Test `src/purchasing/purchaseCreateForms.test.tsx`
- [ ] Yeni satınalma siparişi: RecordFormPage `document` başlığı (Satış oluşturma ekranları gibi), toplamlar kit'i, geçerli adım yok.
- [ ] Mal kabul faturası girişi: seçim listesi liste tipinde; seçilince fatura oluşturma ekranı belge oluşturma görünümünde (`pie-*` özel biçim takımla değişir; alanlar, doğrulama, kaydetme aynen).
- [ ] Bağımsız fatura taslakları: liste tipi (Taslak warn / Muhasebeleştirildi ok), Düzenle / Muhasebeleştir → İşlemler (aynı koşullar), form belge oluşturma görünümünde; sayfalama bugünkü gibi (FE page=1, 50).
- [ ] Testler + görüntüler → commit.

### Task 6: Görsel kabul ve belgeler
- [ ] Eski `actions` yuvasının başka kullanıcısı yoksa `DocumentSurface`'ten kaldırılır (testleriyle).
- [ ] Satınalma'nın 9 ekranı + belgeleri: 1720 / 1440 açık+koyu / 1280 / 390; taslaklarla yan yana tek kabul sayfası (depo dışı) ve PNG.
- [ ] `document-page/README.md` ve ilgili README'ler güncel; ertelenenler notu güncel (Satınalma kapanan maddeler, yeni kalanlar, kullanıcıya bildirilen davranış değişiklikleri).
