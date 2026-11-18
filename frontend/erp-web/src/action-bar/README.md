# İşlem Çubuğu (ActionBar)

Her ekranın başlığının altındaki tek satırlık komut çubuğu. Görsel referans: onaylı taslak
`docs/design-proposals/erp-design-language/01-liste-ve-kayit-stok.html` (liste ve kayıt ekranlarındaki çubuk).
Kod: `ActionBar.tsx` (çubuk ve İşlemler menüsü), `ActionBarSlot.tsx` (sayfa yuvası), `ShortcutHelpDialog.tsx` (F1),
`labels.ts`, `action-bar.css`. Komut kaydı `src/commands/` altındadır.

## Sayfa tarafı

Sayfa komutlarını `usePageCommands(commands)` ile kaydeder (`src/commands/CommandProvider.tsx`):

```tsx
usePageCommands({
  new: { primary: !formOpen, disabledReason: busy ? "İşlem sürüyor…" : undefined, run: startCreate },
  open: { disabledReason: !current ? "Önce bir kayıt seçin" : undefined, run: openCurrent },
  delete: { disabledReason: dirty ? "Önce değişiklikleri kaydedin veya vazgeçin" : undefined, run: remove },
  more: [{ id: "warehouse-status", label: "Devre dışı bırak", run: toggleStatus }],
});
```

- **Standart düğmeler sabit sırada durur, ekranın türüne göre açılır:** Yeni (F2) · Aç (Enter) · Kaydet (Ctrl+S) ·
  Sil (Ctrl+Del) | Yenile (F5) · Filtre (Ctrl+F) | Yazdır (Ctrl+P) · Excel (Ctrl+E). Kural tek yerdedir
  (`offersCommand`, `src/commands/types.ts`); çubuk ve kısayollar aynı kuralı kullanır:
  - Hiçbir kaynağın kaydetmediği komut **gizlenir** (eski "Bu ekranda kullanılamaz" soluk düğmesi yok). Liste
    ekranları `save` kaydetmez, bu yüzden listede Kaydet çıkmaz ve Ctrl+S bir şey yapmaz.
  - Kaydedilmiş ama şu an kullanılamayan komut soluk çizilir; nedeni `title` ve ekran okuyucu metni olarak verilir
    (`disabledReason`, ör. "Önce bir kayıt seçin", salt okunur kayıtta "Banka ekstresi salt okunurdur").
  - **Kayıt formu ekranı:** etkin `form` kaynağı birincil Kaydet'i sahipleniyorsa (RecordFormPage, sayfa diyaloğu,
    birincil `FormSaveCommand`) kayıt defteri `screen: 'form'` hesaplar; Aç, Filtre ve Excel gizlenir, kısayolları
    (Enter, Ctrl+F, Ctrl+E) çalışmaz. Listenin yanında duran form birincil olmayan Kaydet kaydeder
    (`FormSaveCommand primary={false}`) ya da `besideList` taşır (tanım ekranının bölmesindeki, `.nx-def-pane`
    içindeki RecordFormPage bunu kendiliğinden ekler, ör. Raf ve Konumlar); ekran liste olarak kalır.
  - Ayırıcı yalnızca iki yanında düğme kalan gruplar arasında çizilir.
- **Birincil komut** (`primary: true`) mavi dolgulu çizilir; ekranda en fazla bir tane olur (liste: Yeni, açık form: Kaydet).
- **Geri Al** (Ctrl+Z) yalnızca sayfa `undo` kaydettiğinde, İşlemler'in solunda görünür.
- **İşlemler** (Alt+İ) menüsü sayfanın `more` öğelerini listeler: eski satır menüsü ("⋯") işlemleri, alan tanımları,
  CSV gibi seyrek işlemler. Açık bir kayıt formu varsa formun öğeleri önce gelir. Menü klavyeyle gezilir (↑/↓, Home,
  End, Esc kapatır ve odağı düğmeye döndürür).
- **Kaynak önceliği** (`CommandSource`): açık kayıt formu (`form`, en son açılan) > sayfa (`page`) > liste (`list`) >
  tablo (`grid`). Aynı kaynaktan birden çok kayıt varsa ilk takılan geçerlidir: ekranda birkaç tablo varsa Excel ilk
  takılan tablonun dışa aktarmasıdır (`hideExport` verilmiş tablo da yedek olarak `export` kaydeder); başka bir
  tablo kastediliyorsa sayfa `export`'u kendisi kaydeder. Liste ekranında Aç / Sil geçerli satırı (↑/↓, tıklama) izler; işaretli satır varsa Sil onları alır.
- Kirli (kaydedilmemiş) formda kaydı değiştiren işlemler (Sil, durum değiştirme) nedeniyle kapalıdır:
  "Önce değişiklikleri kaydedin veya vazgeçin". Böylece bir durum değişikliği formun eski satır sürümünü sessizce
  yenilemez.
- Kısayollar metin alanında yazarken çalışmaz (Enter, Ctrl+Z, Ctrl+A, Ctrl+Del); listenin seçim kutucuğu yazma
  sayılmaz, Enter / Ctrl+Del liste üzerinde çalışmaya devam eder. Bir pencere (modal: `aria-modal="true"` ya da
  `showModal()` ile açılmış `<dialog>`) açıkken sayfa kısayolları çalışmaz; yeni bir kaplayan pencere
  `role="dialog" aria-modal="true"` taşır. F1 kısayol yardımını açar.
- Tarayıcı tuşları (Ctrl+S, Ctrl+P, Ctrl+F, Ctrl+E, Ctrl+D, F5) yalnızca çalışma alanı kabuğu açıkken (etkin bir
  görünüm varken) ayrılır; giriş, başlatıcı ve platform yönetimi ekranlarında tarayıcıya kalır.

## Yerleşim

- Çubuk tek örnektir; sayfanın başlığının altındaki yuvaya (`ActionBarSlot`, `[data-nx-action-bar-slot]`) portal ile
  taşınır. Etkin görünümde DOM sırasındaki ilk görünür yuva seçilir: gizli görünümdeki ve bir CSS kuralıyla gizlenmiş
  bloktaki (yuvanın üst öğelerinden biri `display: none`) yuva atlanır. Yalnızca CSS değiştiğinde (sınıf eklenince)
  seçim yuvaların üst öğelerini izleyen `ResizeObserver` ile yenilenir. Açık belge (`DocumentSurface`) kendi
  yuvasını başlık çubuğunun altında taşır; kaydırılınca başlık üstte kalır, çubuk kalmaz. Çubuk takılıyken
  kendini kayıt defterine bildirir (`attachActionBar`); takılı değilken formlar kendi düğmelerini çizer. Başlık → çubuk → araç satırı sırası her ekranda aynıdır; boşluğu başlık satırı verir (yuva kendi boşluğunu
  eklemez).
- Çubuk tek katman karttır (8px yarıçap, 1px çizgi). İçine başka kart konmaz.

## Dar ekran (sıkıştırma)

Çubuk hiçbir genişlikte İşlemler menüsünü gizlemez:

- Standart düğmeler kendi alanında (`.nx-action-bar__commands`) durur; Geri Al ve İşlemler sağda, kaydırılmayan ayrı
  bir grupta (`.nx-action-bar__end`) sabittir.
- Düğmeler sığmazsa önce kısayol ipuçları (`kbd`) gizlenir (`data-compact="no-keys"`), yine sığmazsa etiketler gizlenir
  ve düğmeler yalnızca simge olur (`data-compact="icons"`; etiket `aria-label` ve `title` olarak kalır, ör. "Kaydet
  (Ctrl+S)"; kapalı düğmenin `title`'ı yine nedenidir). İşlemler etiketi her zaman görünür.
- Hâlâ sığmıyorsa yalnızca standart düğme alanı yatay kayar.
- Seviye `pickCompaction` ile seçilir: sığan en az sıkıştırılmış seviye; ölçüm her seferinde tam seviyeden başlar,
  böylece çubuk genişleyince eski haline döner. Düğme alanının boyutu `ResizeObserver` ile izlenir (pencere, widget
  rayı, Geri Al'ın gelip gitmesi). Yerleşim olmayan ortamda (testler) çubuk tam kalır.
- Örnek: 1500px'te widget rayı açıkken kayıt ekranında kısayol ipuçları gizlenir; 390px'te düğmeler simge olur.

## Kurallar

- Yeni ekran standart komutları kendi düğmeleriyle yinelemez; sayfa başlığındaki eski "Yeni / Kaydet / Dışa aktar"
  düğmeleri çubuğa taşınır.
- Komutların davranışı, yetkisi ve kısayolu değişmez; çubuk yalnızca var olan işlemleri gösterir.
- Yeni Türkçe metin (`disabledReason`, menü etiketi) eklenirse `src/locales/en/` karşılığı eklenir.
