export type ModuleUiField = {
  code: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'select'
  required: boolean
  options?: string[] | null
  maxLength?: number | null
}

export type ModuleMenuView = {
  inputMode: 'json' | 'form'
  inputFields: ModuleUiField[]
  resultMode: 'json' | 'table'
  resultColumns: ModuleUiField[]
  dataCapabilities?: string[] | null
}

export type ModuleManifest = {
  moduleCode: string
  displayName: string
  version: string
  publisher: string
  minimumPlatformVersion: string
  dependencies: { moduleCode: string; minimumVersion: string }[]
  permissions: { code: string; description: string }[]
  menuEntries: { code: string; label: string; route: string; permissionCode: string; view?: ModuleMenuView | null }[]
}

export type MarketplaceModule = {
  moduleCode: string
  version: string
  publisher: string
  artifactSha256: string
  publishedAt: string | null
  manifest: ModuleManifest | null
  isActivated: boolean
  activatedVersion: string | null
  runtimeStatus: string
}

export type ModuleMenuSelection = { moduleCode: string; version: string; entry: ModuleManifest['menuEntries'][number] }

export type ModuleStarterTemplate = {
  code: string
  name: string
  description: string
  manifest: Record<string, unknown>
  cargo: string
  source: string
}

export type ModuleStatusFilter = 'all' | 'active' | 'available' | 'blocked'
