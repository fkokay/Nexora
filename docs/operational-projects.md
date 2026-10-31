# Operational project tracking

The ERP Projects page is a tenant-scoped operational register for delivery status, task completion, deadlines, resource hours, and time entries. It is separate from AI Development Studio workspaces and project permissions.

## Dashboard and filters

- Project status: Draft, Active, On hold, Completed, or Cancelled.
- Task completion: projects with open work, projects whose tasks are all completed, or projects without tasks. Cancelled tasks do not count as completed.
- Overdue tasks: Open, In progress, or Blocked tasks whose end date is before the current UTC date.
- Upcoming dates: project end dates and active task end dates in the selected 30, 90, or 365 day window.
- Time records: projects with visible records from the selected 7, 30, or 90 day period. The summary reports the hours and entry count for that same period.

Project-level time totals follow the same visibility rule as project details: TenantAdmins can see all tenant entries; other tenant roles see only their own entries. Task and project aggregates are always constrained by the authenticated tenant claim. The endpoints use the existing required authorization policy, role checks for mutations, and audit events for writes.

TenantAdmins can change a task from Open, In progress, or Blocked to another nonterminal or terminal state. Completed and Cancelled task states are final. A task's status cannot be changed after its project is completed or cancelled; each status change is audited.

## Financial boundary

The dashboard does not calculate fees, payroll, actual labor cost, or ledger cost. Time entries are operational records and do not post to payroll, accounting, or cost ledgers. Existing manually entered project budget and planned resource allocation values remain operational planning data and retain their entered currencies.

## API query parameters

`GET /api/projects` accepts `status`, `taskCompletion` (`has-open`, `all-complete`, `no-tasks`), `overdueOnly`, `upcomingWithinDays` (1–365), and `timeEntryDays` (7, 30, or 90), alongside its existing search and paging parameters. `GET /api/projects/dashboard-summary` returns tenant-scoped project and task counts plus time-entry totals, optionally limited to the same supported time windows.
