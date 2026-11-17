# Kayıt formu yapısı (RecordForm)

Bir iş kaydını **oluşturan veya güncelleyen** her ekran bu yapıyı kullanır. Referans uygulama:
`src/customers/components/CustomerCreatePage.tsx` (kapsayıcı tarafı: `src/CustomersPage.tsx`). Görsel referans: onaylı
taslak `docs/design-proposals/erp-design-language/01-liste-ve-kayit-stok.html` (alt bölüm, "Kayıt ekranı").

## Parçalar (`RecordForm.tsx`)

- `RecordFormPage`: sayfanın tamamı.
  - **Başlık**: isteğe bağlı görsel kutusu (`media`, 46px), başlık (18px/650), altında künye satırı: YENİ KAYIT /
    DÜZENLEME etiketi ve `subtitle` (kod için `rf-code`, durum etiketleri için `StatusTag`, kısa özet). Sağda
    `dirty` ("N alan değişti"; `true` ise "Kaydedilmemiş değişiklik var"), `recordNav` ("‹ PgUp · 2 / 23 · PgDn ›")
    ve Vazgeç.
  - Başlığın hemen altında İşlem Çubuğu, varsa hata şeridi.
  - **Gövde**: solda bölüm gezgini (`RecordFormTabs` varsa), ortada kartlar, sağda bağlam paneli (`aside`).
  - **Alt bilgi**: solda kısayollar (Tab sonraki alan · Ctrl+S kaydet · Ctrl+Z geri al yalnızca etkin bir Geri Al
    komutu varsa · PgUp/PgDn yalnızca `recordNav` varsa · Ctrl+. yalnızca `aside` varsa · Esc kapat), sağda `status`.
    Aynı tuşlar F1 kısayol yardımında "Kayıt formu" başlığı altında listelenir.
  - `<form>` etiketini kendisi üretir; içine ayrıca `<form>` koymayın. Modal içindeki formlar için `variant="dialog"`
    (gezgin yerine yatay sekmeler, kısayol satırı yok). Form açıkken İşlem Çubuğu'nun Kaydet komutunu (`Ctrl+S`,
    birincil) kaydeder; "Kaydet ve Yeni" (`Ctrl+F2`) ve "Temizle" İşlemler menüsündedir. `F2` çubuğun Yeni komutudur;
    sayfa kaydeder (kaydedilmemiş değişiklik varsa onay sorarak).
  - **Formun kendi düğmeleri**: Kaydet, Kaydet ve Yeni, Temizle formun başlığında yalnızca İşlem Çubuğu'nun
    erişilemediği yerde çizilir: bir pencerenin içinde (`.modal-backdrop`, `.modal`, `[role=dialog]`, `aria-modal`,
    `<dialog>`) ya da hiç çubuk takılı değilken (platform yönetimi, başlatıcı, panel, bağımsız Studio). Çubuksuz
    sayfada `Ctrl+S` formun kendi Kaydet'idir. `saveDisabledReason` bu düğmeleri de kapatır ve nedeni `title` olur.
  - Ekranda birden çok form varsa `Ctrl+S` ve `Ctrl+F2` odaktaki forma gider; odak hiçbirinde değilse `Ctrl+F2`
    yalnızca tek başına olan forma gider. RecordFormPage olmayan bir form (yan panel, fiş girişi) Kaydet'i
    `FormSaveCommand` ile kaydeder; `F2` hiçbir formda kaydetmez.
  - **Kaydetme hatası**: yalnızca alan düzeyindeki sorunlarda hareket edilir. Tarayıcı doğrulaması geçmezse ya da
    kapsayıcı kayıttan sonra `error` verirse ilk geçersiz alana (`:invalid` / `aria-invalid="true"`) odaklanılır.
    Alan, kapsayıcının gizli tuttuğu bir bölümdeyse (bölüm sarmalayıcısı `data-rf-section="anahtar"` ve `hidden`)
    önce o bölüm açılır. Geçersiz alan yoksa (sunucu, yetki hatası) bölüm ve odak değişmez; `warning` / `!` yalnızca
    göstergedir.
  - **Esc** (sayfa formu): Vazgeç ile aynıdır. Formda bir alana yazıldıysa / değiştirildiyse (son başarılı kayıttan
    beri) ya da `dirty` doluysa önce "Kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?" sorulur. Açık bir
    pencere, açık seçici / liste kutusu (`[role=listbox]`, `[aria-expanded=true]`) ya da Esc'i işlemiş bir alan
    (`defaultPrevented`) varken çalışmaz. Diyalog içindeki formda Esc'i modal yönetir. Seçici, menü ve açılır
    listeler Esc'i kapatırken `preventDefault()` çağırır; böylece arkadaki form Esc ile kapanmaz.
  - **Bağlam paneli** (`aside`): 300px, kartlar alt alta. Kayıt formunun kendi genişliği (görünüm alanı değil; açık
    widget rayı ve menü düşülür) 1100px olunca açılır, 1060px altına inince kapanır (arada titremesin); `ResizeObserver` ile izlenir. `Ctrl+.` açar /
    kapatır.
  - **Kayıtlar arası gezinme** (`recordNav={{ index, total, onPrev, onNext }}`): PgUp / PgDn önceki / sonraki kayıt.
    Olmayan adımın düğmesi kapalıdır; nedeni `prevDisabledReason` / `nextDisabledReason` ile ipucu olarak verilir;
    metin giriş alanında (onay kutusu / seçenek düğmesi hariç), kaydırılabilir bir bölgede (ör. kalem tablosu) ve
    bir pencere açıkken değil.
- `RecordFormGroup`: tek katman kart (beyaz, 1px çizgi, 8px yarıçap, 12px 14px iç boşluk). Başlık 13px/650, gri bant
  yok; sağında isteğe bağlı `hint` (ör. "* zorunlu alan"). Alanlar doğrudan içine `<label>Etiket<input/></label>`
  olarak yazılır ve üç sütunlu ızgaraya dizilir.
- `RecordFormTabs`: bölümler. Sayfada solda **bölüm gezgini** olarak çizilir: her bölümde `state` (`"done"` ✓,
  `"error"` !, `"empty"` ○; `warning: true` = `"error"`), sağda `count`, altta `completion` verilirse "Kart doluluğu
  %N" çubuğu. `Ctrl+↑/↓` bölümler arasında geçer (yazarken de; `textarea` içinde, açık bir seçicide ve bir pencere
  açıkken değil), yeni bölümün ilk alanına odaklanır. Kod `RecordFormSections.tsx`'tedir; `RecordForm.tsx` onu yeniden
  dışa aktarır. Pencere tuş dinleyicileri ve odak / görünüm yardımcıları `recordFormKeys.ts`'tedir. Diyalogda yatay sekme şerididir. Yalnızca alanlar tek ekrana rahat sığmıyorsa kullanın.
- `RecordFieldChange({ previous })`: değişen bir alanı sarar; kontrolde 3px sarı sol çizgi, altında
  "Önceki: …". Yalnızca görünümdür. Her zaman değişmeyen bir alanı sararken `changed` verin: sarmalayıcı yerinde
  kalır (değişmemişken `rf-field` hücresi), kontrol yeniden oluşturulmaz ve yazarken odak kaybolmaz. Yerleşim
  sınıfı (`rf-span-2`) `className` ile sarmalayıcıya verilir. Örnek: stok kartı (`InventoryPage.tsx`).
- `RequiredMark`: zorunlu alan yıldızı; etiket metnini `<span>` içine alın: `<span>Kod <RequiredMark /></span>`.

## Yerleşim sınıfları (`record-form.css`)

- Kart gövdesi üç sütunlu ızgaradır (10px / 14px aralık); etiket 11,5px/500, kontrol 31px, 6px yarıçap. Etiket
  dışındaki her öğe (tablo, araç satırı, açıklama) tam genişliktir; `textarea` içeren alan da tam genişliktir.
- `rf-identity`: kaydı tanımlayan ana alanların kartı ("Kimlik"; `RecordFormGroup bodyClassName="rf-identity"`).
- `rf-columns`: kartları alt alta dizer (eski üç sütunlu kutu düzeni yerine); `rf-columns-wide` geriye dönük kalır.
- `rf-span-2`: alanı iki sütuna yayar (kimlik kartında ad / ünvan gibi uzun alanlar).
- `rf-pair`: kart gövdesinde iki alanı ızgaranın iki hücresine koyar. `rf-short`: tek kısa alan.
  `rf-custom-grid`: üçlü alan ızgarası. `rf-field`: etiket olmayan bir öğeyi tek hücre yapar.
- Alan sınıfları: `rf-must` (zorunlu alan; görünüm yıldızla verilir), `rf-num` (sağa hizalı sayı), `rf-mono`
  (kod / IBAN / vergi no), `rf-check` (onay kutulu satır etiketi). Künye satırında kod için `rf-code`.
- Alt bilgi durumu: `rf-status-warning`, `rf-status-notice`, `rf-status-end`.
- Renkler yalnızca `--nx-*` token'larıdır (açık / koyu tema aynı kuralla). `global-components.css`'in `!important`
  alan kuralları temizlenene kadar dosyanın sonunda kayıt formunun değerleri `!important` ile, global kuraldan
  yalnızca bir öğe ağır (0,6,2) yeniden verilir; alanı kendi sınıfıyla seçen modül kuralları (0,7,x) yine kazanır.
  Temizlik görevinde bakılacak çakışmalar: bu bloktaki zemin / çerçeve / yazı boyutu, (0,6,2) altında kalan modül
  `!important` alan kuralları (ör. `sales-record-forms.css` `rf-must` zemini), modüllerin 40px seçici düğmeleri
  (`.customer-popup-trigger`, `.searchable-record-trigger`), `.app-shell small` / `.content label` boyutları,
  `[class*='-badge']` / `[class*='-panel']` yarıçap-zemin kuralları ve `[aria-selected]` zemini.

## Kurallar

- Alanları, doğrulamaları, API çağrılarını ve kayıt davranışını değiştirmeyin; yalnızca düzeni taşıyın. Taslakta
  olup bugün olmayan davranış çizilmez (ör. stok kodu için kilit simgesi: kod bugün düzenlenebilir, kilit yoktur).
- Bölüm gezgini durumları: oluşturma modunda bir bölümün hata işareti (`!`) ancak kayıt denendikten ya da bölümdeki
  bir alana dokunulduktan sonra gösterilir; boş formu açar açmaz hata gösterilmez. "Kart doluluğu %N" varsayılan
  değerinden farklı (dolu) alanları sayar.
- `recordNav` görünen liste sayfasıyla sınırlıdır (listenin sırası `onVisibleRowsChange` ile alınır); sayfanın ilk /
  son kaydında ilgili düğme nedeniyle kapalıdır, sayfa değiştirmez.
- Bağlam paneli yalnızca bugün var olan veriyi gösterir (Stok kartı: stok durumu, geçmiş); taslaktaki "Açık belgeler"
  ve stok seyri grafiği yeni uç nokta istediği için çizilmez (Faz 4).
- Formu sayfaya gömen ekranlar (tanım ekranı, `inv-rf-embedded`) formun çevresine ikinci bir çerçeve çizmez: başlık
  satırı zeminde, kartlar tek katmandır (`list-page/README.md`, "Tanım ekranı").
- Bölüm gezgini dar ekranda yatay kayan bir şerittir; şerit konumlandırılmıştır (`position: relative`), böylece
  görünmez durum metinleri sayfayı yana taşırmaz.
- Ekranın başında kaydı tanımlayan alanlar "Kimlik" kartı olur; diğer alanlar anlamlı kartlara ayrılır.
- Kart içine kart koymayın; tuvalde tek katman kart vardır.
- "Kaydet ve Yeni" yalnızca oluşturma modunda ve kapsayıcı `onSaveIntent` verdiğinde görünür; kapsayıcı
  başarılı kayıttan sonra formu temizleyip açık bırakır. "Temizle" için `onReset` verin.
- Yeni Türkçe metinlerin İngilizce karşılığını modülün `src/locales/en/*.ts` sözlüğüne ekleyin.
- `RecordForm.tsx` ve `record-form.css` ortaktır; ekrana özel ihtiyaçları modülün kendi CSS dosyasına yazın.
