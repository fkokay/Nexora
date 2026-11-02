# Credit facilities feature components

`CreditFacilitiesPage.tsx` owns loading, screen state, form state, API calls, and mutation handlers. Typed domain models live in `types.ts`.

Presentation components under `components/` cover page status, currency summaries, exposure tables, facility and schedule setup, movement entry, securities, register filters, and the facility register with payment and movement detail grids. They receive values and callbacks through props; they do not fetch data or own API mutations.
