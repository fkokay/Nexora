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
using System.Text.Json;

namespace AIERP.Platform.UnitTests;

public sealed class ExtensionSdkTests
{
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
        try
        {
            var first = await DistributedDeploymentLock.AcquireAsync(root, CancellationToken.None);
            using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(800));
            var secondTask = DistributedDeploymentLock.AcquireAsync(root, cancellation.Token);
            await Task.Delay(350);
            Assert.False(secondTask.IsCompleted);

            await first.DisposeAsync();
            await using var second = await secondTask.WaitAsync(TimeSpan.FromSeconds(2));
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

    private sealed class TestIntegrationSecretResolver : IIntegrationSecretResolver
    {
        public ValueTask<ReadOnlyMemory<char>> ResolveAsync(Guid tenantId, IntegrationCredentialReference reference,
            CancellationToken cancellationToken) => ValueTask.FromResult(ReadOnlyMemory<char>.Empty);
    }

    private static ModuleManifest Manifest(string code, string version, IReadOnlyList<ModuleDependency> dependencies) =>
        new(code, code, version, "Nexora", "1.0.0", dependencies, [], [], []);
}
