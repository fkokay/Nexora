import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { authorizedFetch } from "../api";
import { Dialog } from "../ui/Dialog";
import {
  inviteErrorMessage,
  personRoleLabel,
  roleFromSelect,
  roleToSelect,
  sameEmail,
  studioRoleOptions,
  type Person,
} from "./peopleModel";

type Props = { token: string };
type Candidate = { id: string; email: string; displayName: string };
type ErrorBody = { error?: string; code?: string };

const generic = (status: number) => `İşlem tamamlanamadı (${status}).`;

async function readBody(response: Response): Promise<ErrorBody | undefined> {
  return ((await response.json().catch(() => undefined)) as ErrorBody | undefined) ?? undefined;
}

async function saveStudioRole(token: string, userId: string, studioRole: string | null): Promise<Person> {
  const response = await authorizedFetch(`/studio/people/${userId}/studio-role`, token, {
    method: "PUT",
    body: JSON.stringify({ studioRole }),
  });
  if (!response.ok) {
    const body = await readBody(response);
    throw new Error(response.status < 500 && body?.error ? body.error : generic(response.status));
  }
  return (await response.json()) as Person;
}

/** Kişiler ve roller: firmadaki kişilerin Studio rolleri ve yeni kişi daveti. */
export function PeoplePage({ token }: Props) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await authorizedFetch("/studio/people", token);
      if (!response.ok) throw new Error(response.status === 403 ? "Bu ekran yalnız firma yöneticisine açık." : generic(response.status));
      setPeople((await response.json()) as Person[]);
    } catch (cause) {
      setLoadError((cause as Error).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(person: Person, value: string) {
    setSavingId(person.userId);
    setError("");
    setNotice("");
    try {
      const updated = await saveStudioRole(token, person.userId, roleFromSelect(value));
      setPeople((items) => items?.map((item) => (item.userId === updated.userId ? updated : item)) ?? items);
      setNotice(`${updated.displayName}: ${personRoleLabel(updated)}.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSavingId("");
    }
  }

  return (
    <>
      <header className="ns-page-head st-page-head">
        <div>
          <h1>Kişiler ve roller</h1>
          <p>Studio'ya kim girebilir, ne yapabilir</p>
        </div>
        <div className="st-hero-actions">
          <button className="ns-btn" type="button" onClick={() => void load()}>
            <RefreshCw size={15} aria-hidden="true" />
            Yenile
          </button>
          <button className="ns-btn ns-btn-primary" type="button" onClick={() => setInviteOpen(true)} disabled={!people}>
            <Plus size={15} aria-hidden="true" />
            Kişi davet et
          </button>
        </div>
      </header>
      {error && (
        <div className="st-alert is-danger" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="st-alert is-success" role="status">
          {notice}
        </div>
      )}
      <section className="ns-card st-card" aria-label="Kişiler">
        {loadError ? (
          <div className="st-alert is-danger" role="alert">
            {loadError}
          </div>
        ) : !people ? (
          <div className="st-loading" role="status">
            Kişiler yükleniyor…
          </div>
        ) : people.length === 0 ? (
          <p className="st-card-note">Firmada henüz kişi yok.</p>
        ) : (
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th scope="col">Ad</th>
                  <th scope="col">E-posta</th>
                  <th scope="col">Studio rolü</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.userId}>
                    <td>
                      <b>{person.displayName}</b>
                    </td>
                    <td>{person.email}</td>
                    <td>
                      {person.effectiveRole === "Admin" ? (
                        <>
                          <span className="ns-badge is-accent">Yönetici</span>
                          <small className="ns-field-hint" style={{ display: "block" }}>
                            Yönetici rolü ERP'de, Erişim yönetimi ekranından değişir.
                          </small>
                        </>
                      ) : (
                        <label className="ns-field">
                          <span className="ns-sr-only">{person.displayName} için Studio rolü</span>
                          <select
                            value={roleToSelect(person.studioRole)}
                            disabled={!!savingId}
                            onChange={(event) => void changeRole(person, event.target.value)}
                          >
                            {studioRoleOptions.map((option) => (
                              <option key={option.label} value={roleToSelect(option.value)}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <small className="ns-field-hint">
                            {savingId === person.userId ? "Kaydediliyor…" : `Şu an: ${personRoleLabel(person)}`}
                          </small>
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="ns-card st-card" aria-labelledby="studio-roles-title">
        <header className="st-card-head">
          <div>
            <h2 id="studio-roles-title">Roller</h2>
          </div>
        </header>
        <ul className="st-card-note" style={{ margin: 0, paddingLeft: 0, listStyle: "none", lineHeight: 1.7 }}>
          <li>
            <b>Danışman:</b> ekran, kural ve menü tasarlar, yayınlar. Kod göremez.
          </li>
          <li>
            <b>Yazılımcı:</b> firma modülünü düzenler, sürüm hazırlar. Danışmanın yapabildiklerini de yapabilir.
          </li>
          <li>
            <b>Yönetici:</b> kişileri, bağlantıları ve modülleri yönetir.
          </li>
        </ul>
      </section>
      {inviteOpen && people && (
        <InviteDialog
          token={token}
          people={people}
          onClose={() => setInviteOpen(false)}
          onDone={(message, failed) => {
            setInviteOpen(false);
            setError(failed ? message : "");
            setNotice(failed ? "" : message);
            void load();
          }}
        />
      )}
    </>
  );
}

function InviteDialog({
  token,
  people,
  onClose,
  onDone,
}: {
  token: string;
  people: Person[];
  onClose: () => void;
  onDone: (message: string, failed: boolean) => void;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (people.some((person) => sameEmail(person.email, email))) {
      setError(inviteErrorMessage("membership.exists"));
      return;
    }
    setBusy(true);
    try {
      const response = await authorizedFetch(`/api/access-control/members/candidate?email=${encodeURIComponent(email.trim())}`, token);
      if (response.status === 404) throw new Error(inviteErrorMessage());
      if (response.status === 400) throw new Error("Geçerli bir e-posta adresi girin.");
      if (response.status === 429) throw new Error("Çok fazla deneme yapıldı. Biraz bekleyip yeniden deneyin.");
      if (!response.ok) throw new Error(generic(response.status));
      setCandidate((await response.json()) as Candidate);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!candidate) return;
    setBusy(true);
    setError("");
    try {
      const response = await authorizedFetch("/api/access-control/members", token, {
        method: "POST",
        body: JSON.stringify({ userId: candidate.id, role: "TenantUser" }),
      });
      if (!response.ok) {
        const body = await readBody(response);
        if (body?.code === "license.user_limit" || body?.code === "membership.exists" || response.status === 404)
          throw new Error(inviteErrorMessage(body?.code));
        // Bu ucun diğer hata metinleri İngilizcedir; kullanıcıya Türkçe genel metin gösterilir.
        throw new Error(generic(response.status));
      }
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
      return;
    }
    const studioRole = roleFromSelect(role);
    if (studioRole !== null) {
      try {
        await saveStudioRole(token, candidate.id, studioRole);
      } catch {
        onDone(`${candidate.displayName} firmaya eklendi ama Studio rolü kaydedilemedi. Rolü listeden yeniden seçin.`, true);
        return;
      }
    }
    onDone(`${candidate.displayName} firmaya eklendi.`, false);
  }

  return (
    <Dialog
      onClose={onClose}
      labelledBy="studio-invite-title"
      describedBy="studio-invite-desc"
      className="st-request-dialog"
      backdropClassName="st-request-backdrop"
      initialFocus={emailRef}
      dismissible={!busy}
    >
      <header className="st-dialog-head">
        <div>
          <h2 id="studio-invite-title">Kişi davet et</h2>
          <p id="studio-invite-desc">Nexora'da kayıtlı bir kişiyi firmaya ekleyin ve Studio rolünü seçin.</p>
        </div>
        <button type="button" className="st-icon-btn" aria-label="Kapat" onClick={onClose} disabled={busy}>
          <X size={18} />
        </button>
      </header>
      <form className="st-dialog-form" onSubmit={candidate ? add : find}>
        <div className="st-dialog-body">
          {error && (
            <div className="st-alert is-danger" role="alert">
              {error}
            </div>
          )}
          <label className="ns-field">
            <span className="ns-field-label">E-posta</span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              required
              maxLength={254}
              autoComplete="off"
              disabled={!!candidate || busy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ornek@firma.com"
            />
          </label>
          {candidate && (
            <>
              <p className="st-card-note">
                <b>{candidate.displayName}</b> · {candidate.email}
              </p>
              <label className="ns-field">
                <span className="ns-field-label">Studio rolü</span>
                <select value={role} onChange={(event) => setRole(event.target.value)} disabled={busy}>
                  {studioRoleOptions.map((option) => (
                    <option key={option.label} value={roleToSelect(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small className="ns-field-hint">Kişi firmaya ERP kullanıcısı olarak eklenir.</small>
              </label>
            </>
          )}
        </div>
        <footer className="ns-dialog-foot st-dialog-foot">
          <span className="st-dialog-scope">
            <ShieldCheck size={15} aria-hidden="true" />
            Lisans sınırı firmaya eklerken denetlenir
          </span>
          {candidate ? (
            <button type="button" className="ns-btn" onClick={() => setCandidate(null)} disabled={busy}>
              Başka e-posta
            </button>
          ) : (
            <button type="button" className="ns-btn" onClick={onClose} disabled={busy}>
              Vazgeç
            </button>
          )}
          <button className="ns-btn ns-btn-primary" disabled={busy}>
            {candidate ? <Plus size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
            {busy ? "Bekleyin…" : candidate ? "Firmaya ekle ve kaydet" : "Kişiyi bul"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
