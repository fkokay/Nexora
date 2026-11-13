import { useState } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { ListToolbar } from "../../list-page/ListToolbar";
import "../integration-queue-list-v2.css";
import { Ban } from "lucide-react";

function providerDocumentStatusLabel(status: number, tr: Props["tr"]) {
  const labels: Record<number, [string, string]> = {
    10: ["İşleniyor", "Processing"],
    20: ["Belge hazırlanıyor", "Preparing document"],
    29: ["Belge hatası", "Document error"],
    30: ["Oluşturuldu", "Created"],
    40: ["GİB'e gönderildi", "Sent to GIB"],
    50: ["Yanıt bekleniyor", "Awaiting response"],
    100: ["Reddediliyor", "Rejecting"],
    105: ["Reddedildi", "Rejected"],
    200: ["Onaylanıyor", "Approving"],
    205: ["Onaylandı (ilgili senaryolarda nihai)", "Approved (final in applicable scenarios)"],
    305: ["İptal edildi", "Cancelled"],
    405: ["Hatalı", "Error"],
  };
  const label = labels[status];
  return label ? tr(...label) : String(status);
}

function providerReplyTypeLabel(responseType: string, tr: Props["tr"]) {
  const labels: Record<string, [string, string]> = {
    APPROVED: ["Onaylandı", "Approved"],
    AUTO_APPROVED: ["Otomatik onaylandı", "Auto-approved"],
    DENIED: ["Reddedildi", "Denied"],
    RETURNED: ["İade edildi", "Returned"],
  };
  const label = labels[responseType];
  return label ? tr(...label) : responseType;
}

export type IntegrationOperation = {
  operationId: string;
  integrationCode: string;
  status:
    | "AwaitingApproval"
    | "Queued"
    | "Running"
    | "Succeeded"
    | "Failed"
    | "Indeterminate"
    | "Cancelled";
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempts: number;
  errorCode: string | null;
};

export type IntegrationOperationPage = {
  items: IntegrationOperation[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type EDocumentProviderStatus = {
  operationId: string;
  operationStatus: string;
  providerStatus: {
    documentType: string;
    documentUuid: string;
    status: number;
    gibStatusCode: number | null;
    gibStatus: string | null;
    replyLookupStatus: string | null;
    sentReply: {
      responseType: string;
      issuedAt: string | null;
      replyStatus: number | null;
      gibStatus: number | null;
    } | null;
  };
  externalReference: string;
};

type Props = {
  status: string;
  statuses: readonly string[];
  data: IntegrationOperationPage | null;
  loading: boolean;
  page: number;
  totalPages: number;
  selectedOperation: IntegrationOperation | null;
  busyId: string;
  reconciliationOutcome: "confirmed_submitted" | "confirmed_not_submitted";
  reconciliationReference: string;
  reconciliationEvidence: string;
  providerStatus: EDocumentProviderStatus | null;
  onStatusChange: (value: string) => void;
  onSelectOperation: (operationId: string) => void;
  onCancel: (operation: IntegrationOperation) => void;
  onReconciliationOutcomeChange: (
    value: "confirmed_submitted" | "confirmed_not_submitted",
  ) => void;
  onReconciliationReferenceChange: (value: string) => void;
  onReconciliationEvidenceChange: (value: string) => void;
  onReconcile: (operation: IntegrationOperation) => void;
  onCheckProviderStatus: (operation: IntegrationOperation) => void;
  onPageChange: (delta: number) => void;
  tr: (turkish: string, english: string) => string;
  locale: () => string;
  statusLabel: (status: IntegrationOperation["status"]) => string;
};

export default function IntegrationOperationsList({
  status,
  statuses,
  data,
  loading,
  page,
  totalPages,
  selectedOperation,
  busyId,
  reconciliationOutcome,
  reconciliationReference,
  reconciliationEvidence,
  providerStatus,
  onStatusChange,
  onSelectOperation,
  onCancel,
  onReconciliationOutcomeChange,
  onReconciliationReferenceChange,
  onReconciliationEvidenceChange,
  onReconcile,
  onCheckProviderStatus,
  onPageChange,
  tr,
  locale,
  statusLabel,
}: Props) {
  const [gridToolsSlot, setGridToolsSlot] = useState<HTMLDivElement | null>(
    null,
  );
  return (
    <>
      <div className="integration-operation-list-heading">
        <h2
          title={tr(
            "Kuyruk içeriği ve hassas istek verileri bu listede gösterilmez.",
            "Queue contents and sensitive request data are not shown in this list.",
          )}
        >
          {tr("İşlem geçmişi", "Operation history")}
        </h2>
      </div>
      <ListToolbar toolsSlotRef={setGridToolsSlot}>
        <label className="list-v2-filter">
          {tr("Durum", "Status")}
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            {statuses.map((value) => (
              <option key={value || "all"} value={value}>
                {value
                  ? statusLabel(value as IntegrationOperation["status"])
                  : tr("Tüm durumlar", "All statuses")}
              </option>
            ))}
          </select>
        </label>
      </ListToolbar>
      <div className="integration-operations-workbench">
        <div
          className="integration-queue-table-wrap"
          role="region"
          aria-label={tr(
            "Entegrasyon işlem geçmişi tablosu",
            "Integration operation history table",
          )}
          tabIndex={0}
          aria-busy={loading}
        >
          <AdvancedDataGrid
            externalPagination
            toolbarContainer={gridToolsSlot}
            className="integration-queue-table"
          >
            <caption className="integration-visually-hidden">
              {tr(
                "Entegrasyon işlemlerinin durum ve deneme geçmişi",
                "Status and attempt history for integration operations",
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col">{tr("Entegrasyon", "Integration")}</th>
                <th scope="col">{tr("Durum", "Status")}</th>
                <th scope="col">{tr("Oluşturulma", "Created")}</th>
                <th scope="col">{tr("Deneme", "Attempt")}</th>
                <th scope="col">{tr("Hata kodu", "Error code")}</th>
                <th scope="col">{tr("İşlemler", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="queue-empty" role="status">
                    {tr("Kuyruk yükleniyor…", "Loading queue…")}
                  </td>
                </tr>
              ) : !data ? (
                <tr>
                  <td colSpan={6} className="queue-empty">
                    {tr(
                      "Kuyruk görüntülenemiyor. Yenile düğmesini kullanın.",
                      "Cannot display the queue. Use Refresh to try again.",
                    )}
                  </td>
                </tr>
              ) : data.items.length ? (
                data.items.map((item) => (
                  <tr key={item.operationId}>
                    <td>
                      <b>{item.integrationCode}</b>
                      <small className="queue-id">{item.operationId}</small>
                    </td>
                    <td>
                      <span
                        className={`queue-status status-${item.status.toLowerCase()}`}
                      >
                        <i />
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      {new Date(item.createdAt).toLocaleString(locale(), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      <span>{item.attempts}</span>
                      {["Failed", "Indeterminate"].includes(item.status) && (
                        <small className="queue-retry-note">
                          {tr("Otomatik tekrar yok", "No automatic retry")}
                        </small>
                      )}
                    </td>
                    <td>{item.errorCode || "—"}</td>
                    <td>
                      <div className="queue-row-actions">
                        <button
                          type="button"
                          className="secondary small-button"
                          aria-pressed={
                            selectedOperation?.operationId === item.operationId
                          }
                          onClick={() => onSelectOperation(item.operationId)}
                        >
                          {tr("Ayrıntı", "Details")}
                        </button>
                        {["Queued", "AwaitingApproval"].includes(
                          item.status,
                        ) && (
                          <button
                            className="secondary small-button queue-cancel"
                            disabled={busyId === item.operationId}
                            onClick={() => onCancel(item)}
                          >
                            <Ban size={14} />
                            {busyId === item.operationId
                              ? tr("İptal ediliyor…", "Cancelling…")
                              : tr("İptal et", "Cancel")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="queue-empty">
                    {tr(
                      "Bu filtrede işlem bulunmuyor.",
                      "No operations match this filter.",
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </AdvancedDataGrid>
        </div>
        {selectedOperation && (
          <aside
            className="integration-operation-inspector"
            aria-label={tr("Seçili kuyruk işlemi", "Selected queue operation")}
          >
            <div className="integration-inspector-heading">
              <div>
                <p className="eyebrow">
                  {tr("SEÇİLİ İŞLEM", "SELECTED OPERATION")}
                </p>
                <h3>{selectedOperation.integrationCode}</h3>
                <small className="queue-id">
                  {selectedOperation.operationId}
                </small>
              </div>
              <span
                className={`queue-status status-${selectedOperation.status.toLowerCase()}`}
              >
                <i />
                {statusLabel(selectedOperation.status)}
              </span>
            </div>
            <dl>
              <div>
                <dt>{tr("Oluşturulma", "Created")}</dt>
                <dd>
                  {new Date(selectedOperation.createdAt).toLocaleString(
                    locale(),
                  )}
                </dd>
              </div>
              <div>
                <dt>{tr("Son güncelleme", "Last updated")}</dt>
                <dd>
                  {new Date(selectedOperation.updatedAt).toLocaleString(
                    locale(),
                  )}
                </dd>
              </div>
              <div>
                <dt>{tr("Başladı", "Started")}</dt>
                <dd>
                  {selectedOperation.startedAt
                    ? new Date(selectedOperation.startedAt).toLocaleString(
                        locale(),
                      )
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{tr("Tamamlandı", "Completed")}</dt>
                <dd>
                  {selectedOperation.completedAt
                    ? new Date(selectedOperation.completedAt).toLocaleString(
                        locale(),
                      )
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{tr("Deneme sayısı", "Attempts")}</dt>
                <dd>{selectedOperation.attempts}</dd>
              </div>
              <div>
                <dt>{tr("Hata kodu", "Error code")}</dt>
                <dd>{selectedOperation.errorCode || "—"}</dd>
              </div>
            </dl>
            <p>
              {tr(
                "İstek gövdesi ve hassas belge verileri kuyruk ayrıntısında gösterilmez.",
                "Request bodies and sensitive document data are not shown in queue details.",
              )}
            </p>
            {["Queued", "AwaitingApproval"].includes(
              selectedOperation.status,
            ) && (
              <button
                className="secondary queue-cancel"
                disabled={busyId === selectedOperation.operationId}
                onClick={() => onCancel(selectedOperation)}
              >
                <Ban size={14} /> {tr("İptal et", "Cancel")}
              </button>
            )}
          </aside>
        )}
      </div>
      {selectedOperation?.integrationCode === "tr.e-document.submit" &&
        ["Indeterminate", "Succeeded"].includes(selectedOperation.status) && (
          <section
            className="integration-reconciliation"
            aria-label={tr(
              selectedOperation.status === "Indeterminate"
                ? "Dış sağlayıcıyla mutabakat"
                : "Sağlayıcı belge durumu",
              selectedOperation.status === "Indeterminate"
                ? "Reconcile with external provider"
                : "Provider document status",
            )}
          >
            <h3>
              {tr(
                selectedOperation.status === "Indeterminate"
                  ? "Dış sağlayıcıyla mutabakat"
                  : "Sağlayıcı belge durumu",
                selectedOperation.status === "Indeterminate"
                  ? "Reconcile with external provider"
                  : "Provider document status",
              )}
            </h3>
            <p>
              {tr(
                selectedOperation.status === "Indeterminate"
                  ? "Önce sağlayıcı portalında bu aynı belgeyi bulun. Taslağı oluşturan kişiden farklı bir firma yöneticisi doğruladığı sonucu kaydetmelidir."
                  : "Sağlayıcı durumunu ve varsa ticari yanıtı salt okunur kontrol edin. Taslağı oluşturan kişiden farklı bir firma yöneticisi sorgulamalıdır. Sorgu operasyon durumunu değiştirmez.",
                selectedOperation.status === "Indeterminate"
                  ? "First locate this document in the provider portal. A company administrator different from the draft creator must record the verified outcome."
                  : "Check provider status and any commercial reply in read-only mode. An administrator different from the draft creator must run the lookup. The lookup does not change the operation.",
              )}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busyId === selectedOperation.operationId}
              onClick={() => onCheckProviderStatus(selectedOperation)}
            >
              {busyId === selectedOperation.operationId
                ? tr("Durum sorgulanıyor…", "Checking provider status…")
                : tr("Sağlayıcı durumunu sorgula", "Check provider status")}
            </button>
            {providerStatus?.operationId === selectedOperation.operationId && (
              <>
                <p role="status" className="provider-status-result">
                  {tr("Sağlayıcı durumu", "Provider status")}: {providerStatus.providerStatus.status} · {providerDocumentStatusLabel(providerStatus.providerStatus.status, tr)}
                  {providerStatus.providerStatus.gibStatusCode !== null
                    ? ` · GİB ${providerStatus.providerStatus.gibStatusCode}`
                    : ""}
                  {providerStatus.providerStatus.gibStatus
                    ? ` · ${providerStatus.providerStatus.gibStatus}`
                    : ""}
                  {` · UUID ${providerStatus.externalReference}`}
                </p>
                {providerStatus.providerStatus.replyLookupStatus && (
                  <p role="status" className="provider-status-result">
                    {tr("Ticari yanıt", "Commercial reply")}: {providerStatus.providerStatus.sentReply
                      ? providerReplyTypeLabel(providerStatus.providerStatus.sentReply.responseType, tr)
                      : providerStatus.providerStatus.replyLookupStatus === "not_found"
                        ? tr("Yanıt henüz bulunamadı", "No reply found yet")
                        : tr("Yanıt sorgusu kullanılamıyor", "Reply lookup unavailable")}
                    {providerStatus.providerStatus.sentReply?.issuedAt
                      ? ` · ${new Date(providerStatus.providerStatus.sentReply.issuedAt).toLocaleString()}`
                      : ""}
                    {providerStatus.providerStatus.sentReply?.replyStatus !== null && providerStatus.providerStatus.sentReply?.replyStatus !== undefined
                      ? ` · ${tr("Yanıt kodu", "Reply code")} ${providerStatus.providerStatus.sentReply.replyStatus}`
                      : ""}
                    {providerStatus.providerStatus.sentReply?.gibStatus !== null && providerStatus.providerStatus.sentReply?.gibStatus !== undefined
                      ? ` · ${tr("GİB yanıt kodu", "GIB reply code")} ${providerStatus.providerStatus.sentReply.gibStatus}`
                      : ""}
                  </p>
                )}
                <small>
                  {tr(
                    "Sağlayıcı durumu GİB raporlama kodundan ve hukuki kabulden ayrıdır.",
                    "The provider status is separate from the GIB reporting code and legal acceptance.",
                  )}
                </small>
              </>
            )}
            <small>
              {tr(
                "Durum sorgusu işlemi kapatmaz. 404 yanıtı gönderilmediğini kanıtlamaz.",
                "A status lookup does not close the operation. A 404 does not prove it was not submitted.",
              )}
            </small>
            {selectedOperation.status === "Indeterminate" && (
              <>
            <label>
              {tr("Doğrulanan sonuç", "Verified outcome")}
              <select
                value={reconciliationOutcome}
                onChange={(event) =>
                  onReconciliationOutcomeChange(
                    event.target.value as Props["reconciliationOutcome"],
                  )
                }
              >
                <option value="confirmed_submitted">
                  {tr("Sağlayıcıda gönderildi", "Submitted at provider")}
                </option>
                <option value="confirmed_not_submitted">
                  {tr("Sağlayıcıda gönderilmedi", "Not submitted at provider")}
                </option>
              </select>
            </label>
            {reconciliationOutcome === "confirmed_submitted" && (
              <label>
                {tr("Sağlayıcı belge referansı", "Provider document reference")}
                <input
                  maxLength={200}
                  value={reconciliationReference}
                  onChange={(event) =>
                    onReconciliationReferenceChange(event.target.value)
                  }
                />
              </label>
            )}
            <label>
              {tr("Kontrol kanıtı özeti", "Evidence summary of the check")}
              <textarea
                minLength={10}
                maxLength={1000}
                rows={3}
                value={reconciliationEvidence}
                onChange={(event) =>
                  onReconciliationEvidenceChange(event.target.value)
                }
                placeholder={tr(
                  "Örn. sağlayıcı portalında belge numarasıyla arandı ve durum doğrulandı.",
                  "E.g. searched by document number in the provider portal and verified the status.",
                )}
              />
            </label>
            <small>
              {tr(
                "Özete secret, PIN, kişisel veri veya sağlayıcı yanıt gövdesi eklemeyin. Kayıt şifreli saklanır; işlem yeniden gönderilmez.",
                "Do not include secrets, PINs, personal data, or provider response bodies. The record is stored encrypted; the operation is not resubmitted.",
              )}
            </small>
            <button
              className="primary"
              disabled={busyId === selectedOperation.operationId}
              onClick={() => onReconcile(selectedOperation)}
            >
              {busyId === selectedOperation.operationId
                ? tr("Kaydediliyor…", "Saving…")
                : tr("Doğrulanmış sonucu kaydet", "Record verified outcome")}
            </button>
              </>
            )}
          </section>
        )}
      <footer className="integration-queue-pagination">
        <span>
          {data
            ? `${data.totalCount} ${tr("işlem · Sayfa", "operations · Page")} ${page}/${totalPages}`
            : "—"}
        </span>
        <div>
          <button
            className="secondary small-button"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(-1)}
          >
            {tr("Önceki", "Previous")}
          </button>
          <button
            className="secondary small-button"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(1)}
          >
            {tr("Sonraki", "Next")}
          </button>
        </div>
      </footer>
    </>
  );
}
