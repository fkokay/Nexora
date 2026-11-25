import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronRight, FolderKanban, Inbox, LayoutList, Plus, ShieldCheck } from "lucide-react";
import { authorizedFetch } from "../api";
import type { Person } from "../people/peopleModel";
import { loadModuleDeployments, PUBLICATIONS_TAKE, type Publications } from "../publications/publicationsModel";
import { roleLabel, type StudioMenuRole } from "../shell/studioNav";
import {
  adminCards,
  consultantCards,
  consultantShortcuts,
  developerCards,
  lastProductionAt,
  publishedThisMonth,
  recentScreens,
  withStatus,
  type CardStatus,
  type HomeCard,
  type HomeRequest,
} from "./homeCards";
import "./home.css";

export type HomeRequestItem = HomeRequest & {
  id: string;
  title: string;
  createdAt: string;
  projectName: string | null;
};

type Props = {
  token: string;
  role: StudioMenuRole;
  tenantName: string;
  userName: string;
  requests: HomeRequestItem[];
  requestsStatus: CardStatus;
  onNewRequest: () => void;
};

type Source<T> = { status: CardStatus; data: T | null };

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await authorizedFetch(url, token);
  if (!response.ok) throw new Error(`İstek başarısız (${response.status}).`);
  return (await response.json()) as T;
}

/** Bir veri kaynağını yalnız `enabled` iken ve diğerlerinden bağımsız yükler. */
function useSource<T>(enabled: boolean, key: string, load: () => Promise<T>): Source<T> {
  const [state, setState] = useState<Source<T> & { key: string }>({ key: "", status: "loading", data: null });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setState({ key, status: "loading", data: null });
    load()
      .then((data) => current && setState({ key, status: "ready", data }))
      .catch(() => current && setState({ key, status: "error", data: null }));
    return () => {
      current = false;
    };
    // `load` her çizimde yenidir; kaynak yalnız anahtar değişince yeniden okunur.
  }, [enabled, key]);
  return state.key === key ? state : { status: "loading", data: null };
}

const stageLabels: Record<HomeRequest["stage"], string> = { New: "Yeni", Staging: "Deneme ortamında", Production: "Yayında" };
const stageTones: Record<HomeRequest["stage"], string> = { New: "", Staging: "is-info", Production: "is-success" };

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(value));

function Cards({ cards, label }: { cards: HomeCard[]; label: string }) {
  return (
    <section className="st-home-cards" aria-label={label}>
      {cards.map((card) => {
        const content = (
          <>
            <h3>{card.title}</h3>
            <b>{card.value}</b>
            <small>{card.detail}</small>
          </>
        );
        const status = card.detail === "Yüklenemedi" ? "error" : undefined;
        return card.href ? (
          <a key={card.id} className="st-home-card" href={card.href} data-status={status}>
            {content}
          </a>
        ) : (
          <div key={card.id} className="st-home-card" data-status={status}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

function Panel({ id, title, action, children }: { id: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ns-card st-card" aria-labelledby={id}>
      <header className="st-card-head">
        <div>
          <h2 id={id}>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Etkin rolün ana sayfası: rolün işine yarayan kartlar ve kısa listeler. */
export function HomePage({ token, role, tenantName, userName, requests, requestsStatus, onNewRequest }: Props) {
  const isConsultant = role === "consultant";
  const isDeveloper = role === "developer";
  const isAdmin = role === "admin";
  // Her kaynak yalnız onu kullanan rolde okunur; Danışman proje ve kişi uçlarına hiç gitmez.
  const publications = useSource<Publications>(isConsultant || isAdmin, `pub:${token}`, () =>
    getJson(`/api/custom-pages/publications?take=${PUBLICATIONS_TAKE}`, token),
  );
  const pages = useSource<{ code: string; name: string; updatedAt: string; isPublished: boolean }[]>(isConsultant, `pages:${token}`, () =>
    getJson("/api/custom-pages", token),
  );
  const deployments = useSource(isDeveloper, `deploy:${token}`, async () => {
    const result = await loadModuleDeployments(token);
    if (result.failed && result.deployments.length === 0) throw new Error("Dağıtımlar okunamadı.");
    return result.deployments;
  });
  const people = useSource<Person[]>(isAdmin, `people:${token}`, () => getJson("/studio/people", token));
  const modules = useSource<{ isActivated: boolean }[]>(isAdmin, `modules:${token}`, () =>
    getJson("/api/tenant/modules/marketplace", token),
  );

  const statusOf: Record<string, CardStatus> = {
    pending: publications.status,
    "my-requests": requestsStatus,
    incoming: requestsStatus,
    "last-production": deployments.status,
    "studio-users": people.status,
    modules: modules.status,
    "published-month": publications.status,
  };
  const month = publishedThisMonth(publications.data?.history ?? [], new Date(), PUBLICATIONS_TAKE);
  const cards = (
    isConsultant
      ? consultantCards({
          pendingCount: publications.data?.pending.length ?? 0,
          pendingCapped: (publications.data?.pending.length ?? 0) >= PUBLICATIONS_TAKE,
          myRequests: requests,
        })
      : isDeveloper
        ? developerCards({ requests, lastProductionAt: lastProductionAt(deployments.data ?? []) })
        : adminCards({
            people: people.data ?? [],
            activeModules: (modules.data ?? []).filter((item) => item.isActivated).length,
            publishedThisMonth: month.count,
            publishedCapped: month.capped,
          })
  ).map((card) => withStatus(card, statusOf[card.id] ?? "ready"));

  const hero = (
    <header className="st-hero">
      <div className="st-hero-text">
        <small>
          {tenantName} · {roleLabel(role)}
        </small>
        <h1>{isAdmin ? "Yönetim" : `Merhaba, ${userName}`}</h1>
      </div>
      <div className="st-hero-actions">
        {isConsultant && (
          <a className="ns-btn ns-btn-primary" href="#screens/pages">
            <Plus size={16} aria-hidden="true" />
            Yeni ekran
          </a>
        )}
        {isDeveloper && (
          <a className="ns-btn ns-btn-primary" href="#company-module/code">
            <FolderKanban size={16} aria-hidden="true" />
            Modülü aç
          </a>
        )}
      </div>
    </header>
  );

  if (isConsultant) {
    const recent = recentScreens(pages.data ?? []);
    return (
      <>
        {hero}
        <Cards cards={cards} label="Danışman özeti" />
        <div className="st-grid st-grid-wide">
          <Panel id="studio-home-recent" title="Son çalıştıklarım">
            {pages.status === "loading" ? (
              <div className="st-loading" role="status">
                Ekranlar yükleniyor…
              </div>
            ) : pages.status === "error" ? (
              <p className="st-card-note">Ekranlar yüklenemedi.</p>
            ) : recent.length === 0 ? (
              <p className="st-card-note">Henüz bir ekran yok.</p>
            ) : (
              <div className="st-quick">
                {recent.map((screen, index) => (
                  <div className="st-quick-row" key={`${screen.name}-${index}`}>
                    <span className="st-quick-icon" aria-hidden="true">
                      <LayoutList size={16} />
                    </span>
                    <span className="st-quick-text">
                      <b>{screen.name}</b>
                      <small>{formatShortDate(screen.updatedAt)}</small>
                    </span>
                    <span className={`ns-badge st-home-row-badge ${screen.badge === "Yayında" ? "is-success" : "is-warning"}`}>
                      {screen.badge}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel id="studio-home-shortcuts" title="Kısayollar">
            <nav className="st-quick" aria-labelledby="studio-home-shortcuts">
              {consultantShortcuts.map((item) =>
                item.href ? (
                  <a key={item.id} href={item.href}>
                    <span className="st-quick-icon" aria-hidden="true">
                      {item.id === "new-screen" ? <Plus size={16} /> : <ShieldCheck size={16} />}
                    </span>
                    <span className="st-quick-text">
                      <b>{item.label}</b>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <button key={item.id} type="button" onClick={onNewRequest}>
                    <span className="st-quick-icon" aria-hidden="true">
                      <Inbox size={16} />
                    </span>
                    <span className="st-quick-text">
                      <b>{item.label}</b>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ),
              )}
            </nav>
          </Panel>
        </div>
      </>
    );
  }

  if (isDeveloper) {
    const latest = [...requests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 8);
    return (
      <>
        {hero}
        <Cards cards={cards} label="Yazılımcı özeti" />
        <Panel
          id="studio-home-requests"
          title="Talepler"
          action={
            <a className="ns-btn ns-btn-ghost ns-btn-sm" href="#incoming-requests">
              Tümü
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          }
        >
          {requestsStatus === "loading" ? (
            <div className="st-loading" role="status">
              Talepler yükleniyor…
            </div>
          ) : requestsStatus === "error" ? (
            <p className="st-card-note">Talepler yüklenemedi.</p>
          ) : latest.length === 0 ? (
            <p className="st-card-note">Henüz gelen talep yok.</p>
          ) : (
            <div className="st-table-wrap">
              <table className="st-table">
                <thead>
                  <tr>
                    <th scope="col">Talep</th>
                    <th scope="col" className="st-col-project">Proje</th>
                    <th scope="col">Aşama</th>
                    <th scope="col">Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <b>{item.title}</b>
                      </td>
                      <td className="st-col-project">{item.projectName || "Genel talep"}</td>
                      <td>
                        <span className={`ns-badge ${stageTones[item.stage] ?? ""}`.trim()}>{stageLabels[item.stage] ?? item.stage}</span>
                      </td>
                      <td className="st-num">{formatShortDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </>
    );
  }

  return (
    <>
      {hero}
      <Cards cards={cards} label="Yönetim özeti" />
    </>
  );
}
