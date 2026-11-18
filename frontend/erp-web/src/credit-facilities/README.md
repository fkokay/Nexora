# Credit facilities feature components

`CreditFacilitiesPage.tsx` owns loading, screen state, form state, API calls, mutation handlers and the İşlem Çubuğu
commands (list and opened credit). Typed domain models live in `types.ts`.

Presentation components under `components/` receive values and callbacks through props; they do not fetch data or own
API mutations:

- `CreditFacilityList` — list type A: 30-day instalment warning card, search with status / currency chips, the credit
  grid and its footer (shown count, per-currency limit line). A click makes a credit current, a double click / Enter /
  Aç / the code opens it.
- `CreditFacilityDetail` — the opened credit on the document surface: tiles and the Özet, Ödeme planı, Hareketler,
  Teminatlar and Faiz tabs. Credit-wide operations are in İşlemler; instalment, movement and security buttons stay on
  their rows.
- `CreditFacilitySetup` (Yeni kredi, Taksit planla), `CreditMovementForm` (Kullandırım, Geri ödeme) and
  `CreditSecuritiesPanel` (Teminat kaydı; also the Teminatlar tab list) — the create routes are full-page
  `RecordFormPage`s; Kaydet is the İşlem Çubuğu's, Vazgeç / Esc return to the list.
- `CreditExposurePanel`, `CreditFacilitiesPageStatus` — exposure tables and the list header / messages.

Characterization tests: `creditFacilities.test.tsx` (list commands), `creditFacilityTabs.test.tsx` (the credit's own
writes) and `creditFacilityForms.test.tsx` (create screens' POST bodies).
