# Module marketplace feature

`ModuleMarketplacePage.tsx` owns catalog loading, filtering and selection state, along with tenant activation/removal actions. `components/` contains presentation surfaces for the catalog header, metrics, toolbar, module card and selected-module inspector. Shared catalog contracts live in `types.ts`.

Keep API calls and state transitions in the page container. Pass data and callbacks into presentation components through typed props.
