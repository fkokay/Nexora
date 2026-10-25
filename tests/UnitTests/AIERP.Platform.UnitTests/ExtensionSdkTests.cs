using AIERP.IntegrationSDK;
using AIERP.IntegrationHost;
using AIERP.ModuleSDK;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using AIERP.ReleaseDeployer;
using AIERP.Observability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace AIERP.Platform.UnitTests;

public sealed class ExtensionSdkTests
{
    [Fact]
    public async Task IntegrationSecretResolver_RejectsSecretFileSymbolicLinks()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-integration-secrets-{Guid.NewGuid():N}");
        var outside = Path.Combine(Path.GetTempPath(), $"aierp-integration-secret-outside-{Guid.NewGuid():N}");
        var tenantId = Guid.NewGuid();
        var tenantDirectory = Path.Combine(root, tenantId.ToString("D"));
        Directory.CreateDirectory(tenantDirectory);
        await File.WriteAllTextAsync(outside, "offline-test-secret");
        var secretPath = Path.Combine(tenantDirectory, "provider-token");
        try
        {
            try { File.CreateSymbolicLink(secretPath, outside); }
            catch (Exception exception) when (exception is UnauthorizedAccessException or PlatformNotSupportedException or IOException)
            {
                return; // Windows configurations without symlink privileges cannot exercise this filesystem case.
            }

            var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["IntegrationSecrets:RootPath"] = root
            }).Build();
            var resolver = new FileIntegrationSecretResolver(configuration);

            await Assert.ThrowsAsync<FileNotFoundException>(async () =>
                await resolver.ResolveAsync(tenantId, new IntegrationCredentialReference("provider-token"), CancellationToken.None));
        }
        finally
        {
            try { Directory.Delete(root, recursive: true); } catch (IOException) { }
            try { File.Delete(outside); } catch (IOException) { }
        }
    }

    [Fact]
    public void ProductionMigrationRollbackPolicy_RestartsPreviousApplicationOnlyBeforeMigrationCanRun()
    {
        Assert.True(ProductionMigrationRollbackPolicy.ShouldRestartPreviousApplication(migrationMayHaveRun: false));
        Assert.False(ProductionMigrationRollbackPolicy.ShouldRestartPreviousApplication(migrationMayHaveRun: true));
    }

    [Fact]
    public void FailedProductionDeploymentCleanup_PreservesNamedDatabaseVolumes()
    {
        var arguments = ProductionMigrationRollbackPolicy.FailedDeploymentCleanupArguments(
            "aierp-production-project", "compose.yml", "deploy.env");

        Assert.Equal(["compose", "--project-name", "aierp-production-project", "--file", "compose.yml", "--env-file", "deploy.env", "down", "--remove-orphans"], arguments);
        Assert.DoesNotContain("--volumes", arguments);
    }

    [Fact]
    public void ProductionMigrationRollbackState_RecordsMigrationAndRollbackOutcomes()
    {
        var state = new ProductionMigrationRollbackState(Guid.NewGuid(), Guid.NewGuid(), "may_have_run",
            "blocked_migration_may_have_run", "Previous application restart is blocked.", DateTimeOffset.UtcNow);
        var json = JsonSerializer.Serialize(state);
        var parsed = JsonSerializer.Deserialize<ProductionMigrationRollbackState>(json);

        Assert.NotNull(parsed);
        Assert.Equal("may_have_run", parsed.MigrationStatus);
        Assert.Equal("blocked_migration_may_have_run", parsed.RollbackStatus);
        Assert.NotNull(parsed.PreviousDeploymentId);
    }

    [Fact]
    public void IntegrationJsonMapper_MapsSelectedFieldsToNestedProviderPayload()
    {
        using var source = JsonDocument.Parse("""{"document":{"number":"PO-42","total":125.50},"tenantSecret":"must-not-leak"}""");
        var mapped = IntegrationJsonMapper.Map(source.RootElement,
        [
            new IntegrationJsonFieldMapping("document.number", "purchaseOrder.reference", Required: true),
            new IntegrationJsonFieldMapping("document.total", "purchaseOrder.amount")
        ]);

        Assert.Equal("PO-42", mapped.GetProperty("purchaseOrder").GetProperty("reference").GetString());
        Assert.Equal(125.50m, mapped.GetProperty("purchaseOrder").GetProperty("amount").GetDecimal());
        Assert.False(mapped.TryGetProperty("tenantSecret", out _));
    }

    [Fact]
    public void IntegrationJsonMapper_RequiresConfiguredFieldsAndRejectsUnsafeOrConflictingPaths()
    {
        using var source = JsonDocument.Parse("""{"value":1}""");

        Assert.Throws<IntegrationJsonMappingException>(() => IntegrationJsonMapper.Map(source.RootElement,
            [new IntegrationJsonFieldMapping("missing", "provider.value", Required: true)]));
        Assert.Throws<IntegrationJsonMappingException>(() => IntegrationJsonMapper.Map(source.RootElement,
            [new IntegrationJsonFieldMapping("value", "provider.value"), new IntegrationJsonFieldMapping("value", "provider.value")]));
        Assert.Throws<IntegrationJsonMappingException>(() => IntegrationJsonMapper.Map(source.RootElement,
            [new IntegrationJsonFieldMapping("value", "provider.$meta.value")]));
    }

    [Fact]
    public void IntegrationJsonMapper_LeavesPayloadUnchangedWhenNoMappingIsConfigured()
    {
        using var source = JsonDocument.Parse("""{"value":1,"nested":{"safe":true}}""");
        var mapped = IntegrationJsonMapper.Map(source.RootElement, []);

        Assert.Equal(source.RootElement.GetRawText(), mapped.GetRawText());
    }

    [Fact]
    public void ModuleManifestValidator_AcceptsValidDeclarativeManifest()
    {
        var manifest = new ModuleManifest(
            "service.desk",
            "Service Desk",
            "1.2.0",
            "Nexora",
            "1.0.0",
            [new ModuleDependency("inventory", "1.0.0")],
            [new ModulePermission("service.desk.read", "Read service tickets")],
            [new ModuleMenuEntry("service.desk.home", "Service Desk", "/service-desk", "service.desk.read")],
            [new ModuleMigration("1.0.0", new string('a', 64))]);

        var result = ModuleManifestValidator.Validate(manifest);

        Assert.True(result.IsValid, string.Join(Environment.NewLine, result.Errors));
    }

    [Fact]
    public void ModuleManifestValidator_RejectsUnsafeRoutesUndeclaredPermissionsAndBadChecksums()
    {
        var manifest = new ModuleManifest(
            "service.desk",
            "Service Desk",
            "1.2.0",
            "Nexora",
            "1.0.0",
            [],
            [],
            [new ModuleMenuEntry("service.desk.home", "Service Desk", "//outside.example", "service.desk.admin")],
            [new ModuleMigration("1.0.0", "not-a-checksum")]);

        var result = ModuleManifestValidator.Validate(manifest);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("local absolute path", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("undeclared permission", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("SHA-256", StringComparison.Ordinal));
    }

    [Fact]
    public void ModuleManifestValidator_RejectsNullCatalogEntriesWithoutThrowing()
    {
        var manifest = new ModuleManifest("service.desk", "Service Desk", "1.2.0", "Nexora", "1.0.0",
            [null!], [null!],
            [null!, new ModuleMenuEntry("service.desk.home", "Service Desk", "/service-desk", "service.desk.read",
                new ModuleMenuView("form", [null!], "table", [null!]))],
            [null!], [null!]);

        var result = ModuleManifestValidator.Validate(manifest);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("Dependency entries cannot be null", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("Permission entries cannot be null", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("Menu entries cannot be null", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("Migration entries cannot be null", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("Data capability entries cannot be null", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("input fields cannot be null", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("result columns cannot be null", StringComparison.Ordinal));
    }

    [Fact]
    public void ModulePermissionCatalog_MapsDeclaredPermissionsToStableTenantPolicyIds()
    {
        var manifest = new ModuleManifest("service.desk", "Service Desk", "1.2.0", "Nexora", "1.0.0", [],
            [new ModulePermission("tickets.read", "Read service tickets")],
            [new ModuleMenuEntry("tickets.list", "Tickets", "/tickets", "tickets.read")], []);

        var permission = Assert.Single(AIERP.ModuleSDK.ModulePermissionCatalog.Build(manifest));

        Assert.Equal("erp.module.service.desk.tickets.read", permission.Code);
        Assert.Equal("erp.module.service.desk", permission.ResourceType);
        Assert.Equal("execute", permission.Action);
        Assert.Equal("tickets.read", permission.ModulePermissionCode);
    }

    [Fact]
    public async Task PlatformPermissionAuthorizer_EnforcesModulePermissionAndDenyPrecedence()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"module-permissions-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        var tenant = new Tenant();
        var user = new AppUser { Email = "user@example.test" };
        const string permissionCode = "erp.module.service.desk.tickets.read";
        const string resourceType = "erp.module.service.desk";
        var definition = new PermissionDefinition { Code = permissionCode, ResourceType = resourceType, Action = "execute", Description = "Read tickets" };
        db.Tenants.Add(tenant);
        db.Users.Add(user);
        db.PermissionDefinitions.Add(definition);
        db.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, Tenant = tenant, UserId = user.Id, User = user, Role = "TenantUser" });
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
            PermissionCode = permissionCode, Permission = definition, Effect = TenantPermissionEffect.Allow,
            ResourceType = resourceType, AttributeName = "resource.route.moduleCode",
            AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = "service.desk"
        });
        await db.SaveChangesAsync();

        var resolved = new ResolvedPlatformPermission(
            new PlatformPermissionDefinition(permissionCode, resourceType, "execute", "Read tickets"),
            new Dictionary<string, string>
            {
                ["subject.userId"] = user.Id.ToString("D"), ["subject.role"] = "TenantUser",
                ["resource.type"] = resourceType, ["resource.tenantId"] = tenant.Id.ToString("D"),
                ["request.method"] = "POST", ["request.action"] = "execute",
                ["resource.route.moduleCode"] = "service.desk", ["resource.route.menuEntryCode"] = "tickets.list"
            });
        var authorizer = new PlatformPermissionAuthorizer(db);

        Assert.True(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", resolved));
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
            PermissionCode = permissionCode, Permission = definition, Effect = TenantPermissionEffect.Deny,
            ResourceType = resourceType, AttributeName = "resource.route.menuEntryCode",
            AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = "tickets.list"
        });
        await db.SaveChangesAsync();
        Assert.False(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", resolved));
    }

    [Fact]
    public async Task Manufacturing_permissions_allow_current_tenant_admin_and_require_tenant_user_grants()
    {
        var options = new DbContextOptionsBuilder<PlatformDbContext>()
            .UseInMemoryDatabase($"manufacturing-permissions-{Guid.NewGuid():N}").Options;
        await using var db = new PlatformDbContext(options);
        await db.Database.EnsureCreatedAsync();

        var tenant = new Tenant { Name = "Manufacturing tenant", Slug = Guid.NewGuid().ToString("N") };
        var user = new AppUser { Email = $"manufacturing-{Guid.NewGuid():N}@example.test" };
        var membership = new TenantMembership { Tenant = tenant, User = user, Role = "TenantAdmin" };
        db.TenantMemberships.Add(membership);
        await db.SaveChangesAsync();

        Assert.True(PlatformPermissionCatalog.TryResolve("/api/manufacturing/boms/", "GET", "/api/manufacturing/boms/",
            new Dictionary<string, string?>(), tenant.Id, user.Id, "TenantAdmin", out var resolved));
        Assert.NotNull(resolved);
        Assert.Equal("erp.manufacturing.read", resolved!.Permission.Code);
        var authorizer = new PlatformPermissionAuthorizer(db);

        // TenantAdmin's documented tenant-wide role bypass is still bounded by a live membership.
        Assert.True(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantAdmin", resolved));
        Assert.False(await authorizer.IsAllowedAsync(Guid.NewGuid(), user.Id, "TenantAdmin", resolved));

        // Other roles need an explicit policy. The baseline grants the ordinary tenant role
        // the existing manufacturing actions, while a matching deny still takes precedence.
        membership.Role = "TenantUser";
        await db.SaveChangesAsync();
        Assert.False(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantAdmin", resolved));
        Assert.False(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", resolved));

        await TenantPermissionDefaults.AddTenantUserBaselineAsync(db, tenant.Id, user.Id);
        await db.SaveChangesAsync();
        Assert.True(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", resolved));

        var permission = await db.PermissionDefinitions.SingleAsync(x => x.Code == "erp.manufacturing.read");
        db.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = tenant.Id,
            Tenant = tenant,
            SubjectType = TenantPermissionSubjectType.Role,
            SubjectRole = "TenantUser",
            PermissionCode = permission.Code,
            Permission = permission,
            Effect = TenantPermissionEffect.Deny,
            ResourceType = permission.ResourceType
        });
        await db.SaveChangesAsync();
        Assert.False(await authorizer.IsAllowedAsync(tenant.Id, user.Id, "TenantUser", resolved));
    }

    [Fact]
    public void ModuleManifestValidator_RejectsPermissionIdentifiersThatCannotFitPolicyStorage()
    {
        var manifest = new ModuleManifest("module", "Module", "1.0.0", "Nexora", "1.0.0", [],
            [new ModulePermission(new string('a', 41), "permission")], [], []);

        var result = ModuleManifestValidator.Validate(manifest);

        Assert.Contains(result.Errors, error => error.Contains("Permission code", StringComparison.Ordinal));
    }

    [Fact]
    public void ModuleManifestValidator_AcceptsBoundedDeclarativeFormAndTableView()
    {
        var manifest = new ModuleManifest("service.desk", "Service Desk", "1.2.0", "Nexora", "1.0.0", [],
            [new ModulePermission("tickets.read", "Read tickets")],
            [new ModuleMenuEntry("tickets.search", "Ticket search", "/tickets", "tickets.read", new ModuleMenuView(
                "form", [new ModuleUiField("status", "Status", "select", Required: true, Options: ["Open", "Closed"]),
                    new ModuleUiField("updated-after", "Updated after", "date")],
                "table", [new ModuleUiField("code", "Ticket", "text"), new ModuleUiField("status", "Status", "text")] ))], []);

        var result = ModuleManifestValidator.Validate(manifest);

        Assert.True(result.IsValid, string.Join(Environment.NewLine, result.Errors));
    }

    [Fact]
    public void ModuleManifestValidator_RejectsUnsafeOrAmbiguousDeclarativeView()
    {
        var manifest = new ModuleManifest("service.desk", "Service Desk", "1.2.0", "Nexora", "1.0.0", [],
            [new ModulePermission("tickets.read", "Read tickets")],
            [new ModuleMenuEntry("tickets.search", "Ticket search", "/tickets", "tickets.read", new ModuleMenuView(
                "form", [new ModuleUiField("status", "Status", "<script>alert(1)</script>"), new ModuleUiField("status", "Duplicate", "text")],
                "table", []))], []);

        var result = ModuleManifestValidator.Validate(manifest);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("type is unsupported", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("codes must be unique", StringComparison.Ordinal));
        Assert.Contains(result.Errors, error => error.Contains("requires at least one column", StringComparison.Ordinal));
    }

    [Fact]
    public void ModuleMenuView_UsesWebJsonNamesAndKeepsLegacyManifestsCompatible()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        const string legacyJson = """{"code":"tickets.list","label":"Tickets","route":"/tickets","permissionCode":"tickets.read"}""";
        var legacy = JsonSerializer.Deserialize<ModuleMenuEntry>(legacyJson, options);
        var view = new ModuleMenuView("form", [new ModuleUiField("status", "Status", "select", true, ["Open", "Closed"])],
            "table", [new ModuleUiField("code", "Ticket", "text")]);
        var serialized = JsonSerializer.Serialize(new ModuleMenuEntry("tickets.list", "Tickets", "/tickets", "tickets.read", view), options);
        var roundTrip = JsonSerializer.Deserialize<ModuleMenuEntry>(serialized, options);

        Assert.Null(legacy?.View);
        Assert.NotNull(roundTrip?.View);
        Assert.Equal("form", roundTrip!.View!.InputMode);
        Assert.Equal(["Open", "Closed"], roundTrip.View.InputFields[0].Options);
        var legacyManifest = new ModuleManifest("tickets", "Tickets", "1.0.0", "Nexora", "1.0.0", [], [],
            [new ModuleMenuEntry("tickets.list", "Tickets", "/tickets", "tickets.read")], []);
        var legacyCanonicalJson = ModulePackageVerifier.SerializeManifest(legacyManifest);
        Assert.DoesNotContain("\"view\"", legacyCanonicalJson, StringComparison.Ordinal);
        Assert.DoesNotContain("\"dataCapabilities\"", legacyCanonicalJson, StringComparison.Ordinal);
    }

    [Fact]
    public void ModuleManifestValidator_RequiresFixedDataCapabilitiesAndDeclaredPermissions()
    {
        Assert.Equal(
            ["customers.balance.read", "customers.search", "inventory.availability.search", "suppliers.search"],
            ModuleDataCapabilityCatalog.All.Keys.Order(StringComparer.Ordinal).ToArray());
        Assert.Equal("customer-code", ModuleDataCapabilityCatalog.All["customers.balance.read"].RequiredInputField);
        Assert.False(ModuleDataCapabilityCatalog.All["customers.balance.read"].SupportsLimit);
        Assert.True(ModuleDataCapabilityCatalog.All["inventory.availability.search"].SupportsLimit);

        var allowed = new ModuleManifest("catalog", "Catalog", "1.0.0", "Nexora", "1.0.0", [],
            [new ModulePermission("customer.read", "Read customer directory"), new ModulePermission("stock.read", "Read inventory availability")], [], [],
            [new ModuleDataCapability("customers.search", "customer.read"), new ModuleDataCapability("inventory.availability.search", "stock.read")]);
        var invalid = allowed with { DataCapabilities = [new ModuleDataCapability("http.fetch", "missing.permission")] };

        var allowedResult = ModuleManifestValidator.Validate(allowed);
        var invalidResult = ModuleManifestValidator.Validate(invalid);

        Assert.True(allowedResult.IsValid, string.Join(Environment.NewLine, allowedResult.Errors));
        Assert.Contains(invalidResult.Errors, error => error.Contains("unsupported", StringComparison.Ordinal));
        Assert.Contains(invalidResult.Errors, error => error.Contains("undeclared permission", StringComparison.Ordinal));
    }

    [Fact]
    public void ModuleMenuView_CanRequestOnlyDeclaredDataCapabilitiesFromRequiredFormInput()
    {
        var permission = new ModulePermission("customer.read", "Search customer directory");
        var declaration = new ModuleDataCapability("customers.search", permission.Code);
        var entry = new ModuleMenuEntry("customer.lookup", "Customer lookup", "/customers", permission.Code,
            new ModuleMenuView("form", [new ModuleUiField("term", "Customer", "text", Required: true)], "table",
                [new ModuleUiField("code", "Code", "text")], ["customers.search"]));
        var valid = new ModuleManifest("catalog", "Catalog", "1.0.0", "Nexora", "1.0.0", [], [permission], [entry], [], [declaration]);
        var missingDeclaration = valid with { DataCapabilities = [] };
        var missingTermField = valid with { MenuEntries = [entry with { View = entry.View! with { InputFields = [] } }] };

        var validation = ModuleManifestValidator.Validate(valid);
        Assert.True(validation.IsValid, string.Join("; ", validation.Errors));
        Assert.Contains(ModuleManifestValidator.Validate(missingDeclaration).Errors,
            error => error.Contains("not declared by its module", StringComparison.Ordinal));
        Assert.Contains(ModuleManifestValidator.Validate(missingTermField).Errors,
            error => error.Contains("required text field named term", StringComparison.Ordinal));
    }

    [Fact]
    public void ModuleMenuView_UsesCustomerCodeFieldForBalanceCapability()
    {
        var permission = new ModulePermission("balance.read", "Read customer balance");
        var capability = new ModuleDataCapability("customers.balance.read", permission.Code);
        var view = new ModuleMenuView("form", [new ModuleUiField("customer-code", "Customer code", "text", Required: true, MaxLength: 64)],
            "json", [], [capability.Code]);
        var valid = new ModuleManifest("finance", "Finance", "1.0.0", "Nexora", "1.0.0", [], [permission],
            [new ModuleMenuEntry("customer.balance", "Customer balance", "/customer-balance", permission.Code, view)], [], [capability]);
        var missingCodeField = valid with
        {
            MenuEntries = [valid.MenuEntries[0] with { View = view with { InputFields = [new ModuleUiField("term", "Search", "text", Required: true)] } }]
        };

        var validation = ModuleManifestValidator.Validate(valid);
        Assert.True(validation.IsValid, string.Join("; ", validation.Errors));
        Assert.Contains(ModuleManifestValidator.Validate(missingCodeField).Errors,
            error => error.Contains("required text field named customer-code", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(9, 1, 5)]
    [InlineData(3, 30, 10)]
    public void IntegrationRetryPolicy_RejectsUnboundedOrInconsistentSettings(int attempts, int initialSeconds, int maximumSeconds)
    {
        var errors = new IntegrationRetryPolicy(attempts, TimeSpan.FromSeconds(initialSeconds), TimeSpan.FromSeconds(maximumSeconds)).Validate();

        Assert.NotEmpty(errors);
    }

    [Fact]
    public async Task IntegrationAdapterExecutor_RetriesWithStableIdempotencyAndSanitizesErrors()
    {
        var context = new IntegrationContext(Guid.NewGuid(), "bank.statement", "corr-123", "idem-456", DateTimeOffset.UtcNow.AddMinutes(1));
        var seenKeys = new List<string>();
        var calls = 0;
        var adapter = new TestIntegrationAdapter("bank.statement", (execution, _, _) =>
        {
            seenKeys.Add(execution.IdempotencyKey);
            calls++;
            return Task.FromResult(calls == 1
                ? new IntegrationResult<string>(false, null, null, "temporary_unavailable", true)
                : new IntegrationResult<string>(true, "imported", "bank-ref-7", null, false));
        });
        var policy = new IntegrationRetryPolicy(3, TimeSpan.Zero, TimeSpan.Zero);

        var result = await IntegrationAdapterExecutor.ExecuteAsync(adapter, context, "masked", policy,
            delayAsync: (_, _) => Task.CompletedTask, jitter: () => 0);

        Assert.True(result.Succeeded);
        Assert.Equal(2, result.Attempts);
        Assert.Equal("bank-ref-7", result.ExternalReference);
        Assert.Equal(["idem-456", "idem-456"], seenKeys);

        var throwingAdapter = new TestIntegrationAdapter("bank.statement", (_, _, _) =>
            throw new InvalidOperationException("credential=must-not-escape"));
        var failed = await IntegrationAdapterExecutor.ExecuteAsync(throwingAdapter, context, "masked", policy,
            delayAsync: (_, _) => Task.CompletedTask, jitter: () => 0);
        Assert.False(failed.Succeeded);
        Assert.Equal("adapter_error", failed.ErrorCode);
        Assert.Equal(1, failed.Attempts);

        var retryCalls = 0;
        var exhaustedAdapter = new TestIntegrationAdapter("bank.statement", (_, _, _) =>
        {
            retryCalls++;
            return Task.FromResult(new IntegrationResult<string>(false, null, null, "busy", true));
        });
        var exhausted = await IntegrationAdapterExecutor.ExecuteAsync(exhaustedAdapter, context, "masked",
            new IntegrationRetryPolicy(2, TimeSpan.Zero, TimeSpan.Zero), delayAsync: (_, _) => Task.CompletedTask, jitter: () => 0);
        Assert.False(exhausted.Succeeded);
        Assert.Equal(2, exhausted.Attempts);
        Assert.Equal(2, retryCalls);

        var expired = await IntegrationAdapterExecutor.ExecuteAsync(adapter, context with { Deadline = DateTimeOffset.UtcNow.AddSeconds(-1) },
            "masked", policy, delayAsync: (_, _) => Task.CompletedTask, jitter: () => 0);
        Assert.Equal("deadline_exceeded", expired.ErrorCode);
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task IntegrationAdapterExecutor_EmitsSanitizedActivityAndMetrics()
    {
        long executions = 0;
        string? metricOutcome = null;
        Activity? completedActivity = null;
        var prometheusMetrics = new PrometheusHttpMetrics();
        using var prometheusBridge = new PrometheusBusinessMetricsBridge(prometheusMetrics);
        await prometheusBridge.StartAsync(CancellationToken.None);
        using var meterListener = new MeterListener
        {
            InstrumentPublished = (instrument, listener) =>
            {
                if (instrument.Meter.Name == IntegrationAdapterExecutor.TelemetryName)
                    listener.EnableMeasurementEvents(instrument);
            }
        };
        meterListener.SetMeasurementEventCallback<long>((instrument, measurement, tags, _) =>
        {
            if (instrument.Name != "aierp.integration.executions") return;
            executions += measurement;
            foreach (var tag in tags)
                if (tag.Key == "outcome") metricOutcome = tag.Value?.ToString();
        });
        meterListener.Start();
        using var activityListener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == IntegrationAdapterExecutor.TelemetryName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = activity => completedActivity = activity
        };
        ActivitySource.AddActivityListener(activityListener);

        var context = new IntegrationContext(Guid.NewGuid(), "sample.orders", "corr-safe", "idem-safe", DateTimeOffset.UtcNow.AddMinutes(1));
        var adapter = new TestIntegrationAdapter("sample.orders", (_, _, _) =>
            Task.FromResult(new IntegrationResult<string>(true, "ok", null, null, false)));
        var result = await IntegrationAdapterExecutor.ExecuteAsync(adapter, context, "private-payload",
            new IntegrationRetryPolicy(1, TimeSpan.Zero, TimeSpan.Zero));

        Assert.True(result.Succeeded);
        Assert.Equal(1, executions);
        Assert.Equal("succeeded", metricOutcome);
        Assert.NotNull(completedActivity);
        Assert.Equal("sample.orders", completedActivity!.GetTagItem("integration.code"));
        Assert.Equal("succeeded", completedActivity.GetTagItem("integration.outcome"));
        Assert.Equal(1, completedActivity.GetTagItem("integration.attempts"));
        Assert.DoesNotContain("private-payload", completedActivity.Tags.Select(tag => tag.Value));
        Assert.DoesNotContain("tenant", completedActivity.Tags.Select(tag => tag.Key), StringComparer.OrdinalIgnoreCase);
        var scrapedMetrics = prometheusMetrics.Render();
        Assert.Contains("aierp_integration_executions_total{outcome=\"succeeded\"} 1", scrapedMetrics, StringComparison.Ordinal);
        Assert.Contains("aierp_integration_execution_duration_seconds_count{outcome=\"succeeded\"} 1", scrapedMetrics, StringComparison.Ordinal);
        Assert.DoesNotContain("sample.orders", scrapedMetrics, StringComparison.Ordinal);
        Assert.DoesNotContain(context.TenantId.ToString(), scrapedMetrics, StringComparison.Ordinal);
    }

    [Fact]
    public async Task IntegrationDispatcher_DoesNotPretendUnconfiguredVendorsAreAvailable()
    {
        var configuration = new ConfigurationBuilder().Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestHttpClientFactory(), new TestIntegrationSecretResolver());
        using var payload = JsonDocument.Parse("{\"document\":\"example\"}");
        var context = new IntegrationContext(Guid.NewGuid(), "netsis", "correlation-1", "idem-1", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await dispatcher.ExecuteAsync("netsis", context, payload.RootElement, CancellationToken.None);

        Assert.False(result.Configured);
        Assert.Null(result.Result);
        Assert.Equal(0, dispatcher.ConfiguredCount);
    }

    [Fact]
    public void IntegrationDispatcher_ReportsSanitizedConfigurationReadiness()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:ready.orders:Enabled"] = "true",
            ["Integrations:ready.orders:BaseUrl"] = "https://provider.example/v1/",
            ["Integrations:ready.orders:Path"] = "orders",
            ["Integrations:ready.orders:AllowedHosts:0"] = "provider.example",
            ["Integrations:ready.orders:RequestMappings:0:SourcePath"] = "order.number",
            ["Integrations:ready.orders:RequestMappings:0:TargetPath"] = "purchase.reference",
            ["Integrations:ready.orders:ResponseMappings:0:SourcePath"] = "accepted",
            ["Integrations:ready.orders:ResponseMappings:0:TargetPath"] = "result.success",
            ["Integrations:bad.mapping:Enabled"] = "true",
            ["Integrations:bad.mapping:BaseUrl"] = "https://provider.example/v1/",
            ["Integrations:bad.mapping:Path"] = "orders",
            ["Integrations:bad.mapping:AllowedHosts:0"] = "provider.example",
            ["Integrations:bad.mapping:ResponseMappings:0:SourcePath"] = "accepted",
            ["Integrations:bad.mapping:ResponseMappings:0:TargetPath"] = "../result",
            ["Integrations:bad.orders:Enabled"] = "true",
            ["Integrations:bad.orders:BaseUrl"] = "http://provider.example/v1/",
            ["Integrations:bad.orders:Path"] = "orders",
            ["Integrations:bad.orders:AllowedHosts:0"] = "provider.example",
            ["Integrations:disabled.orders:Enabled"] = "false",
            ["Integrations:disabled.orders:BaseUrl"] = "not-a-url"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestHttpClientFactory(), new TestIntegrationSecretResolver());

        var summary = dispatcher.GetHealthSummary();

        Assert.Equal(new IntegrationHostHealthSummary(3, 1, 2), summary);
    }

    [Theory]
    [InlineData("../admin")]
    [InlineData("orders/%2e%2e/admin")]
    [InlineData("orders/%252e%252e/admin")]
    [InlineData("orders\\..\\admin")]
    [InlineData("/admin")]
    public async Task IntegrationDispatcher_RejectsPathsOutsideConfiguredBaseDirectory(string path)
    {
        var calls = 0;
        var handler = new CapturingHttpMessageHandler((_, _) =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent("{}") });
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:sample.orders:Enabled"] = "true",
            ["Integrations:sample.orders:BaseUrl"] = "https://provider.example/v1/",
            ["Integrations:sample.orders:Path"] = path,
            ["Integrations:sample.orders:AllowedHosts:0"] = "provider.example"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestIntegrationHttpClientFactory(handler), new TestIntegrationSecretResolver());
        using var payload = JsonDocument.Parse("{\"order\":\"PO-19\"}");
        var context = new IntegrationContext(Guid.NewGuid(), "sample.orders", "correlation-1", "idem-1", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await dispatcher.ExecuteAsync("sample.orders", context, payload.RootElement, CancellationToken.None);

        Assert.True(result.Configured);
        Assert.Equal("invalid_integration", result.Result!.ErrorCode);
        Assert.Equal(0, result.Result.Attempts);
        Assert.Equal(0, calls);
    }

    [Fact]
    public void IntegrationJsonMapper_HealthValidationDetectsInvalidAndOverlappingTargets()
    {
        var errors = IntegrationJsonMapper.Validate(
        [
            new IntegrationJsonFieldMapping("order.number", "purchase.reference"),
            new IntegrationJsonFieldMapping("order.total", "purchase")
        ]);

        Assert.Single(errors);
    }

    [Fact]
    public async Task IntegrationDispatcher_SendsOnlyConfiguredMappedProviderFields()
    {
        string? sentJson = null;
        Uri? sentUri = null;
        var handler = new CapturingHttpMessageHandler(async (request, cancellationToken) =>
        {
            sentUri = request.RequestUri;
            sentJson = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("""{"accepted":true}""")
            };
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:sample.orders:Enabled"] = "true",
            ["Integrations:sample.orders:BaseUrl"] = "https://provider.example/v1/",
            ["Integrations:sample.orders:Path"] = "orders",
            ["Integrations:sample.orders:AllowedHosts:0"] = "provider.example",
            ["Integrations:sample.orders:RequestMappings:0:SourcePath"] = "order.number",
            ["Integrations:sample.orders:RequestMappings:0:TargetPath"] = "purchase.reference",
            ["Integrations:sample.orders:RequestMappings:0:Required"] = "true",
            ["Integrations:sample.orders:RequestMappings:1:SourcePath"] = "order.total",
            ["Integrations:sample.orders:RequestMappings:1:TargetPath"] = "purchase.amount",
            ["Integrations:sample.orders:ResponseMappings:0:SourcePath"] = "accepted",
            ["Integrations:sample.orders:ResponseMappings:0:TargetPath"] = "result.success",
            ["Integrations:sample.orders:ResponseMappings:0:Required"] = "true"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestIntegrationHttpClientFactory(handler), new TestIntegrationSecretResolver());
        using var payload = JsonDocument.Parse("""{"order":{"number":"PO-19","total":55.25},"internalNote":"do not forward"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "sample.orders", "correlation-1", "idem-1", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await dispatcher.ExecuteAsync("sample.orders", context, payload.RootElement, CancellationToken.None);

        Assert.True(result.Configured);
        Assert.True(result.Result?.Succeeded);
        Assert.Equal(new Uri("https://provider.example/v1/orders"), sentUri);
        using var sent = JsonDocument.Parse(sentJson!);
        Assert.Equal("PO-19", sent.RootElement.GetProperty("purchase").GetProperty("reference").GetString());
        Assert.Equal(55.25m, sent.RootElement.GetProperty("purchase").GetProperty("amount").GetDecimal());
        Assert.False(sent.RootElement.TryGetProperty("internalNote", out _));
        Assert.True(result.Result!.Value!.ValueKind == JsonValueKind.Object);
        Assert.True(result.Result.Value.GetProperty("result").GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task IntegrationDispatcher_UsesStripePaymentIntentAdapterWithTenantSecretAndStableIdempotency()
    {
        Uri? sentUri = null;
        string? sentForm = null;
        string? sentIdempotencyKey = null;
        string? sentAuthorization = null;
        var handler = new CapturingHttpMessageHandler(async (request, cancellationToken) =>
        {
            sentUri = request.RequestUri;
            sentForm = await request.Content!.ReadAsStringAsync(cancellationToken);
            sentIdempotencyKey = request.Headers.GetValues("Idempotency-Key").Single();
            sentAuthorization = request.Headers.Authorization?.ToString();
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("""{"id":"pi_offline_42","object":"payment_intent","status":"requires_payment_method","amount":12500,"currency":"try","client_secret":"must-not-leak"}""")
            };
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:stripe.payment-intent:Enabled"] = "true",
            ["Integrations:stripe.payment-intent:Provider"] = "stripe.payment-intent",
            ["Integrations:stripe.payment-intent:CredentialSecretName"] = "stripe-api",
            ["Integrations:stripe.payment-intent:RequestMappings:0:SourcePath"] = "order.amountMinor",
            ["Integrations:stripe.payment-intent:RequestMappings:0:TargetPath"] = "amount",
            ["Integrations:stripe.payment-intent:RequestMappings:0:Required"] = "true",
            ["Integrations:stripe.payment-intent:RequestMappings:1:SourcePath"] = "order.currency",
            ["Integrations:stripe.payment-intent:RequestMappings:1:TargetPath"] = "currency",
            ["Integrations:stripe.payment-intent:RequestMappings:1:Required"] = "true",
            ["Integrations:stripe.payment-intent:RequestMappings:2:SourcePath"] = "order.number",
            ["Integrations:stripe.payment-intent:RequestMappings:2:TargetPath"] = "metadata.order_id",
            ["Integrations:stripe.payment-intent:RequestMappings:2:Required"] = "true",
            ["Integrations:stripe.payment-intent:ResponseMappings:0:SourcePath"] = "id",
            ["Integrations:stripe.payment-intent:ResponseMappings:0:TargetPath"] = "payment.providerId",
            ["Integrations:stripe.payment-intent:ResponseMappings:0:Required"] = "true",
            ["Integrations:stripe.payment-intent:ResponseMappings:1:SourcePath"] = "status",
            ["Integrations:stripe.payment-intent:ResponseMappings:1:TargetPath"] = "payment.status"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestIntegrationHttpClientFactory(handler),
            new FixedIntegrationSecretResolver("sk_test_offline-secret"));
        using var payload = JsonDocument.Parse("""{"order":{"amountMinor":12500,"currency":"try","number":"SO-42"},"internalNote":"must-not-leak"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "stripe.payment-intent", "corr-stripe", "tenant-namespaced-key", DateTimeOffset.UtcNow.AddSeconds(20));

        Assert.Equal(new IntegrationHostHealthSummary(1, 1, 0), dispatcher.GetHealthSummary());
        var result = await dispatcher.ExecuteAsync("stripe.payment-intent", context, payload.RootElement, CancellationToken.None);

        Assert.True(result.Configured);
        Assert.True(result.Result!.Succeeded);
        Assert.Equal(new Uri("https://api.stripe.com/v1/payment_intents"), sentUri);
        Assert.Equal("Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes("sk_test_offline-secret:")), sentAuthorization);
        Assert.Equal("tenant-namespaced-key", sentIdempotencyKey);
        Assert.Contains("amount=12500", sentForm, StringComparison.Ordinal);
        Assert.Contains("currency=try", sentForm, StringComparison.Ordinal);
        Assert.Contains("metadata%5Border_id%5D=SO-42", sentForm, StringComparison.Ordinal);
        Assert.DoesNotContain("internalNote", sentForm, StringComparison.Ordinal);
        Assert.Equal("pi_offline_42", result.Result.ExternalReference);
        Assert.Equal("pi_offline_42", result.Result.Value!.GetProperty("payment").GetProperty("providerId").GetString());
        Assert.Equal("requires_payment_method", result.Result.Value.GetProperty("payment").GetProperty("status").GetString());
        Assert.DoesNotContain("client_secret", result.Result.Value.GetRawText(), StringComparison.Ordinal);
        Assert.DoesNotContain("sk_test_offline-secret", result.Result.Value.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task IntegrationDispatcher_RejectsUnknownProviderWithoutFallbackOutboundRequest()
    {
        var calls = 0;
        var handler = new CapturingHttpMessageHandler((_, _) =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent("{}") });
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:unknown.orders:Enabled"] = "true",
            ["Integrations:unknown.orders:Provider"] = "unknown.orders",
            ["Integrations:unknown.orders:BaseUrl"] = "https://provider.example/v1/",
            ["Integrations:unknown.orders:Path"] = "orders",
            ["Integrations:unknown.orders:AllowedHosts:0"] = "provider.example"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestIntegrationHttpClientFactory(handler), new TestIntegrationSecretResolver());
        using var payload = JsonDocument.Parse("""{"order":"PO-99"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "unknown.orders", "corr-unknown", "idem-unknown", DateTimeOffset.UtcNow.AddSeconds(20));

        Assert.Equal(new IntegrationHostHealthSummary(1, 0, 1), dispatcher.GetHealthSummary());
        var result = await dispatcher.ExecuteAsync("unknown.orders", context, payload.RootElement, CancellationToken.None);

        Assert.True(result.Configured);
        Assert.Equal("invalid_integration", result.Result!.ErrorCode);
        Assert.Equal(0, result.Result.Attempts);
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task StripePaymentIntentAdapter_RejectsConfirmationAndUnsupportedFieldsBeforeSending()
    {
        var calls = 0;
        var handler = new CapturingHttpMessageHandler((_, _) =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent("{}") });
        });
        var adapter = new StripePaymentIntentAdapter("stripe.payment-intent", "sk_test_offline".AsMemory(), new HttpClient(handler));
        using var request = JsonDocument.Parse("""{"amount":12500,"currency":"try","confirm":true}""");
        var context = new IntegrationContext(Guid.NewGuid(), "stripe.payment-intent", "corr-stripe", "idem-stripe", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await adapter.ExecuteAsync(context, request.RootElement, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("validation_failed", result.ErrorCode);
        Assert.False(result.IsRetryable);
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task StripePaymentIntentAdapter_MapsMalformedSuccessfulResponseToProviderError()
    {
        var handler = new CapturingHttpMessageHandler((_, _) => Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent("{malformed")
        }));
        var adapter = new StripePaymentIntentAdapter("stripe.payment-intent", "sk_test_offline".AsMemory(), new HttpClient(handler));
        using var request = JsonDocument.Parse("""{"amount":12500,"currency":"try"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "stripe.payment-intent", "corr-stripe", "idem-stripe", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await adapter.ExecuteAsync(context, request.RootElement, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("provider_error", result.ErrorCode);
        Assert.False(result.IsRetryable);
    }

    [Fact]
    public async Task StripePaymentIntentAdapter_RejectsUnknownPaymentIntentStatus()
    {
        var handler = new CapturingHttpMessageHandler((_, _) => Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent("""{"id":"pi_offline_42","status":"future_private_state"}""")
        }));
        var adapter = new StripePaymentIntentAdapter("stripe.payment-intent", "sk_test_offline".AsMemory(), new HttpClient(handler));
        using var request = JsonDocument.Parse("""{"amount":12500,"currency":"try"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "stripe.payment-intent", "corr-stripe", "idem-stripe", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await adapter.ExecuteAsync(context, request.RootElement, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("provider_error", result.ErrorCode);
        Assert.Null(result.ExternalReference);
        Assert.False(result.IsRetryable);
    }

    [Fact]
    public async Task IntegrationDispatcher_UsesPayPalOrdersV2WithStableRequestIdAndAllowlistedResponse()
    {
        var sentBodies = new List<string>();
        var requestIds = new List<string>();
        var sentUris = new List<Uri?>();
        var authorizations = new List<string?>();
        var handler = new CapturingHttpMessageHandler(async (request, cancellationToken) =>
        {
            sentUris.Add(request.RequestUri);
            sentBodies.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
            requestIds.Add(request.Headers.GetValues("PayPal-Request-Id").Single());
            authorizations.Add(request.Headers.Authorization?.ToString());
            return new HttpResponseMessage(System.Net.HttpStatusCode.Created)
            {
                Content = new StringContent("""{"id":"5O190127TN364715T","status":"CREATED","intent":"CAPTURE","purchase_units":[{"invoice_id":"SO-42","shipping":{"address":{"address_line_1":"private address"}}}],"links":[{"href":"https://evil.example/approve"}],"payer":{"email_address":"private@example.test"}}""")
            };
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:paypal.orders-v2:Enabled"] = "true",
            ["Integrations:paypal.orders-v2:Provider"] = "paypal.orders-v2",
            ["Integrations:paypal.orders-v2:CredentialSecretName"] = "paypal-access-token",
            ["Integrations:paypal.orders-v2:RequestMappings:0:SourcePath"] = "order.total",
            ["Integrations:paypal.orders-v2:RequestMappings:0:TargetPath"] = "amount",
            ["Integrations:paypal.orders-v2:RequestMappings:0:Required"] = "true",
            ["Integrations:paypal.orders-v2:RequestMappings:1:SourcePath"] = "order.currency",
            ["Integrations:paypal.orders-v2:RequestMappings:1:TargetPath"] = "currency",
            ["Integrations:paypal.orders-v2:RequestMappings:1:Required"] = "true",
            ["Integrations:paypal.orders-v2:RequestMappings:2:SourcePath"] = "order.number",
            ["Integrations:paypal.orders-v2:RequestMappings:2:TargetPath"] = "invoiceId",
            ["Integrations:paypal.orders-v2:RequestMappings:2:Required"] = "true",
            ["Integrations:paypal.orders-v2:ResponseMappings:0:SourcePath"] = "id",
            ["Integrations:paypal.orders-v2:ResponseMappings:0:TargetPath"] = "payment.providerId",
            ["Integrations:paypal.orders-v2:ResponseMappings:0:Required"] = "true",
            ["Integrations:paypal.orders-v2:ResponseMappings:1:SourcePath"] = "status",
            ["Integrations:paypal.orders-v2:ResponseMappings:1:TargetPath"] = "payment.status",
            ["Integrations:paypal.orders-v2:ResponseMappings:2:SourcePath"] = "invoiceId",
            ["Integrations:paypal.orders-v2:ResponseMappings:2:TargetPath"] = "payment.invoiceId",
            ["Integrations:paypal.orders-v2:ResponseMappings:2:Required"] = "true"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestIntegrationHttpClientFactory(handler),
            new FixedIntegrationSecretResolver("offline-paypal-oauth-token"));
        using var payload = JsonDocument.Parse("""{"order":{"total":"42.50","currency":"USD","number":"SO-42"},"internalNote":"must-not-leak"}""");
        var tenantId = Guid.NewGuid();
        var context = new IntegrationContext(tenantId, "paypal.orders-v2", "corr-paypal", "tenant-namespaced-key", DateTimeOffset.UtcNow.AddSeconds(20));

        Assert.Equal(new IntegrationHostHealthSummary(1, 1, 0), dispatcher.GetHealthSummary());
        var first = await dispatcher.ExecuteAsync("paypal.orders-v2", context, payload.RootElement, CancellationToken.None);
        var second = await dispatcher.ExecuteAsync("paypal.orders-v2", context, payload.RootElement, CancellationToken.None);

        Assert.True(first.Configured && first.Result!.Succeeded);
        Assert.True(second.Result!.Succeeded);
        Assert.All(sentUris, uri => Assert.Equal(new Uri("https://api-m.sandbox.paypal.com/v2/checkout/orders"), uri));
        Assert.All(authorizations, value => Assert.Equal("Bearer offline-paypal-oauth-token", value));
        Assert.Equal(requestIds[0], requestIds[1]);
        Assert.Equal(32, requestIds[0].Length);
        using var sent = JsonDocument.Parse(sentBodies[0]);
        Assert.Equal("CAPTURE", sent.RootElement.GetProperty("intent").GetString());
        var unit = sent.RootElement.GetProperty("purchase_units")[0];
        Assert.Equal("42.5", unit.GetProperty("amount").GetProperty("value").GetString());
        Assert.Equal("USD", unit.GetProperty("amount").GetProperty("currency_code").GetString());
        Assert.Equal("SO-42", unit.GetProperty("invoice_id").GetString());
        Assert.False(unit.TryGetProperty("internalNote", out _));
        Assert.Equal("5O190127TN364715T", first.Result.ExternalReference);
        Assert.Equal("CREATED", first.Result.Value!.GetProperty("payment").GetProperty("status").GetString());
        Assert.Equal("SO-42", first.Result.Value.GetProperty("payment").GetProperty("invoiceId").GetString());
        Assert.DoesNotContain("links", first.Result.Value.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("payer", first.Result.Value.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("shipping", first.Result.Value.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("amount", first.Result.Value.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("private@example.test", first.Result.Value.GetRawText(), StringComparison.Ordinal);
        Assert.DoesNotContain("offline-paypal-oauth-token", first.Result.Value.GetRawText(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{\"amount\":\"10.00\",\"currency\":\"USD\",\"intent\":\"CAPTURE\"}")]
    [InlineData("{\"amount\":\"10.00\",\"currency\":\"USD\",\"applicationContext\":{\"returnUrl\":\"https://attacker.example\"}}")]
    [InlineData("{\"amount\":\"0\",\"currency\":\"USD\"}")]
    [InlineData("{\"amount\":\"1.234\",\"currency\":\"USD\"}")]
    [InlineData("{\"amount\":\"10.00\",\"currency\":\"usd\"}")]
    public async Task PayPalOrderAdapter_RejectsApprovalCaptureAndInvalidInputsBeforeSending(string requestJson)
    {
        var calls = 0;
        var handler = new CapturingHttpMessageHandler((_, _) =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.Created) { Content = new StringContent("{}") });
        });
        var adapter = new PayPalOrderAdapter("paypal.orders-v2", "offline-token".AsMemory(), new HttpClient(handler));
        using var request = JsonDocument.Parse(requestJson);
        var context = new IntegrationContext(Guid.NewGuid(), "paypal.orders-v2", "corr-paypal", "idem-paypal", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await adapter.ExecuteAsync(context, request.RootElement, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("validation_failed", result.ErrorCode);
        Assert.False(result.IsRetryable);
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task PayPalOrderAdapter_RejectsNonCreatedResponseWithoutReturningProviderFields()
    {
        var handler = new CapturingHttpMessageHandler((_, _) => Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.Created)
        {
            Content = new StringContent("""{"id":"5O190127TN364715T","status":"COMPLETED","intent":"CAPTURE","secret":"private"}""")
        }));
        var adapter = new PayPalOrderAdapter("paypal.orders-v2", "offline-token".AsMemory(), new HttpClient(handler));
        using var request = JsonDocument.Parse("""{"amount":"10.00","currency":"USD"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "paypal.orders-v2", "corr-paypal", "idem-paypal", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await adapter.ExecuteAsync(context, request.RootElement, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("provider_error", result.ErrorCode);
        Assert.Null(result.ExternalReference);
    }

    [Fact]
    public async Task PayPalOrderAdapter_OmitsInvoiceIdWhenProviderResponseDoesNotEchoRequestValue()
    {
        var handler = new CapturingHttpMessageHandler((_, _) => Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.Created)
        {
            Content = new StringContent("""{"id":"5O190127TN364715T","status":"CREATED","intent":"CAPTURE","purchase_units":[{"invoice_id":"OTHER-ORDER"}],"payer":{"email_address":"private@example.test"}}""")
        }));
        var adapter = new PayPalOrderAdapter("paypal.orders-v2", "offline-token".AsMemory(), new HttpClient(handler));
        using var request = JsonDocument.Parse("""{"amount":"10.00","currency":"USD","invoiceId":"SO-42"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "paypal.orders-v2", "corr-paypal", "idem-paypal", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await adapter.ExecuteAsync(context, request.RootElement, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.False(result.Value.TryGetProperty("invoiceId", out _));
        Assert.DoesNotContain("payer", result.Value.GetRawText(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PayPalOrderAdapter_MapsMalformedSuccessfulResponseToProviderError()
    {
        var handler = new CapturingHttpMessageHandler((_, _) => Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.Created)
        {
            Content = new StringContent("{malformed")
        }));
        var adapter = new PayPalOrderAdapter("paypal.orders-v2", "offline-token".AsMemory(), new HttpClient(handler));
        using var request = JsonDocument.Parse("""{"amount":"10.00","currency":"USD"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "paypal.orders-v2", "corr-paypal", "idem-paypal", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await adapter.ExecuteAsync(context, request.RootElement, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal("provider_error", result.ErrorCode);
        Assert.False(result.IsRetryable);
    }

    [Fact]
    public async Task IntegrationDispatcher_FailsSanitizedWhenRequiredProviderResponseFieldIsMissing()
    {
        var handler = new CapturingHttpMessageHandler((_, _) => Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent("""{"accepted":true}""")
        }));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:sample.orders:Enabled"] = "true",
            ["Integrations:sample.orders:BaseUrl"] = "https://provider.example/v1/",
            ["Integrations:sample.orders:Path"] = "orders",
            ["Integrations:sample.orders:AllowedHosts:0"] = "provider.example",
            ["Integrations:sample.orders:ResponseMappings:0:SourcePath"] = "receipt.id",
            ["Integrations:sample.orders:ResponseMappings:0:TargetPath"] = "result.id",
            ["Integrations:sample.orders:ResponseMappings:0:Required"] = "true"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestIntegrationHttpClientFactory(handler), new TestIntegrationSecretResolver());
        using var payload = JsonDocument.Parse("""{"document":"PO-19"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "sample.orders", "correlation-1", "idem-1", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await dispatcher.ExecuteAsync("sample.orders", context, payload.RootElement, CancellationToken.None);

        Assert.True(result.Configured);
        Assert.False(result.Result!.Succeeded);
        Assert.Equal("mapping_failed", result.Result.ErrorCode);
        Assert.Equal(1, result.Result.Attempts);
        Assert.Equal(JsonValueKind.Undefined, result.Result.Value.ValueKind);
    }

    [Fact]
    public async Task IntegrationDispatcher_RejectsInvalidResponseMappingBeforeOutboundRequest()
    {
        var calls = 0;
        var handler = new CapturingHttpMessageHandler((_, _) =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent("{}")
            });
        });
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Integrations:sample.orders:Enabled"] = "true",
            ["Integrations:sample.orders:BaseUrl"] = "https://provider.example/v1/",
            ["Integrations:sample.orders:Path"] = "orders",
            ["Integrations:sample.orders:AllowedHosts:0"] = "provider.example",
            ["Integrations:sample.orders:ResponseMappings:0:SourcePath"] = "accepted",
            ["Integrations:sample.orders:ResponseMappings:0:TargetPath"] = "result..success"
        }).Build();
        var dispatcher = new IntegrationDispatcher(configuration, new TestIntegrationHttpClientFactory(handler), new TestIntegrationSecretResolver());
        using var payload = JsonDocument.Parse("""{"document":"PO-19"}""");
        var context = new IntegrationContext(Guid.NewGuid(), "sample.orders", "correlation-1", "idem-1", DateTimeOffset.UtcNow.AddSeconds(20));

        var result = await dispatcher.ExecuteAsync("sample.orders", context, payload.RootElement, CancellationToken.None);

        Assert.True(result.Configured);
        Assert.Equal("mapping_failed", result.Result!.ErrorCode);
        Assert.Equal(0, result.Result.Attempts);
        Assert.Equal(0, calls);
    }

    [Fact]
    public void IntegrationOperationCipher_BindsCiphertextToTenantOperationAndPurpose()
    {
        var key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["IntegrationQueue:EncryptionKey"] = key
        }).Build();
        var tenantId = Guid.NewGuid();
        var operationId = Guid.NewGuid();

        var ciphertext = IntegrationOperationCipher.Encrypt("{\"amount\":42}", configuration, tenantId, operationId, "request");

        Assert.True(IntegrationOperationCipher.IsConfigured(configuration));
        Assert.Equal("{\"amount\":42}", IntegrationOperationCipher.Decrypt(ciphertext, configuration, tenantId, operationId, "request"));
        Assert.ThrowsAny<CryptographicException>(() => IntegrationOperationCipher.Decrypt(ciphertext, configuration, Guid.NewGuid(), operationId, "request"));
        Assert.ThrowsAny<CryptographicException>(() => IntegrationOperationCipher.Decrypt(ciphertext, configuration, tenantId, operationId, "result"));
        Assert.NotEqual(
            IntegrationOperationCipher.CreateProviderIdempotencyKey(tenantId, "netsis", "key-1"),
            IntegrationOperationCipher.CreateProviderIdempotencyKey(Guid.NewGuid(), "netsis", "key-1"));
    }

    [Fact]
    public async Task ModulePackageVerifier_RequiresMatchingHashAndTrustedPublisherSignature()
    {
        using var rsa = RSA.Create(2048);
        var artifactBytes = "module package bytes"u8.ToArray();
        var artifactHash = Convert.ToHexStringLower(SHA256.HashData(artifactBytes));
        var manifest = new ModuleManifest("service.desk", "Service Desk", "1.2.0", "Nexora", "1.0.0", [],
            [new ModulePermission("service.desk.read", "Search customer directory")],
            [new ModuleMenuEntry("service.desk.search", "Search", "/service-desk", "service.desk.read",
                new ModuleMenuView("form", [new ModuleUiField("term", "Customer", "text", Required: true, MaxLength: 100)],
                    "table", [new ModuleUiField("code", "Code", "text")] ))], [],
            [new ModuleDataCapability("customers.search", "service.desk.read")]);
        var payload = ModulePackageVerifier.CreateSigningPayload(manifest, "nexora-ci-2026", artifactHash);
        var signature = Convert.ToBase64String(rsa.SignData(payload, HashAlgorithmName.SHA256, RSASignaturePadding.Pss));
        var package = new SignedModulePackage(
            manifest,
            "nexora-ci-2026",
            artifactHash,
            signature);
        var resolver = new TestPublisherKeyResolver(rsa.ExportSubjectPublicKeyInfoPem());

        var validResult = await ModulePackageVerifier.VerifyAsync(package, new MemoryStream(artifactBytes), resolver);
        var tamperedResult = await ModulePackageVerifier.VerifyAsync(package with { ArtifactSha256 = new string('0', 64) }, new MemoryStream(artifactBytes), resolver);

        Assert.True(validResult.IsValid, validResult.Error);
        Assert.False(tamperedResult.IsValid);
        Assert.Contains("checksum", tamperedResult.Error, StringComparison.OrdinalIgnoreCase);
        var alteredManifest = package with { Manifest = manifest with { Permissions = [new ModulePermission("service.desk.read", "Changed permission description")] } };
        var tamperedManifestResult = await ModulePackageVerifier.VerifyAsync(alteredManifest, new MemoryStream(artifactBytes), resolver);
        Assert.False(tamperedManifestResult.IsValid);
        Assert.Contains("signature", tamperedManifestResult.Error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ModuleDependencyResolver_ReturnsDeterministicDependencyFirstOrder()
    {
        var application = Manifest("application", "1.0.0", [new ModuleDependency("inventory", "1.4.0"), new ModuleDependency("customers", "2.0.0")]);
        var catalog = new[]
        {
            application,
            Manifest("inventory", "1.5.0", [new ModuleDependency("base", "1.0.0")]),
            Manifest("customers", "2.0.0", []),
            Manifest("base", "1.0.0", [])
        };

        var result = ModuleDependencyResolver.Resolve("application", catalog);

        Assert.True(result.IsValid, string.Join(Environment.NewLine, result.Errors));
        var order = result.InstallOrder.Select(x => x.ModuleCode).ToArray();
        Assert.Equal(["customers", "base", "inventory", "application"], order);
        Assert.True(Array.IndexOf(order, "base") < Array.IndexOf(order, "inventory"));
        Assert.True(Array.IndexOf(order, "inventory") < Array.IndexOf(order, "application"));
    }

    [Fact]
    public void ModuleDependencyResolver_RejectsMissingVersionsAndCycles()
    {
        var cycleResult = ModuleDependencyResolver.Resolve("application", [
            Manifest("application", "1.0.0", [new ModuleDependency("inventory", "1.0.0")]),
            Manifest("inventory", "1.0.0", [new ModuleDependency("application", "1.0.0")])
        ]);

        var versionResult = ModuleDependencyResolver.Resolve("application", [
            Manifest("application", "1.0.0", [new ModuleDependency("inventory", "2.0.0")]),
            Manifest("inventory", "1.0.0", [])
        ]);

        Assert.False(cycleResult.IsValid);
        Assert.Empty(cycleResult.InstallOrder);
        Assert.Contains(cycleResult.Errors, error => error.Contains("cycle", StringComparison.OrdinalIgnoreCase));
        Assert.False(versionResult.IsValid);
        Assert.Contains(versionResult.Errors, error => error.Contains("requires", StringComparison.Ordinal));
    }

    [Fact]
    public void ModuleDependencyResolver_UsesSemVer2PrecedenceForLargeNumericIdentifiers()
    {
        const string huge = "999999999999999999999999999999999999999999999999999999999999";
        var largePrerelease = ModuleDependencyResolver.Resolve("application", [
            Manifest("application", "1.0.0", [new ModuleDependency("library", "1.0.0-9")]),
            Manifest("library", $"1.0.0-{huge}", [])
        ]);
        var largeCore = ModuleDependencyResolver.Resolve("application", [
            Manifest("application", "1.0.0", [new ModuleDependency("library", $"{huge}.0.0")]),
            Manifest("library", "9.0.0", [])
        ]);

        Assert.True(largePrerelease.IsValid, string.Join(Environment.NewLine, largePrerelease.Errors));
        Assert.False(largeCore.IsValid);
        Assert.Contains(largeCore.Errors, error => error.Contains("requires", StringComparison.Ordinal));
        Assert.True(ModuleManifestValidator.IsValidSemVersion($"1.0.0-{huge}"));
    }

    [Theory]
    [InlineData("1.0.0-01")]
    [InlineData("1.0.0-alpha..1")]
    [InlineData("1.0.0-alpha.")]
    [InlineData("1.0.0+build..1")]
    [InlineData("1.0.0+build.")]
    [InlineData("1.0.0\n")]
    [InlineData("١.0.0")]
    public void ModuleManifestValidator_RejectsInvalidSemVer2Identifiers(string version)
    {
        Assert.False(ModuleManifestValidator.IsValidSemVersion(version));
    }

    [Fact]
    public void ModuleDependencyResolver_IgnoresBuildMetadataForVersionPrecedence()
    {
        var result = ModuleDependencyResolver.Resolve("application", [
            Manifest("application", "1.0.0", [new ModuleDependency("library", "1.0.0+required")]),
            Manifest("library", "1.0.0+catalog", [])
        ]);

        Assert.True(result.IsValid, string.Join(Environment.NewLine, result.Errors));
    }

    [Theory]
    [InlineData("GET", "/api/tenant/modules/marketplace", "/api/tenant/modules/marketplace", "read")]
    [InlineData("POST", "/api/tenant/modules/activate", "/api/tenant/modules/activate", "execute")]
    [InlineData("POST", "/api/tenant/modules/service.desk/invoke", "/api/tenant/modules/{moduleCode}/invoke", "execute")]
    [InlineData("DELETE", "/api/tenant/modules/service.desk", "/api/tenant/modules/{moduleCode}", "delete")]
    public void PlatformPermissionCatalog_ResolvesTenantModuleMarketplaceRoutes(string method, string path, string routePattern, string action)
    {
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var routeValues = new Dictionary<string, string?> { ["moduleCode"] = "service.desk" };

        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern, routeValues, tenantId, userId, "TenantAdmin", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.tenant-modules", permission.Permission.ResourceType);
        Assert.Equal(action, permission.Permission.Action);
    }

    [Theory]
    [InlineData("POST", "/api/reports/run", "/api/reports/run")]
    [InlineData("POST", "/api/reports/export", "/api/reports/export")]
    [InlineData("POST", "/api/reports/9a3e8a5c-7d35-4a0b-bb41-59cc4c6d4561/run", "/api/reports/{reportId:guid}/run")]
    public void PlatformPermissionCatalog_RequiresExecutePermissionForReportQueries(string method, string path, string routePattern)
    {
        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.reports", permission.Permission.ResourceType);
        Assert.Equal("execute", permission.Permission.Action);
    }

    [Theory]
    [InlineData("GET", "/api/crm/opportunities", "/api/crm/opportunities", "read")]
    [InlineData("POST", "/api/crm/opportunities", "/api/crm/opportunities", "create")]
    [InlineData("POST", "/api/crm/opportunities/123/stage", "/api/crm/opportunities/{id:guid}/stage", "execute")]
    public void PlatformPermissionCatalog_ResolvesCrmOpportunityRoutes(string method, string path, string routePattern, string action)
    {
        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.crm-opportunities", permission.Permission.ResourceType);
        Assert.Equal(action, permission.Permission.Action);
    }

    [Theory]
    [InlineData("GET", "/api/manufacturing/boms/", "/api/manufacturing/boms/", "read")]
    [InlineData("GET", "/api/manufacturing/work-centers/", "/api/manufacturing/work-centers/", "read")]
    [InlineData("GET", "/api/manufacturing/orders/", "/api/manufacturing/orders/", "read")]
    [InlineData("GET", "/api/manufacturing/mrp/plans", "/api/manufacturing/mrp/plans", "read")]
    [InlineData("POST", "/api/manufacturing/work-centers/", "/api/manufacturing/work-centers/", "create")]
    [InlineData("POST", "/api/manufacturing/orders/{id}/release", "/api/manufacturing/orders/{id:guid}/release", "execute")]
    [InlineData("POST", "/api/manufacturing/orders/{id}/schedule", "/api/manufacturing/orders/{id:guid}/schedule", "execute")]
    [InlineData("POST", "/api/manufacturing/orders/{id}/operations/{operationId}/start", "/api/manufacturing/orders/{id:guid}/operations/{operationId:guid}/start", "execute")]
    [InlineData("POST", "/api/manufacturing/orders/{id}/operations/{operationId}/complete", "/api/manufacturing/orders/{id:guid}/operations/{operationId:guid}/complete", "execute")]
    [InlineData("POST", "/api/manufacturing/orders/{id}/complete", "/api/manufacturing/orders/{id:guid}/complete", "execute")]
    [InlineData("POST", "/api/manufacturing/mrp/plans/{id}/convert", "/api/manufacturing/mrp/plans/{id:guid}/convert", "execute")]
    public void PlatformPermissionCatalog_ResolvesManufacturingRoutes(string method, string path, string routePattern, string action)
    {
        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.manufacturing", permission.Permission.ResourceType);
        Assert.Equal(action, permission.Permission.Action);
    }

    [Theory]
    [InlineData("GET", "/api/foreign-trade/cases", "/api/foreign-trade/cases", "read")]
    [InlineData("POST", "/api/foreign-trade/cases", "/api/foreign-trade/cases", "create")]
    [InlineData("PUT", "/api/foreign-trade/cases/123", "/api/foreign-trade/cases/{id:guid}", "update")]
    [InlineData("POST", "/api/foreign-trade/cases/123/transition", "/api/foreign-trade/cases/{id:guid}/transition", "execute")]
    public void PlatformPermissionCatalog_ResolvesForeignTradeActions(string method, string path, string routePattern, string action)
    {
        var resolved = PlatformPermissionCatalog.TryResolve(path, method, routePattern, new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.foreign-trade", permission.Permission.ResourceType);
        Assert.Equal(action, permission.Permission.Action);
    }

    [Fact]
    public void PlatformPermissionCatalog_UsesDedicatedPermissionForAiUiDesign()
    {
        var resolved = PlatformPermissionCatalog.TryResolve("/studio/projects/project/workspace-requests/request/ui-design", "POST",
            "/studio/projects/{projectId:guid}/workspace-requests/{requestId:guid}/ui-design", new Dictionary<string, string?>(),
            Guid.NewGuid(), Guid.NewGuid(), "TenantDeveloper", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("studio.ai-design", permission.Permission.ResourceType);
        Assert.Equal("execute", permission.Permission.Action);
    }

    [Fact]
    public void PlatformPermissionCatalog_MapsIntegrationExecutionToDedicatedPermission()
    {
        var resolved = PlatformPermissionCatalog.TryResolve("/api/integrations/netsis/execute", "POST",
            "/api/integrations/{integrationCode}/execute", new Dictionary<string, string?> { ["integrationCode"] = "netsis" },
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.integrations", permission.Permission.ResourceType);
        Assert.Equal("execute", permission.Permission.Action);
    }

    [Fact]
    public void PlatformPermissionCatalog_RequiresReadPermissionForIntegrationOperationStatus()
    {
        var operationId = Guid.NewGuid();
        var resolved = PlatformPermissionCatalog.TryResolve($"/api/integrations/operations/{operationId:D}", "GET",
            "/api/integrations/operations/{operationId:guid}", new Dictionary<string, string?> { ["operationId"] = operationId.ToString("D") },
            Guid.NewGuid(), Guid.NewGuid(), "TenantUser", out var permission);

        Assert.True(resolved);
        Assert.NotNull(permission);
        Assert.Equal("erp.integrations", permission.Permission.ResourceType);
        Assert.Equal("read", permission.Permission.Action);
    }

    [Fact]
    public async Task DistributedDeploymentLock_SerializesWritersAndReleasesOnDispose()
    {
        var root = Path.Combine(Path.GetTempPath(), $"aierp-deployer-lock-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var lockPath = Path.Combine(root, "deployment.lock");
        FileStream OpenLockFile() => new(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.WriteThrough);
        try
        {
            var first = await DistributedDeploymentLock.AcquireCoreAsync(OpenLockFile, CancellationToken.None);
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var secondTask = DistributedDeploymentLock.AcquireCoreAsync(OpenLockFile, cancellation.Token);
            await Task.Delay(500);
            Assert.False(secondTask.IsCompleted);

            await first.DisposeAsync();
            await using var second = await secondTask.WaitAsync(TimeSpan.FromSeconds(5));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void PrometheusHttpMetrics_EmitsBoundedHistogramSeries()
    {
        var metrics = new PrometheusHttpMetrics();
        metrics.Record("GET", "/api/items/{id:guid}", 200, 0.2);
        metrics.Record("GET", "/api/items/{id:guid}", 200, 0.3);
        metrics.Record("POST", "/api/items", 503, 11);

        var rendered = metrics.Render();

        Assert.Contains("# TYPE aierp_http_server_request_duration_seconds histogram", rendered, StringComparison.Ordinal);
        Assert.Contains("method=\"GET\",route=\"/api/items/{id:guid}\",status=\"200\",le=\"0.25\"} 1", rendered, StringComparison.Ordinal);
        Assert.Contains("method=\"GET\",route=\"/api/items/{id:guid}\",status=\"200\",le=\"0.5\"} 2", rendered, StringComparison.Ordinal);
        Assert.Contains("method=\"GET\",route=\"/api/items/{id:guid}\",status=\"200\",le=\"+Inf\"} 2", rendered, StringComparison.Ordinal);
        Assert.Contains("method=\"POST\",route=\"/api/items\",status=\"503\",le=\"+Inf\"} 1", rendered, StringComparison.Ordinal);

        metrics.Record("UNTRUSTED-METHOD-1", "/unmatched", 700, 0.001);
        Assert.Contains("method=\"OTHER\",route=\"/unmatched\",status=\"500\"", metrics.Render(), StringComparison.Ordinal);
    }

    private sealed class TestPublisherKeyResolver(string publicKeyPem) : IModulePublisherKeyResolver
    {
        public ValueTask<string?> GetPublicKeyPemAsync(string publisher, string keyId, CancellationToken cancellationToken) =>
            ValueTask.FromResult<string?>(publisher == "Nexora" && keyId == "nexora-ci-2026" ? publicKeyPem : null);
    }

    private sealed class TestIntegrationAdapter(
        string integrationCode,
        Func<IntegrationContext, string, CancellationToken, Task<IntegrationResult<string>>> execute) : IERPIntegrationAdapter<string, string>
    {
        public string IntegrationCode => integrationCode;

        public Task<IntegrationResult<string>> ExecuteAsync(IntegrationContext context, string request, CancellationToken cancellationToken) =>
            execute(context, request, cancellationToken);
    }

    private sealed class TestHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }

    private sealed class TestIntegrationHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class CapturingHttpMessageHandler(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            send(request, cancellationToken);
    }

    private sealed class TestIntegrationSecretResolver : IIntegrationSecretResolver
    {
        public ValueTask<ReadOnlyMemory<char>> ResolveAsync(Guid tenantId, IntegrationCredentialReference reference,
            CancellationToken cancellationToken) => ValueTask.FromResult(ReadOnlyMemory<char>.Empty);
    }

    private sealed class FixedIntegrationSecretResolver(string secret) : IIntegrationSecretResolver
    {
        public ValueTask<ReadOnlyMemory<char>> ResolveAsync(Guid tenantId, IntegrationCredentialReference reference,
            CancellationToken cancellationToken) => ValueTask.FromResult(secret.AsMemory());
    }

    private static ModuleManifest Manifest(string code, string version, IReadOnlyList<ModuleDependency> dependencies) =>
        new(code, code, version, "Nexora", "1.0.0", dependencies, [], [], []);
}
