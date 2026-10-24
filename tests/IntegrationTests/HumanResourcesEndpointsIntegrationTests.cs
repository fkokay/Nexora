using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/hr/employees/", EmployeeWrite("E-NEW"))).StatusCode);
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
            personnelCode = "A-001", fullName = "Updated Employee", department = "Finance", jobTitle = "Analyst",
            workEmail = "updated@example.test", hireDate = "2024-01-01", terminationDate = "2026-10-21",
            userId = EmployeeUserA, rowVersion = employee.GetProperty("rowVersion").GetString()
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Updated Employee", updated.GetProperty("fullName").GetString());
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
    public async Task Leave_and_attendance_dates_must_fall_inside_employment_window_including_boundaries()
    {
        await using var app = await StartApplicationAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.EmployeeRecords.Add(new EmployeeRecord { Id = EmploymentWindowEmployee, TenantId = TenantA, PersonnelCode = "A-003",
                FullName = "Employment Window Employee", HireDate = new DateOnly(2026, 10, 20), TerminationDate = new DateOnly(2026, 10, 22) });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        SetIdentity(client, TenantA, Admin, "TenantAdmin");

        using var leaveBeforeHire = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmploymentWindowEmployee, leaveType = "Annual", startDate = "2026-10-19", endDate = "2026-10-20", requestedDays = 2m
        });
        Assert.Equal(HttpStatusCode.BadRequest, leaveBeforeHire.StatusCode);
        using var leaveAfterTermination = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmploymentWindowEmployee, leaveType = "Annual", startDate = "2026-10-22", endDate = "2026-10-23", requestedDays = 2m
        });
        Assert.Equal(HttpStatusCode.BadRequest, leaveAfterTermination.StatusCode);
        using var leaveOnBoundaries = await client.PostAsJsonAsync("/api/hr/leave-requests/", new
        {
            employeeId = EmploymentWindowEmployee, leaveType = "Annual", startDate = "2026-10-20", endDate = "2026-10-22", requestedDays = 3m
        });
        Assert.Equal(HttpStatusCode.Created, leaveOnBoundaries.StatusCode);

        using var attendanceBeforeHire = await client.PostAsJsonAsync("/api/hr/attendance/",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = new DateOnly(2026, 10, 19) });
        Assert.Equal(HttpStatusCode.BadRequest, attendanceBeforeHire.StatusCode);
        using var attendanceAfterTermination = await client.PostAsJsonAsync("/api/hr/attendance/",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = new DateOnly(2026, 10, 23) });
        Assert.Equal(HttpStatusCode.BadRequest, attendanceAfterTermination.StatusCode);
        using var attendanceOnBoundary = await client.PostAsJsonAsync("/api/hr/attendance/",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = new DateOnly(2026, 10, 22) });
        Assert.Equal(HttpStatusCode.Created, attendanceOnBoundary.StatusCode);
        var attendanceId = (await attendanceOnBoundary.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var version = (await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/"))!
            .Single(x => x.GetProperty("id").GetGuid() == attendanceId).GetProperty("rowVersion").GetString();
        using var correctionAfterTermination = await client.PutAsJsonAsync($"/api/hr/attendance/{attendanceId}",
            AttendanceWrite(EmploymentWindowEmployee) with { WorkDate = new DateOnly(2026, 10, 23), RowVersion = version });
        Assert.Equal(HttpStatusCode.BadRequest, correctionAfterTermination.StatusCode);
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
        workEmail = "new@example.test", hireDate = "2026-01-05", terminationDate = (string?)null, userId = (Guid?)null
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

    internal static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"hr-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("hr-test").AddScheme<AuthenticationSchemeOptions, HrTestAuthenticationHandler>("hr-test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapHumanResourcesEndpoints();
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
            new EmployeeLeaveRequest { Id = LeaveA, TenantId = TenantA, EmployeeId = EmployeeA, LeaveType = "Annual", StartDate = new DateOnly(2026, 12, 1), EndDate = new DateOnly(2026, 12, 2), RequestedDays = 2, RequestedByUserId = EmployeeUserA },
            new EmployeeLeaveRequest { Id = LeaveB, TenantId = TenantB, EmployeeId = EmployeeB, LeaveType = "Annual", StartDate = new DateOnly(2026, 12, 1), EndDate = new DateOnly(2026, 12, 2), RequestedDays = 2, RequestedByUserId = EmployeeUserB });
        db.EmployeeAttendanceRecords.AddRange(
            new EmployeeAttendanceRecord { Id = AttendanceA, TenantId = TenantA, EmployeeId = EmployeeA, WorkDate = new DateOnly(2026, 10, 20), WorkedMinutes = 480, RecordedByUserId = Admin },
            new EmployeeAttendanceRecord { Id = AttendanceAOtherDay, TenantId = TenantA, EmployeeId = EmployeeA, WorkDate = new DateOnly(2026, 10, 21), WorkedMinutes = 420, RecordedByUserId = Admin },
            new EmployeeAttendanceRecord { Id = AttendanceB, TenantId = TenantB, EmployeeId = EmployeeB, WorkDate = new DateOnly(2026, 10, 20), WorkedMinutes = 480, RecordedByUserId = Admin });
        await db.SaveChangesAsync();
        return app;
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
