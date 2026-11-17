import type { ReactNode } from "react";
import { ListFooter } from "../../list-page/ListFooter";
import { ListPagination } from "../../list-page/ListPagination";

type Props = {
  /** Ticked rows of the visible page. */
  ticked: number;
  /** Rows shown on this page. */
  shown: number;
  total: number;
  page: number;
  pageSize?: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  /** Extra keyboard hints after the common ones. */
  hints?: string;
};

/** Bottom line of a sales list: keyboard hints, ticked count, shown / total and the pagination. */
export function SalesListFooter({ ticked, shown, total, page, pageSize, loading, onPageChange, hints }: Props) {
  const end: ReactNode[] = [];
  if (ticked > 0)
    end.push(
      <span key="ticked">
        <span>{ticked}</span> <span>seçili</span>
      </span>,
    );
  end.push(
    <span key="shown">
      <span>Gösterilen</span>{" "}
      <span>
        {shown.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")}
      </span>
    </span>,
  );
  return (
    <ListFooter hints={hints ?? "↑↓ gez · Boşluk işaretle · Enter aç · Ctrl+. detay paneli"}>
      {end}
      <ListPagination page={page} total={total} pageSize={pageSize} loading={loading} onPageChange={onPageChange} />
    </ListFooter>
  );
}

/**
 * Sum of the page's amounts for a summary card: one currency is added up ("1.200,00 TRY"); amounts in several
 * currencies are not added (null). An empty page is null too.
 */
export function pageAmount(rows: Array<{ grandTotal: number; currencyCode: string }>): string | null {
  const currencies = new Set(rows.map((row) => row.currencyCode));
  if (currencies.size !== 1) return null;
  const sum = rows.reduce((total, row) => total + row.grandTotal, 0);
  return `${sum.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${rows[0].currencyCode}`;
}

/** Hint of an amount card: "bu sayfa", or why it shows no sum. */
export function pageAmountHint(rows: Array<{ currencyCode: string }>): string {
  return new Set(rows.map((row) => row.currencyCode)).size > 1 ? "bu sayfa · birden çok para birimi" : "bu sayfa";
}
