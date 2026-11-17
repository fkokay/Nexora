import { Fragment } from "react";
import SearchableRecordPicker from "../../SearchableRecordPicker";
import type {
  DraftInput,
  DraftLineInput,
  ExpenseAccount,
  ReceiptOption,
} from "../types";
import { LineAddLabel, SalesFormLines } from "../../sales/salesDocumentForm";

type Props = {
  draft: DraftInput;
  expenseAccounts: ExpenseAccount[];
  receiptOptions: ReceiptOption[];
  onUpdateLine: (
    index: number,
    field: keyof DraftLineInput,
    value: string,
  ) => void;
  onSelectReceiptLine: (index: number, id: string) => void;
  onAddLine: () => void;
  onRemoveLine: (index: number) => void;
};

const COLUMNS = 12;

/**
 * Fatura satırları belge oluşturma ızgarasında (`table.dd-lines`): her satır bir ızgara satırıdır, tutarlar kaynak
 * belgeden girilir (yeniden hesaplanmaz). Mal kabule bağlı satırın açıklaması satırın altında durur.
 */
export function InvoiceDraftLineEditor({
  draft,
  expenseAccounts,
  receiptOptions,
  onUpdateLine,
  onSelectReceiptLine,
  onAddLine,
  onRemoveLine,
}: Props) {
  const amount = (index: number, field: keyof DraftLineInput, label: string, required: boolean, step = "0.01", max?: string) => (
    <td className="dd-num">
      <input
        aria-label={`Satır ${index + 1} ${label}`}
        type="number"
        min="0"
        max={max}
        step={step}
        value={draft.lines[index][field]}
        onChange={(e) => onUpdateLine(index, field, e.target.value)}
        required={required}
      />
    </td>
  );
  return (
    <SalesFormLines label="Fatura satırları" lines={draft.lines.length} extra={draft.currencyCode || undefined}>
      <table className="dd-lines sid-lines-table">
        <thead>
          <tr>
            <th className="dd-ix">#</th>
            <th>Siparişsiz mal kabul satırı</th>
            <th>Açıklama *</th>
            <th className="dd-num">Miktar</th>
            <th>Birim</th>
            <th className="dd-num">Birim fiyat</th>
            <th className="dd-num">Ara toplam *</th>
            <th className="dd-num">İskonto *</th>
            <th className="dd-num">Vergi tutarı *</th>
            <th className="dd-num">KDV %</th>
            <th>Gider hesabı</th>
            <th className="dd-num">Satır toplamı *</th>
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, index) => (
            <Fragment key={index}>
              <tr className={line.standalonePurchaseReceiptLineId ? "is-warning" : undefined}>
                <td className="dd-ix">
                  <span>{index + 1}</span>
                  <button
                    type="button"
                    className="dd-line-remove"
                    disabled={draft.lines.length === 1}
                    aria-label={`Satır ${index + 1} sil`}
                    title="Satırı sil"
                    onClick={() => onRemoveLine(index)}
                  >
                    ×
                  </button>
                </td>
                <td className="dd-stock-cell">
                  <SearchableRecordPicker
                    options={receiptOptions.map((receipt) => ({
                      id: receipt.lineId,
                      label: `${receipt.receiptCode} · ${receipt.receiptDate} · ${receipt.stockCode} · ${receipt.stockName}`,
                      description: `Kalan ${receipt.quantity} ${receipt.unitCode} · birim maliyet ${receipt.unitCostBase.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} baz para`,
                      searchText: `${receipt.receiptCode} ${receipt.receiptDate} ${receipt.stockCode} ${receipt.stockName}`,
                    }))}
                    selectedId={line.standalonePurchaseReceiptLineId}
                    onSelect={(value) => onSelectReceiptLine(index, value)}
                    title="Siparişsiz mal kabul satırı seçin"
                    placeholder="Mal kabule bağlı değil · gider hesabı seçin"
                    searchPlaceholder="Mal kabul, stok kodu veya adıyla ara"
                    emptyMessage="Bu tedarikçi için eşleşen mal kabul satırı yok."
                    triggerVariant="ellipsis"
                    clearable
                    clearLabel="Mal kabule bağlı değil · gider hesabı seçin"
                  />
                </td>
                <td className="sid-description-cell">
                  <input
                    aria-label={`Satır ${index + 1} açıklama`}
                    value={line.description}
                    onChange={(e) => onUpdateLine(index, "description", e.target.value)}
                    maxLength={240}
                    required
                  />
                </td>
                {amount(index, "quantity", "miktar", false, "0.0001")}
                <td>
                  <input
                    aria-label={`Satır ${index + 1} birim`}
                    value={line.unitCode}
                    onChange={(e) => onUpdateLine(index, "unitCode", e.target.value)}
                    maxLength={12}
                  />
                </td>
                {amount(index, "unitPrice", "birim fiyat", false, "0.0001")}
                {amount(index, "subtotal", "ara toplam", true)}
                {amount(index, "discountAmount", "iskonto tutarı", true)}
                {amount(index, "taxAmount", "vergi tutarı", true)}
                {amount(index, "vatRate", "KDV oranı", false, "0.01", "100")}
                <td>
                  {line.standalonePurchaseReceiptLineId ? (
                    <span className="sid-muted">—</span>
                  ) : (
                    <select
                      aria-label={`Satır ${index + 1} gider hesabı`}
                      value={line.expenseAccountId}
                      onChange={(e) => onUpdateLine(index, "expenseAccountId", e.target.value)}
                    >
                      <option value="">Şimdi seçme</option>
                      {expenseAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                {amount(index, "total", "satır toplamı", true)}
              </tr>
              {line.standalonePurchaseReceiptLineId && (
                <tr className="dd-line-message">
                  <td colSpan={COLUMNS}>
                    Bu satır mal kabul maliyetini faturadaki net tutara günceller. Yalnız kalan, tüketilmemiş stok için
                    aktarılır; stok miktarı değişmez.
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          <tr className="dd-new-line">
            <td colSpan={COLUMNS}>
              <button type="button" data-line-add-shortcut title="Ctrl+Shift+Enter ile satır ekle" onClick={onAddLine}>
                <LineAddLabel />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="sid-lines-note">
        <span>
          Miktar ve birim fiyat isteğe bağlıdır; satır tutarları kaynak
          belgeden girilir, yeniden hesaplanmaz.
        </span>{" "}
        <span>
          KDV oranı belge üzerinden kaydedilir; yeniden hesaplanmaz. Gider hesabı yalnız sonraki muhasebeleştirme için sınıflandırmadır.
        </span>
      </p>
    </SalesFormLines>
  );
}
