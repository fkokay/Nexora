# UI and module logic audit

The audit discovers every module screen currently available to the signed-in tenant from the app's **All modules** index. It opens each screen and checks navigation, JavaScript runtime errors, server errors (HTTP 5xx), visible content, unlabeled controls, and page-level horizontal overflow at desktop (`1440×900`) and mobile (`390×844`) sizes. It does not create, edit, or delete business records.

## İşlem Çubuğu findings

At desktop size every screen is also checked against the shared action bar (`[data-nx-action-bar]`):

- `action-bar-missing`: the screen renders no action bar.
- `action-bar-order`: the `data-command` sequence (ignoring the optional `undo`) is not `new, open, save, delete, refresh, filter, print, export, more`.
- `duplicate-common-action`: a visible, enabled button or link outside the bar, inside the page header area (`.heading-actions`, `.page-heading`, `.list-v2-heading`, `.list-v2-export-slot`, and the record form header `.rf-toolbar`; dialogs excluded), whose text (without `<kbd>` shortcut badges) begins with the whole word Yeni, Kaydet, Sil, Yazdır, Excel, XLSX, CSV, Dışa aktar or Yenile (followed by a non-letter or the end; "Yeni müşteri" matches, "Silinmiş kayıtlar" does not). In `.rf-toolbar` a label that ends with such a word after a space also matches ("Stok Kartını Kaydet"). The detail records the text and the action bar command it duplicates. The matcher is `src/ui-audit/matchCommonActionText.ts`, unit-tested by vitest.

The checks wait up to 2 seconds for the bar, and are skipped when the opened screen is the launcher/dashboard (`.module-launcher-topbar`), which shows no bar by design. Screens with this finding still need wiring to the bar and removal of the old header button.

## Run it

From `frontend/erp-web`:

```powershell
$env:NEXORA_UI_BASE_URL = 'https://your-test-environment.example'
$env:NEXORA_UI_EMAIL = 'your-test-user@example.com'
$env:NEXORA_UI_PASSWORD = '...'
$env:NEXORA_UI_TENANT = 'Test company name' # only needed when the account has multiple companies
npm run test:ui-design
```

For local development, omit `NEXORA_UI_BASE_URL`; Playwright starts Vite on port 5173. The API must be reachable through Vite's `/api` proxy. To audit a production build, build first and set `NEXORA_UI_SERVER_COMMAND` to `npm run preview -- --host 127.0.0.1 --port 5173`. Credentials are read only from environment variables. The signed-in browser state is written to the ignored `.auth/ui-design-audit.json` file and can be reused without storing a password:

```powershell
$env:NEXORA_UI_STORAGE_STATE = '.auth/ui-design-audit.json'
npm run test:ui-design
```

To use an existing Playwright state file instead, set `NEXORA_UI_STORAGE_STATE` to its path. Install the browser once with `npx playwright install chromium`.

To rerun only screens matching a label or module group, set `NEXORA_UI_SCREEN_FILTER`, for example `Mal kabulleri`.

The JSON findings report is written to `test-results/ui-design-audit/report.json`; the HTML report is available with `npx playwright show-report`.
