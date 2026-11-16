# Parça 2 — Sayfa yetkileri: uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yöneticinin özel sayfalar için kullanıcı bazında Görüntüle/Ekle/Güncelle/Sil yetkisi seçebilmesi; sunucunun yayınlanmış sayfa ve menüde bu yetkiyi uygulaması.

**Architecture:**
- Yetkiler Platform veritabanında, sayfa koduna göre ayrı tablolarda tutulur. Taslak tanımın parçası değildir ve kaydedildiği anda geçerli olur.
- Domain'deki saf bir kural fonksiyonu kullanıcının haklarını hesaplar; tüm kontrol noktaları onu kullanır.
- Studio'daki sayfa tasarımcısına onaylı taslaktaki "Erişim" bölümü eklenir.
- Ekle/Güncelle/Sil hakları bu parçada yalnız saklanır ve gösterilir. Onları uygulayan sorgu çalıştırma 3–4. parçadadır.

**Tech Stack:** .NET 10, EF Core (PlatformDbContext, SQL Server), ASP.NET Core minimal API, React + TypeScript (development-studio, erp-web), xUnit.

**Spec:** `docs/superpowers/specs/2026-11-16-salt-okunur-sql-raporlari-design.md` (bölüm 5, 9 "Yetkilerin yeri ve etkinleşmesi", "Teslim sırası" 2. madde). Onaylanan arayüz taslağı aşağıdaki Task 5'te tarif edilir.

## Global Constraints

- Erişim modları: `AdminsOnly` | `AllUsers` | `SelectedUsers`. Haklar: `View`, `Insert`, `Update`, `Delete`.
- **Varsayılan:** Erişim kaydı olmayan sayfa `AllUsers` + yalnız `View` sayılır, böylece bugünkü davranış korunur.
- **Yöneticiler:** TenantAdmin her sayfada tüm haklara sahiptir ve kilitlenemez.
- **Hak bağımlılığı:** Bir kullanıcıya `Insert`/`Update`/`Delete` verilmişse `View` de verilmiş olmalıdır; yoksa 400 döner.
- **`AllUsers` modunda:** `View` herkese açıktır; yönetici ek olarak herkese açık yazma haklarını (`Insert`/`Update`/`Delete`) seçer.
- **Kim değiştirebilir:** Yetkileri yalnız TenantAdmin okur ve değiştirir.
- **Revizyon ve denetim:** Her değişiklik revizyon numarasını artırır, bir revizyon kaydı ve Platform `AuditEvents`'e `custom-page.access-updated` kaydı yazar. Eşzamanlılık `ExpectedRevision` ile korunur; uyuşmazsa 409 döner.
- **Seçili kullanıcı sınırı:** `SelectedUsers` en fazla 200 kullanıcı içerir. Her kullanıcı kiracının üyesi olmalıdır, aksi halde 400 döner.
- **Yetkisiz erişim mesajı:** "Bu sayfayı görüntüleme yetkiniz yok." (403, `{ error }` gövdesiyle).
- **Arayüz metni:** Kullanıcıya görünen metinler Türkçedir; tasarım, onaylanan taslağa uyar.
- **Katman sınırları:** `ArchitectureBoundaryTests` bozulmaz. Yeni tablolar yalnız Platform modelinde yer alır; kiracı modeline girmez, bu yüzden Tenant migration'ı gerekmez.

## Review Focus

1. **Yetkisiz menü girişi.** Menüde erişimi olmayan bir sayfaya giden giriş, o kullanıcının menü listesinde hiç görünmemeli. Test: Task 4 `Menu_hides_entries_for_pages_user_cannot_view`.
2. **Doğrudan URL ile açma.** `?customPage=kod` ile doğrudan açılan yetkisiz sayfa 403 ve Türkçe mesaj vermeli, sayfa tanımını sızdırmamalı. Test: Task 4 `Published_page_is_forbidden_without_view_right`.
3. **Kod yeniden kullanımı.** Sayfa silinip aynı kodla yeniden oluşturulursa eski yetkiler yeni sayfaya geçer. Bu, kod anahtarlı tasarımın kabul edilen sonucudur. Studio'da silme sonrası yetkiler korunur. Test: Task 2 `Access_survives_republish_with_same_code`.
4. **Üyelikten çıkarılan kullanıcı.** Kaydı duran ama artık kiracı üyesi olmayan kullanıcı hiçbir hak almamalı; GET yanıtında da listelenmemeli. Test: Task 1 `Evaluate_ignores_users_without_membership`, Task 2 `Get_access_omits_removed_members`.
5. **Eşzamanlı kayıt.** İki yönetici aynı anda kaydederse ikincisi 409 almalı. Test: Task 2 `Put_access_with_stale_revision_returns_conflict`.

---

### Task 1: Veri modeli, Platform migration ve hak kuralı

**Files:**
- Modify: `src/Platform/AIERP.Platform.Domain/Entities.cs` (yeni varlıklar)
- Create: `src/Platform/AIERP.Platform.Domain/CustomPageAccessRules.cs`
- Modify: `src/Platform/AIERP.Platform.Infrastructure/PlatformDbContext.cs` (eşleme). Kiracı modelinden hariç tutmak için `TenantPermissionRule` gibi Platform'a özgü varlıkların nasıl hariç tutulduğuna bakılır ve aynısı uygulanır.
- Create: `src/Platform/AIERP.Platform.Infrastructure/Migrations/Platform/<timestamp>_AddCustomPageAccess.cs` (+ Designer, snapshot): `dotnet ef migrations add AddCustomPageAccess --project src/Platform/AIERP.Platform.Infrastructure --context PlatformDbContext`
- Test: `tests/UnitTests/AIERP.Platform.UnitTests/CustomPageAccessRulesTests.cs`

**Interfaces:**
- Produces (Domain):
```csharp
public sealed class TenantCustomPageAccess { Guid Id; Guid TenantId; string PageCode; string Mode; bool AllUsersCanInsert; bool AllUsersCanUpdate; bool AllUsersCanDelete; int Revision; Guid UpdatedByUserId; DateTimeOffset UpdatedAt; ICollection<TenantCustomPageAccessUser> Users; }
public sealed class TenantCustomPageAccessUser { Guid Id; Guid AccessId; Guid UserId; bool CanView; bool CanInsert; bool CanUpdate; bool CanDelete; }
public sealed class TenantCustomPageAccessRevision { Guid Id; Guid TenantId; string PageCode; int Revision; string SnapshotJson; Guid ChangedByUserId; DateTimeOffset CreatedAt; }
public static class CustomPageAccessModes { public const string AdminsOnly = "AdminsOnly", AllUsers = "AllUsers", SelectedUsers = "SelectedUsers"; }
public readonly record struct CustomPageRights(bool View, bool Insert, bool Update, bool Delete) { public static readonly CustomPageRights All = new(true,true,true,true); public static readonly CustomPageRights None = default; }
public static class CustomPageAccessRules
{
    /// access null → AllUsers + yalnız View. isTenantAdmin → All. isMember false → None.
    public static CustomPageRights Evaluate(TenantCustomPageAccess? access, Guid userId, bool isTenantAdmin, bool isMember);
}
```
- **Eşleme:**
  - `TenantCustomPageAccess`: benzersiz indeks `(TenantId, PageCode)`; `PageCode` `nvarchar(80)`; `Mode` `nvarchar(20)`.
  - `TenantCustomPageAccessUser`: benzersiz `(AccessId, UserId)`, cascade delete.
  - `TenantCustomPageAccessRevision`: indeks `(TenantId, PageCode, Revision)` benzersiz; `SnapshotJson` `nvarchar(max)`.

- [ ] **Step 1: Write the failing tests**

```csharp
[Fact] public void Evaluate_without_access_row_grants_view_only()            // null → (true,false,false,false)
[Fact] public void Evaluate_grants_all_rights_to_tenant_admin()               // AdminsOnly + isTenantAdmin → All
[Fact] public void Evaluate_admins_only_denies_regular_user()                 // → None
[Fact] public void Evaluate_all_users_applies_shared_write_flags()            // AllUsersCanUpdate=true → (true,false,true,false)
[Fact] public void Evaluate_selected_users_returns_user_row_rights()          // listed user (View,Insert) → (true,true,false,false); unlisted → None
[Fact] public void Evaluate_ignores_users_without_membership()                // isMember=false, listed with all rights → None
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~CustomPageAccessRulesTests"`
Expected: FAIL (derleme hatası).

- [ ] **Step 3: Implement**

Varlıklar, kural, eşleme ve migration eklenir. Ardından iki kontrol yapılır: `dotnet ef migrations has-pending-model-changes` hem `PlatformDbContext` hem `TenantDbContext` için "no changes" vermeli.

- [ ] **Step 4: Run to verify pass**

Run: aynı filtre + `dotnet test tests/UnitTests/AIERP.Platform.UnitTests --filter "FullyQualifiedName~ArchitectureBoundaryTests"` + `dotnet build AIERP.slnx`.
Expected: PASS, 0 hata.

- [ ] **Step 5: Commit** — `git commit -m "Platform: özel sayfa erişim modeli ve hak kuralı"` (+ Co-Authored-By satırı)

---

### Task 2: Erişim API'si

**Files:**
- Create: `src/Hosts/AIERP.Api/CustomPageAccessEndpoints.cs`
- Modify: `src/Hosts/AIERP.Api/Program.cs` (map çağrısı)
- Modify: `src/Platform/AIERP.Platform.Application/PlatformPermissionCatalog.cs`. Bu dosya gerekirse değişir: `/api/custom-pages/{code}/access` mevcut `/api/custom-pages/` eşlemesine düşüyorsa ek girdi gerekmez; bunun doğrulanıp raporda yazılması gerekir.
- Test: `tests/IntegrationTests/CustomPageAccessEndpointsIntegrationTests.cs`

**Interfaces:**
- Consumes: Task 1 varlıkları ve `CustomPageAccessRules`.
- Produces:
  - `GET /api/custom-pages/{code}/access` → `CustomPageAccessView(string PageCode, string Mode, bool AllUsersCanInsert, bool AllUsersCanUpdate, bool AllUsersCanDelete, int Revision, IReadOnlyList<CustomPageAccessUserView> Users)`.
  - `CustomPageAccessUserView(Guid UserId, string DisplayName, string Email, bool CanView, bool CanInsert, bool CanUpdate, bool CanDelete)`.
  - Kayıt yoksa `Mode = AllUsers`, `Revision = 0`, tüm `AllUsersCan*` false döner.
  - `PUT /api/custom-pages/{code}/access` gövdesi `CustomPageAccessRequest(string Mode, bool AllUsersCanInsert, bool AllUsersCanUpdate, bool AllUsersCanDelete, IReadOnlyList<CustomPageAccessUserRequest>? Users, int ExpectedRevision)` → güncel `CustomPageAccessView`.
  - `internal static class CustomPageAccess { static Task<CustomPageRights> GetRightsAsync(PlatformDbContext platformDb, Guid tenantId, string pageCode, Guid userId, string role, CancellationToken ct); }`. Task 3–4 bunu kullanır. Üyelik `TenantMemberships` üzerinden kontrol edilir.
- **Kurallar:**
  - Uç noktalar yalnız TenantAdmin içindir; rol `TenantAdmin` değilse 403 döner.
  - `code` biçimi, mevcut sayfa kodu doğrulamasıyla aynı şekilde doğrulanır.
  - Kiracıda bu kodla en az bir arşivlenmemiş sayfa yoksa 404 döner.
  - Global Constraints'teki doğrulamalar (bilinmeyen mod, `View`'sız yazma hakkı, üye olmayan kullanıcı, 200 sınırı, yinelenen kullanıcı) 400 döner.
  - `SelectedUsers` dışındaki modlarda gelen kullanıcı listesi temizlenir.
  - Kayıt yazımı ve `AuditEvent` aynı `PlatformDbContext.SaveChangesAsync` çağrısında gerçekleşir.
  - Revizyon kaydının `SnapshotJson` alanı, PUT sonrası `CustomPageAccessView`'ın JSON hâlidir.
  - GET, üyeliği kalmamış kullanıcıları listelemez.

- [ ] **Step 1: Write the failing tests**

```csharp
[Fact] public async Task Get_access_defaults_to_all_users_view_only()
[Fact] public async Task Get_and_put_access_are_forbidden_for_tenant_user()
[Fact] public async Task Put_access_saves_selected_users_and_increments_revision()     // revision 0→1, audit "custom-page.access-updated", revision row
[Fact] public async Task Put_access_rejects_write_right_without_view()                 // 400
[Fact] public async Task Put_access_rejects_non_member_user()                          // 400
[Fact] public async Task Put_access_with_stale_revision_returns_conflict()             // 409
[Fact] public async Task Get_access_omits_removed_members()
[Fact] public async Task Access_survives_republish_with_same_code()                    // yeni taslak+yayın sonrası GET aynı yetkileri döner
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPageAccessEndpointsIntegrationTests"`. Expected: FAIL.

- [ ] **Step 3: Implement** (dosya ve kurallar Interfaces'te belirtildiği gibi).

- [ ] **Step 4: Run to verify pass** — aynı filtre. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "API: özel sayfa erişim yönetimi uç noktaları"`

---

### Task 3: ERP tarafında uygulama: yayın, önizleme, menü

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageEndpoints.cs` (`/{code}/published`, `/{id}/preview`)
- Modify: `src/Hosts/AIERP.Api/CustomMenuEndpoints.cs` (`GET /api/custom-menus/`)
- Test: `tests/IntegrationTests/CustomPageAccessEnforcementIntegrationTests.cs`

**Interfaces:**
- Consumes: Task 2 `CustomPageAccess.GetRightsAsync`.
- **Kurallar:**
  - `published`: sayfa bulunduktan sonra `View` yoksa `Results.Json(new { error = "Bu sayfayı görüntüleme yetkiniz yok." }, statusCode: 403)` döner; tanım ve formlar döndürülmez.
  - `preview`: aynı kontrol taslağın koduyla yapılır.
  - Menü listesi: `TargetPage` değeri `custom-page:<code>` olan girdiler, kullanıcının `View` hakkı yoksa listeden çıkarılır. Haklar her kod için bir kez hesaplanır; N+1 sorgu yapılmaz, tek sorguda toplu okunur.
  - `/targets` ve diğer yönetim uç noktaları değişmez.

- [ ] **Step 1: Write the failing tests**

```csharp
[Fact] public async Task Published_page_is_forbidden_without_view_right()       // AdminsOnly + TenantUser → 403, gövdede definitionJson yok
[Fact] public async Task Published_page_is_visible_to_selected_user_with_view()
[Fact] public async Task Published_page_without_access_row_is_visible_to_members() // bugünkü davranış
[Fact] public async Task Menu_hides_entries_for_pages_user_cannot_view()
[Fact] public async Task Tenant_admin_always_sees_page_and_menu_entry()
```

- [ ] **Step 2–4:** Testler önce FAIL vermeli; sonra uygulanır ve PASS alınır. Run: `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~CustomPageAccessEnforcement|FullyQualifiedName~TenantCustomPageEndpoints|FullyQualifiedName~CustomMenuEndpoints"`. Mevcut testler de geçmeli.

- [ ] **Step 5: Commit** — `git commit -m "API: özel sayfa ve menüde erişim yetkisi uygulanır"`

---

### Task 4: ERP çalışma zamanı mesajı

**Files:**
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx` (gerekirse), `frontend/erp-web/src/erpApi.ts` (gerekirse)

**Interfaces:**
- Consumes: Task 3'ün 403 `{ error }` yanıtı.
- **Kural:** 403 durumunda sayfa, sunucunun `error` metnini mevcut `tenant-custom-page-error` kutusunda gösterir. Oturum düşürülmez; 403 yanıtı 401 gibi ele alınmaz.
  - Önce `erpApi.api`'nin 403'te ne yaptığı okunur.
  - Mesajı zaten gösteriyorsa kod değişmez ve bu raporda belirtilir.

- [ ] **Step 1:** `erpApi.ts`'te 403 davranışı okunur ve raporda yazılır.
- [ ] **Step 2:** Gerekirse minimal değişiklik yapılır.
- [ ] **Step 3:** `cd frontend/erp-web && npm run build` çalıştırılır. Expected: exit 0.
- [ ] **Step 4: Commit** (değişiklik varsa) — `git commit -m "ERP: yetkisiz özel sayfa mesajı"`

---

### Task 5: Studio sayfa tasarımcısında Erişim bölümü

**Files:**
- Create: `frontend/development-studio/src/platform-tools/erp-src/CustomPageAccessPanel.tsx`
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx` (~satır 866–879, "Sayfa ayarları" paneli: kısayolların altına, "Sayfayı sil"in üstüne)
- Modify: `frontend/development-studio/src/platform-tools/erp-src/custom-pages.css` (yalnız `pd-access-*` sınıfları)

**Interfaces:**
- Consumes: `GET/PUT /api/custom-pages/{code}/access` (Task 2), `GET /api/access-control/members` → `{ id, email, displayName, role }[]`.
- Produces: `export default function CustomPageAccessPanel({ token, pageCode, hasQueries }: { token: string; pageCode: string; hasQueries: boolean })`.
- **Gösterilme koşulu:**
  - Bölüm yalnız `role === "TenantAdmin"` ve sayfa en az bir kez kaydedilmişse (`current` var) görünür.
  - `hasQueries`, tanımda boş olmayan bir `queries` dizisi varsa true olur. Bugün hep false'tur; 3. parçada dolacak.
- **Onaylanan taslak:**
  - Başlık "Erişim", kilit simgesi ve "Hemen geçerli" rozeti.
  - Üç seçenekli seçici: "Yöneticiler" / "Herkes" / "Seçili kişiler". Altında "Yöneticiler her zaman tüm işlemleri yapabilir." notu.
  - "Seçili kişiler" modunda tablo: başlıklar "Kullanıcı · Gör · Ekle · Gün. · Sil". Her satırda dört onay kutusu ve `×` ile kaldırma.
  - Tablonun altında üye listesinden açılır seçim ve "Ekle" düğmesi. Listede yöneticiler ve zaten ekli kullanıcılar gösterilmez.
  - "Herkes" modunda tablo yerine tek satır "Gör ✓ (kilitli) · Ekle · Gün. · Sil" kutucukları gösterilir.
  - "Yöneticiler" modunda tablo gizlidir.
  - `hasQueries` true ise sarı uyarı: "Bu sayfa SQL sorgusu içeriyor. Herkese açmadan önce erişimi gözden geçirin."
  - "Erişimi kaydet" düğmesi değişiklik yoksa pasiftir.
- **Etkileşim kuralları:**
  - Yazma hakkı işaretlenince `Gör` de otomatik işaretlenir. `Gör` kaldırılınca o satırın yazma hakları da kaldırılır.
  - Kaydetme `ExpectedRevision` ile yapılır. 409 gelirse "Erişim başka bir yönetici tarafından değiştirildi; yeniden yükleniyor." mesajı gösterilir ve veri yeniden yüklenir.
  - Hata ve başarı mesajları mevcut `pd-message` stilini kullanır.

- [ ] **Step 1:** Bileşen ve panel entegrasyonu yazılır.
- [ ] **Step 2:** `cd frontend/development-studio && npm run build`. Expected: exit 0.
- [ ] **Step 3:** Tarayıcıda sahte API ile görsel kontrol yapılır. Örnek sahte sunucu: `C:/Users/FATIH/AppData/Local/Temp/claude/a6482446cdd1d12c/3e9727ed-d073-4da2-a618-5136c47a3d1f/scratchpad/mock/vite.mock.config.ts`. Bu dosya `/api/custom-pages/{code}/access` ve `/api/access-control/members` yanıtlarıyla genişletilir. Üç modun ve uyarının ekran görüntüsü raporlanır. Tarayıcı aracı yoksa bu adım atlandığı açıkça yazılır.
- [ ] **Step 4: Commit** — `git commit -m "Studio: sayfa tasarımcısında Erişim bölümü"`
