using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;
using System.Security.Claims;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class HumanResourcesEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Admin = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid HrApprover = Guid.Parse("abababab-abab-abab-abab-abababababab");
    private static readonly Guid EmployeeUserA = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid EmployeeUserB = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid EmployeeA = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid EmployeeB = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid LeaveA = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
    private static readonly Guid LeaveB = Guid.Parse("12121212-1212-1212-1212-121212121212");
    private static readonly Guid AttendanceA = Guid.Parse("13131313-1313-1313-1313-131313131313");
    private static readonly Guid AttendanceB = Guid.Parse("14141414-1414-1414-1414-141414141414");
    private static readonly Guid AttendanceAOtherDay = Guid.Parse("16161616-1616-1616-1616-161616161616");
    private static readonly Guid EmploymentWindowEmployee = Guid.Parse("17171717-1717-1717-1717-171717171717");

    [Fact]
    public async Task Hr_reads_are_tenant_scoped_and_employee_self_service_is_limited_to_linked_user()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/hr/employees/")).StatusCode);

        SetIdentity(client, TenantA, EmployeeUserA, "Employee");
        var employees = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/employees/");
        Assert.NotNull(employees);
        Assert.Equal(new[] { EmployeeA }, employees.Select(x => x.GetProperty("id").GetGuid()));
        Assert.Equal(new[] { LeaveA }, (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/"))!
            .Select(x => x.GetProperty("id").GetGuid()));
        Assert.Equal(new[] { AttendanceAOtherDay, AttendanceA }, (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/"))!
            .Select(x => x.GetProperty("id").GetGuid()));

        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/employees/"))!.Length);
        Assert.Single((await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/"))!);
        Assert.Equal(2, (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/"))!.Length);

        SetIdentity(client, TenantB, Admin, "TenantAdmin");
        Assert.Equal(new[] { EmployeeB }, (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/employees/"))!
            .Select(x => x.GetProperty("id").GetGuid()));
        Assert.Equal(new[] { LeaveB }, (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/"))!
            .Select(x => x.GetProperty("id").GetGuid()));
        Assert.Equal(new[] { AttendanceB }, (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/"))!
            .Select(x => x.GetProperty("id").GetGuid()));
    }

    [Fact]
    public async Task Hr_writes_and_approvals_enforce_role_ownership_and_tenant_boundaries()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();

        SetIdentity(client, TenantA, EmployeeUserA, "Employee");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/hr/employees/", EmployeeWrite("E-NEW"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/hr/attendance/", AttendanceWrite(EmployeeA))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/hr/leave-requests/{LeaveA}/review", new { approve = true, note = "ok", rowVersion = Convert.ToBase64String(new byte[8]) })).StatusCode);

        var ownLeave = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmployeeA, leaveType = "Annual", startDate = "2026-11-02", endDate = "2026-11-03", requestedDays = 2m, note = "test"
        });
        Assert.True(ownLeave.StatusCode == HttpStatusCode.Created, await ownLeave.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/hr/leave-requests/", new
            {
                employeeId = EmployeeB, leaveType = "Annual", startDate = "2026-11-05", endDate = "2026-11-06", requestedDays = 2m
            })).StatusCode);

        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        var createdEmployeeResponse = await client.PostAsJsonAsync("/api/hr/employees/", EmployeeWrite("E-NEW"));
        Assert.Equal(HttpStatusCode.Created, createdEmployeeResponse.StatusCode);
        var createdEmployee = await createdEmployeeResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Office", createdEmployee.GetProperty("employmentCategory").GetString());
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/hr/attendance/", AttendanceWrite(EmployeeB))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/hr/leave-requests/", new
            {
                employeeId = EmployeeB, leaveType = "Annual", startDate = "2026-11-09", endDate = "2026-11-10", requestedDays = 2m
            })).StatusCode);

        SetIdentity(client, TenantB, Admin, "TenantAdmin");
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/hr/leave-requests/{LeaveA}/review", new { approve = true, note = "ok", rowVersion = Convert.ToBase64String(new byte[8]) })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync($"/api/hr/attendance/{AttendanceA}", AttendanceWrite(EmployeeA) with { RowVersion = Convert.ToBase64String(new byte[8]) })).StatusCode);
    }

    [Fact]
    public async Task Tenant_admin_can_edit_and_terminate_employee_with_current_row_version()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        var employees = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/employees/");
        var employee = Assert.Single(employees!, x => x.GetProperty("id").GetGuid() == EmployeeA);
        var response = await client.PutAsJsonAsync($"/api/hr/employees/{EmployeeA}", new
        {
            personnelCode = "A-001", fullName = "Updated Employee", department = "Finance", jobTitle = "Analyst", employmentCategory = "Field staff",
            workEmail = "updated@example.test", hireDate = "2024-01-01", terminationDate = "2026-10-21",
            userId = EmployeeUserA, rowVersion = employee.GetProperty("rowVersion").GetString()
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Updated Employee", updated.GetProperty("fullName").GetString());
        Assert.Equal("Field staff", updated.GetProperty("employmentCategory").GetString());
        Assert.Equal("Terminated", updated.GetProperty("status").GetString());
        Assert.Equal("2026-10-21", updated.GetProperty("terminationDate").GetString());
    }

    [Fact]
    public async Task Attendance_correction_to_an_existing_employee_date_returns_conflict()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        var response = await client.PutAsJsonAsync($"/api/hr/attendance/{AttendanceA}",
            AttendanceWrite(EmployeeA) with { WorkDate = new DateOnly(2026, 10, 21), RowVersion = Convert.ToBase64String(new byte[8]) });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("zaten bir puantaj kaydı", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Attendance_requires_a_second_tenant_admin_approval_and_correction_resets_it()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        var rows = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/");
        var ownEntry = Assert.Single(rows!, x => x.GetProperty("id").GetGuid() == AttendanceA);
        Assert.Equal("PendingApproval", ownEntry.GetProperty("approvalStatus").GetString());
        var selfApproval = await client.PostAsJsonAsync($"/api/hr/attendance/{AttendanceA}/approve",
            new { rowVersion = ownEntry.GetProperty("rowVersion").GetString() });
        Assert.Equal(HttpStatusCode.Conflict, selfApproval.StatusCode);

        var otherEntry = Assert.Single(rows!, x => x.GetProperty("id").GetGuid() == AttendanceAOtherDay);
        var approved = await client.PostAsJsonAsync($"/api/hr/attendance/{AttendanceAOtherDay}/approve",
            new { rowVersion = otherEntry.GetProperty("rowVersion").GetString() });
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal("Approved", (await approved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());

        var approvedEntry = (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/"))!
            .Single(x => x.GetProperty("id").GetGuid() == AttendanceAOtherDay);
        var correction = await client.PutAsJsonAsync($"/api/hr/attendance/{AttendanceAOtherDay}",
            AttendanceWrite(EmployeeA) with { WorkDate = new DateOnly(2026, 10, 21), RowVersion = approvedEntry.GetProperty("rowVersion").GetString() });
        Assert.Equal(HttpStatusCode.OK, correction.StatusCode);
        var correctedEntry = (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/"))!
            .Single(x => x.GetProperty("id").GetGuid() == AttendanceAOtherDay);
        Assert.Equal("PendingApproval", correctedEntry.GetProperty("approvalStatus").GetString());
        Assert.Equal(JsonValueKind.Null, correctedEntry.GetProperty("approvedByUserId").ValueKind);
    }

    [Fact]
    public async Task Leave_and_attendance_dates_must_fall_inside_employment_window_including_boundaries()
    {
        var hireDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1);
        var terminationDate = hireDate.AddDays(2);
        await using var app = await StartApplicationAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.EmployeeRecords.Add(new EmployeeRecord { Id = EmploymentWindowEmployee, TenantId = TenantA, PersonnelCode = "A-003",
                FullName = "Employment Window Employee", HireDate = hireDate, TerminationDate = terminationDate });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        using var leaveBeforeHire = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmploymentWindowEmployee, leaveType = "Annual", startDate = hireDate.AddDays(-1), endDate = hireDate, requestedDays = 2m
        });
        Assert.Equal(HttpStatusCode.BadRequest, leaveBeforeHire.StatusCode);
        using var leaveAfterTermination = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmploymentWindowEmployee, leaveType = "Annual", startDate = terminationDate, endDate = terminationDate.AddDays(1), requestedDays = 2m
        });
        Assert.Equal(HttpStatusCode.BadRequest, leaveAfterTermination.StatusCode);
        using var leaveOnBoundaries = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmploymentWindowEmployee, leaveType = "Annual", startDate = hireDate, endDate = terminationDate, requestedDays = 3m
        });
        Assert.Equal(HttpStatusCode.Created, leaveOnBoundaries.StatusCode);

        using var attendanceBeforeHire = await client.PostAsJsonAsync("/api/hr/attendance/",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = hireDate.AddDays(-1) });
        Assert.Equal(HttpStatusCode.BadRequest, attendanceBeforeHire.StatusCode);
        using var attendanceAfterTermination = await client.PostAsJsonAsync("/api/hr/attendance/",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = terminationDate.AddDays(1) });
        Assert.Equal(HttpStatusCode.BadRequest, attendanceAfterTermination.StatusCode);
        using var attendanceOnBoundary = await client.PostAsJsonAsync("/api/hr/attendance/",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = terminationDate });
        Assert.Equal(HttpStatusCode.Created, attendanceOnBoundary.StatusCode);
        var attendanceId = (await attendanceOnBoundary.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var version = (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/"))!
            .Single(x => x.GetProperty("id").GetGuid() == attendanceId).GetProperty("rowVersion").GetString();
        using var correctionAfterTermination = await client.PutAsJsonAsync($"/api/hr/attendance/{attendanceId}",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = terminationDate.AddDays(1), RowVersion = version });
        Assert.Equal(HttpStatusCode.BadRequest, correctionAfterTermination.StatusCode);
    }

    [Fact]
    public async Task Employee_can_cancel_only_their_own_pending_leave_request_and_cancellation_is_audited()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, EmployeeUserA, "Employee");

        var leaves = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/");
        var ownLeave = Assert.Single(leaves!);
        Assert.True(ownLeave.GetProperty("canCancel").GetBoolean());
        var version = ownLeave.GetProperty("rowVersion").GetString();

        SetIdentity(client, TenantA, EmployeeUserB, "Employee");
        using var unauthorized = await client.PostAsJsonAsync($"/api/hr/leave-requests/{LeaveA}/cancel", new { rowVersion = version });
        Assert.Equal(HttpStatusCode.Forbidden, unauthorized.StatusCode);

        SetIdentity(client, TenantA, EmployeeUserA, "Employee");
        using var cancelled = await client.PostAsJsonAsync($"/api/hr/leave-requests/{LeaveA}/cancel", new { rowVersion = version });
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.Equal("Cancelled", (await cancelled.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        Assert.False((await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/"))![0].GetProperty("canCancel").GetBoolean());

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Contains(db.AuditEvents, x => x.TenantId == TenantA && x.UserId == EmployeeUserA && x.Action == "hr.leave.cancelled");
    }

    [Fact]
    public async Task Approved_leave_request_cannot_be_cancelled_by_employee()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        var leave = (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/"))!.Single();
        using var review = await client.PostAsJsonAsync($"/api/hr/leave-requests/{LeaveA}/review", new
        {
            approve = true, note = (string?)null, rowVersion = leave.GetProperty("rowVersion").GetString()
        });
        Assert.Equal(HttpStatusCode.OK, review.StatusCode);

        SetIdentity(client, TenantA, EmployeeUserA, "Employee");
        var reviewed = (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/"))!.Single();
        Assert.False(reviewed.GetProperty("canCancel").GetBoolean());
        using var cancellation = await client.PostAsJsonAsync($"/api/hr/leave-requests/{LeaveA}/cancel", new
        {
            rowVersion = reviewed.GetProperty("rowVersion").GetString()
        });
        Assert.Equal(HttpStatusCode.Conflict, cancellation.StatusCode);
    }

    [Fact]
    public async Task Payroll_rule_drafts_require_a_json_object_and_remain_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        async Task<HttpResponseMessage> CreateRuleDraft(JsonElement rules) => await client.PostAsJsonAsync("/api/hr/payroll/rule-sets/", new
        {
            taxYear = "2026",
            effectiveFrom = "2026-01-01",
            effectiveTo = (string?)null,
            officialSourceUrl = "https://example.gov.tr/payroll/rules",
            rules
        });

        using var arrayRules = await CreateRuleDraft(JsonDocument.Parse("[]").RootElement);
        using var stringRules = await CreateRuleDraft(JsonDocument.Parse("\"not-a-rule-object\"").RootElement);
        using var nullRules = await CreateRuleDraft(JsonDocument.Parse("null").RootElement);
        Assert.Equal(HttpStatusCode.BadRequest, arrayRules.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, stringRules.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, nullRules.StatusCode);

        using var validDraft = await CreateRuleDraft(JsonDocument.Parse("{}").RootElement);
        Assert.Equal(HttpStatusCode.Created, validDraft.StatusCode);
        var created = await validDraft.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Draft", created.GetProperty("status").GetString());
        var tenantDrafts = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/payroll/rule-sets/");
        Assert.Single(tenantDrafts!);
        Assert.Equal("{}", tenantDrafts![0].GetProperty("rulesJson").GetString());

        SetIdentity(client, TenantB, Admin, "TenantAdmin");
        var otherTenantDrafts = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/payroll/rule-sets/");
        Assert.Empty(otherTenantDrafts!);
    }

    [Fact]
    public async Task Payroll_sensitive_reads_and_writes_require_explicit_compensation_permissions()
    {
        await using var app = await StartApplicationAsync(denyPayrollPermissions: true);
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        var capabilities = await client.GetFromJsonAsync<JsonElement>("/api/hr/payroll/compensation/capabilities");
        Assert.False(capabilities.GetProperty("view").GetBoolean());
        Assert.False(capabilities.GetProperty("change").GetBoolean());
        Assert.False(capabilities.GetProperty("approve").GetBoolean());

        foreach (var path in new[]
        {
            "/api/hr/payroll/compensation/",
            "/api/hr/payroll/compensation/employees",
            "/api/hr/payroll/compensation/prior-employer-tax-bases",
            "/api/hr/payroll/runs/",
            $"/api/hr/payroll/runs/{Guid.NewGuid():D}",
            $"/api/hr/payroll/runs/{Guid.NewGuid():D}/calculations"
        })
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);

        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/hr/payroll/compensation/", new
        {
            employeeId = EmployeeA, targetKind = "Gross", amount = 1000m,
            currencyCode = "TRY", payBasisCode = "monthly", effectiveFrom = "2026-01-01"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/hr/payroll/runs/", new
        {
            periodKind = "CalendarMonth", periodStart = "2026-01-01", periodEnd = "2026-01-31",
            profileCode = "TR-4A-PRIVATE", employeeIds = new[] { EmployeeA }
        })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(
            $"/api/hr/payroll/runs/{Guid.NewGuid():D}/component-preview", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(
            $"/api/hr/payroll/runs/{Guid.NewGuid():D}/calculate", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(
            $"/api/hr/payroll/runs/{Guid.NewGuid():D}/calculations/{Guid.NewGuid():D}/approve", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(
            $"/api/hr/payroll/runs/{Guid.NewGuid():D}/calculations/{Guid.NewGuid():D}/reject", content: null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
            $"/api/hr/payroll/compensation/{Guid.NewGuid():D}/approve", new { rowVersion = Convert.ToBase64String(new byte[8]) })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync(
            $"/api/hr/payroll/compensation/{Guid.NewGuid():D}/reject", new { rowVersion = Convert.ToBase64String(new byte[8]) })).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Empty(await db.AuditEvents.Where(x => x.TenantId == TenantA && x.Action.StartsWith("hr.payroll-"))
            .ToListAsync());
    }

    [Fact]
    public async Task Payroll_rule_set_approvals_reject_overlapping_periods_and_allow_adjacent_periods()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        const string validRulesJson = """
        {
          "schemaVersion": 1,
          "parameters": [],
          "payBases": [{
            "code": "synthetic-monthly", "label": "Synthetic monthly", "unit": "month",
            "periodMultiplier": { "op": "constant", "value": 1, "unit": "month" },
            "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null,
            "sources": [
              { "kind": "official", "reference": "Synthetic schema fixture", "url": "https://example.gov.tr/payroll" },
              { "kind": "employerPolicy", "reference": "Synthetic monthly basis", "url": null }
            ]
          }],
          "components": [{
            "key": "base-pay", "label": "Base pay", "category": "earning", "unit": "TRY",
            "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null,
            "formula": { "op": "constant", "value": 1234.56, "unit": "TRY" },
            "sources": [
              { "kind": "official", "reference": "Synthetic schema fixture", "url": "https://example.gov.tr/payroll" },
              { "kind": "employerPolicy", "reference": "Synthetic company policy", "url": null }
            ]
          }],
          "mappings": [
            { "componentKey": "base-pay", "mappingType": "incomeTaxBase", "targetCode": "EXCLUDED", "baseTreatment": "exclude", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] },
            { "componentKey": "base-pay", "mappingType": "socialSecurityBase", "targetCode": "EXCLUDED", "baseTreatment": "exclude", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] },
            { "componentKey": "base-pay", "mappingType": "accountingAccount", "targetCode": "EXCLUDED", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] },
            { "componentKey": "base-pay", "mappingType": "declarationField", "targetCode": "EXCLUDED", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] }
          ]
        }
        """;

        string RulesFor(string effectiveFrom, string effectiveTo)
        {
            var rules = JsonNode.Parse(validRulesJson)!.AsObject();
            foreach (var collectionName in new[] { "payBases", "components", "mappings" })
            foreach (var entry in rules[collectionName]!.AsArray())
            {
                entry!["effectiveFrom"] = effectiveFrom;
                entry["effectiveTo"] = effectiveTo;
            }
            return rules.ToJsonString();
        }

        async Task<HttpResponseMessage> Approve(Guid id)
        {
            var rows = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/payroll/rule-sets/");
            var version = rows!.Single(row => row.GetProperty("id").GetGuid() == id).GetProperty("rowVersion").GetString();
            return await client.PostAsJsonAsync($"/api/hr/payroll/rule-sets/{id}/approve", new { rowVersion = version });
        }

        var firstId = Guid.NewGuid();
        var overlappingId = Guid.NewGuid();
        var adjacentId = Guid.NewGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.PayrollRuleSets.AddRange(
                new PayrollRuleSet
                {
                    Id = firstId, TenantId = TenantA, TaxYear = "2026", JurisdictionCode = "TR",
                    EffectiveFrom = new DateOnly(2026, 1, 1), EffectiveTo = new DateOnly(2026, 6, 30), Version = 1,
                    RulesJson = RulesFor("2026-01-01", "2026-06-30"), OfficialSourceUrl = "https://example.gov.tr/payroll/rules",
                    Status = "Approved", CreatedByUserId = Admin, ApprovedByUserId = HrApprover,
                    ApprovedAt = DateTimeOffset.UtcNow, RowVersion = new byte[8]
                },
                new PayrollRuleSet
                {
                    Id = overlappingId, TenantId = TenantA, TaxYear = "2026", JurisdictionCode = "TR",
                    EffectiveFrom = new DateOnly(2026, 6, 30), EffectiveTo = new DateOnly(2026, 12, 31), Version = 1,
                    RulesJson = RulesFor("2026-06-30", "2026-12-31"), OfficialSourceUrl = "https://example.gov.tr/payroll/rules",
                    Status = "Draft", CreatedByUserId = Admin, RowVersion = new byte[8]
                },
                new PayrollRuleSet
                {
                    Id = adjacentId, TenantId = TenantA, TaxYear = "2026", JurisdictionCode = "TR",
                    EffectiveFrom = new DateOnly(2026, 7, 1), EffectiveTo = new DateOnly(2026, 12, 31), Version = 1,
                    RulesJson = RulesFor("2026-07-01", "2026-12-31"), OfficialSourceUrl = "https://example.gov.tr/payroll/rules",
                    Status = "Draft", CreatedByUserId = Admin, RowVersion = new byte[8]
                });
            await db.SaveChangesAsync();
        }
        SetIdentity(client, TenantA, HrApprover, "TenantAdmin");

        using var rejectedOverlap = await Approve(overlappingId);
        using var approvedAdjacent = await Approve(adjacentId);

        Assert.True(rejectedOverlap.StatusCode == HttpStatusCode.Conflict,
            $"Overlapping approval was not rejected: {(int)rejectedOverlap.StatusCode} {await rejectedOverlap.Content.ReadAsStringAsync()}");
        Assert.True(approvedAdjacent.StatusCode == HttpStatusCode.OK,
            $"Adjacent approval failed: {(int)approvedAdjacent.StatusCode} {await approvedAdjacent.Content.ReadAsStringAsync()}");
        var conflict = await rejectedOverlap.Content.ReadAsStringAsync();
        Assert.Contains("yürürlük tarihleriyle çakışma", conflict, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Payroll_component_preview_and_internal_result_approval_never_finalize_a_payroll_run()
    {
        await using var app = await StartApplicationAsync();
        var runId = Guid.NewGuid();
        var tamperedRunId = Guid.NewGuid();
        const string rulesJson = """
        {
          "schemaVersion": 1,
          "parameters": [{
            "key": "hourly-category", "label": "Hourly category", "valueType": "choice", "value": "Hourly staff", "unit": null,
            "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null,
            "sources": [
              { "kind": "official", "reference": "Synthetic schema fixture", "url": "https://example.gov.tr/payroll" },
              { "kind": "employerPolicy", "reference": "Synthetic company category", "url": null }
            ]
          }],
          "inputs": [{
            "key": "employee-category", "label": "Employee category", "valueType": "choice", "unit": null,
            "sourceBinding": "employee.employmentCategory", "profile": "TR-4A-PRIVATE",
            "effectiveFrom": "2026-01-01", "effectiveTo": null,
            "sources": [
              { "kind": "official", "reference": "Synthetic schema fixture", "url": "https://example.gov.tr/payroll" },
              { "kind": "employerPolicy", "reference": "Synthetic company category", "url": null }
            ]
          }],
          "payBases": [{
            "code": "synthetic-monthly", "label": "Synthetic monthly", "unit": "month",
            "periodMultiplier": { "op": "constant", "value": 1, "unit": "month" },
            "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null,
            "sources": [
              { "kind": "official", "reference": "Synthetic schema fixture", "url": "https://example.gov.tr/payroll" },
              { "kind": "employerPolicy", "reference": "Synthetic monthly basis", "url": null }
            ]
          }],
          "components": [{
            "key": "base-pay", "label": "Base pay", "category": "earning", "unit": "TRY",
            "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null,
            "formula": {
              "op": "if",
              "condition": {
                "op": "eq",
                "left": { "op": "input", "key": "employee-category", "valueType": "choice", "unit": null },
                "right": { "op": "parameter", "key": "hourly-category", "valueType": "choice", "unit": null }
              },
              "then": { "op": "constant", "value": 1234.565, "unit": "TRY" },
              "else": { "op": "constant", "value": 0, "unit": "TRY" }
            },
            "sources": [
              { "kind": "official", "reference": "Synthetic schema fixture", "url": "https://example.gov.tr/payroll" },
              { "kind": "employerPolicy", "reference": "Synthetic company policy", "url": null }
            ]
          }],
          "mappings": [
            { "componentKey": "base-pay", "mappingType": "incomeTaxBase", "targetCode": "EXCLUDED", "baseTreatment": "exclude", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] },
            { "componentKey": "base-pay", "mappingType": "socialSecurityBase", "targetCode": "EXCLUDED", "baseTreatment": "exclude", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] },
            { "componentKey": "base-pay", "mappingType": "accountingAccount", "targetCode": "720.01", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] },
            { "componentKey": "base-pay", "mappingType": "declarationField", "targetCode": "EXCLUDED", "profile": "TR-4A-PRIVATE", "effectiveFrom": "2026-01-01", "effectiveTo": null, "sources": [{ "kind": "official", "reference": "fixture", "url": "https://example.gov.tr/payroll" }, { "kind": "employerPolicy", "reference": "fixture", "url": null }] }
          ]
        }
        """;
        var snapshotJson = JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            employees = new[] { new
            {
                id = EmployeeA, personnelCode = "A-001", fullName = "Synthetic <employee>", employmentCategory = "Hourly staff",
                compensation = new[] { new
                {
                    amount = 1234.56m, targetKind = "Gross", currencyCode = "TRY",
                    payBasisCode = "synthetic-monthly", effectiveFrom = "2026-01-01", effectiveTo = (string?)null
                } }
            } },
            ruleSets = new[] { new
            {
                id = Guid.NewGuid(), taxYear = "2026", effectiveFrom = "2026-01-01", effectiveTo = (string?)null,
                version = 1, rulesJson, officialSourceUrl = "https://example.gov.tr/payroll", status = "Approved",
                approvedByUserId = Admin, approvedAt = "2026-01-01T00:00:00+00:00"
            } }
        });
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(snapshotJson)));
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.PayrollRunSnapshots.AddRange(
                new PayrollRunSnapshot
                {
                    Id = runId, TenantId = TenantA, PeriodKind = "CalendarMonth",
                    PeriodStart = new DateOnly(2026, 1, 1), PeriodEnd = new DateOnly(2026, 1, 31),
                    ProfileCode = "TR-4A-PRIVATE", Status = "Blocked", EmployeeCount = 1,
                    SnapshotJson = snapshotJson, SnapshotSha256 = hash,
                    BlockersJson = "[\"calculation-engine-not-enabled\",\"employer-declaration-profile-not-approved\",\"declaration-business-validation-not-configured\"]",
                    CreatedByUserId = Admin
                },
                new PayrollRunSnapshot
                {
                    Id = tamperedRunId, TenantId = TenantA, PeriodKind = "CalendarMonth",
                    PeriodStart = new DateOnly(2026, 1, 1), PeriodEnd = new DateOnly(2026, 1, 31),
                    ProfileCode = "TR-4A-PRIVATE", Status = "Blocked", EmployeeCount = 1,
                    SnapshotJson = snapshotJson.Replace("1234.56", "9999.99", StringComparison.Ordinal), SnapshotSha256 = hash,
                    BlockersJson = "[\"calculation-engine-not-enabled\",\"employer-declaration-profile-not-approved\",\"declaration-business-validation-not-configured\"]",
                    CreatedByUserId = Admin
                });
            var payrollExpenseId = Guid.NewGuid();
            var payrollPayableId = Guid.NewGuid();
            db.LedgerAccounts.AddRange(
                new LedgerAccount { Id = payrollExpenseId, TenantId = TenantA, Code = "720.01", Name = "Ücret giderleri", StatementSection = LedgerAccountStatementSection.Expense },
                new LedgerAccount { Id = payrollPayableId, TenantId = TenantA, Code = "335.01", Name = "Personele borçlar", StatementSection = LedgerAccountStatementSection.Liability });
            db.LedgerAccountMappings.Add(new LedgerAccountMapping { TenantId = TenantA, MappingKey = LedgerMappingKeys.PayrollNetPayPayable, AccountId = payrollPayableId });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        using var response = await client.PostAsync($"/api/hr/payroll/runs/{runId:D}/component-preview", content: null);

        Assert.True(response.StatusCode == HttpStatusCode.OK,
            $"Expected a component preview, received {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("FormulaTargetPreviewOnly", payload.GetProperty("stage").GetString());
        Assert.False(payload.GetProperty("payrollResultCreated").GetBoolean());
        var employee = Assert.Single(payload.GetProperty("employees").EnumerateArray());
        var component = Assert.Single(employee.GetProperty("components").EnumerateArray());
        Assert.Equal("base-pay", component.GetProperty("key").GetString());
        Assert.Equal(1234.57m, component.GetProperty("amount").GetDecimal());
        Assert.Equal("TRY", component.GetProperty("unit").GetString());
        Assert.Equal("EXCLUDED", component.GetProperty("mappingCodes").GetProperty("incomeTaxBase").GetString());

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var run = await verifyDb.PayrollRunSnapshots.SingleAsync(x => x.TenantId == TenantA && x.Id == runId);
        Assert.Equal("Blocked", run.Status);
        Assert.Contains(verifyDb.AuditEvents, x => x.TenantId == TenantA && x.UserId == Admin &&
            x.Action == "hr.payroll-run.component-preview" && x.Resource!.Contains(hash, StringComparison.Ordinal));

        using var tampered = await client.PostAsync($"/api/hr/payroll/runs/{tamperedRunId:D}/component-preview", content: null);
        Assert.Equal(HttpStatusCode.Conflict, tampered.StatusCode);
        Assert.Single(verifyDb.AuditEvents.Where(x => x.TenantId == TenantA && x.Action == "hr.payroll-run.component-preview"));

        using var resultResponse = await client.PostAsync($"/api/hr/payroll/runs/{runId:D}/calculate", content: null);
        Assert.Equal(HttpStatusCode.Created, resultResponse.StatusCode);
        var createdResult = await resultResponse.Content.ReadFromJsonAsync<JsonElement>();
        var calculationId = createdResult.GetProperty("id").GetGuid();
        Assert.Equal("PendingApproval", createdResult.GetProperty("status").GetString());
        var resultEnvelope = JsonSerializer.Deserialize<PayrollFormulaResultEnvelope>(createdResult.GetProperty("resultJson").GetString()!);
        Assert.NotNull(resultEnvelope);
        Assert.Equal("FormulaTargetPreviewOnly", resultEnvelope.Stage);
        Assert.False(resultEnvelope.IsOfficialPayrollResult);
        Assert.Equal(1234.57m, Assert.Single(Assert.Single(resultEnvelope.Employees).Components).Amount);

        using var selfApproval = await client.PostAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/approve", content: null);
        Assert.Equal(HttpStatusCode.Conflict, selfApproval.StatusCode);

        SetIdentity(client, TenantA, EmployeeUserA, "TenantAdmin");
        using var independentApproval = await client.PostAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/approve", content: null);
        Assert.Equal(HttpStatusCode.OK, independentApproval.StatusCode);
        var approvedResult = await independentApproval.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Approved", approvedResult.GetProperty("status").GetString());
        Assert.Equal(EmployeeUserA, approvedResult.GetProperty("approvedByUserId").GetGuid());

        await using var finalScope = app.Services.CreateAsyncScope();
        var finalDb = finalScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var finalRun = await finalDb.PayrollRunSnapshots.SingleAsync(x => x.TenantId == TenantA && x.Id == runId);
        var finalCalculation = await finalDb.PayrollRunCalculations.SingleAsync(x => x.TenantId == TenantA && x.Id == calculationId);
        Assert.Equal("Blocked", finalRun.Status);
        Assert.Equal("Approved", finalCalculation.Status);
        Assert.Contains(finalDb.AuditEvents, x => x.TenantId == TenantA && x.UserId == EmployeeUserA &&
            x.Action == "hr.payroll-run.formula-result-approved");

        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        using var finalizeResponse = await client.PostAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/finalize", content: null);
        Assert.Equal(HttpStatusCode.OK, finalizeResponse.StatusCode);
        using var payslipResponse = await client.GetAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/payslips");
        Assert.Equal(HttpStatusCode.OK, payslipResponse.StatusCode);
        Assert.StartsWith("text/html", payslipResponse.Content.Headers.ContentType!.ToString(), StringComparison.OrdinalIgnoreCase);
        var payslips = await payslipResponse.Content.ReadAsStringAsync();
        Assert.Contains("Synthetic &lt;employee&gt;", payslips);
        Assert.Contains("Resmî bordro pusulası değildir.", payslips);
        Assert.DoesNotContain("Synthetic <employee>", payslips);

        using var voucherResponse = await client.GetAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/voucher-draft");
        Assert.Equal(HttpStatusCode.OK, voucherResponse.StatusCode);
        Assert.StartsWith("text/csv", voucherResponse.Content.Headers.ContentType!.ToString(), StringComparison.OrdinalIgnoreCase);
        var voucherDraft = await voucherResponse.Content.ReadAsStringAsync();
        Assert.Contains("Taslak dosya; resmi bordro değildir ve yevmiyeye kaydedilmez.", voucherDraft);
        Assert.Contains("DRAFT,\"2026-01-31\",\"A-001\",\"Synthetic <employee>\",\"Base pay\",\"720.01\",1234.57,0.00,\"TRY\"", voucherDraft);
        Assert.Contains("DRAFT,\"2026-01-31\",\"A-001\",\"Synthetic <employee>\",\"Net ücret ödeme borcu\",\"335.01\",0.00,1234.57,\"TRY\"", voucherDraft);
        Assert.Equal(0, await finalDb.JournalEntries.CountAsync(x => x.TenantId == TenantA));

        SetIdentity(client, TenantA, EmployeeUserA, "Employee");
        using var unauthorizedPost = await client.PostAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/post-voucher", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, unauthorizedPost.StatusCode);
        Assert.Equal(0, await finalDb.JournalEntries.CountAsync(x => x.TenantId == TenantA));
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        using var postVoucherResponse = await client.PostAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/post-voucher", content: null);
        Assert.Equal(HttpStatusCode.Created, postVoucherResponse.StatusCode);
        var postedVoucher = await postVoucherResponse.Content.ReadFromJsonAsync<JsonElement>();
        var journalEntryId = postedVoucher.GetProperty("journalEntryId").GetGuid();
        Assert.False(postedVoucher.GetProperty("idempotent").GetBoolean());
        Assert.Equal(1234.57m, postedVoucher.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(1234.57m, postedVoucher.GetProperty("totalCredit").GetDecimal());
        Assert.False(postedVoucher.GetProperty("officialPayrollResult").GetBoolean());

        using var replayPostResponse = await client.PostAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/post-voucher", content: null);
        Assert.Equal(HttpStatusCode.OK, replayPostResponse.StatusCode);
        var replayedVoucher = await replayPostResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(journalEntryId, replayedVoucher.GetProperty("journalEntryId").GetGuid());
        Assert.True(replayedVoucher.GetProperty("idempotent").GetBoolean());
        using var mismatchedRunReplay = await client.PostAsync(
            $"/api/hr/payroll/runs/{Guid.NewGuid():D}/calculations/{calculationId:D}/post-voucher", content: null);
        Assert.Equal(HttpStatusCode.NotFound, mismatchedRunReplay.StatusCode);
        await using (var postedScope = app.Services.CreateAsyncScope())
        {
            var postedDb = postedScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var journal = await postedDb.JournalEntries.Include(x => x.Lines)
                .SingleAsync(x => x.TenantId == TenantA && x.SourceType == "PayrollCalculation" && x.SourceId == calculationId);
            Assert.Equal(2, journal.Lines.Count);
            Assert.Equal(1234.57m, journal.Lines.Sum(x => x.Debit));
            Assert.Equal(1234.57m, journal.Lines.Sum(x => x.Credit));
            Assert.Contains(postedDb.AuditEvents, x => x.TenantId == TenantA && x.UserId == Admin &&
                x.Action == "hr.payroll-run.accounting-voucher-posted");
        }

        SetIdentity(client, TenantA, EmployeeUserA, "Employee");
        using var unauthorizedReversal = await client.PostAsJsonAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/reverse-voucher",
            new ManualJournalEntryReverseRequest(new DateOnly(2026, 2, 1), "Correction"));
        Assert.Equal(HttpStatusCode.Forbidden, unauthorizedReversal.StatusCode);
        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        var closedPeriodId = Guid.NewGuid();
        await using (var closedPeriodScope = app.Services.CreateAsyncScope())
        {
            var closeDb = closedPeriodScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            closeDb.JournalEntries.Add(new JournalEntry
            {
                Id = closedPeriodId, TenantId = TenantA, Code = "FY-CLOSE-20260201-20260201",
                EntryDate = new DateOnly(2026, 2, 1), Description = "Synthetic closed-period acceptance fixture",
                SourceType = "FiscalYearClose", SourceId = Guid.NewGuid()
            });
            await closeDb.SaveChangesAsync();
        }
        using var closedPeriodReversal = await client.PostAsJsonAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/reverse-voucher",
            new ManualJournalEntryReverseRequest(new DateOnly(2026, 2, 1), "Payroll correction"));
        Assert.Equal(HttpStatusCode.Conflict, closedPeriodReversal.StatusCode);
        await using (var closeCleanupScope = app.Services.CreateAsyncScope())
        {
            var closeDb = closeCleanupScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var syntheticClose = await closeDb.JournalEntries.SingleAsync(x => x.TenantId == TenantA && x.Id == closedPeriodId);
            closeDb.JournalEntries.Remove(syntheticClose);
            await closeDb.SaveChangesAsync();
        }
        using var reverseVoucherResponse = await client.PostAsJsonAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/reverse-voucher",
            new ManualJournalEntryReverseRequest(new DateOnly(2026, 2, 1), "Payroll correction"));
        Assert.Equal(HttpStatusCode.Created, reverseVoucherResponse.StatusCode);
        var reversal = await reverseVoucherResponse.Content.ReadFromJsonAsync<JsonElement>();
        var reversalEntryId = reversal.GetProperty("journalEntryId").GetGuid();
        Assert.Equal(1234.57m, reversal.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(1234.57m, reversal.GetProperty("totalCredit").GetDecimal());
        Assert.Equal("ManualReversal", reversal.GetProperty("sourceType").GetString());

        using var replayReversalResponse = await client.PostAsJsonAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/reverse-voucher",
            new ManualJournalEntryReverseRequest(new DateOnly(2026, 2, 1), "Payroll correction"));
        Assert.Equal(HttpStatusCode.OK, replayReversalResponse.StatusCode);
        var replayedReversal = await replayReversalResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(reversalEntryId, replayedReversal.GetProperty("journalEntryId").GetGuid());
        await using (var reversalScope = app.Services.CreateAsyncScope())
        {
            var reversalDb = reversalScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var reversalJournal = await reversalDb.JournalEntries.Include(x => x.Lines)
                .SingleAsync(x => x.TenantId == TenantA && x.SourceType == "ManualReversal" && x.SourceId == journalEntryId);
            Assert.Equal(2, reversalJournal.Lines.Count);
            Assert.Equal(1234.57m, reversalJournal.Lines.Sum(x => x.Debit));
            Assert.Equal(1234.57m, reversalJournal.Lines.Sum(x => x.Credit));
            Assert.Contains(reversalDb.AuditEvents, x => x.TenantId == TenantA && x.UserId == Admin &&
                x.Action == "hr.payroll-run.accounting-voucher-reversed");
        }

        using var packageResponse = await client.GetAsync(
            $"/api/hr/payroll/runs/{runId:D}/calculations/{calculationId:D}/manual-package");
        Assert.Equal(HttpStatusCode.OK, packageResponse.StatusCode);
        await using var packageStream = await packageResponse.Content.ReadAsStreamAsync();
        using var package = new ZipArchive(packageStream, ZipArchiveMode.Read);
        var voucherEntry = Assert.Single(package.Entries, x => x.FullName == "muhasebe-fisi-taslagi.csv");
        using var voucherReader = new StreamReader(voucherEntry.Open(), Encoding.UTF8);
        var voucher = await voucherReader.ReadToEndAsync();
        Assert.Contains("Date,EmployeeCode,EmployeeName,Description,AccountCode,Debit,Credit,Currency", voucher);
        Assert.Contains("\"A-001\",\"Synthetic <employee>\",\"Base pay\",\"720.01\",1234.57,0.00,\"TRY\"", voucher);
        Assert.Contains("\"Net ücret ödeme borcu\",,0.00,1234.57,\"TRY\"", voucher);
        Assert.Contains("EXCLUDED/atanmamış hesap kodları boş kalır", await ReadZipEntryAsync(package, "OKU.txt"));

        await using var artifactAuditScope = app.Services.CreateAsyncScope();
        var artifactAuditDb = artifactAuditScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Contains(artifactAuditDb.AuditEvents, x => x.TenantId == TenantA && x.UserId == Admin &&
            x.Action == "hr.payroll-run.internal-payslips-generated");
        Assert.Contains(artifactAuditDb.AuditEvents, x => x.TenantId == TenantA && x.UserId == Admin &&
            x.Action == "hr.payroll-run.manual-package-generated");
        Assert.Contains(artifactAuditDb.AuditEvents, x => x.TenantId == TenantA && x.UserId == Admin &&
            x.Action == "hr.payroll-run.voucher-draft-generated");
    }

    private static async Task<string> ReadZipEntryAsync(ZipArchive archive, string entryName)
    {
        using var reader = new StreamReader(Assert.Single(archive.Entries, x => x.FullName == entryName).Open(), Encoding.UTF8);
        return await reader.ReadToEndAsync();
    }

    [Fact]
    public async Task Period_summary_is_tenant_admin_only_aggregate_and_csv_access_is_audited()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        const string period = "from=2026-10-20&to=2026-10-21";

        SetIdentity(client, TenantA, EmployeeUserA, "Employee");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/hr/period-summary?{period}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/hr/period-summary.csv?{period}")).StatusCode);

        SetIdentity(client, TenantA, Admin, "TenantAdmin");
        var summaryResponse = await client.GetAsync($"/api/hr/period-summary?{period}");
        Assert.Equal(HttpStatusCode.OK, summaryResponse.StatusCode);
        var summary = await summaryResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, summary.GetProperty("employeesAtPeriodEnd").GetInt32());
        Assert.Equal(2, summary.GetProperty("attendanceRecordCount").GetInt32());
        Assert.Equal(1, summary.GetProperty("employeesWithAttendance").GetInt32());
        Assert.Equal(900, summary.GetProperty("workedMinutes").GetInt64());
        Assert.Equal(0, summary.GetProperty("leaveRequestCount").GetInt32());

        var csvResponse = await client.GetAsync($"/api/hr/period-summary.csv?{period}");
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        Assert.Contains("text/csv", csvResponse.Content.Headers.ContentType!.ToString());
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("attendance_records,2", csv);
        Assert.DoesNotContain("Tenant A Employee", csv);
        Assert.DoesNotContain(EmployeeA.ToString(), csv);
        Assert.DoesNotContain("shift", csv);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Contains(db.AuditEvents, x => x.TenantId == TenantA && x.Action == "hr.period-summary.viewed");
        Assert.Contains(db.AuditEvents, x => x.TenantId == TenantA && x.Action == "hr.period-summary.exported");

        SetIdentity(client, TenantB, Admin, "TenantAdmin");
        var otherTenantSummary = await client.GetFromJsonAsync<JsonElement>($"/api/hr/period-summary?{period}");
        Assert.Equal(1, otherTenantSummary.GetProperty("employeesAtPeriodEnd").GetInt32());
        Assert.Equal(1, otherTenantSummary.GetProperty("attendanceRecordCount").GetInt32());
    }

    [Theory]
    [InlineData("2026-10-21", "2026-10-20")]
    [InlineData("2025-10-20", "2026-10-21")]
    public async Task Period_summary_requires_an_ordered_period_of_at_most_366_days(string from, string to)
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        var response = await client.GetAsync($"/api/hr/period-summary?from={from}&to={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static object EmployeeWrite(string code) => new
    {
        personnelCode = code, fullName = "New Employee", department = "Operations", jobTitle = "Operator",
        employmentCategory = "Office", workEmail = "new@example.test", hireDate = "2026-01-05", terminationDate = (string?)null, userId = (Guid?)null
    };

    private static AttendanceWriteRequest AttendanceWrite(Guid employeeId) =>
        new(employeeId, new DateOnly(2026, 10, 20), 480, 0, "shift");

    internal static void SetIdentity(HttpClient client, Guid tenantId, Guid userId, string role)
    {
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
    }

    internal static async Task<WebApplication> StartApplicationAsync(bool denyPayrollPermissions = false)
    {
        var databaseName = $"hr-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddSingleton<IPlatformPermissionAuthorizer>(denyPayrollPermissions
            ? new DenyHrPermissionAuthorizer()
            : new AllowHrPermissionAuthorizer());
        builder.Services.AddAuthentication("hr-test").AddScheme<AuthenticationSchemeOptions, HrTestAuthenticationHandler>("hr-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapHumanResourcesEndpoints();
        app.MapPayrollVoucherDraftEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        db.EmployeeRecords.AddRange(
            new EmployeeRecord { Id = EmployeeA, TenantId = TenantA, PersonnelCode = "A-001", FullName = "Tenant A Employee", UserId = EmployeeUserA, HireDate = new DateOnly(2024, 1, 1), RowVersion = new byte[8] },
            new EmployeeRecord { Id = Guid.Parse("15151515-1515-1515-1515-151515151515"), TenantId = TenantA, PersonnelCode = "A-002", FullName = "Unlinked Employee", HireDate = new DateOnly(2024, 2, 1) },
            new EmployeeRecord { Id = EmployeeB, TenantId = TenantB, PersonnelCode = "B-001", FullName = "Tenant B Employee", UserId = EmployeeUserB, HireDate = new DateOnly(2024, 1, 1) });
        db.EmployeeLeaveRequests.AddRange(
            new EmployeeLeaveRequest { Id = LeaveA, TenantId = TenantA, EmployeeId = EmployeeA, LeaveType = "Annual", StartDate = new DateOnly(2026, 12, 1), EndDate = new DateOnly(2026, 12, 2), RequestedDays = 2, RequestedByUserId = EmployeeUserA, RowVersion = new byte[8] },
            new EmployeeLeaveRequest { Id = LeaveB, TenantId = TenantB, EmployeeId = EmployeeB, LeaveType = "Annual", StartDate = new DateOnly(2026, 12, 1), EndDate = new DateOnly(2026, 12, 2), RequestedDays = 2, RequestedByUserId = EmployeeUserB, RowVersion = new byte[8] });
        db.EmployeeAttendanceRecords.AddRange(
            new EmployeeAttendanceRecord { Id = AttendanceA, TenantId = TenantA, EmployeeId = EmployeeA, WorkDate = new DateOnly(2026, 10, 20), WorkedMinutes = 480, RecordedByUserId = Admin, RowVersion = new byte[8] },
            new EmployeeAttendanceRecord { Id = AttendanceAOtherDay, TenantId = TenantA, EmployeeId = EmployeeA, WorkDate = new DateOnly(2026, 10, 21), WorkedMinutes = 420, RecordedByUserId = HrApprover, RowVersion = new byte[8] },
            new EmployeeAttendanceRecord { Id = AttendanceB, TenantId = TenantB, EmployeeId = EmployeeB, WorkDate = new DateOnly(2026, 10, 20), WorkedMinutes = 480, RecordedByUserId = Admin });
        await db.SaveChangesAsync();
        return app;
    }

    private sealed class AllowHrPermissionAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role,
            ResolvedPlatformPermission permission, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }

    private sealed class DenyHrPermissionAuthorizer : IPlatformPermissionAuthorizer
    {
        public Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role,
            ResolvedPlatformPermission permission, CancellationToken cancellationToken = default) => Task.FromResult(false);
    }

    private sealed class HrTestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Guid.TryParse(Request.Headers["X-Test-User"], out var id) ? id : Admin;
            var role = Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin";
            var claims = new[] { new Claim("tenant_id", tenantId.ToString()), new Claim("sub", userId.ToString()), new Claim("role", role) };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name)));
        }
    }
}
