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

- **Sekiz standart düğme her ekranda aynı sırada durur:** Yeni (F2) · Aç (Enter) · Kaydet (Ctrl+S) · Sil (Ctrl+Del) |
  Yenile (F5) · Filtre (Ctrl+F) | Yazdır (Ctrl+P) · Excel (Ctrl+E). Kullanılamayan düğme gizlenmez; soluk çizilir,
  nedeni `title` ve ekran okuyucu metni olarak verilir (`disabledReason`; komut yoksa "Bu ekranda kullanılamaz").
- **Birincil komut** (`primary: true`) mavi dolgulu çizilir; ekranda en fazla bir tane olur (liste: Yeni, açık form: Kaydet).
- **Geri Al** (Ctrl+Z) yalnızca sayfa `undo` kaydettiğinde, İşlemler'in solunda görünür.
- **İşlemler** (Alt+İ) menüsü sayfanın `more` öğelerini listeler: eski satır menüsü ("⋯") işlemleri, alan tanımları,
  CSV gibi seyrek işlemler. Açık bir kayıt formu varsa formun öğeleri önce gelir. Menü klavyeyle gezilir (↑/↓, Home,
  End, Esc kapatır ve odağı düğmeye döndürür).
- **Kaynak önceliği** (`CommandSource`): açık kayıt formu (`form`, en son açılan) > sayfa (`page`) > liste (`list`) >
  tablo (`grid`). Liste ekranında Aç / Sil geçerli satırı (↑/↓, tıklama) izler; işaretli satır varsa Sil onları alır.
- Kirli (kaydedilmemiş) formda kaydı değiştiren işlemler (Sil, durum değiştirme) nedeniyle kapalıdır:
  "Önce değişiklikleri kaydedin veya vazgeçin". Böylece bir durum değişikliği formun eski satır sürümünü sessizce
  yenilemez.
- Kısayollar metin alanında yazarken çalışmaz (Enter, Ctrl+Z, Ctrl+A, Ctrl+Del); listenin seçim kutucuğu yazma
  sayılmaz, Enter / Ctrl+Del liste üzerinde çalışmaya devam eder. Bir pencere (modal) açıkken sayfa kısayolları
  çalışmaz. F1 kısayol yardımını açar.

## Yerleşim

- Çubuk tek örnektir; sayfanın başlığının altındaki yuvaya (`ActionBarSlot`, `[data-nx-action-bar-slot]`) portal ile
  taşınır. Başlık → çubuk → araç satırı sırası her ekranda aynıdır; boşluğu başlık satırı verir (yuva kendi boşluğunu
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
