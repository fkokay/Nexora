# ERP Tasarım Dili — Faz 0 + Faz 1 Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ERP Web'de tek renk/ölçü sistemi (Faz 0) ve her ekranda aynı yerde, aynı sırada duran, klavyeyle çalışan İşlem Çubuğu + yeni çerçeve (Faz 1) — tüm ekranlara bağlanmış halde.

**Architecture:** `--nx-*` token dosyası eski token'ların tek kaynağı olur. Merkezi bir komut kaydı (registry) her açık ekran görünümünün (keep-alive view) komutlarını tutar; tek bir `keydown` dinleyicisi kısayolu yalnızca etkin görünüme yollar. `ActionBar` kabuk tarafından çizilir ve etkin görünümün komutlarını gösterir; sayfalar `usePageCommands` ile mevcut işleyicilerini kaydeder. `AdvancedDataGrid` ve `ListToolbar` Excel / Filtre / Yenile için yedek komut sağlar.

**Tech Stack:** React + Vite + TypeScript, düz global CSS, `lucide-react`. Yeni: Vitest + jsdom + @testing-library/react (yalnızca devDependencies).

**Spec:** `docs/superpowers/specs/2026-11-16-erp-design-language-design.md` · Taslaklar: `docs/design-proposals/erp-design-language/`

**Kapsam dışı (ayrı planlar):** Faz 2 ekran tipi bileşenleri, Faz 3 modül geçişleri (her modül kendi onayıyla), Faz 4 backend gerektiren özellikler.

## Global Constraints

- Tüm komutlar `frontend/erp-web` içinden çalışır.
- Yeni UI kütüphanesi yok; ikonlar `lucide-react`.
- Her yeni Türkçe metnin İngilizce karşılığı `src/locales/en/` sözlüğüne eklenir; sayı ile sözcük ayrı metin düğümü.
- İşlem Çubuğu sırası sabit: `new, open, save, delete | refresh, filter | print, export | (sağ) more`.
- Kısayollar: Yeni `F2` · Aç `Enter` · Kaydet `Ctrl+S` · Sil `Ctrl+Delete` (etikette `Ctrl+Del`) · Yenile `F5` · Filtre `Ctrl+F` · Yazdır `Ctrl+P` · Excel `Ctrl+E` · İşlemler `Alt+İ` · Geri al `Ctrl+Z` · Kısayol yardımı `F1`.
- Geçersiz ortak düğme `disabled` + `title`/ipucunda nedeni; asla gizlenmez.
- Mevcut kısayollar korunur: `Ctrl+K`, `Ctrl+B`, `Ctrl+W`, `Ctrl+Tab`/`Ctrl+Shift+Tab`, `Alt+←/→`, arama açıkken `Esc`.
- Kullanıcı menü tercihleri (`/api/user-preferences/workspace-rail`, sıra + gizli) korunur; backend değişikliği yok.
- Tenant ekran düzenleri (`built-in-screen-views/`, `FinanceStudioGrid.tsx`, `screenViewGridLayout.ts`) davranışı değişmez.
- Sil yalnızca gerçekten silinebilen kayıtta etkin; kesilmiş belge / hareket / ledger kaydında `disabledReason` "Kesilmiş belge silinemez — İşlemler › İptal et" kalıbıyla.
- Faz 1'de sayfanın yalnızca ortak düğmeleri çubuğa taşınır; aynı işi yapan eski başlık düğmeleri kaldırılır; sayfanın geri kalan düzeni değişmez.
- 390px genişlikte sayfa yatay taşmaz; çubuk kendi içinde yatay kayar.
- Ana sayfa (`launcher`/`dashboard`) İşlem Çubuğu göstermez (taslak 05).

## Review Focus

1. **Arka plandaki sekme:** iki ekran açıkken `Ctrl+S` yalnızca öndeki ekranı kaydeder → Task 4 testi `dispatches only to the active view`.
2. **Yazarken kısayol:** input içindeyken `Enter`, `Ctrl+Z`, `Ctrl+A`, `Ctrl+Delete` yerel düzenleme yapar, komut tetiklemez; `Ctrl+S`, `F2` tetikler → Task 4 testi `typing guard`.
3. **Açık pencere:** onay/modal açıkken (`[aria-modal="true"]`) hiçbir sayfa komutu çalışmaz; `Esc` modalda kalır → Task 4 testi `suppresses page commands while a modal is open`, Task 5 testi `does not dispatch while a confirm dialog is open`.
4. **Türkçe klavye:** `Alt+İ` TR-Q'da `Alt+i` tuşu (`key:"i"`, `code:"Quote"`), US'de `KeyI` ile çalışır; `ı` (TR-Q'da `KeyI`) tetiklemez; `"I".toLocaleLowerCase("tr")` tuzağına düşülmez → Task 3 testleri.
5. **Geçersiz komutta tarayıcı:** Yazdırması olmayan ekranda `Ctrl+P` tarayıcı yazdırma penceresini açmaz, `F5` sayfayı yeniden yüklemez (kaydedilmemiş veri kaybı) → Task 4 testi `prevents browser defaults for reserved chords even when the command is absent`.

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/design/tokens.css` | `--nx-*` açık + koyu token'lar, yazı tipi, eski token takma adları |
| `src/commands/types.ts` | Komut tipleri |
| `src/commands/shortcuts.ts` | Kısayol ayrıştırma, eşleştirme, gösterim |
| `src/commands/registry.ts` | Görünüm başına komut kaydı, birleştirme, klavye dağıtımı (React'siz) |
| `src/commands/CommandProvider.tsx` | React bağları: provider, tek dinleyici, `usePageCommands`, `useActivePageCommands`, `ViewKeyContext` |
| `src/action-bar/ActionBar.tsx`, `action-bar.css` | Çubuk ve İşlemler menüsü |
| `src/action-bar/ShortcutHelpDialog.tsx` | `F1` kısayol listesi |
| `src/shell/moduleMenus.ts` | Modül → ekran listesi (alt menü) |
| `src/shell/WorkspaceSubNav.tsx`, `shell.css` | Alt menü, yeni ikon şeridi/üst çubuk stili |
| `vitest.config.ts`, `src/test/setup.ts` | Test altyapısı |

---

### Task 1: Test altyapısı + token dosyası (Faz 0a)

**Files:**
- Modify: `package.json` (devDependencies: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`; script `"test": "vitest run"`)
- Create: `vitest.config.ts` (environment `jsdom`, setupFiles `src/test/setup.ts`, include `src/**/*.test.{ts,tsx}`), `src/test/setup.ts`
- Create: `src/design/tokens.css`, Test: `src/design/tokens.test.ts`
- Modify: `src/main.tsx` (ilk CSS importu `./design/tokens.css`), `src/style.css` (satır 1'deki Google Fonts importu kaldırılır), `tsconfig.app.json` (test dosyaları build'den hariç değilse `vitest/globals` tipi)
- Modify: `.github/workflows/ci.yml` — erp-web adımına `npm test` eklenir

**Interfaces — Produces:** CSS değişkenleri; Task 6+ bunları kullanır:
`--nx-ink --nx-ink-2 --nx-primary --nx-primary-strong --nx-primary-soft --nx-canvas --nx-surface --nx-line --nx-line-soft --nx-text --nx-muted --nx-ok --nx-ok-bg --nx-warn --nx-warn-bg --nx-bad --nx-bad-bg --nx-changed --nx-font --nx-font-mono --nx-radius-control --nx-radius-card --nx-control-h --nx-row-h-dense --nx-row-h-comfort`

- [ ] **Step 1: Test** — `tokens.test.ts` dosyayı `fs` ile okur:
  - `each required token is defined in :root` (yukarıdaki liste)
  - `each color token is redefined under html[data-theme="dark"]`
  - `light values match the spec`: `--nx-primary: #1f5fd1`, `--nx-ink: #0f1b2d`, `--nx-canvas: #f3f5f8`, `--nx-line: #dfe3e9`, `--nx-text: #1b2430`, `--nx-muted: #667085`, `--nx-ok: #13804b`, `--nx-warn: #b45309`, `--nx-bad: #c4321f`, `--nx-changed: #e0a100`, `--nx-font: "Segoe UI", Inter, system-ui, sans-serif`, `--nx-control-h: 31px`, `--nx-row-h-dense: 30px`, `--nx-row-h-comfort: 38px`
  - `dark text/surface pairs meet 4.5:1` (küçük bir kontrast fonksiyonu testte yazılır; `--nx-text` / `--nx-surface`, `--nx-muted` / `--nx-surface`, `--nx-primary-strong` / `--nx-primary-soft`)
- [ ] **Step 2:** `npm install` sonra `npx vitest run src/design` → FAIL (dosya yok)
- [ ] **Step 3:** `tokens.css` yazılır. Değerler spec §5.1–5.3. Koyu değerler uygulayıcının (AA şartı). Dosya sonunda eski adlara takma ad: `--erp-primary`, `--erp-accent`, `--erp-color-primary`, `--erp-bg`, `--erp-surface`, `--erp-border`, `--erp-text`, `--erp-canvas`, `--erp-ink`, `--erp-line` → karşılık gelen `--nx-*`.
- [ ] **Step 4:** `npx vitest run src/design` → PASS; `npm run build` → başarılı
- [ ] **Step 5:** Commit `ERP Web: --nx tasarım token'ları ve Vitest altyapısı`

### Task 2: Eski token'ların tekleştirilmesi (Faz 0b)

**Files:**
- Modify: `src/style.css`, `src/erp-redesign.css`, `src/global-components.css`, `src/dynamics-workbench.css`, `src/dark-theme-surfaces.css` (renk token tanımları `:root` ve `html[data-theme="dark"]` bloklarından silinir — artık `tokens.css` takma adlarından gelir)
- Modify: `src/**/*.css` içindeki `var(--erp-…, #hex)` geri dönüşleri ve eski vurgu renkleri
- Test: `src/design/legacy-tokens.test.ts`

- [ ] **Step 1: Test** — `src/**/*.css` taranır (`tokens.css` hariç):
  - `no stylesheet redefines --erp-* color tokens` (`--erp-[a-z-]+\s*:` tanımı yok)
  - `no var() fallback carries a hex color` (`var\(--[\w-]+,\s*#` yok)
  - `old accent colors are gone`: `#7060df`, `#6844df`, `#a99bff`, `#0876d1`, `#0A192F` (büyük/küçük harf duyarsız) hiçbir CSS'te geçmez
  - `no font-family other than var(--nx-font) or var(--nx-font-mono)` — `DM Sans`, `Manrope`, `Inter` doğrudan geçmez
- [ ] **Step 2:** `npx vitest run src/design` → FAIL (çok sayıda eşleşme)
- [ ] **Step 3:** Toplu değişiklik: geri dönüşleri at (`var(--erp-primary, #7060df)` → `var(--nx-primary)`), eski vurgu hex'lerini `var(--nx-primary)` / `var(--nx-primary-strong)` ile değiştir, yazı tiplerini token'a bağla. Diğer sabit hex'ler bu görevde kalabilir (Faz 3'te modül modül temizlenir).
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` → başarılı
- [ ] **Step 5: Görsel kontrol** — `npm run dev` ile açılan uygulamada (API: README'deki compose yığını) Stok Kartları, Satış Faturaları, Cari Hesaplar, Mizan açık ve koyu temada ekran görüntüsü alınır; mor renk kalmadığı ve okunmayan metin olmadığı gözle doğrulanır. Yığın çalıştırılamıyorsa bu adım "yapılamadı" diye raporlanır, atlanmış sayılmaz.
- [ ] **Step 6:** Commit `ERP Web: eski renk ve yazı tipi tanımları --nx token'larına bağlandı`

### Task 3: Kısayol eşleştirme

**Files:** Create `src/commands/types.ts`, `src/commands/shortcuts.ts`; Test `src/commands/shortcuts.test.ts`

**Interfaces — Produces:**
```ts
// types.ts
export type StandardCommandId = 'new'|'open'|'save'|'delete'|'refresh'|'filter'|'print'|'export'|'undo';
export const ACTION_BAR_ORDER: readonly StandardCommandId[] = ['new','open','save','delete','refresh','filter','print','export'];
export type CommandSpec = { run?: () => void | Promise<void>; disabledReason?: string; primary?: boolean };
export type MenuCommand = { id: string; label: string; shortcut?: string; run?: () => void | Promise<void>; disabledReason?: string };
export type PageCommands = Partial<Record<StandardCommandId, CommandSpec>> & { more?: MenuCommand[] };
export type CommandSource = 'page' | 'list' | 'grid';
// shortcuts.ts
export type KeyChord = { key: string; ctrl: boolean; alt: boolean; shift: boolean };
export type KeyEventLike = Pick<KeyboardEvent, 'key'|'code'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'>;
export const STANDARD_SHORTCUTS: Record<StandardCommandId, string>; // değerler Global Constraints'teki gibi
export const MORE_MENU_SHORTCUT = 'Alt+İ';
export function parseShortcut(text: string): KeyChord;
export function matchesShortcut(event: KeyEventLike, chord: KeyChord): boolean;
export function formatShortcut(text: string, locale: 'tr'|'en'): string; // 'Ctrl+Delete' → 'Ctrl+Del'
```
Komut "etkin" = `run` tanımlı ve `disabledReason` yok.

- [ ] **Step 1: Test** `shortcuts.test.ts`:
  - `Ctrl+S matches key "s" and "S", and metaKey on mac`
  - `Ctrl+S matches code "KeyS" when key is a non-Latin letter` (`key:"ы"`)
  - `Ctrl+S does not match with altKey (AltGr = Ctrl+Alt)`
  - `F2 / F5 / F1 match by key`, `Enter does not match Shift+Enter`
  - `Ctrl+Delete matches key "Delete"`
  - `Alt+İ matches {key:"i",code:"Quote",altKey}` (TR-Q), `{key:"i",code:"KeyI",altKey}` (US), `{key:"İ",altKey,shiftKey}`
  - `Alt+İ does not match {key:"ı",code:"KeyI",altKey}` (TR-Q noktasız ı)
  - `Alt+İ matches {key:"ˆ",code:"KeyI",altKey}` (Mac ölü tuş → code yedeği)
  - `formatShortcut("Ctrl+Delete","tr") === "Ctrl+Del"`
- [ ] **Step 2:** `npx vitest run src/commands` → FAIL
- [ ] **Step 3:** Uygula. Harf karşılaştırması `toLowerCase()` ile değil açık küme ile (`İ` için `{"i","I","İ"}`); `key` Latin harf değilse `code === "Key"+X` yedeği.
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit `ERP Web: kısayol eşleştirme (Türkçe klavye dahil)`

### Task 4: Komut kaydı

**Files:** Create `src/commands/registry.ts`; Test `src/commands/registry.test.ts`

**Interfaces — Consumes:** Task 3. **Produces:**
```ts
export type DispatchEnv = { typing: boolean; modalOpen: boolean };
export type GlobalCommand = { id: string; shortcut: string; run: (e: KeyboardEvent) => void; allowWhileTyping?: boolean; allowInModal?: boolean };
export type CommandRegistry = {
  register(viewKey: string, source: CommandSource, commands: PageCommands): () => void;
  setActiveView(viewKey: string): void;
  getActive(): PageCommands | undefined;           // page > list > grid birleşimi, standart komut bazında
  registerGlobal(command: GlobalCommand): () => void;
  subscribe(listener: () => void): () => void;
  handleKeyDown(event: KeyboardEvent, env: DispatchEnv): boolean; // true = işlendi, preventDefault yapıldı
};
export function createCommandRegistry(): CommandRegistry;
export const RESERVED_BROWSER_CHORDS = ['Ctrl+S','Ctrl+P','Ctrl+F','Ctrl+E','Ctrl+D','F5'];
```

- [ ] **Step 1: Test** `registry.test.ts`:
  - `dispatches only to the active view` (iki görünüm `save` kaydeder; yalnızca etkin olanın `run`'ı çağrılır)
  - `merges sources per command: page overrides list overrides grid` (grid `export`, list `filter`+`refresh`, page `new`)
  - `unregister removes only that source`
  - `does not run a disabled command but still prevents default for reserved chords` (`print` `disabledReason` ile → `run` çağrılmaz, `preventDefault` çağrılır, dönüş `true`)
  - `prevents browser defaults for reserved chords even when the command is absent` (`F5` kayıtsız → reload engellenir)
  - `typing guard`: `typing:true` iken `Enter`, `Ctrl+Z`, `Ctrl+A`, `Ctrl+Delete` → `false`, `preventDefault` yok; `Ctrl+S`, `F2`, `Ctrl+F` → çalışır
  - `suppresses page commands while a modal is open` (`modalOpen:true` → `Ctrl+S` çalışmaz ve `preventDefault` YAPILMAZ ki modalın kendi işleyicisi çalışsın); `allowInModal` global çalışır
  - `Alt+İ runs the "open more menu" global`
  - `global commands run regardless of active view and respect allowWhileTyping` (`Ctrl+K` yazarken çalışır)
  - `subscribe notifies on register, unregister and setActiveView`
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** Uygula (React'siz, saf modül).
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit `ERP Web: görünüm bazlı komut kaydı`

### Task 5: React bağları ve tek dinleyici

**Files:**
- Create `src/commands/CommandProvider.tsx`; Test `src/commands/CommandProvider.test.tsx`
- Modify `src/WorkspaceComponents.tsx` (`KeepAliveViews` her görünümü `<ViewKeyContext.Provider value={key}>` ile sarar ve etkin anahtarı `registry.setActiveView` ile bildirir)
- Modify `src/App.tsx` (kökü `CommandProvider` ile sar; `useWorkspaceShortcuts` çağrısı kalkar)
- Modify `src/useWorkspaceShortcuts.ts` → aynı davranışlar `registerGlobal` ile kaydedilir (dosya `useWorkspaceGlobalCommands` olarak yeniden adlandırılır; parametreleri aynı)

**Interfaces — Produces:**
```ts
export const ViewKeyContext: React.Context<string>; // varsayılan "root"
export function CommandProvider(props: { children: ReactNode }): JSX.Element;
export function useCommandRegistry(): CommandRegistry;
export function usePageCommands(commands: PageCommands, source?: CommandSource): void; // varsayılan 'page'; her render'da son işleyicileri kullanır (ref), yeniden kayıt yalnızca etkin/devre dışı durumu değişince
export function useActivePageCommands(): PageCommands | undefined; // useSyncExternalStore
```
Dinleyici `window` üzerinde capture aşamasında tektir; `typing = target.closest('input,textarea,select,[contenteditable="true"]')`, `modalOpen = document.querySelector('[aria-modal="true"]:not([hidden])') !== null`.

- [ ] **Step 1: Test** `CommandProvider.test.tsx` (RTL):
  - `usePageCommands registers under the surrounding view key` (iki `ViewKeyContext` altında iki bileşen; etkin olan değişince `Ctrl+S` doğru bileşene gider)
  - `uses the latest handler without re-registering` (state değişen işleyici)
  - `keeps Ctrl+K, Ctrl+B, Ctrl+W, Ctrl+Tab, Alt+Arrow and Escape-closes-search behaviour` (eski `useWorkspaceShortcuts` davranışının her biri için bir `it`)
  - `does not dispatch while a confirm dialog is open` (`confirmDialog` açıkken `Ctrl+S`)
- [ ] **Step 2:** FAIL · **Step 3:** Uygula · **Step 4:** `npx vitest run` PASS, `npm run build` başarılı
- [ ] **Step 5:** Commit `ERP Web: komut kaydı React bağları; eski kısayollar tek dinleyicide`

### Task 6: ActionBar, İşlemler menüsü ve F1 yardımı

**Files:**
- Create `src/action-bar/ActionBar.tsx`, `src/action-bar/action-bar.css`, `src/action-bar/ShortcutHelpDialog.tsx`; Test `src/action-bar/ActionBar.test.tsx`
- Modify `src/WorkspaceShellPage.tsx` — `workspace-page-main` içinde, ekran sekmelerinin altında ve sayfa içeriğinin üstünde `<ActionBar locale={locale} />` (launcher/dashboard'da çizilmez)
- Modify `src/locales/en/` (yeni sözlük dosyası `action-bar.ts` + `index.ts` kaydı)

*(Benim kararım: Faz 1'de çubuk kabukta, sekmelerin altında durur; sayfa başlıkları sayfanın içinde kalır. Faz 2'de başlık kabuğa alınıp taslaktaki gibi çubuğun üstüne geçer.)*

`undo` (Değişiklikleri geri al `Ctrl+Z`) yalnızca sayfa kaydettiğinde, "İşlemler"in solunda çizilir; bu, kayıt ekranına özgü ek düğmedir (spec §5.5) ve sıra kuralının dışında tutulur.

Görünüm (taslak 01): düğme `ikon + etiket + <kbd>kısayol</kbd>`; birincil komut mavi dolu; ayırıcılar `delete|refresh`, `filter|print` arasında; sağda "İşlemler ▾" menüsü; dar ekranda çubuk `overflow-x: auto`, sayfa taşmaz. İkonlar: `Plus, SquarePen, Save, Trash2, RefreshCw, Filter, Printer, FileSpreadsheet, ChevronDown`.

Etiketler (tr / en): Yeni/New · Aç/Open · Kaydet/Save · Sil/Delete · Yenile/Refresh · Filtre/Filter · Yazdır/Print · Excel/Excel · İşlemler/Actions · Kısayollar/Shortcuts.

- [ ] **Step 1: Test** `ActionBar.test.tsx`:
  - `renders the eight standard buttons in fixed order plus the actions menu` (`data-command` sırası `ACTION_BAR_ORDER`, sonra `more`)
  - `renders a button for every command even when the page registered nothing` (hepsi `disabled`)
  - `disabled button shows its reason as title and is not hidden`
  - `marks the primary command` (`data-primary="true"`)
  - `shows the formatted shortcut on each button` (`Ctrl+Del`)
  - `actions menu opens with Alt+İ, lists items with shortcut, disabled items show reason, Esc closes and returns focus`
  - `clicking a button and pressing its shortcut call the same run`
  - `F1 opens the shortcut help listing all standard and global shortcuts`
  - `has an accessible name on every button` (UI denetimi etiketsiz kontrolü yakalar)
- [ ] **Step 2:** FAIL · **Step 3:** Uygula · **Step 4:** PASS + build
- [ ] **Step 5:** Commit `ERP Web: ortak İşlem Çubuğu ve kısayol yardımı`

### Task 7: Yedek komutlar — tablo ve liste araç çubuğu

**Files:**
- Modify `src/AdvancedDataGrid.tsx` — `usePageCommands({ export: { run: exportExcel } }, 'grid')`; tablo `hideExport` alsa da kaydeder. Bir görünümde birden çok tablo varsa ilk bağlanan kazanır (registry davranışı).
- Modify `src/list-page/ListToolbar.tsx` — `usePageCommands({ filter: { run: focusSearch } , refresh: onRefresh ? { run: onRefresh } : undefined }, 'list')`; mevcut yenile ikon düğmesi kaldırılır (çubukta var).
- Test `src/commands/fallbacks.test.tsx`

- [ ] **Step 1: Test:** `grid registers export for its view`, `list toolbar registers filter that focuses the search input`, `page command overrides grid export`
- [ ] **Step 2:** FAIL · **Step 3:** Uygula · **Step 4:** PASS + build
- [ ] **Step 5:** Commit `ERP Web: tablo ve liste araç çubuğundan Excel/Filtre/Yenile komutları`

### Task 8: Çerçeve — ikon şeridi, alt menü, üst çubuk

**Files:**
- Create `src/shell/moduleMenus.ts`, `src/shell/WorkspaceSubNav.tsx`, `src/shell/shell.css`; Test `src/shell/moduleMenus.test.ts`
- Modify `src/WorkspaceShellPage.tsx` (ray 58px ikon şeridi, etiket `title`+`aria-label`; yanında `WorkspaceSubNav`), `src/WorkspaceTopbar.tsx` (stil; tenant seçici "001 · Merkez" görünümü), `src/erp-navigation.css`, `src/erp-redesign.css`

**Interfaces — Produces:**
```ts
export type ModuleMenu = { railId: string; title: [tr: string, en: string]; pages: string[] };
export const moduleMenus: ModuleMenu[]; // railId'ler workbenchRailItems id'leriyle aynı
export function moduleForPage(page: string): ModuleMenu | undefined;
```
Sayfa listeleri mevcut kaynaklardan türetilir: `salesNavigationPages`, `purchasingNavigationPages`, `inventoryPageTitles`, `manufacturingPageTitles` (`workspace-navigation.ts`), finans anahtarları `WorkspacePageRouter.tsx` satır 351–450.

- [ ] **Step 1: Test** `moduleMenus.test.ts`:
  - `every page key routed in WorkspacePageRouter belongs to exactly one module menu or to STANDALONE_PAGES` (router dosyası metin olarak okunur, `page === "…"` anahtarları çıkarılır; `STANDALONE_PAGES` = launcher, dashboard, erp-assistant, settings ve diğer ayar/platform sayfaları açıkça listelenir)
  - `every module menu railId exists in the rail items`
- [ ] **Step 2:** FAIL · **Step 3:** Uygula. Alt menü: modül başlığı, ekranlar (etkin olan vurgulu), en altta "Sık kullanılanlar" (Faz 4'e kadar boş → çizilmez), tenant özel menüleri `TenantModuleNavigation` / `TenantCustomMenuNavigation` alt menünün "Özel" grubunda. Genişlik kuralları: ≥1280 alt menü açık; <1280 yalnızca ikon şeridi; ray tercihleri (sıra/gizli/düzenle penceresi) aynen çalışır.
- [ ] **Step 4:** PASS + build. Görsel kontrol (Task 2 Step 5 gibi): 1720, 1440, 1280, 390 genişlikte Stok Kartları ekran görüntüsü; taslak 01 ile karşılaştırılır; 390'da yatay taşma yok.
- [ ] **Step 5:** Commit `ERP Web: yeni çerçeve — ikon şeridi, modül alt menüsü, üst çubuk`

### Task 9: UI denetimine çubuk kontrolü

**Files:** Modify `tests/ui/module-design-audit.spec.ts`, `tests/ui/README.md`

- [ ] **Step 1:** Her ekran için yeni bulgular: `action-bar-missing` (launcher hariç `[data-nx-action-bar]` yok), `action-bar-order` (`data-command` sırası `new,open,save,delete,refresh,filter,print,export,more` değil), `duplicate-common-action` (çubuğun dışında görünür metni Yeni/Kaydet/Sil/Yazdır/Excel/Dışa aktar olan sayfa başlığı düğmesi — `.heading-actions`, `.page-heading` içinde).
- [ ] **Step 2:** Test ortamına karşı çalıştır: `npm run test:ui-design` (ortam değişkenleri `tests/ui/README.md`). Beklenen: henüz bağlanmamış ekranlar `duplicate-common-action` verir; bu liste Task 10–18'in yapılacaklar listesidir. Ortam yoksa adım "çalıştırılamadı" diye raporlanır.
- [ ] **Step 3:** Commit `ERP Web UI denetimi: İşlem Çubuğu sırası ve mükerrer düğme kontrolü`

### Task 10–18: Ekranları çubuğa bağlama (modül başına bir görev, bir PR)

Her görev aynı kuralı modülün ekranlarına uygular:

1. Sayfa bileşeninde mevcut işleyiciler bulunur ve `usePageCommands` ile kaydedilir:
   - **new** → mevcut "Yeni …" işleyicisi; liste ekranında `primary: true`
   - **open** → seçili satırı açan mevcut işleyici (tablo çift tık / satır işlem menüsündeki "Aç/Düzenle"); seçim yoksa `disabledReason: "Önce bir kayıt seçin"`
   - **save** → açık form/editörün gönderimi; form açıkken `primary: true`; form yoksa yok
   - **delete** → mevcut sil işleyicisi (mevcut `confirmDialog` akışıyla); silinemeyen kayıtta Global Constraints'teki neden; mevcut "İptal / Ters kayıt" işlemleri `more` menüsüne
   - **refresh**, **filter**, **export** → sayfanın kendisi sağlamıyorsa Task 7 yedekleri yeter
   - **print** → yalnızca sayfada mevcut yazdırma/baskı formu varsa; yoksa kaydedilmez (soluk)
   - **more** → sayfa başlığındaki diğer işlemler (Onayla, Kopyala, İçe aktar, Dönüştür …) aynı etiketlerle
2. Aynı işi yapan eski başlık düğmeleri kaldırılır; başka hiçbir düzen değişikliği yapılmaz.
3. Yeni metin varsa İngilizce karşılığı sözlüğe.
4. Doğrulama: `npx vitest run`, `npm run build`, `NEXORA_UI_SCREEN_FILTER` ile o modülün ekranlarına UI denetimi → modülün ekranlarında `action-bar-*` ve `duplicate-common-action` bulgusu yok; elle: modülün her ekranında F2, Ctrl+S, Ctrl+E, Alt+İ denenir.
5. Commit + ayrı PR: `ERP Web: <Modül> ekranları İşlem Çubuğu'na bağlandı`

| Task | Modül | Sayfa anahtarları → bileşen |
|---|---|---|
| 10 | **Stok (pilot)** | `inventory-stock`, `inventory-stock-create` → `InventoryStockPage`/`InventoryPage`; `inventory-stock-movements` → `InventoryMovementsPage`; `inventory-cost` → `InventoryCostPage`; `inventory-warehouses` → `InventoryWarehousesPage`; `inventory-transfers` → `InventoryTransfersPage`; `inventory-locations` → `WarehouseLocationsPage`; `inventory-tracking` → `InventoryTrackingPage` |
| 11 | Satış | `sales-customer-requests`, `sales-quotes`, `sales-quote-create`, `sales-orders`, `sales-order-create`, `sales-deliveries`, `sales-delivery-create`, `sales-invoices`, `sales-invoice-create`, `sales-returns`, `sales-distribution`, `sales-promotions` |
| 12 | Satınalma | `sales-requests`, `sales-purchase-quotes`, `sales-purchasing`, `sales-purchase-order-create`, `sales-purchase-delivery-notes`, `sales-purchase-receipts`, `sales-purchase-invoices`, `sales-purchase-returns`, `sales-purchase-invoice-entry`, `sales-purchase-invoice-drafts`, `commercial-contracts` |
| 13 | Cari / CRM | `customers`, `customer-create`, `customer-edit`, `customer-ledger`, `crm-opportunities`, `crm-opportunity-create` |
| 14 | Finans | `finance-*` anahtarlarının tümü (`WorkspacePageRouter.tsx` 351–450; `LedgerOverviewPage` alt görünümleri dahil) |
| 15 | Üretim | `manufacturing-*` (8 anahtar) |
| 16 | Diğer modüller | `fixed-assets`, `human-resources`, `projects`, `foreign-trade`, `integrations`, `erp-assistant` (asistanda yalnızca yedekler) |
| 17 | Ayarlar | `settings`, `company-settings`, `license-settings`, `ai-settings`, `audit`, `access`, `location-definitions`, `address-definitions` |
| 18 | Low-code / platform | `screen-views`, `custom-lists`, `custom-menus`, `custom-forms`, `business-rules`, `reports`, `workflows`, `modules`, `custom-page:*`, `custom-page-preview:*`, tenant modül ekranı |

Task 10 tamamlanınca kullanıcıya Stok ekranlarının ekran görüntüleri gösterilir; Task 11–18 ondan sonra başlar.

### Task 19: Belgeler

**Files:** Modify `src/list-page/README.md` (özet kartı yasağı ve "kod adın altında" kuralı taslak 01'e göre güncellenir: uyarı taşıyan, tıklanınca süzen ikonlu özet kartlarına izin; ortak işlemler başlıkta değil İşlem Çubuğu'nda; `usePageCommands` örneği), `src/record-form/README.md`, `src/document-page/README.md` (ortak işlemler çubuğa), yeni `src/action-bar/README.md` (komut modeli, kısayol tablosu, Sil/Excel/Yazdır kuralları, yedek komutlar).

- [ ] **Step 1:** Yaz · **Step 2:** Commit `ERP Web: İşlem Çubuğu ve liste kuralları belgelendi`
