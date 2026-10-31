using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class OperationalProjectEndpointsIntegrationTests
{
    [Fact]
    public async Task Assistant_project_summary_is_tenant_scoped_bounded_and_hides_other_users_time_from_non_admins()
    {
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var taskId = Guid.NewGuid();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = today.AddDays(-6);
        var database = $"project-assistant-summary-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(database));
        builder.Services.AddAuthentication("project-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("project-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapOperationalProjectEndpoints();
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(
                new Tenant { Id = tenantA, Name = "Project A", Slug = $"project-a-{tenantA:N}" },
                new Tenant { Id = tenantB, Name = "Project B", Slug = $"project-b-{tenantB:N}" });
            db.OperationalProjects.Add(new OperationalProject
            {
                Id = projectId, TenantId = tenantA, Code = "SAFE-1", Name = "Synthetic rollout", Status = OperationalProjectStatus.Active,
                BudgetAmount = 999999m, Notes = "private project note", CreatedByUserId = userA, UpdatedByUserId = userA
            });
            db.OperationalProjectTasks.Add(new OperationalProjectTask
            {
                Id = taskId, TenantId = tenantA, ProjectId = projectId, Code = "TASK-1", Name = "Synthetic task", Status = ProjectTaskStatus.InProgress,
                PlannedHours = 10m, EndDate = today.AddDays(-1), CreatedByUserId = userA
            });
            db.OperationalProjectTimeEntries.AddRange(
                new OperationalProjectTimeEntry { TenantId = tenantA, ProjectId = projectId, TaskId = taskId, UserId = userA, WorkDate = today, Hours = 2m, Description = "private user A note" },
                new OperationalProjectTimeEntry { TenantId = tenantA, ProjectId = projectId, TaskId = taskId, UserId = userB, WorkDate = today, Hours = 3m, Description = "private user B note" },
                new OperationalProjectTimeEntry { TenantId = tenantA, ProjectId = projectId, TaskId = taskId, UserId = userA, WorkDate = today.AddDays(-20), Hours = 7m, Description = "outside selected window" });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userA.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        var path = $"/api/projects/assistant-summary?projectCode=SAFE-1&from={from:yyyy-MM-dd}&to={today:yyyy-MM-dd}";
        var userResponse = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, userResponse.StatusCode);
        var userJson = await userResponse.Content.ReadAsStringAsync();
        using (var userSummary = JsonDocument.Parse(userJson))
        {
            var root = userSummary.RootElement;
            Assert.Equal("SAFE-1", root.GetProperty("projectCode").GetString());
            Assert.Equal(2m, root.GetProperty("periodActualHours").GetDecimal());
            Assert.Equal(1, root.GetProperty("periodTimeEntryCount").GetInt32());
            Assert.Equal(1, root.GetProperty("overdueOpenTaskCount").GetInt32());
            Assert.DoesNotContain("private", userJson, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("userId", userJson, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("budgetAmount", userJson, StringComparison.OrdinalIgnoreCase);
        }

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var adminSummary = await client.GetFromJsonAsync<JsonElement>(path);
        Assert.Equal(5m, adminSummary.GetProperty("periodActualHours").GetDecimal());
        Assert.Equal(2, adminSummary.GetProperty("periodTimeEntryCount").GetInt32());

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/projects/assistant-summary?projectCode=SAFE-1&from={today.AddDays(-366):yyyy-MM-dd}&to={today:yyyy-MM-dd}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/projects/assistant-summary?projectCode=SAFE-1&from={today:yyyy-MM-dd}&to={today.AddDays(1):yyyy-MM-dd}")).StatusCode);
    }

    [Fact]
    public async Task Project_register_tasks_and_resource_allocations_are_audited_and_tenant_scoped()
    {
        var tenantA = Guid.NewGuid(); var tenantB = Guid.NewGuid(); var database = $"operational-projects-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(database));
        builder.Services.AddAuthentication("project-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("project-test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapOperationalProjectEndpoints(); await app.StartAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(new Tenant { Id = tenantA, Name = "Project A", Slug = $"project-a-{tenantA:N}" }, new Tenant { Id = tenantB, Name = "Project B", Slug = $"project-b-{tenantB:N}" });
            await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        var invalid = await client.PostAsJsonAsync("/api/projects", new { code = "BAD SPACE", name = "Invalid", budgetAmount = 1, currencyCode = "TRY" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var created = await client.PostAsJsonAsync("/api/projects", new { code = "ERP-1", name = "Internal rollout", startDate = "2026-10-01", endDate = "2026-12-01", budgetAmount = 12000.50m, currencyCode = "TRY", notes = "synthetic test" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdJson = JsonDocument.Parse(await created.Content.ReadAsStringAsync()); var id = createdJson.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Draft", createdJson.RootElement.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/projects", new { code = "ERP-1", name = "Duplicate", budgetAmount = 0, currencyCode = "TRY" })).StatusCode);
        var taskResponse = await client.PostAsJsonAsync($"/api/projects/{id}/tasks", new { code = "ANALYSIS", name = "Requirements", startDate = "2026-10-02", endDate = "2026-10-04", plannedHours = 12.5m });
        Assert.Equal(HttpStatusCode.Created, taskResponse.StatusCode);
        using var taskJson = JsonDocument.Parse(await taskResponse.Content.ReadAsStringAsync()); var taskId = taskJson.RootElement.GetProperty("id").GetGuid();
        var workflowId = Guid.NewGuid(); var ruleId = Guid.NewGuid();
        await using (var setupScope = app.Services.CreateAsyncScope())
        {
            var db = setupScope.ServiceProvider.GetRequiredService<TenantDbContext>();
            db.TenantWorkflowDefinitions.Add(new TenantWorkflowDefinition
            {
                Id = workflowId, TenantId = tenantA, Code = "project-task-review", Name = "Project task review", Version = 1,
                Status = "Published", StepsJson = "[{\"name\":\"Review\",\"approverRole\":\"TenantAdmin\"}]"
            });
            db.TenantBusinessRuleDefinitions.Add(new TenantBusinessRuleDefinition
            {
                Id = ruleId, TenantId = tenantA, Code = "large-task-review", Name = "Review larger tasks",
                Trigger = "project.task-completed", Status = "Published", WorkflowCode = "project-task-review",
                ConditionsJson = "[{\"field\":\"plannedHours\",\"operator\":\"GreaterThanOrEqual\",\"value\":\"8\"}]"
            });
            await db.SaveChangesAsync();
        }
        var badAllocation = await client.PostAsJsonAsync($"/api/projects/{id}/resources", new { taskId, plannedHours = 4, plannedHourlyCost = 50, currencyCode = "TRY" });
        Assert.Equal(HttpStatusCode.BadRequest, badAllocation.StatusCode);
        var allocation = await client.PostAsJsonAsync($"/api/projects/{id}/resources", new { taskId, resourceName = "Consultant 1", plannedHours = 4m, plannedHourlyCost = 50m, currencyCode = "TRY", notes = "planned" });
        Assert.Equal(HttpStatusCode.Created, allocation.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/projects/{id}/status", new { status = "Active" })).StatusCode);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var timeResponse = await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { taskId = (Guid?)null, workDate = today, hours = 1.25m, description = "Implementation" });
        Assert.Equal(HttpStatusCode.Created, timeResponse.StatusCode);
        using var timeJson = JsonDocument.Parse(await timeResponse.Content.ReadAsStringAsync());
        Assert.Equal(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), timeJson.RootElement.GetProperty("userId").GetGuid());
        Assert.Equal(1.25m, timeJson.RootElement.GetProperty("hours").GetDecimal());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { workDate = today, hours = 23m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { workDate = today.AddDays(1), hours = 1m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { workDate = today, hours = 0.3m })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { hours = 1m })).StatusCode);
        var detail = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{id}");
        Assert.Equal(1, detail.GetProperty("timeEntries").GetArrayLength());
        var secondUser = Guid.NewGuid();
        client.DefaultRequestHeaders.Add("X-Test-User", secondUser.ToString("D"));
        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/projects", new { code = "USER-1", name = "Not allowed", budgetAmount = 0, currencyCode = "TRY" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { workDate = today, hours = 0.5m })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { taskId, workDate = new DateOnly(2026, 10, 3), hours = 0.5m })).StatusCode);
        var ownDetail = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{id}");
        Assert.Equal(2, ownDetail.GetProperty("timeEntries").GetArrayLength());
        Assert.Equal(secondUser, ownDetail.GetProperty("timeEntries")[0].GetProperty("userId").GetGuid());
        var ownProjectList = await client.GetFromJsonAsync<JsonElement>("/api/projects?page=1&pageSize=20&timeEntryDays=7");
        Assert.Equal(1m, ownProjectList.GetProperty("items")[0].GetProperty("actualHours").GetDecimal());
        Assert.Equal(2, ownProjectList.GetProperty("items")[0].GetProperty("timeEntryCount").GetInt32());
        var ownDashboard = await client.GetFromJsonAsync<JsonElement>("/api/projects/dashboard-summary?timeEntryDays=7");
        Assert.Equal(0.5m, ownDashboard.GetProperty("timeEntryHours").GetDecimal());
        Assert.Equal(1, ownDashboard.GetProperty("timeEntryCount").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/projects/{id}/tasks/{taskId}/status", new { status = "InProgress" })).StatusCode);
        var ownReport = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{id}/cost-summary");
        Assert.Equal(1m, ownReport.GetProperty("actualHours").GetDecimal());
        Assert.Equal(2, ownReport.GetProperty("actualTimeEntryCount").GetInt32());
        Assert.Equal(JsonValueKind.Null, ownReport.GetProperty("actualLaborCost").ValueKind);
        Assert.Equal(0.5m, ownReport.GetProperty("unpricedActualHours").GetDecimal());
        Assert.Equal(1, ownReport.GetProperty("plannedRateEstimates").GetArrayLength());
        Assert.Equal(25m, ownReport.GetProperty("plannedRateEstimates")[0].GetProperty("estimatedCost").GetDecimal());
        Assert.Equal("TRY", ownReport.GetProperty("plannedRateEstimates")[0].GetProperty("currencyCode").GetString());
        Assert.Equal(200m, ownReport.GetProperty("plannedCosts")[0].GetProperty("plannedCost").GetDecimal());
        Assert.Equal("TRY", ownReport.GetProperty("plannedCosts")[0].GetProperty("currencyCode").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-User"); client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var overdueProjects = await client.GetFromJsonAsync<JsonElement>("/api/projects?page=1&pageSize=20&overdueOnly=true&status=Active");
        Assert.Equal(1, overdueProjects.GetProperty("total").GetInt32());
        Assert.Equal(1, overdueProjects.GetProperty("items")[0].GetProperty("overdueTaskCount").GetInt32());
        Assert.Equal(0, overdueProjects.GetProperty("items")[0].GetProperty("completedTaskCount").GetInt32());
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>("/api/projects?page=1&pageSize=20&upcomingWithinDays=90")).GetProperty("total").GetInt32());
        Assert.Equal(0, (await client.GetFromJsonAsync<JsonElement>("/api/projects?page=1&pageSize=20&taskCompletion=all-complete")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/projects?page=1&pageSize=20&upcomingWithinDays=999")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/projects/{id}/tasks/{taskId}/status", new { status = "InProgress" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/projects/{id}/tasks/{taskId}/status", new { status = "Completed" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/projects/{id}/tasks/{taskId}/status", new { status = "Completed" })).StatusCode);
        Assert.Equal(1, (await client.GetFromJsonAsync<JsonElement>("/api/projects?page=1&pageSize=20&taskCompletion=all-complete")).GetProperty("total").GetInt32());
        var adminReport = await client.GetFromJsonAsync<JsonElement>($"/api/projects/{id}/cost-summary");
        Assert.Equal(2.25m, adminReport.GetProperty("actualHours").GetDecimal());
        Assert.Equal(3, adminReport.GetProperty("actualTimeEntryCount").GetInt32());
        Assert.Equal(1.75m, adminReport.GetProperty("unpricedActualHours").GetDecimal());
        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/projects/{id}/time-entries", new { workDate = today, hours = 0.25m })).StatusCode);
        var otherTenantList = await client.GetFromJsonAsync<JsonElement>("/api/projects?page=1&pageSize=20");
        Assert.Equal(0, otherTenantList.GetProperty("total").GetInt32());
        Assert.Equal(0, (await client.GetFromJsonAsync<JsonElement>("/api/projects/dashboard-summary")).GetProperty("projectCount").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{id}/cost-summary")).StatusCode);

        await using var verifyScope = app.Services.CreateAsyncScope(); var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(1, await verifyDb.OperationalProjects.CountAsync(x => x.TenantId == tenantA));
        Assert.Equal(1, await verifyDb.OperationalProjectTasks.CountAsync(x => x.TenantId == tenantA && x.ProjectId == id));
        Assert.Equal(1, await verifyDb.OperationalProjectResourceAllocations.CountAsync(x => x.TenantId == tenantA && x.ProjectId == id));
        Assert.Equal(3, await verifyDb.OperationalProjectTimeEntries.CountAsync(x => x.TenantId == tenantA && x.ProjectId == id));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantA && x.Action == "project.created"));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantA && x.Action == "project.task.created"));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantA && x.Action == "project.task-status-changed"));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantA && x.Action == "project.resource-allocated"));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantA && x.Action == "project.time-recorded"));
        Assert.True(await verifyDb.AuditEvents.AnyAsync(x => x.TenantId == tenantA && x.Action == "project.status-changed"));
        var evaluation = await verifyDb.TenantBusinessRuleEvaluations.SingleAsync(x => x.TenantId == tenantA && x.RuleId == ruleId);
        Assert.True(evaluation.Matched);
        Assert.NotNull(evaluation.WorkflowInstanceId);
        var workflowInstance = await verifyDb.TenantWorkflowInstances.SingleAsync(x => x.TenantId == tenantA && x.Id == evaluation.WorkflowInstanceId);
        Assert.Equal("OperationalProjectTask", workflowInstance.SubjectType);
        Assert.Equal(taskId, workflowInstance.SubjectId);
        Assert.Equal("Pending", workflowInstance.Status);
        Assert.Contains("project.task-completed", TenantBusinessRuleEngine.SupportedTriggers.Select(x => x.Code));
    }
}
