import type { StatusTagTone } from "../list-page/StatusTag";

/**
 * StatusTag tone of a foreign trade case (Taslak → Planlandı → Sevkte → Gümrükte → Ulaştı → Kapandı; İptal):
 * draft blue, in progress orange, closed green, cancelled grey.
 */
export function tradeStatusTone(status: string): StatusTagTone {
  switch (status) {
    case "Draft":
      return "info";
    case "Closed":
      return "ok";
    case "Cancelled":
      return "off";
    default:
      return "warn";
  }
}
