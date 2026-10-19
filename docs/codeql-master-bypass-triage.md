# Default-branch CodeQL user-controlled-bypass triage

Reviewed: 2026-10-19
Repository: `fkokay/Nexora`

## Alert #194 — ERP assistant sharing confirmation

`AISharingConfirmed` represents the authenticated user's per-message choice to send their question and authorized read-only ERP context to the selected AI provider. In ERP Web, `sharingConfirmed` starts `false`; the checkbox must be selected before submission, and the submit handler returns without making a request otherwise. The AI endpoint independently requires authentication, resolves the user's tenant/user scope with `TryScope`, and rejects a false confirmation before invoking the model provider. The flag is a consent input, not an authorization or tenant-isolation check. This matches the documented per-message opt-in behavior.

## Alert #195 — Module upload content type

`Request.HasFormContentType` validates the expected multipart request format. It does not control authentication or authorization: the endpoint independently requires `PlatformModuleMaintainer`, whose policy requires an authenticated PlatformDeveloper, PlatformSuperAdmin, or PlatformReleaseManager. A live request with no credentials and `text/plain` content received HTTP 401 before the handler could validate the body format.

Both alerts were dismissed as false positives with individual scoped comments. The review is limited to these two alerts and does not close other CodeQL findings.
