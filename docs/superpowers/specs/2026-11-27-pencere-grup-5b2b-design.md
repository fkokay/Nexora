# 5b-2 adım 2: Pencere ve grup (tasarım)

Durum: taslak, kullanıcı onayı bekliyor. Tarih: 2026-11-27. Üst belge: `2026-11-27-kalip-buyutme-5b2-design.md` §5.1 madde 2. Taslak: `docs/design-proposals/studio-sadelestirme/12-pencere-grup.html`.

## 1. Amaç

Standartların açılır pencerelerini (`dialog`) ve iç içe bileşenlerini (`children`) kalıplara, davranış aynı kalarak taşımak. Kullanıcının seçimi (2026-11-27): yaklaşım **A** — kalıba "Pencereler" yeri ve tek katlı "grup" eklemek; kapsam yalnız bu (küçük engeller ve Liste parametre formu bu adıma alınmadı).

## 2. Ölçülen getiri (gerçekçi)

Canlı rapor `tpl-report-20261127b` 9 standardı yalnız pencere/iç içe engelli gösterir; ama rapor bu engel varken kalıba uyum nedenlerini hiç yazmaz. Yerel yoklama (pencere ve iç içe bileşenler kabul edilmiş sayılarak) gerçek getiriyi **yaklaşık 5** buldu: `sales-orders`, `sales-invoices`, `inventory-cost`, `inventory-tracking`, `finance-ledger-chart`. Kalan dördü başka engelle kalır: `finance-journal-ledger` ve `finance-trial-balance` (Liste üstünde parametre formu), `fixed-asset-card` (birden çok kayıt özeti), `manufacturing-order-create` (kayıt özeti yok).

Diğer pencereli standartlar (31 form penceresi dahil) koşullu genişlik, filtre çipi, sihirbaz ya da satır tablosu yüzünden 3.–5. adımlara kalır; pencerenin içindeki `editableGrid` (13) ve `steps` (3) kendi nedenleriyle reddedilmeye devam eder. Bu adım onların pencere engelini kaldırır, getirisi sonraki adımlarda görünür.

## 3. Standartlarda ne var (ölçüm)

- **47 pencere, 26 standart.** Hepsi `presentation: "dialog"`; boyut `xl` 21, `md` 11, `lg` 9, `sm` 5. Ayarlar: `title`, `contains`, `size`, `refreshQueries` 35, `resetOnOpen` 32, `saveQuery`/`saveLabel`/`closeOnSave` 31.
- İki tür: **görünüm penceresi** (kayıt özeti + bölümler + sekmeler + tablolar; Kaydet yok — 5 hedefin hepsi bu tür) ve **form penceresi** (form alanları, not, uyarı, kendi Kaydet'i).
- **Açılış:** yalnız düğme (`actionType: "openDialog"`, `dialogId`; 61 düğme) ve sayfa parametresi (`openParam`, 6 standart). Komut çubuğunun Aç/Yeni düğmesi de bu düğmeleri çalıştırır.
- **Pencerenin sekmeleri `contains` dışındaki bileşenlere işaret eder** (ör. `sales-orders` › `siparisSekmeleri` › `teslimBolumu`, `rezervasyonBolumu`, `irsaliyeTablosu`). Bunlar da pencerenin içeriğidir.
- **37 iç içe kapsayıcı** (`card` 22, `section` 15), hepsi tek kat. Çocuk türleri: rozet 84, düğme 55, metin 38, gösterge 31, sekme 17, form 7, uyarı 6, tablo 5, başlık 3, detay paneli 2, kayıt özeti 1, sihirbaz 1, özel alan bloğu 1. Grup ayarları: `title`, `description`, `variant`, `visibleWhen`, `width`.

## 4. Kararlar

### 4.1 Biçim (adım 1 Karar 1'in örneği)

- **Pencere:** kalıplı sayfada (Liste, Kayıt kartı, Serbest) üst düzey `dialog` bileşeni `props.slot: "dialogs"` ile durur; ayarları eski adlarla ve değerlerle aynıdır (`presentation`, `size`, `title`, `contains`, `saveQuery`, `saveLabel`, `closeOnSave`, `resetOnOpen`, `refreshQueries`). Belge kalıbında pencere yoktur (komutlar gibi; hiçbir standart istemiyor).
- **Pencerenin içeriği:** `contains` listesindeki bileşenler ile pencerenin sekmelerinin işaret ettiği bileşenler. Bunlar `props.slot: "dialog"` taşır; hangi pencereye ait oldukları `contains`/sekmeden okunur (ayrı bir sahip alanı yok). Bir bileşen en çok bir pencereye aittir; pencere içeriği pencere dışında çizilmez.
- **Pencere içinde izinli türler:** kayıt özeti (`recordHeader`, en çok 1), grup (`section`/`card`), `formCard`, `input`, `text`, `alert`, `metric`, `button`, `dataTable`, `tabs` (en çok 1). `editableGrid`, `steps` ve pencere içinde pencere yoktur.
- **Grup:** `section` ya da `card`, `children` ile tek kat. Çocuk grup ya da pencere olamaz. İzinli çocuklar: `badge`, `heading`, `text`, `metric`, `alert`, `button`, `formCard`, `dataTable`, `contextPanel`, `tabs`. `title`, `description`, `variant`, `visibleWhen` korunur; `width` yerleşimdir, dönüşümde silinir; `widthWhen` 3. adımda.
- **Grubun yeri:** pencere içinde (doğrudan ya da pencerenin sekmesinde) ve Liste'nin `detail` yerinde (detay paneli yerine en çok bir kart grubu). Başka yerde grup yoktur — ihtiyacı olan standart yok (yeni özellik eklememe kuralı).
- **Açılış değişmez:** `openDialog` düğmesi ve `openParam` olduğu gibi çalışır. Komut çubuğunun `newAction`/`openAction: "dialog"` ayarı kalıpta yine yoktur (standartlar düğme ile açar).

### 4.2 ERP çizimi

- Pencere bugünkü ERP penceresiyle aynıdır: başlık, kapat, boyut (Küçük / Orta / Büyük / Çok büyük = `sm`/`md`/`lg`/`xl`), Esc ile kapanma.
- **İskelet sabit:** üstte kayıt özeti; sonra içerik `contains` sırasıyla tek sütunda (göstergeler yan yana bir satırda); sonra sekmeler; altta düğme satırı — pencerenin üst düzey düğmeleri solda, Kaydet ile Vazgeç sağda (Kaydet yalnız `saveQuery` varsa). Genişlik ayarları uygulanmaz (yerleşim değişikliği sayılır).
- Grup: başlık ve açıklamalı bir kutu; rozetler en üstte bir satırda, sonra çocuklar kendi sırasıyla; düğmeler grubun altında bir satırda. `visibleWhen` grubu bütünüyle gizler.
- Liste'nin `detail` yerindeki kart grubu, detay paneli ile aynı yerde (listenin sağında, dar ekranda altında) çizilir.

### 4.3 Studio

- Sayfa panelinde **Pencereler** bölümü: her pencere için ad, boyut, (form penceresiyse) Kaydet eylemi, etiket, "kaydedince kapat", "açılışta temizle", "yenilenecek veriler"; "Aç" ile tuvalde pencere açılır ve içi düzenlenir.
- Pencere içeriğinin sırası iskelete göre çizilir; danışman yalnız içerik listesinin sırasını değiştirebilir.
- **Grup paneli:** başlık, açıklama, "Ne zaman görünsün" (bugünkü koşul düzenleyicisi), üyeler listesi (ekle / çıkar / sırala; yalnız izinli türler).
- Yeni sayfada pencere eklenebilir ("Pencere ekle" → boş görünüm penceresi); bir düğmenin eylemi "Pencere aç" ile bağlanır.

### 4.4 Dönüştürücü ve eşdeğerlik

- Dönüştürücü pencereyi `dialogs`, içeriğini `dialog` yerine koyar; grupları olduğu gibi bırakır, `width`'i siler. Eşleyemediği her şeyde (izinsiz tür, iki pencereye ait bileşen, iç içe grup, `widthWhen`) sayfayı taşımaz ve gerekçe yazar.
- `BehaviorEquivalence` genişler: her pencerenin ayarları (genişlik hariç hepsi) ve içerik kümesi önce/sonra aynı; her grubun çocuk kümesi ve `visibleWhen`'i aynı. Gevşetilmez.
- Rapor, pencere/iç içe engeli kalkınca kalıba uyum nedenlerini artık gösterir.
- 5b-1 gerekçe tablosu güncellenir ("Pencere kalıplarda yok", "İç içe bileşenler" yerine somut nedenler).

## 5. Hedef dışı

- Liste parametre formu, birden çok kayıt özeti, özetsiz Kayıt kartı (kullanıcı bu adıma almadı).
- Pencere içinde satır tablosu ve sihirbaz (5. ve 4. adım).
- Standartların taşınması: 5 standart taşınabilir olunca ayrı bir PR (§5.4 üst belge).

## 6. Builder'a bırakılanlar

- ERP bileşen yapısı (kalıp kabuğunda pencere ve grup çizicisi), Studio panel bileşenleri, doğrulama hata metinlerinin tam sözü (Türkçe, adım 1 kalıbıyla).
- PR bölümlemesi.
