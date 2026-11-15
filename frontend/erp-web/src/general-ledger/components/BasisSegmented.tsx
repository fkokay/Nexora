export type ReportingBasis = "TDHP" | "IFRS";

/** TDHP / IFRS reporting basis switch of the ledger reports. */
export function BasisSegmented({
  value,
  onChange,
}: {
  value: ReportingBasis;
  onChange: (value: ReportingBasis) => void;
}) {
  return (
    <div className="gl-seg" role="group" aria-label="Raporlama standardı">
      {(
        [
          ["TDHP", "TDHP", "Türkiye · Tek Düzen Hesap Planı"],
          ["IFRS", "IFRS", "IFRS / UFRS · eşlenmiş hesaplar"],
        ] as const
      ).map(([option, label, title]) => (
        <button
          key={option}
          type="button"
          className={value === option ? "is-active" : undefined}
          aria-pressed={value === option}
          title={title}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
