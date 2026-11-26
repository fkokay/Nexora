# Bileşen panelleri, birinci kısım (alt proje 5a) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Taslak onayı:** `03-bilesenler.html`, 2026-11-26'da plana göre güncellendi ve kullanıcı onayladı ([[design-approval-first]]). Ekranlar bu taslaktan sapmamalı.

**Goal:** Kalıplı sayfalarda (bugün Liste kalıbı) beş bileşenin, yani Metin, Bilgi kutusu, Gösterge, Görsel ve Butonlar'ın, eski sekmeli ayarlar yerine taslak 03'teki sekmesiz panelle ayarlanması. "＋ Ekle" paletinin kalıplı sayfada 30 tip yerine danışmanın 11 bileşenini göstermesi.

**Architecture:**
- **Biçim yalnız eklemeli genişler (§5.2-C).** Her danışman bileşeni bugünkü tiplerden birine yazılır (§6.2 tablosu). Yeni özellikler yalnız eksik olan davranışlar için eklenir.
- **Studio.** Her bileşen için saf bir `*PanelModel.ts` (girdiyi değiştirmez, yeni tanım döner; `listPanelModel` kalıbı) ve onu çağıran bir panel yazılır. Paneller alt proje 3'ün `ComponentPanel` kabuğunu kullanır. `TemplateInspector` bileşen tipine göre doğru paneli seçer. Panelin bilmediği özellikler `LegacySettings` kutusunda salt okunur görünür ve kayıtta korunur.
- **ERP.** Yeni özellikler `renderComponentBody` içindeki mevcut dallara eklenir. Özelliği taşımayan bileşenin çıktısı değişmez.

**Tech Stack:** .NET 10 minimal API (şema doğrulayıcı), xUnit; React + Vite + TypeScript, vitest (erp-web: jsdom ve `@testing-library`; development-studio: `renderToString` ve saf fonksiyonlar).

**Spec:** `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md`: §3 (anti-hedefler), §5.2-C, §6.2, §6.5 (Göstergeler ve işlem çubuğu maddeleri), §7 (5. madde), §9, §10. Taslak: `docs/design-proposals/studio-sadelestirme/03-bilesenler.html` (kullanıcı 2026-11-26 onayladı).

## Kapsam

Kullanıcı 2026-11-26'da alt proje 5'in üç plana bölünmesini seçti.

- **Bu planda (5a):**
  - Metin, Bilgi kutusu, Gösterge, Görsel ve Butonlar panelleri.
  - Kalıplı sayfada 11 bileşenli palet. Hazır olmayanlar gerekçesiyle soluk görünür.
  - Panellerde ortak **Görünüm** bölümü: *ne zaman görünsün*, *mobilde gizle*.
- **İkinci plan (5 devamı; alt proje 4 birleştikten sonra, kendi taslağıyla):**
  - Form, Satır tablosu, Kayıt özeti ve Bölümler panelleri. Bunlar alt proje 4'ün henüz yazılmamış `recordModel.ts` / `RecordPanel`'ine dayanır.
  - Serbest gövde (3. basamak). Taslağı yok, ayrı onay gerekir.
  - Kayıt kartı kalıbında Metin, Bilgi kutusu, Gösterge ve Görsel'in alan bağlamaları (Görev 4'teki `fieldTokens`'a kayıt sorgusu eklenir).
- **Ayrı katalog planı:** Yazılımcı bileşeni (katalogda `bilesenler` türü, ayar şeması, `code` bileşeninin katalogdan çizilmesi).
- **Bu planda yok:**
  - Görsel için dosya yükleme (kullanıcının kararı, 2026-11-26: ertelendi).
  - Gösterge için katalogda yeni "değer" türü (kullanıcının kararı: mevcut veri kaynakları kullanılır).
  - Eski tuvalin silinmesi (5b).
  - Belge kalıbının durumdan gelen düğmeleri (6).

## Taban dal

- Plan yalnız master'daki alt proje 3 koduna dayanır. Alt proje 4'e dayanmaz.
- **Alt proje 4'ün PR'ı (`claude/detay-ekrani-bb8e12`) master'a birleştiyse:** güncel `origin/master`'dan `claude/bilesen-panelleri-5a` dalını aç.
- **Birleşmediyse:** yine `origin/master`'dan aç. Alt proje 4 şu dosyaları da değiştiriyor: `TemplateInspector.tsx`, `CustomPagesPage.tsx`, `PageTemplateRules.cs`, `TenantCustomPageSchema.cs`. Hangisi sonra birleşirse çakışmayı o çözer. İki tarafın eklediği dallar korunur. `readPageTemplate` alt proje 4'te `record` adını da tanıyacak; bu planın panel seçimi kalıp adına değil bileşen tipine ve `slot`'a bakar, bu yüzden iki kalıpta da çalışır.
- Bu plan migration eklemez.

## Taslak 03'ten sapmalar

Taslak 03 kullanıcının kararlarından önce çizildi. Kullanıcının isteğiyle 2026-11-26'da aşağıdaki noktalarda plana uyacak şekilde güncellendi; tablo neyin değiştiğini kayıt için tutar. Kullanıcı güncel taslağı 2026-11-26 onayladı.

| Bileşen | Eski taslakta | Güncel taslakta ve bu planda | Neden |
|---|---|---|---|
| Görsel | "Dosya yükle" / "Kayıttaki resim" | "Adres" / "Kayıttaki resim" | Yükleme ertelendi (kullanıcının kararı) |
| Gösterge | "Geçen ayla karşılaştır" anahtarı | Anahtar + "neyle karşılaştırılsın?" kolonu, "önceki değere göre" | Değer veri kaynağından gelir; dönemi kaynak bilir |
| Gösterge | "birimi ve renk eşikleri" yazılımcıdan | Birim kolon türünden; renk eşiği yok | Katalogda eşik yok (kullanıcının kararı) |
| Metin | `{cari.unvan}` | `{Cari kodu}` (kolonun etiketi, listede seçili satır) | Danışman teknik ad görmez (§3) |
| Butonlar | Eylem çipleri + "Nerede? üstte / altta" | Eylem çipleri + sabit "Nerede?" notu; panel araç çubuğundaki düğme seçilince açılır | Kalıpta düğmelerin yeri sabittir (§6.1) |
| Form, Satır tablosu, Kayıt özeti, Bölümler, Yazılımcı bileşeni | Panelleri var | Listede soluk, panelin başında "sonraki planda" notu; ikinci plana ve katalog planına kaldı | Kullanıcının üç plan kararı |
| Gösterge | Yer seçimi yok | "Yeri": Göstergeler / Listenin üstü / Listenin altı (İlerleme ve Durum için yalnız üst ve alt) | Karar 4 |

## Global Constraints

- **Eski sayfalar değişmez.** `template` alanı olmayan sayfada palet, sekmeli ayar paneli ve ERP çıktısı bugünkü gibidir. `frontend/erp-web/src/page-templates/legacyUnchanged.test.tsx` anlık görüntüleri güncellenmeden yeşil kalır.
- **Kaldırılan tipler okunmaya devam eder.** `divider` ve `spacer` paletten kalkar (kalıplı sayfada zaten yasak). Kalıpsız sayfalarda bunları ERP çizmeye, eski panel ayarlamaya devam eder.
- **Eski tuval silinmez** (`CanvasPreviews.tsx`, `useCanvasSamples`, `canvasSamples`, `preview-samples.ts`; 5b'ye kaldı).
- **Danışman panelinde teknik terim geçmez:** sorgu adı, `{{…}}`, bileşen kimliği, tip adı (`alert`, `metric`…), 12'lik ızgara (§3). `LegacySettings` kutusu bunun tek istisnasıdır, başlığı "Eski ayarlar (salt okunur)".
- **Panel sırası (§6.2):** Ad → *Ne gösterilsin?* → temel ayarlar → Eylemler → kapalı **Görünüm**. Sekme ve açılır pencere yoktur. Teknik bilgi `ProvidedByDeveloper` notuyla gösterilir.
- **Yeni özellikler** (yalnız `schemaVersion: 2`; sunucu türlerini doğrular):

  | Özellik | Bileşen | Değerler |
  |---|---|---|
  | `textAlign` | `heading`, `text`, `label`, `section` | `"start"` \| `"center"` |
  | `items` | `alert`, `card` (bugün yalnız `list`) | en fazla 40 metin |
  | `dismissible` | `alert`, `card` | bool |
  | `compareValue` | `metric` | metin (bağlama olabilir) |
  | `size` | `metric` (bugün yalnız `dialog`'da doğrulanıyor) | `"sm"` \| `"lg"` |
  | `progressTotal` | `progress` | metin (bağlama olabilir) |

  Hata metinleri (tek ve Türkçe):
  - `"'textAlign' yalnız metin bileşenlerinde start veya center olabilir."`
  - `"Liste, bilgi ve bildirim bileşeni en fazla 40 metin öğesi içerebilir."` (bugünkü `"Liste bileşeni en fazla 40 metin öğesi içerebilir."` metninin yerine geçer).
  - `"'dismissible' yalnız bildirim ve bilgi kartında true veya false olabilir."`
  - `"'compareValue' yalnız göstergede en fazla 200 karakterlik metin olabilir."`
  - `"Göstergede 'size' sm veya lg olmalıdır."`
  - `"'progressTotal' yalnız ilerleme göstergesinde en fazla 200 karakterlik metin olabilir."`
- **Bağlanabilir metin:** `compareValue` ve `progressTotal` sunucunun `BindableProps` kümesine de eklenir. `text`, `title` ve `value` zaten bu kümede (2026-11-26'da doğrulandı). `size` bugün yalnız `dialog`'larda kullanılıyor; sistem standartlarında göstergede `size` yok (2026-11-26'da doğrulandı).
- **İçi dolu bileşenler eski panelde kalır.** `children` taşıyan bileşen ve `variant: "panel"` olan `card` (detay paneli) yeni panelde açılmaz. Tip değişikliği içeriği düşürmesin diye bunlar eski ayarlarla düzenlenir.
- **Studio `managedKeys`:** yeni altı özellik `CustomPagesPage.tsx` `managedKeys` kümesine eklenir. CI Studio testlerini çalıştırmaz. Her Studio görevinin sonunda yerelde `npm test` çalıştırılır.
- **Arayüz metinleri Türkçe.** Kodda kalıp adı `pageTemplate` / `PageTemplate` olarak kalır (alt proje 3 kuralı).
- **Dağıtım sırası:** platform-api ve erp-web önce, development-studio sonra.

## Kararlar

Kullanıcının kararları (2026-11-26): üç plana bölme; Gösterge değeri mevcut veri kaynaklarından; Görsel'de dosya yükleme ertelendi; taslak 03 uygulamadan önce gözden geçirilecek. Ötekiler benim kararlarım; kullanıcı düzeltebilir.

1. **Metin stili tipi değiştirir.**

   | Stil | Tip | Metnin yeri |
   |---|---|---|
   | Başlık | `heading` | `text` |
   | Alt başlık | `section` | `title` |
   | Paragraf | `text` | `text` |
   | Küçük etiket | `label` | `text` |

   Stil değişince bileşenin `id`, `name`, `slot` ve öteki özellikleri korunur. Yalnız `type` ve metnin anahtarı değişir. `heading`'in `pageTitle: true` özelliği varsa Metin paneli o bileşeni açmaz; sayfa başlığı kabuktan gelir.
2. **Metindeki alan.** Danışman `{Cari kodu}` yazar (sütunun katalog etiketi). Kayıtta bu ifade `{{<liste>.seciliSatir.<kolon>}}` olur. Alanlar Liste kalıbında listenin veri kaynağının kolonlarıdır. Tanınmayan `{…}` düz metin olarak kalır, bağlamaya çevrilmez. Kayıttaki, panelin tanımadığı `{{…}}` bağlaması panelde `{?}` olarak görünür ve metin değiştirilmeden kaydedilirse korunur. Değiştirilirse panel uyarır: "Bu metinde tanınmayan bir alan var; kaydedersen korunur."
3. **Bilgi kutusu.**
   - Tür: Bilgi / Uyarı / Başarılı → `alert` (`variant`: `info` / `warning` / `success`). Sade → `card`.
   - Madde listesi açıksa maddeler `items`'a yazılır, `text` korunur ama çizilmez.
   - Bugünkü `list` tipindeki bileşen de bu panelde açılır (Sade + madde listesi). Kayıtta tipi `list` olarak kalır. Danışman türü değiştirirse `alert` ya da `card` olur.
   - *Kullanıcı kapatabilsin* → `dismissible: true`. ERP'de kapatma yalnız o sayfa açıklığı boyunca sürer (bileşen durumu), saklanmaz.
4. **Gösterge değeri** (kullanıcının kararı). Yalnız parametresiz katalog veri kaynakları seçilebilir. Seçilemeyen: "Bu kaynak ek bilgi istiyor; göstergede kullanılamaz."
   - *Sayı*:
     - "Kayıt sayısı" seçilirse `metric.query` kaynağın sorgusuna bağlanır (bugünkü sayım yolu).
     - Bir kolon seçilirse `metric.value = "{{<sorgu>.rows[0].<kolon>}}"` olur. `format`, kolonun türünden gelir: `number` → `number`, `money` → `money`, öteki türler → `text`.
     - *Karşılaştır* açıksa ikinci bir kolon seçilir: `compareValue = "{{<sorgu>.rows[0].<kolon2>}}"`. ERP yüzde farkı gösterir: `▲ %12` (yeşil) ya da `▼ %12` (kırmızı). İki değerden biri sayı değilse ya da karşılaştırma değeri 0 ise fark gösterilmez.
   - *İlerleme* → `progress`. `value` bir kolon. *Hedef* kolonu isteğe bağlıdır (`progressTotal`). Hedef varsa yüzde = değer / hedef × 100, değilse değer yüzde kabul edilir. Altında "130 / 200" yazar.
   - *Durum* → `badge`, `text = "{{<sorgu>.rows[0].<kolon>}}"`. Varsa bugünkü `toneMap` korunur ve "Eski ayarlar" kutusunda görünür.
   - Kaynak sorgusu `{ id, name, kind: "read", dataSource, parameters: [], runOn: "load" }` olur. Aynı kaynağı kullanan iki gösterge aynı sorguyu paylaşır.
   - Liste kalıbında yeni gösterge `indicators` yerine konur. "Yeri" seçimi Göstergeler / Listenin üstü / Listenin altı arasındadır. Tip yerine uymazsa (ilerleme ve durum `indicators`'a konamaz) yalnız üst ve alt sunulur.
5. **Görsel** (kullanıcının kararı: yükleme yok).
   - *Görsel nereden?* Adres / Kayıttaki resim.
   - Adres → `value` (http ya da https). Geçersizse panelde "Adres http:// ya da https:// ile başlamalı." yazar.
   - Kayıttaki resim → `value = "{{<liste>.seciliSatir.<kolon>}}"`, kolon listenin veri kaynağından seçilir.
   - Yükseklik: Küçük 96 / Orta 160 / Büyük 280 (`height`). Başka bir sayı kayıtlıysa seçim boş görünür ve sayı korunur.
   - Açıklama → `title` (ERP `alt` olarak kullanır).
6. **Butonlar.**
   - Panel, tuvalde `actions` ya da `rowActions` yerindeki bir düğme seçilince açılır ve o yerin bütün düğmelerini bir grup olarak gösterir.
   - *Hangi eylemler?* Kullanılabilir katalog eylemleri. Ekleme ve kaldırma için `listPanelModel.addListAction` / `removeListAction` çağrılır, kurallar aynıdır.
   - *Ana buton* yalnız `actions` yerinde vardır. Seçilen düğme `actions` düğmelerinin ilk sırasına taşınır (alt proje 3 kuralı: ilk düğme ana düğmedir). Silme türündeki eylem ana buton olamaz.
   - *Nerede?* kalıpta sabittir. Panel yalnız bilgi verir: "Sil gibi geri alınamayan eylemler otomatik olarak en sağda durur. Dar ekranda ana buton dışındakiler “⋯” menüsüne girer."
   - Ek alanlarda (`above` / `below`) Butonlar bu planda eklenemez. Paletteki gerekçe: "Düğmeleri Liste panelindeki Eylemler bölümünden ekleyin."
7. **Palet.** Kalıplı sayfada palet 11 öğe gösterir ve gruplanmaz. Hazır olanlar ve oluşturdukları bileşen:

   | Öğe | Oluşan bileşen |
   |---|---|
   | Metin | `heading`, `{ text: "Başlık" }` |
   | Bilgi kutusu | `alert`, `{ variant: "info", title: "Bilgi", text: "" }` |
   | Gösterge | `metric`, `{ title: "Gösterge" }` |
   | Görsel | `image`, `{ title: "", value: "", height: 160 }` |

   Soluk görünenler ve gerekçeleri:
   - Liste: "Bu kalıpta tek liste vardır."
   - Form, Satır tablosu, Kayıt özeti, Bölümler: "Bu bileşen sonraki sürümde gelir."
   - Butonlar: Karar 6'daki metin.
   - Yazılımcı bileşeni: "Yazılımcı bileşenleri katalogdan gelecek; henüz hazır değil."
8. **Ortak Görünüm bölümü:**
   - *Ne zaman görünsün?* Bugünkü `VisibilityField` kullanılır (`visibleWhen`).
   - *Mobilde gizle* → `hideOnMobile`. ERP bunu Liste kalıbının kart kipinde zaten uygular.
   - Bileşene özgü ayarlar bu bölümün başında yer alır: Metin'de hizalama, Bilgi kutusunda *Kullanıcı kapatabilsin*, Gösterge'de boyut.

## Review Focus

1. **Stil değişince başka bileşenlerin bağlantısı.** Başka bir bileşen, Metin bileşenine kimliğiyle başvurur: sekme üyeliği, `visibleWhen` ya da bir kartın `inputs` listesi. Stil değişince bu başvurular kırılmamalı. Test: Görev 5.
2. **Düz metinde süslü parantez.** "Fiyat {indirimli} gösterilir" yazılır. Tanınmayan ifade bağlamaya dönüşmemeli, ERP'de olduğu gibi görünmeli. Eski bir `{{…}}` bağlaması panelden geçince kaybolmamalı. Test: Görev 4.
3. **Göstergenin kaynağı katalogdan kaldırılır.** ERP'de gösterge boş ya da hatalı çizilir, sayfanın geri kalanı çizilmeye devam eder. Studio panelinde kaynak "Katalogda yok" olarak işaretlenir (`missingCatalogCodes` gösterge sorgusunu da kapsar). Test: Görev 6.
4. **Sayı olmayan karşılaştırma değeri.** Kolon metin döner ya da karşılaştırma değeri 0'dır. Fark gösterilmez, sıfıra bölme olmaz, `NaN` yazılmaz. Test: Görev 2.
5. **Kalıpsız sayfa.** Palet 30 tiple ve gruplu kalır. Seçili bileşende sekmeli eski panel açılır. Yeni panel hiçbir kalıpsız sayfada görünmez. Test: Görev 3 ve Görev 8.

---

## PR A — sunucu ve ERP (Görev 1–2)

### Task 1: Şema — altı yeni özellik ve `items`'ın genişlemesi

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`
  - `SafePropsV2`: `textAlign`, `dismissible`, `compareValue`, `progressTotal`
  - `BindableProps`: `compareValue`, `progressTotal`
  - `items` kuralı (~769)
  - `size` doğrulaması: göstergede yeni dal, `dialog` dalı aynı kalır
- Test: `tests/IntegrationTests/TenantCustomPageSchemaComponentPanelTests.cs` (yeni; `TenantCustomPageSchemaListTemplateTests.cs`'teki kurulum kalıbını izler)
- Eski `items` hata metnini bekleyen bir test bugün yok (2026-11-26'da `tests` altında arandı). Yeni metin yalnız yeni testte beklenir.

**Interfaces:**
- Produces: Global Constraints tablosundaki altı özellik, sunucunun kabul ettiği biçimde. Hata metinleri Global Constraints'teki gibidir.

- [ ] **Step 1: Write the failing tests**
  - `Text_align_is_accepted_on_text_components` (`heading`, `text`, `label`, `section`; `start` ve `center`)
  - `Text_align_is_rejected_on_other_components_and_values` (`metric` üzerinde ve `"end"` değeriyle)
  - `Items_are_accepted_on_alert_and_card` / `Items_over_40_are_rejected_with_new_message`
  - `Dismissible_must_be_bool_on_alert_or_card`
  - `Compare_value_and_progress_total_accept_bindings_up_to_200_chars`
  - `Metric_size_accepts_sm_and_lg_only` / `Dialog_size_rules_are_unchanged`
  - `V1_page_with_new_props_is_rejected` (özellik `SafeProps`'ta değil)
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchemaComponentPanelTests"` → FAIL.
- [ ] **Step 3:** Implement. Doğrulamalar türe göre olur; başka türdeki bileşende özellik görülürse ilgili hata verilir.
- [ ] **Step 4:** Aynı filtre PASS. Ardından `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchema"` PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): bileşen panelleri için yeni özellikler (hizalama, maddeler, kapatma, karşılaştırma, hedef, boyut)`

### Task 2: ERP — yeni özelliklerin çizimi

**Files:**
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (`renderComponentBody`: `heading`, `text`, `label`, `card`/`section`, `alert`, `list`, `metric`, `progress` dalları)
- Modify: `frontend/erp-web/src/custom-page/MetricCard.tsx` (karşılaştırma satırı ve boyut)
- Create: `frontend/erp-web/src/custom-page/metricCompare.ts`
- Create: `frontend/erp-web/src/custom-page/DismissibleBox.tsx` (kapatma düğmesi ve durumu)
- Modify: `frontend/erp-web/src/tenant-custom-page.css`
- Test:
  - `frontend/erp-web/src/custom-page/metricCompare.test.ts`
  - `frontend/erp-web/src/custom-page/componentPanelProps.test.tsx`

**Interfaces:**
- Produces:
  - `metricCompare(value: unknown, compare: unknown): { direction: "up" | "down" | "flat"; percent: number } | null`
    - Sayıya çevrilemeyen değerde ya da `compare === 0` olduğunda `null` döner.
    - `percent` tam sayıya yuvarlanır ve mutlak değerdir.
  - `MetricCard`'a `compare?: { direction; percent } | null` ve `size?: "sm" | "lg"` eklenir. Karşılaştırma satırının metni `▲ %12` / `▼ %12` / `%0` olur, ardından " önceki değere göre" gelir.
  - `progress`: `progressTotal` sayıya çevrilebiliyorsa yüzde = `value / total × 100` (0–100 arasına sıkıştırılır). Altında `"{value} / {total}"` yazar. `value` bağlamayla da gelebilir (`bindProps` zaten çözer).
  - `textAlign: "center"` → `style.textAlign = "center"`.
  - `alert` / `card`, `items` doluysa `text` yerine `<ul>` çizer. `list` tipi değişmez.
  - `dismissible: true` → kutunun sağ üstünde `aria-label="Kapat"` düğmesi. Basılınca kutu o çizim boyunca gizlenir.

- [ ] **Step 1: Write the failing tests**
  - `metricCompare returns up 12 for 112 vs 100`
  - `metricCompare returns null for text or zero compare` (Review Focus 4)
  - `metric shows compare line and lg size`
  - `progress uses total when given and shows value over total`
  - `text align center applies to heading text label section`
  - `alert with items renders list instead of text`
  - `dismissible alert hides after Kapat`
  - `components without new props render as before` (özelliksiz `alert`, `metric`, `progress`, `heading` için çıktı eski çıktıyla aynı)
- [ ] **Step 2:** `npx vitest run src/custom-page/metricCompare src/custom-page/componentPanelProps` (erp-web içinde) → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Aynı komut PASS. Ardından `npx vitest run src/page-templates/legacyUnchanged` anlık görüntü güncellenmeden PASS. Son olarak `npm test` ve `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(erp): gösterge karşılaştırması, ilerleme hedefi, hizalama, maddeli ve kapatılabilir bilgi kutusu`

## PR B — Studio (Görev 3–9)

Bütün yollar `frontend/development-studio/src/platform-tools/erp-src/` altındadır.

### Task 3: Danışman paleti ve `managedKeys`

**Files:**
- Create: `page-designer/panel/consultantPalette.ts`
- Modify: `CustomPagesPage.tsx`
  - `managedKeys`'e altı yeni özellik
  - kalıplı sayfada `LeftPanel`'e `palette` yerine danışman paleti
  - `addComponent`: danışman öğesinden bileşen oluşturma; gösterge için `slot: "indicators"`
- Test: `page-designer/panel/consultantPalette.test.ts`

**Interfaces:**
- Produces:
  - `type ConsultantKind = "text" | "infoBox" | "indicator" | "list" | "form" | "lineTable" | "recordSummary" | "sections" | "buttons" | "image" | "developer"`
  - `CONSULTANT_PALETTE: { kind: ConsultantKind; label: string; description: string; icon: LucideIcon }[]`: taslak 03'teki sıra ve metinlerle 11 öğe (ör. Metin / "Başlık, açıklama, etiket").
  - `consultantAvailability(kind: ConsultantKind): { available: true } | { available: false; reason: string }`: Karar 7'deki metinler.
  - `createConsultantComponent(kind: "text" | "infoBox" | "indicator" | "image", id: string): { type: string; props: Record<string, PropValue> }`: Karar 7'deki tablo. `slot` eklenmez; yeri `addComponent` verir.
  - `consultantKindOf(component: ModelComponent): ConsultantKind | null`: §6.2 eşlemesi. `heading`/`text`/`label`/`section` → `text`; `alert`/`card`/`list` → `infoBox`; `metric`/`progress`/`badge` → `indicator`; `image` → `image`; `button` → `buttons`. Öteki tipler → `null`. Şunlar da `null` döner (eski panel): `heading` + `pageTitle: true`, `children` dizisi boş olmayan her bileşen ve `variant: "panel"` olan `card`.
  - `LeftPanel`'e `PaletteEntry` biçiminde verilir: `group` tek değer ("Bileşenler"), `disabled` ve `title` uygunluktan gelir.

- [ ] **Step 1: Write the failing tests**
  - `palette has eleven items in mockup order`
  - `only text infoBox indicator image are available` (diğerlerinin gerekçe metinleri birebir)
  - `createConsultantComponent returns expected type and props`
  - `consultantKindOf maps every current type per spec table` (`pageTitle` başlığı `null`)
  - `consultantKindOf returns null for components with children and for panel cards`
  - `managedKeys contains new props` (`designerInternals.managedKeys`)
  - `legacy page keeps full grouped palette` (Review Focus 5; `designerInternals.palette` ve `paletteGroups` değişmez)
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/consultantPalette` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(studio): kalıplı sayfada 11 bileşenli danışman paleti`

### Task 4: Metindeki alanlar — `{Etiket}` ile bağlama arasında çeviri

**Files:**
- Create: `page-designer/panel/consultantText.ts`
- Test: `page-designer/panel/consultantText.test.ts`

**Interfaces:**
- Consumes: `listPanelModel.findList`, `listDataSourceCode`; `ActiveCatalog`.
- Produces:
  - `type FieldToken = { label: string; binding: string }` (`binding` süslü parantezsiz: `liste.seciliSatir.Kod`)
  - `fieldTokens(def: ModelDefinition, catalog: ActiveCatalog | null): FieldToken[]`: Liste kalıbında listenin veri kaynağının kolonları, katalog etiketleriyle. Liste ya da katalog yoksa `[]`. (Kayıt kartı ikinci planda eklenir.)
  - `toConsultantText(stored: string, tokens: FieldToken[]): { text: string; unknown: boolean }`: tanınan `{{b}}` → `{Etiket}`, tanınmayan `{{…}}` → `{?}` ve `unknown: true`.
  - `fromConsultantText(text: string, tokens: FieldToken[], previous: string): string`
    - Tanınan `{Etiket}` → `{{b}}`. Tanınmayan `{…}` düz metin kalır.
    - `text`, `toConsultantText(previous)` sonucuyla aynıysa `previous` aynen döner. Böylece tanınmayan bağlama korunur (Karar 2).
    - Metin değiştiyse: metindeki n'inci `{?}`, `previous`'taki n'inci tanınmayan bağlamaya geri çevrilir. Fazladan `{?}` düz metin kalır. Silinen `{?}`'ların bağlamaları düşer.

- [ ] **Step 1: Write the failing tests**
  - `fieldTokens lists list source columns with labels`
  - `round trip keeps known binding`
  - `unknown curly text stays literal` (Review Focus 2: "Fiyat {indirimli}")
  - `unknown stored binding shows question mark and survives unchanged save`
  - `edited text restores nth question mark to nth unknown binding`
  - `removed question mark drops its binding; extra question mark stays literal`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/consultantText` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(studio): metinde alan yazımı`

### Task 5: Metin ve Bilgi kutusu panelleri

**Files:**
- Create:
  - `page-designer/panel/textPanelModel.ts`
  - `page-designer/panel/TextPanel.tsx`
  - `page-designer/panel/InfoBoxPanel.tsx`
  - `page-designer/panel/AppearanceSection.tsx`
- Test:
  - `page-designer/panel/textPanelModel.test.ts`
  - `page-designer/panel/TextPanel.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`fieldTokens`, `toConsultantText`, `fromConsultantText`); `ComponentPanel`, `LegacySettings`.
- Produces (`textPanelModel.ts`; hepsi yeni tanım döner):
  - `type TextStyle = "heading" | "subheading" | "paragraph" | "label"`
  - `textStyleOf(c: ModelComponent): TextStyle`
  - `setTextStyle<D>(def: D, id: string, style: TextStyle): D`: Karar 1. Metin `text` ile `title` arasında taşınır. `id`, `name`, `slot` ve öteki özellikler korunur.
  - `setTextContent<D>(def: D, id: string, stored: string): D`
  - `setTextAlign<D>(def: D, id: string, align: "start" | "center"): D`: `start` özelliği kaldırır.
  - `type InfoTone = "info" | "warning" | "success" | "plain"`
  - `infoBoxOf(c: ModelComponent): { tone: InfoTone; title: string; text: string; items: string[] | null; dismissible: boolean }`. `card` ve `list` için metin `text` boşsa `description`'dan okunur. Panelden yazılan metin, okunduğu anahtara geri yazılır.
  - `setInfoBox<D>(def: D, id: string, patch: Partial<{ tone: InfoTone; title: string; text: string; items: string[] | null; dismissible: boolean }>): D`: Karar 3. `list` tipi ancak tür değiştirilirse `alert`/`card` olur.
- `AppearanceSection({ extra, visibility, hideOnMobile, onHideOnMobile, disabled })`: Karar 8. `visibility`, `CustomPagesPage`'in verdiği `VisibilityField` düğümüdür.
- **TextPanel** (taslak 03 sırası): Stil (dört düğme) → Metin (çok satırlı; altında "Metin içine alan koymak için { yazın, örn. {Cari kodu}.") → Görünüm (hizalama + ortak). Eylemler bölümü: "Bu bileşenin eylemi yok."
- **InfoBoxPanel**: Tür → Başlık → Metin → *Madde listesi olarak göster* → (açıksa) Maddeler (her satır bir madde, en çok 40) → Görünüm (*Kullanıcı kapatabilsin* + ortak).
- Her iki panel en altta `LegacySettings`'i çizer. `known` kümesi panelin yazdığı özelliklerden ve `slot`, `visibleWhen`, `hideOnMobile`'dan oluşur.

- [ ] **Step 1: Write the failing tests**
  - `setTextStyle heading to subheading moves text to title and keeps id name slot`
  - `setTextStyle keeps tab membership and references` (Review Focus 1: `tabs` öğesi ve `visibleWhen` başvurusu aynı kalır)
  - `setTextAlign start removes prop`
  - `setInfoBox plain makes card and keeps title text`
  - `setInfoBox items on list keeps list type until tone changes`
  - `functions never mutate input`
  - `TextPanel renders parts in mockup order without tabs and without technical words` (çıktıda `{{`, `heading`, `alert` geçmez)
  - `InfoBoxPanel shows items area only when list toggle on`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/textPanelModel src/platform-tools/erp-src/page-designer/panel/TextPanel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Metin ve Bilgi kutusu panelleri`

### Task 6: Gösterge paneli

**Files:**
- Create:
  - `page-designer/panel/indicatorPanelModel.ts`
  - `page-designer/panel/IndicatorPanel.tsx`
- Test:
  - `page-designer/panel/indicatorPanelModel.test.ts`
  - `page-designer/panel/IndicatorPanel.test.tsx`

**Interfaces:**
- Consumes: `ActiveCatalog`, `CatalogDataSource`, `withOperationParameters`, `missingCatalogCodes`, `freeId` (bugün `listPanelModel.ts` içinde dışa açık olmayan bir işlev; bu görevde `export` edilir); Task 5 (`AppearanceSection`).
- Produces:
  - `type IndicatorKind = "number" | "progress" | "status"`
  - `INDICATOR_SOURCE_NEEDS_INPUT = "Bu kaynak ek bilgi istiyor; göstergede kullanılamaz."`
  - `indicatorSourceUsable(ds: CatalogDataSource): Usable`: Karar 4. ERP işlemine dayanan kaynakta engel nedeni `withOperationParameters`'tan gelir.
  - `type IndicatorState = { kind: IndicatorKind; source: string | null; column: string | "count" | null; compareColumn: string | null; totalColumn: string | null; size: "sm" | "lg" }`
  - `indicatorOf(def: ModelDefinition, id: string): IndicatorState`: kayıttan geri okur. Tanınmayan bağlamada `source: null` döner, eski değer `LegacySettings`'te görünür.
  - `setIndicatorKind<D>(def, id, kind): D`: `metric` / `progress` / `badge` arasında geçer. `id`, `name`, `title`, `slot` korunur. `indicators` yerindeki bir bileşen `progress` ya da `badge` olursa `slot: "above"` olur.
  - `chooseIndicatorSource<D>(def, id, ds: CatalogDataSource): D`: aynı `dataSource`'a bağlı bir okuma sorgusu varsa onu kullanır, yoksa ekler (`runOn: "load"`, `parameters: []`). Artık hiçbir bileşenin kullanmadığı eski gösterge sorgusu silinir.
  - `setIndicatorValue<D>(def, id, column: string | "count"): D`, `setIndicatorCompare<D>(def, id, column: string | null): D`, `setIndicatorTotal<D>(def, id, column: string | null): D`, `setIndicatorSize<D>(def, id, size): D`: yazılan özellikler Karar 4'teki gibidir. `format` kolon türünden gelir.
  - `indicatorPlaces(def: ModelDefinition, c: ModelComponent): ("indicators" | "above" | "below")[]`: Karar 4.
- **IndicatorPanel**: Tür (Sayı / İlerleme / Durum) → *Ne gösterilsin?* (kaynak listesi; kullanılamayanlar gerekçesiyle soluk; katalogdan kalkan kaynak "Katalogda yok") → Değer (kolon listesi; Sayı'da başta "Kayıt sayısı") → `ProvidedByDeveloper` ("Yazılımcının hazırladığı değer · birimi ondan gelir") → Sayı'da *Önceki değerle karşılaştır* + kolon, İlerleme'de *Hedef* kolonu → Yeri → Görünüm (Boyut Küçük / Büyük + ortak).

- [ ] **Step 1: Write the failing tests**
  - `indicatorSourceUsable rejects sources with any parameter`
  - `chooseIndicatorSource adds one load query and reuses it for a second indicator`
  - `chooseIndicatorSource removes orphaned previous query`
  - `setIndicatorValue count binds query; column writes value binding and money format`
  - `setIndicatorCompare writes compareValue and null removes it`
  - `setIndicatorKind progress moves out of indicators slot`
  - `indicatorOf round trips every setter`
  - `missingCatalogCodes reports removed indicator source` (Review Focus 3)
  - `IndicatorPanel marks missing source and has no technical words`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/indicatorPanelModel src/platform-tools/erp-src/page-designer/panel/IndicatorPanel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Gösterge paneli`

### Task 7: Görsel ve Butonlar panelleri

**Files:**
- Create:
  - `page-designer/panel/imagePanelModel.ts`
  - `page-designer/panel/ImagePanel.tsx`
  - `page-designer/panel/buttonsPanelModel.ts`
  - `page-designer/panel/ButtonsPanel.tsx`
- Test:
  - `page-designer/panel/imagePanelModel.test.ts`
  - `page-designer/panel/buttonsPanelModel.test.ts`
  - `page-designer/panel/ButtonsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`fieldTokens`); `listPanelModel.addListAction`, `removeListAction`, `actionUsableAt`, `placedActions`, `findList`; Task 5 (`AppearanceSection`).
- Produces:
  - `imageOf(c): { from: "address" | "record"; address: string; column: string | null; height: "small" | "medium" | "large" | null; description: string }`
  - `setImageAddress<D>(def, id, url: string): D`, `setImageFromRecord<D>(def, id, binding: string): D`, `setImageHeight<D>(def, id, size): D`, `setImageDescription<D>(def, id, text): D`: Karar 5.
  - `IMAGE_ADDRESS_INVALID = "Adres http:// ya da https:// ile başlamalı."`, `imageAddressProblem(url: string): string | null`
  - `type ButtonSlot = "actions" | "rowActions"`
  - `slotButtons(def: ModelDefinition, slot: ButtonSlot): ModelComponent[]`: kayıt sırasıyla.
  - `setPrimaryButton<D>(def, buttonId: string): D`: `actions` düğmesini o yerin ilk sırasına taşır. Diğer bileşenlerin sırası değişmez. Silme sorgusuna bağlı düğmede tanım aynen döner.
  - `PRIMARY_NOT_DELETE = "Silme eylemi ana buton olamaz."`
- **ImagePanel** (taslak 03, yükleme yok): *Görsel nereden?* Adres / Kayıttaki resim → adres kutusu ya da kolon listesi → Yükseklik → Açıklama (erişilebilirlik için) → Görünüm (ortak).
- **ButtonsPanel**: *Hangi eylemler?* (çipler; kullanılamayanlar gerekçesiyle soluk) → `ProvidedByDeveloper` ("Eylemleri yazılımcı hazırlar · onay sorusu ve yetki ondan gelir") → *Ana buton* (yalnız `actions`) → Karar 6'daki "Nerede?" notu.

- [ ] **Step 1: Write the failing tests**
  - `setImageAddress rejects javascript and http-less addresses via imageAddressProblem`
  - `setImageFromRecord writes selected row binding`
  - `imageOf maps 96 160 280 and leaves other heights null without changing them`
  - `slotButtons keeps record order`
  - `setPrimaryButton moves chosen action button first and leaves others in place`
  - `setPrimaryButton ignores delete button`
  - `ButtonsPanel adds and removes via list actions with same rules` (`addListAction` ile aynı sonuç)
  - `functions never mutate input`
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel/imagePanelModel src/platform-tools/erp-src/page-designer/panel/buttonsPanelModel src/platform-tools/erp-src/page-designer/panel/ButtonsPanel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npm test` PASS.
- [ ] **Step 5: Commit** — `feat(studio): Görsel ve Butonlar panelleri`

### Task 8: Panellerin tasarımcıya bağlanması

**Files:**
- Modify: `page-designer/panel/TemplateInspector.tsx`: `consultantKindOf`'a göre panel seçimi
- Modify: `CustomPagesPage.tsx`: `TemplateInspector`'a katalog, `fieldTokens`, kaynak önizleme sayıları, `VisibilityField` ve `commit` geçirilir
- Test:
  - `page-designer/panel/TemplateInspector.test.tsx` (genişletilir)
  - `page-designer/panel/consultantRoundTrip.test.ts` (yeni; `listPanelRoundTrip.test.ts` kalıbında)

**Interfaces:**
- Consumes: Task 3–7.
- Produces: `TemplateInspector` seçimi:

  | Bileşen | Açılan panel |
  |---|---|
  | `slot: "list"` + `dataTable` | `ListPanel` (değişmez) |
  | `text` türü | `TextPanel` |
  | `infoBox` türü | `InfoBoxPanel` |
  | `indicator` türü | `IndicatorPanel` |
  | `image` türü | `ImagePanel` |
  | `buttons` türü ve `actions` / `rowActions` yeri | `ButtonsPanel` |
  | öteki hepsi | bugünkü `ComponentPanel` + eski ayarlar |

  - Ek alandaki bileşenlerde "Yeri" seçimi panelin Ad bölümünün altında kalır. Göstergede yer listesi `indicatorPlaces`'ten gelir.
  - Kalıpsız sayfada `TemplateInspector` hiç çizilmez (bugünkü gibi).

- [ ] **Step 1: Write the failing tests**
  - `TemplateInspector picks panel by consultant kind`
  - `pageTitle heading falls back to legacy panel`
  - `round trip: each panel setter then ensureTemplateSlots keeps server-valid slots and no width` (`ensureTemplateSlots` çıktısı girdisiyle aynı nesne olmalı)
  - `legacy page shows old inspector` (Review Focus 5)
- [ ] **Step 2:** `npx vitest run src/platform-tools/erp-src/page-designer/panel` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Ardından development-studio'da `npm test` ve `npm run build` PASS.
- [ ] **Step 5: Commit** — `feat(studio): kalıplı sayfada yeni bileşen panelleri`

### Task 9: Uçtan uca doğrulama ve belgeler

**Files:**
- Modify: `docs/phase-status.md` (en üste yeni bölüm: ne yapıldı, ne doğrulandı, ne doğrulanmadı)
- Modify: `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` §7, 5. madde: üç plana bölünme kararı, bu planın yolu, ertelenenler

- [ ] **Step 1:** Tam testler.
  - `dotnet test AIERP.slnx`
  - erp-web'de `npm test` ve `npm run build`
  - development-studio'da `npm test` ve `npm run build`

  Paralel oturum yükünde zaman aşımına düşen (HTTP 499 / TaskCanceled) .NET sınıfları tek başına yeniden çalıştırılır. Sonuç olduğu gibi yazılır.
- [ ] **Step 2:** Tarayıcıda alt proje 3'teki sahte arka uçla doğrula. Studio dev ve ERP dev açık olur, `VITE_STUDIO_URL` ve `?platformOrigin=` alt proje 3'teki gibi ayarlanır.
  - Liste kalıplı bir sayfaya Metin, Bilgi kutusu, Gösterge (sayı + karşılaştırma, ilerleme, durum) ve Görsel eklenir. Her panel ayarı tuvaldeki ERP çiziminde anında görünür.
  - Üç genişlikte bakılır: 1280, 768, 375. Göstergeler yan yana sığdığı kadar dizilir. *Mobilde gizle* açık olan bileşen 375'te görünmez.
  - Toolbar düğmesine tıklanınca Butonlar paneli açılır ve ana buton değişince ERP'de en sola geçer.
  - Kalıpsız bir sayfada eski palet ve eski panel açılır.
- [ ] **Step 3:** Panel sadeliği denetimi (§9): beş panelin çıktısında `{{`, `query`, `slot`, tip adları ve kimlikler geçmez (Eski ayarlar kutusu hariç).
- [ ] **Step 4:** Belgeleri güncelle. Doğrulanmayanları açıkça yaz: gerçek arka uç ve giriş, Docker Compose, yayın akışı.
- [ ] **Step 5: Commit** — `docs: bileşen panelleri (alt proje 5a) durumu`
