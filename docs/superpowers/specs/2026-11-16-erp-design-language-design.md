# Nexora ERP Tasarım Dili ve Ekranların Yeniden Tasarımı

Tarih: 2026-11-16 · Kapsam: `frontend/erp-web` · Durum: tasarım onaylandı, uygulama planı bekliyor

Onaylı görsel taslaklar (tarayıcıda açılır, 1720px+ genişlik için çizildi):
`docs/design-proposals/erp-design-language/`

| Dosya | Ekran tipi |
|---|---|
| `01-liste-ve-kayit-stok.html` | Liste ekranı + Kayıt kartı (Stok Kartları, Stok Kartı) |
| `02-belge-satis-faturasi.html` | Belge ekranı (Satış Faturası) |
| `03-hesap-ekstre-cari.html` | Hesap kartı + ekstre (Cari Hesap) |
| `04-rapor-ve-tanim.html` | Rapor (Mizan) + Tanım (Depolar) + Sil onayı |
| `05-ana-sayfa.html` | Ana sayfa / Çalışma paneli |
| `nexora-ds.css` | Taslaklardaki ortak stil (renk ve ölçüler için kaynak) |

## 1. Amaç ve neden

Netsis, Logo, Canias, Oracle gibi her ERP'nin kendine özgü, tanınan bir ekran düzeni var. Nexora'nın da kendi düzeni olacak. Bugün ERP Web'de ~100 CSS dosyası, birbiriyle çelişen üç renk sistemi (mor, mavi, lacivert), üç yazı tipi ve ekrandan ekrana değişen düğme konumları var.

Kullanıcının istediği, kendi sözleriyle: **"basit ama gelişmiş" bir ekran.** Listeleme, kaydetme, görüntüleme, Excel çıktısı, yazdırma gibi işlemler **her ekranda aynı yerde** olmalı; kullanıcı her ekranda farklı bir düğme konumu aramamalı; gerektiğinde **klavye ile** çalışabilmeli.

## 2. Hedefler

1. Tek bir tasarım dili: tek renk/ölçü sistemi (token), tek yazı tipi, tek bileşen seti.
2. Her ekranda aynı yerde, aynı sırada duran **İşlem Çubuğu** ve aynı **klavye kısayolları**.
3. Tüm ERP ekranlarının altı ekran tipinden birine oturtulması (bkz. §6) — ekranlar tek tek değil, tip tip tasarlanır.
4. Taslaklardaki "gelişmiş" kullanım özellikleri: kayıtlı görünümler, yan filtre paneli, gruplama + ara toplamlar, hücrede düzenleme, toplu işlem, detay/bağlam paneli, kayıtlar arası gezinme, değişiklik izi.

## 3. Hedef olmayanlar

- Development Studio uygulamasının (`frontend/development-studio`) yeniden tasarımı. *(Benim kararım; ayrı iş olarak sonra.)*
- İş kurallarının, API sözleşmelerinin veya veri modelinin değişmesi — §8 Faz 4'te açıkça listelenenler hariç.
- Mobil-öncelikli tasarım. ERP masaüstü odaklı kalır; ama mevcut UI denetimi 390px'te sayfa yatay taşması kontrol ettiği için dar ekranda **taşma olmamalı** (bkz. §9).

## 4. Asla olmaması gerekenler (anti-hedefler)

- Bir ekranda geçerli olmayan ortak düğmenin **gizlenmesi** (yer kaydırır). Geçersiz düğme soluk (disabled) görünür, yerinde durur.
- Ekrana özel düğmelerin ortak çubuğa karışması. Ekrana özel komutlar yalnızca **İşlemler** menüsünde.
- Aynı işin iki ekranda farklı kısayolla yapılması.
- Kısayolun yalnızca belgede kalması: her kısayol düğmenin üstünde görünür.
- Yeni görünümün tenant'ın kaydettiği ekran düzenlerini (Ekran Görünümleri / `BuiltInScreenViewsPage`, `FinanceStudioGrid`, `screenViewGridLayout`) bozması.

## 5. Tasarım dili

### 5.1 Renkler (açık tema)

| Token | Değer | Kullanım |
|---|---|---|
| `--nx-ink` | `#0f1b2d` | Sol ikon şeridi zemini |
| `--nx-ink-2` | `#1a2a40` | Şeritte seçili öğe |
| `--nx-primary` | `#1f5fd1` | Tek vurgu rengi: birincil düğme, seçili satır kenarı, odak |
| `--nx-primary-strong` | `#1846a3` | Vurgu metni |
| `--nx-primary-soft` | `#e8f0fd` | Seçili satır/sekme zemini |
| `--nx-canvas` | `#f3f5f8` | Sayfa zemini |
| `--nx-surface` | `#ffffff` | Kart, tablo, panel |
| `--nx-line` | `#dfe3e9` | Kenarlık |
| `--nx-line-soft` | `#eef1f4` | Tablo satır çizgisi |
| `--nx-text` | `#1b2430` | Metin |
| `--nx-muted` | `#667085` | İkincil metin |
| `--nx-ok` / `-bg` | `#13804b` / `#e5f5ec` | Aktif, tamam, giriş (+) |
| `--nx-warn` / `-bg` | `#b45309` / `#fdf1e1` | Dikkat, maliyetsiz, bekleyen |
| `--nx-bad` / `-bg` | `#c4321f` / `#fde9e6` | Hata, minimum altı, vadesi geçmiş, çıkış (−) |
| `--nx-changed` | `#e0a100` | Değişmiş alan çizgisi |

Kural: renk **anlam** taşır. Kırmızı yalnızca hata/eşik altı/gecikme; turuncu dikkat; yeşil olumlu; gri pasif. Dekoratif renk yok.

Koyu tema korunur (bugün `html[data-theme="dark"]` + `aierp.theme`). Koyu karşılıklar aynı token adlarıyla tanımlanır. *(Benim kararım: koyu değerleri uygulayıcı seçer, kontrast WCAG AA olmalı; taslak yalnızca açık tema.)*

### 5.2 Yazı ve sayılar

- Yazı tipi: `"Segoe UI", Inter, system-ui, sans-serif`. Google Fonts'tan DM Sans/Manrope yüklemesi kaldırılır.
- Temel boyut 12,5px (sık yoğunluk) / 13,5px (rahat yoğunluk). Sayfa başlığı 18–19px/650.
- Tüm sayılar `font-variant-numeric: tabular-nums`, sağa hizalı; Türkçe biçim `1.234,56`. Kodlar (stok kodu, belge no) eş aralıklı yazı (`Consolas`).

### 5.3 Ölçüler

- Köşe yarıçapı: kontrol 6px, kart 8–9px, etiket (tag) tam yuvarlak.
- Kontrol yüksekliği 31px; tablo satırı sık 30px / rahat 38px. Yoğunluk kullanıcı tercihidir ("Rahat / Sık").
- Boşluk ölçeği 4'ün katları (4, 8, 12, 16).

### 5.4 Uygulama çerçevesi (her ekranda aynı)

1. **Sol ikon şeridi** (58px, koyu): modüller.
2. **Alt menü** (≈180px, beyaz): seçili modülün ekranları + "Sık kullanılanlar" (kayıtlı görünümler sabitlenir). Daraltılabilir.
3. **Üst çubuk**: genel arama `Ctrl+K`, açık ekran sekmeleri (kaydedilmemiş değişiklikte `●`), şirket seçimi (bugünkü tenant seçici; taslaktaki "001 · Merkez" yalnızca şirket adıdır, yeni bir şube kavramı eklenmez), bildirimler, kullanıcı.
4. **Sayfa başlığı**: üstte yol (breadcrumb), başlık, sağda meta (kayıt sayısı, "kaydedilmemiş değişiklik", kayıtlar arası gezinme).
5. **İşlem Çubuğu** (§5.5).
6. İçerik (ekran tipine göre, §6).
7. **Alt bilgi satırı**: solda o an geçerli kısayollar, sağda seçim/toplamlar/sayfalama.

### 5.5 İşlem Çubuğu ve kısayollar

Sıra **her ekranda sabit**; her düğmenin üstünde kısayolu yazar:

`Yeni F2` · `Aç Enter` · `Kaydet Ctrl+S` · `Sil Ctrl+Del` │ `Yenile F5` · `Filtre Ctrl+F` │ `Yazdır Ctrl+P` · `Excel Ctrl+E` │ *(sağa yaslı)* ekrana göre görünüm araçları (Grupla, Rahat/Sık, Sütunlar) · `İşlemler ▾ Alt+İ`

- Geçerli olmayan düğme soluk görünür (`disabled`), gizlenmez.
- O ekranın asıl işi birincil (mavi) olur: listede **Yeni**, kayıt/belgede **Kaydet**.
- **İşlemler** menüsü ekrana özel komutları toplar (ör. faturada Onayla, e-Faturaya gönder, Kopyala, İade oluştur, Tahsilat al). Kullanılamayan komut soluk ve **nedeni altında yazılı**.
- Kayıt ekranında ek: `Değişiklikleri geri al Ctrl+Z`.

Düğmelerin ne yaptığı *(benim kararlarım)*:

- **Sil** yalnızca gerçekten silinebilen kayıtlarda etkindir (taslak belge, hareketsiz tanım). Kesilmiş/kaydedilmiş belge, ledger ve hareket kayıtları silinmez (append-only kuralı); orada Sil soluk kalır ve nedeni ipucunda yazar ("Kesilmiş belge silinemez — İşlemler › İptal et"). İptal / ters kayıt her zaman **İşlemler** menüsündedir ve mevcut iptal sırası kurallarına uyar. Hareketi olan tanımda onay penceresi "Pasife al" önerir.
- **Excel**: listede filtrelenmiş **tüm** kayıtları, ekranda görünen sütunlarla dışa aktarır (bugünkü dışa aktarma davranışı korunur); kayıt/belge ekranında o kaydın satırlarını. **Yazdır**: belgede belgenin baskı formu, liste/raporda ekranın yazdırma görünümü. Bir ekranda henüz dışa aktarma veya baskı yoksa düğme soluk kalır; Faz 1 eksik olanları yazmaz, var olanları bağlar.
- **Aç (Enter)**: kayıt ve belge kendi **ekran sekmesinde** açılır (taslaklardaki `AMB-2040 ●` sekmesi). Bugün modal açılan kayıtlar (ör. `SalesInvoiceModal.tsx`, `PurchaseInvoiceModal.tsx`) ilgili modül Faz 3'te geçerken sekmeye taşınır. PgUp/PgDn listeden gelinen sırayla gezer.

Genel kısayollar:

| Tuş | İş |
|---|---|
| `Ctrl+K` | Her yerden ekran/kayıt/komut ara |
| `F1` | Kısayol listesi |
| `Esc` | Kapat / geri / seçimi bırak |
| `↑ ↓`, `Boşluk`, `Ctrl+A` | Listede gez, işaretle, tümünü seç |
| `F4` | Listede hücreyi düzenle |
| `PgUp / PgDn` | Kayıt ekranında önceki / sonraki kayıt (listeden gelinen sıra) |
| `Ctrl+↑/↓` | Kayıt ekranında bölümler arası |
| `Ctrl+.` | Detay / parametre panelini aç-kapa |
| `F9` | Belge satırında stok seç; raporda "Raporu çalıştır" |
| `Ins`, `Ctrl+D`, `Ctrl+Enter` | Belge satırı ekle, satırı kopyala, alt tabloya satır ekle |
| `Alt+1…4` | Ana sayfada hızlı oluştur |

Mevcut kısayollar korunur: `Ctrl+W` sekme kapat, `Ctrl+Tab` / `Alt+←/→` sekme değiştir, `Ctrl+B` (`src/useWorkspaceShortcuts.ts`).

Tarayıcı çakışmaları: `Ctrl+S/P/F/E/D`, `F5` tarayıcı varsayılanı `preventDefault` ile engellenir. Metin alanında yazarken düz harf/rakam kısayolları çalışmaz; `Ctrl`/`F` tuşlu olanlar çalışır. `Alt+İ` Türkçe klavyeyi varsayar; uygulayıcı `event.code === 'KeyI'` ile eşleştirmeli ki farklı klavye düzeninde de çalışsın.

### 5.6 Ortak görsel kalıplar

- **Özet mini kartları**: ikon + etiket + değer (+ küçük eğilim çizgisi). Uyarı taşıyan kart (ör. "Minimum altı") tıklanınca listeyi o kayıtlara süzer; süzülmüşken vurgulu görünür. Kullanıcı seçimi: taslakta "B" seçeneği.
- **Durum etiketleri**: yuvarlak, anlamına göre renkli (§5.1).
- **Değişiklik izi**: değişmiş alanın solunda sarı çizgi, altında "Önceki: …".
- **Onay penceresi**: sonucu açıkça söyler, mümkünse güvenli alternatif sunar (ör. silinemeyen depoda "Pasife al"); düğmelerde `Enter` / `Esc` yazar.

## 6. Ekran tipleri

| Tip | Taslak | İçerik | Kullanan ekranlar (örnek) |
|---|---|---|---|
| **A · Liste** | 01 (üst) | Kayıtlı görünüm sekmeleri, özet kartları, yan filtre paneli, filtre çipleri, gruplanabilir tablo + ara/genel toplam, toplu işlem çubuğu, sağda sekmeli detay paneli | Tüm liste ekranları: stok, cari, belgeler, hareketler, transferler |
| **B · Kayıt kartı** | 01 (alt) | Başlıkta görsel/durum/kayıt gezinme, solda bölüm gezgini (✓/! + doluluk %), kartlar halinde form, sağda bağlam paneli (durum, açık belgeler, denetim geçmişi) | Stok kartı, cari kart, sabit kıymet, personel, proje, iş merkezi, reçete |
| **C · Belge** | 02 | Durum akışı, başlık alanları (4 sütun), klavyeyle girilen satır tablosu + otomatik tamamlama, satır uyarıları, belge zinciri, KDV dökümlü toplamlar | Teklif, sipariş, irsaliye, fatura, iade, satınalma belgeleri, mahsup fişi, transfer, üretim emri |
| **D · Hesap + ekstre** | 03 | Kart + özet kartları + hareket tablosu (devir, yürüyen bakiye, ters kayıt bağlantısı, dönem toplamı), yaşlandırma | Cari ekstre, banka, kasa, muavin |
| **E · Rapor** | 04 (üst) | Sol parametre paneli, kayıtlı rapor varyantları, ağaç tablo + açılır alt kırılım, çalıştırma bilgisi | Mizan, bilanço, yaşlandırma, stok değerleme, maliyet sapması, bütçe |
| **F · Tanım** | 04 (alt) | Aynı ekranda solda kompakt liste, sağda düzenleme formu | Depolar, birimler, kategoriler, vergi oranları, ödeme planları, ayarlar sayfaları |
| **Ana sayfa** | 05 | Komut kutusu, son açılanlar, hızlı oluştur, "Bugün yapılacaklar", KPI'lar, grafikler, nakit akışı, ajanda | `launcher` / çalışma paneli |

Uygulama planı her ekranı (`src/WorkspacePageRouter.tsx` içindeki ~92 sayfa anahtarı) bu tiplerden birine eşleyen bir tablo içermeli. Bir tipe oturmayan ekran (ör. harita içeren dağıtım, ERP asistanı, low-code tasarımcılar) plan aşamasında ayrıca işaretlenir; bunlar yalnızca çerçeve + İşlem Çubuğu + token'ları alır.

## 7. Yaklaşımlar

| | Yaklaşım | Artı | Eksi |
|---|---|---|---|
| 1 | **Yalnızca CSS ile yeniden giydirme**: mevcut bileşen yapısı aynı, stiller değişir | Hızlı, düşük risk | Düğme konumları ve klavye davranışı ekran ekran farklı kalır — asıl isteği karşılamaz |
| 2 | **Tek seferde yeniden yazım**: tüm ekranlar yeni bileşenlerle bir PR'da | Sonuç tutarlı | Çok büyük, gözden geçirilemez; ~92 ekranda gerileme riski |
| 3 ✅ | **Temel önce, sonra modül modül geçiş**: token + çerçeve + İşlem Çubuğu + ekran tipi bileşenleri kurulur; ekranlar modül modül, her modül ayrı PR ile yeni bileşenlere taşınır | Her adım küçük ve test edilebilir; eski ve yeni ekran geçiş süresince birlikte çalışır; ilk PR'dan itibaren düğme konumu sabitlenir | Geçiş süresince iki görünüm yan yana yaşar |

**Seçilen: 3.** *(Benim kararım — kullanıcı sonuca odaklandı, yöntemi bana bıraktı.)* Mevcut ortak bileşenler (`src/list-page/`, `src/record-form/`, `src/document-page/`, `src/AdvancedDataGrid.tsx`, `src/confirmDialog.tsx`) atılmaz; ekran tipi bileşenlerine dönüştürülür.

## 8. Aşamalar

**Faz 0 — Temel.** Tek token dosyası (`--nx-*`, açık + koyu). `style.css`, `erp-redesign.css`, `global-components.css`, `dynamics-workbench.css`'teki çakışan token tanımları bu dosyaya yönlendirilir ya da kaldırılır; modül CSS'lerindeki sabit hex ve `var(--x, #7060df)` gibi geri dönüş renkleri token'a çevrilir. Yazı tipi tekleşir.

**Faz 1 — Çerçeve ve İşlem Çubuğu.** Sol ikon şeridi + alt menü, üst çubuk, ekran sekmeleri. Tek `ActionBar` bileşeni + merkezi kısayol kaydı (ekran, hangi komutun etkin olduğunu bildirir; kısayol ve düğme aynı komutu çağırır) + `F1` kısayol yardımı. Bu fazın sonunda **tüm ekranlar** aynı İşlem Çubuğu'nu gösterir; henüz yeni tipe geçmemiş ekranlarda mevcut düğmeler bu çubuğa bağlanır.

**Faz 2 — Ekran tipi bileşenleri.** A–F tipleri ve onay penceresi; mevcut verilerle çalışan kısımlar (gruplama/kayıtlı görünüm gibi Faz 4 özellikleri hariç).

**Faz 3 — Modül modül geçiş.** Sıra: Stok (pilot) → Satış → Satınalma → Cari/CRM → Finans → Üretim → Diğer modüller → Ayarlar → Low-code/platform. Her modül ayrı PR; her PR'da Playwright UI denetimi geçer.

**Modül başına onay kapısı (kullanıcı kararı):** bir modülün kodlamasına başlamadan önce o modülün ekranlarının ekran tiplerine eşlemesi ve taslağı (bu klasördeki taslaklarla aynı biçimde) kullanıcıya gösterilir; onay gelmeden o modülün ekranları değiştirilmez. Stok için 01 numaralı taslak zaten onaylıdır; yine de stokun diğer ekranları (hareketler, transferler, depolar, maliyet, izlenebilirlik) eşleme tablosuyla birlikte gösterilir. Faz 0–2 (token, çerçeve, İşlem Çubuğu, tip bileşenleri) bu kapıya tabi değildir; onlar bu belgedeki onaylı taslaklara dayanır.

**Faz 4 — Yeni yetenekler (backend gerektirir).** Taslaklarda görünüp bugün olmayanlar, her biri ayrı iş olarak:
- Kayıtlı görünümler (filtre+sütun+gruplama, kullanıcı/tenant bazında saklama)
- Sunucu tarafında gruplama ve ara toplamlar
- Listede hücrede düzenleme ve toplu işlemler (toplu güncelleme uç noktaları, yetki kontrolü, denetim kaydı)
- Stok tükenme tahmini ve sipariş önerisi
- Satış faturasında **Taslak / Onaylı** durumları (bugün yalnızca "Kesildi / İptal" var) ve buna bağlı e-Fatura akışı
- Kayıt ekranında denetim geçmişi paneli, cari yaşlandırma, ana sayfa "Bugün yapılacaklar" kaynakları

Faz 4 kalemi gelene kadar ilgili UI parçası (ör. "Görünüm kaydet", sipariş önerisi kutusu) ekranda hiç çizilmez. "Gizleme yok, soluk göster" kuralı yalnızca İşlem Çubuğu'ndaki ortak düğmeler içindir. *(Benim kararım.)*

## 9. Kısıtlar

- Teknoloji: React + Vite + TypeScript, düz global CSS, `lucide-react` ikonları. Yeni UI kütüphanesi eklenmez. *(Benim kararım; mevcut yapıyı korur.)*
- Taslaklar 1720px için çizildi. Davranış genişliğe göre: ≥1600px tüm paneller açık; 1280–1599px sağ detay paneli varsayılan kapalı (`Ctrl+.`), yan filtre paneli daraltılmış; <1280px alt menü ikon şeridine katlanır; 390px'te sayfa yatay taşma yok, tablolar kendi içinde kayar. *(Benim kararım.)*
- Tenant ekran düzenleri (`src/built-in-screen-views/`, `FinanceStudioGrid.tsx`, `screenViewGridLayout.ts`) yeni tablo/form bileşenlerine uygulanmaya devam etmeli. Sınır *(benim kararım)*: tenant düzeni sütunları ve alanları gizleyebilir, sıralayabilir, kart/bölüm içindeki yerini değiştirebilir; çerçeveyi, İşlem Çubuğu'nu ve kısayolları değiştiremez. Tenant özel menüleri ve sayfaları (`TenantCustomMenuNavigation.tsx`, `TenantCustomPage.tsx`) ait oldukları modülün alt menüsünde, modülsüzler ikon şeridindeki ayrı bir "Özel" grubunda görünür; özel sayfalar da aynı çerçeve ve İşlem Çubuğu'nu kullanır.
- Erişilebilirlik: tüm düğmeler etiketli (UI denetimi etiketsiz kontrolleri yakalıyor), odak halkası görünür, renk tek başına anlam taşımaz (etiket metni de var), kontrast WCAG AA.
- `frontend/development-studio/src/platform-tools/erp-src/` erp-web'in bazı dosyalarının kopyalarını tutuyor ve zaten farklılaşmış. Bu iş onları güncellemez; uyumsuzluk ayrı takip edilir.
- UI metni Türkçe.

## 10. Uygulayıcıya bırakılanlar

- Token dosyasının adı/yeri, CSS'in nasıl bölüneceği, eski CSS'in hangi sırayla silineceği.
- Koyu tema değerleri (AA kontrast şartıyla).
- Bileşen API'leri ve dosya yapısı; kısayol kaydının teknik tasarımı.
- İkonlar: `lucide-react` içinden taslaktakilere en yakın olanlar.
- Taslaklarda belirtilmemiş ekranlara özel İşlemler menüsü kısayolları (çakışmasız ve `F1` listesinde görünür olmak şartıyla).
- Faz 3 içindeki ekran sırası (modül sırası sabit).
