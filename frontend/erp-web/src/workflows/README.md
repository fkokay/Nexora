# Workflow screen components

`WorkflowPage.tsx` owns workflow API calls, screen state, and action handlers. Components in `components/` render the page header, summary, definition builder, workflow catalogs, and approval inbox using typed props. Keep mutations and permission decisions in the page container; keep these components focused on presentation.
