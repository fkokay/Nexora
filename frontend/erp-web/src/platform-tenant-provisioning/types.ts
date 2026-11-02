export type ProvisioningStatus = {
  jobId: string
  tenantId: string
  status: 'Queued' | 'Running' | 'Completed' | 'Failed'
  provisioningState: string | null
  attemptCount: number
  errorCode: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  statusUrl: string
}

export type ProvisioningRequest = {
  name: string
  slug: string
  baseCurrencyCode: string
  adminEmail: string
  adminDisplayName: string
}

export type PlatformTenantSummary = {
  id: string
  name: string
  slug: string
  isActive: boolean
  baseCurrencyCode: string
  provisioningState: string | null
  licenseStatus: 'Unlicensed' | 'Active' | 'Expired' | 'Invalid'
  licenseTier: string | null
  licenseExpiresAt: string | null
}
