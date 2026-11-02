// Keep the ERP customization screens in the Studio bundle while reusing
// Studio's same-origin authentication, refresh, and tenant-aware API client.
export { authorizedFetch as authenticatedFetch } from '../../api'
