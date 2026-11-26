# Serbest gövde ve kalan bileşenler (alt proje 5, ikinci plan: 5c) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Taslak onayı:** `09-serbest-govde.html` 2026-11-26'da çizildi ve kullanıcı onayladı ([[design-approval-first]]); Görev 1 tamam. Ekranlar bu taslaktan sapmamalı.

**Goal:** Kalıba uymayan sayfalar için **serbest gövde**yi (3. basamak) kurmak: ortak kabuğun içinde Sekme → Bölüm → bileşen, bölüm başına 1/2/3 kolon, piksel ya da genişlik ayarı yok. 5a'daki danışman panellerini serbest gövdede ve Kayıt kartının ek alanlarında da açmak. "Bölümler" ve "Liste" bileşenlerini serbest gövdede kullanılabilir yapmak.

**Architecture:**
- **Biçim yalnız eklemeli genişler (§5.2-C).** Kökte `template: { "name": "free" }`. Her üst düzey bileşen `slot` taşır. Bölüm, Kayıt kartındaki bölüm gibi üyelerini kimlikle listeler (`members`), üyeler de üst düzeydedir. Böylece 5a'nın üst düzey bileşen üzerinde çalışan bütün modelleri değişmeden kullanılır. İç içe `children` kullanılmaz.
- **ERP.** `PageShell` içinde yeni bir `FreeTemplate` dalı. Sekme varsa sekme çubuğu, bölümler kutu genişliğine göre kolon azaltır (Kayıt kartının `sectionColumns` kuralı). Bileşenler bugünkü `renderComponent` ile çizilir.
- **Studio.** Saf bir `freeModel.ts` ve sekmesiz bir `FreePanel` (sayfa ve bölüm ayarları). Bileşenlerin kendisi 5a panelleriyle açılır. Yeni sayfa penceresindeki "Serbest" seçimi artık bu kalıbı kurar. Eski kalıpsız tasarımcı ayrı bir seçenek olarak kalır.

**Tech Stack:** .NET 10 minimal API (şema doğrulayıcı), xUnit; React + Vite + TypeScript, vitest (erp-web: jsdom ve `@testing-library`; development-studio: `renderToString` ve saf fonksiyonlar).

**Spec:**
- `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md`: §6.1 (dört basamaklı merdiven, 3. basamak), §6.2, §6.4 (Sekme → Bölüm, 1/2/3 kolon), §6.5, §7 (5. madde), §9, §10.
- Alt proje 4 tasarımı: `docs/superpowers/specs/2026-11-25-kayit-karti-design.md` ("Serbest gövde 5. projeye kalır… Sekme → Bölüm çizimi orada yeniden kullanılır").
- Taslaklar: `03-bilesenler.html` (onaylı), `08-kayit-karti.html` (onaylı), `09-serbest-govde.html` (onaylı, 2026-11-26).

## Kapsam (benim kararım, kullanıcı 2026-11-26 kapsamı bana bıraktı)

- **Bu planda:**
  - `free` kalıbı: biçim, sunucu kuralları, ERP çizimi, Studio paneli, yeni sayfa penceresi, Ekranlar listesinde "Serbest · 3. basamak".
  - Serbest gövdede Metin, Bilgi kutusu, Gösterge, Görsel (5a panelleri) ve salt okunur **Liste** (katalog kaynağından tablo).
  - **Bölümler** bileşeni: serbest gövdede yeni bölüm ekler; sekmeler sayfa panelinden yönetilir.
  - Serbest gövdede sayfa eylemleri: parametresiz, `target: page` katalog eylemleri işlem çubuğuna konur.
  - Kayıt kartının ek alanlarında (`above` / `below`) 5a panelleri; metindeki alanlar ve "Kayıttaki resim" kaydın kolonlarından gelir.
- **Bu planda yok (gerekçesiyle):**
  - **Form, Kayıt özeti ve Kayıt kartındaki satır tablosu** ayrı bileşen olarak açılmaz: bunlar Kayıt kartının kendisidir (alt proje 4). Palette, Kayıt kartı dışındaki sayfalarda gerekçeyle soluk kalırlar.
  - **Düzenlenebilir satır tablosu** (satır ekle/sil, toplamlar): Belge kalıbının işi, alt proje 6 (PR #180).
  - **Adımlar** (sihirbaz): Sihirbaz kalıbı ayrı plan.
  - **Sürükle-bırak**: bileşen ve bölüm sırası panelden "Yukarı / Aşağı" ile değişir. Tuvalde sürükle-bırak sonraki adım.
  - **Serbest sayfayı tek adımda kalıba taşıma** (§6.1): toplu geçişle (5b) birlikte.
  - **Liste'de satır eylemleri, çift tıklama, arama, süzgeç**: serbest gövdedeki Liste salt okunur özet tablodur. Tam liste için Liste kalıbı kullanılır.
  - **Yazılımcı bileşeni**: ayrı katalog planı.

## Onaylı belgelerden sapmalar

Taslak 03, 5a palet metinleri ve tasarım belgesi §7, Form, Satır tablosu, Kayıt özeti ve Bölümler'in (Adım dahil) bu planda geleceğini söylüyordu. Kullanıcı kapsamı bana bıraktı; ayrıldığım noktalar:

| Konu | Onaylı belgede | Bu planda | Neden |
|---|---|---|---|
| Form, Kayıt özeti | Ayrı bileşen ve panel | Kayıt kartının kendisi; başka kalıpta soluk | Alt proje 4 bunları Kayıt kartı panelinde kurdu; serbest gövdede kayıtsız form yazma kuralı yok |
| Satır tablosu | Düzenlenebilir, ekle/sil, toplamlar | Belge kalıbına (alt proje 6) | Satır hesapları belge modelinin işi |
| Bölümler → Adım | Sekme ya da Adım | Yalnız sekme ve bölüm | Sihirbaz kalıbı ayrı plan |
| "Serbest" seçimi | "Serbest (bugünkü tasarımcı)" = kalıpsız | Yeni `free` kalıbı; kalıpsız "Eski tasarımcı" adıyla kalır | 3. basamak kabuk içinde Sekme → Bölüm (§6.1) |

Görev 1 taslak 03'ün notlarını da bu sapmalara göre günceller.

## Taban dal

- Dal: `claude/serbest-govde-5c`, `origin/master` `daca0431`'den (alt proje 4 ve 5a birleşik).
- Alt proje 6 (PR #180) birleşirse `origin/master` bu dala birleştirilir. `TenantCustomPageSchema.cs` ve `CustomPagesPage.tsx` çakışabilir.
- Bu plan migration eklemez.

## Global Constraints

- **Eski sayfalar değişmez.** `template`'siz sayfaların, Liste ve Kayıt kartı kalıplı sayfaların ve sistem standartlarının ERP çıktısı aynı kalır. `legacyUnchanged` anlık görüntüleri güncellenmeden yeşil kalır. Liste ve Kayıt kartı testleri değişmeden geçer.
- **`template`:** kabul edilen adlar `list`, `record`, `free`. Fazladan anahtar reddedilir. Hata metni: `"Kalıp yalnız \"list\", \"record\" ya da \"free\" olabilir."` (bugünkü iki adlı metnin yerine; o metni bekleyen testler güncellenir).
- **Serbest gövdede yerler (`slot`):**

  | slot | tip | kural |
  |---|---|---|
  | `actions` | `button` | 0..8, işlem çubuğunda; ilk düğme ana düğme |
  | `tabs` | `tabs` | 0..1; varsa her bölüm tam bir sekmede (`Etiket=bölüm1,bölüm2`) |
  | `block` | `section` | 1..20; `members`: üye bileşen kimlikleri (0..12), `columns`: 1 / 2 / 3 |
  | `item` | `heading`, `text`, `label`, `section`, `alert`, `card`, `list`, `metric`, `progress`, `badge`, `image`, `dataTable` | her biri tam bir bölümün `members`'ında |

  - `section` tipi hem bölüm (`slot: block`) hem "Alt başlık" metni (`slot: item`) olabilir; ayrımı `slot` yapar.
  - Yasaklar (Liste ve Kayıt kartındaki gibi): `width`, `widthWhen`, `actionBar`, `spacer`, `divider`. `children` dizisi serbest gövdede boş olmayan hiçbir bileşende bulunamaz.
  - `item` yerindeki `dataTable`'ın `query`'si `kind: "read"` bir sorgu olmalı.
  - `item` yerindeki `card`'da `variant: "panel"` yasak.
- **Hata metinleri** (sunucu, Türkçe):
  - `"Serbest gövdede en az bir bölüm (section) olmalı."`
  - `"Serbest gövdede en fazla bir sekme bileşeni (tabs) olabilir."`
  - `"Serbest gövdede her bileşen tam bir bölüme ait olmalı."`
  - `"Serbest gövdede sekme varsa her bölüm tam bir sekmede yer almalı."`
  - `"Serbest gövdede bir bölüm en fazla 12 bileşen içerebilir."`
  - `"Serbest gövdede iç içe bileşen (children) kullanılmaz; bileşenler bölümün üyeleri olarak eklenir."`
  - Yanlış yerdeki tip için Liste'deki kalıp: `'{slot}' yerine '{type}' bileşeni konamaz; bu yere yalnız '{expected}' konabilir.` (`item` için `expected` = izinli tiplerin virgüllü listesi).
- **Sunucuda bugün olmayanlar (2026-11-26'da `TenantCustomPageSchema.cs`'te doğrulandı), Görev 2 ekler:**
  - `columns` sayısı bugün yalnız `formCard` / `customFieldsBlock`'ta 1–3 diye denetleniyor; `dataTable`'da ise kolon listesi. Serbest gövdenin bölümünde (`section`, `slot: block`) `columns` 1 / 2 / 3 sayı olarak kabul edilir ve denetlenir; başka `section`'da `columns` bugünkü gibi kalır.
  - `pageSize` bugün yalnız Liste'nin `slot: list` ve Kayıt kartının `slot: lines` tablosunda kabul ediliyor (`templateListTable`). Serbest gövdenin `slot: item` tablosu da eklenir (10 / 25 / 50 / 100).
  - Sekmeler: bugünkü `tabs` doğrulayıcısı 1–8 `Etiket=kimlik,…` öğesi ister. Serbest gövdede **boş sekme yoktur**: yeni sekme her zaman içinde bir bölümle oluşur (Karar 2), son bölümü taşınan sekme silinir.
- **Yeni özellik:** `members` (yalnız `schemaVersion: 2`, yalnız `slot: "block"` olan `section`'da; 0..12 farklı kimlik). Başka yerde: `"'members' yalnız serbest gövdenin bölümünde kullanılabilir."` Studio `managedKeys`'e eklenir.
- **Bölümün `columns`'u:** 1 / 2 / 3, varsayılan 2. Yerleşim Kayıt kartıyla aynı: kutu > 720 px seçilen sayı, ≤ 720 px en çok 2, ≤ 480 px 1. Liste, Görsel ve çok maddeli Bilgi kutusu her zaman tam satır.
- **Basamak:** `free` kalıplı sayfa her zaman 3. Ekranlar listesinde "Serbest · 3. basamak".
- **Danışman panelinde teknik terim yok** (§3): `members`, `slot`, kimlik, `{{…}}`, tip adları görünmez.
- **Studio testleri CI'da koşmaz:** her Studio görevinde yerelde `npm test` ve `npm run build` çalıştırılır.
- **Dağıtım sırası:** platform-api ve erp-web önce, development-studio sonra.

## Kararlar (benim kararlarım; kullanıcı düzeltebilir)

1. **Ad `free`.** Yeni sayfa penceresinde "Serbest" bu kalıbı kurar (`PAGE_TEMPLATE_CHOICES`'te `free`). Bugünkü kalıpsız tasarımcı yeni bir seçenek olur: `{ id: "legacy", label: "Eski tasarımcı (kalıpsız)", description: "Sistem ekranlarına benzeyen gelişmiş sayfalar için." }`, en sonda.
2. **Yeni serbest sayfa:** tek sekmesiz bölüm, başlığı "Bölüm 1", 2 kolon, üyesiz. Sekme yoktur. İlk "Sekme ekle" iki sekme kurar: "Genel" (bütün mevcut bölümler) ve yeni sekme (içinde yeni boş bir bölüm). Sonraki her "Sekme ekle" yeni sekmeyi yeni boş bir bölümle kurar; boş sekme hiç oluşmaz. Bir bölüm başka sekmeye taşınınca boş kalan sekme kaldırılır; tek sekme kalırsa sekme bileşeni de kaldırılır.
3. **Bölüm silme:** üyesi olan bölüm silinemez; panel nedenini söyler: `"Önce bu bölümdeki bileşenleri kaldırın ya da başka bölüme taşıyın."` Son bölüm de silinemez: `"Serbest gövdede en az bir bölüm olmalı."`
4. **Sekme silme:** sekmedeki bölümler önceki sekmeye (yoksa sonrakine) taşınır. Son sekme silinince sekme bileşeni kaldırılır ve sayfa sekmesiz olur.
5. **Bileşen ekleme:** palette bir öğeye basılınca bileşen **seçili bölüme**, seçili bölüm yoksa seçili bileşenin bölümüne, o da yoksa son bölüme, sona eklenir. Bölüm doluysa (12) ekleme yapılmaz ve neden gösterilir: `"Bu bölüm dolu; yeni bir bölüm ekleyin."`
6. **Bileşen taşıma:** bileşen panelinin Ad bölümünün altında "Bölüm" seçimi (bölüm adları) ve "Yukarı / Aşağı" düğmeleri. Sıra `members` dizisindeki sıradır.
7. **Serbest gövdedeki Liste:** yalnız parametresiz katalog kaynağı (Gösterge'deki kural). Panel: kaynak, kolonlar (ilk 6 işaretli, sıralanabilir, başlık değiştirilebilir), sayfa başına (10 / 25 / 50), liste boşken yazılacak. Satır eylemi, çift tıklama, arama ve süzgeç yok.
8. **Sayfa eylemleri:** sayfa panelinde "Eylemler": `target: page` ve parametresiz katalog eylemleri. Seçilen eylem bir `button` (`slot: actions`, `actionType: "query"`, `confirmText` katalogdan) olur. İlk düğme ana düğmedir, silme türündeki eylem en sağdadır (ortak kabuk kuralı).
9. **Kayıt kartının ek alanları:** 5a panelleri Kayıt kartında da `above` / `below` bileşenlerinde açılır. Metindeki alanlar ve "Kayıttaki resim" kaydın kaynağının kolonlarından gelir: `{{kayit.rows[0].<kolon>}}`. Göstergenin yeri yalnız "Kartın üstü / Kartın altı".
10. **Palet:** serbest sayfada kullanılabilir olanlar: Metin, Bilgi kutusu, Gösterge, Liste, Bölümler, Görsel. Soluk olanlar ve gerekçeleri:
    - Form, Kayıt özeti: `"Bu bileşen Kayıt kartı kalıbında kullanılır."`
    - Satır tablosu: `"Düzenlenebilir satırlar Belge kalıbıyla gelecek."`
    - Butonlar: `"Düğmeleri sayfa panelindeki Eylemler bölümünden ekleyin."`
    - Yazılımcı bileşeni: 5a'daki metin.

    Kayıt kartında palet 5a'daki gibidir; Form, Kayıt özeti ve Satır tablosu gerekçe olarak `"Kartın kendi alanlarını sol listeden ekleyin."` gösterir.

## Review Focus

1. **Bölümden son bileşeni kaldırmak.** Bölüm boş kalır, silinmez; sunucu boş bölümü kabul eder (`members: []`). ERP'de boş bölüm yalnız tuvalde yer tutucuyla görünür, canlı sayfada hiç çizilmez. Test: Görev 2, 3 ve 4.
2. **Kaynağı katalogdan kaldırılan Liste ya da Gösterge.** ERP'de o bileşen hata kutusu gösterir, bölüm ve sayfanın geri kalanı çizilir. Studio panelinde "Katalogda yok". Test: Görev 3 ve 6.
3. **Sekmeli sayfada sekme silmek.** Hiçbir bölüm sekmesiz kalmaz; tanım sunucuda geçerli kalır. Test: Görev 4.
4. **Dar ekranda 3 kolonlu bölüm.** 600 px'te 2 kolon, 400 px'te 1 kolon; Liste her genişlikte tam satır ve kendi kutusunda yatay kayar. Test: Görev 3.
5. **Eski ve diğer kalıplı sayfalar.** Kalıpsız sayfa, Liste ve Kayıt kartı sayfaları önceki çıktıyı birebir verir; "Eski tasarımcı" seçeneği bugünkü kalıpsız sayfayı kurar. Test: Görev 3 ve 5.

---

## Görev 1 — taslak (controller yapar, alt ajan değil)

### Task 1: Taslak `09-serbest-govde.html` ve onay

**Files:**
- Create: `docs/design-proposals/studio-sadelestirme/09-serbest-govde.html` (03 ve 08'in görsel dili ve tıklanabilirliği)
- Modify: `docs/design-proposals/studio-sadelestirme/03-bilesenler.html` (Form, Satır tablosu, Kayıt özeti, Bölümler notları "Onaylı belgelerden sapmalar"a göre)

- [x] **Step 1:** Taslağı çiz. Göstermesi gerekenler:
  - Yeni sayfa penceresi: Liste / Kayıt kartı / Serbest / Eski tasarımcı (kalıpsız).
  - Tuvalde serbest sayfa: kabuk (başlık, işlem çubuğu), iki sekme, sekmede iki bölüm (2 ve 3 kolon), içinde Metin, Gösterge, Bilgi kutusu, Liste, Görsel.
  - Sayfa paneli: Ad, Sekmeler (ekle, adlandır, sil), Eylemler.
  - Bölüm paneli: Başlık, Kolon sayısı (1/2/3), Yukarı/Aşağı, Sil (nedenli devre dışı hali), Görünüm (ne zaman görünsün, mobilde gizle).
  - Bileşen panelinde "Bölüm" seçimi ve Yukarı/Aşağı.
  - Liste paneli (serbest gövde): kaynak, kolonlar, sayfa başına, boşken metin.
  - Palet: kullanılabilir ve soluk öğeler, gerekçeleriyle.
  - Üç genişlikte (1280 / 768 / 375) bölümlerin kolon azalması.
- [x] **Step 2:** Tarayıcıda her etkileşimi hatasız aç.
- [x] **Step 3:** Kullanıcıya göster ve onay al. Değişiklik istenirse taslağı ve bu planı birlikte güncelle.
- [x] **Step 4: Commit** — `docs: serbest gövde taslağı (alt proje 5c)`

## PR A — sunucu ve ERP (Görev 2–3)

### Task 2: Şema — `free` kalıbı ve `members`

**Files:**
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateRules.cs` (`FreeSlots`, `ValidateFree`, `DeclaredName`/`TemplateName` üç ad, `UnknownTemplate` metni)
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs` (`SafePropsV2`'ye `members`; `members` doğrulaması)
- Modify: `src/Hosts/AIERP.Api/PageTemplates/PageTemplateSummary.cs` (Ekranlar listesi: `free` → basamak 3)
- Test: `tests/IntegrationTests/TenantCustomPageSchemaFreeTemplateTests.cs` (yeni; `TenantCustomPageSchemaRecordTemplateTests.cs` kurulum kalıbı), `PageTemplateSummaryTests.cs` (genişletilir), eski `UnknownTemplate` metnini bekleyen testler

**Interfaces:**
- Produces: Global Constraints'teki `free` biçimi ve hata metinleri, sunucunun kabul ettiği haliyle. `PageTemplateSummary` `free` için `{ template: "free", level: 3 }`.

- [ ] **Step 1: Write the failing tests**
  - `Free_page_with_one_empty_block_is_valid`
  - `Free_page_without_block_is_rejected`
  - `Free_item_outside_any_block_is_rejected` / `Free_item_in_two_blocks_is_rejected`
  - `Free_block_outside_tab_is_rejected_when_tabs_exist` / `Free_page_without_tabs_is_valid`
  - `Free_second_tabs_is_rejected`
  - `Free_block_with_13_members_is_rejected`
  - `Free_children_are_rejected`
  - `Free_item_of_type_formCard_is_rejected_with_expected_list`
  - `Free_item_dataTable_needs_read_query`
  - `Free_panel_card_item_is_rejected`
  - `Members_outside_free_block_is_rejected`
  - `Free_block_columns_must_be_1_to_3` / `Section_columns_outside_free_block_unchanged`
  - `Free_item_table_accepts_pageSize_10_25_50_100`
  - `Free_empty_tab_is_rejected`
  - `Width_actionBar_spacer_divider_are_rejected_on_free_page`
  - `Unknown_template_message_names_three_templates`
  - `Summary_reports_free_as_level_3`
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchemaFreeTemplateTests|FullyQualifiedName~PageTemplateSummaryTests"` → FAIL.
- [ ] **Step 3:** Implement. Sekme ve bölüm üyeliği denetimi Kayıt kartındaki yardımcıları (`StringArray`, sekme ayrıştırma) yeniden kullanır.
- [ ] **Step 4:** Aynı filtre PASS; ardından `--filter "FullyQualifiedName~TenantCustomPageSchema|FullyQualifiedName~PageTemplate"` PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): serbest gövde kalıbı biçimi ve doğrulaması`

### Task 3: ERP — serbest gövdenin çizimi

**Files:**
- Modify: `frontend/erp-web/src/page-templates/pageTemplate.ts` (`free` adı)
- Create: `frontend/erp-web/src/page-templates/freeTemplateModel.ts`, `FreeTemplate.tsx`
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (`free` kalıbında `FreeTemplate` dalı; Liste ve Kayıt kartı dalları değişmez)
- Modify: `frontend/erp-web/src/page-templates/page-templates.css`
- Test: `frontend/erp-web/src/page-templates/freeTemplateModel.test.ts`, `FreeTemplate.test.tsx`, `FreeTemplateResponsive.test.tsx`

**Interfaces:**
- Produces:
  - `type FreeBlock<C> = { block: C; members: C[] }`, `type FreeTab<C> = { label: string; blocks: FreeBlock<C>[] }`
  - `type FreeLayout<C> = { actions: C[]; tabs: FreeTab<C>[] | null; blocks: FreeBlock<C>[] }` (sekmesizse `tabs: null`, `blocks` sırayla)
  - `hasFreeSlot(components: Component[]): boolean` (en az bir `block`)
  - `layoutFreeTemplate<C>(components: C[]): FreeLayout<C>` — `members` kimlikleri üye bileşenlere çözülür; bilinmeyen kimlik atlanır.
  - `<FreeTemplate layout render title crumbs actions notices />`: `PageShell` içinde sekme çubuğu (varsa) ve bölümler. Bölüm: başlığı varsa `h3`, kutuya göre kolon (`sectionColumns` Kayıt kartından yeniden kullanılır), tam satır tipler (`dataTable`, `image`, maddeli `alert`/`card`/`list`) `grid-column: 1 / -1`. Boş bölüm tuvalde "Bu bölüme bileşen ekleyin." yer tutucusu, canlıda hiç çizilmez.
  - Sekme seçimi Kayıt kartındaki gibi `tabParam` ve tuvalin `showTab` olayıyla çalışır.
  - **Tuval işaretleri:** bölümler ve üyeler, Kayıt kartındaki `recordBlockRuntime` / `RecordTemplate` yolunun eşiyle, `render(component)` üzerinden (yani `renderComponent` → `Anchored`) çizilir. Böylece Studio tuvalinde bölüm de bileşen de seçilebilir. Bölümün kendi kutusu `render(block)` ile, ızgarası bir çalışma zamanı kancasıyla (`free.block`, `record.block` gibi) kurulur.
  - **`hideOnMobile`:** bölüm ve üyelerde dar kipte (kutu ≤ 480 px) uygulanır (bugün yalnız `ListTemplate` uyguluyor).

- [ ] **Step 1: Write the failing tests**
  - `layoutFreeTemplate groups members by block and blocks by tab`
  - `layoutFreeTemplate without tabs keeps block order`
  - `unknown member id is skipped`
  - `FreeTemplate renders shell actions, tab bar and sections`
  - `empty block renders placeholder only on canvas` (Review Focus 1)
  - `three-column block shows 2 columns at 600px and 1 at 400px` (Review Focus 4)
  - `dataTable member spans full row`
  - `blocks and members carry canvas anchors`
  - `hideOnMobile block and member are hidden in narrow mode`
  - `missing catalog source shows error in that member only` (Review Focus 2)
  - `list and record pages render as before` (Review Focus 5; `ListTemplate` ve `RecordTemplate` testleri değişmeden geçer)
- [ ] **Step 2:** erp-web'de `npx vitest run src/page-templates/freeTemplateModel src/page-templates/FreeTemplate` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Aynı komut PASS; `npx vitest run src/page-templates` (anlık görüntüler güncellenmeden), `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): serbest gövde kalıbının çizimi`

## PR B — Studio (Görev 4–8)

Bütün yollar `frontend/development-studio/src/platform-tools/erp-src/` altındadır.

### Task 4: `freeModel.ts` — saf düzenleme fonksiyonları

**Files:**
- Modify: `page-designer/pageTemplates.ts` (`PageTemplate` `free` ile; `readPageTemplate`; `newFreeTemplateDefinition()`; `templateLevel` free → 3; `templateLabel` → "Serbest"; `PAGE_TEMPLATE_CHOICES` Karar 1)
- Create: `page-designer/panel/freeModel.ts`
- Modify: `page-designer/panel/templateGuards.ts` (`FREE_TEMPLATE_SLOTS`; `ensureTemplateSlots` `free`'de yeri olmayan bileşeni son bölüme `item` olarak ekler)
- Test: `page-designer/panel/freeModel.test.ts`, `page-designer/pageTemplates.test.ts` (genişletilir), `page-designer/panel/templateGuards.test.ts` (genişletilir)

**Interfaces:**
- Consumes: `ModelDefinition`, `ModelComponent` (`listPanelModel`); `createConsultantComponent`, `isCreatableKind` (`consultantPalette`); `freeId` (`listPanelModel`).
- Produces (hepsi yeni tanım döner, girdiyi değiştirmez):
  - `FREE_BLOCK_FULL = "Bu bölüm dolu; yeni bir bölüm ekleyin."`, `FREE_BLOCK_NOT_EMPTY`, `FREE_LAST_BLOCK` (Karar 3 metinleri), `MAX_BLOCK_MEMBERS = 12`, `MAX_FREE_BLOCKS = 20`, `DEFAULT_BLOCK_TITLE = "Bölüm"`
  - `freeBlocks(def): ModelComponent[]` (sıralı), `blockOf(def, itemId): string | null`, `freeTabs(def): { label: string; blockIds: string[] }[] | null`
  - `addBlock(def, afterBlockId?: string): { def; blockId }` — başlık "Bölüm N", 2 kolon; sekme varsa `afterBlockId`'nin sekmesine (yoksa ilk sekmeye) girer.
  - `removeBlock(def, blockId): { def } | { reason: string }`
  - `setBlockTitle`, `setBlockColumns(def, id, 1|2|3)`, `moveBlock(def, id, -1|1)`
  - `addTab(def, label?)`, `renameTab(def, index, label)`, `removeTab(def, index)` (Karar 4), `moveBlockToTab(def, blockId, tabIndex)`
  - `addItem(def, kind: CreatableKind | "table", target: { blockId?: string; nearItemId?: string }): { def; itemId } | { reason: string }` (Karar 5; `"table"` → slot `item` boş `dataTable`)
  - `moveItem(def, itemId, -1|1)`, `moveItemToBlock(def, itemId, blockId)`, `removeItem(def, itemId)`
  - `addPageAction(def, action: CatalogAction): D`, `removePageAction(def, code)`, `pageActionUsable(action): Usable` (Karar 8)

- [ ] **Step 1: Write the failing tests**
  - `newFreeTemplateDefinition has one untitled-numbered block with two columns and passes ensureTemplateSlots unchanged`
  - `addItem goes to selected block, then item's block, then last block`
  - `addItem into full block returns reason`
  - `removeBlock with members returns reason; last block returns reason`
  - `first addTab creates Genel with existing blocks and a new tab with a new empty block` / `later addTab always brings a block` (boş sekme yok)
  - `removeTab moves blocks to previous tab` / `removing down to one tab removes tabs component` (Review Focus 3)
  - `moving the only block out of a tab removes that tab`
  - `moveItemToBlock keeps every item in exactly one block`
  - `removeItem leaves empty block in place` (Review Focus 1)
  - `pageActionUsable rejects row, bulk and parameterised actions`
  - `functions never mutate input`
  - `templateLevel of free is 3; label is Serbest; choices include legacy last`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/freeModel src/platform-tools/erp-src/page-designer/pageTemplates` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(studio): serbest gövde modeli`

### Task 5: Yeni sayfa penceresi, Ekranlar listesi ve palet

**Files:**
- Modify: `page-designer/NewPageDialog.tsx` (Serbest → `newFreeTemplateDefinition`; Eski tasarımcı → bugünkü kalıpsız sayfa)
- Modify: `pageCatalogModel.ts` ve Ekranlar tablosu (`LowCodeDesignerPage.tsx`) — "Serbest · 3. basamak", kalıp süzgecinde "Serbest"
- Modify: `page-designer/panel/consultantPalette.ts` (`consultantAvailability(kind, template)`; Karar 10 metinleri; `"sections"` ve `"list"` serbest gövdede kullanılabilir)
- Modify: `CustomPagesPage.tsx` (paletten ekleme `free`'de `freeModel.addItem` / `addBlock` ile; Kayıt kartında 5a kuralı)
- Test: `page-designer/panel/consultantPalette.test.ts` (genişletilir), `NewPageDialog` testi (varsa genişletilir, yoksa `pageTemplates.test.ts`'te seçim eşlemesi), `pageCatalogModel` testi

**Interfaces:**
- Consumes: Task 4.
- Produces: `consultantAvailability(kind: ConsultantKind, template: "list" | "record" | "free"): Availability` (5a'daki tek parametreli çağrılar `"list"` ile güncellenir).

- [ ] **Step 1: Write the failing tests**
  - `free palette enables text infoBox indicator list sections image`
  - `free palette disables form and recordSummary with record reason, lineTable with document reason, buttons with page-actions reason`
  - `record palette reasons for form recordSummary lineTable`
  - `list palette is unchanged from 5a`
  - `new page choice free creates free template; legacy creates templateless page` (Review Focus 5)
  - `catalog row shows Serbest · 3. basamak`
- [ ] **Step 2:** ilgili `npx vitest run …` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): serbest sayfa oluşturma, Ekranlar'da basamak ve palet`

### Task 6: Serbest gövde paneli ve serbest Liste paneli

**Files:**
- Create: `page-designer/panel/FreePanel.tsx` (sayfa ve bölüm seçimleri), `page-designer/panel/FreeTablePanel.tsx`, `page-designer/panel/freeTableModel.ts`
- Test: `page-designer/panel/FreePanel.test.tsx`, `page-designer/panel/freeTableModel.test.ts`

**Interfaces:**
- Consumes: Task 4; `ComponentPanel`, `ProvidedByDeveloper`, `LegacySettings`, `AppearanceSection` (5a); `indicatorSourceUsable` (5a, parametresiz kaynak kuralı); `setColumns`, `missingCatalogCodes` (`listPanelModel`).
- Produces:
  - `type FreeSelection = { kind: "page" } | { kind: "block"; id: string }`
  - `freeSelectionOf(def, componentId: string | null): FreeSelection | null` (bileşen yoksa sayfa; `block` yerindeki bölüm; ötekiler null)
  - `<FreePanel def selection catalog disabled onChange onSelect visibility />`:
    - **Sayfa:** Ad, Sekmeler (ekle / adlandır / sil), Eylemler (Karar 8, kullanılamayan eylemler gerekçeyle soluk), Görünüm yok.
    - **Bölüm:** Başlık, Kolon sayısı 1/2/3, Sekme (sekme varsa), Yukarı / Aşağı, Sil (nedenli devre dışı), Görünüm (`AppearanceSection`).
  - `freeTableModel.ts` (alt proje 4'ün `addLines` yazımını örnek alır: `query`, `pageSize`, `title`; Liste kalıbının `chooseDataSource`'unu değil): `chooseTableSource(def, id, ds)` (parametresiz kaynak; okuma sorgusu ekler ya da paylaşır; ilk 6 kolon; eski kullanılmayan sorguyu siler), `setTablePageSize(def, id, 10|25|50)`, `setTableEmptyText(def, id, text)`, `tableOf(def, id)`
  - `<FreeTablePanel …/>`: Ne listelensin? → Kolonlar → Sayfa başına → Görünüm (boşken metin + ortak). Satır eylemi ve çift tıklama bölümü yok.

- [ ] **Step 1: Write the failing tests**
  - `freeSelectionOf maps page, block and item`
  - `page panel lists tabs and usable page actions only`
  - `block panel delete is disabled with reason when block has members`
  - `chooseTableSource rejects parameterised source and writes read query with first six columns`
  - `chooseTableSource removes orphaned previous query`
  - `table panel marks missing source as Katalogda yok` (Review Focus 2)
  - `panels have no tabs and no technical words`
  - `functions never mutate input`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/FreePanel src/platform-tools/erp-src/page-designer/panel/freeTableModel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(studio): serbest gövde paneli ve serbest Liste paneli`

### Task 7: Kayıt kartının ek alanlarında 5a panelleri

**Files:**
- Modify: `page-designer/panel/consultantText.ts` (`fieldTokens` Kayıt kartında kaydın kaynağının kolonları, bağlama `kayit.rows[0].<kolon>`)
- Modify: `page-designer/panel/indicatorPanelModel.ts` (`indicatorPlaces` Kayıt kartında `above` / `below`; etiketler "Kartın üstü / Kartın altı")
- Modify: `page-designer/panel/TemplateInspector.tsx` (Kayıt kartında `above` / `below` bileşenleri 5a panellerine)
- Test: `consultantText.test.ts`, `indicatorPanelModel.test.ts`, `TemplateInspector.test.tsx` (genişletilir)

**Interfaces:**
- Consumes: `recordQuery`, `RECORD_QUERY_ID` (`recordModel`).
- Produces:
  - `fieldTokens(def, catalog)` Liste'de bugünkü gibi, Kayıt kartında kaydın kolonları, serbest gövdede `[]`.
  - `indicatorPlaces`: Liste'de bugünkü gibi; Kayıt kartında `above` / `below`; serbest gövdede `[]` (yeri bölüm seçimi verir, Görev 8).
  - ImagePanel ve TextPanel: `tokens` boşsa "Kayıttaki resim" seçeneği ve "{ yazın" ipucu gizlenir (serbest gövdede seçili satır ya da kayıt yok).

- [ ] **Step 1: Write the failing tests**
  - `fieldTokens on record page binds to kayit.rows[0]`
  - `indicatorPlaces on record page are above and below only; on free page empty`
  - `image and text panels hide record options without tokens`
  - `record above text opens TextPanel with record tokens`
  - `record parts still open RecordPanel`
- [ ] **Step 2:** ilgili `npx vitest run …` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Kayıt kartının ek alanlarında danışman panelleri`

### Task 8: Panellerin tasarımcıya bağlanması ve bileşenin bölümü

**Files:**
- Modify: `page-designer/panel/TemplateInspector.tsx` (`free`: sayfa/bölüm → `FreePanel`; `item` → 5a panelleri ya da `FreeTablePanel`; `place` yerine "Bölüm" seçimi ve Yukarı / Aşağı)
- Modify: `page-designer/panel/ComponentPanel.tsx` gerekmez (`place` 5a'da var)
- Modify: `CustomPagesPage.tsx` (`free` sayfada `TemplateInspector`'a `free` bilgileri; bileşen seçili değilken sayfa paneli; `managedKeys`'e `members`)
- Test: `page-designer/panel/TemplateInspector.test.tsx` (genişletilir), `page-designer/panel/freeRoundTrip.test.ts` (yeni; `consultantRoundTrip.test.ts` kalıbı)

**Interfaces:**
- Consumes: Task 4–7.
- Produces: Serbest gövdede panel seçimi:

  | Seçim | Panel |
  |---|---|
  | bileşen yok | `FreePanel` sayfa |
  | `block` | `FreePanel` bölüm |
  | `item` + Metin / Bilgi kutusu / Gösterge / Görsel | 5a paneli, `place` = Bölüm seçimi + Yukarı / Aşağı |
  | `item` + `dataTable` | `FreeTablePanel` |
  | `actions` düğmesi | `FreePanel` sayfa (Eylemler) |
  | öteki | `ComponentPanel` + eski ayarlar |

- [ ] **Step 1: Write the failing tests**
  - `free inspector picks panel by selection`
  - `item panel shows block choice and moves item`
  - `round trip: every free setter then ensureTemplateSlots and reconcileDefinition keeps the definition server-valid` (sunucu kurallarının Studio eşi: her `item` tam bir bölümde, her bölüm sekmede, boş sekme yok, `children` yok, genişlik yok)
  - `round trip: 5a panel setters on a free item never write an above, below or indicators slot` (gösterge türü değişimi ve görsel kaynağı dahil)
  - `legacy, list and record pages keep their panels` (Review Focus 5)
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test`, `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): serbest gövdede panellerin bağlanması`

### Task 9: Uçtan uca doğrulama ve belgeler

**Files:**
- Modify: `docs/phase-status.md` (en üste yeni bölüm: yapılan, doğrulanan, doğrulanmayan)
- Modify: `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` §7, 5. madde (5c'nin yolu ve kapsam dışı bırakılanlar)

- [ ] **Step 1:** Tam testler: `dotnet test AIERP.slnx`; erp-web `npm test` + `npm run build`; development-studio `npm test` + `npm run build`. Yük altında zaman aşımına düşen .NET sınıfları tek başına yeniden çalıştırılır; sonuç olduğu gibi yazılır.
- [ ] **Step 2:** Tarayıcıda (gerçek arka uç ya da alt proje 3'ün sahte arka ucu varsa onunla): serbest sayfa oluştur, iki sekme ve üç bölüm kur, her bileşen türünden ekle, üç genişlikte (1280 / 768 / 375) bak; taslak 09 ile karşılaştır. Yapılamazsa "doğrulanmadı" diye yaz.
- [ ] **Step 3:** Panel sadeliği denetimi: yeni panellerin çıktısında `members`, `slot`, `{{`, kimlik ve tip adı geçmez.
- [ ] **Step 4: Commit** — `docs: serbest gövde (alt proje 5c) durumu`
