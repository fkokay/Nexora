using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;

namespace AIERP.Platform.UnitTests;

public sealed class TenantDatabaseProvisionerTests
{
    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, 1)]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, 2)]
    public void Signed_sql_component_contract_maps_zero_based_enum_to_one_based_code(
        TenantSqlDatabaseComponent component, byte expectedCode)
    {
        Assert.Equal(expectedCode, TenantDatabaseProvisioner.ComponentCode(component));
    }

    [Fact]
    public void Signed_sql_component_contract_rejects_unknown_enum_values()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            TenantDatabaseProvisioner.ComponentCode((TenantSqlDatabaseComponent)255));
    }

    [Fact]
    public async Task Shared_AIStudio_database_provisioning_is_rejected_before_database_access()
    {
        var provisioner = new TenantDatabaseProvisioner("Server=invalid;Database=AIERPPlatform;User Id=unused;Password=unused");

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => provisioner.ProvisionAIStudioAsync());

        Assert.Contains("separate AIERPStudio_", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(TenantSqlDatabaseComponent.Erp, "AIERPTenant_", "aierp_t_")]
    [InlineData(TenantSqlDatabaseComponent.AiStudio, "AIERPStudio_", "aierp_s_")]
    public void Tenant_runtime_credentials_use_unique_database_and_login_identity(TenantSqlDatabaseComponent component,
        string databasePrefix, string loginPrefix)
    {
        var tenantId = Guid.NewGuid();

        var first = TenantDatabaseProvisioner.CreateTenantRuntimeCredential(tenantId, component);
        var second = TenantDatabaseProvisioner.CreateTenantRuntimeCredential(tenantId, component);

        Assert.Equal($"{databasePrefix}{tenantId:N}", first.DatabaseName);
        Assert.Equal($"{loginPrefix}{tenantId:N}", first.UserName);
        Assert.True(TenantSqlCredentialPath.IsValidUserName(tenantId, component, first.UserName));
        Assert.Equal(64, first.Password.Length);
        Assert.NotEqual(first.Password, second.Password);
    }

    [Theory]
    [InlineData("Provider error: {\"password\":\"p@ss, with spaces\",\"client_secret\":\"client-value\"}", "p@ss, with spaces|client-value")]
    [InlineData("client_secret:secret-value, api-key: api-value", "secret-value|api-value")]
    [InlineData("pwd=plain-password; access token='token with spaces'", "plain-password|token with spaces")]
    [InlineData("Authorization: Bearer direct-bearer-sentinel", "direct-bearer-sentinel")]
    [InlineData("Authorization: Basic basic-sentinel", "basic-sentinel")]
    [InlineData("access token: Bearer bearer-sentinel", "bearer-sentinel")]
    [InlineData("SharedAccessSignature=shared-access-sentinel", "shared-access-sentinel")]
    [InlineData("SharedAccessSignature sr=resource-sentinel&sig=shared-signature-sentinel&se=2030", "resource-sentinel|shared-signature-sentinel|2030")]
    [InlineData("sig=standalone-signature-sentinel", "standalone-signature-sentinel")]
    [InlineData("api_key=underscored-api-key-sentinel; apikey=plain-api-key-sentinel", "underscored-api-key-sentinel|plain-api-key-sentinel")]
    public void Provisioning_diagnostic_redacts_json_and_delimited_secrets(string message, string secrets)
    {
        var diagnostic = TenantDatabaseProvisioner.FormatSafeMigrationError(new InvalidOperationException(message));

        foreach (var secret in secrets.Split('|'))
            Assert.DoesNotContain(secret, diagnostic, StringComparison.Ordinal);
        Assert.Contains("[REDACTED]", diagnostic, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Password: colon secret sentinel with spaces; operation=ALTER TABLE; migration phase failed.")]
    [InlineData("Password: colon secret sentinel with spaces operation=ALTER TABLE; migration phase failed.")]
    public void Provisioning_diagnostic_redacts_full_colon_value_and_preserves_following_clauses(string message)
    {
        const string secret = "colon secret sentinel with spaces";

        var diagnostic = TenantDatabaseProvisioner.FormatSafeMigrationError(new InvalidOperationException(message));

        Assert.DoesNotContain(secret, diagnostic, StringComparison.Ordinal);
        Assert.Contains("operation=ALTER TABLE; migration phase failed.", diagnostic, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("User ID=operator; operation=connect", "operator")]
    [InlineData("Account: finance integration; operation=connect", "finance integration")]
    public void Provisioning_diagnostic_redacts_account_identifiers(string message, string identifier)
    {
        var diagnostic = TenantDatabaseProvisioner.FormatSafeMigrationError(new InvalidOperationException(message));

        Assert.DoesNotContain(identifier, diagnostic, StringComparison.Ordinal);
        Assert.Contains("[REDACTED]", diagnostic, StringComparison.Ordinal);
        Assert.Contains("operation=connect", diagnostic, StringComparison.Ordinal);
    }

    [Fact]
    public void Provisioning_diagnostic_redaction_is_case_invariant_under_turkish_culture()
    {
        var originalCulture = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo("tr-TR");

            var diagnostic = TenantDatabaseProvisioner.FormatSafeMigrationError(
                new InvalidOperationException("User ID=operator; Password=secret-value; operation=connect"));

            Assert.DoesNotContain("operator", diagnostic, StringComparison.Ordinal);
            Assert.DoesNotContain("secret-value", diagnostic, StringComparison.Ordinal);
            Assert.Contains("[REDACTED]", diagnostic, StringComparison.Ordinal);
            Assert.Contains("operation=connect", diagnostic, StringComparison.Ordinal);
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = originalCulture;
        }
    }

    [Fact]
    public void Provisioning_diagnostic_is_capped_at_1900_characters()
    {
        var diagnostic = TenantDatabaseProvisioner.FormatSafeMigrationError(
            new InvalidOperationException(new string('x', 2500)));

        Assert.Equal(1900, diagnostic.Length);
    }

    [Fact]
    public void AIStudio_error_diagnostic_formatter_redacts_secrets_and_respects_storage_limit()
    {
        const string secret = "studio-client-secret-value";
        var exception = new InvalidOperationException(
            $"AIStudio provider error: {{\"client_secret\":\"{secret}\"}} {new string('x', 2500)}");

        var diagnostic = TenantDatabaseProvisioner.FormatSafeMigrationError(exception);

        Assert.DoesNotContain(secret, diagnostic, StringComparison.Ordinal);
        Assert.Contains("[REDACTED]", diagnostic, StringComparison.Ordinal);
        Assert.Equal(1900, diagnostic.Length);
    }

    [Fact]
    public void Provisioning_verification_rejects_catalog_entry_for_a_different_tenant()
    {
        var tenantId = Guid.NewGuid();
        var entry = new TenantDatabaseCatalogEntry
        {
            TenantId = Guid.NewGuid(),
            DatabaseName = $"AIERPTenant_{tenantId:N}",
            State = TenantDatabaseProvisioningState.Copying
        };

        Assert.Throws<InvalidOperationException>(() =>
            TenantDatabaseSeparationVerifier.GetTenantDatabaseNameForVerification(
                tenantId, entry, TenantDatabaseProvisioningState.Copying));
    }

    [Fact]
    public void Provisioning_verification_rejects_unexpected_database_name()
    {
        var tenantId = Guid.NewGuid();
        var entry = new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId,
            DatabaseName = "AIERPPlatform",
            State = TenantDatabaseProvisioningState.Copying
        };

        Assert.Throws<InvalidOperationException>(() =>
            TenantDatabaseSeparationVerifier.GetTenantDatabaseNameForVerification(
                tenantId, entry, TenantDatabaseProvisioningState.Copying));
    }

    [Fact]
    public void Studio_provisioning_verification_rejects_the_legacy_shared_database_state()
    {
        var tenantId = Guid.NewGuid();
        var legacyState = new DatabaseSeparationComponentState
        {
            Component = "AIStudio",
            DatabaseName = "AIERPStudio",
            State = TenantDatabaseProvisioningState.Copying
        };

        Assert.Throws<InvalidOperationException>(() => TenantDatabaseSeparationVerifier.GetStudioDatabaseNameForVerification(
            tenantId, legacyState, TenantDatabaseProvisioningState.Copying));
    }

    [Fact]
    public void Provisioning_verification_rejects_catalog_entry_not_in_copying_state()
    {
        var tenantId = Guid.NewGuid();
        var entry = new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId,
            DatabaseName = $"AIERPTenant_{tenantId:N}",
            State = TenantDatabaseProvisioningState.Ready
        };

        Assert.Throws<InvalidOperationException>(() =>
            TenantDatabaseSeparationVerifier.GetTenantDatabaseNameForVerification(
                tenantId, entry, TenantDatabaseProvisioningState.Copying));
    }

    [Fact]
    public async Task Ready_database_migration_verifies_copying_catalog_before_persisting_ready()
    {
        var tenantId = Guid.NewGuid();
        var entry = new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId,
            DatabaseName = $"AIERPTenant_{tenantId:N}",
            State = TenantDatabaseProvisioningState.Ready
        };
        string? error = "previous error";
        var observedStates = new List<TenantDatabaseProvisioningState>();
        var operations = new List<string>();

        await TenantDatabaseProvisioner.RunProvisioningStepsAsync(
            _ => { operations.Add("create"); return Task.CompletedTask; },
            _ => { operations.Add("migrate"); return Task.CompletedTask; },
            _ => { operations.Add("grant"); return Task.CompletedTask; },
            _ =>
            {
                operations.Add("verify");
                Assert.Equal($"AIERPTenant_{tenantId:N}", TenantDatabaseSeparationVerifier.GetTenantDatabaseNameForVerification(
                    tenantId, entry, TenantDatabaseProvisioningState.Copying));
                Assert.Equal(TenantDatabaseProvisioningState.Copying, entry.State);
                return Task.CompletedTask;
            },
            (nextState, diagnostic, _) =>
            {
                entry.State = nextState;
                error = diagnostic;
                observedStates.Add(nextState);
                operations.Add($"persist:{nextState}");
                return Task.CompletedTask;
            },
            CancellationToken.None,
            copyTenantRows: _ => { operations.Add("copy"); return Task.CompletedTask; });

        Assert.Equal(new[] { TenantDatabaseProvisioningState.Copying, TenantDatabaseProvisioningState.Ready }, observedStates);
        Assert.Equal(new[] { "persist:Copying", "create", "migrate", "grant", "copy", "verify", "persist:Ready" }, operations);
        Assert.Equal(TenantDatabaseProvisioningState.Ready, entry.State);
        Assert.Null(error);
    }

    [Fact]
    public async Task AIStudio_provisioning_verifies_copying_component_before_persisting_ready()
    {
        var tenantId = Guid.NewGuid();
        var state = new DatabaseSeparationComponentState
        {
            Component = TenantDatabaseRouting.StudioComponentKey(tenantId),
            DatabaseName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio),
            State = TenantDatabaseProvisioningState.Ready
        };
        var operations = new List<string>();

        await TenantDatabaseProvisioner.RunProvisioningStepsAsync(
            _ => { operations.Add("create"); return Task.CompletedTask; },
            _ => { operations.Add("migrate"); return Task.CompletedTask; },
            _ => { operations.Add("grant"); return Task.CompletedTask; },
            _ =>
            {
                operations.Add("verify");
                Assert.Equal(TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio),
                    TenantDatabaseSeparationVerifier.GetStudioDatabaseNameForVerification(tenantId, state, TenantDatabaseProvisioningState.Copying));
                Assert.Equal(TenantDatabaseProvisioningState.Copying, state.State);
                return Task.CompletedTask;
            },
            (nextState, _, _) =>
            {
                state.State = nextState;
                operations.Add($"persist:{nextState}");
                return Task.CompletedTask;
            },
            CancellationToken.None,
            copyTenantRows: _ => { operations.Add("copy tenants"); return Task.CompletedTask; });

        Assert.Equal(new[]
        {
            "persist:Copying", "create", "migrate", "grant", "copy tenants", "verify", "persist:Ready"
        }, operations);
        Assert.Equal(TenantDatabaseProvisioningState.Ready, state.State);
    }

    [Theory]
    [InlineData(TenantDatabaseProvisioningState.Failed)]
    [InlineData(TenantDatabaseProvisioningState.Copying)]
    public async Task AIStudio_with_ready_timestamp_retries_migrations_without_copying_rows(TenantDatabaseProvisioningState initialState)
    {
        var tenantId = Guid.NewGuid();
        var state = new DatabaseSeparationComponentState
        {
            Component = TenantDatabaseRouting.StudioComponentKey(tenantId),
            DatabaseName = TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio),
            State = initialState,
            ReadyAt = DateTimeOffset.UtcNow.AddMinutes(-5)
        };
        var operations = new List<string>();

        var handledAsMigrationRetry = await TenantDatabaseProvisioner.DispatchProvisioningAsync(
            state.State,
            state.ReadyAt,
            token => TenantDatabaseProvisioner.RunProvisioningStepsAsync(
                _ => { operations.Add("exists"); return Task.CompletedTask; },
                _ => { operations.Add("migrate"); return Task.CompletedTask; },
                _ => { operations.Add("grant"); return Task.CompletedTask; },
                _ =>
                {
                    operations.Add("verify");
                    Assert.Equal(TenantSqlCredentialPath.DatabaseName(tenantId, TenantSqlDatabaseComponent.AiStudio),
                        TenantDatabaseSeparationVerifier.GetStudioDatabaseNameForVerification(tenantId, state, TenantDatabaseProvisioningState.Copying));
                    return Task.CompletedTask;
                },
                (nextState, _, _) =>
                {
                    state.State = nextState;
                    operations.Add($"persist:{nextState}");
                    return Task.CompletedTask;
                },
                token),
            () =>
            {
                operations.Add("copy");
                return Task.CompletedTask;
            },
            CancellationToken.None);

        Assert.True(handledAsMigrationRetry);
        Assert.Equal(new[] { "persist:Copying", "exists", "migrate", "grant", "verify", "persist:Ready" }, operations);
        Assert.DoesNotContain("copy", operations);
        Assert.Equal(TenantDatabaseProvisioningState.Ready, state.State);
    }

    [Fact]
    public async Task AIStudio_legacy_ready_row_keeps_copy_protection_after_failed_migration_retry()
    {
        var state = new DatabaseSeparationComponentState
        {
            Component = "AIStudio",
            DatabaseName = "AIERPStudio",
            State = TenantDatabaseProvisioningState.Ready,
            ReadyAt = null
        };
        var firstAttemptAt = DateTimeOffset.UtcNow;

        TenantDatabaseProvisioner.ApplyAIStudioProvisioningState(
            state, TenantDatabaseProvisioningState.Copying, null, firstAttemptAt);
        TenantDatabaseProvisioner.ApplyAIStudioProvisioningState(
            state, TenantDatabaseProvisioningState.Failed, "migration failed", firstAttemptAt.AddSeconds(1));

        Assert.NotNull(state.ReadyAt);
        Assert.Equal(TenantDatabaseProvisioningState.Failed, state.State);
        var migrationRetries = 0;
        var rowCopies = 0;
        var handledAsMigrationRetry = await TenantDatabaseProvisioner.DispatchProvisioningAsync(
            state.State,
            state.ReadyAt,
            _ => { migrationRetries++; return Task.CompletedTask; },
            () => { rowCopies++; return Task.CompletedTask; },
            CancellationToken.None);

        Assert.True(handledAsMigrationRetry);
        Assert.Equal(1, migrationRetries);
        Assert.Equal(0, rowCopies);
    }

    [Fact]
    public async Task AIStudio_initial_cancellation_persists_failed_with_a_non_cancelable_token()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var state = new DatabaseSeparationComponentState
        {
            Component = "AIStudio",
            DatabaseName = "AIERPStudio",
            State = TenantDatabaseProvisioningState.Ready
        };
        CancellationToken? failurePersistToken = null;

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => TenantDatabaseProvisioner.RunProvisioningStepsAsync(
            token =>
            {
                token.ThrowIfCancellationRequested();
                return Task.CompletedTask;
            },
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            (nextState, _, token) =>
            {
                state.State = nextState;
                if (nextState == TenantDatabaseProvisioningState.Failed)
                    failurePersistToken = token;
                return Task.CompletedTask;
            },
            cancellation.Token));

        Assert.Equal(TenantDatabaseProvisioningState.Failed, state.State);
        Assert.Equal(CancellationToken.None, failurePersistToken);
    }

    [Fact]
    public async Task Ready_database_migration_failure_marks_catalog_failed_with_sanitized_diagnostic()
    {
        var state = TenantDatabaseProvisioningState.Ready;
        string? error = null;
        var observedStates = new List<TenantDatabaseProvisioningState>();

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            TenantDatabaseProvisioner.RunProvisioningStepsAsync(
                _ => Task.CompletedTask,
                _ =>
                {
                    Assert.Equal(TenantDatabaseProvisioningState.Copying, state);
                    throw new InvalidOperationException("Migration failed: User ID=operator; Password=secret-value; Authorization: Bearer bearer-value; operation=ALTER TABLE");
                },
                _ => Task.CompletedTask,
                _ => Task.CompletedTask,
                (nextState, diagnostic, persistToken) =>
                {
                    state = nextState;
                    error = diagnostic;
                    if (nextState == TenantDatabaseProvisioningState.Failed)
                        Assert.Equal(CancellationToken.None, persistToken);
                    observedStates.Add(nextState);
                    return Task.CompletedTask;
                },
                CancellationToken.None));

        Assert.Equal("Migration failed: User ID=operator; Password=secret-value; Authorization: Bearer bearer-value; operation=ALTER TABLE", exception.Message);
        Assert.Equal(new[] { TenantDatabaseProvisioningState.Copying, TenantDatabaseProvisioningState.Failed }, observedStates);
        Assert.Equal(TenantDatabaseProvisioningState.Failed, state);
        Assert.Contains("InvalidOperationException", error);
        Assert.Contains("[REDACTED]", error);
        Assert.DoesNotContain("secret-value", error);
        Assert.DoesNotContain("operator", error);
        Assert.DoesNotContain("bearer-value", error);
    }

    [Fact]
    public async Task Cancelled_provisioning_records_failure_with_an_independent_token()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var state = TenantDatabaseProvisioningState.Ready;
        CancellationToken? failurePersistToken = null;

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => TenantDatabaseProvisioner.RunProvisioningStepsAsync(
            token =>
            {
                token.ThrowIfCancellationRequested();
                return Task.CompletedTask;
            },
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            (nextState, _, token) =>
            {
                state = nextState;
                if (nextState == TenantDatabaseProvisioningState.Failed)
                    failurePersistToken = token;
                return Task.CompletedTask;
            },
            cancellation.Token));

        Assert.Equal(TenantDatabaseProvisioningState.Failed, state);
        Assert.Equal(CancellationToken.None, failurePersistToken);
    }

    [Fact]
    public async Task Failed_migration_retry_with_ready_timestamp_preserves_isolated_tenant_rows()
    {
        var readyAt = DateTimeOffset.UtcNow.AddMinutes(-5);
        var state = TenantDatabaseProvisioningState.Failed;
        var isolatedTargetRows = new List<string> { "tenant-specific-isolated-value" };
        var staleLegacyRows = new List<string> { "stale-legacy-value" };
        var operations = new List<string>();

        Assert.True(TenantDatabaseProvisioner.ShouldUseMigrationOnlyRetry(state, readyAt));

        var migrationRetryHandled = await TenantDatabaseProvisioner.DispatchProvisioningAsync(
            state,
            readyAt,
            token => TenantDatabaseProvisioner.RunProvisioningStepsAsync(
                _ => Task.CompletedTask,
                _ =>
                {
                    operations.Add("migrate");
                    return Task.CompletedTask;
                },
                _ =>
                {
                    operations.Add("grant");
                    return Task.CompletedTask;
                },
                _ => Task.CompletedTask,
                (nextState, _, _) =>
                {
                    state = nextState;
                    return Task.CompletedTask;
                },
                token),
            () =>
            {
                operations.Add("copy");
                return Task.CompletedTask;
            },
            CancellationToken.None);

        Assert.True(migrationRetryHandled);
        Assert.Equal(new[] { "migrate", "grant" }, operations);
        Assert.Equal(new[] { "tenant-specific-isolated-value" }, isolatedTargetRows);
        Assert.Equal(new[] { "stale-legacy-value" }, staleLegacyRows);
        Assert.Equal(TenantDatabaseProvisioningState.Ready, state);
    }

    [Fact]
    public async Task Failed_migration_retry_with_missing_database_marks_failed_without_migration_or_copy()
    {
        var state = TenantDatabaseProvisioningState.Failed;
        var operations = new List<string>();
        var readyAt = DateTimeOffset.UtcNow.AddMinutes(-5);
        string? diagnostic = null;

        await Assert.ThrowsAsync<InvalidOperationException>(() => TenantDatabaseProvisioner.DispatchProvisioningAsync(
            state,
            readyAt,
            token => TenantDatabaseProvisioner.RunProvisioningStepsAsync(
                _ => throw new InvalidOperationException("Tenant database is missing."),
                _ =>
                {
                    operations.Add("migrate");
                    return Task.CompletedTask;
                },
                _ => Task.CompletedTask,
                _ => Task.CompletedTask,
                (nextState, error, _) =>
                {
                    state = nextState;
                    diagnostic = error;
                    return Task.CompletedTask;
                },
                token),
            () =>
            {
                operations.Add("copy");
                return Task.CompletedTask;
            },
            CancellationToken.None));

        Assert.Empty(operations);
        Assert.Equal(TenantDatabaseProvisioningState.Failed, state);
        Assert.Contains("Tenant database is missing", diagnostic);
    }

    [Fact]
    public async Task Ready_state_is_not_persisted_when_tenant_verification_fails()
    {
        var tenantId = Guid.NewGuid();
        var entry = new TenantDatabaseCatalogEntry
        {
            TenantId = tenantId,
            DatabaseName = $"AIERPTenant_{tenantId:N}",
            State = TenantDatabaseProvisioningState.Ready
        };
        var observedStates = new List<TenantDatabaseProvisioningState>();

        await Assert.ThrowsAsync<InvalidOperationException>(() => TenantDatabaseProvisioner.RunProvisioningStepsAsync(
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            token =>
            {
                _ = TenantDatabaseSeparationVerifier.GetTenantDatabaseNameForVerification(
                    tenantId, entry, TenantDatabaseProvisioningState.Copying);
                throw new InvalidOperationException("Tenant verification failed.");
            },
            (nextState, _, _) =>
            {
                entry.State = nextState;
                observedStates.Add(nextState);
                return Task.CompletedTask;
            },
            CancellationToken.None));

        Assert.Equal(new[] { TenantDatabaseProvisioningState.Copying, TenantDatabaseProvisioningState.Failed }, observedStates);
        Assert.Equal(TenantDatabaseProvisioningState.Failed, entry.State);
    }

    [Fact]
    public async Task Cancellation_marks_catalog_failed_with_a_non_cancelable_write()
    {
        using var cancellation = new CancellationTokenSource();
        var state = TenantDatabaseProvisioningState.Ready;
        var observedStates = new List<TenantDatabaseProvisioningState>();
        var failureWriteWasCanceled = true;

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => TenantDatabaseProvisioner.RunProvisioningStepsAsync(
            _ =>
            {
                cancellation.Cancel();
                return Task.FromCanceled(cancellation.Token);
            },
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            _ => Task.CompletedTask,
            (nextState, _, token) =>
            {
                state = nextState;
                observedStates.Add(nextState);
                if (nextState == TenantDatabaseProvisioningState.Failed)
                    failureWriteWasCanceled = token.IsCancellationRequested;
                return Task.CompletedTask;
            },
            cancellation.Token));

        Assert.Equal(new[] { TenantDatabaseProvisioningState.Copying, TenantDatabaseProvisioningState.Failed }, observedStates);
        Assert.Equal(TenantDatabaseProvisioningState.Failed, state);
        Assert.False(failureWriteWasCanceled);
    }
}

