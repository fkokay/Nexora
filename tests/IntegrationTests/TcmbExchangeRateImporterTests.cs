using System.Net;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class TcmbExchangeRateImporterTests
{
    [Fact]
    public async Task Fetch_reads_the_official_rate_date_and_divides_by_currency_unit()
    {
        const string xml = """<?xml version="1.0" encoding="UTF-8"?><Tarih_Date Tarih="21.10.2026" Date="10/21/2026"><Currency CurrencyCode="USD"><Unit>1</Unit><ForexSelling>50.2500</ForexSelling></Currency><Currency CurrencyCode="JPY"><Unit>100</Unit><ForexSelling>32.7500</ForexSelling></Currency><Currency CurrencyCode="EUR"><Unit>1</Unit><ForexSelling>0</ForexSelling></Currency></Tarih_Date>""";
        using var client = new HttpClient(new StaticResponseHandler(xml));

        var snapshot = await TcmbExchangeRateImporter.FetchAsync(client, CancellationToken.None);

        Assert.Equal(new DateOnly(2026, 10, 21), snapshot.RateDate);
        Assert.Equal(50.2500m, snapshot.RatesInTry["USD"]);
        Assert.Equal(0.3275m, snapshot.RatesInTry["JPY"]);
        Assert.Equal(1m, snapshot.RatesInTry["TRY"]);
        Assert.DoesNotContain("EUR", snapshot.RatesInTry.Keys);
    }

    [Fact]
    public async Task Fetch_rejects_non_Tcmb_xml()
    {
        using var client = new HttpClient(new StaticResponseHandler("<response />"));

        await Assert.ThrowsAsync<InvalidDataException>(() => TcmbExchangeRateImporter.FetchAsync(client, CancellationToken.None));
    }

    [Fact]
    public async Task Fetch_marks_a_dated_but_unpublished_rate_document_as_empty()
    {
        using var client = new HttpClient(new StaticResponseHandler(
            "<Tarih_Date Tarih=\"21.10.2026\" Date=\"10/21/2026\"></Tarih_Date>"));

        var snapshot = await TcmbExchangeRateImporter.FetchAsync(client, CancellationToken.None);

        Assert.False(snapshot.HasPublishedRates);
        Assert.Equal(1m, snapshot.RatesInTry["TRY"]);
    }

    [Fact]
    public void Manual_rate_date_validation_uses_the_Istanbul_calendar_day_at_the_UTC_boundary()
    {
        var justBeforeIstanbulMidnight = new DateTimeOffset(2026, 10, 21, 20, 59, 59, TimeSpan.Zero);
        var justAfterIstanbulMidnight = new DateTimeOffset(2026, 10, 21, 21, 0, 0, TimeSpan.Zero);

        Assert.Equal(new DateOnly(2026, 10, 21), TcmbExchangeRateImporter.IstanbulLocalDate(justBeforeIstanbulMidnight));
        Assert.Equal(new DateOnly(2026, 10, 22), TcmbExchangeRateImporter.IstanbulLocalDate(justAfterIstanbulMidnight));
    }

    [Fact]
    public async Task Importer_rejects_a_future_snapshot_before_opening_a_database_transaction()
    {
        var options = new DbContextOptionsBuilder<TenantDbContext>()
            .UseInMemoryDatabase($"tcmb-future-date-{Guid.NewGuid():N}").Options;
        await using var db = new TenantDbContext(options);
        var futureDate = TcmbExchangeRateImporter.IstanbulLocalDate(DateTimeOffset.UtcNow).AddDays(1);
        var snapshot = new TcmbRateSnapshot(futureDate, new Dictionary<string, decimal>
        {
            ["TRY"] = 1m,
            ["USD"] = 50m
        });

        var error = await Assert.ThrowsAsync<InvalidDataException>(() =>
            TcmbExchangeRateImporter.ImportAsync(db, Guid.NewGuid(), snapshot, CancellationToken.None));

        Assert.Contains("yerel tarihten ileride", error.Message, StringComparison.Ordinal);
        Assert.Empty(await db.TenantExchangeRates.ToListAsync());
    }

    [Fact]
    public void Snapshot_from_the_current_Istanbul_day_is_valid()
    {
        var snapshot = new TcmbRateSnapshot(new DateOnly(2026, 10, 22), new Dictionary<string, decimal>
        {
            ["TRY"] = 1m,
            ["USD"] = 50m
        });

        var error = Record.Exception(() => TcmbExchangeRateImporter.EnsureRateDateNotFuture(snapshot, new DateOnly(2026, 10, 22)));

        Assert.Null(error);
    }

    [Theory]
    [InlineData(2026, 10, 24, true)]
    [InlineData(2026, 10, 25, true)]
    [InlineData(2026, 10, 26, false)]
    public void Scheduled_import_skips_only_weekends(int year, int month, int day, bool expected)
    {
        var localDate = new DateTimeOffset(year, month, day, 17, 0, 0, TimeSpan.FromHours(3));

        Assert.Equal(expected, TcmbExchangeRateWorker.IsWeekend(localDate));
    }

    [Fact]
    public async Task Scheduled_batch_continues_after_a_tenant_failure_and_reports_it_for_retry()
    {
        var tenants = new[] { "tenant-a", "tenant-b", "tenant-c" };
        var attempted = new List<string>();
        var logged = new List<string>();

        var failures = await TcmbExchangeRateWorker.RunTenantBatchAsync(tenants, (tenant, _) =>
        {
            attempted.Add(tenant);
            return tenant == "tenant-b" ? Task.FromException(new InvalidOperationException("offline")) : Task.CompletedTask;
        }, (tenant, _) => logged.Add(tenant), CancellationToken.None);

        Assert.Equal(tenants, attempted);
        Assert.Equal(new[] { "tenant-b" }, logged);
        Assert.Equal(1, failures);
    }

    [Fact]
    public async Task Scheduled_batch_stops_promptly_when_shutdown_is_requested()
    {
        using var source = new CancellationTokenSource();
        var attempted = new List<string>();
        var tenants = new[] { "tenant-a", "tenant-b" };

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => TcmbExchangeRateWorker.RunTenantBatchAsync(tenants, (tenant, token) =>
        {
            attempted.Add(tenant);
            source.Cancel();
            token.ThrowIfCancellationRequested();
            return Task.CompletedTask;
        }, (_, _) => { }, source.Token));

        Assert.Equal(new[] { "tenant-a" }, attempted);
    }

    [Fact]
    public void Successful_scheduled_import_waits_until_the_next_local_run_instead_of_repeating_retries()
    {
        var localNow = new DateTimeOffset(2026, 10, 21, 16, 45, 30, TimeSpan.FromHours(3));

        var delay = TcmbExchangeRateWorker.DelayAfterSuccessfulRun(localNow, new TimeOnly(16, 45));

        Assert.Equal(TimeSpan.FromDays(1) - TimeSpan.FromSeconds(30), delay);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 2)]
    [InlineData(4, 8)]
    [InlineData(7, 15)]
    public void Failed_scheduled_import_uses_bounded_exponential_backoff(int attempt, int expectedDelayMinutes)
    {
        var localNow = new DateTimeOffset(2026, 10, 21, 16, 45, 0, TimeSpan.FromHours(3));

        var delay = TcmbExchangeRateWorker.DelayAfterFailedRun(localNow, new TimeOnly(16, 45), attempt,
            TimeSpan.FromHours(2), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(15), 0, 0.5);

        Assert.Equal(TimeSpan.FromMinutes(expectedDelayMinutes), delay);
    }

    [Fact]
    public void Failed_scheduled_import_applies_jitter_and_clamps_to_the_remaining_retry_window()
    {
        var jittered = TcmbExchangeRateWorker.DelayAfterFailedRun(
            new DateTimeOffset(2026, 10, 21, 16, 45, 0, TimeSpan.FromHours(3)), new TimeOnly(16, 45), 1,
            TimeSpan.FromHours(2), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(15), 0.2, 1);
        var clamped = TcmbExchangeRateWorker.DelayAfterFailedRun(
            new DateTimeOffset(2026, 10, 21, 18, 44, 30, TimeSpan.FromHours(3)), new TimeOnly(16, 45), 8,
            TimeSpan.FromHours(2), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(15), 0, 0.5);

        Assert.Equal(TimeSpan.FromSeconds(72), jittered);
        Assert.Equal(TimeSpan.FromSeconds(30), clamped);
    }

    [Fact]
    public void Failed_scheduled_import_after_retry_cutoff_waits_until_the_next_local_run()
    {
        var localNow = new DateTimeOffset(2026, 10, 21, 18, 45, 0, TimeSpan.FromHours(3));

        var delay = TcmbExchangeRateWorker.DelayAfterFailedRun(localNow, new TimeOnly(16, 45), 9,
            TimeSpan.FromHours(2), TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(15), 0, 0.5);

        Assert.Equal(TimeSpan.FromHours(22), delay);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 0)]
    [InlineData(-1, 1)]
    [InlineData(-2, 2)]
    [InlineData(-3, 3)]
    [InlineData(-999, 4)]
    [InlineData(-4, 5)]
    public void App_lock_result_distinguishes_contention_from_sql_server_errors(int result, int expected)
    {
        Assert.Equal((TcmbAppLockResult)expected, TcmbImportLease.ClassifyAppLockResult(result));
    }

    [Fact]
    public async Task Scheduled_import_holds_one_lease_through_feed_tenant_batches_and_import()
    {
        var lease = new TrackingLease();
        var acquisitions = 0;
        var phases = new List<string>();

        var result = await TcmbExchangeRateWorker.RunWithLeaseAsync(_ =>
        {
            acquisitions++;
            return Task.FromResult<IAsyncDisposable?>(lease);
        }, _ =>
        {
            Assert.False(lease.IsDisposed);
            phases.Add("feed");
            Assert.False(lease.IsDisposed);
            phases.Add("tenant-batch");
            Assert.False(lease.IsDisposed);
            phases.Add("tenant-import");
            Assert.False(lease.IsDisposed);
            phases.Add("complete-import");
            return Task.FromResult(TcmbImportAttemptResult.Imported);
        }, CancellationToken.None);

        Assert.Equal(TcmbImportAttemptResult.Imported, result);
        Assert.Equal(1, acquisitions);
        Assert.Equal(new[] { "feed", "tenant-batch", "tenant-import", "complete-import" }, phases);
        Assert.True(lease.IsDisposed);
        Assert.Equal(1, lease.DisposeCount);
    }

    [Fact]
    public async Task Scheduled_import_disposes_its_lease_when_a_tenant_batch_fails()
    {
        var lease = new TrackingLease();

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            TcmbExchangeRateWorker.RunWithLeaseAsync(
                _ => Task.FromResult<IAsyncDisposable?>(lease),
                _ =>
                {
                    Assert.False(lease.IsDisposed);
                    return Task.FromException<TcmbImportAttemptResult>(new InvalidOperationException("tenant batch failed"));
                },
                CancellationToken.None));

        Assert.Equal("tenant batch failed", error.Message);
        Assert.True(lease.IsDisposed);
        Assert.Equal(1, lease.DisposeCount);
    }

    [Fact]
    public async Task Parallel_scheduled_attempt_skips_feed_and_import_while_lease_is_held_then_retry_runs()
    {
        var leaseHeld = 0;
        var acquisitions = 0;
        var feedCalls = 0;
        var importCalls = 0;
        var firstImportEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var allowFirstImportToFinish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        Task<IAsyncDisposable?> TryAcquireAsync(CancellationToken _)
        {
            acquisitions++;
            if (Interlocked.CompareExchange(ref leaseHeld, 1, 0) != 0)
                return Task.FromResult<IAsyncDisposable?>(null);

            return Task.FromResult<IAsyncDisposable?>(new CallbackLease(() => Interlocked.Exchange(ref leaseHeld, 0)));
        }

        var firstAttempt = TcmbExchangeRateWorker.RunWithLeaseAsync(TryAcquireAsync, async _ =>
        {
            importCalls++;
            feedCalls++;
            firstImportEntered.SetResult();
            await allowFirstImportToFinish.Task;
            return TcmbImportAttemptResult.Imported;
        }, CancellationToken.None);
        await firstImportEntered.Task;

        var contendingAttempt = await TcmbExchangeRateWorker.RunWithLeaseAsync(TryAcquireAsync, _ =>
        {
            importCalls++;
            feedCalls++;
            return Task.FromResult(TcmbImportAttemptResult.Imported);
        }, CancellationToken.None);

        Assert.Equal(TcmbImportAttemptResult.LeaseUnavailable, contendingAttempt);
        Assert.Equal(2, acquisitions);
        Assert.Equal(1, feedCalls);
        Assert.Equal(1, importCalls);

        allowFirstImportToFinish.SetResult();
        Assert.Equal(TcmbImportAttemptResult.Imported, await firstAttempt);

        var retryResult = await TcmbExchangeRateWorker.RunWithLeaseAsync(TryAcquireAsync, _ =>
        {
            importCalls++;
            feedCalls++;
            return Task.FromResult(TcmbImportAttemptResult.Imported);
        }, CancellationToken.None);

        Assert.Equal(TcmbImportAttemptResult.Imported, retryResult);
        Assert.Equal(3, acquisitions);
        Assert.Equal(2, feedCalls);
        Assert.Equal(2, importCalls);
    }

    [SqlServerAcceptanceFact]
    public async Task SqlServer_import_is_tenant_scoped_idempotent_and_preserves_existing_rates()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();
        var databaseName = $"AIERP_TcmbAcceptance_{Guid.NewGuid():N}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options;
        await using var db = new TenantDbContext(options);
        var databaseCreated = false;
        try
        {
            databaseCreated = await db.Database.EnsureCreatedAsync();
            Assert.True(databaseCreated);
            db.Tenants.AddRange(
                new Tenant { Id = tenantA, Name = "Synthetic TCMB tenant A", Slug = $"tcmb-a-{tenantA:N}" },
                new Tenant { Id = tenantB, Name = "Synthetic TCMB tenant B", Slug = $"tcmb-b-{tenantB:N}" });
            db.TenantExchangeRates.Add(new TenantExchangeRate
            {
                TenantId = tenantA,
                CurrencyCode = "USD",
                RateDate = new DateOnly(2026, 10, 21),
                Revision = 1,
                Rate = 12.345m,
                Source = "Manual"
            });
            await db.SaveChangesAsync();
            var snapshot = new TcmbRateSnapshot(new DateOnly(2026, 10, 21), new Dictionary<string, decimal>
            {
                ["TRY"] = 1m,
                ["USD"] = 50m,
                ["EUR"] = 55m
            });

            var firstImport = await TcmbExchangeRateImporter.ImportAsync(db, tenantA, snapshot, CancellationToken.None);
            db.ChangeTracker.Clear();
            var replay = await TcmbExchangeRateImporter.ImportAsync(db, tenantA, snapshot, CancellationToken.None);
            var otherTenantImport = await TcmbExchangeRateImporter.ImportAsync(db, tenantB, snapshot, CancellationToken.None);

            Assert.Equal((1, 1, "TRY"), (firstImport.Imported, firstImport.Skipped, firstImport.BaseCurrencyCode));
            Assert.Equal((0, 2), (replay.Imported, replay.Skipped));
            Assert.Equal((2, 0), (otherTenantImport.Imported, otherTenantImport.Skipped));

            var tenantARates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantA).ToListAsync();
            Assert.Equal(2, tenantARates.Count);
            Assert.Equal(12.345m, Assert.Single(tenantARates, x => x.CurrencyCode == "USD").Rate);
            Assert.Equal(55m, Assert.Single(tenantARates, x => x.CurrencyCode == "EUR").Rate);
            Assert.Equal(2, await db.TenantExchangeRates.CountAsync(x => x.TenantId == tenantB));
            Assert.Equal(1, await db.TenantExchangeRates.CountAsync(x => x.TenantId == tenantB && x.CurrencyCode == "USD" && x.Source!.StartsWith("TCMB ForexSelling")));
            Assert.Equal(1, await db.AuditEvents.CountAsync(x => x.TenantId == tenantA && x.Action == "finance.exchange-rate.imported"));
            Assert.Equal(2, await db.AuditEvents.CountAsync(x => x.TenantId == tenantB && x.Action == "finance.exchange-rate.imported"));
        }
        finally
        {
            if (databaseCreated)
                await db.Database.EnsureDeletedAsync();
        }
    }

    [SqlServerAcceptanceFact]
    public async Task Independent_api_replicas_share_the_import_lease_and_concurrent_retries_are_idempotent()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var tenantId = Guid.NewGuid();
        var databaseName = $"AIERP_TcmbReplicaAcceptance_{Guid.NewGuid():N}";
        var connectionString = new SqlConnectionStringBuilder(configuredConnection)
        {
            InitialCatalog = databaseName,
            ConnectTimeout = 15,
            TrustServerCertificate = true
        }.ConnectionString;
        var options = new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(connectionString).Options;
        var databaseCreated = false;
        try
        {
            await using (var setup = new TenantDbContext(options))
            {
                databaseCreated = await setup.Database.EnsureCreatedAsync();
                Assert.True(databaseCreated);
                setup.Tenants.Add(new Tenant { Id = tenantId, Name = "Synthetic TCMB replica tenant", Slug = $"tcmb-replica-{tenantId:N}" });
                await setup.SaveChangesAsync();
            }

            // Two independently opened sessions model separate API hosts.
            await using (var firstHostLease = await TcmbImportLease.TryAcquireAsync(connectionString, CancellationToken.None))
            {
                Assert.NotNull(firstHostLease);
                var competingHostLease = await TcmbImportLease.TryAcquireAsync(connectionString, CancellationToken.None);
                Assert.Null(competingHostLease);
            }
            await using (var nextHostLease = await TcmbImportLease.TryAcquireAsync(connectionString, CancellationToken.None))
                Assert.NotNull(nextHostLease);

            var snapshot = new TcmbRateSnapshot(new DateOnly(2026, 10, 21), new Dictionary<string, decimal>
            {
                ["TRY"] = 1m,
                ["USD"] = 50m,
                ["EUR"] = 55m
            });
            var startGate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            async Task<TcmbExchangeRateImportResult> ImportFromReplicaAsync()
            {
                await using var replicaDb = new TenantDbContext(options);
                await startGate.Task;
                return await TcmbExchangeRateImporter.ImportAsync(replicaDb, tenantId, snapshot, CancellationToken.None);
            }

            var firstRetry = ImportFromReplicaAsync();
            var secondRetry = ImportFromReplicaAsync();
            startGate.SetResult();
            var retries = await Task.WhenAll(firstRetry, secondRetry);

            Assert.Equal(2, retries.Sum(x => x.Imported));
            Assert.Equal(2, retries.Sum(x => x.Skipped));
            await using var verify = new TenantDbContext(options);
            Assert.Equal(2, await verify.TenantExchangeRates.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(2, await verify.AuditEvents.CountAsync(x => x.TenantId == tenantId && x.Action == "finance.exchange-rate.imported"));
        }
        finally
        {
            if (databaseCreated)
            {
                await using var cleanup = new TenantDbContext(options);
                await cleanup.Database.EnsureDeletedAsync();
            }
        }
    }

    private sealed class StaticResponseHandler(string content) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal("https://www.tcmb.gov.tr/kurlar/today.xml", request.RequestUri?.AbsoluteUri);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(content)
            });
        }
    }

    private sealed class TrackingLease : IAsyncDisposable
    {
        public bool IsDisposed { get; private set; }
        public int DisposeCount { get; private set; }

        public ValueTask DisposeAsync()
        {
            IsDisposed = true;
            DisposeCount++;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class CallbackLease(Action onDispose) : IAsyncDisposable
    {
        public ValueTask DisposeAsync()
        {
            onDispose();
            return ValueTask.CompletedTask;
        }
    }
}
