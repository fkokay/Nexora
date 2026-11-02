using System.Globalization;
using System.Text.Json;
using AIERP.Platform.Application;

namespace AIERP.AIService.AI;

/// <summary>
/// Limits ERP assistant access to tenant-authorized HR reads. Leave/attendance are
/// aggregated; confidential compensation is separately permission-gated and reduced
/// to an employee/date-scoped set of fields with internal metadata removed.
/// </summary>
internal static class ERPAssistantHrTools
{
    private const int MaxApiRows = 500;
    private static readonly IReadOnlyDictionary<string, string> ReadPaths = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["get_hr_leave_summary"] = "/api/hr/leave-requests",
        ["get_hr_attendance_summary"] = "/api/hr/attendance"
    };

    private const string CompensationTool = "search_payroll_compensation";
    private const string CompensationPath = "/api/hr/payroll/compensation";

    public static async Task<bool> IsReadAllowedAsync(string toolName, Guid tenantId, Guid userId, string role,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        if (toolName == CompensationTool)
        {
            if (!PlatformPermissionCatalog.TryResolve(CompensationPath, "GET", CompensationPath,
                    new Dictionary<string, string?>(), tenantId, userId, role, out var compensationPermission) ||
                compensationPermission is null || compensationPermission.Permission.Code != "erp.payroll-compensation.view")
                return false;

            return await authorizer.IsAllowedAsync(tenantId, userId, role, compensationPermission, cancellationToken);
        }

        if (!ReadPaths.TryGetValue(toolName, out var path) ||
            !PlatformPermissionCatalog.TryResolve(path, "GET", path, new Dictionary<string, string?>(), tenantId, userId, role,
                out var permission) || permission is null || permission.Permission.Code != "erp.human-resources.read")
            return false;

        return await authorizer.IsAllowedAsync(tenantId, userId, role, permission, cancellationToken);
    }

    public static bool TryValidateCompensationSearch(string? termText, string? fromText, string? toText, DateOnly today,
        out string term, out DateOnly from, out DateOnly to)
    {
        term = termText?.Trim() ?? string.Empty;
        from = default;
        to = default;
        return term.Length is >= 2 and <= 100 &&
            TryValidatePeriod(fromText, toText, today, out from, out to);
    }

    public static string SummarizeCompensation(string json, string term, DateOnly from, DateOnly to)
    {
        using var document = JsonDocument.Parse(json);
        var rows = GetRows(document.RootElement);
        var matches = new List<object>();
        foreach (var row in rows)
        {
            var employee = GetString(row, "employee");
            if (employee is null || !employee.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                !TryGetDate(row, "effectiveFrom", out var effectiveFrom) || effectiveFrom < from || effectiveFrom > to ||
                !TryGetDecimal(row, "amount", out var amount) || amount < 0 ||
                !TryGetStringValue(row, "targetKind", out var targetKind) || targetKind is not ("Gross" or "Net") ||
                !TryGetStringValue(row, "currencyCode", out var currencyCode) || currencyCode.Length != 3 ||
                !TryGetStringValue(row, "payBasisCode", out var payBasisCode) ||
                !TryGetStringValue(row, "status", out var status))
                continue;

            matches.Add(new
            {
                employee,
                targetKind,
                amount,
                currencyCode,
                payBasisCode,
                effectiveFrom = effectiveFrom.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                status
            });
        }

        return JsonSerializer.Serialize(new
        {
            searchTerm = term,
            from = from.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            to = to.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            returned = Math.Min(matches.Count, 20),
            cappedAt500 = rows.Length == MaxApiRows,
            items = matches.Take(20)
        });
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

    private static bool TryGetStringValue(JsonElement row, string name, out string value)
    {
        value = GetString(row, name) ?? string.Empty;
        return value.Length is > 0 and <= 100;
    }

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
