namespace AIERP.Platform.Domain;

/// <summary>Stores the signed-license grant metadata for one company. The submitted grant token itself is never persisted.</summary>
public sealed class TenantLicense
{
    public Guid TenantId { get; set; }
    public Guid LicenseId { get; set; }
    public string Tier { get; set; } = "Small";
    public int MaxUsers { get; set; }
    public int MaxCustomModules { get; set; }
    public int MaxStorageGb { get; set; }
    public DateTimeOffset IssuedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset ActivatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string GrantSha256 { get; set; } = "";
    public byte[] RowVersion { get; set; } = [];
}
