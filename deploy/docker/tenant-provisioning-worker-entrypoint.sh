#!/bin/sh
set -eu

required_files="/run/provisioning-secrets/tenant_provisioning_sql_connection /run/provisioning-secrets/vault_tenant_sql_reader_role_id /run/provisioning-secrets/vault_tenant_sql_reader_secret_id /run/provisioning-secrets/vault_tenant_sql_writer_role_id /run/provisioning-secrets/vault_tenant_sql_writer_secret_id /run/provisioning-secrets/vault-ca.crt"
for path in $required_files; do
    if [ ! -f "$path" ] || [ ! -s "$path" ]; then
        echo "Required worker secret is missing, empty, or not a regular file: $(basename "$path")" >&2
        exit 78
    fi
done

cat /etc/ssl/certs/ca-certificates.crt /run/provisioning-secrets/vault-ca.crt > /tmp/nexora-ca-bundle.crt
export SSL_CERT_FILE=/tmp/nexora-ca-bundle.crt
exec dotnet AIERP.TenantProvisioningWorker.dll "$@"
