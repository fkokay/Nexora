using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>
/// Limits ERP assistant access to the two existing, tenant-authorized HR read routes.
/// Results are reduced to period aggregates so names, employee IDs, notes and other
/// user-authored text never enter the model context.
/// </summary>
internal static class ERPAssistantHrTools
{
    private const int MaxApiRows = 500;
    private static readonly IReadOnlyDictionary<string, string> ReadPaths = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["get_hr_leave_summary"] = "/api/hr/leave-requests",
        ["get_hr_attendance_summary"] = "/api/hr/attendance"
    };

    public static async Task<bool> IsReadAllowedAsync(string toolName, Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (!ReadPaths.TryGetValue(toolName, out var path) ||
            !PlatformPermissionCatalog.TryResolve(path, "GET", path, new Dictionary<string, string?>(), tenantId, userId, role,
                out var permission) || permission is null || permission.Permission.Code != "erp.human-resources.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static bool TryValidatePeriod(string? fromText, string? toText, DateOnly today, out DateOnly from, out DateOnly to)
    {
        from = default;
        to = default;
        return DateOnly.TryParseExact(fromText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from)
            && DateOnly.TryParseExact(toText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to)
            && to >= from && to <= today && to.DayNumber - from.DayNumber <= 365;
    }

    public static string SummarizeLeaves(string json, DateOnly from, DateOnly to)
    {
        using var document = JsonDocument.Parse(json);
        var rows = GetRows(document.RootElement);
        var statuses = new Dictionary<string, (int Count, decimal Days)>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            if (!TryGetDate(row, "startDate", out var start) || !TryGetDate(row, "endDate", out var end) ||
                end < from || start > to || !TryGetDecimal(row, "requestedDays", out var days) || days is <= 0 or > 366)
                continue;

            var rawStatus = GetString(row, "status");
            var status = rawStatus is "Requested" or "Approved" or "Rejected" or "Cancelled" ? rawStatus : "Other";
            var current = statuses.GetValueOrDefault(status);
            statuses[status] = (current.Count + 1, current.Days + days);
        }

        var result = new
        {
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            to = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            matchingRequestCount = statuses.Values.Sum(x => x.Count),
            requestedDays = statuses.Values.Sum(x => x.Days),
            cappedAt500 = rows.Length == MaxApiRows,
            statuses = statuses.OrderBy(x => x.Key, StringComparer.Ordinal)
                .Select(x => new { status = x.Key, requestCount = x.Value.Count, requestedDays = x.Value.Days })
        };
        return JsonSerializer.Serialize(result);
    }

    public static string SummarizeAttendance(string json, DateOnly from, DateOnly to)
    {
        using var document = JsonDocument.Parse(json);
        var rows = GetRows(document.RootElement);
        var count = 0;
        long workedMinutes = 0;
        long overtimeMinutes = 0;
        foreach (var row in rows)
        {
            if (!TryGetDate(row, "workDate", out var date) || date < from || date > to ||
                !TryGetInt32(row, "workedMinutes", out var worked) || worked < 0 ||
                !TryGetInt32(row, "overtimeMinutes", out var overtime) || overtime < 0 || worked + overtime > 1440)
                continue;

            count++;
            workedMinutes += worked;
            overtimeMinutes += overtime;
        }

        return JsonSerializer.Serialize(new
        {
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            to = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            attendanceRecordCount = count,
            workedMinutes,
            overtimeMinutes,
            cappedAt500 = rows.Length == MaxApiRows
        });
    }

    private static JsonElement[] GetRows(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Array || root.GetArrayLength() > MaxApiRows)
            throw new JsonException("HR response exceeded the bounded result shape.");
        return root.EnumerateArray().ToArray();
    }

    private static bool TryGetDate(JsonElement row, string name, out DateOnly value) =>
        DateOnly.TryParseExact(GetString(row, name), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out value);

    private static string? GetString(JsonElement row, string name) =>
        row.ValueKind == JsonValueKind.Object && row.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;

    private static bool TryGetDecimal(JsonElement row, string name, out decimal value) =>
        row.ValueKind == JsonValueKind.Object && row.TryGetProperty(name, out var element)
            && element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out value)
            ? true : Fail(out value);

    private static bool TryGetInt32(JsonElement row, string name, out int value) =>
        row.ValueKind == JsonValueKind.Object && row.TryGetProperty(name, out var element)
            && element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out value)
            ? true : Fail(out value);

    private static bool Fail<T>(out T value)
    {
        value = default!;
        return false;
    }
}
