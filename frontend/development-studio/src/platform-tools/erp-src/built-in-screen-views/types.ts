export type Field = { key: string; label: string; defaultVisible: boolean; fixed?: boolean }
export type LayoutField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null; width?: number | null }
export type Catalog = { key: string; label: string; fields: Field[] }
export type View = { id: string | null; screenKey: string; screenLabel: string; name: string; isPublished: boolean; revision: number; fields: LayoutField[] }
export type Revision = { id: string; revision: number; name: string; fields: LayoutField[]; changeKind: string; changedByUserId: string; createdAt: string }
export type EditorState = { catalog: Catalog; active: View; draft: View | null }
