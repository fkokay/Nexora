using System.Globalization;
using System.Xml;
using System.Xml.Linq;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

internal sealed record TcmbExchangeRateImportResult(DateOnly RateDate, int Imported, int Skipped, string BaseCurrencyCode);
internal sealed record TcmbRateSnapshot(DateOnly RateDate, IReadOnlyDictionary<string, decimal> RatesInTry)
{
    public bool HasPublishedRates => RatesInTry.Keys.Any(code => code != "TRY");
}

internal static class TcmbExchangeRateImporter
{
    private const string Source = "TCMB ForexSelling";
    private static readonly Uri DailyRatesUri = new("https://www.tcmb.gov.tr/kurlar/today.xml");

    internal static DateOnly IstanbulLocalDate(DateTimeOffset utcNow)
    {
        TimeZoneInfo timeZone;
        try { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch (TimeZoneNotFoundException) { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(utcNow, timeZone).DateTime);
    }

    public static async Task<TcmbRateSnapshot> FetchAsync(HttpClient client, CancellationToken cancellationToken)
    {
        using var response = await client.GetAsync(DailyRatesUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        if (response.Content.Headers.ContentLength is > 1_048_576)
            throw new InvalidDataException("TCMB kur dosyası beklenen boyutu aşıyor.");

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var settings = new XmlReaderSettings { Async = true, DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 1_048_576 };
        using var reader = XmlReader.Create(stream, settings);
        var document = await XDocument.LoadAsync(reader, LoadOptions.None, cancellationToken);
        var root = document.Root;
        if (root?.Name.LocalName != "Tarih_Date"
            || !DateOnly.TryParseExact((string?)root.Attribute("Tarih"), "dd.MM.yyyy", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var rateDate))
            throw new InvalidDataException("TCMB yanıtında geçerli tarih veya kur listesi bulunamadı.");

        var quotes = root.Elements().Where(x => x.Name.LocalName == "Currency")
            .Select(x => new
            {
                Code = ((string?)x.Attribute("CurrencyCode") ?? (string?)x.Attribute("Kod"))?.Trim().ToUpperInvariant(),
                Unit = ParseDecimal(x.ElementByName("Unit")?.Value),
                Selling = ParseDecimal(x.ElementByName("ForexSelling")?.Value)
            })
            .Where(x => x.Code is { Length: 3 } && x.Unit > 0 && x.Selling > 0)
            .ToDictionary(x => x.Code!, x => x.Selling / x.Unit, StringComparer.Ordinal);
        quotes["TRY"] = 1m;
        return new TcmbRateSnapshot(rateDate, quotes);
    }

    public static async Task<TcmbExchangeRateImportResult> ImportAsync(
        TenantDbContext db,
        Guid tenantId,
        TcmbRateSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        EnsureRateDateNotFuture(snapshot, IstanbulLocalDate(DateTimeOffset.UtcNow));
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var tenant = await db.Tenants.FromSqlInterpolated(
                $"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}")
            .SingleOrDefaultAsync(cancellationToken);
        if (tenant is null) throw new InvalidOperationException("Tenant bulunamadı.");

        var baseCurrencyCode = tenant.BaseCurrencyCode.Trim().ToUpperInvariant();
        // The TCMB can return a dated XML document before that day's quotes are published.
        // Keep this a benign no-op instead of creating an empty/TRY-only import batch.
        if (!snapshot.HasPublishedRates)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new TcmbExchangeRateImportResult(snapshot.RateDate, 0, 0, baseCurrencyCode);
        }

        var baseRateInTry = baseCurrencyCode == "TRY" ? 1m : snapshot.RatesInTry.GetValueOrDefault(baseCurrencyCode);
        if (baseRateInTry <= 0)
            throw new InvalidDataException($"TCMB dosyasında tenant baz para birimi {baseCurrencyCode} için satış kuru bulunamadı.");

        var imported = 0;
        var existingCodes = await db.TenantExchangeRates.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.RateDate == snapshot.RateDate)
            .Select(x => x.CurrencyCode).ToHashSetAsync(cancellationToken);
        var skipped = 0;
        foreach (var quote in snapshot.RatesInTry)
        {
            if (quote.Key == baseCurrencyCode) continue;
            var rate = decimal.Round(quote.Value / baseRateInTry, 8, MidpointRounding.AwayFromZero);
            if (rate <= 0 || rate > 9_999_999_999.99999999m) continue;

            // Preserve any existing manual or imported rate for this currency/date. The import
            // only fills missing quotes, so repeating the scheduled job cannot create revisions.
            if (existingCodes.Contains(quote.Key))
            {
                skipped++;
                continue;
            }

            db.TenantExchangeRates.Add(new TenantExchangeRate
            {
                TenantId = tenantId,
                CurrencyCode = quote.Key,
                RateDate = snapshot.RateDate,
                Revision = 1,
                Rate = rate,
                Source = $"{Source} · {snapshot.RateDate:yyyy-MM-dd}"
            });
            db.AuditEvents.Add(new AuditEvent
            {
                TenantId = tenantId,
                Action = "finance.exchange-rate.imported",
                Resource = $"{quote.Key}:{snapshot.RateDate}:TCMB"
            });
            imported++;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new TcmbExchangeRateImportResult(snapshot.RateDate, imported, skipped, baseCurrencyCode);
    }

    internal static void EnsureRateDateNotFuture(TcmbRateSnapshot snapshot, DateOnly localDate)
    {
        if (snapshot.RateDate > localDate)
            throw new InvalidDataException("TCMB kur dosyasının tarihi yerel tarihten ileride.");
    }

    private static decimal ParseDecimal(string? value) => decimal.TryParse(value, NumberStyles.Number,
        CultureInfo.InvariantCulture, out var result) ? result : 0m;

    private static XElement? ElementByName(this XElement element, string name) =>
        element.Elements().FirstOrDefault(x => x.Name.LocalName == name);
}
