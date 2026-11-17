import type { StatusTagTone } from "../list-page/StatusTag";
import type { Campaign } from "./components/types";

export type CampaignState = "current" | "planned" | "expired" | "inactive";

export const campaignStateLabels: Record<CampaignState, string> = {
  current: "Geçerli",
  planned: "Planlanan",
  expired: "Süresi doldu",
  inactive: "Pasif",
};

/** Status tag colours: usable today ok, starts later info, over or passive off. */
export const campaignStateTones: Record<CampaignState, StatusTagTone> = {
  current: "ok",
  planned: "info",
  expired: "off",
  inactive: "off",
};

export const campaignStateLabel = (state: CampaignState) => campaignStateLabels[state];

/** Whether the campaign is usable today: passive wins, then the date range decides. */
export function campaignState(campaign: Campaign, today: string): CampaignState {
  if (!campaign.isActive) return "inactive";
  if (campaign.effectiveFrom > today) return "planned";
  if (campaign.effectiveThrough < today) return "expired";
  return "current";
}

/** Whole calendar days between two yyyy-mm-dd dates (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const ENDING_SOON_DAYS = 7;

/** Days left of a campaign valid today that ends within ENDING_SOON_DAYS, else null. */
export function endingSoonDays(campaign: Campaign, today: string): number | null {
  if (campaignState(campaign, today) !== "current") return null;
  const left = daysBetween(today, campaign.effectiveThrough);
  return left <= ENDING_SOON_DAYS ? left : null;
}
