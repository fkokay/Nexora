# Workspace settings components

`WorkspaceSettingsPage.tsx` owns preference state, persistence, and the locale/theme callbacks. The presentation layer lives under `components/`: reusable navigation, title, tabs, setting rows/cards/switches, and the tab-specific `SettingsContent` panel. Preferences and tab contracts are defined in `types.ts`.
