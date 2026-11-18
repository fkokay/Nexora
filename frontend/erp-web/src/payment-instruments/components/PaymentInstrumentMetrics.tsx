import type { LucideIcon } from "lucide-react";
import { formatAmount } from "../../document-detail/DocumentDetailLayout";
import type { SummaryCard } from "../../list-page/ListSummaryCards";
import type { CurrencyAmount } from "../paymentInstrumentTypes";

/** Portfolio-wide figures; they do not follow the tab or chip filters. */
export type PortfolioTiles = {
  receivableOpen: CurrencyAmount[];
  receivableOpenCount: number;
  payableOpen: CurrencyAmount[];
  payableOpenCount: number;
  dueSoonCount: number;
  dueSoonReceivable: CurrencyAmount[];
  dueSoonPayable: CurrencyAmount[];
  bouncedCount: number;
};

/** One amount per currency (currencies are never added together). */
function Amounts({ rows }: { rows: CurrencyAmount[] }) {
  if (!rows.length) return <>—</>;
  return (
    <span className="pi-card-amounts">
      {rows.map((row) => (
        <span key={row.currencyCode}>{formatAmount(row.amount, row.currencyCode)}</span>
      ))}
    </span>
  );
}

type Options = {
  icons: { open: LucideIcon; payable: LucideIcon; dueSoon: LucideIcon; bounced: LucideIcon };
};

/**
 * The portfolio summary as list summary cards (same figures as the former tiles: open received and given amounts per
 * currency, due in 30 days, bounced). They come from the summary of page-size-1 list calls.
 */
export function portfolioCards(tiles: PortfolioTiles | null, loading: boolean, options: Options): SummaryCard[] {
  const empty = loading ? "…" : "—";
  const dueSoon = tiles
    ? [
        ...tiles.dueSoonReceivable.map((row) => ({ ...row, side: "Alınan" })),
        ...tiles.dueSoonPayable.map((row) => ({ ...row, side: "Verilen" })),
      ]
    : [];
  return [
    {
      id: "receivable",
      label: "Portföyde",
      value: tiles ? <Amounts rows={tiles.receivableOpen} /> : empty,
      icon: options.icons.open,
      hint: tiles ? <span>{`${tiles.receivableOpenCount} alınan çek/senet`}</span> : undefined,
    },
    {
      id: "payable",
      label: "Verilen",
      value: tiles ? <Amounts rows={tiles.payableOpen} /> : empty,
      icon: options.icons.payable,
      hint: tiles ? <span>{`${tiles.payableOpenCount} açık verilen çek/senet`}</span> : undefined,
    },
    {
      id: "due-soon",
      label: "30 gün içinde vade",
      value: !tiles ? (
        empty
      ) : dueSoon.length ? (
        <span className="pi-card-amounts">
          {dueSoon.map((row) => (
            <span key={`${row.side}-${row.currencyCode}`}>
              <small>{row.side}</small> {formatAmount(row.amount, row.currencyCode)}
            </span>
          ))}
        </span>
      ) : (
        "—"
      ),
      icon: options.icons.dueSoon,
      tone: tiles?.dueSoonCount ? "warn" : "primary",
      hint: tiles ? <span>{`${tiles.dueSoonCount} çek/senet`}</span> : undefined,
    },
    {
      id: "bounced",
      label: "Karşılıksız",
      value: tiles ? tiles.bouncedCount.toLocaleString("tr-TR") : empty,
      icon: options.icons.bounced,
      tone: tiles?.bouncedCount ? "bad" : "primary",
      hint: <span>Tahsil edilemeyen alınan ve verilen kayıtlar</span>,
    },
  ];
}
