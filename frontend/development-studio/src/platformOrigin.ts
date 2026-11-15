/**
 * Resolves the ERP platform origin the Studio embeds (iframe) and posts the
 * access token to. The configured build-time origin is authoritative: a
 * `?platformOrigin=` query value is only a hint and must never be able to
 * redirect the token to an arbitrary site.
 */
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function toHttpOrigin(candidate: string | null | undefined): string | null {
  if (!candidate?.trim()) return null;
  try {
    const url = new URL(candidate.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolvePlatformOrigin(
  requestedOrigin: string | null | undefined,
  configuredOrigin: string | null | undefined,
  currentOrigin: string,
): string {
  const configured = toHttpOrigin(configuredOrigin);
  if (configured && configured !== currentOrigin) return configured;

  // Without a configured origin (local development) only loopback ERP hosts
  // may be requested; anything else falls back to the Studio's own origin.
  const requested = toHttpOrigin(requestedOrigin);
  if (requested && requested !== currentOrigin && loopbackHosts.has(new URL(requested).hostname))
    return requested;
  return currentOrigin;
}
