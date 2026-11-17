import type { ReactNode } from "react";
import { ActionBarSlot, useSlotBreadcrumb } from "../action-bar/ActionBarSlot";
import "./list-page-v2.css";

type Props = {
  title: string;
  /** Shown as the title's tooltip; the header itself stays one line. */
  description?: string;
  /** Record count shown next to the title; omit or pass null while unknown. */
  count?: number | null;
  countLabel?: string;
  className?: string;
  /** Page actions (buttons, export menus). The primary action goes last. */
  children?: ReactNode;
};

/** Title row of a list page: title, record count and page actions. See README.md. */
export function ListPageHeader({
  title,
  description,
  count = null,
  countLabel = "kayıt",
  className,
  children,
}: Props) {
  const { slotRef, breadcrumb } = useSlotBreadcrumb();
  return (
    <>
    <div className={`page-heading list-v2-heading${className ? ` ${className}` : ""}`}>
      <div className={`list-v2-title${breadcrumb ? " list-v2-title--crumb" : ""}`}>
        {breadcrumb}
        <h1 title={description}>{title}</h1>
        {count != null && (
          <span className="list-v2-count">
            <span>{count.toLocaleString("tr-TR")}</span> <span>{countLabel}</span>
          </span>
        )}
      </div>
      <div className="heading-actions">
        {/* AdvancedDataGrid portals its XLSX/CSV buttons here when its tools live in this page's toolbar. */}
        <span className="list-v2-export-slot" />
        {children}
      </div>
    </div>
    <ActionBarSlot slotRef={slotRef} />
    </>
  );
}
