export type SectionTab = { id: string; label: string };

type Props = {
  tabs: SectionTab[];
  active: string;
  onSelect: (id: string) => void;
};

/** Bölüm içi sekmeler (ör. Ekranlar → Sayfalar / Formlar / Raporlar). */
export function SectionTabs({ tabs, active, onSelect }: Props) {
  return (
    <div className="st-segmented st-section-tabs" role="group" aria-label="Bölüm sekmeleri">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" aria-pressed={tab.id === active} onClick={() => onSelect(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
