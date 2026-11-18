import { AlertTriangle, Info, X } from "lucide-react";
import type { Locale } from "../WorkspaceComponents";
import { isTabLimitNotice } from "../useWorkspaceTabs";

/**
 * The shell's notice (e.g. the tab-limit warning) as a floating toast under the top bar, top right: it stays in view
 * however far the page is scrolled, where the old in-page box at the top of the content could be out of sight.
 */
export function ShellNoticeToast({ notice, locale, onDismiss }: { notice: string; locale: Locale; onDismiss: () => void }) {
  if (!notice) return null;
  const tabLimit = isTabLimitNotice(notice);
  const Icon = tabLimit ? AlertTriangle : Info;
  return (
    <div className={`nx-shell-toast${tabLimit ? " is-warn" : ""}`} role="status" aria-live="polite">
      <Icon size={17} className="nx-shell-toast-icon" aria-hidden="true" />
      <div className="nx-shell-toast-text">
        {tabLimit && <b>{locale === "en" ? "Tab limit reached" : "Sekme sınırına ulaşıldı"}</b>}
        <span>{notice}</span>
      </div>
      <button type="button" className="nx-shell-toast-close" aria-label={locale === "en" ? "Close" : "Kapat"} onClick={onDismiss}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
