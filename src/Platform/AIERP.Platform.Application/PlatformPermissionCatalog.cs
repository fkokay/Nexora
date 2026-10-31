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
        new("erp.crm-opportunities", "/api/crm/opportunities", "CRM sales opportunities"),
        new("erp.access-control", "/api/access-control", "Tenant permissions and policies"),
        new("erp.custom-forms", "/api/custom-forms", "Tenant dynamic forms and submissions"),
        new("erp.workflows", "/api/workflows", "Tenant workflow definitions, instances and approvals"),
        new("erp.business-rules", "/api/business-rules", "Tenant business rule definitions and evaluation history"),
        new("erp.reports", "/api/reports", "Tenant report definitions and execution"),
        new("erp.custom-menus", "/api/custom-menus", "Tenant custom navigation entries"),
        new("erp.ai-settings", "/api/ai-settings", "Tenant AI provider settings and API credentials"),
        new("erp.customer-groups", "/api/customer-groups", "Customer groups"),
        new("erp.customers", "/api/customers", "Customer and supplier accounts"),
        new("erp.stock-items", "/api/stock", "Stock cards, units and categories"),
        new("erp.warehouses", "/api/warehouses", "Warehouses and stock balances"),
        new("erp.manufacturing", "/api/manufacturing", "Manufacturing recipes, work centers, orders and material planning"),
        new("erp.human-resources", "/api/hr", "Tenant-scoped personnel, leave, attendance, and payroll rule administration"),
        new("erp.payroll-compensation", "/api/hr/payroll/compensation", "Confidential effective-dated employee gross/net compensation targets"),
        new("erp.fixed-assets", "/api/fixed-assets", "Tenant fixed-asset register, depreciation, and custody"),
        new("erp.tenant-settings", "/api/tenant-settings", "Company-specific operational policies and behavior"),
        new("erp.organizational-definitions", "/api/definitions/workplaces", "Tenant workplace, branch and factory definitions"),
        new("erp.customer-locations", "/api/location-definitions", "Customer address province and district definitions"),
        new("erp.tenant-company-profile", "/api/tenant-company-profile", "Tenant legal company profile"),
        new("erp.screen-views", "/api/screen-views", "Tenant built-in ERP screen layouts"),
        new("erp.inventory-transfers", "/api/warehouses/transfers", "Warehouse transfers"),
        new("erp.inventory-cost-adjustments", "/api/warehouses/cost-adjustments", "Inventory landed costs and revaluation"),
        new("erp.sales-quotes", "/api/sales/quotes", "Sales quotes"),
        new("erp.sales-promotions", "/api/sales/promotions", "Sales promotion campaigns and applications"),
        new("erp.sales-orders", "/api/sales/orders", "Sales orders and reservations"),
        new("erp.sales-deliveries", "/api/sales/deliveries", "Sales deliveries"),
        new("erp.sales-invoices", "/api/sales/invoices", "Sales invoices"),
        new("erp.customer-collections", "/api/customer-collections", "Customer collections"),
        new("erp.sales-returns", "/api/sales/returns", "Sales returns"),
        new("erp.purchase-requests", "/api/purchasing/requests", "Purchase requests"),
        new("erp.supplier-quotes", "/api/purchasing/supplier-quotes", "Supplier quotes"),
        new("erp.purchase-orders", "/api/purchasing/orders", "Purchase orders"),
        new("erp.purchase-receipts", "/api/purchasing/receipts", "Purchase receipts and landed costs"),
        new("erp.purchase-delivery-notes", "/api/purchasing/delivery-notes", "Supplier delivery note records and receipt reconciliation"),
        new("erp.purchase-invoices", "/api/purchasing/invoices", "Purchase invoices"),
        new("erp.foreign-trade", "/api/foreign-trade", "Foreign trade cases and logistics status"),
        new("erp.commercial-contracts", "/api/commercial-contracts", "Tenant commercial sales and purchase contracts"),
        new("erp.operational-projects", "/api/projects", "Tenant operational projects, tasks, allocations, and time entries"),
        new("erp.inventory-tracking", "/api/inventory-tracking", "Tenant lot and serial inventory traceability inquiries"),
        new("erp.supplier-returns", "/api/purchasing/returns", "Supplier returns"),
        new("erp.supplier-payments", "/api/purchasing/payments", "Supplier payments"),
        new("erp.finance-currency", "/api/finance/currency", "Tenant base currency"),
        new("erp.exchange-rates", "/api/finance/exchange-rates", "Tenant exchange rates"),
        new("erp.fx-exposure", "/api/finance/fx-exposure", "Foreign currency exposure"),
        new("erp.fx-revaluations", "/api/finance/fx-revaluations", "Period-end FX revaluation vouchers"),
        new("erp.general-ledger", "/api/finance/general-ledger", "Tenant chart of accounts, mappings, and journal entries"),
        new("erp.finance-accounts", "/api/finance/accounts", "Cash and bank accounts"),
        new("erp.finance.credit-facilities", "/api/finance/credit-facilities", "Credit facilities and repayment schedules"),
        new("erp.finance-budgets", "/api/finance/budgets", "Tenant financial budgets and actuals"),
        new("erp.finance-cash-budgets", "/api/finance/cash-budgets", "Tenant direct cash budgets"),
        new("erp.finance-cash-flow", "/api/finance/cash-flow", "Cash-flow forecast aggregated from tenant financial activity"),
        new("erp.finance-payment-instruments", "/api/finance/payment-instruments", "Tenant checks and promissory notes"),
        new("erp.financial-transfers", "/api/finance/transfers", "Financial account transfers"),
        new("erp.bank-statements", "/api/finance/statements", "Bank statements and reconciliation"),
        new("erp.maturities", "/api/finance/maturities", "Receivable and payable maturities"),
        new("erp.tenant-modules", "/api/tenant/modules", "Published extension catalog and tenant module entitlements"),
        new("erp.integrations", "/api/integrations", "Tenant integration execution"),
        new("erp.e-documents", "/api/e-documents", "Electronic document preparation and submission approvals"),
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
        new("studio.ai-design", "/studio/projects", "AI ERP screen design proposals"),
        new("studio.ai-plans", "/studio/projects", "AI test and architecture plans"),
        new("studio.conversations", "/studio/projects", "Studio conversations"),
        new("studio.code-suggestions", "/studio/projects", "AI code suggestions and changes")
    ];

    public static IReadOnlyList<PlatformPermissionDefinition> Definitions { get; } =
        Resources.SelectMany(resource => ActionsFor(resource.ResourceType).Select(action => new PlatformPermissionDefinition(
                $"{resource.ResourceType}.{action}", resource.ResourceType, action,
                $"{action} · {resource.Description}")))
            .Append(new PlatformPermissionDefinition("erp.operational-projects.time-entries.create", "erp.operational-projects", "create",
                "Create own operational project time entries"))
            .ToArray();

    public static IReadOnlyList<string> ActionsFor(string resourceType) => resourceType == "erp.payroll-compensation"
        ? ["view", "change", "approve"]
        : Actions;

    public static bool TryResolve(string path, string method, string routePattern,
        IReadOnlyDictionary<string, string?> routeValues, Guid tenantId, Guid userId, string role,
        out ResolvedPlatformPermission? resolved)
    {
        resolved = null;
        if (string.Equals(path, "/api/auth/select-tenant", StringComparison.OrdinalIgnoreCase)) return true;
        PermissionResourceDefinition? resource = null;
        var normalizedRoute = routePattern.TrimEnd('/');
        var nestedWriteAction = false;
        var explicitUpdateAction = false;
        var explicitCreateAction = false;
        var explicitExecuteAction = false;
        var stateTransitionAction = false;
        var ownTimeEntryCreate = method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && path.StartsWith("/api/projects/", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.EndsWith("/{id:guid}/time-entries", StringComparison.OrdinalIgnoreCase);
        if (method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && ((path.StartsWith("/api/projects/", StringComparison.OrdinalIgnoreCase)
                    && (normalizedRoute.EndsWith("/{id:guid}/status", StringComparison.OrdinalIgnoreCase)
                        || normalizedRoute.EndsWith("/{id:guid}/tasks/{taskId:guid}/status", StringComparison.OrdinalIgnoreCase)))
                || (path.StartsWith("/api/commercial-contracts/", StringComparison.OrdinalIgnoreCase)
                    && normalizedRoute.EndsWith("/{id:guid}/transitions", StringComparison.OrdinalIgnoreCase))))
            stateTransitionAction = true;
        if (path.TrimEnd('/').Equals("/api/purchasing/invoices/entry/receipts", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.Equals("/api/purchasing/invoices/entry/receipts", StringComparison.OrdinalIgnoreCase)
            && method.Equals("GET", StringComparison.OrdinalIgnoreCase))
        {
            // This endpoint lists receipts that the caller can turn into purchase
            // invoices; access is governed by invoice creation permission.
            resource = Resources.First(x => x.ResourceType == "erp.purchase-invoices");
            explicitCreateAction = true;
        }
        else if (path.TrimEnd('/').Equals("/api/purchasing/standalone-invoices/suppliers", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.Equals("/api/purchasing/standalone-invoices/suppliers", StringComparison.OrdinalIgnoreCase)
            && method.Equals("GET", StringComparison.OrdinalIgnoreCase))
        {
            // Supplier options are scoped by invoice creation permission and supplier filters.
            resource = Resources.First(x => x.ResourceType == "erp.purchase-invoices");
            explicitCreateAction = true;
        }
        else if (path.TrimEnd('/').Equals("/api/purchasing/standalone-invoices", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/purchasing/standalone-invoices/", StringComparison.OrdinalIgnoreCase))
        {
            // Standalone invoice drafts share the existing purchase-invoice permission family.
            resource = Resources.First(x => x.ResourceType == "erp.purchase-invoices");
        }
        else if (path.TrimEnd('/').Equals("/api/sales/standalone-deliveries", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/sales/standalone-deliveries/", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.sales-deliveries");
        else if (path.TrimEnd('/').Equals("/api/purchasing/standalone-receipts", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/purchasing/standalone-receipts/", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.purchase-receipts");
        if (path.StartsWith("/api/sales/invoices/", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.EndsWith("/{id:guid}/collections", StringComparison.OrdinalIgnoreCase))
        {
            resource = Resources.First(x => x.ResourceType == "erp.customer-collections");
            nestedWriteAction = true;
        }
        else if (path.StartsWith("/api/screen-views/", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.EndsWith("/publish", StringComparison.OrdinalIgnoreCase))
        {
            // Publishing changes the active layout; it is an update, with the
            // endpoint's existing TenantAdmin check remaining authoritative.
            resource = Resources.First(x => x.ResourceType == "erp.screen-views");
            explicitUpdateAction = true;
        }
        else if (path.StartsWith("/api/sales/invoices/", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.EndsWith("/{id:guid}/returns", StringComparison.OrdinalIgnoreCase))
        {
            resource = Resources.First(x => x.ResourceType == "erp.sales-returns");
            nestedWriteAction = true;
        }
        else if (path.StartsWith("/api/purchasing/invoices/", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.EndsWith("/{id:guid}/payments", StringComparison.OrdinalIgnoreCase))
        {
            resource = Resources.First(x => x.ResourceType == "erp.supplier-payments");
            nestedWriteAction = true;
        }
        else if (path.StartsWith("/api/purchasing/invoices/", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase)
            && normalizedRoute.EndsWith("/{id:guid}/returns", StringComparison.OrdinalIgnoreCase))
        {
            resource = Resources.First(x => x.ResourceType == "erp.supplier-returns");
            nestedWriteAction = true;
        }
        else if (path.Equals("/api/finance/exchange-rates/import-tcmb", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase))
        {
            resource = Resources.First(x => x.ResourceType == "erp.exchange-rates");
            explicitExecuteAction = true;
        }
        else if (path.Equals("/api/finance/general-ledger/entries/manual", StringComparison.OrdinalIgnoreCase)
            && method.Equals("POST", StringComparison.OrdinalIgnoreCase))
        {
            resource = Resources.First(x => x.ResourceType == "erp.general-ledger");
            explicitCreateAction = true;
        }
        else if (path.StartsWith("/api/warehouses/transfers", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.inventory-transfers");
        else if (path.StartsWith("/api/warehouses/cost-adjustments", StringComparison.OrdinalIgnoreCase)
            || path.Contains("/stock/", StringComparison.OrdinalIgnoreCase)
                && (path.Contains("/cost-adjustments", StringComparison.OrdinalIgnoreCase) || path.Contains("/revaluations", StringComparison.OrdinalIgnoreCase))
            || path.StartsWith("/api/purchasing/receipts/", StringComparison.OrdinalIgnoreCase)
                && path.Contains("/landed-costs", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.inventory-cost-adjustments");
        else if (path.Equals("/api/sales/promotions", StringComparison.OrdinalIgnoreCase)
            || path.StartsWith("/api/sales/promotions/", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.sales-promotions");
        resource ??= Resources.Where(x => path.Equals(x.RoutePrefix, StringComparison.OrdinalIgnoreCase)
                || path.StartsWith(x.RoutePrefix.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(x => x.RoutePrefix.Length).FirstOrDefault();
        if (path.EndsWith("/api/hr/payroll/compensation/capabilities", StringComparison.OrdinalIgnoreCase))
            resource = Resources.First(x => x.ResourceType == "erp.human-resources");
        if (path.StartsWith("/studio/projects", StringComparison.OrdinalIgnoreCase))
            resource = ResolveStudioProjectResource(routePattern);
        if (resource is null) return false;
        var action = resource.ResourceType == "erp.payroll-compensation"
            ? routePattern.TrimEnd('/').EndsWith("/approve", StringComparison.OrdinalIgnoreCase)
                || routePattern.TrimEnd('/').EndsWith("/reject", StringComparison.OrdinalIgnoreCase) ? "approve"
                : routePattern.TrimEnd('/').EndsWith("/employees", StringComparison.OrdinalIgnoreCase) ? "change"
                : method.Equals("GET", StringComparison.OrdinalIgnoreCase) || method.Equals("HEAD", StringComparison.OrdinalIgnoreCase) ? "view"
                : method.Equals("POST", StringComparison.OrdinalIgnoreCase) ? "change" : null
            : stateTransitionAction || explicitExecuteAction ? "execute"
            : nestedWriteAction ? "create"
            : explicitUpdateAction ? "update"
            : explicitCreateAction ? "create"
            : method.Equals("POST", StringComparison.OrdinalIgnoreCase)
                && IsPaymentInstrumentExecutionRoute(path, normalizedRoute) ? "execute"
            : path.StartsWith("/api/purchasing/delivery-notes/", StringComparison.OrdinalIgnoreCase)
                && (normalizedRoute.EndsWith("/{id:guid}/link-receipt", StringComparison.OrdinalIgnoreCase)
                    || normalizedRoute.EndsWith("/{id:guid}/unlink-receipt", StringComparison.OrdinalIgnoreCase)) ? "update"
            : path.StartsWith("/api/sales/promotions/", StringComparison.OrdinalIgnoreCase)
            && routePattern.Contains("/apply", StringComparison.OrdinalIgnoreCase) ? "execute"
            : method.ToUpperInvariant() switch
        {
            "GET" or "HEAD" => "read",
            "PUT" or "PATCH" => "update",
            "DELETE" => "delete",
            "POST" => resource.ResourceType == "erp.finance.credit-facilities"
                ? IsCreditFacilityExecutionRoute(routePattern) ? "execute" : "create"
                : IsExecutionRoute(routePattern) ? "execute" : "create",
            _ => null
        };
        if (action is null) return false;
        var definition = ownTimeEntryCreate
            ? Definitions.FirstOrDefault(x => x.Code == "erp.operational-projects.time-entries.create")
            : Definitions.FirstOrDefault(x => x.ResourceType == resource.ResourceType && x.Action == action);
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
            : route.Contains("ui-design") ? "studio.ai-design"
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
        var operationSegments = new[] { "post", "approve", "reject", "cancel", "review", "provision", "deploy", "restore", "reverse", "void", "publish",
            "package", "version", "publish-pull-request", "pull-request-draft", "working-branch", "commit-approved-changes",
            "apply-code-suggestion", "multi-file-code-suggestion", "code-suggestion", "source-analysis", "test-plan",
            "architecture-plan", "code-review", "sandbox-error-analysis", "revalue", "reconcile", "convert", "close", "release",
            "send", "accept", "match", "auto-match", "create-book-entry", "convert-to-order", "decision", "activate", "deactivate", "manual", "invoke", "run", "export", "ui-design", "execute", "stage", "transition", "depreciation-postings", "return",
            "schedule", "start", "complete" };
        var tail = route.Split('/').LastOrDefault() ?? string.Empty;
        return operationSegments.Contains(tail, StringComparer.OrdinalIgnoreCase);
    }

    private static bool IsCreditFacilityExecutionRoute(string routePattern)
    {
        var route = routePattern.TrimEnd('/');
        return IsExecutionRoute(routePattern)
            || route.EndsWith("/drawdowns", StringComparison.OrdinalIgnoreCase)
            || route.EndsWith("/repayments", StringComparison.OrdinalIgnoreCase)
            || route.EndsWith("/reversals", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsPaymentInstrumentExecutionRoute(string path, string normalizedRoute)
    {
        if (!path.StartsWith("/api/finance/payment-instruments/", StringComparison.OrdinalIgnoreCase)) return false;
        return new[] { "apply-to-invoice", "endorse", "collect", "bounce", "cancel" }
            .Any(action => normalizedRoute.EndsWith($"/{action}", StringComparison.OrdinalIgnoreCase));
    }

    public static IReadOnlyList<string> AttributeKeys { get; } =
    ["subject.userId", "subject.role", "resource.type", "resource.tenantId", "request.method", "request.action",
     "resource.route.id", "resource.route.projectId", "resource.route.requestId", "resource.route.workspaceRequestId", "resource.route.formId", "resource.route.submissionId",
     "resource.route.invoiceId", "resource.route.candidateId", "resource.route.deploymentId", "resource.route.packageId",
     "resource.route.approvalId", "resource.route.conversationId", "resource.route.planId", "resource.route.changeId",
     "resource.route.id", "resource.route.memberId", "resource.route.versionId", "resource.route.workspaceRequestId",
     "resource.route.moduleCode", "resource.route.menuEntryCode",
     "resource.route.supplierId", "resource.route.orderId", "resource.route.receiptId", "resource.route.candidateId",
     "resource.route.statementId", "resource.route.accountId", "resource.status", "resource.customerId",
     "resource.customerType", "resource.customerActive",
     "resource.supplierId", "resource.ownerUserId"];
}
