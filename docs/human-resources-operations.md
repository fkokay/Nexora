# Operational HR period summary

Tenant administrators can open **İnsan Kaynakları → Dönem özeti** to review a period summary or download it as CSV. The API accepts `from` and `to` ISO dates at `/api/hr/period-summary` and `/api/hr/period-summary.csv`. Both endpoints require an authenticated `TenantAdmin` identity and data is restricted to that identity's tenant. Periods must be ordered and may span at most 366 calendar dates.

The summary contains employee headcount at the period end (employees hired by that date and not terminated on or before it), attendance record and distinct employee counts, worked and overtime minutes, plus leave requests whose date range overlaps the period. Leave request counts and requested days are grouped by request status. Requested leave days show each overlapping request's full requested total; they are not prorated to the selected period.

The summary and CSV omit employee names, personnel codes, user IDs, leave types, free-text notes, and row identifiers. Report generation and CSV export add tenant audit events `hr.period-summary.viewed` and `hr.period-summary.exported`, respectively, with the selected date range as the resource. Keep downloaded reports within the organization's approved access controls.

This is an operational aggregation of stored employee, leave, and attendance records. It does not calculate payroll, prepare SGK or tax declarations, or assert compliance with Turkish payroll or employment regulations. Payroll scope and any applicable legal requirements remain subject to product-owner and qualified domain review.

Tenant administrators may save effective-dated Turkish payroll rule-set drafts with an HTTPS source URL. Draft rule payloads must be JSON objects and a different tenant administrator must approve them; this checks basic structure and workflow only. The payload is not validated against a statutory schema and is not used to calculate payroll. Payroll calculation and declarations remain disabled pending approved policy decisions and qualified legal/accounting review.
