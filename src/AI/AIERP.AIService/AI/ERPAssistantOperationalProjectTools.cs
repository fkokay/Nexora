using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>Bounded project lookup for the read-only assistant; omits internal IDs, customer data, budgets, and notes.</summary>
internal static class ERPAssistantOperationalProjectTools
{
    private const string SearchPath = "/api/projects";
    private const int MaxResults = 10;

    public static bool TryValidateSearchTerm(string? value, out string term)
    {
        term = value?.Trim() ?? string.Empty;
        return term.Length is >= 2 and <= 100;
    }

    public static bool TryValidateProgressRequest(string? projectCode, string? fromValue, string? toValue,
        out string code, out DateOnly from, out DateOnly to)
    {
        code = projectCode?.Trim() ?? string.Empty;
        from = default;
        to = default;
        if (code.Length is < 2 or > 40 || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$") ||
            !DateOnly.TryParseExact(fromValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) ||
            !DateOnly.TryParseExact(toValue, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to))
            return false;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return from <= to && to <= today && from >= to.AddDays(-365);
    }

    public static async Task<bool> IsReadAllowedAsync(Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!PlatformPermissionCatalog.TryResolve(SearchPath, "GET", SearchPath,
                new Dictionary<string, string?>(), tenantId, userId, role, out var permission) ||
            permission is null || permission.Permission.Code != "erp.operational-projects.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static string SummarizeProjects(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("total", out var totalElement) || !totalElement.TryGetInt32(out var total) || total < 0 ||
            !response.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array ||
            items.GetArrayLength() > MaxResults || items.GetArrayLength() > total)
            throw new JsonException("Operational project search returned an invalid bounded result shape.");

        var projected = items.EnumerateArray().Select(item => new
        {
            code = RequiredString(item, "code", 100),
            name = RequiredString(item, "name", 200),
            status = RequiredString(item, "status", 40),
            startDate = OptionalDate(item, "startDate"),
            endDate = OptionalDate(item, "endDate"),
            taskCount = RequiredNonNegativeInt(item, "taskCount"),
            completedTaskCount = RequiredNonNegativeInt(item, "completedTaskCount"),
            overdueTaskCount = RequiredNonNegativeInt(item, "overdueTaskCount")
        }).ToArray();

        return JsonSerializer.Serialize(new { totalCount = total, returned = projected.Length, hasMore = total > projected.Length, items = projected });
    }

    public static string SummarizeProjectProgress(JsonElement response)
    {
        if (response.ValueKind != JsonValueKind.Object ||
            !response.TryGetProperty("projectCode", out var code) || code.ValueKind != JsonValueKind.String || code.GetString() is not { Length: > 0 and <= 40 } projectCode ||
            !response.TryGetProperty("projectName", out var name) || name.ValueKind != JsonValueKind.String || name.GetString() is not { Length: > 0 and <= 200 } projectName ||
            !response.TryGetProperty("status", out var status) || status.ValueKind != JsonValueKind.String || status.GetString() is not { Length: > 0 and <= 40 } projectStatus ||
            !TryReadDate(response, "from", out var from) || !TryReadDate(response, "to", out var to) || from > to || to > DateOnly.FromDateTime(DateTime.UtcNow) || from < to.AddDays(-365) ||
            !TryReadNonNegativeInt(response, "totalTaskCount", out var totalTasks) ||
            !TryReadNonNegativeInt(response, "completedTaskCount", out var completedTasks) || completedTasks > totalTasks ||
            !TryReadNonNegativeInt(response, "overdueOpenTaskCount", out var overdueTasks) || overdueTasks > totalTasks ||
            !TryReadNonNegativeDecimal(response, "periodActualHours", out var periodHours) ||
            !TryReadNonNegativeInt(response, "periodTimeEntryCount", out var periodEntries) ||
            !response.TryGetProperty("hasMoreTasks", out var hasMore) || hasMore.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
            !response.TryGetProperty("tasks", out var tasks) || tasks.ValueKind != JsonValueKind.Array || tasks.GetArrayLength() > 10 || tasks.GetArrayLength() > totalTasks)
            throw new JsonException("Operational project progress returned an invalid bounded result shape.");

        var projected = tasks.EnumerateArray().Select(task => new
        {
            code = RequiredString(task, "code", 40),
            name = RequiredString(task, "name", 200),
            status = RequiredString(task, "status", 40),
            startDate = OptionalDate(task, "startDate"),
            endDate = OptionalDate(task, "endDate"),
            plannedHours = RequiredNonNegativeDecimal(task, "plannedHours"),
            actualHours = RequiredNonNegativeDecimal(task, "actualHours"),
            timeEntryCount = RequiredNonNegativeInt(task, "timeEntryCount")
        }).ToArray();

        return JsonSerializer.Serialize(new
        {
            projectCode, projectName, status = projectStatus,
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), to = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            totalTaskCount = totalTasks, completedTaskCount = completedTasks, overdueOpenTaskCount = overdueTasks,
            periodActualHours = periodHours, periodTimeEntryCount = periodEntries,
            hasMoreTasks = hasMore.GetBoolean(), tasks = projected
        });
    }

    private static string RequiredString(JsonElement item, string property, int maxLength) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text && text.Length <= maxLength
            ? text : throw new JsonException($"Operational project search omitted or invalidated {property}.");

    private static string? OptionalDate(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            throw new JsonException($"Operational project search omitted {property}.");
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : throw new JsonException($"Operational project search invalidated {property}.");
    }

    private static int RequiredNonNegativeInt(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) && number >= 0
            ? number : throw new JsonException($"Operational project search omitted or invalidated {property}.");

    private static decimal RequiredNonNegativeDecimal(JsonElement item, string property) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) && number >= 0
            ? number : throw new JsonException($"Operational project progress omitted or invalidated {property}.");

    private static bool TryReadNonNegativeInt(JsonElement item, string property, out int value)
    {
        value = 0;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out value) && value >= 0;
    }

    private static bool TryReadNonNegativeDecimal(JsonElement item, string property, out decimal value)
    {
        value = 0;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out value) && value >= 0;
    }

    private static bool TryReadDate(JsonElement item, string property, out DateOnly value)
    {
        value = default;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property, out var element) &&
            element.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(element.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);
    }
}
