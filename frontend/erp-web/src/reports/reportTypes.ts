export type Column = { code: string; label: string; dataType: 'text' | 'number' | 'decimal' | 'boolean' | 'date'; options?: string[] }
export type Source = { code: string; label: string; columns: Column[]; aggregates: { code: string; label: string }[] }
export type FilterRow = { field: string; operator: string; value: string }
export type Definition = { source: string; columns: string[]; filters: FilterRow[]; sortBy: string; descending: boolean; page: number; pageSize: number; groupBy?: string; groupByFields?: string[]; aggregate?: string }
export type SavedReport = { id: string; name: string; source: string; definition: Definition; kind: 'Report' | 'List'; createdAt: string; updatedAt: string; definitionRevision: number }
export type SavedReportRevision = { id: string; revision: number; name: string; source: string; definition: Definition; kind: 'Report' | 'List'; createdByUserId: string; createdAt: string }
export type AggregateRow = { groupValue: unknown; groupValues?: unknown[]; rowCount: number; value: number | null }
export type Result = { source: string; columns: Column[]; rows: Record<string, unknown>[]; page: number; pageSize: number; totalCount: number; groupBy?: string | null; groupByFields?: string[] | null; aggregate?: string | null; groups?: AggregateRow[] | null; totalGroups?: number }
