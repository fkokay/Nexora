# ERP Tasarım Dili — Faz 3: Satış Modülü Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satış modülünün 12 ekranı onaylı taslaklar gibi görünsün: listeler Stok Kartları'ndaki liste tipiyle, belgeler taslak 02 (Satış Faturası) belge tipiyle, Kampanyalar tanım ekranıyla; Dağıtım planı yalnızca çerçeve/çubuk/renk.

**Architecture:** Önce ortak belge bileşenleri (`src/document-page/`, `src/document-detail/`) taslak 02'ye dönüştürülür (Satınalma da bunları kullanır — onun düzeni de değişir, kasıtlı). Sonra Satış listeleri Faz 2 liste takımıyla, belgeler yeni belge takımıyla bağlanır. Faz 1'de eklenen satış komut bağlantıları (Task 11) korunur, detay başlığındaki iş akışı düğmeleri İşlemler menüsüne + durum akış şeridine taşınır.

**Tech Stack:** React + Vite + TS, düz CSS + `--nx-*`, Vitest + RTL, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-11-16-erp-design-language-design.md` · Taslaklar: `docs/design-proposals/erp-design-language/02-belge-satis-faturasi.html` (belge), `06-satis-modulu.html` (eşleme + Satış Faturaları listesi, kullanıcı onayı 2026-11-17), `01-liste-ve-kayit-stok.html` (liste dili), `04-rapor-ve-tanim.html` (tanım ekranı) · Önceki planlar ve kararlar: `docs/superpowers/plans/2026-11-17-erp-design-language-faz-2-stok.md`, kit README'leri `frontend/erp-web/src/{list-page,record-form,action-bar,definition-layout}/README.md`, `docs/superpowers/notes/2026-11-17-erp-design-language-ertelenenler.md`.

## Global Constraints

- Taslaklar bağlayıcı; kartlar tek katman, kart yarıçapı 8px, kontrol 6px; sayılar `tabular-nums` sağa, normal ağırlık; başlık üstte + İşlem Çubuğu altta; kutu içinde kutu yok.
- Tüm renkler `--nx-*`; `src/design/*.test.ts` geçmeli.
- Davranış değişmez: API çağrıları, yetkiler, doğrulamalar, iptal/ters kayıt sırası, tenant ekran düzenleri, mevcut komut bağlantıları ve testler (`src/sales/salesActionBar.test.tsx` vb.).
- Yalnız mevcut veri: özet kartları ve paneller bugünkü uç noktalardan; olmayan veri (fatura başına kalan/tahsilat yoksa, Taslak/Onaylı fatura durumu) çizilmez.
- Kesilmiş/sevk edilmiş belge silinmez: Sil soluk + nedeni; iptal İşlemler'de bugünkü koşullarla.
- Yeni Türkçe metin → `src/locales/en/` karşılığı.
- Görsel doğrulama: depo dışı sahte API betiğiyle ekran görüntüsü, taslakla yan yana.

## Review Focus

1. **Belge durumuna göre komutlar:** kesilmiş fatura / sevk edilmiş irsaliye / iptal belge için Sil, İptal ve dönüştürme komutlarının etkin/soluk durumu ve nedenleri doğru → T1, T3 testleri.
2. **Ortak bileşen yayılımı:** belge takımı değişikliği Satınalma ekranlarını bozmamalı (kaydet, satır ekle, KDV toplamları) → T1 testleri + Satınalma ekran görüntüsü.
3. **Gizli liste hedefi:** belge açıkken Excel/Filtre/Yenile listeye değil belgeye bakar (Faz 1 T11 kuralı) → T2/T3 testleri.
4. **Satır klavye girişi:** satır tablosunda Ins/Ctrl+D/F9/Enter mevcutsa korunur, yeni kısayol eklenirse F1 listesinde → T1.
5. **Dar ekran:** 1280 altında sağ panel kapalı, 390'da taşma yok → T1, T2.

---

### Task 1: Belge ekranı takımı (taslak 02)
**Files:** `src/document-page/{DocumentSurface.tsx,document-page.css,README.md,DocumentStatusBadge.tsx,documentStatus.ts}`, `src/document-detail/{DocumentDetailLayout.tsx,document-detail.css}`; Test `src/document-page/documentKit.test.tsx`
- [ ] Başlık: belge no + cari, durum etiketi, **durum akış şeridi** (adımlar sayfadan verilir; geçerli adım vurgulu), sağda "N değişiklik kaydedilmedi" + PgUp/PgDn (varsa), Vazgeç.
- [ ] Başlık alanları kartı 4 sütun; satır tablosu taslaktaki gibi (başlık, sayılar sağa, aktif satır vurgusu, uyarı satırı stili, boş "yeni satır" satırı varsa); sağ bağlam paneli yuvası (belge zinciri, cari özeti, aktif satırın stoku — sayfa verir); sağ altta toplamlar bloğu (KDV oranlarına göre döküm); alt bilgi satırı.
- [ ] İş akışı düğmeleri başlıktan kalkar: sayfa `more` + durum şeridi kullanır (takım bunun için yuva/prop sağlar).
- [ ] Testler + Satınalma'da bir belgeyle görsel kontrol → commit.

### Task 2: Satış liste ekranları
**Files:** `SalesPage.tsx` liste bölümleri, `sales/components/*`, `SalesDeliveriesPage.tsx`, `SalesCustomerRequestsPage.tsx`, `document-returns/*` liste; Test `src/sales/salesLists.test.tsx`
- [ ] Teklifler, Siparişler, İrsaliyeler, Faturalar, Talepler, İadeler: ListPageHeader+yuva, özet kartları (yalnız mevcut veri, "bu sayfa"), çipler, `selectable` + StatusTag (Kesildi ok, İptal off, Vadesi geçti bad, bekleyen warn/info — ekran başına eşleme raporda), sağ detay paneli (Özet, belge zinciri, satırlar — mevcut veriden), ListFooter; 1440'ta yatay taşma yok (sütun genişlikleri).
- [ ] Testler + görüntüler → commit.

### Task 3: Satış belge ekranları
**Files:** teklif, sipariş, irsaliye, fatura, talep, iade detay/oluşturma bileşenleri; Test `src/sales/salesDocuments.test.tsx`
- [ ] Her belge Task 1 takımıyla: durum akışı (teklif: Taslak→Gönderildi→Kabul/Red; sipariş: Açık→Kısmi sevk→Sevk edildi→Faturalandı; irsaliye: Sevk edildi→Faturalandı/İptal; fatura: Kesildi→(Tahsil durumu varsa)/İptal; talep ve iade bugünkü durumlarıyla), başlık alanları, satır tablosu, bağlam paneli, toplamlar; başlıktaki iş akışı düğmeleri kalkar (İşlemler'de zaten var — koşullar aynı).
- [ ] Testler + görüntüler (taslak 02 ile yan yana) → commit.

### Task 4: Kampanyalar ve Dağıtım planı
- [ ] Kampanyalar → `DefinitionLayout` (solda liste, sağda form; mevcut alan/izin/doğrulama aynen).
- [ ] Dağıtım planı → yalnız çerçeve/çubuk/renk; harita ve plan düzeni aynen; taşma/kontrast kontrolü.
- [ ] Testler + görüntüler → commit.

### Task 5: Görsel kabul ve belgeler
- [ ] 12 Satış ekranı + 2 Satınalma belgesi: 1720/1440 açık+koyu/1280/390; taslaklarla yan yana tek kabul sayfası (depo dışı) ve PNG.
- [ ] `document-page/README.md` ve ilgili README'ler güncel; ertelenenler notu güncel.
