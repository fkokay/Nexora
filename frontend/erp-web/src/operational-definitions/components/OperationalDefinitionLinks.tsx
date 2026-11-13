import { ChevronRight, MapPin, Warehouse } from "lucide-react";
import type { Translate } from "../types";

type Props = { tx: Translate; onNavigate: (page: string) => void };

export function OperationalDefinitionLinks({ tx, onNavigate }: Props) {
  const links = [
    {
      page: "inventory-warehouses",
      icon: <Warehouse size={18} />,
      title: tx("Depo tanımları", "Warehouse definitions"),
      hint: tx("Stok, transfer ve raf konumları", "Stock, transfers and storage locations"),
    },
    {
      page: "address-definitions",
      icon: <MapPin size={18} />,
      title: tx("Adres tanımları", "Address definitions"),
      hint: tx("Cari adreslerindeki il ve ilçeler", "Provinces and districts in account addresses"),
    },
  ];
  return (
    <section className="op-def-related" aria-labelledby="op-def-related-title">
      <h2 id="op-def-related-title">{tx("Diğer tanımlar", "Other definitions")}</h2>
      <div className="op-def-related-cards">
        {links.map((link) => (
          <button
            key={link.page}
            type="button"
            className="op-def-related-card"
            onClick={() => onNavigate(link.page)}
          >
            <span className="op-def-related-icon" aria-hidden="true">{link.icon}</span>
            <span className="op-def-related-text">
              <b>{link.title}</b>
              <span>{link.hint}</span>
            </span>
            <ChevronRight size={16} className="op-def-related-chevron" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
