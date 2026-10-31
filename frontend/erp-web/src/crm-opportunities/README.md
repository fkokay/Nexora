# CRM opportunity screen components

`CrmOpportunitiesPage.tsx` remains the page container for API requests, list and form state, stage changes, and paging state. Components under `components/` render the page header, list filters, opportunity grid, paging controls, selected-record details, and create form through typed props and callbacks.

Keep new display-only sections in this feature folder. Keep API calls and state transitions in the page container so each screen part can be adjusted independently in Studio.
