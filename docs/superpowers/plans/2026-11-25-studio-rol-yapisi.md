# Studio'nun rol bazlı yeni yapısı (alt proje 2b) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Studio'yu Danışman / Yazılımcı / Yönetici rollerine göre menülere ayırmak. Rolleri sunucuda zorlamak. Ana sayfa, Talepler, Yayınlar, Kişiler ve roller, Bağlantılar ekranlarını kurmak. Bugünkü araçları yeni yerlerine taşımak.

**Architecture:**
- **Studio rolü:** firma üyeliğine ek bir alandır (`TenantMembership.StudioRole`). ERP rolü (`Role`) ve ERP izin kuralları hiç değişmez.
- **Etkin rolü kim hesaplar:** AIService, her istekte veritabanından hesaplar. Böylece yöneticinin rol değişikliği firma yeniden seçilmeden geçerli olur.
- **Studio arayüzü:** menüyü saf bir modülden (`studioNav.ts`) üretir. Bugünkü araçlar (sayfa tasarımcısı, iş akışları, özel menüler, projeler…) yeni menü öğelerinin içine olduğu gibi yerleştirilir. Yeni tasarımcı ve yeni Kurallar ekranı sonraki alt projelerdedir.

**Tech Stack:** .NET 10 minimal API + EF Core (PlatformDB migration), xUnit; React + Vite + TypeScript, vitest (Studio testleri `renderToString` ve saf fonksiyonlarla yazılır, jsdom yok).

**Spec:** `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` — §2, §6.9, §7 (2b), §10 ("Roller sunucuda zorlanır"), §11. Ekran taslağı: `docs/design-proposals/studio-sadelestirme/07-studio-yapisi.html`. Kullanıcı bu taslaktaki menüleri ve ekranları onayladı. Ayrıca taslak onayı gerekmez, ama ekranlar taslaktaki içerikten sapmamalı ([[design-approval-first]]).

## Taban dal

- 1. alt proje (PR [fkokay/Nexora#168](https://github.com/fkokay/Nexora/pull/168)) `NativePlatformTool.tsx`, `LowCodeDesignerPage.tsx` ve `CustomPagesPage.tsx` dosyalarına dokunuyor.
- **#168 birleştiyse:** 2b'ye güncel `origin/master`'dan yeni bir dalla başla.
- **#168 birleşmediyse:** dalı `claude/adoring-turing-618c3d`'den aç ve üstüne `origin/master`'ı birleştir.
- Bu plan o dosyalara yalnızca prop ekler. Satır numarasına değil, adlandırılmış öğelere başvurur.

## Global Constraints

- ERP izinleri değişmez: `TenantMembership.Role`, `TenantPermissionRule`, `PlatformPermissionAuthorizer` ve ERP uçlarının rol kontrollerine dokunulmaz.
- Migration yalnızca genişletir (expand): yeni sütun boş bırakılabilir (nullable), varsayılan değer yoktur, hiçbir şey yeniden adlandırılmaz ya da silinmez (`docs/release-migrations.md`).
- Studio rol değerleri tam olarak: `Consultant`, `Developer`, `None` (veritabanında), ya da `null` (= varsayılan). Arayüz adları: **Danışman**, **Yazılımcı**, **Yönetici**.
- Yönetici = ERP rolü `TenantAdmin`. Ayrı bir Studio değeri yoktur. TenantAdmin hiçbir Studio kuralıyla kilitlenemez (mevcut ERP ilkesiyle aynı).
- Menü adları ve sıraları §6.9 tablosundaki gibidir, harfi harfine:
  - **Danışman:** Ana sayfa, Ekranlar, Kurallar, Menüler, Taleplerim, Yayınlar
  - **Yazılımcı:** Ana sayfa, Gelen talepler, Firma modülü, Ekranlar, Kurallar, Yayınlar
  - **Yönetici:** Ana sayfa, Kişiler ve roller, Modül pazaryeri, Bağlantılar, Yapay zekâ, Yayınlar
- "Platform uyarlama" ekranı, akış kartları ve "Uyarlama araçları" listesi kalkar. Bir eski araç, ancak yeni yeri aynı görevde hazır olduğunda menüden kalkar (§11).
- Talep durumu etiketleri tam olarak şunlardır: **Yeni**, **Deneme ortamında**, **Yayında**.
- Tüm kullanıcı metni Türkçe. Yeni uçlar kiracı kapsamlıdır: kiracı yalnızca `tenant_id` iddiasından gelir, istek girdisinden alınmaz. Her yazma işlemi denetim (audit) kaydı yazar.
- `localStorage` erişimleri `try/catch` içinde yapılır. Okunamazsa varsayılan davranış sürer.

## Benim kararlarım (kullanıcı düzeltebilir)

1. **Studio rolü ERP rolünden ayrıdır.** Danışman için yeni bir ERP rolü açılmadı. Bunun nedeni: ERP izin kuralları role bağlıdır, yeni bir rolün hiç kuralı olmaz, danışman ERP erişimini kaybederdi.
2. **Varsayılan roller.** `StudioRole` boşsa:
   - `TenantDeveloper` ya da herhangi bir Studio proje yetkisi olan kişi → Yazılımcı
   - diğerleri → Danışman

   Böylece bugün Studio'yu kullanan kimse erişim kaybetmez.
3. **Yazılımcı, danışmanın yapabildiğini de yapar** (taslak 07, Kişiler ve roller). Yönetici her üç menüyü görür ve soldaki rol düğmesiyle aralarında geçer. Ötekiler yalnız kendi menülerini görür. Bu, Yöneticinin onaylanan menüsünde Ekranlar ve Kurallar olmamasından doğan boşluğu kapatır. Kullanıcıya ilk sorulacak karar budur.
4. **2b'de sunucuda zorlanan uçlar:** AIService'teki `/studio/projects/**` ve `/studio/workspace-requests/**` (kod, çalışma alanı, sürüm, dağıtım). Bunlar yalnız Yazılımcı ve Yöneticiye açıktır.
   - Veri modeli tanımı ve sayfa SQL yazımı bugünkü yetkileriyle kalır. Bu uçlar 2. alt projede yapı taşı uçlarıyla birlikte Yazılımcıya kapanır. Şimdi kapatmak, yerini alacak ekran yokken danışmanın işini bozardı (§11).
5. **Kurallar ve Menüler 2b'de bugünkü araçları açar:** Kurallar = İş akışları + İş kuralları sekmeleri, Menüler = Özel menüler. Yeni Kurallar ekranı 6. alt projededir.
6. **Firma modülü 2b'de iki sekmedir:** "Kod ve sürümler" (bugünkü Projeler ekranı; veritabanı mühendisi ve kaynak eşlemeleri onun içinde kalır) ve "Veri modelleri". Yapı taşı formları ve "Araçlar" bölümü 2. alt projededir.
7. **Ekranlar 2b'de bugünkü sayfa kataloğunu açar** (`LowCodeDesignerPage` → pages). Sekmeler: Sayfalar, Formlar, Raporlar. Kalıp süzgeci ve "önce kalıp seç" adımı 3. alt projededir.
8. **Yayınlar 2b'de ekranları kapsar** (özel sayfalar ve sistem sayfası firma tasarımları), ek olarak Yazılımcı ve Yönetici için modül canlı dağıtımlarını. Kuralların sürüm geçmişi henüz yok, Kurallar 6. alt projeyle Yayınlar'a eklenir.
9. **Bağlantılar 2b'de yalnız GitHub'ı gösterir** (proje başına yetki durumu). Dış sistem bağlantı kaydı bugün yok. "Yöneticinin onayladığı bağlantı" kuralı 2. alt projede uzantılarla gelir.
10. **Ana sayfadaki "Yeni yapı taşları" (Danışman) ve "Uzantı hataları" (Yazılımcı) kartları** veri kaynakları 2. alt projede doğunca eklenir. 2b'de bu kartlar gösterilmez.

## Review Focus

1. **Eski bağlantılar:** ERP'nin Studio'ya açtığı `?contextPage=…&moduleStarter=…` adresleri, ayrıca kayıtlı `#adaptation`, `#tool-<id>`, `#projects`, `#requests`, `#analytics` adresleri doğru yeni ekranı açmalı, boş sayfa açmamalı. Görev 4'teki testler sabitler.
2. **Servis jetonları:** Runner, Sandbox ve Deployer'ın AIService'e çağrı yaptığı yollar Yazılımcı korumasına takılmamalı. Koruma yalnız `role` iddiası taşıyan kullanıcı jetonlarına uygulanır. Görev 3'teki test sabitler.
3. **Rolü "Studio'ya erişimi yok" olan kişi:** boş menü yerine açıklayıcı bir ekran görmeli. Kod uçları 403 vermeli, talep açabilmeli mi? Hayır: `None` hiçbir Studio ucunu kullanamaz. Görev 3 ve 5'teki testler sabitler.
4. **Son yönetici:** Studio rolü değiştirmek ERP rolüne dokunmaz. Yönetici kendi Studio rolünü değiştirse de Yönetici kalır. Görev 2'deki test sabitler.
5. **Önceki sürüme dön, açık taslak varken:** mevcut restore ucu 409 döner. Arayüz bunu "Bu ekranın açık bir taslağı var. Önce onu yayınlayın ya da silin." diye göstermeli, sessizce yutmamalı. Görev 7'deki test sabitler.

---

## PR 1 — roller ve yeni kabuk (Görev 1–5)

### Task 1: Studio rolü alanı ve çözümleyici

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs` (`TenantMembership`)
- Modify: `src/Platform/AIERP.Platform.Infrastructure/PlatformDbContext.cs` (TenantMembership eşlemesi)
- Create: `src/Platform/AIERP.Platform.Application/StudioAccess.cs`
- Create: migration `AddStudioRoleToMembership` (PlatformDbContext)
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/StudioAccessTests.cs`

**Interfaces:**
- Produces:
  - `TenantMembership.StudioRole : string?` (sütun `nvarchar(20)`, nullable)
  - `public static class StudioRoles { const string Consultant = "Consultant", Developer = "Developer", None = "None"; static bool IsValid(string? value) }` (`null` geçerlidir)
  - `public sealed record StudioAccess(bool IsAdmin, string WorkRole)` (`WorkRole` ∈ Consultant/Developer/None)
  - `StudioAccess.MenuRoles : IReadOnlyList<string>`: Admin → `["Admin","Developer","Consultant"]`, Developer → `["Developer"]`, Consultant → `["Consultant"]`, None → `[]`
  - `StudioAccess.CanWriteCode : bool` = `IsAdmin || WorkRole == Developer`
  - `public static StudioAccess StudioAccessResolver.Resolve(string membershipRole, string? studioRole, bool hasProjectGrant)`

- [ ] **Step 1: Write the failing tests** (`[Theory]`, `[InlineData]` ile)
  - `Resolve("TenantAdmin", null, false)` → `IsAdmin == true`, `MenuRoles` = `["Admin","Developer","Consultant"]`, `CanWriteCode == true`
  - `Resolve("TenantAdmin", "None", false)` → `IsAdmin == true` (yönetici kilitlenmez)
  - `Resolve("TenantUser", null, false)` → `WorkRole == "Consultant"`, `CanWriteCode == false`
  - `Resolve("TenantUser", null, true)` → `"Developer"`
  - `Resolve("TenantDeveloper", null, false)` → `"Developer"`
  - `Resolve("TenantDeveloper", "Consultant", true)` → `"Consultant"` (açık değer varsayılanı ezer)
  - `Resolve("TenantUser", "None", true)` → `"None"`, `MenuRoles` boş
  - `StudioRoles.IsValid("Admin") == false`, `IsValid("developer") == false` (büyük-küçük harf duyarlı), `IsValid(null) == true`
- [ ] **Step 2:** Run `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~StudioAccessTests"`. Expected: derleme hatası (tip yok).
- [ ] **Step 3:** Implement the types above. Add `StudioRole` to the entity and `HasMaxLength(20)` to the mapping.
- [ ] **Step 4:** `dotnet tool restore`, then for each of the three contexts run `dotnet ef migrations has-pending-model-changes --project src/Platform/AIERP.Platform.Infrastructure --context <Ctx>`. Add migration `AddStudioRoleToMembership` to every context that reports changes (CLAUDE.md'deki komutlarla, Tenant ve AIStudio için `--output-dir`). Migration yalnız `AddColumn` içermeli.
- [ ] **Step 5:** Testleri yeniden çalıştır, PASS. `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~ArchitectureBoundaryTests"` de PASS.
- [ ] **Step 6: Commit** — `feat(studio): üyeliğe Studio rolü ve rol çözümleyici`

### Task 2: AIService — `/studio/me` ve kişiler uçları

**Files:**
- Create: `src/AI/AIERP.AIService/StudioAccessEndpoints.cs` (`MapStudioAccessEndpoints(this WebApplication app)`; `Program.cs`'te çağrılır)
- Create: `src/AI/AIERP.AIService/StudioAccessLookup.cs`
- Test: `tests/IntegrationTests/StudioAccessEndpointsIntegrationTests.cs`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `static Task<StudioAccess?> StudioAccessLookup.ForUserAsync(PlatformDbContext platformDb, AIStudioDbContext studioDb, Guid tenantId, Guid userId, CancellationToken ct)`: etkin üyelik yoksa ya da kullanıcı veya firma pasifse `null`. `hasProjectGrant` = o firmada `DevelopmentProjectAccesses` içinde bu kullanıcının, aktif bir projeye ait kaydı var mı.
  - `GET /studio/me` → `{ isAdmin: bool, workRole: string, menuRoles: string[] }`; erişim yoksa 403.
  - `GET /studio/people` (yalnız Yönetici) → `[{ userId, displayName, email, membershipRole, studioRole: string|null, effectiveRole: "Admin"|"Developer"|"Consultant"|"None" }]`. `effectiveRole` için önce `IsAdmin`, yoksa `WorkRole` kullanılır.
  - `PUT /studio/people/{userId}/studio-role` body `{ studioRole: string|null }` (yalnız Yönetici): geçersiz değer 400, üye değilse 404. Audit: `studio.member.role-updated`, `Resource = "{userId:D}:{studioRole ?? "default"}"`. Döner: güncellenmiş kişi satırı.
- Yönetici kontrolü jetondaki rolle değil, veritabanındaki `membership.Role == "TenantAdmin"` ile yapılır.

- [ ] **Step 1: Write the failing tests**
  - `Me_returns_consultant_for_tenant_user_without_grants` → `workRole == "Consultant"`, `menuRoles == ["Consultant"]`
  - `Me_returns_all_menus_for_tenant_admin`
  - `People_is_forbidden_for_non_admin` → 403
  - `Put_studio_role_updates_and_audits` → 200. Satırda `studioRole == "Developer"` ve `effectiveRole == "Developer"`. `AuditEvents` içinde `studio.member.role-updated` var.
  - `Put_studio_role_rejects_unknown_value` → `"Admin"` 400
  - `Put_studio_role_on_admin_keeps_admin` → yöneticiye `"None"` verilince `effectiveRole == "Admin"`, ERP `Role` hâlâ `TenantAdmin`
  - `Put_studio_role_cannot_touch_other_tenant` → başka firmanın kullanıcısı 404

  Test sunucusunu mevcut AIService entegrasyon testlerindeki gibi kur (`AIServiceMigrationReadinessIntegrationTests.cs` ve `GitHubPullRequestWebhookIntegrationTests.cs` örnek alınır).
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~StudioAccessEndpointsIntegrationTests"` → FAIL (404).
- [ ] **Step 3:** Implement the endpoints. `.RequireAuthorization()` ile kur. `TryScope`'u yeniden kullan.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Commit** — `feat(studio): /studio/me ve kişiler-roller uçları`

### Task 3: AIService — Yazılımcı koruması ve talep durumu

**Files:**
- Create: `src/AI/AIERP.AIService/StudioDeveloperGuard.cs`
- Create: `src/Platform/AIERP.Platform.Domain/DevelopmentRequestStages.cs`
- Modify: `src/AI/AIERP.AIService/Program.cs` (koruma kaydı, `/studio/requests` GET, `RequestView`)
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/DevelopmentRequestStagesTests.cs`, `tests/IntegrationTests/StudioDeveloperGuardIntegrationTests.cs`

**Interfaces:**
- Consumes: `StudioAccessLookup.ForUserAsync` (Task 2).
- Produces:
  - `app.UseStudioDeveloperGuard()`: kimlik doğrulamadan sonra kaydedilen bir ara katman (middleware). Davranışı:
    - Yol `/studio/projects` ya da `/studio/workspace-requests` ile başlıyorsa ve jetonda `role` iddiası varsa, `ForUserAsync` sonucu `CanWriteCode` değilse 403 döner, gövde `{ code: "studio.role.developer_required", error: "Bu işlem için Yazılımcı rolü gerekir." }`.
    - `role` iddiası olmayan servis jetonları geçer.
  - Ayrıca `/studio/requests` ve `/studio/capabilities` için `ForUserAsync` sonucu `null` ya da `WorkRole == "None"` (ve yönetici değil) ise 403 döner.
  - `public static string DevelopmentRequestStages.Derive(IEnumerable<(string Environment, string Status)> deployments)` → `"Production"` | `"Staging"` | `"New"`. Yalnız `Succeeded` ya da `Superseded` dağıtımlar sayılır. Production, Staging'i yener.
  - `RequestView` iki alan kazanır (sona eklenir): `bool IsMine`, `string Stage`. Aşama zinciri: talep → `DevelopmentWorkspaceRequest.DevelopmentRequestId` → `ReleaseCandidateRecord.WorkspaceRequestId` → `StudioReleaseVersionRecord.ReleaseCandidateId` → `StudioReleasePackageRecord.ReleaseVersionId` → `StudioReleaseDeploymentRecord.ReleasePackageId`. Tek sorguda ya da talep kimlikleri için toplu sorguyla çekilir, talep başına sorgu yapılmaz.

- [ ] **Step 1: Write the failing tests**
  - Birim: `Derive([])` → `"New"`; `[("Staging","Succeeded")]` → `"Staging"`; `[("Staging","Succeeded"),("Production","Superseded")]` → `"Production"`; `[("Production","Failed")]` → `"New"`.
  - Entegrasyon:
    - `Consultant_gets_403_on_projects_list` → `GET /studio/projects/` 403, `code == "studio.role.developer_required"`
    - `Developer_by_grant_keeps_project_access` → yetkili TenantUser 200
    - `Admin_passes_guard`
    - `Service_token_without_role_claim_is_not_blocked`: bir Runner/Deployer geri çağrı yolu için. Uygulayıcı önce `Program.cs`'te servis jetonuyla çağrılan `/studio/projects/...` ya da `/studio/workspace-requests/...` yollarını bulur (ör. dağıtım jetonu, `project_id` iddialı). Böyle yol yoksa testte bunu belirten bir yorumla tek bir rolsüz jeton denemesi yapılır.
    - `None_role_cannot_list_requests` → 403
    - `Requests_list_reports_stage_and_ownership` → Staging başarılı dağıtımı olan talep için `stage == "Staging"`, oluşturanın listesinde `isMine == true`
- [ ] **Step 2:** İki filtreyle testleri çalıştır → FAIL.
- [ ] **Step 3:** Implement. Koruma, `UseAuthentication`/`UseAuthorization`'dan sonra ve uçlardan önce kaydedilir.
- [ ] **Step 4:** Tests PASS. Ardından tüm AIService testleri: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~AIService|FullyQualifiedName~Studio|FullyQualifiedName~GitHub"` → PASS. Mevcut testlerden TenantUser ile proje ucu çağıranlar varsa, o testlerdeki kullanıcıya proje yetkisi verildiğini doğrula. Yetki yoksa testi değiştirmeden önce dur ve bildir (davranış değişikliği demektir).
- [ ] **Step 5: Commit** — `feat(studio): kod uçlarında Yazılımcı koruması, taleplerde aşama`

### Task 4: Studio menü modeli ve eski adres eşlemesi

**Files:**
- Create: `frontend/development-studio/src/shell/studioNav.ts`
- Test: `frontend/development-studio/src/shell/studioNav.test.ts`

**Interfaces:**
- Produces:
  - `type StudioMenuRole = "consultant" | "developer" | "admin"`
  - `type StudioSection = "home" | "screens" | "rules" | "menus" | "my-requests" | "incoming-requests" | "company-module" | "publications" | "people" | "marketplace" | "connections" | "ai"`
  - `type NavItem = { section: StudioSection; label: string; icon: LucideIcon }`
  - `menuFor(role: StudioMenuRole): NavItem[]`: Global Constraints'teki adlar ve sıra; hash = `#${section}`
  - `menuRolesFromApi(menuRoles: string[]): StudioMenuRole[]`: `"Admin"→"admin"`, `"Developer"→"developer"`, `"Consultant"→"consultant"`; bilinmeyen değer atılır
  - `type Route = { section: StudioSection; tab?: string }`
  - `resolveRoute(hash: string, active: StudioMenuRole, held: StudioMenuRole[]): { role: StudioMenuRole; route: Route }`
  - `roleLabel(role: StudioMenuRole): "Danışman" | "Yazılımcı" | "Yönetici"`

Eski hash → yeni yer tablosu (birebir):

| Eski | Yeni |
|---|---|
| `""`, `overview`, `analytics` | `home` |
| `projects`, `tool-source-workspaces` | `company-module`, tab `code` |
| `tool-custom-data` | `company-module`, tab `data-models` |
| `requests` | Danışmanda `my-requests`, ötekilerde `incoming-requests` |
| `adaptation`, `tool-custom-pages` | `screens`, tab `pages` |
| `tool-custom-forms` | `screens`, tab `forms` |
| `tool-reports` | `screens`, tab `reports` |
| `tool-workflows` | `rules`, tab `workflows` |
| `tool-business-rules` | `rules`, tab `business-rules` |
| `tool-custom-menus` | `menus` |
| `marketplace`, `tool-modules` | `marketplace` |
| `tool-settings` | `ai` |

Yeni biçim `#screens/forms` gibidir: bölüm/sekme. Rota etkin rolün menüsünde yoksa, onu içeren ilk tutulan rol (`held` sırasıyla) etkin olur. Hiçbirinde yoksa etkin rolün `home`'u açılır.

- [ ] **Step 1: Write the failing tests**
  - `menuFor("consultant").map(i => i.label)` = `["Ana sayfa","Ekranlar","Kurallar","Menüler","Taleplerim","Yayınlar"]`. Yazılımcı ve Yönetici için de spec'teki listeler birebir.
  - Tablodaki her satır için bir `it.each` vakası (Danışman etkin, Danışman tutuluyor).
  - `resolveRoute("#people", "consultant", ["consultant"])` → `{ role: "consultant", route: { section: "home" } }`
  - `resolveRoute("#company-module", "consultant", ["admin","developer","consultant"])` → `role: "admin"`, section `company-module` (ilk tutan rol)
  - `resolveRoute("#screens/forms", "developer", ["developer"])` → tab `forms`
  - `resolveRoute("#bilinmeyen", "developer", ["developer"])` → `home`
  - `menuRolesFromApi(["Admin","X"])` → `["admin"]`
- [ ] **Step 2:** `npx vitest run src/shell` → FAIL.
- [ ] **Step 3:** Implement (simgeler `lucide-react`'ten: Home, LayoutList, ShieldCheck, Menu, Inbox, Code2, Upload, Users, Package, Link2, Sparkles).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(studio): rol bazlı menü modeli ve eski adres eşlemesi`

### Task 5: Yeni kabuk — rol düğmesi, menü, araçların yeni yerleri

**Files:**
- Create: `frontend/development-studio/src/shell/useStudioAccess.ts`, `src/shell/RoleSwitcher.tsx`, `src/shell/SectionTabs.tsx`, `src/shell/NoStudioAccess.tsx`
- Modify: `frontend/development-studio/src/App.tsx` (kenar çubuğu, bölüm seçimi, `platformTools`, `adaptationFlows`, `quickLinks`, `sectionTitle`)
- Modify: `frontend/development-studio/src/DevelopmentRequestsPage.tsx` (`mode` prop ve aşama rozeti)
- Modify: `frontend/development-studio/src/platform-tools/NativePlatformTool.tsx` (yalnız yeni bir isteğe bağlı prop: `backHref?: string`; bugün `#adaptation`'a dönen bağlantılar bunu kullanır)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/LowCodeDesignerPage.tsx` (`lcd-crumb` bağlantısı `backHref` prop'unu kullanır, varsayılan `#screens`)
- Test: `src/shell/RoleSwitcher.test.tsx`, `src/DevelopmentRequestsPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`/studio/me`), Task 3 (`isMine`, `stage`), Task 4 (tamamı).
- Produces:
  - `useStudioAccess(token, tenantId) → { status: "loading"|"ready"|"denied"|"error"; held: StudioMenuRole[]; active: StudioMenuRole; setActive(role) }`. Etkin rol `localStorage["nexora.studio.role." + tenantId]`'de saklanır. Saklı değer `held` içinde değilse `held[0]` kullanılır.
  - `<RoleSwitcher held active onChange />`: `held.length < 2` ise hiçbir şey çizmez.
  - `<SectionTabs tabs={{id,label}[]} active onSelect />`
  - `DevelopmentRequestsPage` yeni prop'ları: `mode: "mine" | "incoming"`. `mine` modunda yalnız `isMine` talepler listelenir, başlık "Taleplerim", birincil düğme "Yazılımcıdan iste". `incoming` modunda başlık "Gelen talepler" olur, oluşturma düğmesi yoktur. Rozet: `New→"Yeni"`, `Staging→"Deneme ortamında"`, `Production→"Yayında"`.

Bölümlerin içeriği:

| Bölüm | İçerik |
|---|---|
| home | Bugünkü "Genel bakış" içeriği. Görev 6'da kartlarla değişir. |
| screens | `SectionTabs` sekmeleri: Sayfalar=`custom-pages`, Formlar=`custom-forms`, Raporlar=`reports`. Her biri `NativePlatformTool`. |
| rules | Sekmeler: İş akışları=`workflows`, İş kuralları=`business-rules`. |
| menus | `NativePlatformTool` `custom-menus`. |
| my-requests / incoming-requests | `DevelopmentRequestsPage` `mode` ile. |
| company-module | Sekmeler: "Kod ve sürümler" = bugünkü `projects` bölümünün içeriği, "Veri modelleri" = `custom-data`. |
| marketplace | Bugünkü `marketplace` içeriği. |
| ai | Bugünkü `settings` iframe aracı. |
| publications, people, connections | Görev 7–10'a kadar menüde görünmez: `menuFor`'a bir `available` süzgeci eklenir ya da kabuk bu üçünü geçici olarak gizler. Görev 10 sonunda hepsi görünür. |

- Kaldırılanlar: "Platform uyarlama" bölümü, `adaptationFlows`, araç arama kutusu, "Uyarlama araçları" ve "Analitik" menü öğeleri.
- Analitik içeriği Görev 6'ya kadar Ana sayfa'nın altında durur.
- Danışmanda talep formunda proje seçici gösterilmez: proje listesini okuyamaz, `projectId` `null` gider.
- Üst çubuktaki "Yeni talep" düğmesi yalnız Danışman rolünde ve "Yazılımcıdan iste" adıyla görünür.
- Profil satırında rol adı `roleLabel(active)` olur.
- `status === "denied"` ya da `held` boşsa `NoStudioAccess` gösterilir: "Studio'ya erişiminiz yok. Firma yöneticinizden Danışman ya da Yazılımcı rolü isteyin."
- Projeler ve talepler artık yalnız ilgili bölüm açıkken ve rol izin veriyorsa yüklenir, Danışmanın projeleri çekip 403 alması önlenir.

- [ ] **Step 1: Write the failing tests** (`renderToString`)
  - `RoleSwitcher renders nothing for a single role`
  - `RoleSwitcher marks the active role` → etkin düğmede `aria-pressed="true"`, etiketler "Danışman", "Yazılımcı", "Yönetici"
  - `DevelopmentRequestsPage mine mode lists only own requests and shows Yazılımcıdan iste`
  - `DevelopmentRequestsPage shows stage badges` → üç etiket metni
- [ ] **Step 2:** `npx vitest run src/shell src/DevelopmentRequestsPage` → FAIL.
- [ ] **Step 3:** Implement as described.
- [ ] **Step 4:** `npm test` ve `npm run build` (frontend/development-studio) → PASS.
- [ ] **Step 5: Elle doğrulama** (`npm run dev`):
  - TenantAdmin ile üç rol düğmesi görünür, her rolün menüsü doğrudur.
  - `#tool-workflows` adresi Kurallar → İş akışları sekmesini açar.
  - ERP'den gelen `?contextPage=customers` adresi eskisi gibi çalışır.
- [ ] **Step 6: Commit** — `feat(studio): rol bazlı kabuk; araçlar yeni menü yerlerinde`

**PR 1 burada açılır** (Görev 1–5). Başlık: `feat(studio): rol bazlı Studio yapısı — roller ve kabuk`.

---

## PR 2 — yeni ekranlar (Görev 6–11)

### Task 6: Ana sayfa kartları

**Files:**
- Create: `frontend/development-studio/src/home/homeCards.ts`, `src/home/HomePage.tsx`, `src/home/home.css`
- Modify: `frontend/development-studio/src/App.tsx` (home bölümü; analitik ve eski genel bakış kodu kaldırılır)
- Test: `src/home/homeCards.test.ts`

**Interfaces:**
- Consumes: Task 3 talepleri (`stage`, `isMine`), Task 7 `GET /api/custom-pages/publications`, Task 2 `/studio/people`, mevcut `/api/tenant/modules/marketplace`, mevcut `/studio/projects/{id}/production-deployments`.
- Produces:
  - `type HomeCard = { id: string; title: string; value: string; detail: string; href?: string }`
  - `consultantCards(input: { pendingCount: number; myRequests: Request[] }): HomeCard[]`
    - "Taslakta bekleyen": değer `pendingCount`, ayrıntı "ekran yayınlanmadı", href `#publications`
    - "Açık taleplerim": `stage !== "Production"` olan kendi talepleri, ayrıntı `"{n} yazılımcıda"`, href `#my-requests`
  - `developerCards(input: { requests: Request[]; lastProductionAt: string | null }): HomeCard[]`
    - "Gelen talepler": ayrıntı `"{yeni} yeni · {deneme} deneme ortamında"`
    - "Son canlı yayın": tarih `tr-TR` biçiminde, yoksa "Henüz yok"
  - `adminCards(input: { people: Person[]; activeModules: number; publishedThisMonth: number }): HomeCard[]`
    - "Studio kullanıcıları": değer = `effectiveRole !== "None"` sayısı, ayrıntı `"{d} danışman · {y} yazılımcı"`
    - "Kurulu modüller"
    - "Bu ay yayın"
  - `recentScreens(pages: {name: string; updatedAt: string; isPublished: boolean}[], take = 5)`: Danışmanın "Son çalıştıklarım" listesi, en yeni önce. Rozet "Taslak" ya da "Yayında".
  - Kısayollar (Danışman):
    - "Yeni ekran oluştur" → `#screens/pages`
    - "Belgeye kural ekle" → `#rules`
    - "Yazılımcıdan bir şey iste" → yeni talep penceresi
  - Yazılımcının ana sayfası, kartların altında gelen talep listesini gösterir (taslak 07).

- [ ] **Step 1: Write the failing tests:** her kart fonksiyonu için değer ve ayrıntı metinleri birebir. `recentScreens` sıralaması ve `take` sınırı. Boş girdilerde kartlar "0" ve "Henüz yok" gösterir, hata vermez.
- [ ] **Step 2:** `npx vitest run src/home` → FAIL.
- [ ] **Step 3:** Implement. Her veri kaynağı ayrı yüklenir. Biri hata verirse yalnız o kart "Yüklenemedi" gösterir.
- [ ] **Step 4:** `npm test`, `npm run build` → PASS.
- [ ] **Step 5: Commit** — `feat(studio): rol bazlı ana sayfa kartları`

### Task 7: Yayınlar ucu (ERP API)

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (`pages.MapGet("/publications", …)`)
- Görünüm kayıtları (`PublicationsView`, `PendingPublicationView`, `PublishedRevisionView`) `TenantCustomPageEndpoints.cs` dosyasının sonundaki mevcut kayıtların yanına eklenir.
- Test: `tests/IntegrationTests/TenantCustomPagePublicationsIntegrationTests.cs`

**Interfaces:**
- Produces: `GET /api/custom-pages/publications?take=100` (`take` en fazla 200). Yanıt:

  ```
  { pending: [{ pageId, code, name, screenKey: string|null, updatedAt, updatedByName: string|null }],
    history: [{ pageId, revisionId, revision, code, name, screenKey: string|null, publishedAt, changedByName: string|null, isCurrent: bool }] }
  ```

  - `pending`: yayınlanmamış ve arşivlenmemiş taslaklar.
  - `history`: `ChangeKind == "Published"` revizyonlar, en yeni önce.
  - `isCurrent`: aynı `code` için en yeni yayın.
  - Adlar PlatformDB `Users.DisplayName`'den, yalnız o firmanın üyeleri için gelir. Üye değilse `null`.
- İzin: grubun `Allowed(..., "read", ...)` kontrolü. SQL içeren tanımlar bu yanıtta yoktur (yalnız başlık alanları döner).
- `PlatformPermissionCatalog`'un `/api/custom-pages/*` çözümlemesi bu yolu `erp.tenant-customizations` okuma olarak sınıflandırmalı. Sınıflandırma farklıysa, katalogda bu yol için açık bir kural eklenir ve katalog testi güncellenir.

- [ ] **Step 1: Write the failing tests**
  - `Publications_lists_pending_drafts_and_published_history`: bir sayfa yayınla, yeni taslak aç. Beklenen: `pending.Count == 1`, `history[0].isCurrent == true`.
  - `Publications_is_tenant_scoped`: başka firmanın sayfası görünmez.
  - `Publications_requires_customization_read`: okuma `Deny` kuralı olan TenantUser 403 alır.
  - `Restore_with_open_draft_returns_conflict`: mevcut restore ucu açık taslak varken 409 döner ve gövdede `error` vardır. Davranış değişmez; arayüz bu metne dayanır.
- [ ] **Step 2:** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPagePublicationsIntegrationTests"` → FAIL.
- [ ] **Step 3:** Implement. İki sorgu (taslaklar, yayın revizyonları), ardından tek bir kullanıcı adı sorgusu.
- [ ] **Step 4:** PASS, ve `FullyQualifiedName~PermissionCatalog` testleri PASS.
- [ ] **Step 5: Commit** — `feat(custom-pages): ekran yayınları ucu`

### Task 8: Yayınlar ekranı

**Files:**
- Create: `frontend/development-studio/src/publications/publicationsModel.ts`, `src/publications/PublicationsPage.tsx`
- Modify: `frontend/development-studio/src/App.tsx` (publications bölümü görünür olur)
- Test: `src/publications/publicationsModel.test.ts`

**Interfaces:**
- Consumes: Task 7. Mevcut `POST /api/custom-pages/{id}/publish`, `POST /api/custom-pages/{id}/restore/{revisionId}`, `/studio/projects/{id}/production-deployments` (yalnız `held` içinde developer ya da admin varsa).
- Produces:
  - `type PublicationRow = { key: string; title: string; kind: "Ekran" | "Modül sürümü"; by: string | null; at: string; status: "Taslak" | "Yayında" | "Önceki sürüm"; action: "publish" | "restore" | null }`
  - `pendingRows(p)` ve `historyRows(p, deployments)`: geçmiş en yeni önce. `isCurrent` → "Yayında", diğerleri "Önceki sürüm" ve `action: "restore"`. Modül dağıtımlarında eylem yoktur; geri alma bugünkü dağıtım ekranında kalır.
  - `restoreErrorMessage(status: number, body?: {error?: string}): string`: 409 → "Bu ekranın açık bir taslağı var. Önce onu yayınlayın ya da silin."
- Ekran: "Bekleyen" ve "Geçmiş" sekmeleri. Satırda "Yayınla" (onay penceresi, `confirmDialog`) ya da "Önceki sürüme dön". Geri dönüş taslak oluşturur; ardından "Taslak oluşturuldu. Yayınlamak için Bekleyen sekmesine geçin." bildirimi gösterilir.
- Ekranda alt proje numarası ya da "yakında" gibi iç plan dili kullanılmaz.

- [ ] **Step 1: Write the failing tests:** satır üretimi (durum ve eylem eşlemesi), modül dağıtımlarının yalnız verildiğinde eklenmesi, `restoreErrorMessage(409)` metni birebir, 500 için genel "İşlem tamamlanamadı (500)." metni.
- [ ] **Step 2:** `npx vitest run src/publications` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build` → PASS.
- [ ] **Step 5: Commit** — `feat(studio): Yayınlar ekranı`

### Task 9: Kişiler ve roller ekranı

**Files:**
- Create: `frontend/development-studio/src/people/peopleModel.ts`, `src/people/PeoplePage.tsx`
- Modify: `frontend/development-studio/src/App.tsx`
- Test: `src/people/peopleModel.test.ts`

**Interfaces:**
- Consumes: Task 2 (`/studio/people`, `PUT …/studio-role`). Mevcut `GET /api/access-control/members/candidate?email=` ve `POST /api/access-control/members` `{ userId, role: "TenantUser" }` (Platform API'ye gider; lisans sınırı ve son yönetici korumaları oradadır).
- Produces:
  - `studioRoleOptions = [{ value: null, label: "Varsayılan" }, { value: "Consultant", label: "Danışman" }, { value: "Developer", label: "Yazılımcı" }, { value: "None", label: "Studio'ya erişimi yok" }]`
  - `personRoleLabel(p: Person): string`:
    - Admin → "Yönetici"
    - `studioRole === null` ise etkin rol adı + " (varsayılan)"
    - aksi halde etkin rol adı
  - `inviteErrorMessage(code?: string): string`:
    - `license.user_limit` → "Lisansınızın kullanıcı sınırına ulaşıldı."
    - `membership.exists` → "Bu kişi zaten firmada."
    - bulunamadı → "Bu e-postayla kayıtlı bir Nexora kullanıcısı yok."
- Ekran: liste (ad, e-posta, rol seçici). Yöneticinin satırında seçici yerine "Yönetici" yazar ve "Yönetici rolü ERP'de, Erişim yönetimi ekranından değişir." açıklaması gösterilir.
- "+ Kişi davet et" penceresi: e-posta → aday bul → firmaya ekle → Studio rolünü seç ve kaydet.
- Altta taslaktaki üç rol açıklaması birebir yer alır.

- [ ] **Step 1: Write the failing tests:** `personRoleLabel` dört vakası, `inviteErrorMessage` üç vakası.
- [ ] **Step 2:** `npx vitest run src/people` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build` → PASS.
- [ ] **Step 5: Commit** — `feat(studio): Kişiler ve roller ekranı`

### Task 10: Bağlantılar ekranı

**Files:**
- Create: `frontend/development-studio/src/connections/ConnectionsPage.tsx`, `src/connections/connectionsModel.ts`
- Modify: `frontend/development-studio/src/App.tsx` (son gizli bölüm de görünür olur; geçici gizleme kodu silinir)
- Test: `src/connections/connectionsModel.test.ts`

**Interfaces:**
- Consumes: mevcut `GET /studio/projects/` (`githubAuthorized`, `repositoryUrl`).
- Produces: `githubRows(projects): { title: "GitHub"; detail: string; status: "Bağlı" | "Bağlı değil" }[]`. `detail` = depo yolu (`github.com/` sonrası). Proje yoksa tek satır, ayrıntısı "Henüz depo bağlanmadı". Her satırda "Firma modülünde aç" bağlantısı `#company-module/code` adresine gider. GitHub yetkilendirme akışı bugünkü proje ekranında kalır.
- Taslaktaki "Yazılımcı uzantıları yalnızca burada yönetici onayı almış bağlantıları kullanabilir." cümlesi 2b'de ekrana konmaz, çünkü bu kural henüz zorlanmıyor.

- [ ] **Step 1: Write the failing tests:** bağlı, bağlı değil ve boş liste vakaları.
- [ ] **Step 2:** `npx vitest run src/connections` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build` → PASS.
- [ ] **Step 5: Commit** — `feat(studio): Bağlantılar ekranı (GitHub)`

### Task 11: Uçtan uca doğrulama ve belgeler

**Files:**
- Modify: `docs/phase-status.md` (2b satırı: doğrulanan ve kalan)
- Modify: `docs/superpowers/specs/2026-11-25-nexora-studio-sadelestirme-design.md` §10 (bu plandaki "Benim kararlarım" 1–4'ün kısa özeti)

- [ ] **Step 1:** Run `dotnet test AIERP.slnx`, then in `frontend/development-studio` run `npm test` and `npm run build`. Expected: all PASS (SQL acceptance testleri atlanır).
- [ ] **Step 2:** Docker Compose yığınında üç kişiyle dene: TenantAdmin, TenantUser (yetkisiz), ve proje yetkili TenantUser.
  - Danışman projelere gidemez. Adresle `#company-module` açılırsa Ana sayfaya düşer. API'den `GET /studio/projects/` 403 döner.
  - Yazılımcı Gelen talepler'de aşama rozetlerini görür.
  - Yönetici Kişiler ve roller'de bir kişiyi "Studio'ya erişimi yok" yapınca, o kişi sayfayı yenilediğinde erişim yok ekranını görür.
  - Yayınlar'da bir sayfayı önceki sürüme döndür ve yayınla. ERP'de eski görünüş gelmeli.

  Gözlenen sonuçları PR açıklamasına yaz. Yapılamayan adımı "doğrulanmadı" olarak belirt.
- [ ] **Step 3: Commit** — `docs: Studio rol yapısı (2b) durumu`

**PR 2 burada açılır.**
