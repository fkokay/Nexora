using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

/// <summary>
/// İnsan Kaynakları system pages (taslak 25): the ik.* ERP operations, the additive list parameters and paged envelope, the
/// single-record reads, canReview / canApprove, the calendar-day default of requestedDays, the menu keys and the five standards.
/// </summary>
public sealed class HrSystemPagesTests
{
    private static readonly Guid SelfUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid SecondAdmin = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid EmployeeSelf = Guid.Parse("e0000000-0000-0000-0000-000000000001");
    private static readonly Guid EmployeeOther = Guid.Parse("e0000000-0000-0000-0000-000000000002");
    private static readonly Guid EmployeeLeft = Guid.Parse("e0000000-0000-0000-0000-000000000003");
    private static readonly Guid EmployeeForeignTenant = Guid.Parse("e0000000-0000-0000-0000-000000000004");
    private static readonly byte[] Version = [0, 0, 0, 0, 0, 0, 0, 1];

    private static readonly string[] Operations =
    [
        "ik.personel.listele", "ik.personel.getir", "ik.personel.olustur", "ik.personel.guncelle",
        "ik.izin.listele", "ik.izin.talepEt", "ik.izin.onayla", "ik.izin.reddet", "ik.izin.iptal",
        "ik.puantaj.listele", "ik.puantaj.getir", "ik.puantaj.kaydet", "ik.puantaj.duzelt", "ik.puantaj.onayla", "ik.donemOzeti"
    ];

    private static readonly string[] AdminOnly =
    [
        "ik.personel.olustur", "ik.personel.guncelle", "ik.izin.onayla", "ik.izin.reddet", "ik.puantaj.kaydet", "ik.puantaj.duzelt",
        "ik.puantaj.onayla", "ik.donemOzeti"
    ];

    private static readonly string[] Keys = ["hr-employees", "hr-employee-create", "hr-leave-requests", "hr-attendance", "hr-period-summary"];

    // ---- Catalog ----

    [Fact]
    public void Catalog_declares_every_hr_operation_in_its_module()
    {
        Assert.Equal(Operations.Order(StringComparer.Ordinal), ErpOperationCatalog.All.Where(x => x.Name.StartsWith("ik.", StringComparison.Ordinal))
            .Select(x => x.Name).Order(StringComparer.Ordinal));
        foreach (var name in Operations)
        {
            var op = Op(name);
            Assert.Equal(("İnsan Kaynakları", false, AdminOnly.Contains(name)), (op.Module, op.Deprecated, op.RequiresTenantAdmin));
            Assert.Null(ErpOperationCatalog.ParameterShapeError(op));
            Assert.All(op.Result.Columns, x => Assert.False(string.IsNullOrWhiteSpace(x.Label), $"{name}.{x.Code}"));
        }
        // No operation for compensation / payroll / rule set / calendar endpoints (KVKK).
        Assert.DoesNotContain(ErpOperationCatalog.All, x => x.Route.StartsWith("/api/hr/payroll", StringComparison.Ordinal));

        var employees = Op("ik.personel.listele");
        Assert.Equal(("GET", "/api/hr/employees", "list", "items"), (employees.Method, employees.Route, employees.Result.Shape, employees.Result.RowsPath));
        Assert.Equal(new[] { "q:text", "status:text", "department:text", "page:int", "pageSize:int" }, employees.Parameters.Select(x => $"{x.Name}:{x.Type}"));
        Assert.Equal(new[] { "page", "pageSize", "totalCount" }, employees.Result.MetaPaths);
        Assert.Equal("Personel kodu", employees.Result.Columns.Single(x => x.Code == "personnelCode").Label);

        var create = Op("ik.personel.olustur");
        Assert.DoesNotContain(create.Parameters, x => x.Name == "rowVersion");
        Assert.Equal(new[] { "hireDate" }, create.Parameters.Where(x => x.Required).Select(x => x.Name));
        var update = Op("ik.personel.guncelle");
        Assert.Equal(("PUT", "/api/hr/employees/{id}", "ik.personel.getir"), (update.Method, update.Route, update.SourceOperation));
        Assert.DoesNotContain(update.Parameters, x => x.Required && x.In == "body");

        var leaves = Op("ik.izin.listele");
        Assert.Equal(new[] { "q", "status", "leaveType", "employeeId", "from", "to", "page", "pageSize" }, leaves.Parameters.Select(x => x.Name));
        Assert.Contains(leaves.Result.Columns, x => x.Code == "canReview" && x.DataType == "bool");
        Assert.Contains(leaves.Result.Columns, x => x.Code == "department");
        var request = Op("ik.izin.talepEt");
        Assert.False(request.Parameters.Single(x => x.Name == "requestedDays").Required);
        foreach (var (name, approve, parameters) in new[] { ("ik.izin.onayla", true, "id,rowVersion"), ("ik.izin.reddet", false, "id,note,rowVersion") })
        {
            var op = Op(name);
            Assert.Equal(("POST", "/api/hr/leave-requests/{id}/review"), (op.Method, op.Route));
            Assert.Equal(new Dictionary<string, object?> { ["approve"] = approve }, op.FixedBody);
            Assert.Equal(parameters, string.Join(",", op.Parameters.Select(x => x.Name)));
            Assert.True(op.Parameters.Single(x => x.Name == "rowVersion").Required);
        }
        Assert.Equal("/api/hr/leave-requests/{id}/cancel", Op("ik.izin.iptal").Route);

        var attendance = Op("ik.puantaj.listele");
        Assert.Equal(new[] { "from", "to", "employeeId", "approvalStatus", "q", "page", "pageSize" }, attendance.Parameters.Select(x => x.Name));
        Assert.Contains(attendance.Result.Columns, x => x.Code == "canApprove");
        var correct = Op("ik.puantaj.duzelt");
        Assert.Equal(("PUT", "/api/hr/attendance/{id}", "ik.puantaj.getir"), (correct.Method, correct.Route, correct.SourceOperation));
        Assert.DoesNotContain(correct.Parameters, x => x.Name == "employeeId");

        var summary = Op("ik.donemOzeti");
        Assert.Equal(("GET", "/api/hr/period-summary", "list", "leaveStatuses"), (summary.Method, summary.Route, summary.Result.Shape, summary.Result.RowsPath));
        Assert.Equal(new[] { "from:True", "to:True" }, summary.Parameters.Select(x => $"{x.Name}:{x.Required}"));
        Assert.Contains("employeesAtPeriodEnd", summary.Result.MetaPaths);
        Assert.Equal(new[] { "status", "requestCount", "requestedDays" }, summary.Result.Columns.Select(x => x.Code));
    }

    [Fact]
    public void New_hr_reads_resolve_to_the_hr_read_permission()
    {
        foreach (var (path, pattern) in new[] { ("/api/hr/employees/" + Guid.Empty, "/api/hr/employees/{id:guid}"),
                     ("/api/hr/attendance/" + Guid.Empty, "/api/hr/attendance/{id:guid}") })
        {
            Assert.True(PlatformPermissionCatalog.TryResolve(path, "GET", pattern,
                new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase) { ["id"] = Guid.Empty.ToString("D") },
                ErpOperationCatalogTests.TenantA, SelfUser, "TenantUser", out var resolved));
            Assert.Equal("erp.human-resources.read", resolved!.Permission.Code);
        }
    }

    [Fact]
    public async Task Allowed_reflects_hr_permissions_and_the_admin_only_handlers()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, SelfUser, "TenantUser");
        var user = await OperationsAsync(client);
        foreach (var name in new[] { "ik.personel.listele", "ik.personel.getir", "ik.izin.listele", "ik.izin.talepEt", "ik.izin.iptal",
                     "ik.puantaj.listele", "ik.puantaj.getir" })
            Assert.True(user[name], name);
        Assert.All(AdminOnly, name => Assert.False(user[name], name));
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        Assert.All((await OperationsAsync(client)).Where(x => x.Key.StartsWith("ik.", StringComparison.Ordinal)), x => Assert.True(x.Value, x.Key));
    }

    // ---- Endpoints ----

    [Fact]
    public async Task Employee_list_keeps_the_plain_array_and_pages_with_filters_and_row_rule()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        var plain = await client.GetFromJsonAsync<JsonElement>("/api/hr/employees/");
        Assert.Equal(JsonValueKind.Array, plain.ValueKind);
        Assert.Equal(new[] { "P-001", "P-002", "P-003" }, plain.EnumerateArray().Select(x => x.GetProperty("personnelCode").GetString()));

        var page = await client.GetFromJsonAsync<JsonElement>("/api/hr/employees/?page=1&pageSize=2");
        Assert.Equal((1, 2, 3, 2), (Int(page, "page"), Int(page, "pageSize"), Int(page, "totalCount"), page.GetProperty("items").GetArrayLength()));
        var second = await client.GetFromJsonAsync<JsonElement>("/api/hr/employees/?page=2&pageSize=2");
        Assert.Equal("P-003", second.GetProperty("items")[0].GetProperty("personnelCode").GetString());
        var sized = await client.GetFromJsonAsync<JsonElement>("/api/hr/employees/?pageSize=50");
        Assert.Equal((1, 3), (Int(sized, "page"), Int(sized, "totalCount")));

        Assert.Equal(new[] { "P-001", "P-002" }, await Codes(client, "/api/hr/employees/?pageSize=50&status=Active", "personnelCode"));
        Assert.Equal(new[] { "P-003" }, await Codes(client, "/api/hr/employees/?pageSize=50&status=Terminated", "personnelCode"));
        Assert.Equal(new[] { "P-002" }, await Codes(client, "/api/hr/employees/?pageSize=50&department=Depo", "personnelCode"));
        Assert.Equal(new[] { "P-002" }, await Codes(client, "/api/hr/employees/?pageSize=50&q=Forklift", "personnelCode"));
        Assert.Equal(new[] { "P-001" }, await Codes(client, "/api/hr/employees/?pageSize=50&q=Deniz", "personnelCode"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/hr/employees/?status=OnLeave")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/hr/employees/?pageSize=101")).StatusCode);

        // Non-admin: only the linked personnel record, in the list and by id.
        ErpOperationCatalogTests.SetIdentity(client, SelfUser, "TenantUser");
        Assert.Equal(new[] { "P-001" }, await Codes(client, "/api/hr/employees/?pageSize=50", "personnelCode"));
        Assert.Single((await client.GetFromJsonAsync<JsonElement>("/api/hr/employees/")).EnumerateArray());
        Assert.Equal("P-001", (await client.GetFromJsonAsync<JsonElement>($"/api/hr/employees/{EmployeeSelf}")).GetProperty("personnelCode").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/hr/employees/{EmployeeOther}")).StatusCode);

        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var other = await client.GetFromJsonAsync<JsonElement>($"/api/hr/employees/{EmployeeOther}");
        Assert.Equal(("Active", "Depo"), (other.GetProperty("status").GetString(), other.GetProperty("department").GetString()));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/hr/employees/{EmployeeForeignTenant}")).StatusCode);
    }

    [Fact]
    public async Task Leave_list_filters_pages_and_reports_can_review_and_department()
    {
        await using var factory = await SeededFactoryAsync();
        await SeedTenantAsync(factory, db =>
        {
            db.EmployeeLeaveRequests.AddRange(
                Leave(EmployeeSelf, "Annual", 1, 5, EmployeeLeaveStatus.Requested, SelfUser, "Yıl sonu", minutesAgo: 3),
                Leave(EmployeeOther, "Health", 10, 12, EmployeeLeaveStatus.Requested, ErpOperationCatalogTests.Admin, null, minutesAgo: 2),
                Leave(EmployeeOther, "Excuse", 20, 20, EmployeeLeaveStatus.Approved, SecondAdmin, null, minutesAgo: 1));
        });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        var plain = await client.GetFromJsonAsync<JsonElement>("/api/hr/leave-requests/");
        Assert.Equal((JsonValueKind.Array, 3), (plain.ValueKind, plain.GetArrayLength()));
        var requested = await client.GetFromJsonAsync<JsonElement>("/api/hr/leave-requests/?status=Requested&page=1&pageSize=50");
        Assert.Equal(2, Int(requested, "totalCount"));
        var rows = requested.GetProperty("items").EnumerateArray().ToDictionary(x => x.GetProperty("leaveType").GetString()!);
        // Requested by someone else → reviewable; the admin's own request → not.
        Assert.True(rows["Annual"].GetProperty("canReview").GetBoolean());
        Assert.False(rows["Health"].GetProperty("canReview").GetBoolean());
        Assert.Equal("Üretim", rows["Annual"].GetProperty("department").GetString());
        var approved = await client.GetFromJsonAsync<JsonElement>("/api/hr/leave-requests/?status=Approved&pageSize=50");
        Assert.False(approved.GetProperty("items")[0].GetProperty("canReview").GetBoolean());

        Assert.Equal(new[] { "Annual" }, await Codes(client, "/api/hr/leave-requests/?pageSize=50&leaveType=Annual", "leaveType"));
        Assert.Equal(new[] { "Excuse", "Health" }, (await Codes(client, $"/api/hr/leave-requests/?pageSize=50&employeeId={EmployeeOther}", "leaveType")).Order());
        Assert.Equal(new[] { "Health" }, await Codes(client, $"/api/hr/leave-requests/?pageSize=50&from={Day(11):yyyy-MM-dd}&to={Day(15):yyyy-MM-dd}", "leaveType"));
        Assert.Equal(new[] { "Annual" }, await Codes(client, "/api/hr/leave-requests/?pageSize=50&q=sonu", "leaveType"));
        Assert.Equal(new[] { "Annual" }, await Codes(client, "/api/hr/leave-requests/?pageSize=50&q=P-001", "leaveType"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/hr/leave-requests/?status=Unknown")).StatusCode);

        // A second admin may review the first admin's request; a non-admin never.
        ErpOperationCatalogTests.SetIdentity(client, SecondAdmin, "TenantAdmin");
        var second = await client.GetFromJsonAsync<JsonElement>("/api/hr/leave-requests/?status=Requested&pageSize=50");
        Assert.All(second.GetProperty("items").EnumerateArray(), x => Assert.True(x.GetProperty("canReview").GetBoolean()));
        ErpOperationCatalogTests.SetIdentity(client, SelfUser, "TenantUser");
        var own = await client.GetFromJsonAsync<JsonElement>("/api/hr/leave-requests/?pageSize=50");
        var only = Assert.Single(own.GetProperty("items").EnumerateArray());
        Assert.Equal((false, true), (only.GetProperty("canReview").GetBoolean(), only.GetProperty("canCancel").GetBoolean()));
    }

    [Fact]
    public async Task Leave_request_without_requested_days_writes_the_calendar_days()
    {
        await using var factory = await SeededFactoryAsync();
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        using var created = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmployeeOther, leaveType = "Annual", startDate = Day(1).ToString("yyyy-MM-dd"), endDate = Day(5).ToString("yyyy-MM-dd")
        });
        Assert.True(created.StatusCode == HttpStatusCode.Created, await created.Content.ReadAsStringAsync());
        using var half = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmployeeOther, leaveType = "Excuse", startDate = Day(10).ToString("yyyy-MM-dd"), endDate = Day(10).ToString("yyyy-MM-dd"),
            requestedDays = 0.5m
        });
        Assert.Equal(HttpStatusCode.Created, half.StatusCode);
        // Still rejected: more than the calendar days, and a range longer than 366 days.
        using var tooMany = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmployeeOther, leaveType = "Annual", startDate = Day(20).ToString("yyyy-MM-dd"), endDate = Day(21).ToString("yyyy-MM-dd"),
            requestedDays = 3m
        });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
        using var tooLong = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmployeeOther, leaveType = "Unpaid", startDate = Day(30).ToString("yyyy-MM-dd"), endDate = Day(430).ToString("yyyy-MM-dd")
        });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);

        var days = (await client.GetFromJsonAsync<JsonElement>("/api/hr/leave-requests/")).EnumerateArray()
            .ToDictionary(x => x.GetProperty("leaveType").GetString()!, x => x.GetProperty("requestedDays").GetDecimal());
        Assert.Equal((5m, 0.5m), (days["Annual"], days["Excuse"]));
    }

    [Fact]
    public async Task Attendance_list_filters_pages_reads_by_id_and_reports_can_approve()
    {
        await using var factory = await SeededFactoryAsync();
        var mine = Guid.NewGuid();
        var byOther = Guid.NewGuid();
        var approved = Guid.NewGuid();
        await SeedTenantAsync(factory, db =>
        {
            db.EmployeeAttendanceRecords.AddRange(
                Attendance(mine, EmployeeSelf, 1, ErpOperationCatalogTests.Admin, "PendingApproval", "Sayım"),
                Attendance(byOther, EmployeeOther, 2, SecondAdmin, "PendingApproval", null),
                Attendance(approved, EmployeeOther, 3, SecondAdmin, "Approved", null));
        });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");

        Assert.Equal(JsonValueKind.Array, (await client.GetFromJsonAsync<JsonElement>("/api/hr/attendance/")).ValueKind);
        var page = await client.GetFromJsonAsync<JsonElement>("/api/hr/attendance/?page=1&pageSize=2");
        Assert.Equal((3, 2), (Int(page, "totalCount"), page.GetProperty("items").GetArrayLength()));
        var all = (await client.GetFromJsonAsync<JsonElement>("/api/hr/attendance/?pageSize=50")).GetProperty("items").EnumerateArray()
            .ToDictionary(x => x.GetProperty("id").GetGuid(), x => x.GetProperty("canApprove").GetBoolean());
        Assert.Equal((false, true, false), (all[mine], all[byOther], all[approved]));
        Assert.Equal(new[] { approved }, await Ids(client, "/api/hr/attendance/?pageSize=50&approvalStatus=Approved"));
        Assert.Equal(new[] { mine }, await Ids(client, $"/api/hr/attendance/?pageSize=50&employeeId={EmployeeSelf}"));
        Assert.Equal(new[] { mine }, await Ids(client, "/api/hr/attendance/?pageSize=50&q=Sayım"));
        Assert.Equal(new[] { byOther }, await Ids(client, $"/api/hr/attendance/?pageSize=50&from={Day(2):yyyy-MM-dd}&to={Day(2):yyyy-MM-dd}"));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/hr/attendance/?approvalStatus=Rejected")).StatusCode);
        var record = await client.GetFromJsonAsync<JsonElement>($"/api/hr/attendance/{byOther}");
        Assert.Equal((480, true), (Int(record, "workedMinutes"), record.GetProperty("canApprove").GetBoolean()));

        ErpOperationCatalogTests.SetIdentity(client, SelfUser, "TenantUser");
        Assert.Equal(new[] { mine }, await Ids(client, "/api/hr/attendance/?pageSize=50"));
        Assert.False((await client.GetFromJsonAsync<JsonElement>($"/api/hr/attendance/{mine}")).GetProperty("canApprove").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/hr/attendance/{byOther}")).StatusCode);
    }

    // ---- Menu and standards ----

    [Fact]
    public void Menu_catalog_has_the_hr_pages_and_the_legacy_payroll_screen()
    {
        foreach (var key in Keys.Append("human-resources")) Assert.Contains(key, StandardMenuEndpoints.PageKeys);
    }

    [Theory]
    [InlineData("hr-employees", "Personel")]
    [InlineData("hr-employee-create", "Personel kartı")]
    [InlineData("hr-leave-requests", "İzin talepleri")]
    [InlineData("hr-attendance", "Puantaj")]
    [InlineData("hr-period-summary", "Dönem özeti")]
    public void Standard_is_preview_version_1_and_uses_hr_operations(string key, string title)
    {
        var standard = SystemPageStandards.All[key];
        Assert.Equal((1, "preview", title, "İnsan Kaynakları"), (standard.Version, standard.Stage, standard.Title, standard.Module));
        Assert.True(TenantCustomPageSchema.Validate(standard.DefinitionJson, out var error), error);
        Assert.All(standard.Items, x => Assert.True(x.Since == 1 && x.Label.Length is > 0 and <= 80, x.Key));
        var queries = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().ToArray();
        Assert.All(queries, query => Assert.True(((string)query["operation"]!).StartsWith("ik.", StringComparison.Ordinal)
            && ErpOperationCatalog.TryGet((string)query["operation"]!, out var op) && !op.Deprecated, (string)query["id"]!));
        // The lists answer with the envelope only when paged: every list query binds page or pageSize.
        foreach (var query in queries.Where(x => ((string)x["operation"]!).EndsWith(".listele", StringComparison.Ordinal)))
            Assert.Contains(query["parameters"]!.AsArray().OfType<JsonObject>(), x => (string)x["name"]! is "page" or "pageSize");
    }

    [Fact]
    public void List_standards_follow_their_screen_views()
    {
        foreach (var key in new[] { "hr-employees", "hr-leave-requests", "hr-attendance" })
        {
            var view = Assert.Single(SystemPageStandards.All[key].ScreenViews);
            Assert.Equal((key, "liste"), (view.Key, view.Component));
            Assert.True(TenantScreenViewEndpoints.TryGetCatalogFields(key, out var fields));
            Assert.Equal(fields.Where(x => x.Key != "actions").Select(x => x.Key), view.Fields.Keys);
            var props = Props(key, "liste");
            Assert.Equal(("server", 50), ((string)props["paging"]!, (int)props["pageSize"]!));
        }
        Assert.Equal(new[] { "personnelCode", "fullName", "department", "jobTitle", "employmentCategory", "status" },
            Strings(Props("hr-employees", "liste")["columns"]));
        Assert.DoesNotContain("status:OnLeave", Strings(Props("hr-employees", "liste")["valueLabels"]).Select(x => x.Split('=')[0]));
        // KVKK: the leave note is not a default column (hidden in the list and left out of the export).
        Assert.DoesNotContain("note", Strings(Props("hr-leave-requests", "liste")["columns"]));
    }

    [Fact]
    public void Employee_pages_bind_the_card_by_page_parameter()
    {
        var bar = Props("hr-employees", "komutlar");
        Assert.Equal(("{{personeller.meta.totalCount}}", "yeniDugmesi", "acDugmesi"),
            ((string)bar["titleCount"]!, (string)bar["newButton"]!, (string)bar["openButton"]!));
        Assert.Contains("delete", Strings(bar["hiddenCommands"]));
        Assert.Equal("kullanici.rol != 'TenantAdmin'", (string)Props("hr-employees", "yeniDugmesi")["disabledWhen"]!);
        Assert.Equal(new[] { "employeeId={{liste.seciliSatir.id}}" }, Strings(Props("hr-employees", "acDugmesi")["params"]));
        Assert.Equal("acDugmesi", (string)Props("hr-employees", "liste")["rowOpenAction"]!);
        Assert.True((bool)Props("hr-employees", "eskiEkranDugmesi")["legacyScreen"]!);

        const string card = "hr-employee-create";
        Assert.Equal("{{sayfa.parametre.employeeId}}", Binding(card, "kart", "id"));
        Assert.Equal("{{bugun}}", (string)Props(card, "iseGirisYeni")["defaultValue"]!);
        Assert.Equal(("{{iseGirisYeni.value}}", "{{iseGiris.value}}"), (Binding(card, "olustur", "hireDate"), Binding(card, "guncelle", "hireDate")));
        Assert.Null(Binding(card, "olustur", "terminationDate"));
        Assert.Null(Binding(card, "guncelle", "userId"));
        Assert.Null(Binding(card, "guncelle", "rowVersion"));
        var cardBar = Props(card, "komutlar");
        Assert.Equal(("@hr-employees", true), ((string)cardBar["afterSavePageCode"]!, (bool)cardBar["saveAndNew"]!));
    }

    [Fact]
    public void Leave_page_defaults_to_requested_and_binds_review_with_the_row_version()
    {
        const string key = "hr-leave-requests";
        Assert.Equal("Requested", (string)Props(key, "durumSecimi")["defaultValue"]!);
        Assert.Equal("{{durumSecimi.value}}", Binding(key, "izinler", "status"));
        Assert.Equal(("Active", "{{personelDurumu.value}}"), ((string)Props(key, "personelDurumu")["defaultValue"]!, Binding(key, "talepPersonelleri", "status")));
        Assert.Equal("{{talepGun.value}}", Binding(key, "talepEt", "requestedDays"));
        Assert.Null(Props(key, "talepGun")["defaultValue"]);
        Assert.Equal(("Annual", "{{bugun}}"), ((string)Props(key, "talepTuru")["defaultValue"]!, (string)Props(key, "talepBaslangic")["defaultValue"]!));
        foreach (var query in new[] { "onayla", "reddet", "reddetPanel", "iptal" })
            Assert.Equal("{{liste.seciliSatir.rowVersion}}", Binding(key, query, "rowVersion"));
        Assert.Equal("{{reddetDugmesi.yanit}}", Binding(key, "reddet", "note"));
        var approve = Props(key, "onaylaDugmesi");
        Assert.Equal(("liste.seciliSatir.canReview != true", "Başka bir yönetici onaylamalı"), ((string)approve["disabledWhen"]!, (string)approve["disabledReason"]!));
        Assert.Equal("liste.seciliSatir.canCancel == true", (string)Props(key, "iptalDugmesi")["visibleWhen"]!);
    }

    [Fact]
    public void Attendance_and_summary_pages_keep_their_defaults()
    {
        const string key = "hr-attendance";
        Assert.Equal(("{{tarih.ayBasi}}", "{{bugun}}"), ((string)Props(key, "baslangicSecimi")["defaultValue"]!, (string)Props(key, "bitisSecimi")["defaultValue"]!));
        Assert.Equal(("480", "0"), ((string)Props(key, "kayitCalisma")["defaultValue"]!, (string)Props(key, "kayitMesai")["defaultValue"]!));
        Assert.Null(Props(key, "kayitPersoneli")["defaultValue"]);
        Assert.Equal("{{kayit.rows[0].id}}", Binding(key, "duzelt", "id"));
        Assert.Equal("Kayıt yeniden onaya düşer.", (string)Props(key, "duzeltUyarisi")["title"]!);
        Assert.Equal("liste.seciliSatir.canApprove != true", (string)Props(key, "onaylaDugmesi")["disabledWhen"]!);
        Assert.Equal("{{liste.seciliSatir.rowVersion}}", Binding(key, "onayla", "rowVersion"));

        var summary = Definition("hr-period-summary")["queries"]!.AsArray().OfType<JsonObject>().Single();
        Assert.Equal(("ik.donemOzeti", "manual"), ((string)summary["operation"]!, (string)summary["runOn"]!));
        Assert.Equal("ozet", (string)Props("hr-period-summary", "calistirDugmesi")["queryId"]!);
        Assert.Equal("{{ozet.meta.employeesAtPeriodEnd}}", (string)Props("hr-period-summary", "personelGostergesi")["value"]!);
    }

    [Fact]
    public void Attendance_notes_stay_out_of_list_and_export()
    {
        // Karar 8 (KVKK): serbest metin notlar listede ve dışa aktarımda varsayılan gizli; not yalnız pencerede.
        foreach (var key in new[] { "hr-attendance", "hr-leave-requests" })
            Assert.DoesNotContain("note", Props(key, "liste")["columns"]!.AsArray().Select(x => (string)x!));
    }

    [Theory]
    [InlineData("hr-employees", "hrEmployeesOperations.fixture.json")]
    [InlineData("hr-employee-create", "hrEmployeeCreateOperations.fixture.json")]
    [InlineData("hr-leave-requests", "hrLeaveRequestsOperations.fixture.json")]
    [InlineData("hr-attendance", "hrAttendanceOperations.fixture.json")]
    [InlineData("hr-period-summary", "hrPeriodSummaryOperations.fixture.json")]
    public async Task Frontend_fixture_matches_catalog(string key, string fixtureFile)
    {
        await using var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, _ => { });
        using var client = factory.CreateClient();
        ErpOperationCatalogTests.SetIdentity(client, ErpOperationCatalogTests.Admin, "TenantAdmin");
        var live = (await client.GetFromJsonAsync<JsonElement>("/api/custom-pages/erp-operations")).GetProperty("operations")
            .EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => JsonNode.Parse(x.GetRawText())!);
        var fixture = JsonNode.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend", "erp-web", "src", "system-pages", fixtureFile)))!["operations"]!.AsArray();
        var used = Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Select(x => (string)x["operation"]!).Distinct().Order(StringComparer.Ordinal);
        Assert.Equal(used, fixture.Select(x => (string)x!["name"]!).Order(StringComparer.Ordinal));
        foreach (var operation in fixture)
            Assert.True(JsonNode.DeepEquals(live[(string)operation!["name"]!], operation), (string)operation["name"]!);
    }

    // ---- Helpers ----

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "AIERP.slnx"))) return directory.FullName;
        throw new InvalidOperationException("AIERP.slnx bulunamadı.");
    }

    private static ErpOperation Op(string name) =>
        ErpOperationCatalog.TryGet(name, out var op) ? op : throw new Xunit.Sdk.XunitException($"İşlem yok: {name}");

    private static int Int(JsonElement element, string name) => element.GetProperty(name).GetInt32();

    private static DateOnly Day(int offset) => DateOnly.FromDateTime(DateTime.UtcNow).AddDays(offset);

    private static async Task<string[]> Codes(HttpClient client, string url, string field) =>
        (await client.GetFromJsonAsync<JsonElement>(url)).GetProperty("items").EnumerateArray().Select(x => x.GetProperty(field).GetString()!).ToArray();

    private static async Task<Guid[]> Ids(HttpClient client, string url) =>
        (await client.GetFromJsonAsync<JsonElement>(url)).GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToArray();

    private static async Task<Dictionary<string, bool>> OperationsAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/custom-pages/erp-operations");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        return body.GetProperty("operations").EnumerateArray().ToDictionary(x => x.GetProperty("name").GetString()!, x => x.GetProperty("allowed").GetBoolean());
    }

    /// <summary>Admin plus a second TenantAdmin and a TenantUser with HR read/create/execute, and three employees (one linked, one left).</summary>
    private static async Task<ErpOperationCatalogTests.ErpOperationApiFactory> SeededFactoryAsync()
    {
        var factory = new ErpOperationCatalogTests.ErpOperationApiFactory();
        await ErpOperationCatalogTests.SeedAsync(factory, platform =>
        {
            AddUser(platform, SelfUser, "TenantUser");
            AddUser(platform, SecondAdmin, "TenantAdmin");
            foreach (var code in new[] { "erp.human-resources.read", "erp.human-resources.create", "erp.human-resources.execute" })
                platform.TenantPermissionRules.Add(Rule(code, SelfUser));
        });
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        await SeedTenantAsync(factory, db => db.EmployeeRecords.AddRange(
            Employee(EmployeeSelf, "P-001", "Deniz Arslan", "Üretim", "Vardiya amiri", null, SelfUser),
            Employee(EmployeeOther, "P-002", "Mert Yıldız", "Depo", "Forklift operatörü", null, null),
            Employee(EmployeeLeft, "P-003", "Selin Demir", "Satış", "Temsilci", today.AddDays(-10), null),
            Employee(EmployeeForeignTenant, "P-004", "Başka Firma", "Depo", null, null, null, ErpOperationCatalogTests.TenantB)));
        return factory;
    }

    private static async Task SeedTenantAsync(ErpOperationCatalogTests.ErpOperationApiFactory factory, Action<TenantDbContext> seed)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        seed(db);
        await db.SaveChangesAsync();
    }

    private static EmployeeRecord Employee(Guid id, string code, string name, string? department, string? jobTitle, DateOnly? terminated,
        Guid? userId, Guid? tenantId = null) => new()
    {
        Id = id, TenantId = tenantId ?? ErpOperationCatalogTests.TenantA, PersonnelCode = code, FullName = name, Department = department,
        JobTitle = jobTitle, HireDate = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(-2), TerminationDate = terminated, UserId = userId,
        RowVersion = Version
    };

    private static EmployeeLeaveRequest Leave(Guid employeeId, string type, int startOffset, int endOffset, EmployeeLeaveStatus status,
        Guid requestedBy, string? note, int minutesAgo) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, EmployeeId = employeeId, LeaveType = type, StartDate = Day(startOffset), EndDate = Day(endOffset),
        RequestedDays = endOffset - startOffset + 1, Status = status, RequestedByUserId = requestedBy, Note = note,
        CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-minutesAgo), RowVersion = Version
    };

    private static EmployeeAttendanceRecord Attendance(Guid id, Guid employeeId, int dayOffset, Guid recordedBy, string approval, string? note) => new()
    {
        Id = id, TenantId = ErpOperationCatalogTests.TenantA, EmployeeId = employeeId, WorkDate = Day(dayOffset), WorkedMinutes = 480,
        OvertimeMinutes = 0, RecordedByUserId = recordedBy, ApprovalStatus = approval, Note = note, RowVersion = Version
    };

    private static void AddUser(PlatformDbContext platform, Guid id, string role)
    {
        var tenant = platform.Tenants.Local.Single(x => x.Id == ErpOperationCatalogTests.TenantA);
        var user = new AppUser { Id = id, Email = $"{id:N}@example.invalid", DisplayName = "HR user", IsActive = true };
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, UserId = id, Tenant = tenant, User = user, Role = role });
        platform.TenantPermissionRules.Add(Rule("erp.custom-menus.read", id));
    }

    private static TenantPermissionRule Rule(string code, Guid user) => new()
    {
        TenantId = ErpOperationCatalogTests.TenantA, SubjectType = TenantPermissionSubjectType.User, SubjectUserId = user, PermissionCode = code,
        ResourceType = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code).ResourceType, Effect = TenantPermissionEffect.Allow, IsActive = true
    };

    private static JsonObject Definition(string key) => JsonNode.Parse(SystemPageStandards.All[key].DefinitionJson)!.AsObject();

    private static JsonObject Props(string key, string id) =>
        Definition(key)["components"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == id)["props"]!.AsObject();

    private static string? Binding(string key, string queryId, string parameter) =>
        (string?)Definition(key)["queries"]!.AsArray().OfType<JsonObject>().Single(x => (string)x["id"]! == queryId)["parameters"]!.AsArray()
            .OfType<JsonObject>().SingleOrDefault(x => (string)x["name"]! == parameter)?["binding"];

    private static string[] Strings(JsonNode? node) => node!.AsArray().Select(x => (string)x!).ToArray();
}
