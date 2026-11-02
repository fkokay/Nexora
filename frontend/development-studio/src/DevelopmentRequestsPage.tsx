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
        className="studio-demand-panel"
        id="requests"
        aria-labelledby="studio-demands-title"
      >
        <header className="studio-demand-heading">
          <div>
            <h2 id="studio-demands-title">Proje geliştirme talepleri</h2>
            <p>
              {requests.length} tenant/proje kapsamında {filtered.length} kayıt
              gösteriliyor
            </p>
          </div>
          <div className="studio-demand-controls">
            <label className="studio-demand-search">
              <Search size={17} />
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
                  <X size={15} />
                </button>
              )}
            </label>
            <label>
              <Filter size={17} />
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
            <label>
              <List size={17} />
              <select
                aria-label="Talep sıralaması"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="newest">En yeni</option>
                <option value="oldest">En eski</option>
              </select>
            </label>
            <div
              className="studio-demand-view"
              role="group"
              aria-label="Talep görünümü"
            >
              <button
                type="button"
                aria-label="Liste görünümü"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={20} />
              </button>
              <button
                type="button"
                aria-label="Kart görünümü"
                aria-pressed={view === "cards"}
                onClick={() => setView("cards")}
              >
                <LayoutGrid size={20} />
              </button>
            </div>
          </div>
        </header>
        <div className={`studio-demand-records studio-demand-records--${view}`}>
          {filtered.map((item) => {
            const project = projects.find(
              (project) => project.id === item.projectId,
            );
            return (
              <article className="studio-demand-record" key={item.id}>
                <div className="studio-demand-copy">
                  <span className="studio-demand-icon">
                    <FileText size={25} />
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </div>
                <div className="studio-demand-meta">
                  <div className="studio-demand-tags">
                    <span>
                      <Boxes size={14} />
                      {item.projectName || project?.name || "Genel talep"}
                    </span>
                    {project && (
                      <span title="Projenin varsayılan dalı">
                        <GitBranch size={14} />
                        {project.defaultBranch}
                      </span>
                    )}
                  </div>
                  <div className="studio-demand-status">
                    Durum:{" "}
                    <span data-status={item.status}>
                      {statuses[item.status] || item.status}
                    </span>
                  </div>
                </div>
                <div className="studio-demand-date">
                  <CalendarDays size={17} />
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("tr-TR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <div className="studio-demand-actions">
                  {item.canEdit && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onEdit(item)}
                      >
                        <Pencil size={16} />
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="studio-demand-delete"
                        disabled={busy}
                        onClick={() => onDelete(item)}
                        aria-label={`${item.title} talebini sil`}
                      >
                        <Trash2 size={16} />
                        Sil
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="studio-demand-more"
                    aria-label={`${item.title} talep detayını aç`}
                    onClick={() => setSelected(item)}
                  >
                    <MoreHorizontal size={19} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="studio-demand-empty">
            <ListTodo size={30} />
            <h3>
              {requests.length
                ? query
                  ? "Aramanızla eşleşen talep bulunamadı"
                  : "Bu duruma uygun talep bulunamadı"
                : "Henüz geliştirme talebi yok"}
            </h3>
            <p>
              {requests.length
                ? query
                  ? "Farklı bir ifade deneyin veya filtreleri temizleyin."
                  : "Durum filtresini değiştirerek diğer talepleri görebilirsiniz."
                : "Yeni bir ihtiyaç ekleyerek geliştirme akışını başlatın."}
            </p>
            {requests.length ? (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setStatus("all");
                  setQuery("");
                }}
              >
                Filtreleri temizle
              </button>
            ) : (
              <button type="button" className="primary" onClick={onCreate}>
                <Plus size={16} />
                Talep oluştur
              </button>
            )}
          </div>
        )}
      </section>
      {selected && (
        <dialog
          ref={detailRef}
          className="studio-demand-detail"
          aria-labelledby="studio-demand-detail-title"
          onCancel={() => setSelected(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const box = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < box.left ||
                event.clientX > box.right ||
                event.clientY < box.top ||
                event.clientY > box.bottom
              )
                setSelected(null);
            }
          }}
        >
          <header>
            <div>
              <small>GELİŞTİRME TALEBİ</small>
              <h2 id="studio-demand-detail-title">{selected.title}</h2>
            </div>
            <button
              type="button"
              autoFocus
              aria-label="Talep detayını kapat"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
          </header>
          <div className="studio-demand-detail-context">
            <span>{selected.projectName || "Genel talep"}</span>
            <b>{statuses[selected.status] || selected.status}</b>
          </div>
          <p>{selected.description}</p>
          <footer>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(null)}
            >
              Kapat
            </button>
            {selected.canEdit && (
              <button
                type="button"
                className="primary"
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
