# Nexora offsite backup operations

## Current configuration

- Provider: AWS S3, `eu-north-1` (Stockholm).
- Bucket: `nexora-offsite-backup-20261110-8f2a7c`.
- Encrypted backup prefix: `nexora/`.
- Local scheduler interval: 86,400 seconds (once daily), configured in the ignored `deploy/docker/.env` file.
- S3 lifecycle rule: `nexora-backup-expire-30d`, enabled and filtered to `nexora/`; current objects expire 30 days after creation. Bucket versioning is disabled, so expiry permanently removes the object.
- A one-time initial upload was verified with `rclone check --download`: 40 remote objects matched, with no differences.
- AWS monthly cost budget: `Nexora-Offsite-S3-Monthly-10USD`, $10/month, account-wide because the console did not offer an S3-only service filter; notification threshold is actual spend above 80% ($8). No budget actions are configured, so this is an alert rather than a spending cap.
- The budget alert recipient is verified (`1/1 email verified`). The AWS verification message arrived in Gmail Spam; its sender was `email-verification@aws.com`, signed by `aws.com`, and its account number matched. The user completed the verification directly in the email.
- On 2026-11-10, a second AWS access key was created and labeled `Nexora offsite backup rotation 2026-11-10`. The gitignored `.env` now uses this new key; an S3 listing returned all 40 encrypted objects, and the recreated daily worker completed a cryptcheck with 40 matching files and 0 differences. At the user's direction, both the older unlabeled key and the new key remain active. Keep the old CSV until the user chooses whether to retire the older key.
- On 2026-11-10, `PLUGIN_HOST_SIGNING_KEY` was rotated in the gitignored `.env`; `platform-api`, `plugin-host`, and `integration-host` were recreated together and all three returned healthy with restart count 0. The old value was saved temporarily as a Windows DPAPI-protected rollback file at `C:\Users\FATIH\AppData\Local\Nexora\Secrets\plugin-host-signing-key-rollback.dpapi`. Removal after successful verification was blocked by the automatic review layer, so the encrypted copy remains on this Windows account. Plugin and integration service tokens are short-lived (at most one minute); no persisted data is encrypted with this key.
- On 2026-11-10, `INTEGRATION_QUEUE_ENCRYPTION_KEY` was rotated after a read-only SQL check found zero encrypted operation rows. The Platform API was recreated; its environment matched the new local `.env` value without exposing the key, and its health check returned healthy with restart count 0. Recheck row count before any future rotation because subsequent queue operations will use this key.
- On 2026-11-10, the SQL `sa` password was rotated after a preflight confirmed the local and deployed settings matched. The new login was accepted, the SQL container was recreated with the new health-check environment, and all six non-system databases reported `ONLINE`. Platform API, AI service, plugin host, and integration host remained healthy. The previous `sa` password is held only in a Windows DPAPI-protected rollback file at `C:\Users\FATIH\AppData\Local\Nexora\Secrets\sql-sa-password-rollback.dpapi`.
- On 2026-11-10, `aierp_platform_migrator`, `aierp_platform_runtime`, and `aierp_data_runtime` passwords were rotated. The existing one-shot migrator initializer exited 0; direct SQL login checks for both runtime users succeeded. Platform API and AI service were recreated and returned healthy with restart count 0.

## Daily service status

The Compose `offsite-backup` profile copies recent backups, runs an encrypted remote check, then sleeps for the configured interval. The service is running on the remote host as `nexora-offsite-backup-1` (started 2026-11-10; restart count was 0 at verification). Its initial cycle found nothing new to transfer and completed an encrypted check with 40 matching files and 0 differences. It was checked again at 11:02 on 2026-11-10: still `Up`, with 40 matching files and 0 differences. Check continued operation with:

```powershell
docker --context nexora-remote compose --project-name nexora --env-file deploy/docker/.env --file deploy/docker/docker-compose.yml --profile offsite-backup ps offsite-backup
docker --context nexora-remote compose --project-name nexora --env-file deploy/docker/.env --file deploy/docker/docker-compose.yml --profile offsite-backup logs --tail 50 offsite-backup
```

If the service must be recreated, run `docker --context nexora-remote compose --project-name nexora --env-file deploy/docker/.env --file deploy/docker/docker-compose.yml --profile offsite-backup up -d --no-deps offsite-backup` when the remote context is reachable.

## Recovery material

The rclone crypt recovery key is stored locally at `C:\Users\FATIH\AppData\Local\Nexora\Secrets\offsite-backup-recovery-key.txt`. Keep an independent copy in an approved password manager. AWS and rclone credentials are held only in the access-controlled, gitignored `deploy/docker/.env`; do not include them in logs or this document.

The original IAM access-key CSV is retained for rollback while both keys remain active. The duplicate CSV for the new key was removed from Downloads after the key was written to the gitignored `.env` and verified. Application secrets previously present in command output still require rotation and confirmation.

## Restore rehearsal

On 2026-11-10, the 15 MB encrypted backup dated 2026-11-10 was restored into a separate SQL Server container with `--network none` and dedicated temporary volumes. The restored database reached `ONLINE`; `DBCC CHECKDB` exited successfully. The temporary container and both volumes were removed after verification. The production SQL Server was not mounted, and the production backup volume was not used.

## Remaining follow-up

- Confirm the daily service remains `Up` and check its logs after the next scheduled cycle.
- Rotate the remaining previously exposed application secrets through their respective secret owners. `AI_SETTINGS_ENCRYPTION_KEY` currently protects one persisted tenant provider key; safely rotating it requires decrypting and re-encrypting that row while the API is quiesced, then validating the provider integration. The current cipher does not offer old/new key fallback. `AUTH_SIGNING_KEY` is also used by Release Deployer to encrypt persisted deployment-state files, in addition to validating tokens; replacing it directly would make that state unreadable as well as invalidate sessions. It needs key-versioned decryption and a migration before rotation. OpenAI and GitHub credentials must be replaced at their provider consoles; the OpenAI key settings page is signed in and open in Chrome. The replacement OpenAI key can be entered locally, without sharing it in chat, using `scripts/Set-NexoraOpenAIKey.ps1`; recreate and verify `ai-service` before revoking the old provider key. The bootstrap administrator's actual password should also be changed by its owner because editing the bootstrap environment value does not update an existing account. The old AWS key remains active per the user's instruction.
- Keep an independent copy of the crypt recovery key in an approved password manager; this environment cannot verify or update the user's password manager.
- The 86,400-second service is still up; its next scheduled run is due roughly 24 hours after its prior cycle. Verify a fresh sync/check after that run.
- The earlier `/api/user-preferences/workspace-rail` 403 was caused by the default authorization handler rejecting the route because it has no configurable permission-catalog entry. The handler now allows only authenticated GET/PUT requests to this exact self-service route; the endpoint still requires valid tenant and user GUID claims and scopes reads/writes to that caller. The API image was rebuilt and only `platform-api` was redeployed; its health check is healthy. On 2026-11-10, opening the in-app menu editor loaded the personal shortcuts, and the API log recorded the corresponding tenant/user `workspace-rail` preference query; the authenticated GET is now verified. Opening the endpoint URL directly returned 401 because direct navigation did not attach the app's bearer token. The two original trace IDs were absent from API logs.
