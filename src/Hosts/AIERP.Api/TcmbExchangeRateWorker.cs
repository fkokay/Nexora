using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

internal enum TcmbImportAttemptResult
{
    Imported,
    NotPublished,
    LeaseUnavailable
}

internal sealed class TcmbExchangeRateWorker(
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<TcmbExchangeRateWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        DateOnly? retryDate = null;
        var retryAttempt = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTimeZone());
                var localDate = DateOnly.FromDateTime(now.DateTime);
                if (retryDate != localDate)
                {
                    retryDate = localDate;
                    retryAttempt = 0;
                }
                var runAt = ParseRunTime(configuration["ExchangeRates:TcmbImportLocalTime"]);
                if (TimeOnly.FromDateTime(now.DateTime) < runAt)
                {
                    var scheduled = now.Date.Add(runAt.ToTimeSpan());
                    await Task.Delay(scheduled - now, stoppingToken);
                    continue;
                }

                if (IsWeekend(now))
                {
                    logger.LogInformation("TCMB exchange-rate import skipped on a weekend; the next scheduled check is tomorrow.");
                    await Task.Delay(DelayAfterSuccessfulRun(now, runAt), stoppingToken);
                    continue;
                }

                if (retryAttempt > 0 && now >= new DateTimeOffset(now.Date.Add(runAt.ToTimeSpan()), now.Offset).Add(GetRetryWindow()))
                {
                    await Task.Delay(DelayAfterSuccessfulRun(now, runAt), stoppingToken);
                    continue;
                }

                var result = await ImportAllTenantsAsync(stoppingToken);
                if (result is TcmbImportAttemptResult.LeaseUnavailable or TcmbImportAttemptResult.NotPublished)
                {
                    now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTimeZone());
                    retryAttempt++;
                    var retryDelay = DelayAfterFailedRun(now, runAt, retryAttempt,
                        GetRetryWindow(), GetRetryInitialDelay(), GetRetryMaximumDelay(), GetRetryJitterFraction(), Random.Shared.NextDouble());
                    if (result == TcmbImportAttemptResult.LeaseUnavailable)
                        logger.LogInformation("Another API replica currently owns the TCMB exchange-rate import lease; this replica will retry after {RetryDelay}.", retryDelay);
                    else
                        logger.LogWarning("TCMB has not published today's exchange rates yet; no tenant data was changed. The next attempt is scheduled after {RetryDelay}.", retryDelay);
                    await Task.Delay(retryDelay, stoppingToken);
                    continue;
                }
                retryAttempt = 0;
                now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTimeZone());
                var delay = DelayAfterSuccessfulRun(now, runAt);
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                try
                {
                    var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTimeZone());
                    var schedule = ParseRunTime(configuration["ExchangeRates:TcmbImportLocalTime"]);
                    retryDate = DateOnly.FromDateTime(now.DateTime);
                    retryAttempt++;
                    var delay = DelayAfterFailedRun(now, schedule, retryAttempt,
                        GetRetryWindow(), GetRetryInitialDelay(), GetRetryMaximumDelay(), GetRetryJitterFraction(), Random.Shared.NextDouble());
                    // Avoid writing provider payloads, database exception messages, or connection
                    // details to logs; the exception type is enough to identify the failure class.
                    logger.LogError("TCMB exchange-rate import failed ({FailureType}). The next attempt is scheduled after {RetryDelay}.",
                        exception.GetType().Name, delay);
                    await Task.Delay(delay, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }

    private async Task<TcmbImportAttemptResult> ImportAllTenantsAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var configuredConnection = configuration.GetConnectionString("Tenant")
            ?? throw new InvalidOperationException("Tenant database connection string is missing for TCMB import.");
        var platformConnection = configuration.GetConnectionString("Platform")
            ?? throw new InvalidOperationException("Platform database connection string is missing for TCMB import coordination.");
        return await RunWithLeaseAsync(
            async ct => (IAsyncDisposable?)await TcmbImportLease.TryAcquireAsync(platformConnection, ct),
            async ct =>
            {
                var client = httpClientFactory.CreateClient("tcmb-rates");
                var snapshot = await TcmbExchangeRateImporter.FetchAsync(client, ct);
                if (!snapshot.HasPublishedRates)
                {
                    logger.LogInformation("TCMB has not published exchange rates for {RateDate}; no tenant data was changed.", snapshot.RateDate);
                    return TcmbImportAttemptResult.NotPublished;
                }
                var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTimeZone()).DateTime);
                TcmbExchangeRateImporter.EnsureRateDateNotFuture(snapshot, localDate);

                var databases = await platformDb.TenantDatabaseCatalog.AsNoTracking()
                    .Where(x => x.State == TenantDatabaseProvisioningState.Ready)
                    .Select(x => new { x.TenantId, x.DatabaseName }).ToListAsync(ct);
                var failures = await RunTenantBatchAsync(databases,
                    async (entry, tenantToken) =>
                    {
                        if (entry.DatabaseName != $"AIERPTenant_{entry.TenantId:N}")
                            throw new InvalidOperationException("Tenant database catalog entry does not match its tenant identity.");
                        var connection = new SqlConnectionStringBuilder(configuredConnection) { InitialCatalog = entry.DatabaseName }.ConnectionString;
                        await using var tenantScope = scope.ServiceProvider.CreateAsyncScope();
                        var storageQuota = tenantScope.ServiceProvider.GetRequiredService<TenantStorageQuotaInterceptor>();
                        await using var tenantDb = CreateTenantDb(connection, storageQuota, entry.TenantId);
                        await ImportTenantAsync(tenantDb, entry.TenantId, snapshot, tenantToken);
                    },
                    (entry, exception) => logger.LogError("TCMB rates could not be imported for tenant {TenantId} ({FailureType}).",
                        entry.TenantId, exception.GetType().Name),
                    ct);
                ThrowIfAnyTenantFailed(failures);
                return TcmbImportAttemptResult.Imported;
            },
            cancellationToken);
    }

    internal static async Task<TcmbImportAttemptResult> RunWithLeaseAsync(
        Func<CancellationToken, Task<IAsyncDisposable?>> acquireLease,
        Func<CancellationToken, Task<TcmbImportAttemptResult>> import,
        CancellationToken cancellationToken)
    {
        await using var lease = await acquireLease(cancellationToken);
        if (lease is null)
            return TcmbImportAttemptResult.LeaseUnavailable;

        return await import(cancellationToken);
    }

    internal static async Task<int> RunTenantBatchAsync<T>(IEnumerable<T> tenants,
        Func<T, CancellationToken, Task> import, Action<T, Exception> logFailure, CancellationToken cancellationToken)
    {
        var failures = 0;
        foreach (var tenant in tenants)
        {
            try { await import(tenant, cancellationToken); }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception exception)
            {
                failures++;
                logFailure(tenant, exception);
            }
        }
        return failures;
    }

    private static void ThrowIfAnyTenantFailed(int failures)
    {
        if (failures > 0)
            throw new InvalidOperationException($"TCMB kuru {failures} firma veritabanına alınamadı; zamanlayıcı yeniden deneyecek.");
    }

    private async Task ImportTenantAsync(TenantDbContext db, Guid tenantId, TcmbRateSnapshot snapshot, CancellationToken cancellationToken)
    {
        var result = await TcmbExchangeRateImporter.ImportAsync(db, tenantId, snapshot, cancellationToken);
        logger.LogInformation("TCMB rates for tenant {TenantId}: date {RateDate}, imported {Imported}, already present {Skipped}, base currency {BaseCurrency}.",
            tenantId, result.RateDate, result.Imported, result.Skipped, result.BaseCurrencyCode);
    }

    private static TenantDbContext CreateTenantDb(string connectionString, TenantStorageQuotaInterceptor storageQuota, Guid tenantId)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).AddInterceptors(storageQuota).Options;
        return new TenantDbContext(options, new AuditExecutionContext(tenantId, null, "tcmb-rate-import"));
    }

    private static TimeOnly ParseRunTime(string? value) =>
        TimeOnly.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : new TimeOnly(16, 45);

    internal static TimeSpan DelayAfterSuccessfulRun(DateTimeOffset istanbulLocalNow, TimeOnly runAt)
    {
        var nextRun = new DateTimeOffset(istanbulLocalNow.Date.AddDays(1).Add(runAt.ToTimeSpan()), istanbulLocalNow.Offset);
        return nextRun - istanbulLocalNow;
    }

    internal static bool IsWeekend(DateTimeOffset istanbulLocalNow) =>
        istanbulLocalNow.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday;

    internal static TimeSpan DelayAfterFailedRun(DateTimeOffset istanbulLocalNow, TimeOnly runAt,
        int retryAttempt, TimeSpan retryWindow, TimeSpan initialDelay, TimeSpan maximumDelay,
        double jitterFraction, double jitterSample)
    {
        var scheduledToday = new DateTimeOffset(istanbulLocalNow.Date.Add(runAt.ToTimeSpan()), istanbulLocalNow.Offset);
        var retryCutoff = scheduledToday.Add(retryWindow);
        if (istanbulLocalNow >= retryCutoff)
            return DelayAfterSuccessfulRun(istanbulLocalNow, runAt);

        var exponent = Math.Clamp(retryAttempt - 1, 0, 30);
        var backoffTicks = Math.Min(maximumDelay.Ticks, initialDelay.Ticks * Math.Pow(2, exponent));
        var boundedJitterFraction = Math.Clamp(jitterFraction, 0d, 0.5d);
        var boundedJitterSample = Math.Clamp(jitterSample, 0d, 1d);
        var jitterMultiplier = 1d - boundedJitterFraction + (2d * boundedJitterFraction * boundedJitterSample);
        var jitteredTicks = Math.Min(maximumDelay.Ticks, Math.Max(1d, backoffTicks * jitterMultiplier));
        return TimeSpan.FromTicks((long)Math.Min(jitteredTicks, (retryCutoff - istanbulLocalNow).Ticks));
    }

    private TimeSpan GetRetryWindow() => TimeSpan.FromMinutes(ReadPositiveInt("ExchangeRates:TcmbRetryWindowMinutes", 120));
    private TimeSpan GetRetryInitialDelay() => TimeSpan.FromSeconds(ReadPositiveInt("ExchangeRates:TcmbRetryInitialDelaySeconds", 60));
    private TimeSpan GetRetryMaximumDelay() => TimeSpan.FromSeconds(ReadPositiveInt("ExchangeRates:TcmbRetryMaximumDelaySeconds", 900));
    private double GetRetryJitterFraction() => double.TryParse(configuration["ExchangeRates:TcmbRetryJitterFraction"],
        System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value)
        ? Math.Clamp(value, 0d, 0.5d)
        : 0.2d;

    private int ReadPositiveInt(string key, int fallback) =>
        int.TryParse(configuration[key], System.Globalization.NumberStyles.Integer,
            System.Globalization.CultureInfo.InvariantCulture, out var value) && value > 0
            ? value
            : fallback;

    private static TimeZoneInfo IstanbulTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
    }
}
