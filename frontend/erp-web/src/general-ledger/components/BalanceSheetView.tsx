import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { api, localDateString } from "../../erpApi";
import type { BalanceSheet } from "../../erp-types";
import { ListPageHeader } from "../../list-page/ListPageHeader";
import { ListToolbar } from "../../list-page/ListToolbar";
import { displayDate, downloadXlsx, formatAmount, round2, tdhpGroupLabel } from "../ledgerReportUtils";
import { BasisSegmented, type ReportingBasis } from "./BasisSegmented";
import "../ledger-reports.css";

type Side = "assets" | "liabilities";
type Line = { key: string; code: string; name: string; depth: number; current: number; compare: number | null };
type SubGroup = { key: string; label: string; lines: Line[] };
type Section = { key: string; side: Side; label: string; groups: SubGroup[] };

const sectionKeyOf = (statementSection: string, code: string, basis: ReportingBasis) => {
  const digit = code.trim().charAt(0);
  if (statementSection === "Asset") return basis === "IFRS" ? "A" : digit === "1" ? "A1" : digit === "2" ? "A2" : "A9";
  if (statementSection === "Liability") return basis === "IFRS" ? "L" : digit === "3" ? "L3" : digit === "4" ? "L4" : "L9";
  if (statementSection === "Equity") return "E";
  return "";
};
const sectionLabels: Record<string, string> = {
  A: "Varlıklar",
  A1: "I. Dönen varlıklar",
  A2: "II. Duran varlıklar",
  A9: "Diğer varlıklar",
  L: "Yükümlülükler",
  L3: "III. Kısa vadeli yabancı kaynaklar",
  L4: "IV. Uzun vadeli yabancı kaynaklar",
  L9: "Diğer yabancı kaynaklar",
  E: "V. Özkaynaklar",
};
const sectionOrder = ["A1", "A2", "A9", "A", "L3", "L4", "L9", "L", "E"];
const RESULT_KEY = "cumulative-result";

/** Assets show debit − credit; liabilities and equity show credit − debit. */
function buildSections(current: BalanceSheet, compare: BalanceSheet | null, basis: ReportingBasis): Section[] {
  const compareById = new Map(compare?.accounts.map((row) => [row.accountId, row]) || []);
  const rows = [...current.accounts];
  // Accounts that only carry a balance on the comparison date still need a row.
  for (const row of compare?.accounts || []) if (!current.accounts.some((item) => item.accountId === row.accountId)) rows.push({ ...row, debit: 0, credit: 0, balance: 0 });
  const sections = new Map<string, Section>();
  for (const row of rows.sort((a, b) => a.code.localeCompare(b.code, "tr", { numeric: true, sensitivity: "base" }))) {
    const key = sectionKeyOf(row.statementSection, row.code, basis);
    if (!key) continue;
    const sign = row.statementSection === "Asset" ? 1 : -1;
    const section =
      sections.get(key) ||
      ({ key, side: key.startsWith("A") ? "assets" : "liabilities", label: sectionLabels[key], groups: [] } as Section);
    sections.set(key, section);
    const groupKey = basis === "IFRS" ? key : row.code.trim().slice(0, 2);
    let group = section.groups.find((item) => item.key === groupKey);
    if (!group) {
      group = { key: groupKey, label: basis === "IFRS" ? "" : `${groupKey} ${tdhpGroupLabel(groupKey)}`, lines: [] };
      section.groups.push(group);
    }
    const compareRow = compareById.get(row.accountId);
    group.lines.push({
      key: row.accountId,
      code: row.code,
      name: row.name,
      depth: basis === "IFRS" ? 0 : row.code.split(".").length - 1,
      current: round2(sign * row.balance),
      compare: compare ? round2(sign * (compareRow?.balance ?? 0)) : null,
    });
  }
  // The cumulative income-statement result belongs to equity until period close moves it.
  const equity = sections.get("E") || { key: "E", side: "liabilities" as Side, label: sectionLabels.E, groups: [] };
  sections.set("E", equity);
  equity.groups.push({
    key: RESULT_KEY,
    label: "",
    lines: [
      {
        key: RESULT_KEY,
        code: "",
        name: "Dönem net kârı (zararı) · kümülatif gelir − gider",
        depth: 0,
        current: round2(current.totals.cumulativeResult),
        compare: compare ? round2(compare.totals.cumulativeResult) : null,
      },
    ],
  });
  return sectionOrder.filter((key) => sections.has(key)).map((key) => sections.get(key)!);
}

const sum = (lines: Line[], pick: (line: Line) => number | null) => round2(lines.reduce((total, line) => total + (pick(line) ?? 0), 0));
const signed = (value: number) => (value === 0 ? "—" : value < 0 ? `(${formatAmount(-value)})` : formatAmount(value));

export function BalanceSheetView({ token }: { token: string }) {
  const [basis, setBasis] = useState<ReportingBasis>("TDHP"),
    [asOf, setAsOf] = useState(localDateString()),
    [compareOn, setCompareOn] = useState(false),
    [compareDate, setCompareDate] = useState(`${new Date().getFullYear() - 1}-12-31`),
    [showZero, setShowZero] = useState(false),
    [collapsed, setCollapsed] = useState<Set<string>>(() => new Set()),
    [current, setCurrent] = useState<BalanceSheet | null>(null),
    [compare, setCompare] = useState<BalanceSheet | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!asOf || (compareOn && !compareDate)) return;
    const controller = new AbortController();
    const fetchSheet = (date: string) =>
      api<BalanceSheet>(
        `/api/finance/general-ledger/financial-statements/balance-sheet?${new URLSearchParams({ asOfDate: date, basis })}`,
        token,
        { signal: controller.signal },
      );
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      Promise.all([fetchSheet(asOf), compareOn ? fetchSheet(compareDate) : Promise.resolve(null)])
        .then(([sheet, previous]) => {
          if (controller.signal.aborted) return;
          setCurrent(sheet);
          setCompare(previous);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [token, basis, asOf, compareOn, compareDate]);

  const sections = current ? buildSections(current, compareOn ? compare : null, basis) : [];
  const hasCompare = compareOn && compare != null;
  const isVisible = (line: Line) => showZero || line.current !== 0 || (line.compare ?? 0) !== 0;
  const toggle = (key: string) =>
    setCollapsed((value) => {
      const next = new Set(value);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const currency = current?.baseCurrencyCode || "";

  function exportXlsx() {
    if (!current) return;
    const header = ["Taraf", "Bölüm", "Grup", "Hesap kodu", "Hesap adı", `Tutar (${displayDate(current.asOfDate)})`];
    if (hasCompare && compare) header.push(`Karşılaştırma (${displayDate(compare.asOfDate)})`);
    const rows: (string | number)[][] = [header];
    for (const section of sections)
      for (const group of section.groups)
        for (const line of group.lines.filter(isVisible)) {
          const row: (string | number)[] = [section.side === "assets" ? "Aktif" : "Pasif", section.label, group.label, line.code, line.name, line.current];
          if (hasCompare) row.push(line.compare ?? 0);
          rows.push(row);
        }
    const totalsRow = (label: string, value: number, previous: number | undefined) => {
      const row: (string | number)[] = [label, "", "", "", "", value];
      if (hasCompare) row.push(previous ?? 0);
      rows.push(row);
    };
    totalsRow("Aktif toplamı", current.totals.assets, compare?.totals.assets);
    totalsRow("Pasif toplamı", current.totals.liabilitiesAndEquity, compare?.totals.liabilitiesAndEquity);
    void downloadXlsx(`bilanco-${basis}-${current.asOfDate}.xlsx`, "Bilanço", rows);
  }

  const renderSide = (side: Side, title: string, total: number, compareTotal: number | null) => (
    <div className="glbs-side">
      <table className="glbs-table">
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col">{displayDate(current!.asOfDate)}</th>
            {hasCompare && <th scope="col">{displayDate(compare!.asOfDate)}</th>}
          </tr>
        </thead>
        {sections
          .filter((section) => section.side === side)
          .map((section) => {
            const lines = section.groups.flatMap((group) => group.lines);
            const isCollapsed = collapsed.has(section.key);
            return (
              <tbody key={section.key}>
                <tr className="glbs-section-row">
                  <th scope="rowgroup">
                    <button type="button" aria-expanded={!isCollapsed} onClick={() => toggle(section.key)}>
                      {isCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                      {section.label}
                    </button>
                  </th>
                  <td>{signed(sum(lines, (line) => line.current))}</td>
                  {hasCompare && <td>{signed(sum(lines, (line) => line.compare))}</td>}
                </tr>
                {!isCollapsed &&
                  section.groups.map((group) => {
                    const visible = group.lines.filter(isVisible);
                    if (!visible.length) return null;
                    return (
                      <Fragment key={group.key}>
                        {group.label && (
                          <tr className="glbs-group-row">
                            <th scope="row">{group.label}</th>
                            <td>{signed(sum(group.lines, (line) => line.current))}</td>
                            {hasCompare && <td>{signed(sum(group.lines, (line) => line.compare))}</td>}
                          </tr>
                        )}
                        {visible.map((line) => (
                          <tr key={line.key} className={`glbs-line${line.key === RESULT_KEY ? " is-result" : ""}`}>
                            <th scope="row" style={{ paddingLeft: 26 + 12 * line.depth }} title={line.name}>
                              {line.code && <b>{line.code}</b>}
                              <span>{line.name}</span>
                            </th>
                            <td>{signed(line.current)}</td>
                            {hasCompare && <td>{signed(line.compare ?? 0)}</td>}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
              </tbody>
            );
          })}
        <tfoot>
          <tr className="glbs-total-row">
            <th scope="row">{side === "assets" ? "Aktif toplamı" : "Pasif toplamı"}</th>
            <td>{formatAmount(total)}</td>
            {hasCompare && <td>{formatAmount(compareTotal ?? 0)}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <>
      <ListPageHeader
        title="Bilanço"
        description="Belirli bir tarih itibarıyla varlık, yükümlülük ve özkaynak dağılımını inceleyin."
        count={null}
      >
        <button type="button" className="secondary" disabled={!current} onClick={exportXlsx}>
          XLSX
        </button>
      </ListPageHeader>
      <section className="ledger-subpanel glrp glbs" aria-label="Bilanço">
        <ListToolbar>
          <label className="list-v2-filter">
            <span>Tarih</span>
            <input type="date" aria-label="Bilanço tarihi" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </label>
          <button
            type="button"
            className={`list-v2-chip${asOf === localDateString() ? " is-active" : ""}`}
            aria-pressed={asOf === localDateString()}
            onClick={() => setAsOf(localDateString())}
          >
            <span>Bugün</span>
          </button>
          <button
            type="button"
            className={`list-v2-chip${compareOn ? " is-active" : ""}`}
            aria-pressed={compareOn}
            onClick={() => setCompareOn((value) => !value)}
          >
            <span>Karşılaştır</span>
          </button>
          {compareOn && (
            <label className="list-v2-filter">
              <span>Karşılaştırma</span>
              <input type="date" aria-label="Karşılaştırma tarihi" value={compareDate} onChange={(e) => setCompareDate(e.target.value)} />
            </label>
          )}
          <BasisSegmented value={basis} onChange={setBasis} />
          <label className="glrp-toggle">
            <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
            <span>Sıfır kalemleri göster</span>
          </label>
        </ListToolbar>
        {error && <p className="error-banner">{error}</p>}
        {current && (
          <>
            {current.isBalanced ? (
              <p className="glrp-check is-ok">
                <CheckCircle2 size={15} aria-hidden="true" />
                <span>
                  {`Aktif = Pasif · ${formatAmount(current.totals.assets)} ${currency}`}
                  {round2(current.totals.cumulativeResult) !== 0
                    ? ` · Kümülatif dönem sonucu ${signed(round2(current.totals.cumulativeResult))} ${currency} özkaynaklarda gösterilir.`
                    : ""}
                </span>
              </p>
            ) : !current.isComplete ? (
              <p className="glrp-warning" role="status">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>
                  {current.unclassifiedAccountCount > 0
                    ? `${current.unclassifiedAccountCount} hareketli hesap sınıflandırılmamış; bilanço tamamlanmadı. Hesap planında her hesabı varlık, yükümlülük, özkaynak, gelir veya gider olarak sınıflandırın.`
                    : `${current.unmappedAccountCount || 0} hareketli hesapta ${basis} eşlemesi eksik; bilanço tamamlanmadı.`}
                </span>
              </p>
            ) : (
              <p className="glrp-check is-bad" role="alert">
                <AlertTriangle size={15} aria-hidden="true" />
                <span>{`Aktif ile pasif arasında fark var: ${formatAmount(current.totals.difference)} ${currency}`}</span>
              </p>
            )}
            {loading && <span className="glrp-loading">Yükleniyor…</span>}
            <div className="glbs-grid">
              {renderSide("assets", "Aktif · Varlıklar", current.totals.assets, compare?.totals.assets ?? null)}
              {renderSide("liabilities", "Pasif · Kaynaklar", current.totals.liabilitiesAndEquity, compare?.totals.liabilitiesAndEquity ?? null)}
            </div>
            <p className="glrp-note">
              Gelir/gider sonucu fişlerin başlangıcından seçilen tarihe kadar kümülatiftir. Dönem kapama, geçmiş yıl kârı aktarımı ve yasal beyanname uygunluğu bu rapor kapsamında değildir.
            </p>
          </>
        )}
        {!current && loading && <p className="glrp-empty">Bilanço hazırlanıyor…</p>}
      </section>
    </>
  );
}
