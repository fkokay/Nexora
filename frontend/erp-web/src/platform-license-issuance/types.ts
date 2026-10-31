export type Tenant = { id: string; name: string; slug: string; isActive: boolean }

export type IssuedLicense = {
  tenantId: string
  tenantName: string
  licenseId: string
  tier: string
  keyId: string
  issuedAt: string
  expiresAt: string
  signedGrant: string
}

export type LicenseIssuer = { ready: boolean; keyId: string | null }
