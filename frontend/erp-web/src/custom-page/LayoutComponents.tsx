import { Children, type CSSProperties, type ReactNode } from "react";

/** Form kartı — taslak `.card` + `.fg3`: başlık ve girişlerin 1/2/3 sütunlu ızgarası. */
export function FormCard({ title, columns, children, style }: { title: string; columns: 1 | 2 | 3; children: ReactNode; style: CSSProperties }) {
  return <section className="tenant-page-block tenant-page-form-card" style={style}>
    {title && <h3>{title}</h3>}
    <div className={`tenant-page-form-card-grid is-cols-${columns}`}>
      {Children.map(children, (child) => child == null || child === false ? null : <div className="tenant-page-form-card-cell">{child}</div>)}
    </div>
  </section>;
}
