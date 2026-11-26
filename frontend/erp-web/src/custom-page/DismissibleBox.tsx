import { useState, type ReactNode } from "react";
import { X } from "lucide-react";

/** `dismissible` kutu: sağ üstteki "Kapat" düğmesi kutuyu bu çizim boyunca gizler (durum saklanmaz). */
export function DismissibleBox({ dismissible, children }: { dismissible: boolean; children: (close: ReactNode) => ReactNode }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  const close = dismissible
    ? <button type="button" className="tenant-page-dismiss" aria-label="Kapat" onClick={() => setClosed(true)}><X size={14} aria-hidden="true" /></button>
    : null;
  return <>{children(close)}</>;
}
