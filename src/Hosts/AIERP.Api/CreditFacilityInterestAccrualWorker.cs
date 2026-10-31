using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace AIERP.Api;

/// <summary>Posts the previous closed month's contractual Actual/365 interest in each ready tenant database.</summary>
internal sealed class CreditFacilityInterestAccrualWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<CreditFacilityInterestAccrualWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTimeZone());
                var runAt = ParseRunTime(configuration["CreditFacilityInterestAccrual:LocalTime"]);
                var scheduledToday = new DateTimeOffset(now.Date.Add(runAt.ToTimeSpan()), now.Offset);
                if (now < scheduledToday)
                {
                    await Task.Delay(scheduledToday - now, stoppingToken);
                    continue;
                }

                var today = DateOnly.FromDateTime(now.DateTime);
                var period = PreviousClosedMonth(today);
                var failures = await PostAllTenantsAsync(period.Year, period.Month, stoppingToken);
                if (failures > 0)
                {
                    logger.LogWarning("Automatic credit interest accrual had {FailureCount} failed tenant/facility operations for {Period}; retrying later.",
                        failures, period.ToString("yyyy-MM"));
                    await Task.Delay(TimeSpan.FromMinutes(ReadPositiveInt("CreditFacilityInterestAccrual:RetryMinutes", 30)), stoppingToken);
                    continue;
                }
                logger.LogInformation("Automatic credit interest accrual completed for {Period}.", period.ToString("yyyy-MM"));

                now = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, IstanbulTimeZone());
                var nextRun = new DateTimeOffset(now.Date.AddDays(1).Add(runAt.ToTimeSpan()), now.Offset);
                await Task.Delay(nextRun - now, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError("Automatic credit interest accrual failed ({FailureType}); retrying later.", exception.GetType().Name);
                try
                {
                    await Task.Delay(TimeSpan.FromMinutes(ReadPositiveInt("CreditFacilityInterestAccrual:RetryMinutes", 30)), stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }

    private async Task<int> PostAllTenantsAsync(int year, int month, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var platformDb = services.GetRequiredService<PlatformDbContext>();
        var tenantConnectionTemplate = configuration.GetConnectionString("Tenant")
            ?? throw new InvalidOperationException("Tenant database connection string is missing for credit-interest accrual.");
        var credentialReader = services.GetRequiredService<ITenantSqlCredentialReader>();
        var tenants = await platformDb.TenantDatabaseCatalog.AsNoTracking()
            .Where(x => x.State == TenantDatabaseProvisioningState.Ready)
            .Select(x => new { x.TenantId, x.DatabaseName }).ToListAsync(ct);
        var failures = 0;

        foreach (var tenant in tenants)
        {
            try
            {
                if (tenant.DatabaseName != $"AIERPTenant_{tenant.TenantId:N}")
                    throw new InvalidOperationException("Tenant database catalog identity does not match its tenant.");
                var secretReference = TenantSqlCredentialPath.ForTenant(tenant.TenantId, TenantSqlDatabaseComponent.Erp);
                var credential = await credentialReader.ReadAsync(tenant.TenantId, TenantSqlDatabaseComponent.Erp, secretReference, ct);
                var connection = TenantDatabaseRouting.BuildTenantConnectionString(tenantConnectionTemplate, tenant.TenantId, credential);
                using var tenantScope = services.CreateScope();
                var quotaInterceptor = tenantScope.ServiceProvider.GetRequiredService<TenantStorageQuotaInterceptor>();
                await using var db = CreateTenantDb(connection, quotaInterceptor, tenant.TenantId);
                var start = new DateOnly(year, month, 1);
                var end = start.AddMonths(1).AddDays(-1);
                var facilities = await db.CreditFacilities.AsNoTracking()
                    .Where(x => x.TenantId == tenant.TenantId && x.AnnualInterestRatePercent != null && x.StartDate <= end &&
                                (x.MaturityDate == null || x.MaturityDate >= start))
                    .OrderBy(x => x.Code).Select(x => new { x.Id, x.Code }).ToListAsync(ct);
                foreach (var facility in facilities)
                {
                    try
                    {
                        var result = await FinanceCreditFacilityEndpoints.PostInterestAccrualAsync(
                            facility.Id, year, month, tenant.TenantId, null, db, ct);
                        var statusCode = (result as IStatusCodeHttpResult)?.StatusCode ?? StatusCodes.Status500InternalServerError;
                        if (statusCode >= 400)
                        {
                            failures++;
                            logger.LogWarning("Credit interest accrual was not posted for tenant {TenantId}, facility {FacilityCode}, period {Period}; status {StatusCode}.",
                                tenant.TenantId, facility.Code, $"{year:D4}-{month:D2}", statusCode);
                        }
                    }
                    catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                    catch (Exception exception)
                    {
                        failures++;
                        logger.LogError("Credit interest accrual failed for tenant {TenantId}, facility {FacilityCode} ({FailureType}).",
                            tenant.TenantId, facility.Code, exception.GetType().Name);
                    }
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception exception)
            {
                failures++;
                logger.LogError("Credit interest accrual could not process tenant {TenantId} ({FailureType}).",
                    tenant.TenantId, exception.GetType().Name);
            }
        }
        return failures;
    }

    private static TenantDbContext CreateTenantDb(string connectionString, TenantStorageQuotaInterceptor quotaInterceptor, Guid tenantId)
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseSqlServer(connectionString)
            .AddInterceptors(quotaInterceptor)
            .Options;
        return new TenantDbContext(options, new AuditExecutionContext(tenantId, null, "credit-facility-interest-accrual"));
    }

    internal static DateOnly PreviousClosedMonth(DateOnly today) => new DateOnly(today.Year, today.Month, 1).AddMonths(-1);

    internal static TimeOnly ParseRunTime(string? value) =>
        TimeOnly.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, out var parsed) ? parsed : new TimeOnly(3, 15);

    private int ReadPositiveInt(string key, int fallback) =>
        int.TryParse(configuration[key], out var value) && value is > 0 and <= 1440 ? value : fallback;

    private static TimeZoneInfo IstanbulTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
    }
}
