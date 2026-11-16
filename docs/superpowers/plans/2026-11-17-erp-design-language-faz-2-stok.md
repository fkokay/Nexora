# ERP Tasarım Dili — Faz 2: Ekran Tipi Bileşenleri + Stok (taslak birebir) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ekranlar onaylı taslaklar gibi görünsün: başlık üstte + İşlem Çubuğu altta, liste ekranı (özet kartları, filtre çipleri, satır seçimi + toplu işlem çubuğu, sağ detay paneli, alt bilgi satırı) ve kayıt ekranı (v3: solda bölüm gezgini, ortada tek katman kartlar, sağda bağlam paneli). Önce bileşenler, sonra Stok modülünün 8 ekranı taslak 01 / 04-alt ile birebir.

**Architecture:** Mevcut ortak bileşenler dönüştürülür, yenisi yazılmaz: `list-page/` (ListPageHeader, ListToolbar, ListPagination), `AdvancedDataGrid`, `record-form/RecordForm.tsx` (RecordFormPage, RecordFormGroup, RecordFormTabs). İşlem Çubuğu, sayfanın başlık satırının hemen altındaki bir yuvaya (`data-nx-action-bar-slot`) portallanır; yuva yoksa bugünkü yerinde kalır. Böylece bileşeni kullanan her ekran kendiliğinden yeni düzene geçer; ekrana özel olanlar (özet kartları, detay paneli, bağlam paneli) sayfa tarafından verilir.

**Tech Stack:** React + Vite + TS, düz CSS + `--nx-*` token'ları, Vitest + RTL, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-11-16-erp-design-language-design.md` · Taslaklar (bağlayıcı görsel kaynak): `docs/design-proposals/erp-design-language/01-liste-ve-kayit-stok.html` (liste + kayıt), `04-rapor-ve-tanim.html` (Depolar tanım ekranı) · Önceki plan: `docs/superpowers/plans/2026-11-16-erp-design-language-faz-0-1.md` (Task 1–10 tamam, Task 11 Satış bağlantısı tamamlanıyor).

**Kullanıcı kararları (2026-11-17):** Ekranlar taslaktaki gibi olacak; düzenler şimdi yapılır, sonra her modül çubuk + düzenle birlikte geçer. Kayıt ekranı = v3 taslağı (sol bölüm gezgini, kartlar, sağ panel). Liste taslağı `liste-duzen` onaylı (başlık üstte, çubuk altta, satır seçimi + tümünü seç + toplu işlem çubuğu, anlamlı durum etiketleri).

## Global Constraints

- Onaylı taslaklar bağlayıcıdır: renk, boşluk, yarıçap (kart 8px, kontrol 6px, etiket tam yuvarlak), yazı boyutları (gövde 12,5px sık; başlık 18–19px/650), satır yüksekliği (sık 30px / rahat 38px), sayılar `tabular-nums` sağa hizalı normal ağırlık.
- Tüm renkler `--nx-*` token'ları; yeni sabit hex yok (`src/design/*.test.ts` geçmeli).
- Davranış değişmez: API çağrıları, yetkiler, doğrulamalar, kayıtlı ekran düzenleri (`built-in-screen-views/`, `FinanceStudioGrid`, `screenViewGridLayout`), İşlem Çubuğu komutları ve kısayolları.
- Yalnızca bugün var olan veri ve işlemler gösterilir; taslakta olup backend gerektirenler (kayıtlı görünümler, gruplama/ara toplam, hücrede düzenleme, toplu güncelleme, sipariş önerisi, stok seyri grafiği için yeni uç nokta) çizilmez (Faz 4).
- Yeni Türkçe metin → `src/locales/en/` karşılığı.
- Her görevde: `npx vitest run`, `npm run build`; görsel görevlerde dış betikle (depo dışında, yalnız localhost, sahte API) ekran görüntüsü ve taslakla yan yana karşılaştırma.

## Review Focus

1. **Çubuk yuvası:** sayfa yuvası olan ve olmayan ekranlar arasında geçişte çubuk kaybolmaz/çiftlenmez; keep-alive gizli görünümdeki yuva kullanılmaz → Task 1 testleri.
2. **Satır seçimi:** sayfalama/filtre değişince seçim sıfırlanır; tümünü seç yalnız görünen sayfayı seçer; Excel seçim varken yalnız seçilenleri, yokken tümünü aktarır → Task 3 testleri.
3. **Klavye:** tabloda Boşluk satırı işaretler, Ctrl+A tümünü seçer, Esc seçimi bırakır — metin alanında yazarken çalışmaz → Task 3.
4. **Bölüm gezgini:** hatalı alan içeren bölüm `!` gösterir; kaydetmeye çalışınca ilk hatalı bölüme ve alana gidilir; mevcut sekme durumu (`active`, `onChange`) aynen çalışır → Task 4.
5. **Dar ekran:** 1280 altında sağ paneller varsayılan kapalı (`Ctrl+.`), 390'da sayfa taşmaz → Task 2, 4, 5.

---

### Task 1: Başlık üstte, İşlem Çubuğu altında (yuva)

**Files:** Modify `src/action-bar/ActionBar.tsx`, `src/WorkspaceShellPage.tsx`, `src/list-page/ListPageHeader.tsx`, `src/record-form/RecordForm.tsx`; Create `src/action-bar/ActionBarSlot.tsx`; Test `src/action-bar/ActionBarSlot.test.tsx`

**Interfaces — Produces:** `export function ActionBarSlot(): JSX.Element` → `<div data-nx-action-bar-slot />`. ActionBar, etkin görünümün DOM'unda görünür bir yuva varsa `createPortal` ile oraya, yoksa bugünkü yerine çizilir.

- [ ] Test: `renders inside the page slot when the active view has one`, `falls back to the shell position when no slot`, `ignores a slot inside a hidden keep-alive view`, `moves when the active view changes`, `never renders twice`.
- [ ] Uygula: `ListPageHeader` ve sayfa varyantı `RecordFormPage` başlık satırından hemen sonra `<ActionBarSlot/>` koyar. Başlık satırı taslaktaki gibi: üstte yol (breadcrumb), altında başlık + kayıt sayısı, sağda meta.
- [ ] Test + build PASS → commit `ERP Web: başlık üstte, İşlem Çubuğu altında (yuva)`

### Task 2: Liste ekranı takımı (taslak 01 üst)

**Files:** Modify `src/list-page/ListPageHeader.tsx`, `ListToolbar.tsx`, `ListPagination.tsx`, `list-page-v2.css`, `src/AdvancedDataGrid.tsx` (yalnız görünüm), `src/advanced-data-grid.css`; Create `src/list-page/ListSummaryCards.tsx`, `src/list-page/ListFooter.tsx`, `src/list-page/StatusTag.tsx`; Test `src/list-page/listKit.test.tsx`; Modify `src/list-page/README.md`

**Interfaces — Produces:**
```ts
type SummaryCard = { id: string; label: string; value: ReactNode; icon: LucideIcon; tone?: 'primary'|'ok'|'warn'|'bad'; hint?: ReactNode; filterActive?: boolean; onFilter?: () => void };
export function ListSummaryCards(props: { cards: SummaryCard[] }): JSX.Element; // taslaktaki ikonlu mini kartlar; onFilter varsa tıklanır, "Filtrele" / "süzülüyor ✕"
export function ListFooter(props: { hints?: ReactNode; children?: ReactNode }): JSX.Element; // solda kısayol ipuçları, sağda seçim/toplam/sayfalama
export function StatusTag(props: { tone: 'ok'|'warn'|'bad'|'off'|'info'; children: ReactNode }): JSX.Element;
```
- [ ] Test: kart tıklanınca `onFilter`, aktif kartta `aria-pressed=true`; `StatusTag` sınıfı tona göre; `ListFooter` iki bölgeyi çizer.
- [ ] Uygula. Tablo görünümü taslağa: başlık `#f7f8fa` (token), 11,5px/600; satır sık 30px; sayılar normal ağırlık sağa; kod hücresi eş aralıklı; seçili/odaklı satır `--nx-primary-soft` + 3px sol çizgi. README'deki "özet kartı yoktur" kuralı taslağa göre güncellenir (uyarı taşıyan, tıklanınca süzen kartlar serbest).
- [ ] Test + build PASS → commit `ERP Web: liste ekranı takımı (özet kartları, durum etiketi, alt bilgi)`

### Task 3: Satır seçimi, tümünü seç, toplu işlem çubuğu

**Files:** Modify `src/AdvancedDataGrid.tsx`, `src/advanced-data-grid.css`; Create `src/list-page/BulkActionBar.tsx`; Test `src/list-page/selection.test.tsx`

**Interfaces — Produces:** AdvancedDataGrid prop'ları: `selectable?: boolean` (seçim sütunu + tümünü seç, kısmi seçimde "—"), mevcut `onSelectionChange(keys)` korunur; `bulkActions?: { id: string; label: string; run: (keys: string[]) => void; disabledReason?: string }[]` → `BulkActionBar` (taslaktaki koyu yüzen çubuk: "N seçili", eylemler, "✕ Esc"). Grid'in `export` komutu seçim varsa yalnız seçilenleri aktarır (bugünkü `exportExcel` davranışı zaten böyle — korunur).
- [ ] Test: seçim sütunu; tümünü seç yalnız görünen sayfa; kısmi durum; Boşluk/Ctrl+A/Esc (yazarken değil); sayfa/filtre değişince seçim sıfırlanır; toplu çubuk seçimle görünür, Esc kapatır.
- [ ] Uygula. `selectable` varsayılanı `false` (modüller tek tek açar).
- [ ] Test + build PASS → commit `ERP Web: tabloda satır seçimi ve toplu işlem çubuğu`

### Task 4: Kayıt ekranı takımı (taslak 01 alt, v3)

**Files:** Modify `src/record-form/RecordForm.tsx`, `src/record-form/record-form.css`, `src/record-form/README.md`; Test `src/record-form/RecordForm.test.tsx` (ek)

**Interfaces — Produces:** `RecordFormPage` ek prop'ları: `subtitle?: ReactNode` (kod, durum etiketleri, özet), `media?: ReactNode` (görsel kutusu), `recordNav?: { index: number; total: number; onPrev?: () => void; onNext?: () => void }` (PgUp/PgDn), `dirty?: boolean | number` ("N alan değişti"), `aside?: ReactNode` (sağ bağlam paneli, ≥1280'de açık, `Ctrl+.` ile aç/kapa). `RecordFormTabs` sayfa varyantında taslaktaki **sol bölüm gezgini** olarak çizilir: her sekme `✓` (tamam) / `!` (eksik/hatalı, `warning`) / `○` (boş), sağda sayı (`count?: number`), altta "Kart doluluğu %N" (`completion?: number`), `Ctrl+↑/↓` bölüm geçişi; dialog varyantında bugünkü yatay sekme kalır. `RecordFormGroup` = tek katman kart (8px, beyaz, başlık 13px/650, gri bant yok). Yeni yardımcı `RecordFieldChange({ previous })` → alan altında "Önceki: …" ve sarı sol çizgi.
- [ ] Test: gezgin durum simgeleri; Ctrl+↓ sonraki bölüm; kaydetme hatasında ilk `!` bölüme ve ilk geçersiz alana odak; PgUp/PgDn `recordNav` çağırır (yazarken değil); `aside` 1280 altında kapalı.
- [ ] Uygula; kimlik şeridi (`rf-identity`) taslaktaki "Kimlik" kartı olur.
- [ ] Test + build PASS → commit `ERP Web: kayıt ekranı takımı (bölüm gezgini, kartlar, bağlam paneli)`

### Task 5: Stok Kartları liste ekranı = taslak 01 üst

**Files:** Modify `src/InventoryPage.tsx` (stok listesi bölümü), `src/inventory/components/InventoryStockGrid.tsx`, `InventoryStockFilters.tsx`, `src/inventory/inventory-list-v2.css`; Create `src/inventory/components/InventoryStockDetailPanel.tsx`; Test `src/inventory/stockList.test.tsx`

- [ ] Özet kartları (yüklü satırlardan): Stok değeri, Kullanılabilir, Minimum altı (tıklanınca süzer, mevcut "Minimum altı" filtresi), Maliyetsiz (tıklanınca süzer, filtre yoksa yalnız bilgi).
- [ ] Filtre satırı: arama + Depo + mevcut çipler; sağda Sütunlar / Pivot.
- [ ] Tablo: `selectable`; Durum sütunu `StatusTag` (Yeterli=ok, Minimum altı=bad, Maliyetsiz=warn, Pasif=off); Kullanılabilir'de doluluk çubuğu; satır işlem "⋯" sütunu detay paneli olduğu için kalkar (list-page kuralı).
- [ ] Sağ detay paneli (sekmeli: Özet, Depolar, Hareketler — yalnız mevcut uç noktalardan): seçili satır; Ctrl+. ile aç/kapa.
- [ ] Toplu çubuk: Excel (seçilenler), Sil (yalnız bugün silinebilen kartlar, yetkiyle).
- [ ] `open`/`delete` komutları seçimden etkinleşir (Task 10'daki "seçim yok" istisnası kalkar).
- [ ] Alt bilgi: ipuçları + "N seçili · Seçili değer … · Gösterilen x / y".
- [ ] Test + build; ekran görüntüsü taslak 01 ile yan yana (1440 açık/koyu, 1280, 390) → commit.

### Task 6: Stok kartı kayıt ekranı = taslak 01 alt

**Files:** Modify `src/InventoryPage.tsx` (stok kartı formu), ilgili CSS; Test `src/inventory/stockCard.test.tsx`

- [ ] Başlık: görsel kutusu, ad, kod + Aktif/Minimum altı etiketleri + "Kategori · Birim · Lot takipli", sağda "N alan değişti" ve `recordNav` (listeden gelinen sıra).
- [ ] Sol gezgin: mevcut 6 bölüm (Genel ve Stok Yönetimi, Fiyat ve Vergi, Lojistik ve Muhasebe, Birim ve Özel Alanlar, Varyantlar, Üretim Reçeteleri) durum ve sayılarla; doluluk yüzdesi.
- [ ] Kartlar: Kimlik, Stok yönetimi, Birim dönüşümleri (mevcut tablo) — taslaktaki sırayla; değişen alanlarda `RecordFieldChange`.
- [ ] Sağ panel: Stok durumu (bakiye, kullanılabilir, birim maliyet, stok değeri — mevcut veriden), Açık belgeler ve Geçmiş yalnız mevcut uç nokta varsa (yoksa çizilmez; raporda belirt).
- [ ] Test + build; görüntü taslakla yan yana → commit.

### Task 7: Diğer Stok ekranları

**Files:** `InventoryMovementsPage.tsx`, `InventoryCostPage.tsx`, `InventoryWarehousesPage.tsx`, `InventoryTransfersPage.tsx`, `WarehouseLocationsPage.tsx`, `InventoryTrackingPage.tsx` ve CSS'leri; Test `src/inventory/stockScreens.test.tsx`

- [ ] Hareketler, Maliyet, Transferler, İzlenebilirlik: liste takımı (başlık+yuva, özet kartları yalnız anlamlı uyarı varsa, çipler, `selectable`, StatusTag, alt bilgi).
- [ ] Depolar ve Raf/Konumlar: taslak 04-alt **tanım ekranı** (solda kompakt liste, sağda seçili kaydın formu aynı ekranda, Lokasyonlar alt tablosu); silinemeyen depoda onay penceresi "Pasife al (Enter) / Vazgeç (Esc)" — mevcut pasife alma işlemi varsa.
- [ ] Test + build; her ekranın görüntüsü → commit.

### Task 8: Görsel kabul ve belgeler

- [ ] 8 Stok ekranının görüntüleri (1440 açık + koyu, 1280, 390) taslaklarla yan yana tek bir karşılaştırma sayfasında (depo dışı) toplanır; sapmalar listelenir ve düzeltilir.
- [ ] `src/list-page/README.md`, `src/record-form/README.md`, `src/action-bar/README.md` güncel.
- [ ] Kullanıcıya görüntüler gösterilir (Stok modülü onayı); sonraki modüller (Satış: belge tipi taslak 02, Cari: taslak 03, Finans: taslak 04-üst) ayrı planlarla.
