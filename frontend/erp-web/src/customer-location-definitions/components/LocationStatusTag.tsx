/** Aktif / Pasif tag of a province or district (Pasif rows are hidden from new address picks). */
export function LocationStatusTag({ active }: { active: boolean }) {
  return <span className={`cld-tag ${active ? "is-ok" : "is-off"}`}>{active ? "Aktif" : "Pasif"}</span>;
}
