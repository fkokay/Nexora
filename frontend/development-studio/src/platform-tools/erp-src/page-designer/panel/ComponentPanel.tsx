import type { ReactNode } from "react";
import "./component-panel.css";

/** Tek tip bileşen paneli (§6.2): ad, ne gösterilsin, temel ayarlar, eylemler, kapalı "Görünüm". Sekme ve açılır pencere yok. */
export function ComponentPanel(props: {
  name: string; onRename: (name: string) => void;
  what: ReactNode; basics: ReactNode; actions: ReactNode; appearance: ReactNode;
  /** Parça başlıkları (isteğe bağlı): Liste paneli taslaktaki gibi "Ne listelensin?" der; null başlığı çizmez. */
  whatTitle?: string; basicsTitle?: string | null; children?: ReactNode;
  /** Eylemler parçasının başlığı (ör. Kayıt kartında "Ek eylemler"). */
  actionsTitle?: string;
  /** Ad bağlamalarda kullanılıyorsa panel başlığından değiştirilmez (ör. `{{suzgec.q}}`). */
  nameReadOnly?: boolean;
  /** Ad kutusunun erişilebilir etiketi (ör. Liste panelinde "Liste başlığı"). */
  nameLabel?: string;
  /** Adı olmayan bileşende ad kutusunda görünen tür adı (ör. "Metin", "Gösterge"). */
  namePlaceholder?: string;
  /** Ad bölümünün hemen altındaki satır (ör. ek alandaki bileşenin "Yeri" seçimi). */
  place?: ReactNode;
}) {
  return (
    <div className="cpanel">
      <div className="cpanel-head"><input aria-label={props.nameLabel ?? "Bileşen adı"} value={props.name} placeholder={props.name ? undefined : props.namePlaceholder} readOnly={props.nameReadOnly} onChange={(e) => props.onRename(e.target.value)} /></div>
      {props.place}
      <section className="cpanel-sec" data-part="what"><h4>{props.whatTitle ?? "Ne gösterilsin?"}</h4>{props.what}</section>
      <section className="cpanel-sec" data-part="basics">{props.basicsTitle !== null && <h4>{props.basicsTitle ?? "Temel ayarlar"}</h4>}{props.basics}</section>
      <section className="cpanel-sec" data-part="actions"><h4>{props.actionsTitle ?? "Eylemler"}</h4>{props.actions}</section>
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
