using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;

internal sealed class TenantProvisioningWorker : BackgroundService
{
    private const int MaximumAttempts = 3;
    private static readonly TimeSpan IdleDelay = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan LeaseDuration = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan LeaseRenewalInterval = TimeSpan.FromSeconds(45);

    private readonly string _platformConnection;
    private readonly string _dataRuntimeLogin;
    private readonly string? _separationBackupPath;
    private readonly ILogger<TenantProvisioningWorker> _logger;
    private readonly string _workerId = Guid.NewGuid().ToString("N");

    public TenantProvisioningWorker(IConfiguration configuration, ILogger<TenantProvisioningWorker> logger)
    {
        _platformConnection = configuration.GetConnectionString("Provisioning")
            ?? throw new InvalidOperationException("ConnectionStrings:Provisioning is required.");
        _dataRuntimeLogin = configuration["Database:DataRuntimeLogin"] ?? "aierp_data_runtime";
        _separationBackupPath = configuration["Database:SeparationBackupPath"];
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var job = await ClaimNextAsync(stoppingToken);
                if (job is null)
                {
                    await Task.Delay(IdleDelay, stoppingToken);
                    continue;
                }

                await ProcessAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                _logger.LogError("Tenant provisioning queue iteration failed ({ErrorType}).", exception.GetType().Name);
                try { await Task.Delay(IdleDelay, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            }
        }
    }

    private async Task<ClaimedJob?> ClaimNextAsync(CancellationToken cancellationToken)
    {
        await using var connection = new SqlConnection(_platformConnection);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        await using (var exhausted = connection.CreateCommand())
        {
            exhausted.Transaction = transaction;
            exhausted.CommandText = """
                DECLARE @exhausted TABLE ([TenantId] uniqueidentifier NOT NULL, [RequestedByUserId] uniqueidentifier NOT NULL);
                ;WITH [exhaustedJobs] AS
                (
                    SELECT TOP (100) *
                    FROM [dbo].[TenantProvisioningJobs] WITH (UPDLOCK, READPAST, ROWLOCK)
                    WHERE [AttemptCount] >= @maximumAttempts
                      AND ([Status] = @queued OR
                           ([Status] = @running AND ([LeaseExpiresAt] IS NULL OR [LeaseExpiresAt] <= SYSUTCDATETIME())))
                    ORDER BY [UpdatedAt], [CreatedAt]
                )
                UPDATE [exhaustedJobs]
                SET [Status] = @failed, [CompletedAt] = SYSUTCDATETIME(), [UpdatedAt] = SYSUTCDATETIME(),
                    [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL, [ErrorCode] = @errorCode
                OUTPUT inserted.[TenantId], inserted.[RequestedByUserId] INTO @exhausted ([TenantId], [RequestedByUserId]);
                UPDATE [tenant]
                SET [IsActive] = 0
                FROM [dbo].[Tenants] AS [tenant]
                INNER JOIN @exhausted AS [job] ON [job].[TenantId] = [tenant].[Id];
                INSERT INTO [dbo].[AuditEvents] ([TenantId], [UserId], [Action], [Resource], [OccurredAt])
                SELECT [TenantId], [RequestedByUserId], N'tenant.provisioning.failed', @errorCode, SYSUTCDATETIME()
                FROM @exhausted;
                """;
            exhausted.Parameters.AddWithValue("@maximumAttempts", MaximumAttempts);
            exhausted.Parameters.AddWithValue("@queued", (int)TenantProvisioningJobStatus.Queued);
            exhausted.Parameters.AddWithValue("@running", (int)TenantProvisioningJobStatus.Running);
            exhausted.Parameters.AddWithValue("@failed", (int)TenantProvisioningJobStatus.Failed);
            exhausted.Parameters.AddWithValue("@errorCode", "tenant_database_provisioning_interrupted");
            await exhausted.ExecuteNonQueryAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            ;WITH [nextJob] AS
            (
                SELECT TOP (1) *
                FROM [dbo].[TenantProvisioningJobs] WITH (UPDLOCK, READPAST, ROWLOCK)
                WHERE [AttemptCount] < @maximumAttempts
                  AND (([Status] = @queued AND [NextAttemptAt] <= SYSUTCDATETIME())
                    OR ([Status] = @running AND ([LeaseExpiresAt] IS NULL OR [LeaseExpiresAt] <= SYSUTCDATETIME())))
                ORDER BY [NextAttemptAt], [CreatedAt]
            )
            UPDATE [nextJob]
            SET [Status] = @running,
                [AttemptCount] = [AttemptCount] + 1,
                [UpdatedAt] = SYSUTCDATETIME(),
                [LeaseOwner] = @workerId,
                [LeaseExpiresAt] = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME())
            OUTPUT inserted.[Id], inserted.[TenantId], inserted.[RequestedByUserId], inserted.[AttemptCount];
            """;
        command.Parameters.AddWithValue("@queued", (int)TenantProvisioningJobStatus.Queued);
        command.Parameters.AddWithValue("@running", (int)TenantProvisioningJobStatus.Running);
        command.Parameters.AddWithValue("@maximumAttempts", MaximumAttempts);
        command.Parameters.AddWithValue("@workerId", _workerId);
        command.Parameters.AddWithValue("@leaseSeconds", (int)LeaseDuration.TotalSeconds);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            await reader.DisposeAsync();
            await transaction.CommitAsync(cancellationToken);
            return null;
        }
        var job = new ClaimedJob(reader.GetGuid(0), reader.GetGuid(1), reader.GetGuid(2), reader.GetInt32(3));
        await reader.DisposeAsync();
        await transaction.CommitAsync(cancellationToken);
        return job;
    }

    private async Task ProcessAsync(ClaimedJob job, CancellationToken stoppingToken)
    {
        using var workCancellation = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var leaseLost = 0;
        var renewal = RenewLeaseAsync(job, workCancellation, () => Interlocked.Exchange(ref leaseLost, 1), stoppingToken);
        Exception? failure = null;
        try
        {
            var provisioner = new TenantDatabaseProvisioner(_platformConnection, _dataRuntimeLogin, _separationBackupPath);
            await provisioner.ProvisionAsync(job.TenantId, workCancellation.Token);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested || Volatile.Read(ref leaseLost) != 0) { }
        catch (Exception exception)
        {
            failure = exception;
            _logger.LogError("Tenant database provisioning failed for job {JobId} ({ErrorType}).", job.Id, exception.GetType().Name);
        }
        finally
        {
            workCancellation.Cancel();
            try { await renewal; }
            catch (OperationCanceledException) when (workCancellation.IsCancellationRequested) { }
        }

        if (stoppingToken.IsCancellationRequested || Volatile.Read(ref leaseLost) != 0) return;
        if (failure is null)
        {
            if (!await CompleteAsync(job, stoppingToken))
                await RecordFailureAsync(job, "tenant_database_not_ready", stoppingToken);
        }
        else
        {
            await RecordFailureAsync(job, "tenant_database_provisioning_failed", stoppingToken);
        }
    }

    private async Task RenewLeaseAsync(ClaimedJob job, CancellationTokenSource workCancellation,
        Action markLeaseLost, CancellationToken stoppingToken)
    {
        try
        {
            using var timer = new PeriodicTimer(LeaseRenewalInterval);
            while (await timer.WaitForNextTickAsync(workCancellation.Token))
            {
                await using var connection = new SqlConnection(_platformConnection);
                await connection.OpenAsync(workCancellation.Token);
                await using var command = connection.CreateCommand();
                command.CommandText = """
                    UPDATE [dbo].[TenantProvisioningJobs]
                    SET [LeaseExpiresAt] = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
                        [UpdatedAt] = SYSUTCDATETIME()
                    WHERE [Id] = @jobId AND [Status] = @running AND [LeaseOwner] = @workerId;
                    """;
                command.Parameters.AddWithValue("@leaseSeconds", (int)LeaseDuration.TotalSeconds);
                command.Parameters.AddWithValue("@jobId", job.Id);
                command.Parameters.AddWithValue("@running", (int)TenantProvisioningJobStatus.Running);
                command.Parameters.AddWithValue("@workerId", _workerId);
                if (await command.ExecuteNonQueryAsync(workCancellation.Token) != 1)
                {
                    markLeaseLost();
                    workCancellation.Cancel();
                    return;
                }
            }
        }
        catch (OperationCanceledException) when (workCancellation.IsCancellationRequested || stoppingToken.IsCancellationRequested) { }
        catch (Exception exception)
        {
            _logger.LogError("Tenant provisioning lease renewal failed for job {JobId} ({ErrorType}).", job.Id, exception.GetType().Name);
            markLeaseLost();
            workCancellation.Cancel();
        }
    }

    private async Task<bool> CompleteAsync(ClaimedJob job, CancellationToken cancellationToken)
    {
        await using var connection = new SqlConnection(_platformConnection);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE [dbo].[TenantProvisioningJobs]
            SET [Status] = @completed, [CompletedAt] = SYSUTCDATETIME(), [UpdatedAt] = SYSUTCDATETIME(),
                [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL, [ErrorCode] = NULL
            WHERE [Id] = @jobId AND [TenantId] = @tenantId AND [Status] = @running AND [LeaseOwner] = @workerId
              AND EXISTS (SELECT 1 FROM [dbo].[TenantDatabaseCatalog] WHERE [TenantId] = @tenantId AND [State] = @ready);
            IF @@ROWCOUNT = 1
            BEGIN
                UPDATE [dbo].[Tenants] SET [IsActive] = 1 WHERE [Id] = @tenantId;
                INSERT INTO [dbo].[AuditEvents] ([TenantId], [UserId], [Action], [Resource], [OccurredAt])
                VALUES (@tenantId, @requestedByUserId, N'tenant.provisioning.ready', CONVERT(nvarchar(36), @tenantId), SYSUTCDATETIME());
            END;
            SELECT @@ROWCOUNT;
            """;
        command.Parameters.AddWithValue("@completed", (int)TenantProvisioningJobStatus.Completed);
        command.Parameters.AddWithValue("@jobId", job.Id);
        command.Parameters.AddWithValue("@tenantId", job.TenantId);
        command.Parameters.AddWithValue("@running", (int)TenantProvisioningJobStatus.Running);
        command.Parameters.AddWithValue("@workerId", _workerId);
        command.Parameters.AddWithValue("@ready", (int)TenantDatabaseProvisioningState.Ready);
        command.Parameters.AddWithValue("@requestedByUserId", job.RequestedByUserId);
        var affected = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
        await transaction.CommitAsync(cancellationToken);
        return affected == 1;
    }

    private async Task RecordFailureAsync(ClaimedJob job, string errorCode, CancellationToken cancellationToken)
    {
        await using var connection = new SqlConnection(_platformConnection);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            UPDATE [dbo].[TenantProvisioningJobs]
            SET [Status] = CASE WHEN [AttemptCount] >= @maximumAttempts THEN @failed ELSE @queued END,
                [CompletedAt] = CASE WHEN [AttemptCount] >= @maximumAttempts THEN SYSUTCDATETIME() ELSE NULL END,
                [NextAttemptAt] = CASE WHEN [AttemptCount] >= @maximumAttempts THEN [NextAttemptAt]
                    ELSE DATEADD(SECOND, @retryDelaySeconds, SYSUTCDATETIME()) END,
                [UpdatedAt] = SYSUTCDATETIME(), [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL,
                [ErrorCode] = @errorCode
            WHERE [Id] = @jobId AND [Status] = @running AND [LeaseOwner] = @workerId;
            IF @@ROWCOUNT = 1 AND EXISTS
                (SELECT 1 FROM [dbo].[TenantProvisioningJobs] WHERE [Id] = @jobId AND [Status] = @failed)
            BEGIN
                UPDATE [dbo].[Tenants] SET [IsActive] = 0 WHERE [Id] = @tenantId;
                INSERT INTO [dbo].[AuditEvents] ([TenantId], [UserId], [Action], [Resource], [OccurredAt])
                VALUES (@tenantId, @requestedByUserId, N'tenant.provisioning.failed', @errorCode, SYSUTCDATETIME());
            END;
            """;
        command.Parameters.AddWithValue("@maximumAttempts", MaximumAttempts);
        command.Parameters.AddWithValue("@failed", (int)TenantProvisioningJobStatus.Failed);
        command.Parameters.AddWithValue("@queued", (int)TenantProvisioningJobStatus.Queued);
        command.Parameters.AddWithValue("@retryDelaySeconds", Math.Min(600, 30 * (1 << Math.Max(0, job.AttemptCount - 1))));
        command.Parameters.AddWithValue("@errorCode", errorCode);
        command.Parameters.AddWithValue("@jobId", job.Id);
        command.Parameters.AddWithValue("@tenantId", job.TenantId);
        command.Parameters.AddWithValue("@running", (int)TenantProvisioningJobStatus.Running);
        command.Parameters.AddWithValue("@workerId", _workerId);
        command.Parameters.AddWithValue("@requestedByUserId", job.RequestedByUserId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private sealed record ClaimedJob(Guid Id, Guid TenantId, Guid RequestedByUserId, int AttemptCount);
}
