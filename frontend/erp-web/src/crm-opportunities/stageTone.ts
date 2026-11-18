import type { StatusTagTone } from "../list-page/StatusTag";

/** Stage tag tone: open stages blue (early) / orange (late), Kazanıldı green, Kaybedildi grey. */
export function stageTone(stage: string): StatusTagTone {
  if (stage === "Won") return "ok";
  if (stage === "Lost") return "off";
  if (stage === "Proposal" || stage === "Negotiation") return "warn";
  return "info";
}

/** Reason Aç / Düzenle is off on a closed opportunity (the API rejects updates of Won / Lost). */
export const CLOSED_OPPORTUNITY_REASON = "Kapanmış fırsat düzenlenemez";
