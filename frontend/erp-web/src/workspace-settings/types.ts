import type { Locale } from '../WorkspaceComponents'

export type SettingsTab = 'application' | 'appearance' | 'regional' | 'security' | 'notifications' | 'storage'
export type Preferences = {
  defaultPage: string
  locale: Locale
  theme: 'light' | 'dark'
  sessionTimeout: number
  systemNotifications: boolean
  operationNotifications: boolean
  releaseNotes: boolean
  pageSize: 25 | 50 | 100
  rememberSort: boolean
  rememberFilters: boolean
  saveColumns: boolean
  rememberTabs: boolean
  restoreTabs: boolean
  confirmTabClose: boolean
  preventDuplicateTabs: boolean
}

export const defaultPreferences: Preferences = {
  defaultPage: 'launcher', locale: 'tr', theme: 'light', sessionTimeout: 30,
  systemNotifications: true, operationNotifications: true, releaseNotes: false,
  pageSize: 25, rememberSort: true, rememberFilters: true, saveColumns: true,
  rememberTabs: true, restoreTabs: true, confirmTabClose: true, preventDuplicateTabs: true,
}
