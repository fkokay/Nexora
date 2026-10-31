# GitHub App staging acceptance runbook (2026-10-26)

## Purpose and status

This is an owner-executed runbook for the first authenticated GitHub App acceptance against an isolated staging deployment and a disposable private repository. It documents preparation only. **Status: NOT RUN.** No live GitHub connection, secret access, staging test, or deployment was performed for this runbook.

Before acceptance, rotate the GitHub App private key currently configured for this workspace. During preparation, a command intended to mask `deploy/docker/.env` failed to mask the multiline PEM and exposed its contents in tool output. Treat that key as compromised: the App owner should generate and securely deliver a replacement, verify the staging process uses it, then delete the exposed key in GitHub. If immediate containment is needed, suspend the test installation until rotation is complete. Do not copy the exposed key or its fingerprint into evidence.

The existing offline evidence in `docs/external-acceptance-runbook-20261023.md` and the fake-backed/unit and TestServer integration tests are preparation only. They do not prove real installation scope, callback reachability, Git operations, signature delivery, or staging behavior.

## Owner decisions required before the window

The repository/App owner and staging operator must record these non-secret decisions in the restricted change record:

1. Which GitHub account owns the App, who can change its settings, and whether the installation is personal-account or organization scoped.
2. The staging HTTPS origin, routable AI Service callback, allowlisted redirect origin, approved testing window, operator, reviewer, and stop contact. Confirm the reverse proxy routes `/studio/github/setup-callback` and `/studio/github/webhook` to AI Service. The local Compose callback on `localhost:5081` is not a public staging endpoint.
3. The disposable private repository, its owner, test project, base branch, and one throwaway candidate commit. Install the App for **only this repository** using “Only select repositories.” Do not use a customer or production repository.
4. Whether the scope is (A) checkout plus webhook, or (B) also one explicitly approved draft-PR publication and review/comment API path. Scope B writes to GitHub and needs separate written authorization and an operator-confirmed rollback plan. Do not infer write authorization from permission setup.
5. Who owns the staging secret store, which protected runtime configuration mechanism will supply the PEM and webhook secret, and who may approve/perform key rotation and rollback.

If any item is unresolved, leave the gate `NOT RUN`; do not guess an owner URL, repository, event scope, or write approval.

## Configuration map

AI Service reads these .NET keys from process configuration; Docker Compose maps the environment names below. Use the staging secret manager or the deployment's protected secret injection path. Never place values in this document, an issue, chat, shell history, command output, screenshots, or committed `.env` files.

| Setting | Secret? | Owner action |
| --- | --- | --- |
| `GITHUB_APP_ID` | No | Copy the App ID from the App settings; verify it matches the intended App. |
| `GITHUB_APP_SLUG` | No | Set the App slug used by the installation URL. |
| `GITHUB_APP_PRIVATE_KEY_PEM` | **Yes** | Generate a replacement key after the exposure noted above. Deliver only through approved secret management. Ensure PEM newlines survive injection. |
| `GITHUB_APP_WEBHOOK_SECRET` | **Yes** | Generate an independent high-entropy random secret with at least 32 UTF-8 bytes. Set the same value in App webhook settings and AI Service secret configuration. |
| `GITHUB_APP_SETUP_CALLBACK_URL` | No | Set the exact reachable staging URL ending `/studio/github/setup-callback`; it must be HTTPS outside local loopback. |
| `GITHUB_STUDIO_REDIRECT_URL` | No | Set the HTTPS Studio URL to which the callback returns, including the intended Studio route/query. |

`GITHUB_APP_PRIVATE_KEY_PEM` signs a short-lived App JWT; the code requests installation access tokens. Read tokens are restricted to the repository selected by code and `contents: read`; write tokens request only that repository with `contents: write` and `pull_requests: write`. GitHub installation tokens expire after one hour. The application sends them to the internal Runner boundary and does not persist them. Never capture token values in evidence or logs.

## GitHub App permissions and installation

1. In the App owner's GitHub Developer Settings, open the intended GitHub App and verify its App ID and slug against the non-secret staging record.
2. Set **Repository permissions** to the minimum for the approved acceptance scope:
   - Checkout + pull-request state webhooks: **Contents: read** and **Pull requests: read**.
   - If and only if scope B is approved: **Contents: read/write** and **Pull requests: read/write**. This reflects the code paths that push the candidate branch and create/update draft PRs or submit PR review actions. Do not grant Administration, Issues, Workflows, organization, or account permissions for this flow.
   - Keep repository **Metadata: read** at GitHub's required baseline.
3. Enable installation only for the staging owner's approved account. When installing, choose **Only select repositories** and select the one disposable private repository. Record account type and repository slug as restricted metadata, not tokens.
4. Complete the app key rotation and protected configuration delivery. Do not send the PEM by email/chat or paste it in a terminal command. Confirm a safe configuration reload/restart plan with the operator; never print process environment or Compose-expanded configuration.
5. In Studio, a project Maintainer or TenantAdmin starts **GitHub ile yetkilendir** for the disposable test project. Complete GitHub's installation/update flow and return through the configured callback. The callback's one-time state expires after 10 minutes; the service checks a repository-scoped read token before storing the installation ID against the project. Confirm Studio reports connected and the project points to the intended repository. Installation ID is operational metadata, not a credential, but keep it out of public evidence.

If GitHub requires approval after permission changes, wait for the installation owner to approve before continuing. The installation remains on its prior permission set until approved.

## Webhook configuration and verification

1. In App settings, enable the App webhook and set its URL to the exact public staging AI Service endpoint: `https://<staging-host>/studio/github/webhook`. Confirm DNS, TLS, firewall/WAF, body preservation, and route to AI Service before saving. Do not expose the loopback-only Compose port directly.
2. Set the independent webhook secret in App settings and deliver the identical value to `GITHUB_APP_WEBHOOK_SECRET` through the secret manager. Current endpoint behavior requires at least 32 UTF-8 bytes.
3. Subscribe only to **Pull request** (`pull_request`). Do not enable `pull_request_review`, `issue_comment`, push, or broad organization events for this acceptance; the webhook handler only consumes `pull_request` and acknowledges other signed events without mutation.
4. Trigger a real open/reopen or synchronize event on the disposable test PR. In GitHub's recent delivery view, confirm a 2xx result. The application verifies the raw request body with HMAC-SHA256 from `X-Hub-Signature-256` using a fixed-time comparison before processing. The handler rejects invalid signatures, caps body size at 1 MiB, and is rate limited. Confirm the linked candidate state/head updates once and that a stale or duplicate delivery cannot regress state.
5. Record delivery ID, event name, response status, timestamp, and resulting candidate state/SHA only. Do not retain payload bodies, signature values, webhook secret, request headers, or raw app logs. A deliberately invalid-signature case is optional and must be performed only in the approved staging window using a non-mutating request; expected outcome is HTTP 401 and no state change. Do not falsify GitHub delivery evidence.

## Private repository read-token acceptance (scope A)

1. From the authorized test project, use Studio's GitHub authorization flow and request a read-only checkout of the designated repository and approved branch.
2. Confirm the operation succeeds for the selected repository and fails closed for a second private repository not selected in the installation. Do not add the second repository to “prove” denial.
3. Confirm the operation does not write a branch, commit, PR, issue, or comment. Verify the scoped token is not stored in the database or workspace and is absent from application, proxy, and Runner logs. Use existing audit event IDs/timestamps as evidence; never log token claims or token strings.
4. If write-scope acceptance is approved separately, use one throwaway branch and one approved candidate commit. Confirm create/reuse behavior yields one draft PR without duplicate branch/PR effects. Do not mark the PR ready, merge it, approve it, request changes, or publish reviewer comments unless each exact operation was included in owner approval. Delete the throwaway PR/branch after evidence capture if the repository owner authorizes cleanup.

## Evidence and redaction

Store detailed evidence in the approved restricted release/evidence system. Commit only a sanitized summary or evidence reference. Use a record such as `github-app-staging-<run-id>.json` with:

- run ID, UTC start/end, staging environment identifier, application build/commit and image digests;
- operator/reviewer pseudonyms and owner sign-off;
- App ID only if internal policy permits, pseudonymous installation/repository references, granted permission names, selected-repository result;
- callback outcome, operation type/result, checkout branch/commit SHA, and whether writes were authorized;
- GitHub delivery IDs/event names/status/timestamps and the associated state/SHA transition;
- redacted log/evidence artifact IDs, deviations, cleanup outcome, and final `PASS`, `FAIL`, or `INCONCLUSIVE` decision.

Remove or mask: PEM/private/public key material and fingerprints; webhook secret; installation/access tokens; JWTs; `Authorization` headers; raw webhook body and signature; cookies/session/state query values; user email/names; internal IPs/hostnames if restricted; repository content; and full unredacted proxy/application logs. Do not include actual secret values even as a hash, prefix, or screenshot. Verify redaction before publishing evidence.

## Pass criteria

Mark `PASS` only when the App key has been rotated and the compromised key deleted; all configured values match the approved staging origin; only the disposable repository is installed; the approved permission scope is exact; callback succeeds and associates the correct project; private checkout succeeds using read-only scoped access; an unselected private repo is denied; webhook delivery is verified and updates state once; invalid signatures do not mutate state (when that case was run); no credentials or payloads appear in logs/evidence; and the owner/reviewer sign the restricted record. Any unexplained write, extra access, stale/replayed regression, failed signature validation, missing evidence, or secret exposure is `FAIL`. Missing owner authorization or unavailable staging is `NOT RUN`/`INCONCLUSIVE`, never a pass.

## Revoke and rollback

1. Stop the acceptance operation. For any suspected credential leak, immediately suspend the staging installation in GitHub to block API access, then rotate/revoke the key and webhook secret. GitHub App owners can also uninstall the App from the staging account to end that installation's access.
2. For planned rollback, remove the project's GitHub authorization in Studio (this clears its stored installation ID) and uninstall the App from the test account/repository. Confirm no other project depends on this installation before uninstalling.
3. Delete/revoke the compromised private key in the App's **Credentials → Key pairs** settings only after the replacement key is generated and runtime rotation is complete; for active compromise, keep the installation suspended until verified. Update or remove the PEM in the staging secret manager, roll/restart the AI Service using the approved deployment process, and confirm no old credential remains in active configuration.
4. Replace the webhook secret in App settings and `GITHUB_APP_WEBHOOK_SECRET` together; update the protected secret, restart/reload AI Service, then confirm signatures are valid only with the new secret. If the webhook must be disabled immediately, deactivate it in GitHub and remove/disable the endpoint secret in staging.
5. If scope B created a test PR/branch, close/delete it only with repository-owner approval. Preserve redacted audit/evidence; do not roll back application/database state as part of GitHub credential rollback unless separately approved.
6. Record the revocation/rotation time, affected installation/project, operator, confirmation that new authenticated requests fail with the old key/secret, and final cleanup outcome. Never record old or new secret material.

## Official references

- [GitHub App permission selection](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [Installing a GitHub App and selecting repositories](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)
- [GitHub App installation authentication and scoped tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [Registering an App webhook and subscribing to events](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events)
- [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Managing and deleting GitHub App private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
- [Suspending a GitHub App installation](https://docs.github.com/en/apps/maintaining-github-apps/suspending-a-github-app-installation)
