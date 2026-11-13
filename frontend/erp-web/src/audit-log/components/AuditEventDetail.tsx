import type { AuditEvent } from "../types";

export function AuditEventDetail({ item }: { item: AuditEvent }) {
  return (
    <aside className="audit-detail-pane">
      <header className="list-v2-detail-head">
        <div>
          <span className="list-v2-kind">DENETİM OLAYI</span>
          <h2>{item.action}</h2>
        </div>
      </header>
      <div className="list-v2-detail-meta">
        <span>{new Date(item.occurredAt).toLocaleString("tr-TR")}</span>
      </div>
      <dl className="list-v2-facts">
        <div>
          <dt>Kullanıcı</dt>
          <dd>{item.userDisplayName || "Sistem"}</dd>
        </div>
        <div>
          <dt>Kullanıcı kimliği</dt>
          <dd>{item.userId || "Sistem olayı"}</dd>
        </div>
        <div>
          <dt>Kaynak</dt>
          <dd>{item.resource || "Belirtilmemiş"}</dd>
        </div>
        <div>
          <dt>Olay numarası</dt>
          <dd>{item.id}</dd>
        </div>
      </dl>
      <p>Denetim kayıtları salt okunur ve firma kapsamındadır.</p>
    </aside>
  );
}
