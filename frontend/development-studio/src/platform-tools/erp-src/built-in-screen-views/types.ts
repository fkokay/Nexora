export type Field = { key: string; label: string; defaultVisible: boolean; fixed?: boolean }
export type LayoutField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null; width?: number | null }
export type Catalog = { key: string; label: string; fields: Field[] }
export type CustomerPageSettings = { title: string; description: string; searchLabel: string; searchPlaceholder: string; typeFilterLabel: string; statusFilterLabel: string; applyLabel: string; showTypeFilter: boolean; showStatusFilter: boolean }
export type View = { id: string | null; screenKey: string; screenLabel: string; name: string; isPublished: boolean; revision: number; fields: LayoutField[]; pageSettings?: CustomerPageSettings | null }
export type Revision = { id: string; revision: number; name: string; fields: LayoutField[]; changeKind: string; changedByUserId: string; createdAt: string }
export type EditorState = { catalog: Catalog; active: View; draft: View | null }
