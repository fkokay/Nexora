# Synthetic MRP II finite-capacity acceptance scenario

**Status:** specification only; synthetic inputs; not executed.  
**Purpose:** deterministic acceptance case for the current MRP demand calculation and manufacturing-order finite-capacity scheduler. This is a documentation fixture, not an API seed script.

## Fixed scenario assumptions

- Freeze the scheduler's UTC clock at **2026-10-26** for acceptance. The schedule endpoint uses the current UTC date as its lower bound; a live clock would make this fixture time-dependent.
- Use one isolated synthetic tenant and warehouse. All codes below are fixture-local; assign fresh IDs when importing. No production tenant, live firm data, or actual customer/supplier identifiers are involved.
- Treat work-center minutes as local minutes after midnight, with the tenant's configured work-center calendar. The case does not cross midnight or a daylight-saving transition.
- Use zero labor and overhead rates for the fixture. Costs are not an acceptance output; no statutory or legal cost rates are assumed.
- Execute MRP at plan date **2026-10-26** with open sales orders included. For the scheduler portion, create `MO-FG-001` from the first 10-unit finished-good recommendation and treat the 19-unit subassembly recommendation as available before scheduling it. Material availability is a stated setup precondition, not a current scheduler assertion. The current scheduler plans one manufacturing order at a time and does not enforce cross-order BOM dependencies.
- For deterministic order selection, use the listed single active BOM per manufactured item, and no other stock, purchase supply, open orders, reservations, allocations, or setup transitions beyond those specified.

## MRP inputs

### Items and inventory

| Code | Description | On hand at plan date | Active reservation | Manufacturing lead time | Procurement lead time |
|---|---|---:|---:|---:|---:|
| FG-100 | Finished assembly | 0 | 0 | 2 days | — |
| SA-200 | Subassembly | 2 | 1 | 0 days | — |
| RM-300 | Raw material | 10 | 0 | — | 3 days |

### Multi-level BOM

| BOM | Output | Component | Quantity per output | Scrap |
|---|---|---|---:|---:|
| BOM-FG-100 | 1 FG-100 | SA-200 | 2 | 0% |
| BOM-SA-200 | 1 SA-200 | RM-300 | 3 | 0% |

### Dated demand, reservation, and dated supply

- Extra demand: **10 FG-100**, required **2026-11-05**.
- Open sales order `SO-SYN-001`, line 1: **4 FG-100**, requested delivery **2026-11-06**; **2** are reserved and unfulfilled. The remaining open sales demand is 2.
- Active reservation on `SA-200`: **1**, unfulfilled. This reduces stock available to MRP but is not itself another demand node.
- Open purchase order `PO-SYN-001`: **20 RM-300**, target warehouse is the fixture warehouse, expected receipt **2026-11-03**, received quantity 0.
- No other open demand, receipts, purchase lines, or reservations.

## Expected MRP result

The output rows below are grouped by item and required-by date. `Net` is the shortage after eligible stock and dated purchase supply. Dates are the current MRP rule: manufactured item lead time or procurement lead time is subtracted from required-by date.

| Item | Required by | Gross | Available stock | Eligible PO | Net | Recommendation | Recommended date |
|---|---|---:|---:|---:|---:|---|---|
| FG-100 | 2026-11-05 | 10 | 0 | 0 | 10 | Produce | 2026-11-03 |
| SA-200 | 2026-11-03 | 20 | 1 | 0 | 19 | Produce | 2026-11-03 |
| RM-300 | 2026-11-03 | 57 | 10 | 20 | 27 | Purchase | 2026-10-31 |
| FG-100 | 2026-11-06 | 2 | 0 | 0 | 2 | Produce | 2026-11-04 |
| SA-200 | 2026-11-04 | 4 | 0 | 0 | 4 | Produce | 2026-11-04 |
| RM-300 | 2026-11-04 | 12 | 0 | 0 | 12 | Purchase | 2026-11-01 |

The first subassembly recommendation consumes the 1 unreserved unit of `SA-200`; its 19-unit net shortage explodes to 57 units of `RM-300`. The dated PO is eligible on Nov 3 and leaves 27 units short. The later-dated demand cannot use stock or PO supply already consumed by the earlier demand. The sales-order reservation reduces the open order's gross demand from 4 to 2.

## Scheduler fixture inputs

Use a planned order `MO-FG-001` for **10 FG-100**, planned date **2026-11-03**, with two ordered operations. Durations are the already-scaled order operation durations.

### Work centers and calendar

| Center | Shift | Daily capacity | Weekly mask | Date exception |
|---|---|---:|---|---|
| WC-A | 08:00–16:00 | 480 min | Tuesday–Saturday | 2026-11-03 capacity = 0 min |
| WC-B | 07:00–13:00 | 360 min | Tuesday–Saturday | none |

For the fixture, the weekly mask uses Sunday as bit 0 through Saturday as bit 6. The date-specific zero-capacity override on WC-A closes it for Nov 3 and takes precedence over the weekly default.

### Existing reservation of machine time and sequence setup

- Existing synthetic scheduled operation `MO-SETUP-001/OP-10` occupies **WC-A, 2026-11-03 08:00–09:00**, 60 allocated minutes; its setup family is `RED`.
- Transition on WC-A from `RED` to `BLUE` is allowed and adds **45 minutes** of sequence-dependent setup.
- No other existing allocations or scheduled operations are present. The existing allocation is machine capacity already consumed, not a sales/inventory reservation.

### Order routing

| Seq. | Operation family | Preferred center | Eligible centers | Base setup | Run | Minimum wait after prior operation |
|---:|---|---|---|---:|---:|---:|
| 10 | `CUT` | WC-A | WC-A (preferred), WC-B | 0 min | 180 min | 0 days |
| 20 | `BLUE` | WC-A | WC-A only | 15 min | 120 min | 0 days |

No transition rule applies to `CUT`. The `BLUE` operation uses the WC-A `RED → BLUE` transition rule when it encounters the prior scheduled family. The operation's 180 minutes at WC-A comprises 15 base setup + 120 run + 45 sequence setup.

## Expected finite-capacity schedule

| Seq. | Selected center | Date | Start | End | Allocated minutes | Reason/assertion |
|---:|---|---|---|---|---:|---|
| 10 | WC-B | 2026-11-03 | 07:00 | 10:00 | 180 | WC-A is closed by its dated zero-capacity exception; eligible alternative WC-B is used. |
| 20 | WC-A | 2026-11-03 | 10:00 | 13:00 | 180 | Route handoff starts at the prior operation's end. The `RED → BLUE` transition contributes 45 minutes. The existing WC-A interval ends at 09:00, so there is no overlap. |

Acceptance checks:

1. Repeating the case with the same frozen date and input order returns the same selected centers, dates, and minute boundaries.
2. No allocation falls outside its center's shift or daily capacity; the Nov 3 WC-A exception is honored.
3. Operation 20 begins no earlier than operation 10 ends, and reports 45 sequence-setup minutes.
4. WC-A allocations do not overlap the pre-existing 08:00–09:00 allocation; aggregate allocated time remains within its 480-minute default daily capacity.
5. The two MRP dated `FG-100` recommendations and their recursively exploded `SA-200` / `RM-300` shortages match the table above, with sales and inventory reservations applied once.

## Owner assumptions and limits

- Manufacturing owns approval of the fixed test anchor, the local-minute calendar interpretation, and the assumption that the synthetic subassembly order is available before `MO-FG-001` is scheduled.
- This fixture checks the current date-level capacity override, weekly shift calendar, preferred/alternative work-center choice, existing machine allocation, sequence transition snapshot, route order, reservations, and dated MRP supply.
- It does not define inter-order pegging or dependency scheduling, calendar versioning, sector holidays, sub-minute scheduling, labor cost policy, inventory valuation, or general-ledger treatment. Those remain subject to the decisions in [`../mrp-ii-decision-backlog-20261026.md`](../mrp-ii-decision-backlog-20261026.md).
