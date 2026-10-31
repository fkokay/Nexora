# Permission action corrections

The TCMB import endpoint requires `erp.exchange-rates.execute`; manually entered
general-ledger entries require `erp.general-ledger.create`. The endpoints keep
their existing TenantAdmin membership/role checks.

Sales promotion routes now use the dedicated `erp.sales-promotions` permission
resource. Applying a promotion additionally retains the existing sales-quote
read/update row checks. The platform migration copies only unscoped quote
read/update rules to the equivalent promotion actions. Attribute-scoped quote
rules are not copied because promotion resources do not expose quote row
attributes; administrators must review and configure those promotion rules
explicitly. Promotion create/update endpoints still require TenantAdmin.
