import type { ReactNode } from "react";
import "./list-page-v2.css";

type Props = {
  /** Keyboard hints on the left ("↑↓ gez · Enter aç"). */
  hints?: ReactNode;
  /** Selection, totals or ListPagination on the right. */
  children?: ReactNode;
};

/** Bottom line of a list area: hints on the left, selection / totals / pagination on the right. See README.md. */
export function ListFooter({ hints, children }: Props) {
  return (
    <div className="nx-list-footer">
      <div className="nx-list-footer-hints">{hints}</div>
      <div className="nx-list-footer-end">{children}</div>
    </div>
  );
}
