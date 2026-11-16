import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, X } from "lucide-react";
import { authenticatedFetch } from "./authApi";

type Mode = "AdminsOnly" | "AllUsers" | "SelectedUsers";
type AccessUser = { userId: string; displayName: string; email: string; canView: boolean; canInsert: boolean; canUpdate: boolean; canDelete: boolean };
type AccessView = { pageCode: string; mode: Mode; allUsersCanInsert: boolean; allUsersCanUpdate: boolean; allUsersCanDelete: boolean; revision: number; users: AccessUser[] };
type Member = { id: string; email: string; displayName: string; role: string };
type Draft = { mode: Mode; insert: boolean; update: boolean; delete: boolean; users: AccessUser[] };
type Flag = "canView" | "canInsert" | "canUpdate" | "canDelete";

const modeLabels: [Mode, string][] = [["AdminsOnly", "Yöneticiler"], ["AllUsers", "Herkes"], ["SelectedUsers", "Seçili kişiler"]];
const flagColumns: [Flag, string][] = [["canView", "Gör"], ["canInsert", "Ekle"], ["canUpdate", "Gün."], ["canDelete", "Sil"]];
const conflictMessage = "Erişim başka bir yönetici tarafından değiştirildi; yeniden yükleniyor.";

const toDraft = (view: AccessView): Draft => ({
  mode: view.mode, insert: view.allUsersCanInsert, update: view.allUsersCanUpdate, delete: view.allUsersCanDelete,
  users: view.users.map((user) => ({ ...user })),
});
// Only the parts the server keeps for the chosen mode are compared, so switching modes and back is not a change.
const signature = (draft: Draft) => JSON.stringify({
  mode: draft.mode,
  all: draft.mode === "AllUsers" ? [draft.insert, draft.update, draft.delete] : [],
  users: draft.mode === "SelectedUsers"
    ? draft.users.map((u) => [u.userId, u.canView, u.canInsert, u.canUpdate, u.canDelete]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    : [],
});

async function call<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, token, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; detail?: string; title?: string } | null;
    const error = new Error(body?.error || body?.detail || body?.title || `İstek başarısız (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return await response.json() as T;
}

export default function CustomPageAccessPanel({ token, pageCode, hasQueries }: { token: string; pageCode: string; hasQueries: boolean }) {
  const [view, setView] = useState<AccessView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pick, setPick] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (keepMessage = false) => {
    setLoading(true);
    if (!keepMessage) { setError(""); setNotice(""); }
    try {
      const [access, list] = await Promise.all([
        call<AccessView>(`/api/custom-pages/${encodeURIComponent(pageCode)}/access`, token),
        call<Member[]>("/api/access-control/members", token),
      ]);
      setView(access); setDraft(toDraft(access)); setMembers(list); setPick("");
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [pageCode, token]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!view && !!draft && signature(draft) !== signature(toDraft(view));
  const available = useMemo(() => {
    const taken = new Set((draft?.users ?? []).map((user) => user.userId));
    return members.filter((member) => member.role !== "TenantAdmin" && !taken.has(member.id));
  }, [members, draft]);

  const patch = (changes: Partial<Draft>) => { setDraft((d) => d && { ...d, ...changes }); setNotice(""); };
  const setFlag = (userId: string, flag: Flag, value: boolean) => patch({
    users: draft!.users.map((user) => {
      if (user.userId !== userId) return user;
      const next = { ...user, [flag]: value };
      if (flag !== "canView" && value) next.canView = true;
      if (flag === "canView" && !value) { next.canInsert = false; next.canUpdate = false; next.canDelete = false; }
      return next;
    }),
  });
  const addUser = () => {
    const member = members.find((m) => m.id === pick);
    if (!member) return;
    patch({ users: [...draft!.users, { userId: member.id, displayName: member.displayName, email: member.email, canView: true, canInsert: false, canUpdate: false, canDelete: false }] });
    setPick("");
  };
  const setAll = (key: "insert" | "update" | "delete", value: boolean) => patch({ [key]: value } as Partial<Draft>);

  const save = async () => {
    if (!view || !draft) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await call<AccessView>(`/api/custom-pages/${encodeURIComponent(pageCode)}/access`, token, {
        method: "PUT",
        body: JSON.stringify({
          mode: draft.mode,
          allUsersCanInsert: draft.mode === "AllUsers" && draft.insert,
          allUsersCanUpdate: draft.mode === "AllUsers" && draft.update,
          allUsersCanDelete: draft.mode === "AllUsers" && draft.delete,
          users: draft.mode === "SelectedUsers" ? draft.users.map(({ userId, canView, canInsert, canUpdate, canDelete }) => ({ userId, canView, canInsert, canUpdate, canDelete })) : [],
          expectedRevision: view.revision,
        }),
      });
      setView(updated); setDraft(toDraft(updated)); setNotice("Erişim kaydedildi.");
    } catch (e) {
      if ((e as { status?: number }).status === 409) { setError(conflictMessage); await load(true); }
      else setError((e as Error).message);
    } finally { setSaving(false); }
  };

  return <section className="pd-access" aria-label="Erişim">
    <div className="pd-access-head"><Lock size={13}/><b>Erişim</b><span className="pd-access-badge">Hemen geçerli</span></div>
    {loading && !draft ? <p className="pd-access-note" role="status">Erişim bilgisi yükleniyor…</p> : draft && <>
      <div className="pd-segment" role="radiogroup" aria-label="Erişim modu">
        {modeLabels.map(([value, label]) => <button type="button" role="radio" aria-checked={draft.mode === value} key={value} className={draft.mode === value ? "active" : ""} onClick={() => patch({ mode: value })}>{label}</button>)}
      </div>
      <p className="pd-access-note">Yöneticiler her zaman tüm işlemleri yapabilir.</p>
      {hasQueries && <div className="pd-access-warning" role="alert">Bu sayfa SQL sorgusu içeriyor. Herkese açmadan önce erişimi gözden geçirin.</div>}
      {draft.mode === "AllUsers" && <div className="pd-access-all">
        <label><input type="checkbox" checked disabled/>Gör ✓ (kilitli)</label>
        <label><input type="checkbox" checked={draft.insert} onChange={(event) => setAll("insert", event.target.checked)}/>Ekle</label>
        <label><input type="checkbox" checked={draft.update} onChange={(event) => setAll("update", event.target.checked)}/>Gün.</label>
        <label><input type="checkbox" checked={draft.delete} onChange={(event) => setAll("delete", event.target.checked)}/>Sil</label>
      </div>}
      {draft.mode === "SelectedUsers" && <>
        <table className="pd-access-table">
          <thead><tr><th scope="col">Kullanıcı</th>{flagColumns.map(([flag, label]) => <th scope="col" key={flag}>{label}</th>)}<th scope="col" aria-label="Kaldır"></th></tr></thead>
          <tbody>
            {draft.users.length === 0 && <tr><td colSpan={6} className="pd-access-empty">Henüz kimse eklenmedi.</td></tr>}
            {draft.users.map((user) => <tr key={user.userId}>
              <th scope="row" title={user.email}>{user.displayName || user.email}</th>
              {flagColumns.map(([flag, label]) => <td key={flag}><input type="checkbox" aria-label={`${user.displayName || user.email} · ${label}`} checked={user[flag]} onChange={(event) => setFlag(user.userId, flag, event.target.checked)}/></td>)}
              <td><button type="button" className="pd-access-remove" aria-label={`${user.displayName || user.email} kullanıcısını kaldır`} onClick={() => patch({ users: draft.users.filter((u) => u.userId !== user.userId) })}><X size={13}/></button></td>
            </tr>)}
          </tbody>
        </table>
        <div className="pd-access-add">
          <select aria-label="Kullanıcı seç" value={pick} onChange={(event) => setPick(event.target.value)}>
            <option value="">{available.length ? "Kullanıcı seçin" : "Eklenecek kullanıcı yok"}</option>
            {available.map((member) => <option key={member.id} value={member.id}>{member.displayName || member.email}</option>)}
          </select>
          <button type="button" className="pd-button small" disabled={!pick} onClick={addUser}>Ekle</button>
        </div>
      </>}
      {error && <div className="pd-message error" role="alert"><span>{error}</span><button type="button" aria-label="Kapat" onClick={() => setError("")}><X size={14}/></button></div>}
      {notice && !error && <div className="pd-message success" role="status"><span>{notice}</span><button type="button" aria-label="Kapat" onClick={() => setNotice("")}><X size={14}/></button></div>}
      <button type="button" className="pd-button small primary pd-access-save" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Kaydediliyor…" : "Erişimi kaydet"}</button>
    </>}
    {!draft && !loading && error && <div className="pd-message error" role="alert"><span>{error}</span></div>}
  </section>;
}
