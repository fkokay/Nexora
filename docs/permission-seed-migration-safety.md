# Permission seed migration safety

The following platform migrations seed permission definitions and tenant defaults:

- `20261023150000_AddCreditFacilityPermissions`
- `20261023160000_AddFinanceEndpointPermissions`
- `20261023180000_AddProjectContractInventoryTrackingPermissions`
- `20261023200000_AddCompanyProfileAndScreenViewPermissions`
- `20261023210000_AddSalesPromotionPermissions`
- `20261023220000_BackfillManufacturingReadForTenantUsers`

Definition inserts use `NOT EXISTS` by permission code. The four standard
permission backfills use `NOT EXISTS` for the tenant, role, and permission
combination. The manufacturing-read backfill is narrower: it adds only
`erp.manufacturing.read` for an existing `TenantUser` role scope that has no
role-level rule for that permission. Its identity check deliberately ignores
`Effect`, `IsActive`, `ResourceType`, and attribute columns, preserving any
existing allow, deny, active, inactive, scoped, or unscoped role rule. It does not
change membership creation behavior or add any other manufacturing permission.

The sales-promotion backfill copies only unscoped quote read/update rules and
matches an existing promotion target by tenant, subject, permission, resource
type, and unscoped attributes. That match deliberately ignores `Effect` and
`IsActive`, so any existing allow or deny rule, active or inactive, is preserved
and cannot be bypassed by inserting a copied rule with a different effect or
status. These checks make rerunning the SQL idempotent and preserve any
permission definition already present under the same code.

The seeded permissions include two constrained write-capable cases. TenantUser
receives `erp.operational-projects.create` for the existing self-service
operational-project/time-entry workflow; administrative project writes still
have separate TenantAdmin endpoint guards. Sales-promotion update is mirrored
from an existing unscoped `erp.sales-quotes.update` rule, while applying a
promotion uses the dedicated execute permission. Attribute-scoped quote rules
are not copied; tenants can grant those promotion rules after review.

`TenantPermissionRules` and `PermissionDefinitions` do not store migration
provenance. A matching row may have been created before the migration or edited
by an administrator. Therefore these seed migrations intentionally leave seeded
rules and definitions in place on `Down`; deleting by code, role, or timestamps
could remove administrator data or leave rules referencing a missing definition.
Rollback of these data-only seeds is intentionally irreversible. Remove a grant
through the permission administration workflow if it should no longer apply.

`AddSalesPromotionPermissions` remains its own case because it clones eligible
quote rules rather than granting a fixed set of tenant defaults. Its identity
check treats an existing target row as present regardless of its effect or
active state. It leaves copied rules and definitions in place on `Down` for the
same provenance reason. Its implementation is not folded into the other
migrations. The manufacturing-read migration likewise has a no-op `Down` because
there is no reliable provenance marker for the one inserted rule.

These migrations change data only. They do not change the EF model, so no
designer target-model snapshot was added. No migration was applied while making
these edits.
