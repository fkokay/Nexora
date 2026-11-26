import type { ReactNode } from "react";

/** Ortak "Görünüm" gövdesi (alt proje 5a, Karar 8): bileşene özgü ayarlar başta, sonra "Ne zaman görünsün?" ve "Mobilde gizle". */
export function AppearanceSection({ extra, visibility, hideOnMobile, onHideOnMobile, disabled }: {
  extra?: ReactNode; visibility?: ReactNode; hideOnMobile: boolean; onHideOnMobile: (hide: boolean) => void; disabled?: boolean;
}) {
  return <>
    {extra}
    <div className="cpanel-q">Ne zaman görünsün?</div>
    {visibility ?? <div className="cpanel-seg"><button type="button" className="on" disabled>Her zaman</button></div>}
    <label className="cpanel-row">Mobilde gizle<input type="checkbox" role="switch" checked={hideOnMobile} disabled={disabled}
      onChange={(event) => onHideOnMobile(event.target.checked)}/></label>
  </>;
}
