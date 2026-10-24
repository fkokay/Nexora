namespace AIERP.AIService;

internal static class IstanbulDateHelper
{
    internal static DateOnly FromUtc(DateTimeOffset utcNow)
    {
        TimeZoneInfo timeZone;
        try
        {
            timeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        }
        catch (TimeZoneNotFoundException)
        {
            timeZone = TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time");
        }

        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(utcNow, timeZone).DateTime);
    }
}
