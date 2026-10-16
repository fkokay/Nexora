namespace AIERP.Platform.Application;

public sealed record PermissionResourceDefinition(string ResourceType, string RoutePrefix, string Description);
public sealed record PlatformPermissionDefinition(string Code, string ResourceType, string Action, string Description);
public sealed record ResolvedPlatformPermission(PlatformPermissionDefinition Permission, IReadOnlyDictionary<string, string> Attributes);

public interface IPlatformPermissionAuthorizer
{
    Task<bool> IsAllowedAsync(Guid tenantId, Guid userId, string role, ResolvedPlatformPermission permission,
        CancellationToken cancellationToken = default);
}

public static class PlatformPermissionCatalog
{
    private static readonly string[] Actions = ["read", "create", "update", "delete", "execute"];

    public static IReadOnlyList<PermissionResourceDefinition> Resources { get; } =
    [
        new("system.session", "/api/auth/me", "User session information"),
        new("erp.dashboard", "/api/dashboard", "ERP dashboard"),
        new("erp.audit-events", "/api/audit-events", "Tenant audit history"),
        new("erp.audit-retention", "/api/audit-retention", "Tenant audit retention policy"),
        new("erp.access-control", "/api/access-control", "Tenant permissions and policies"),
        new("erp.customer-groups", "/api/customer-groups", "Customer groups"),
        new("erp.customers", "/api/customers", "Customer and supplier accounts"),
        new("erp.stock-items", "/api/stock/items", "Stock cards and units"),
        new("erp.warehouses", "/api/warehouses", "Warehouses and stock balances"),
        new("erp.inventory-transfers", "/api/warehouses/transfers", "Warehouse transfers"),
        new("erp.inventory-cost-adjustments", "/api/warehouses/cost-adjustments", "Inventory landed costs and revaluation"),
        new("erp.sales-quotes", "/api/sales/quotes", "Sales quotes"),
        new("erp.sales-orders", "/api/sales/orders", "Sales orders and reservations"),
        new("erp.sales-deliveries", "/api/sales/deliveries", "Sales deliveries"),
        new("erp.sales-invoices", "/api/sales/invoices", "Sales invoices"),
        new("erp.customer-collections", "/api/customer-collections", "Customer collections"),
        new("erp.sales-returns", "/api/sales/returns", "Sales returns"),
        new("erp.purchase-requests", "/api/purchasing/requests", "Purchase requests"),
        new("erp.supplier-quotes", "/api/purchasing/supplier-quotes", "Supplier quotes"),
        new("erp.purchase-orders", "/api/purchasing/orders", "Purchase orders"),
        new("erp.purchase-receipts", "/api/purchasing/receipts", "Purchase receipts and landed costs"),
        new("erp.purchase-invoices", "/api/purchasing/invoices", "Purchase invoices"),
        new("erp.supplier-returns", "/api/purchasing/returns", "Supplier returns"),
        new("erp.supplier-payments", "/api/purchasing/payments", "Supplier payments"),
        new("erp.finance-currency", "/api/finance/currency", "Tenant base currency"),
        new("erp.exchange-rates", "/api/finance/exchange-rates", "Tenant exchange rates"),
        new("erp.fx-exposure", "/api/finance/fx-exposure", "Foreign currency exposure"),
        new("erp.fx-revaluations", "/api/finance/fx-revaluations", "Period-end FX revaluation vouchers"),
        new("erp.general-ledger", "/api/finance/general-ledger", "Tenant chart of accounts, mappings, and journal entries"),
        new("erp.finance-accounts", "/api/finance/accounts", "Cash and bank accounts"),
        new("erp.financial-transfers", "/api/finance/transfers", "Financial account transfers"),
        new("erp.bank-statements", "/api/finance/statements", "Bank statements and reconciliation"),
        new("erp.maturities", "/api/finance/maturities", "Receivable and payable maturities"),
        new("studio.capabilities", "/studio/capabilities", "Studio capabilities"),
        new("studio.requests", "/studio/requests", "Development requests"),
        new("studio.projects", "/studio/projects", "Development projects and members"),
        new("studio.workspace-requests", "/studio/workspace-requests", "Project workspace requests"),
        new("studio.workspace-files", "/studio/projects", "Project workspace files and source"),
        new("studio.workspace-tests", "/studio/projects", "Workspace tests and builds"),
        new("studio.release-candidates", "/studio/projects", "Release candidates and versions"),
        new("studio.release-packages", "/studio/projects", "Release packages"),
        new("studio.deployments", "/studio/projects", "Staging and production deployments"),
        new("studio.production-approvals", "/studio/projects", "Production promotion approvals"),
        new("studio.ai-analysis", "/studio/projects", "AI source and test analysis"),
        new("studio.ai-plans", "/studio/projects", "AI test and architecture plans"),
        new("studio.conversations", "/studio/projects", "Studio conversations"),
        new("studio.code-suggestions", "/studio/projects", "AI code suggestions and changes")
    ];

    public static IReadOnlyList<PlatformPermissionDefinition> Definitions { get; } =
        Resources.SelectMany(resource => Actions.Select(action => new PlatformPermissionDefinition(
            $"{resource.ResourceType}.{action}", resource.ResourceType, action,
            $"{action} · {resource.Description}"))).ToArray();

    public static IReadOnlyList<string> ActionsFor(string resourceType) => Actions;

    public static bool TryResolve(string path, string method, string routePattern,
        IReadOnlyDictionary<string, string?> routeValues, Guid tenantId, Guid userId, string role,
        out ResolvedPlatformPermission? resolved)
    {
        resolved = null;
        if (string.Equals(path, "/api/auth/select-tenant", StringComparison.OrdinalIgnoreCase)) return true;
        PermissionResourceDefinition? resource = null;
        if (path.StartsWith("/api/warehouses/transfers", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.inventory-transfers");
        else if (path.StartsWith("/api/warehouses/cost-adjustments", StringComparison.OrdinalIgnoreCase)
            || path.Contains("/stock/", StringComparison.OrdinalIgnoreCase)
                && (path.Contains("/cost-adjustments", StringComparison.OrdinalIgnoreCase) || path.Contains("/revaluations", StringComparison.OrdinalIgnoreCase))
            || path.StartsWith("/api/purchasing/receipts/", StringComparison.OrdinalIgnoreCase)
                && path.Contains("/landed-costs", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.inventory-cost-adjustments");
        resource ??= Resources.Where(x => path.Equals(x.RoutePrefix, StringComparison.OrdinalIgnoreCase)
                || path.StartsWith(x.RoutePrefix.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(x => x.RoutePrefix.Length).FirstOrDefault();
        if (path.StartsWith("/studio/projects", StringComparison.OrdinalIgnoreCase))
            resource = ResolveStudioProjectResource(routePattern);
        if (resource is null) return false;
        var action = method.ToUpperInvariant() switch
        {
            "GET" or "HEAD" => "read",
            "PUT" or "PATCH" => "update",
            "DELETE" => "delete",
            "POST" => IsExecutionRoute(routePattern) ? "execute" : "create",
            _ => null
        };
        if (action is null) return false;
        var definition = Definitions.FirstOrDefault(x => x.ResourceType == resource.ResourceType && x.Action == action);
        if (definition is null) return false;
        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["subject.userId"] = userId.ToString("D"),
            ["subject.role"] = role,
            ["resource.type"] = resource.ResourceType,
            ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.method"] = method.ToUpperInvariant(),
            ["request.action"] = action
        };
        foreach (var (key, value) in routeValues)
            if (!string.IsNullOrWhiteSpace(value) && value.Length <= 256 && key.Length <= 64)
                attributes[$"resource.route.{key}"] = value;
        resolved = new ResolvedPlatformPermission(definition, attributes);
        return true;
    }

    private static PermissionResourceDefinition ResolveStudioProjectResource(string routePattern)
    {
        var route = routePattern.ToLowerInvariant();
        var resourceType = route.Contains("production-approval") ? "studio.production-approvals"
            : route.Contains("production-deployment") || route.Contains("release-deployment") || route.Contains("/deployments/") ? "studio.deployments"
            : route.Contains("release-packages") || route.EndsWith("/package") ? "studio.release-packages"
            : route.Contains("release-candidate") || route.Contains("release-version") ? "studio.release-candidates"
            : route.Contains("test-run") || route.Contains("build-run") || route.Contains("test-discovery") ? "studio.workspace-tests"
            : route.Contains("conversation") ? "studio.conversations"
            : route.Contains("test-plan") || route.Contains("architecture-plan") ? "studio.ai-plans"
            : route.Contains("analysis") || route.Contains("code-review") || route.Contains("sandbox-error-analysis") ? "studio.ai-analysis"
            : route.Contains("code-suggestion") || route.Contains("/changes") || route.Contains("/commit-approved-changes") ? "studio.code-suggestions"
            : route.EndsWith("/workspace-requests") ? "studio.workspace-requests"
            : route.Contains("workspace-requests") ? "studio.workspace-files"
            : "studio.projects";
        return Resources.First(x => x.ResourceType == resourceType);
    }

    private static bool IsExecutionRoute(string routePattern)
    {
        var route = routePattern.TrimEnd('/').ToLowerInvariant();
        var operationSegments = new[] { "post", "approve", "reject", "cancel", "review", "provision", "deploy", "restore", "reverse", "void",
            "package", "version", "publish-pull-request", "pull-request-draft", "working-branch", "commit-approved-changes",
            "apply-code-suggestion", "multi-file-code-suggestion", "code-suggestion", "source-analysis", "test-plan",
            "architecture-plan", "code-review", "sandbox-error-analysis", "revalue", "reconcile", "convert", "close", "release",
            "send", "accept", "match", "auto-match", "create-book-entry", "convert-to-order", "decision", "activate", "deactivate" };
        var tail = route.Split('/').LastOrDefault() ?? string.Empty;
        return operationSegments.Contains(tail, StringComparer.OrdinalIgnoreCase);
    }

    public static IReadOnlyList<string> AttributeKeys { get; } =
    ["subject.userId", "subject.role", "resource.type", "resource.tenantId", "request.method", "request.action",
     "resource.route.id", "resource.route.projectId", "resource.route.requestId", "resource.route.workspaceRequestId",
     "resource.route.invoiceId", "resource.route.candidateId", "resource.route.deploymentId", "resource.route.packageId",
     "resource.route.approvalId", "resource.route.conversationId", "resource.route.planId", "resource.route.changeId",
     "resource.route.id", "resource.route.memberId", "resource.route.versionId", "resource.route.workspaceRequestId",
     "resource.route.supplierId", "resource.route.orderId", "resource.route.receiptId", "resource.route.candidateId",
     "resource.route.statementId", "resource.route.accountId"];
}
