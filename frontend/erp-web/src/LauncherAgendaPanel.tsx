import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { api } from "./erpApi";
import { confirmLocalized } from "./locale";

type AgendaItem = {
  id: string;
  title: string;
  startsAt: string;
  notes: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const UPCOMING_DAYS = 7;

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toLocalInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextFullHour() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

function sortItems(items: AgendaItem[]) {
  return [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.createdAt.localeCompare(b.createdAt));
}

export function LauncherAgendaPanel({ token, english, selected, style }: {
  token: string;
  english: boolean;
  selected: boolean;
  style?: CSSProperties;
}) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInputValue(nextFullHour()));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const locale = english ? "en-US" : "tr-TR";

  useEffect(() => {
    let active = true;
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + UPCOMING_DAYS);
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    setLoading(true);
    api<AgendaItem[]>(`/api/agenda/?${query}`, token)
      .then((rows) => { if (active) { setItems(sortItems(rows)); setLoadError(""); } })
      .catch((error: Error) => { if (active) { setItems([]); setLoadError(error.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!dialogOpen) return;
    titleInputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setDialogOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [dialogOpen, saving]);

  function openDialog() {
    setTitle("");
    setNotes("");
    setStartsAt(toLocalInputValue(nextFullHour()));
    setFormError("");
    setDialogOpen(true);
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const start = new Date(startsAt);
    if (!trimmedTitle) { setFormError(english ? "Title is required." : "Başlık zorunludur."); return; }
    if (!startsAt || Number.isNaN(start.getTime())) { setFormError(english ? "Date and time are required." : "Tarih ve saat zorunludur."); return; }
    setSaving(true);
    setFormError("");
    try {
      const created = await api<AgendaItem>("/api/agenda/", token, {
        method: "POST",
        body: JSON.stringify({ title: trimmedTitle, startsAt: start.toISOString(), notes: notes.trim() || null }),
      });
      setItems((previous) => sortItems([...previous, created]));
      setDialogOpen(false);
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompleted(item: AgendaItem) {
    setBusyItemId(item.id);
    try {
      const updated = await api<AgendaItem>(`/api/agenda/${item.id}/completion`, token, {
        method: "PATCH",
        body: JSON.stringify({ isCompleted: !item.isCompleted }),
      });
      setItems((previous) => previous.map((row) => (row.id === updated.id ? updated : row)));
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setBusyItemId(null);
    }
  }

  async function deleteItem(item: AgendaItem) {
    if (!confirmLocalized("Bu ajanda kaydı silinsin mi?")) return;
    setBusyItemId(item.id);
    try {
      await api<void>(`/api/agenda/${item.id}`, token, { method: "DELETE" });
      setItems((previous) => previous.filter((row) => row.id !== item.id));
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setBusyItemId(null);
    }
  }

  function formatWhen(value: string) {
    const date = new Date(value);
    const today = startOfToday();
    const dayDiff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - today.getTime()) / 86_400_000);
    const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    if (dayDiff === 0) return `${english ? "Today" : "Bugün"} ${time}`;
    if (dayDiff === 1) return `${english ? "Tomorrow" : "Yarın"} ${time}`;
    return `${date.toLocaleDateString(locale, { day: "numeric", month: "short", weekday: "short" })} ${time}`;
  }

  const todayLabel = new Date().toLocaleDateString(locale, { day: "numeric", month: "short" });
  const addLabel = english ? "New agenda entry" : "Yeni ajanda kaydı";

  return (
    <section className="launcher-panel launcher-agenda" data-dashboard-widget="agenda" data-selected={selected} style={style}>
      <header>
        <span><CalendarDays size={20} />{english ? "Agenda" : "Ajanda"}</span>
        <span className="launcher-agenda-actions">
          <span className="panel-date">{todayLabel}</span>
          <button type="button" className="launcher-agenda-add" aria-label={addLabel} title={addLabel} onClick={openDialog}>
            <Plus size={17} />
          </button>
        </span>
      </header>
      {loadError && <p className="launcher-agenda-error" role="alert">{loadError}</p>}
      {loading
        ? <div className="launcher-empty-state">{english ? "Loading agenda…" : "Ajanda yükleniyor…"}</div>
        : items.length === 0
          ? <div className="launcher-empty-state">
              {english ? "No agenda entries for the next 7 days." : "Önümüzdeki 7 gün için ajanda kaydı yok."}
              <button type="button" className="launcher-agenda-empty-add" onClick={openDialog}><Plus size={14} />{english ? "Add entry" : "Kayıt ekle"}</button>
            </div>
          : <ul className="launcher-agenda-list">
              {items.map((item) => (
                <li key={item.id} className={item.isCompleted ? "is-completed" : undefined}>
                  <button
                    type="button"
                    className="launcher-agenda-check"
                    aria-pressed={item.isCompleted}
                    aria-label={item.isCompleted
                      ? (english ? `Mark "${item.title}" as not done` : `"${item.title}" tamamlanmadı olarak işaretle`)
                      : (english ? `Mark "${item.title}" as done` : `"${item.title}" tamamlandı olarak işaretle`)}
                    disabled={busyItemId === item.id}
                    onClick={() => void toggleCompleted(item)}
                  >
                    {item.isCompleted && <Check size={12} strokeWidth={3} />}
                  </button>
                  <span className="launcher-agenda-text">
                    <b title={item.notes || undefined}>{item.title}</b>
                    <small>{formatWhen(item.startsAt)}</small>
                  </span>
                  <button
                    type="button"
                    className="launcher-agenda-delete"
                    aria-label={english ? `Delete "${item.title}"` : `"${item.title}" kaydını sil`}
                    disabled={busyItemId === item.id}
                    onClick={() => void deleteItem(item)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>}
      {dialogOpen && createPortal(
        <div className="launcher-agenda-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDialogOpen(false); }}>
          <form className="launcher-agenda-dialog" role="dialog" aria-modal="true" aria-labelledby="launcher-agenda-dialog-title" onSubmit={(event) => void createItem(event)}>
            <header>
              <h2 id="launcher-agenda-dialog-title"><CalendarDays size={18} />{addLabel}</h2>
              <button type="button" className="launcher-agenda-close" aria-label={english ? "Close" : "Kapat"} disabled={saving} onClick={() => setDialogOpen(false)}><X size={17} /></button>
            </header>
            <label>
              <span>{english ? "Title" : "Başlık"}</span>
              <input ref={titleInputRef} value={title} maxLength={160} required onChange={(event) => setTitle(event.target.value)} placeholder={english ? "e.g. Call the supplier" : "Örn. Tedarikçiyi ara"} />
            </label>
            <label>
              <span>{english ? "Date and time" : "Tarih ve saat"}</span>
              <input type="datetime-local" value={startsAt} required onChange={(event) => setStartsAt(event.target.value)} />
            </label>
            <label>
              <span>{english ? "Note (optional)" : "Not (isteğe bağlı)"}</span>
              <textarea value={notes} maxLength={1000} rows={3} onChange={(event) => setNotes(event.target.value)} />
            </label>
            {formError && <p className="launcher-agenda-error" role="alert">{formError}</p>}
            <footer>
              <button type="button" className="launcher-agenda-secondary" disabled={saving} onClick={() => setDialogOpen(false)}>{english ? "Cancel" : "Vazgeç"}</button>
              <button type="submit" className="launcher-agenda-primary" disabled={saving}>
                {saving && <LoaderCircle size={15} className="launcher-agenda-spin" />}
                {english ? "Save" : "Kaydet"}
              </button>
            </footer>
          </form>
        </div>,
        document.body,
      )}
    </section>
  );
}
