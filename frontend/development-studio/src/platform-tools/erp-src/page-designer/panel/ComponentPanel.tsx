import type { ReactNode } from "react";
import "./component-panel.css";

/** Tek tip bileşen paneli (§6.2): ad, ne gösterilsin, temel ayarlar, eylemler, kapalı "Görünüm". Sekme ve açılır pencere yok. */
export function ComponentPanel(props: {
  name: string; onRename: (name: string) => void;
  what: ReactNode; basics: ReactNode; actions: ReactNode; appearance: ReactNode;
  /** Parça başlıkları (isteğe bağlı): Liste paneli taslaktaki gibi "Ne listelensin?" der; null başlığı çizmez. */
  whatTitle?: string; basicsTitle?: string | null; children?: ReactNode;
}) {
  return (
    <div className="cpanel">
      <div className="cpanel-head"><input aria-label="Bileşen adı" value={props.name} onChange={(e) => props.onRename(e.target.value)} /></div>
      <section className="cpanel-sec" data-part="what"><h4>{props.whatTitle ?? "Ne gösterilsin?"}</h4>{props.what}</section>
      <section className="cpanel-sec" data-part="basics">{props.basicsTitle !== null && <h4>{props.basicsTitle ?? "Temel ayarlar"}</h4>}{props.basics}</section>
      <section className="cpanel-sec" data-part="actions"><h4>Eylemler</h4>{props.actions}</section>
      <section className="cpanel-sec" data-part="appearance">
        <details><summary>Görünüm</summary><div className="cpanel-body">{props.appearance}</div></details>
      </section>
      {props.children}
    </div>
  );
}

export function ProvidedByDeveloper({ children }: { children: ReactNode }) {
  return <div className="cpanel-dev">Yazılımcının hazırladığı · {children}</div>;
}

/** Panelin karşılamadığı özellikleri salt okunur listeler; kayıtta olduğu gibi korunurlar (§5.2). */
export function LegacySettings({ props, known }: { props: Record<string, unknown>; known: Set<string> }) {
  const extra = Object.entries(props).filter(([key]) => !known.has(key));
  if (extra.length === 0) return null;
  return (
    <div className="cpanel-legacy">
      <h4>Eski ayarlar (salt okunur)</h4>
      <dl>{extra.map(([key, value]) => (
        <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>
      ))}</dl>
    </div>
  );
}
