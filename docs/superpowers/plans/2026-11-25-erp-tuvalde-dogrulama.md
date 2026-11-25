# ERP tuvalde — doğrulama sonuçları (Görev 7)

Tarih: 2026-11-25 · Dal: `claude/adoring-turing-618c3d`

Yerel Platform API (http://localhost:5080) çalışmıyor ve Docker yok; oturum açılmış uçtan uca karşılaştırma bu ortamda yapılamadı.
Kural (R2): çalışabilen her adım çalıştırıldı, çalışamayanlar "Doğrulanmadı — neden: …" olarak kayıtlı. Hiçbir sonuç veya ekran görüntüsü uydurulmadı.

## 1. erp-web (`frontend/erp-web`)

| Komut | Sonuç |
| --- | --- |
| `npx tsc --noEmit -p .` | çıkış kodu 0, hata yok |
| `npm run build` | `✓ built in 1.47s` (yalnız mevcut `INEFFECTIVE_DYNAMIC_IMPORT` uyarısı: `src/locale.ts`) |
| `npx vitest run` (ilk çalıştırma) | `Tests 2 failed \| 2031 passed (2033)` |
| `npx vitest run` (ikinci tam çalıştırma) | `Test Files 2 failed \| 192 passed (194)`, `Tests 3 failed \| 2030 passed (2033)` |

Başarısız testler (iki tam çalıştırma boyunca değişti, yani kararsız):
- `src/custom-page/TenantCustomPageProblemDetails.test.tsx` (409 detay, yapılandırılmış hata iletisi; başka bir çalıştırmada "400 with only a specific title"). Hata: `expected 'ERP işlem kataloğu henüz yüklenmedi.' to contain …` — katalog yüklenmeden tıklama yarışı.
- `src/reports/ReportsPage.commands.test.tsx` > "Sil works on the opened saved report…".

Tek başına yeniden çalıştırma: `TenantCustomPageProblemDetails.test.tsx` bir çalıştırmada 1 hata verdi, sonraki 3 çalıştırmada `4 passed (4)`; `ReportsPage.commands.test.tsx` `6 passed (6)`. 194 jsdom ortamı yük altında (aynı anda başka işlemler çalışırken) zamanlamaya duyarlı oldukları görülüyor. Bu yarış tuval koduyla ilgisiz görünüyor (tuval yalnız `canvasParams && embeddedStudioTool` dalında etkin) ama dalın temel sürümünde karşılaştırmalı çalıştırma yapılmadı; bu yüzden "önceden de var" kesin olarak doğrulanmadı.

## 2. development-studio (`frontend/development-studio`)

| Komut | Sonuç |
| --- | --- |
| `npx vitest run --dir src` | `Test Files 39 passed (39)`, `Tests 451 passed (451)` |
| `npx tsc --noEmit -p .` | çıkış kodu 0, hata yok |
| `npm run build` | başarılı (hata yok) |
| `npm test` (`node --test "tests/*.test.mjs"` dahil) | `tests 13`, `pass 13`, `fail 0` |

## 3. Yönlendirme duman denetimi (API yok)

```
cd frontend/erp-web && VITE_STUDIO_URL=http://localhost:5175/ npx vite --port 5173 --strictPort
curl -s -o out.html -w "HTTP %{http_code}" "http://localhost:5173/?designerCanvas=1&embeddedStudio=1&preview=abc"
→ HTTP 200, gövde: <!doctype html><html lang="tr"> … (SPA kabuğu)
```

Bu yalnız Vite'ın SPA HTML'ini sunduğunu kanıtlar; tuval modunun çalıştığını, sayfanın çizildiğini veya iletişim protokolünü kanıtlamaz. Sunucu işlemi sonra durduruldu (5173 portu boş).

## 4. Statik CSS riski: `<template data-cp-anchor>` kardeşi

Kod: `TenantCustomPage.tsx:956-964` — `renderComponent` her bileşen gövdesini tuval modunda `<template data-cp-anchor>` + gövde olarak (fragment) döndürür; `<template>` bir öğedir, `display:none` olduğu için ızgara/flex öğesi olmaz (gap etkilenmez) ama `:first-child`, `:nth-child`, `+`, `:has(+ …)` eşleşmelerinde sayılır. `renderComponent` bölüm/sekme/pencere çocuklarını da bu yoldan çizer (satır 976, 1085, 1127, 1242, 3360).

İncelenen seçiciler (`tenant-custom-page.css`, `custom-page/detail-panel.css`; ayrıca `system-pages.css` import edilir ama içeriği bu görevde taranmadı):

| Seçici (dosya:satır) | Çocuklar renderComponent ile mi? | Etki |
| --- | --- | --- |
| `.tenant-page-block:is(.tenant-page-section,.tenant-page-card) > h3 + p` (css:25) | Hayır, başlık ve alt açıklama bölümün kendi öğeleri | Etkilenmez; şablon yalnız bileşen çocuklarının önüne girer |
| `.tenant-page-table tbody tr:last-child td` (81), `td:first-child` (85), `td:nth-last-child` (476) | Hayır (tablo satırları) | Etkilenmez |
| `.tenant-page-form-card-grid.is-inline > .tenant-page-form-card-cell:last-child:not(:first-child)…` (243) | Hayır: hücreleri `LayoutComponents.tsx:19` kendisi sarar; şablon hücrenin içine değil, hücrelerin dışına/öncesine girmez | Etkilenmez (çocuk `Children.map` ile hücreye sarılır, şablon hücre içinde kalır) |
| `.tenant-page-filter-chips .tenant-page-chip > strong:first-child` (327), `.tenant-page-context-related li:last-child` (366), `detail-panel.css:61` | Hayır (bileşen iç yapıları) | Etkilenmez |
| `.tenant-page-dialog-body .tenant-page-section > .tenant-page-text:has(+ .tenant-page-action)` (css:440) ve `> .tenant-page-text + .tenant-page-action` (css:441) | EVET (bölüm çocukları) | GERÇEK RİSK, aşağıda |
| `.tenant-custom-page-content` / `.tenant-page-tabpanel` grid ve `> *` kuralı (12, 179, 184) | Evet | Etkilenmez: `display:none` öğe ızgara hücresi ve boşluk üretmez; `> *` `grid-column` kuralı şablona uygulanır ama görünmez |

### Bulunan riskler

1. `frontend/erp-web/src/tenant-custom-page.css:440-441`: pencere (dialog) gövdesindeki bir bölümde `metin` bileşeninin hemen ardından `eylem` düğmesi gelirse (altbilgi: açıklama + düğme), tuvalde araya `<template>` girer: `text, template, action`. `:has(+ .tenant-page-action)` ve `.tenant-page-text + .tenant-page-action` eşleşmez. Tuvalde o satırın üst çizgisi/hizalaması (`flex:1 1 60%`, `border-top`, `padding`) ve düğmenin `flex:0 0 auto` kuralı uygulanmaz; gerçek ERP'de uygulanır. Yani pencere altbilgisi tuvalde gerçek sayfadan farklı çizilir. Bu görevde CSS değiştirilmedi. Olası düzeltme (ayrı görev): `:has(+ template + .tenant-page-action)` ve `.tenant-page-text + template + .tenant-page-action` ikinci seçicilerini eklemek.

Diğer düzen etkilemeyen not: boş bölüm için `:empty` seçicisi bulunmadı (grep sonucu boş).

## 5. Doğrulanmadı

Doğrulanmadı — neden: yerel Platform API (http://localhost:5080) çalışmıyor, Docker yok; oturum açılmış ERP + Studio + API üçlüsü kurulamadı. Aşağıdaki adımlar bu yüzden çalıştırılmadı:

- 3 genişlikte (ör. 1440, 1024, 768) Studio tuvali ile gerçek ERP sayfasının ekran görüntüsü karşılaştırması
- yer tutucu, yetkisiz ve yedek (fallback) durumlarının elle denetimi
- arka arkaya hızlı düzenleme (burst-edit) ve otomatik kayıt davranışı
- canlı DOM'daki `template[data-cp-anchor]` sayısının bileşen sayısıyla eşleşmesi

Kullanıcının sonra yapacağı elle adımlar:

1. Platform API'yi başlat (`http://localhost:5080`), veritabanı hazır olsun.
2. ERP'yi Studio adresini bilerek başlat: `cd frontend/erp-web && VITE_STUDIO_URL=http://localhost:5175/ npx vite --port 5173 --strictPort`.
3. Studio'yu başlat: `cd frontend/development-studio && npx vite --port 5175 --strictPort`.
4. Her ikisinde oturum aç, Studio'da bir özel sayfa tasarımcısını aç. Tuvalde gerçek ERP sayfası görünmeli.
5. Aynı sayfayı ERP'de doğrudan aç; 3 genişlikte iki görünümü yan yana karşılaştır, farkları not et (özellikle pencere altbilgisi, madde 4).
6. Yer tutucu: ERP'ye erişilemezken/önizleme belirteci geçersizken tuval durumunu; yetkisiz kullanıcıyla bileşenlerin davranışını; fallback durumunu kontrol et.
7. Burst-edit: bir özelliği hızlıca birkaç kez değiştir; tuval son değeri göstermeli, kayıt çağrıları birleşmeli, boş sayfaya düşmemeli.
8. Tuval çerçevesinde konsola: `document.querySelectorAll('template[data-cp-anchor]').length` değerini, sayfadaki bileşen sayısıyla (iç içe olanlar dahil) karşılaştır.

Ekran görüntüsü alınmadığı için ekran görüntüsü klasörü oluşturulmadı.
