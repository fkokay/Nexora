using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;

namespace AIERP.AIService;

/// <summary>
/// Carries a signed tenant locator through GitHub's anonymous installation callback.
/// The callback still validates the complete state against its one-time database record.
/// </summary>
internal static class GitHubSetupState
{
    private const int NonceLength = 32;
    private const int SignatureLength = 32;
    private const int PayloadLength = 16 + NonceLength;

    public static string Create(Guid tenantId, string signingKey)
    {
        if (tenantId == Guid.Empty) throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        var key = Encoding.UTF8.GetBytes(signingKey);
        var payload = new byte[PayloadLength];
        tenantId.TryWriteBytes(payload.AsSpan(0, 16));
        RandomNumberGenerator.Fill(payload.AsSpan(16, NonceLength));
        var signature = HMACSHA256.HashData(key, payload);
        var state = new byte[PayloadLength + SignatureLength];
        payload.CopyTo(state, 0);
        signature.CopyTo(state, PayloadLength);
        return WebEncoders.Base64UrlEncode(state);
    }

    public static bool TryGetTenantId(string state, string signingKey, out Guid tenantId)
    {
        tenantId = Guid.Empty;
        if (string.IsNullOrWhiteSpace(state)) return false;
        byte[] decoded;
        try { decoded = WebEncoders.Base64UrlDecode(state); }
        catch (FormatException) { return false; }
        if (decoded.Length != PayloadLength + SignatureLength) return false;

        var payload = decoded.AsSpan(0, PayloadLength);
        var suppliedSignature = decoded.AsSpan(PayloadLength, SignatureLength);
        var expectedSignature = HMACSHA256.HashData(Encoding.UTF8.GetBytes(signingKey), payload);
        if (!CryptographicOperations.FixedTimeEquals(suppliedSignature, expectedSignature)) return false;

        tenantId = new Guid(payload[..16]);
        return tenantId != Guid.Empty;
    }
}
