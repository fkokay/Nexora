using System.Globalization;
using System.Text.Json;

internal sealed class PayrollWorkCalendarSchedule
{
    private static readonly string[] WeekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    private readonly IReadOnlyDictionary<DayOfWeek, int> weeklyMinutes;
    private readonly IReadOnlyDictionary<DateOnly, int> dateOverrides;

    private PayrollWorkCalendarSchedule(IReadOnlyDictionary<DayOfWeek, int> weeklyMinutes,
        IReadOnlyDictionary<DateOnly, int> dateOverrides)
    {
        this.weeklyMinutes = weeklyMinutes;
        this.dateOverrides = dateOverrides;
    }

    public int ExpectedMinutes(DateOnly date) => dateOverrides.TryGetValue(date, out var minutes)
        ? minutes
        : weeklyMinutes[date.DayOfWeek];

    public static bool TryParse(string weeklyMinutesJson, string dateOverridesJson, DateOnly effectiveFrom,
        out PayrollWorkCalendarSchedule? schedule, out string? error)
    {
        schedule = null;
        error = null;
        try
        {
            using var weeklyDocument = JsonDocument.Parse(weeklyMinutesJson);
            using var overridesDocument = JsonDocument.Parse(dateOverridesJson);
            var weekly = weeklyDocument.RootElement;
            var overrides = overridesDocument.RootElement;
            if (!PayrollParameterSetValidator.TryValidateUniquePropertyNames(weekly, out _) ||
                !PayrollParameterSetValidator.TryValidateUniquePropertyNames(overrides, out _))
                return Fail("Takvim JSON nesnelerinde yinelenen alan adları olamaz.", out schedule, out error);
            if (weekly.ValueKind != JsonValueKind.Object || weekly.EnumerateObject().Count() != 7)
                return Fail("Haftalık takvim yedi günün tamamını içermelidir.", out schedule, out error);

            var dailyMinutes = new Dictionary<DayOfWeek, int>();
            foreach (var name in WeekdayNames)
            {
                if (!weekly.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Number ||
                    !value.TryGetInt32(out var minutes) || minutes is < 0 or > 1440)
                    return Fail($"'{name}' beklenen dakikası 0–1440 arasında tamsayı olmalıdır.", out schedule, out error);
                dailyMinutes.Add(Enum.Parse<DayOfWeek>(name, ignoreCase: false), minutes);
            }

            if (overrides.ValueKind != JsonValueKind.Array || overrides.GetArrayLength() > 512)
                return Fail("Tarih istisnaları en fazla 512 kayıtlı bir JSON dizisi olmalıdır.", out schedule, out error);
            var datedMinutes = new Dictionary<DateOnly, int>();
            foreach (var item in overrides.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object ||
                    !item.TryGetProperty("date", out var dateNode) || dateNode.ValueKind != JsonValueKind.String ||
                    !DateOnly.TryParseExact(dateNode.GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                    date < effectiveFrom || !item.TryGetProperty("expectedMinutes", out var minutesNode) || minutesNode.ValueKind != JsonValueKind.Number ||
                    !minutesNode.TryGetInt32(out var expectedMinutes) || expectedMinutes is < 0 or > 1440 ||
                    !datedMinutes.TryAdd(date, expectedMinutes))
                    return Fail("Her tarih istisnası yürürlük başlangıcından itibaren benzersiz bir tarih ve 0–1440 beklenen dakika içermelidir.", out schedule, out error);
            }

            schedule = new(dailyMinutes, datedMinutes);
            return true;
        }
        catch (JsonException)
        {
            return Fail("Haftalık takvim veya tarih istisnaları geçerli JSON değil.", out schedule, out error);
        }
    }

    private static bool Fail(string message, out PayrollWorkCalendarSchedule? schedule, out string? error)
    {
        schedule = null;
        error = message;
        return false;
    }
}
