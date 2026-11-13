import type { DocumentStatus } from "./DocumentSurface";
import "./document-page.css";

/** Liste hücrelerinde ve belge içinde kullanılan durum etiketi; ad ve ton `documentStatus.ts` içinden gelir. */
export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`doc-status is-${status.tone}`}>{status.label}</span>;
}
