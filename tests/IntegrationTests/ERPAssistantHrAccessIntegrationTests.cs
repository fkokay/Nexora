using System.Net.Http.Json;
using System.Text.Json;
using AIERP.AIService.AI;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ERPAssistantHrAccessIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid EmployeeUser = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static readonly Guid InactiveUser = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private static readonly Guid TenantBUser = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private static readonly Guid UnpermittedUser = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private static readonly Guid AdminUser = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Theory]
    [InlineData("get_hr_leave_summary")]
    [InlineData("get_hr_attendance_summary")]
    public async Task Hr_tool_permission_uses_active_tenant_membership_and_hr_read_grant(string toolName)
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"assistant-hr-access-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        var tenantA = new Tenant { Id = TenantA, Name = "Synthetic Tenant A", Slug = "synthetic-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Synthetic Tenant B", Slug = "synthetic-b" };
        var employee = new AppUser { Id = EmployeeUser, Email = "employee@example.test" };
        var inactive = new AppUser { Id = InactiveUser, Email = "inactive@example.test", IsActive = false };
        var tenantBEmployee = new AppUser { Id = TenantBUser, Email = "tenant-b@example.test" };
        var unpermitted = new AppUser { Id = UnpermittedUser, Email = "unpermitted@example.test" };
        var admin = new AppUser { Id = AdminUser, Email = "admin@example.test" };
        db.Tenants.AddRange(tenantA, tenantB);
        db.Users.AddRange(employee, inactive, tenantBEmployee, unpermitted, admin);
        db.TenantMemberships.AddRange(
            Membership(tenantA, employee, "Employee"),
            Membership(tenantA, inactive, "Employee"),
            Membership(tenantB, tenantBEmployee, "Employee"),
            Membership(tenantA, unpermitted, "Unpermitted"),
            Membership(tenantA, admin, "TenantAdmin"));
        var permission = new PermissionDefinition
        {
            Code = "erp.human-resources.read", ResourceType = "erp.human-resources", Action = "read",
            Description = "Synthetic HR read permission"
        };
        db.PermissionDefinitions.Add(permission);
        db.TenantPermissionRules.AddRange(
            AllowEmployee(tenantA, permission),
            AllowEmployee(tenantB, permission));
        await db.SaveChangesAsync();

        var authorizer = new PlatformPermissionAuthorizer(db);
        Assert.True(await ERPAssistantHrTools.IsReadAllowedAsync(toolName, TenantA, EmployeeUser, "Employee", authorizer, CancellationToken.None));
        Assert.True(await ERPAssistantHrTools.IsReadAllowedAsync(toolName, TenantA, AdminUser, "TenantAdmin", authorizer, CancellationToken.None));
        Assert.False(await ERPAssistantHrTools.IsReadAllowedAsync(toolName, TenantA, InactiveUser, "Employee", authorizer, CancellationToken.None));
        Assert.False(await ERPAssistantHrTools.IsReadAllowedAsync(toolName, TenantA, UnpermittedUser, "Unpermitted", authorizer, CancellationToken.None));
        Assert.False(await ERPAssistantHrTools.IsReadAllowedAsync(toolName, TenantA, TenantBUser, "Employee", authorizer, CancellationToken.None));
    }

    [Fact]
    public async Task Hr_ai_summaries_only_include_api_rows_visible_to_employee_and_omit_pii()
    {
        await using var app = await HumanResourcesEndpointsIntegrationTests.StartApplicationAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.EmployeeLeaveRequests.Add(new EmployeeLeaveRequest
            {
                Id = Guid.Parse("31313131-3131-3131-3131-313131313131"), TenantId = TenantA,
                EmployeeId = Guid.Parse("15151515-1515-1515-1515-151515151515"), LeaveType = "Annual",
                StartDate = new DateOnly(2026, 12, 3), EndDate = new DateOnly(2026, 12, 3), RequestedDays = 1,
                Note = "SYNTHETIC PRIVATE LEAVE NOTE", Status = EmployeeLeaveStatus.Requested
            });
            db.EmployeeAttendanceRecords.Add(new EmployeeAttendanceRecord
            {
                Id = Guid.Parse("32323232-3232-3232-3232-323232323232"), TenantId = TenantA,
                EmployeeId = Guid.Parse("15151515-1515-1515-1515-151515151515"), WorkDate = new DateOnly(2026, 10, 20),
                WorkedMinutes = 300, OvertimeMinutes = 20, Note = "SYNTHETIC PRIVATE ATTENDANCE NOTE"
            });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        HumanResourcesEndpointsIntegrationTests.SetIdentity(client, TenantA, EmployeeUser, "Employee");
        var employeeLeaves = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/");
        var employeeAttendance = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/?from=2026-10-20&to=2026-10-21");
        Assert.Single(employeeLeaves!);
        Assert.Equal(2, employeeAttendance!.Length);

        var from = new DateOnly(2026, 10, 20);
        var to = new DateOnly(2026, 12, 3);
        var leaveSummary = ERPAssistantHrTools.SummarizeLeaves(JsonSerializer.Serialize(employeeLeaves), from, to);
        var attendanceSummary = ERPAssistantHrTools.SummarizeAttendance(JsonSerializer.Serialize(employeeAttendance), from, new DateOnly(2026, 10, 21));
        Assert.Contains("\"matchingRequestCount\":1", leaveSummary, StringComparison.Ordinal);
        Assert.Contains("\"attendanceRecordCount\":2", attendanceSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("employeeId", leaveSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("employeeId", attendanceSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("dddddddd-dddd-dddd-dddd-dddddddddddd", leaveSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("dddddddd-dddd-dddd-dddd-dddddddddddd", attendanceSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", leaveSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", attendanceSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("Tenant A Employee", leaveSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("Tenant A Employee", attendanceSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("SYNTHETIC PRIVATE", leaveSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("SYNTHETIC PRIVATE", attendanceSummary, StringComparison.Ordinal);

        HumanResourcesEndpointsIntegrationTests.SetIdentity(client, TenantA, AdminUser, "TenantAdmin");
        var adminLeaves = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/leave-requests/");
        var adminAttendance = await client.GetFromJsonAsync<JsonElement[]>("/api/hr/attendance/?from=2026-10-20&to=2026-10-21");
        Assert.Equal(2, adminLeaves!.Length);
        Assert.Equal(3, adminAttendance!.Length);
        var adminLeaveSummary = ERPAssistantHrTools.SummarizeLeaves(JsonSerializer.Serialize(adminLeaves), from, to);
        var adminAttendanceSummary = ERPAssistantHrTools.SummarizeAttendance(JsonSerializer.Serialize(adminAttendance), from, new DateOnly(2026, 10, 21));
        Assert.Contains("\"matchingRequestCount\":2", adminLeaveSummary, StringComparison.Ordinal);
        Assert.Contains("\"attendanceRecordCount\":3", adminAttendanceSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("SYNTHETIC PRIVATE", adminLeaveSummary, StringComparison.Ordinal);
        Assert.DoesNotContain("SYNTHETIC PRIVATE", adminAttendanceSummary, StringComparison.Ordinal);
    }

    private static TenantMembership Membership(Tenant tenant, AppUser user, string role) =>
        new() { Tenant = tenant, User = user, TenantId = tenant.Id, UserId = user.Id, Role = role };

    private static TenantPermissionRule AllowEmployee(Tenant tenant, PermissionDefinition permission) =>
        new()
        {
            Tenant = tenant, TenantId = tenant.Id, SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "Employee", Permission = permission, PermissionCode = permission.Code,
            Effect = TenantPermissionEffect.Allow
        };
}
