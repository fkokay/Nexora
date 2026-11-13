import { BriefcaseBusiness, Pencil, Search, Target, X } from "lucide-react";
import { nextStage, stageLabels, type Opportunity } from "../types";

type Props = {
  selected: Opportunity | null;
  itemsCount: number;
  loading: boolean;
  listError: string;
  query: string;
  filter: string;
  busy: boolean;
  formatMoney: (amount: number, code: string, digits: number) => string;
  onClear: () => void;
  onCreate: () => void;
  onClose: () => void;
  onEdit: (item: Opportunity) => void;
  onMove: (stage: string) => void;
  onDelete: (item: Opportunity) => void;
};

export function CrmOpportunityDetail({
  selected,
  itemsCount,
  loading,
  listError,
  query,
  filter,
  busy,
  formatMoney,
  onClear,
  onCreate,
  onClose,
  onEdit,
  onMove,
  onDelete,
}: Props) {
  return (
    <aside className="crm-record-detail" aria-label="Seçili fırsat ayrıntıları">
      {selected ? (
        <>
          <header className="list-v2-detail-head">
            <div>
              <h2>{selected.name}</h2>
            </div>
            <div className="list-v2-detail-head-actions">
              {!["Won", "Lost"].includes(selected.stage) && (
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={busy}
                  onClick={() => onEdit(selected)}
                >
                  <Pencil size={14} /> Düzenle
                </button>
              )}
              <button
                type="button"
                className="icon-button crm-detail-close"
                aria-label="Seçimi kaldır"
                onClick={onClose}
              >
                <X size={16} />
              </button>
            </div>
          </header>
          <div className="list-v2-detail-meta">
            <span className="list-v2-detail-code">{selected.code}</span>
            <span
              className={`crm-stage crm-stage-${selected.stage.toLowerCase()}`}
            >
              {stageLabels[selected.stage] || selected.stage}
            </span>
            <span>{selected.customerName || "Müşteri bağlanmadı"}</span>
          </div>
          {!["Won", "Lost"].includes(selected.stage) && (
            <section className="list-v2-quick" aria-label="Aşama">
              <div>
                {nextStage[selected.stage] && (
                  <button
                    type="button"
                    className="primary small-button"
                    disabled={busy}
                    aria-label={`${selected.name} fırsatını ${stageLabels[nextStage[selected.stage]]} aşamasına ilerlet`}
                    title={stageLabels[nextStage[selected.stage]]}
                    onClick={() => onMove(nextStage[selected.stage])}
                  >
                    Aşamayı ilerlet
                  </button>
                )}
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={busy}
                  aria-label={`${selected.name} fırsatını kaybedildi olarak işaretle`}
                  onClick={() => onMove("Lost")}
                >
                  Kaybedildi olarak işaretle
                </button>
              </div>
            </section>
          )}
          <dl className="list-v2-facts">
            <div>
              <dt>Tahmini değer</dt>
              <dd>
                {selected.estimatedValue === null
                  ? "—"
                  : formatMoney(
                      selected.estimatedValue,
                      selected.currencyCode,
                      2,
                    )}
              </dd>
            </div>
            <div>
              <dt>Kazanma olasılığı</dt>
              <dd>%{selected.probabilityPercent}</dd>
            </div>
            <div>
              <dt>Beklenen kapanış</dt>
              <dd>
                {selected.expectedCloseDate
                  ? new Date(selected.expectedCloseDate).toLocaleDateString(
                      "tr-TR",
                    )
                  : "Belirtilmedi"}
              </dd>
            </div>
            <div>
              <dt>Sonraki takip</dt>
              <dd>
                {selected.nextActivityAt
                  ? new Date(selected.nextActivityAt).toLocaleString("tr-TR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "Planlanmadı"}
              </dd>
            </div>
          </dl>
          {selected.notes && (
            <div className="crm-detail-notes">
              <b>Not</b>
              <p>{selected.notes}</p>
            </div>
          )}
          <div className="list-v2-detail-foot">
            <button
              type="button"
              className="is-danger"
              disabled={busy}
              onClick={() => onDelete(selected)}
            >
              Sil
            </button>
          </div>
        </>
      ) : itemsCount === 0 &&
        !loading &&
        !listError &&
        (query.trim() || filter) ? (
        <div className="crm-detail-placeholder crm-filter-guide">
          <div className="crm-empty-icon">
            <Search size={20} aria-hidden="true" />
          </div>
          <b>Sonuçlar filtrelenmiş olabilir</b>
          <span>
            Arama metni veya seçili aşama nedeniyle kayıt görünmüyor. Filtreleri
            temizleyerek satış hattının tamamını yeniden görüntüleyebilirsiniz.
          </span>
          <button
            type="button"
            className="secondary crm-guide-action"
            onClick={onClear}
          >
            Arama ve aşama filtresini temizle
          </button>
        </div>
      ) : itemsCount === 0 && !loading && !listError ? (
        <div className="crm-detail-placeholder crm-detail-guide">
          <div className="crm-empty-icon">
            <BriefcaseBusiness size={21} aria-hidden="true" />
          </div>
          <b>Satış hattı nasıl başlar?</b>
          <span>
            Bir fırsat kaydı, müşteriyle yürüttüğünüz satış sürecini tek yerde
            takip etmenizi sağlar.
          </span>
          <ol>
            <li>
              <strong>Fırsatı tanımlayın</strong>
              <small>Kod ve anlaşmayı özetleyen bir ad girin.</small>
            </li>
            <li>
              <strong>Satış tahminini ekleyin</strong>
              <small>
                Müşteriyi, tutarı ve beklenen kapanış tarihini belirtin.
              </small>
            </li>
            <li>
              <strong>Takip adımını planlayın</strong>
              <small>
                Sonraki görüşme zamanını ekleyin; aşamayı ilerledikçe
                güncelleyin.
              </small>
            </li>
          </ol>
          <button
            type="button"
            className="secondary crm-guide-action"
            onClick={onCreate}
          >
            Fırsat oluştur
          </button>
        </div>
      ) : (
        <div className="crm-detail-placeholder">
          <Target size={22} />
          <b>Listeden bir fırsat seçin</b>
          <span>
            Fırsat kaydı seçildiğinde müşteri, değer, kapanış tarihi ve sonraki
            takip bilgileri burada görüntülenir.
          </span>
        </div>
      )}
    </aside>
  );
}
