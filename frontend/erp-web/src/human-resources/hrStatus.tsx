import { StatusTag, type StatusTagTone } from "../list-page/StatusTag";

const labels: Record<string, [string, string]> = {
  Active: ["Aktif", "Active"],
  OnLeave: ["İzinde", "On leave"],
  Terminated: ["Ayrıldı", "Terminated"],
  Requested: ["Bekliyor", "Pending"],
  PendingApproval: ["Onay bekliyor", "Pending approval"],
  Approved: ["Onaylandı", "Approved"],
  Finalized: ["Kesinleştirildi (iç sonuç)", "Finalized (internal result)"],
  Rejected: ["Reddedildi", "Rejected"],
  Cancelled: ["İptal edildi", "Cancelled"],
  Draft: ["Taslak", "Draft"],
};

/** Label of an İK record status (personnel, leave, attendance, compensation, payroll, rule sets, calendars). */
export function hrStatusLabel(status: string, isEn: boolean): string {
  return labels[status]?.[isEn ? 1 : 0] ?? status;
}

/**
 * StatusTag tone: done / in force green, waiting orange, refused red, ended or cancelled grey, draft blue
 * (mockup 10 İK: Aktif · İzinde · Ayrıldı; Bekliyor → Onaylandı / Reddedildi / İptal edildi).
 */
export function hrStatusTone(status: string): StatusTagTone {
  switch (status) {
    case "Active":
    case "Approved":
    case "Finalized":
      return "ok";
    case "Requested":
    case "PendingApproval":
    case "OnLeave":
      return "warn";
    case "Rejected":
      return "bad";
    case "Draft":
      return "info";
    default:
      return "off";
  }
}

export function HrStatusTag({ status, isEn }: { status: string; isEn: boolean }) {
  return <StatusTag tone={hrStatusTone(status)}>{hrStatusLabel(status, isEn)}</StatusTag>;
}
