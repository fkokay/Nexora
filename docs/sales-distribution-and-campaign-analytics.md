# Sales distribution inquiry and campaign analytics

## Scope

The sales distribution plan is a live, read-only inquiry over open sales order lines for one tenant and one selected warehouse. It groups demand by stock card and shows open demand, warehouse on-hand quantity, active unfulfilled reservations, estimated available stock, and uncovered demand. Search and page size are bounded. The response states its calculation method and does not assign demand to particular orders.

`GET /api/sales/orders/distribution-plan?warehouseId={id}&q={text}&page=1&pageSize=25`

Open demand is each open order line quantity less fulfilled quantities recorded by its reservation rows, floored at zero. Availability is the selected warehouse's posted inventory movements less active reservation balances. Uncovered demand is open demand less non-negative availability, floored at zero. The report does not create reservations, deliveries, purchase requests, or other records.

Campaign performance is a live, read-only inquiry over saved campaign applications. It reports application count and applied discount amount by quote currency, the distinct applied quotes, and non-cancelled sales orders linked to those quotes, with order totals also kept separate by currency. Date filters apply to campaign application date; campaign search and paging are bounded.

`GET /api/sales/quotes/campaign-performance?from={date}&through={date}&q={text}&page=1&pageSize=25`

This is descriptive reporting only. It does not estimate incremental revenue, campaign causality, margin, conversion lift, or attribution where no application record exists.

## Access and licensing

Both inquiry routes use the existing sales order or sales quote read permission resource, respectively, and apply status/customer row filters before aggregating data for non-admin users. Existing campaign read/create/update routes now resolve to the sales quote permission resource without introducing a new permission definition or migration; applying a campaign requires quote update permission and quote row visibility. Tenant IDs are included in every data query and join. The campaign report only includes applications associated with quotes visible to the caller. The UI reuses the warehouse list permission for warehouse selection, and the distribution API additionally checks warehouse and stock-card read permissions.

The current license tier catalog has explicit limits for users, custom modules, storage, advanced workflows, module source access, and high availability; it does not define a tier entitlement for distribution planning or campaign analytics. Therefore these inquiries follow the existing ERP read permissions and do not invent a new tier gate. A product owner should decide whether sales analytics needs a separate license entitlement before one is added.

## Decisions still needed

- Whether fulfillment reporting should allocate available stock to individual orders, and which documented priority rule should govern that allocation.
- Whether to include forecast demand, draft quotes, backorders not represented by open order lines, or warehouse transfer supply.
- Whether campaign performance should add margin, conversion, time-window attribution, or counterfactual comparisons, which require agreed definitions and possibly additional source data.
- Whether these capabilities should become a separately licensed module.

Until those rules are defined, the implementation reports only directly observed order, reservation, inventory, and campaign application facts.
