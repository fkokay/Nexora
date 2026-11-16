import type { ReactNode } from "react";
import "./list-page-v2.css";

export type StatusTagTone = "ok" | "warn" | "bad" | "off" | "info";

/** Rounded status label in a list cell or detail header (Yeterli, Minimum altı, Pasif…). See README.md. */
export function StatusTag({ tone, children }: { tone: StatusTagTone; children: ReactNode }) {
  return <span className={`nx-status-tag is-${tone}`}>{children}</span>;
}
