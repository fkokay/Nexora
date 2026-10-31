@{
    # Copy this file to a protected path outside the release bundle, for example:
    # C:\ProgramData\Nexora\deployment\nexora-secrets.psd1
    # Restrict it to Administrators and SYSTEM. Replace every CHANGE-ME value.
    Common = @{
        'Authentication__SigningKey' = 'CHANGE-ME-32-BYTES-MINIMUM-USE-A-CRYPTOGRAPHICALLY-RANDOM-VALUE'
        'Authentication__Issuer' = 'AIERP'
        'Authentication__Audience' = 'AIERP'
        'Frontend__Origins__0' = 'https://erp.example.com'
        'Frontend__Origins__1' = 'https://studio.example.com'
    }
    PlatformApi = @{
        'ConnectionStrings__Platform' = 'Server=sql.example.internal;Database=AIERPPlatform;User Id=aierp_runtime;Password=CHANGE-ME;Encrypt=True;TrustServerCertificate=False;'
        # Endpoint/TLS templates only; tenant-specific SQL credentials are resolved from Vault.
        'ConnectionStrings__Tenant' = 'Server=sql.example.internal;Database=AIERPPlatform;Encrypt=True;TrustServerCertificate=False;'
        'ConnectionStrings__AIStudio' = 'Server=sql.example.internal;Database=AIERPStudio;Encrypt=True;TrustServerCertificate=False;'
        'Database__SeparationEnabled' = 'true'
        'Vault__Address' = 'https://vault.example.internal'
        'Vault__Mount' = 'secret'
        'Vault__TenantSqlCredentialReader__RoleIdFile' = 'C:\ProgramData\Nexora\secrets\vault_tenant_sql_reader_role_id'
        'Vault__TenantSqlCredentialReader__SecretIdFile' = 'C:\ProgramData\Nexora\secrets\vault_tenant_sql_reader_secret_id'
        'Vault__AllowHttpForLocalDevelopment' = 'false'
        'PluginHost__SigningKey' = 'CHANGE-ME-USE-A-DIFFERENT-RANDOM-SECRET-AT-LEAST-32-BYTES'
        'IntegrationQueue__EncryptionKey' = 'CHANGE-ME-BASE64-OF-EXACTLY-32-RANDOM-BYTES'
        'PluginHost__BaseUrl' = 'https://plugin-host.internal'
        'IntegrationHost__BaseUrl' = 'https://integration-host.internal'
        'AIService__BaseUrl' = 'http://127.0.0.1:5081'
        'ModulePackages__RootPath' = 'D:\Nexora\data\module-packages'
        'Database__ApplyMigrationsOnStartup' = 'false'
    }
    AIService = @{
        'ConnectionStrings__Platform' = 'Server=sql.example.internal;Database=AIERPPlatform;User Id=aierp_runtime;Password=CHANGE-ME;Encrypt=True;TrustServerCertificate=False;'
        # Endpoint/TLS template only; tenant-specific Studio SQL credentials are resolved from Vault.
        'ConnectionStrings__AIStudio' = 'Server=sql.example.internal;Database=AIERPStudio;Encrypt=True;TrustServerCertificate=False;'
        'Vault__Address' = 'https://vault.example.internal'
        'Vault__Mount' = 'secret'
        'Vault__TenantSqlCredentialReader__RoleIdFile' = 'C:\ProgramData\Nexora\secrets\vault_tenant_sql_reader_role_id'
        'Vault__TenantSqlCredentialReader__SecretIdFile' = 'C:\ProgramData\Nexora\secrets\vault_tenant_sql_reader_secret_id'
        'Vault__AllowHttpForLocalDevelopment' = 'false'
        'PlatformApi__BaseUrl' = 'http://127.0.0.1:5080'
        'WorkspaceRunner__BaseUrl' = 'https://workspace-runner.internal'
        'ReleaseDeployer__BaseUrl' = 'https://release-deployer.internal'
        'AI__Provider' = 'OpenAI'
        'AI__OpenAI__Model' = 'gpt-6-astra'
        'AI__OpenAI__ApiKey' = 'CHANGE-ME-OPTIONAL-USE-A-SECRET-STORE'
        'GitHub__WebhookSecret' = 'CHANGE-ME-OPTIONAL-AT-LEAST-32-BYTES'
        'GitHub__StudioRedirectUrl' = 'https://studio.example.com/?app=studio'
        'GitHub__SetupCallbackUrl' = 'https://studio.example.com/studio/github/setup-callback'
        'Database__SeparationEnabled' = 'true'
    }
}
