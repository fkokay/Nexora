# Sayfa Kod Köprüsü (Proje 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JavaScript written in a custom page's isolated code component can safely talk to the page:
- read variables,
- set inputs,
- run the page's queries and catalog ERP operations,
- subscribe to page events (load, row select, before/after save; "before save" can cancel the write).

**Architecture:**
- **Sandbox stays as is.** The code still runs in the existing `sandbox="allow-scripts"` iframe with its strict CSP (`connect-src 'none'`).
- **Bridge.** A small bridge script is injected ahead of the user code and exposes `window.nexora`. Every call becomes a `postMessage` to the parent page.
- **Parent side.** The parent accepts only messages whose `event.source` is that iframe's `contentWindow`, validates them against a closed protocol, rate-limits them, and executes them through the page runtime (same permissions as a user click). The parent replies by `postMessage`.
- **Token isolation.** The iframe never sees the token.

**Tech Stack:** React + TS (erp-web, Vitest), .NET schema (xUnit), Studio (build only).

**Spec:** `docs/superpowers/specs/2026-11-18-uyarlanabilir-erp-design.md` (Yol haritası 2b). Builds on Proje 1 (`docs/superpowers/plans/2026-11-18-erp-islem-katalogu.md`): page query states, `runWrite`, ERP operations map.

## Global Constraints

- The iframe keeps `sandbox="allow-scripts"` (never `allow-same-origin`), `referrerPolicy="no-referrer"` and the existing CSP string unchanged.
- The parent posts to the iframe with targetOrigin `"*"`; this is required because a sandboxed frame has an opaque origin. It therefore never sends secrets: no token and no other component's code.
- A message is processed only when `event.source === frame.contentWindow` and `event.data?.nx === 1`.
- Rate limit per frame:
  - at most 4 calls in flight;
  - at most 120 calls per rolling minute;
  - when exceeded, reply with error "Çok fazla istek; biraz bekleyin."
- `beforeSave` handlers have 3000 ms in total to answer. On timeout the write is cancelled with the message "Kod bileşeni yanıt vermedi; işlem iptal edildi."
- Bridge API version: `nexora.version === 1`. Methods are only ever added, never changed.
- User-visible copy is Turkish.

## Review Focus

1. **Forged messages.** A message from a different window (another frame, or the parent itself) must be ignored. Test: Task 2.
2. **Malformed payloads.** A request with an unknown `type`, non-string names or oversized values (> 64 KiB JSON) must be rejected with an error reply and must not throw in the parent. Test: Task 1.
3. **Write blocked by `beforeSave`.** The write is not sent and the status line shows the handler's message. Test: Task 2.
4. **Hidden code component.** It renders no visible box, but its scripts run and its events fire. Test: Task 2.
5. **Unmounted iframe.** If the iframe unmounts mid-call (page navigates away), pending replies are dropped without errors or leaked listeners. Test: Task 2.

---

## Protocol (shared by every task)

Child → parent request: `{ nx: 1, id: <number>, type, ...args }`

| type | args | reply `result` |
|---|---|---|
| `get` | `path: string` (binding path without braces, e.g. `liste.seciliSatir.code`) | resolved value (JSON-cloned) or `null` |
| `setInput` | `name: string`, `value: string \| number \| boolean \| null` | `true` |
| `runQuery` | `name: string` (page query name) | read query: `{ rows, rowCount }`; write query: `{ affectedRows, sonuc }` |
| `callOperation` | `name: string` (catalog op), `values: object` | read op: `{ rows, rowCount }`; write op: `{ sonuc }` |
| `on` | `event: "load" \| "select" \| "beforeSave" \| "afterSave"` | `true` (subscribes the frame) |
| `setHeight` | `px: number` (clamped 0–2000) | `true` |

Further rules:
- **Replies.** Parent → child reply: `{ nx: 1, replyTo: id, ok: true, result }` or `{ nx: 1, replyTo: id, ok: false, error: string }`.
- **Events.** Parent → child event: `{ nx: 1, event: "load" | "select" | "afterSave", payload }`. For `beforeSave` the parent sends `{ nx: 1, event: "beforeSave", payload: { query: <name> }, ask: <number> }`, and the child answers `{ nx: 1, answer: <ask>, cancel: boolean, message?: string }`.
- **Event payloads:**
  - `load`: `{}`
  - `select`: `{ table: <name>, row }`
  - `afterSave`: `{ query: <name>, sonuc }`

Bridge script API (`window.nexora`), defined in Task 1:
- `version: 1`
- Promise-returning calls:
  - `get(path)`
  - `setInput(name, value)`
  - `runQuery(name)`
  - `callOperation(name, values)`
  - `setHeight(px)`
- `on(event, handler)`. A `beforeSave` handler may return or resolve to `false` or `{ cancel: true, message }`.
- Errors reject with `Error(message)`.

---

### Task 1: Pure bridge module (erp-web)

**Files:**
- Create: `frontend/erp-web/src/custom-page/codeBridge.ts`
- Create: `frontend/erp-web/src/custom-page/codeBridge.test.ts`

**Interfaces (Produces):**

```ts
export const BRIDGE_VERSION = 1;
export const bridgeScript: string; // JS source injected before user code; defines window.nexora per the Protocol
export type BridgeRequest =
  | { nx: 1; id: number; type: "get"; path: string }
  | { nx: 1; id: number; type: "setInput"; name: string; value: string | number | boolean | null }
  | { nx: 1; id: number; type: "runQuery"; name: string }
  | { nx: 1; id: number; type: "callOperation"; name: string; values: Record<string, unknown> }
  | { nx: 1; id: number; type: "on"; event: "load" | "select" | "beforeSave" | "afterSave" }
  | { nx: 1; id: number; type: "setHeight"; px: number };
export function parseBridgeRequest(data: unknown): BridgeRequest | { error: string; id?: number } | null; // null = not ours (ignore)
export type BridgeHost = {
  get(path: string): unknown; setInput(name: string, value: string | number | boolean | null): void;
  runQuery(name: string): Promise<unknown>; callOperation(name: string, values: Record<string, unknown>): Promise<unknown>;
  subscribe(event: string): void; setHeight(px: number): void;
};
export function handleBridgeRequest(request: BridgeRequest, host: BridgeHost): Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;
export function createRateLimiter(now: () => number): { tryAcquire(): boolean; release(): void }; // 4 in flight, 120 per 60_000 ms
export function isolatedCodeDocument(css: string, javascript: string): string; // moved here from TenantCustomPage.tsx; same CSP; injects bridgeScript before user code
```

- [ ] **Step 1: Write failing tests:**
  - **`parseBridgeRequest`:**
    - `{nx:1,id:1,type:"get",path:"a.b"}` is accepted.
    - `{nx:2}` returns `null`.
    - `{nx:1,id:2,type:"rm"}` returns `{error:"Bilinmeyen istek: rm", id:2}`.
    - Data whose JSON is longer than 65536 characters returns `{error:"İstek çok büyük."}`.
    - `setHeight` with a non-number is rejected.
  - **`handleBridgeRequest`:**
    - `get` passes the host value through `structuredClone`/JSON round-trip.
    - `setHeight(5000)` calls `host.setHeight(2000)`.
    - A host throwing `Error("x")` gives `{ok:false,error:"x"}`.
  - **Rate limiter:** the 5th concurrent acquire is false; after release it is true; with the time mock, the 121st call within 60 s is false and is true again after 60 s.
  - **`isolatedCodeDocument`:**
    - contains the exact existing CSP string;
    - contains `window.nexora` before the user code;
    - escapes `</script` in user code.
- [ ] **Step 2: Run** `npx vitest run src/custom-page/codeBridge` in `frontend/erp-web`. Expected: FAIL.
- [ ] **Step 3: Implement.** `bridgeScript` keeps a pending map keyed by id and listens for `message` from `parent` (check `event.source === window.parent`). For `beforeSave` asks it awaits all handlers and answers `cancel:true` with the first cancelling handler's message.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(erp-web): kod bileşeni köprü protokolü`.

### Task 2: Runtime integration (erp-web)

**Files:**
- Create: `frontend/erp-web/src/custom-page/CodeFrame.tsx`
- Create: `frontend/erp-web/src/custom-page/pageEvents.ts`: event hub for `select`, `load`, `beforeSave` and `afterSave` across frames.
- Modify: `frontend/erp-web/src/custom-page/writeAction.ts`: opts gain `beforeWrite?: (query) => Promise<{ cancel: true; message: string } | null>` and `afterWrite?: (query, result) => void`. A cancel returns `{ ok: false, error: message }` without calling `write`.
- Modify: `frontend/erp-web/src/TenantCustomPage.tsx`:
  - The `case "code"` branch renders `<CodeFrame>`; `isolatedCodeDocument` now comes from `codeBridge.ts`.
  - The runtime context exposes the event hub.
  - Table selections emit `select`.
  - Both write paths (query button and actionBar `writeThroughBar`) pass `beforeWrite` and `afterWrite`.
  - `hidden: true` on a code component renders the frame with `style={{ display: "none" }}` and no grid cell.
  - The `BridgeHost` implementation:
    - `get` resolves `resolvePath(scope, path)`;
    - `setInput` finds the input by name and updates `touched` state;
    - `runQuery` reruns a read query and waits for its next state, or runs a write through `runWriteAction` with `confirm: { enabled: false }` (still subject to preview confirmation);
    - `callOperation` uses the Proje 1 operations map plus `buildOperationRequest` and `mapOperationResult`, and refuses writes in preview.
- Test: `frontend/erp-web/src/custom-page/CodeFrame.test.tsx` and `writeAction.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 exports; Proje 1 `ErpOperation`, `buildOperationRequest`, `mapOperationResult`, and `usePageQueries` states.
- Produces:
  - `CodeFrame` with props `{ id: string; css: string; javascript: string; hidden: boolean; style?: CSSProperties; title: string; host: BridgeHost; events: PageEvents }`.
  - `PageEvents = { emit(event, payload): void; beforeSave(query): Promise<{cancel:true;message:string}|null>; register(frame): () => void }`.

- [ ] **Step 1: Write failing tests:**
  - `ignores messages from other sources`: dispatch a `MessageEvent` with `source: window` and check the host is not called.
  - `answers get from own frame`: use `source: iframe.contentWindow`; spy on `contentWindow.postMessage`.
  - `beforeSave cancel blocks write`: `runWriteAction` with `beforeWrite` resolving cancel returns `{ok:false,error:"Kod: iptal"}` and `write` is not called.
  - `beforeSave timeout cancels`: use fake timers, wait 3000 ms, and expect the timeout message.
  - `hidden frame renders but is not displayed`.
  - `unmount drops pending replies`: no `postMessage` after unmount, and the listener is removed.
- [ ] **Step 2: Run** `npx vitest run src/custom-page/CodeFrame src/custom-page/writeAction`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/custom-page src/TenantCustomPage` and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** with the message `feat(erp-web): kod bileşeni sayfayla konuşur`.

### Task 3: Server schema (v2 code component)

**Files:**
- Modify: `src/Hosts/AIERP.Api/TenantCustomPageSchema.cs`
  - `hidden` allowed on `code` only (bool);
  - in v2, the `javascript` limit is 20000 characters and the `css` limit stays 4000;
  - v1 limits are unchanged.
- Test: `tests/IntegrationTests/TenantCustomPageSchemaV2Tests.cs`

- [ ] **Step 1: Write failing tests:**
  - `Accepts_hidden_code_component_v2`
  - `Rejects_hidden_on_non_code`
  - `Accepts_20000_char_javascript_in_v2`
  - `Rejects_20001_char_javascript_in_v2`
  - `Keeps_4000_char_limit_in_v1`
- [ ] **Step 2: Run** `dotnet test tests/IntegrationTests --filter "FullyQualifiedName~TenantCustomPageSchemaV2Tests"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(api): kod bileşeni gizli seçeneği ve v2 uzunluk sınırı`.

### Task 4: Studio — editing and preview of bridged code

**Files:**
- Modify: `frontend/development-studio/src/platform-tools/erp-src/CustomPagesPage.tsx`:
  - The code inspector gets the toggle "Görünmez (yalnız mantık çalıştırır)", which sets `props.hidden`.
  - It shows a collapsible "Kod köprüsü (nexora)" help box listing the API from the Protocol with one example each, in Turkish.
  - The JavaScript limit shown or enforced becomes 20000.
  - The canvas preview iframe injects a Studio stub bridge:
    - `get` answers from the canvas preview data;
    - `runQuery` answers from the preview rows;
    - `setInput` and writes reject with "Tasarımcıda yalnız okuma önizlenir.";
    - `on` resolves.
  - Hidden code components show on the canvas as a small dashed chip "Görünmez kod: <title>".
- Create: `frontend/development-studio/src/platform-tools/erp-src/page-designer/codeBridgeStub.ts`: Studio copy of the bridge script (the same protocol) plus the stub host.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run build` in `frontend/development-studio`. Expected: success.
- [ ] **Step 3: Commit** with the message `feat(studio): kod köprüsü düzenleme ve önizleme`.

### Task 5: Live verification (QA tenant only; controller)

On the QA page `qa-kod-koprusu`, add a hidden code component that:
- on `select`, writes the selected row's name into input `ad`;
- in `beforeSave`, cancels when `ad` is shorter than 3 characters, with the message "En az 3 harf.";
- uses a visible code component to show `await nexora.runQuery("liste")` row count.

Verify all three behaviors live. Then verify in DevTools that a `postMessage` from the console to the parent with `nx:1` is ignored.
