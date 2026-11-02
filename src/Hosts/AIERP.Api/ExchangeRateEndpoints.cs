using System.Security.Claims;
using AIERP.Api;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static class ExchangeRateEndpoints
{
    public static void MapExchangeRateEndpoints(this WebApplication app)
    {
        var finance = app.MapGroup("/api/finance").RequireAuthorization();

        finance.MapGet("/exchange-rates", async (ClaimsPrincipal principal, TenantDbContext db,
            string? currencyCode, DateOnly? rateDate) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
            var code = currencyCode?.Trim().ToUpperInvariant();
            if (code is not null && !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z]{3}$"))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = ["Üç harfli ISO para birimi kodu girilmelidir."] });
            if (rateDate is DateOnly requestedDate && requestedDate > TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rateDate"] = ["Kur tarihi bugün veya geçmiş bir tarih olmalıdır."] });

            var query = db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (code is not null) query = query.Where(x => x.CurrencyCode == code);
            if (rateDate is DateOnly date) query = query.Where(x => x.RateDate == date);
            if (code is not null && rateDate is not null)
            {
                var latestRate = await query
                    .OrderByDescending(x => x.Revision)
                    .Take(1)
                    .Select(x => new TenantExchangeRateView(x.Id, x.CurrencyCode, x.RateDate, x.Revision, x.Rate, x.Source, x.CreatedAt))
                    .ToListAsync();
                return Results.Ok(latestRate);
            }

            var rates = await query
                .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.CurrencyCode).ThenByDescending(x => x.Revision)
                .Select(x => new TenantExchangeRateView(x.Id, x.CurrencyCode, x.RateDate, x.Revision, x.Rate, x.Source, x.CreatedAt)).ToListAsync();
            return Results.Ok(rates);
        });

        finance.MapPost("/exchange-rates/import-tcmb", async (ClaimsPrincipal principal, TenantDbContext db,
            PlatformDbContext platformDb, IHttpClientFactory clients, CancellationToken cancellationToken) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)
                || !await IsCurrentTenantAdminAsync(platformDb, principal, tenantId, cancellationToken)) return Results.Forbid();
            try
            {
                var snapshot = await TcmbExchangeRateImporter.FetchAsync(clients.CreateClient("tcmb-rates"), cancellationToken);
                var result = await TcmbExchangeRateImporter.ImportAsync(db, tenantId, snapshot, cancellationToken);
                return Results.Ok(result);
            }
            catch (HttpRequestException)
            {
                return Results.Problem("TCMB kur servisine şu anda ulaşılamıyor. Daha sonra yeniden deneyin.", statusCode: StatusCodes.Status502BadGateway);
            }
            catch (InvalidDataException exception)
            {
                return Results.Problem(exception.Message, statusCode: StatusCodes.Status502BadGateway);
            }
        });

        finance.MapPost("/exchange-rates", async (TenantExchangeRateWriteRequest body, ClaimsPrincipal principal,
            TenantDbContext db, PlatformDbContext platformDb, CancellationToken cancellationToken) =>
        {
            if (!TryGetTenantId(principal, out var tenantId)
                || !await IsCurrentTenantAdminAsync(platformDb, principal, tenantId, cancellationToken)) return Results.Forbid();
            var code = body.CurrencyCode?.Trim().ToUpperInvariant();
            if (code is null || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z]{3}$") || body.RateDate > TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow)
                || body.Rate <= 0 || body.Rate > 9999999999.99999999m || body.Rate != decimal.Round(body.Rate, 8)
                || (body.Source?.Trim().Length ?? 0) > 160)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["rate"] = ["Döviz kodu, geçmiş/bugün tarih, pozitif decimal(18,8) kur ve en fazla 160 karakter kaynak girilmelidir."] });
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}")
                .SingleOrDefaultAsync(cancellationToken);
            if (tenant is null) return Results.NotFound();
            if (code == tenant.BaseCurrencyCode) return Results.Conflict(new { error = "Baz para biriminin kuru her zaman 1 kabul edilir; ayrıca kaydedilmez." });
            var revision = (await db.TenantExchangeRates.Where(x => x.TenantId == tenantId && x.CurrencyCode == code && x.RateDate == body.RateDate)
                .Select(x => (int?)x.Revision).MaxAsync(cancellationToken) ?? 0) + 1;
            var rate = new TenantExchangeRate { TenantId = tenantId, CurrencyCode = code, RateDate = body.RateDate, Revision = revision,
                Rate = body.Rate, Source = string.IsNullOrWhiteSpace(body.Source) ? null : body.Source.Trim(), CreatedByUserId = GetUserId(principal) };
            db.TenantExchangeRates.Add(rate);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.exchange-rate.created", Resource = $"{code}:{body.RateDate}:r{revision}" });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/finance/exchange-rates/{rate.Id}",
                new TenantExchangeRateView(rate.Id, rate.CurrencyCode, rate.RateDate, rate.Revision, rate.Rate, rate.Source, rate.CreatedAt));
        });
    }

    private static async Task<bool> IsCurrentTenantAdminAsync(PlatformDbContext db, ClaimsPrincipal principal,
        Guid tenantId, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var userId)) return false;
        return await db.TenantMemberships.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.UserId == userId
            && x.Role == "TenantAdmin" && x.User.IsActive && x.Tenant.IsActive, cancellationToken);
    }

    private static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) =>
        Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);

    private static Guid? GetUserId(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sub"), out var userId) ? userId : null;
}
