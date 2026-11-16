import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Filter,
  GitBranch,
  LayoutGrid,
  List,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import "./development-requests.css";

type Request = {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  canEdit: boolean;
};
type Project = { id: string; name: string; defaultBranch: string };
type Props = {
  requests: Request[];
  projects: Project[];
  busy: boolean;
  onCreate: () => void;
  onEdit: (request: Request) => void;
  onDelete: (request: Request) => void;
};
const statuses: Record<string, string> = {
  Submitted: "Alındı",
  InProgress: "Devam ediyor",
  Completed: "Tamamlandı",
  Rejected: "Reddedildi",
  Cancelled: "İptal edildi",
  Planned: "Planlandı",
  InReview: "İncelemede",
  Approved: "Onaylandı",
};
const statusTones: Record<string, string> = {
  Completed: "is-success",
  Approved: "is-success",
  InProgress: "is-info",
  Submitted: "is-warning",
  Planned: "is-warning",
  InReview: "is-warning",
  Rejected: "is-danger",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`ns-badge ${statusTones[status] ?? ""}`.trim()}
      data-status={status}
    >
      {statuses[status] || status}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DevelopmentRequestsPage({
  requests,
  projects,
  busy,
  onCreate,
  onEdit,
  onDelete,
}: Props) {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"list" | "cards">("list");
  const [selected, setSelected] = useState<Request | null>(null);
  const detailRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // React unmounts the <dialog>, so the browser cannot restore focus itself.
  function closeDetail() {
    setSelected(null);
    const opener = openerRef.current;
    openerRef.current = null;
    requestAnimationFrame(() => {
      if (opener && document.contains(opener)) opener.focus();
    });
  }
  useEffect(() => {
    if (selected && detailRef.current && !detailRef.current.open)
      detailRef.current.showModal();
  }, [selected]);
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filtered = requests
    .filter((item) => {
      const matchesStatus = status === "all" || item.status === status;
      const searchableText =
        `${item.title} ${item.description}`.toLocaleLowerCase("tr-TR");
      return (
        matchesStatus &&
        (!normalizedQuery || searchableText.includes(normalizedQuery))
      );
    })
    .sort((a, b) => {
      const result =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return (sort === "newest" ? result : -result) || a.id.localeCompare(b.id);
    });
  const summary = [
    {
      label: "Toplam Talep",
      count: requests.length,
      hint: "Tüm geliştirme talepleri",
      icon: ListTodo,
      tone: "blue",
    },
    {
      label: "Devam Eden",
      count: requests.filter((item) => item.status === "InProgress").length,
      hint: "Aktif geliştirmeler",
      icon: Play,
      tone: "green",
    },
    {
      label: "Tamamlanan",
      count: requests.filter((item) => item.status === "Completed").length,
      hint: "Tamamlanmış talepler",
      icon: CheckCircle2,
      tone: "violet",
    },
    {
      label: "Bekleyen",
      count: requests.filter((item) =>
        ["Submitted", "Planned", "InReview"].includes(item.status),
      ).length,
      hint: "İşlem veya inceleme bekleyen",
      icon: Clock3,
      tone: "amber",
    },
  ];

  function renderProject(item: Request) {
    const project = projects.find((project) => project.id === item.projectId);
    return (
      <div className="dr-project">
        <span>
          <Boxes size={13} />
          {item.projectName || project?.name || "Genel talep"}
        </span>
        {project && (
          <span className="ns-mono" title="Projenin varsayılan dalı">
            <GitBranch size={13} />
            {project.defaultBranch}
          </span>
        )}
      </div>
    );
  }

  function renderActions(item: Request) {
    return (
      <div className="dr-actions">
        {item.canEdit && (
          <>
            <button
              type="button"
              className="ns-btn ns-btn-sm"
              disabled={busy}
              onClick={() => onEdit(item)}
            >
              <Pencil size={14} />
              Düzenle
            </button>
            <button
              type="button"
              className="ns-btn ns-btn-sm dr-delete"
              disabled={busy}
              onClick={() => onDelete(item)}
              aria-label={`${item.title} talebini sil`}
            >
              <Trash2 size={14} />
              Sil
            </button>
          </>
        )}
        <button
          type="button"
          className="ns-btn ns-btn-sm ns-btn-ghost dr-more"
          aria-label={`${item.title} talep detayını aç`}
          onClick={(event) => {
            openerRef.current = event.currentTarget;
            setSelected(item);
          }}
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
    );
  }

  return (
    <>
      <section className="studio-metrics" aria-label="Geliştirme talebi özeti">
        {summary.map(({ label, count, hint, icon: Icon, tone }) => (
          <article className="studio-metric-card" key={label}>
            <span className={`studio-metric-icon ${tone}`}>
              <Icon size={24} />
            </span>
            <div>
              <small>{label}</small>
              <b>{count}</b>
              <span>{hint}</span>
            </div>
          </article>
        ))}
      </section>
      <section
        className="ns-card dr-panel"
        id="requests"
        aria-labelledby="studio-demands-title"
      >
        <header className="dr-head">
          <div>
            <h2 id="studio-demands-title">Proje geliştirme talepleri</h2>
            <p>
              {requests.length} talepten {filtered.length} kayıt gösteriliyor
            </p>
          </div>
          <div className="dr-controls">
            <label className="dr-control dr-search">
              <Search size={15} />
              <input
                type="search"
                aria-label="Geliştirme taleplerinde ara"
                placeholder="Başlık veya açıklamada ara…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Aramayı temizle"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="dr-control">
              <Filter size={15} />
              <select
                aria-label="Talep durumuna göre filtrele"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">Tüm durumlar</option>
                {Array.from(new Set(requests.map((item) => item.status)))
                  .sort()
                  .map((value) => (
                    <option key={value} value={value}>
                      {statuses[value] || value}
                    </option>
                  ))}
              </select>
            </label>
            <label className="dr-control">
              <List size={15} />
              <select
                aria-label="Talep sıralaması"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">En yeni</option>
                <option value="oldest">En eski</option>
              </select>
            </label>
            <div className="dr-view" role="group" aria-label="Talep görünümü">
              <button
                type="button"
                aria-label="Liste görünümü"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={17} />
              </button>
              <button
                type="button"
                aria-label="Kart görünümü"
                aria-pressed={view === "cards"}
                onClick={() => setView("cards")}
              >
                <LayoutGrid size={17} />
              </button>
            </div>
          </div>
        </header>
        {filtered.length > 0 && view === "list" && (
          <div className="ns-table-wrap dr-table-wrap">
            <table className="ns-table dr-table">
              <thead>
                <tr>
                  <th scope="col">Talep</th>
                  <th scope="col">Proje</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Tarih</th>
                  <th scope="col">
                    <span className="ns-sr-only">İşlemler</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td className="dr-title-cell">
                      <b>{item.title}</b>
                      <p>{item.description}</p>
                    </td>
                    <td>{renderProject(item)}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="dr-date">
                      <time dateTime={item.createdAt}>
                        {formatDate(item.createdAt)}
                      </time>
                    </td>
                    <td>{renderActions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && view === "cards" && (
          <div className="dr-cards">
            {filtered.map((item) => (
              <article className="dr-card" key={item.id}>
                <div className="dr-card-top">
                  <span className="dr-card-icon" aria-hidden="true">
                    <FileText size={18} />
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                {renderProject(item)}
                <footer>
                  <span className="dr-date">
                    <CalendarDays size={14} />
                    <time dateTime={item.createdAt}>
                      {formatDate(item.createdAt)}
                    </time>
                  </span>
                  {renderActions(item)}
                </footer>
              </article>
            ))}
          </div>
        )}
        {filtered.length === 0 && (
          <div className="ns-empty dr-empty">
            <span className="dr-empty-icon" aria-hidden="true">
              <ListTodo size={22} />
            </span>
            <b>
              {requests.length
                ? query
                  ? "Aramanızla eşleşen talep bulunamadı"
                  : "Bu duruma uygun talep bulunamadı"
                : "Henüz geliştirme talebi yok"}
            </b>
            <span>
              {requests.length
                ? query
                  ? "Farklı bir ifade deneyin veya filtreleri temizleyin."
                  : "Durum filtresini değiştirerek diğer talepleri görebilirsiniz."
                : "Yeni bir ihtiyaç ekleyerek geliştirme akışını başlatın."}
            </span>
            {requests.length ? (
              <button
                type="button"
                className="ns-btn ns-btn-sm"
                onClick={() => {
                  setStatus("all");
                  setQuery("");
                }}
              >
                Filtreleri temizle
              </button>
            ) : (
              <button
                type="button"
                className="ns-btn ns-btn-sm ns-btn-primary"
                onClick={onCreate}
              >
                <Plus size={15} />
                Talep oluştur
              </button>
            )}
          </div>
        )}
      </section>
      {selected && (
        <dialog
          ref={detailRef}
          className="dr-detail"
          aria-labelledby="studio-demand-detail-title"
          onCancel={closeDetail}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const box = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < box.left ||
                event.clientX > box.right ||
                event.clientY < box.top ||
                event.clientY > box.bottom
              )
                closeDetail();
            }
          }}
        >
          <header className="ns-dialog-head">
            <div>
              <span className="ns-eyebrow">Geliştirme talebi</span>
              <h2 id="studio-demand-detail-title">{selected.title}</h2>
            </div>
            <button
              type="button"
              className="ns-btn ns-btn-sm ns-btn-ghost"
              autoFocus
              aria-label="Talep detayını kapat"
              onClick={closeDetail}
            >
              <X size={18} />
            </button>
          </header>
          <div className="ns-dialog-body">
            <dl className="ns-confirm-facts">
              <div>
                <dt>Durum</dt>
                <dd>
                  <StatusBadge status={selected.status} />
                </dd>
              </div>
              <div>
                <dt>Proje</dt>
                <dd>{selected.projectName || "Genel talep"}</dd>
              </div>
              <div>
                <dt>Oluşturulma</dt>
                <dd>
                  <time dateTime={selected.createdAt}>
                    {formatDate(selected.createdAt)}
                  </time>
                </dd>
              </div>
            </dl>
            <div className="dr-detail-copy">
              <h3>Açıklama</h3>
              <p>{selected.description}</p>
            </div>
          </div>
          <footer className="ns-dialog-foot">
            <button
              type="button"
              className="ns-btn"
              onClick={closeDetail}
            >
              Kapat
            </button>
            {selected.canEdit && (
              <button
                type="button"
                className="ns-btn ns-btn-primary"
                onClick={() => {
                  setSelected(null);
                  onEdit(selected);
                }}
              >
                <Pencil size={15} />
                Talebi düzenle
              </button>
            )}
          </footer>
        </dialog>
      )}
    </>
  );
}
