# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Local UI development with the remote Docker services

The ERP Web Vite server proxies `/api` and `/health` to the API host and `/studio` to the Studio host. For the shared development deployment, create `frontend/erp-web/.env.local` with:

```dotenv
NEXORA_API_PROXY_TARGET=https://nexoraerp.ozgurteknolojiyazilim.com
NEXORA_STUDIO_PROXY_TARGET=https://nexorastudio.ozgurteknolojiyazilim.com
VITE_STUDIO_URL=https://nexorastudio.ozgurteknolojiyazilim.com/?app=studio
```

Start the dev server from this directory so npm finds this package's `package.json`:

```powershell
Set-Location D:\CProjeler\Nexora\frontend\erp-web
npm.cmd run dev
```

Vite loads `.env.local` only when it starts. After changing proxy targets, stop the running server with `Ctrl+C` and run the commands again. A proxy `ECONNREFUSED` means the configured target host/port is not accepting connections; if the local API is not running, point `NEXORA_API_PROXY_TARGET` at the reachable remote API instead of the default `http://localhost:5080`.
