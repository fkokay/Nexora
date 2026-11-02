# Tenant AI API key encryption rollout

New tenant AI provider keys use the `v3.` envelope. AES-GCM authenticates both the tenant ID and a stable provider purpose (`openai-api-key` or `nvidia-api-key`) as associated data, so a value copied to another tenant or provider column fails authentication. The unversioned base64 envelope and prior tenant-bound `v2.` envelope remain supported for reads during rollout. Unversioned values have no tenant binding; `v2.` values bind only the tenant and do not bind provider purpose. All key reads must use the tenant ID and purpose for the selected settings column.

## Re-encryption procedure

Do not bulk-rewrite ciphertext as part of deployment. Keep the dual-read code deployed until legacy values have been migrated. A controlled migration should process one settings row at a time:

1. Read the row's `TenantId` and original key ciphertext without logging or displaying ciphertext or plaintext.
2. Call `ApiKeyCipher.ReEncryptForTenant` with that row's tenant ID and the purpose matching the selected key column. The helper reads legacy ciphertext and returns a purpose-bound `v3.` envelope; it authenticates v3 values and leaves them unchanged. It upgrades unversioned and v2 values.
3. Update only the selected key column with a compare-and-swap predicate matching both `TenantId` and the original ciphertext. If the predicate matches no row, discard the computed value and retry from a fresh read; never overwrite a concurrently changed key.
4. Verify by decrypting the persisted v3 envelope using the same tenant ID and purpose, without recording the returned plaintext. A decryption or data-integrity failure must leave the stored value untouched and be surfaced only as a row-level migration failure without key material.
5. Retain legacy-read support until the migration has reported zero remaining legacy envelopes across all tenant rows. Then remove legacy decryption in a separate change.

New settings writes use v3. Existing unversioned and v2 values remain readable until re-encrypted by this controlled compare-and-swap procedure. No automatic database re-encryption has occurred. No secret, ciphertext, or decrypted key belongs in logs, command output, migration reports, or audit resources.
