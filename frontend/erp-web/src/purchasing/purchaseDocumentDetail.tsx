import { DocumentStatusFlow } from "../document-page/DocumentStatusFlow";
import { purchaseInvoiceStatus } from "../document-page/documentStatus";

/*
 * Satınalma belge detaylarının ortak parçaları (taslak 02 / 07). Akışlar yalnız belgenin bugünkü durumlarından
 * oluşur; ödeme durumu bir belge durumu değildir (DetailTiles ve listedeki etiket gösterir).
 */

/** Alış faturası: İşlendi; İptal akış dışı son durum. */
export function PurchaseInvoiceFlow({ status }: { status?: string }) {
  return (
    <DocumentStatusFlow
      steps={[{ key: "Posted", label: purchaseInvoiceStatus("Posted").label }]}
      current={status}
      terminal={{ key: "Voided", label: purchaseInvoiceStatus("Voided").label }}
    />
  );
}
