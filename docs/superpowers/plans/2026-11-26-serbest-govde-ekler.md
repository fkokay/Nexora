# Serbest gövde ekleri (5c üstüne) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Master'daki 5c serbest gövdesine (PR #183), eski dalımızda (`claude/alt-proje-5-form-serbest-eski`) bulunan ve 5c'nin kararlarıyla çatışmayan özellikleri eklemek. Kullanıcı 2026-11-26'da kapsamı "çatışmasızlar" olarak seçti.

**Architecture:** 5c'nin biçimi aynen kalır: bölüm = `section` (`slot: "block"`, `members`), bileşen = `slot: "item"`, `tabs` 0..1. Eski daldaki kod yalnız örnektir; kopyalanmaz, 5c'nin `freeModel.ts` / `FreePanel.tsx` / `TemplateInspector.tsx` yapısına uyarlanır.

**Spec:** 5c planı `docs/superpowers/plans/2026-11-26-serbest-govde-5c.md` (bağlayıcı kararlar) + eski tasarım `git show claude/alt-proje-5-form-serbest-eski:docs/superpowers/specs/2026-11-26-serbest-govde-design.md` (yalnız aşağıdaki maddeler için). Taslak 09 onaylı.

## Kapsam

1. **Gösterge sayı türleri** (bütün kalıplar): `indicatorPanelModel.ts` katalog `int` ve `decimal` kolonlarını sayı sayar (`number`; `money` değil). Eski dal commit `45e36d83`.
2. **Gösterge başlığı seçimi izler:** kaynak/kolon seçilince başlık, danışman başlığı elle değiştirmediyse seçilen değerin etiketini alır (eski daldaki `withIndicatorTitle`).
3. **Ekran açan düğme** (serbest sayfanın işlem çubuğu): `freeModel` `addPageButton(def, pageCode, label)`, `removePageButton`, `pageButtons`; `FreePanel` Eylemler'e "Açılacak ekranın kodu" + "Düğme metni" + "+ Ekran açan düğme". `actionType: "page"`, `slot: "actions"`; 5c'nin 8 düğme sınırı geçerli. İlk düğme ana düğmedir (5c kuralı).
4. **Sekme sırası:** `freeModel` `moveTab(def, index, ±1)`; `FreePanel` sekme satırında ↑ / ↓.
5. **Katmanlar paneli:** kalıplı sayfada (list/record/free) "N/12" rozeti yok, adlar danışman adlarıdır (`consultantKindOf`; serbest bölüm "Bölüm"). Kalıpsız sayfa değişmez. Eski dal commit `fa847cbc` (LayersTree kısmı).
6. **Tuvalde sürükle-bırak (serbest sayfa):** paletten bölüme bırakma konumuyla; bileşeni bölümler arasında ve bölüm içinde taşıma; bölümü sürükleyerek sıralama (sekmeli sayfada sekme içinde ve sekmeler arası); bırakma çizgisi; bileşen üzerinde tip etiketi. `freeModel`'e konumlu `addItem(…, index)` / `moveItemToBlock(…, index)` / `moveBlockTo(def, blockId, tabIndex|null, index)`. Kayıt kartı tuvali (`recordCanvasOverlay`) değişmez; serbest için ayrı ya da genişletilmiş katman. 5c kuralları korunur: dolu bölüm (12) reddi gerekçeli, boş sekme oluşmaz, bileşen her zaman bir bölümde.

## Global Constraints

- 5c'nin davranışı gerilemez: sekme 0..1, boş sekme yok, dolu bölüm ve son bölüm silinmez, sınırlar (12/20/8/8), salt okunur Liste, `freeRemoval`, Alt+↑/↓, `freeSourceProblem`, "Eski tasarımcı (kalıpsız)" adı.
- Sunucu ve ERP değişmez (madde 1 hariç hiçbiri sunucu gerektirmez; madde 1–6 Studio'dadır).
- Danışman panelinde teknik terim yok.
- `dotnet test` gerekirse ortak kilitle (`CLAUDE.md`, `${TEMP}/nexora-dotnet-test.lock`); bu plan .NET değiştirmez.
- Migration yok. Dağıtım: yalnız development-studio.

## Görevler

### Task 1: Gösterge, ekran düğmesi, sekme sırası, Katmanlar (madde 1–5)
Files: `page-designer/panel/indicatorPanelModel.ts` (+test), `freeModel.ts` (+test), `FreePanel.tsx` (+test), `page-designer/LayersTree.tsx` (+test), `CustomPagesPage.tsx` (katman etiketleri).
- [ ] Testler önce: int/decimal sayı; başlık izleme ve elle başlık korunur; addPageButton/removePageButton (8 sınırı, ilk düğme ana); moveTab; Katmanlar kalıplı sayfada rozetsiz ve danışman adlı, kalıpsız sayfada değişmez; panelde teknik terim yok.
- [ ] Uygula; `npm test`, `npm run build`.
- [ ] Commit — `feat(studio): serbest gövde ekleri: gösterge türleri ve başlığı, ekran düğmesi, sekme sırası, katman adları`

### Task 2: Serbest tuvalde sürükle-bırak (madde 6)
Files: `page-designer/freeCanvasHit.ts` (yeni) ya da `recordCanvasHit.ts` genişlemesi, `page-designer/freeCanvasOverlay.tsx` (yeni) ya da `recordCanvasOverlay.tsx`, `freeModel.ts` (konumlu fonksiyonlar), `CustomPagesPage.tsx` (serbest sayfada katman + genel tuval işleyicilerinin kapatılması), `ErpCanvasFrame.tsx` gerekirse.
- [ ] Testler önce: bırakma konumu (bölüm içi okuma sırası, tam satır bileşen kuralı `freeFullRow` ile aynı); dolu bölüme bırakma gerekçeli ret; bölümler arası taşıma tek sahip; bölüm sürükleme (sekmesiz ve sekmeli); kayıt kartı tuvali değişmez.
- [ ] Uygula; `npm test`, `npm run build`.
- [ ] Commit — `feat(studio): serbest gövdede tuvalde sürükle-bırak`

### Task 3: Doğrulama ve belgeler
- [ ] Studio `npm test` + build; erp-web değişmediği için yalnız build.
- [ ] Tarayıcı: `scratchpad/p5` sahte arka ucu (5c biçimine göre güncellenir) ile Studio'da iki örnek (Gün sonu) sürükle-bırakla kurulur; ekran görüntüleri.
- [ ] `docs/phase-status.md` kısa girdi; commit `docs: serbest gövde ekleri durumu`.
