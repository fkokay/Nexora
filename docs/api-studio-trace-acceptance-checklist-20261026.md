# API / Development Studio trace acceptance checklist — 2026-10-26

Use this checklist only after the release owner confirms that the deployed Platform API and AI Service image digests correspond to the approved release containing the API and Studio TraceId changes. A healthy remote image proves process health only; it may still be an older image without these source changes. Record the release/commit and immutable image digest for each service before interpreting any result. If that identity cannot be established, mark the check **NOT RUN** and stop.

## Current status

Source review confirms that this checklist matches the API and Development Studio trace handling in source. Runtime acceptance is **NOT RUN**. API and Development Studio intentionally fail closed at startup when tenant database separation, Vault endpoint, reader AppRole, or required secret configuration is missing/invalid. The source/build checks do not prove that production-equivalent settings are present or that the selected release starts successfully on its target host. Do not perform or report runtime acceptance until an approved staging host has valid configuration and the exact candidate is running. Source review is not runtime proof.

Run only in the approved non-production environment with synthetic requests and synthetic identities. Use the approved acceptance request/route for each service; do not improvise a route that can read or mutate real records. Record a redacted URL shape, method, status, Europe/Istanbul timestamp, response `X-Trace-Id`, and only the safe body fields specified below. Do not retain raw requests or responses.

## Preflight

- [ ] Environment is explicitly confirmed as isolated from production and real customer/tenant data; synthetic account and authorization setup are ready.
- [ ] Release/change record identifies the approved commit, Platform API image digest, AI Service image digest, and deployment time. The digests match the release artifact containing the trace changes.
- [ ] Operator has approved access to the relevant service logs and the correct routing is known: `/api/...` → Platform API; `/studio/...` → AI Service. Record proxy/ingress hop if present.
- [ ] A safe evidence location and retention window are approved. Evidence contains no raw headers beyond `X-Trace-Id`, no raw bodies, and no unredacted identifiers.
- [ ] If any preflight item is missing, mismatched, or points to production, stop; record **NOT RUN** with the reason.

## Synthetic API 500

- [ ] Make one approved synthetic request that is expected to exercise the Platform API unhandled-error response. Do not include customer data or secrets.
- [ ] Confirm HTTP `500` and response header `X-Trace-Id` is present and non-empty.
- [ ] From JSON, record only the general `error` value and `traceId`. Expected safe shape: `error` is a generic server-failure message; `traceId` is the ASP.NET `HttpContext.TraceIdentifier` value. Do not record any other field if one appears.
- [ ] Confirm body `traceId` exactly equals response header `X-Trace-Id` (and the UI-displayed support ID, if that UI path is part of the acceptance).
- [ ] In authorized Platform API logs, confirm the same trace value on the matching `Unhandled API exception` event and that its timestamp/service correspond to the synthetic request. Keep exception details inside authorized operations review; exclude them from the evidence package.
- [ ] Record PASS only when status, header/body equality, and server-log trace match all succeed. Otherwise mark FAIL and stop the trace acceptance; do not infer a match from time/path alone.

## Synthetic Studio 500

- [ ] Make one approved synthetic request through `/studio/...` that is expected to exercise the AI Service error response.
- [ ] Confirm HTTP `500` and response header `X-Trace-Id` is present and non-empty.
- [ ] From JSON, record only `title`, `status`, and `traceId`. Expected safe shape: a generic server-error title, `status: 500`, and a 32-character lowercase hexadecimal GUID (`Guid.ToString("N")`).
- [ ] Confirm body `traceId` exactly equals response header `X-Trace-Id`.
- [ ] In authorized AI Service logs, confirm the same trace value on the matching `Unhandled Studio API error` event. This Studio GUID is independent of the Platform API trace identifier; do not expect the two services to share an ID.
- [ ] Record PASS only when status, header/body equality, and AI Service log match all succeed. Otherwise mark FAIL and stop the trace acceptance.

## Synthetic 403 checks (API and Studio)

- [ ] Use an approved synthetic identity that is deliberately denied access to the selected safe endpoint. Do not use a real user's account or a resource belonging to a real tenant.
- [ ] For the API request, confirm HTTP `403` and capture the response `X-Trace-Id`. For the Studio request, confirm HTTP `403` and capture its response `X-Trace-Id`.
- [ ] Record only a generic safe denial message if one is present. A 403 body is authorization-path dependent; do not require `traceId` in that body. If it is present, record that it matches the header; if absent, note `body traceId: absent`.
- [ ] Verify the trace value against the appropriate service's request/authorization logs when those logs expose it. API values belong to Platform API; Studio values belong to AI Service. A 403 may not produce an exception event. If the response is generated by the proxy before reaching the service, the application trace header/log may be absent; verify upstream routing/status using approved proxy metadata and classify the application trace check **NOT RUN**, not PASS.
- [ ] Record PASS for a service-level 403 only when the response is confirmed to have reached that service, its trace header is present, and the same value is found in the service's available request/authorization log. Do not treat a time/path coincidence as an exact trace match.

## Stop conditions and privacy

Stop the check immediately and mark the affected item **FAIL** or **NOT RUN** if any of these occurs:

- The deployed image digest/commit cannot be tied to the approved code containing the change, or the request routes to an unknown or production target.
- A required trace header is absent, body/header trace values disagree, a trace cannot be matched exactly in the expected service, or status/routing differs from the approved scenario.
- The response exposes stack trace, SQL/exception detail, token, secret, session value, tenant/customer/user/project/document identifier, or other non-synthetic data. Do not copy the exposed value into evidence; restrict access and follow the incident process.
- A request may have read or changed real data, caused unexpected load, or reached an unintended service. Stop further requests and notify the release/operations owner through the approved incident channel.

Never collect or attach `Authorization`, `Cookie`, `Set-Cookie`, bearer/access/refresh token, API key, password, `X-Studio-Session`, request payload/file, raw response body, SQL/stack trace, HAR, “Copy as cURL” output, or unredacted screenshots. Never use real PII or production business data to provoke an error. If safe evidence cannot be produced manually from the allowed fields, omit it and mark the check **NOT RUN**.

## Acceptance record

```text
Environment: [approved non-production name]
Approved release / commit: [value]
Platform API image digest: [digest]
AI Service image digest: [digest]
Operator / reviewer: [roles or approved names]
Date and time (Europe/Istanbul): [timestamp]
Scenario: [API 500 | Studio 500 | API 403 | Studio 403]
Redacted URL shape + method: [no real identifiers]
Status: [code]
X-Trace-Id: [value or absent]
Safe body fields: [allowlisted fields only, or absent]
Exact service log match: [yes/no/not available]
Result: [PASS | FAIL | NOT RUN]
Notes / evidence reference: [redacted reference only]
```
