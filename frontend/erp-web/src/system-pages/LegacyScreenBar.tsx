import "./system-pages.css";

/** Thin strip above a legacy screen the user opened instead of its system page design. */
export function LegacyScreenBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="legacy-screen-bar" role="status">
      <span>Eski ekran görüntüleniyor.</span>
      <button type="button" className="link-button" onClick={onBack}>Yeni tasarıma dön</button>
    </div>
  );
}
