import type { FormEvent } from "react";
import {
  RecordFormGroup,
  RecordFormPage,
  RequiredMark,
} from "../../record-form/RecordForm";
import "../../sales/sales-record-forms.css";
import type {
  Counterparty,
  CounterpartyPage,
  ContractType,
  SourceKind,
  SourceOption,
  SourcePage,
  Translate,
} from "../types";

type Props = {
  error: string;
  setError: (value: string) => void;
  tx: Translate;
  busy: boolean;
  setShowCreate: (value: boolean) => void;
  create: (event: FormEvent) => void;
  type: ContractType;
  setType: (value: ContractType) => void;
  code: string;
  setCode: (value: string) => void;
  counterpartySearch: string;
  setCounterpartySearch: (value: string) => void;
  counterpartyId: string;
  setCounterpartyId: (value: string) => void;
  selectedCounterparty: Counterparty | null;
  setSelectedCounterparty: (value: Counterparty | null) => void;
  counterpartyPageData: CounterpartyPage | null;
  counterpartyLoading: boolean;
  counterpartyPage: number;
  setCounterpartyPage: (value: number | ((current: number) => number)) => void;
  sourceKind: SourceKind;
  setSourceKind: (value: SourceKind) => void;
  sourceId: string;
  setSourceId: (value: string) => void;
  selectedSource: SourceOption | null;
  setSelectedSource: (value: SourceOption | null) => void;
  sourcePageData: SourcePage | null;
  sourceLoading: boolean;
  sourcePage: number;
  setSourcePage: (value: number | ((current: number) => number)) => void;
  sourceQuery: string;
  setSourceQuery: (value: string) => void;
  currency: string;
  setCurrency: (value: string) => void;
  from: string;
  setFrom: (value: string) => void;
  through: string;
  setThrough: (value: string) => void;
};

export default function ContractCreateDialog(props: Props) {
  const {
    error,
    setError,
    tx,
    busy,
    setShowCreate,
    create,
    type,
    setType,
    code,
    setCode,
    counterpartySearch,
    setCounterpartySearch,
    counterpartyId,
    setCounterpartyId,
    selectedCounterparty,
    setSelectedCounterparty,
    counterpartyPageData,
    counterpartyLoading,
    counterpartyPage,
    setCounterpartyPage,
    sourceKind,
    setSourceKind,
    sourceId,
    setSourceId,
    selectedSource,
    setSelectedSource,
    sourcePageData,
    sourceLoading,
    sourcePage,
    setSourcePage,
    sourceQuery,
    setSourceQuery,
    currency,
    setCurrency,
    from,
    setFrom,
    through,
    setThrough,
  } = props;
  const saveBlocked =
    counterpartyLoading ||
    !counterpartyId ||
    (sourceKind !== "none" && !sourceId);
  return (
    <div
      className="contracts-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) setShowCreate(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) setShowCreate(false);
      }}
    >
      <section
        className="contracts-create sales-rf-host"
        role="dialog"
        aria-modal="true"
        aria-label={tx("Sözleşme oluştur")}
      >
        <RecordFormPage
          variant="dialog"
          className="sales-rf"
          title={tx("Sözleşme oluştur")}
          mode="create"
          busy={busy}
          saveLabel={tx("Taslağı oluştur")}
          onSubmit={(event) => {
            // The old save button was disabled in these states; keep the same guard.
            if (saveBlocked) {
              event.preventDefault();
              return;
            }
            create(event);
          }}
          onCancel={() => setShowCreate(false)}
          error={error}
          onDismissError={() => setError("")}
          status={
            <>
              <span>{tx("Sözleşme taslak olarak oluşturulur.")}</span>
              {!counterpartyId && (
                <span className="rf-status-warning">
                  {tx("Kaydetmek için cari hesap seçin.")}
                </span>
              )}
              {sourceKind !== "none" && !sourceId && (
                <span className="rf-status-warning">
                  {tx("Kaydetmek için kaynak belge seçin veya bağlantıyı kaldırın.")}
                </span>
              )}
            </>
          }
        >
          <RecordFormGroup
            title={tx("Sözleşme Kimliği")}
            bodyClassName="rf-identity sales-rf-identity-3"
          >
            <label>
              {tx("Sözleşme türü")}
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as "Sales" | "Purchase");
                  setCounterpartyId("");
                  setSelectedCounterparty(null);
                  setCounterpartySearch("");
                  setCounterpartyPage(1);
                  setSourceKind("none");
                  setSourceId("");
                  setSelectedSource(null);
                  setSourcePage(1);
                  setSourceQuery("");
                }}
              >
                <option value="Sales">{tx("Satış")}</option>
                <option value="Purchase">{tx("Satın alma")}</option>
              </select>
            </label>
            <label>
              <span>
                {tx("Sözleşme kodu")} <RequiredMark />
              </span>
              <input
                className="rf-must rf-mono"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                maxLength={40}
                placeholder="ORN-SOZ-001"
              />
            </label>
          <label>
            <span>
              {tx("Para birimi")} <RequiredMark />
            </span>
            <input
              className="rf-must rf-mono"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value.toUpperCase());
                setSourceId("");
                setSelectedSource(null);
                setSourcePage(1);
              }}
              required
              minLength={3}
              maxLength={3}
            />
          </label>
          </RecordFormGroup>
          <div className="sales-rf-two-groups">
          <RecordFormGroup title={tx("Cari Hesap")}>
          <div className="contracts-counterparty-field sales-rf-field">
            <label htmlFor="contract-counterparty-search">
              {tx("Cari hesap ara")}
            </label>
            <input
              id="contract-counterparty-search"
              aria-label={tx("Cari hesap ara")}
              placeholder={tx("Kod, unvan veya vergi no ara")}
              value={counterpartySearch}
              onChange={(e) => {
                setCounterpartySearch(e.target.value);
                setCounterpartyPage(1);
              }}
            />
            <select
              id="contract-counterparty-select"
              aria-label={tx("Cari hesap seç")}
              required
              value={counterpartyId}
              disabled={counterpartyLoading}
              onChange={(e) => {
                const chosen =
                  counterpartyPageData?.items.find(
                    (x) => x.id === e.target.value,
                  ) || null;
                setCounterpartyId(e.target.value);
                setSelectedCounterparty(chosen);
                setSourceId("");
                setSelectedSource(null);
                setSourcePage(1);
                setSourceQuery("");
                if (chosen?.currencyCode) setCurrency(chosen.currencyCode);
              }}
            >
              <option value="">
                {counterpartyLoading
                  ? tx("Cari hesaplar yükleniyor…")
                  : (counterpartyPageData?.total ?? 0) > 0
                    ? tx("Cari seçin")
                    : tx("Uygun cari hesap yok")}
              </option>
              {counterpartyId &&
                selectedCounterparty &&
                !counterpartyPageData?.items.some(
                  (x) => x.id === counterpartyId,
                ) && (
                  <option value={counterpartyId}>
                    {selectedCounterparty.code} · {selectedCounterparty.name}
                  </option>
                )}
              {(counterpartyPageData?.items ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
            <div className="contracts-source-paging">
              <span>
                {counterpartyPageData?.total ?? 0} {tx("uygun cari")} ·{" "}
                {tx("sayfa")} {counterpartyPageData?.page ?? counterpartyPage} /{" "}
                {Math.max(
                  1,
                  Math.ceil((counterpartyPageData?.total ?? 0) / 25),
                )}
              </span>
              <div>
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={counterpartyPage <= 1 || counterpartyLoading}
                  onClick={() => setCounterpartyPage((x) => Math.max(1, x - 1))}
                >
                  {tx("Önceki")}
                </button>
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={
                    counterpartyLoading ||
                    counterpartyPage >=
                      Math.ceil((counterpartyPageData?.total ?? 0) / 25)
                  }
                  onClick={() => setCounterpartyPage((x) => x + 1)}
                >
                  {tx("Sonraki")}
                </button>
              </div>
            </div>
          </div>
          </RecordFormGroup>
          <RecordFormGroup title={tx("Kaynak Belge")}>
            <label>
              {tx("Kaynak belge türü")}
              <select
                value={sourceKind}
                onChange={(e) => {
                  setSourceKind(e.target.value as SourceKind);
                  setSourceId("");
                  setSelectedSource(null);
                  setSourcePage(1);
                  setSourceQuery("");
                }}
              >
                <option value="none">{tx("Bağlantı yok")}</option>
                {type === "Sales" ? (
                  <>
                    <option value="sales-quote">{tx("Satış teklifi")}</option>
                    <option value="sales-order">{tx("Satış siparişi")}</option>
                  </>
                ) : (
                  <>
                    <option value="purchase-quote">
                      {tx("Tedarikçi teklifi")}
                    </option>
                    <option value="purchase-order">
                      {tx("Satın alma siparişi")}
                    </option>
                  </>
                )}
              </select>
            </label>
            <div className="contracts-source-field sales-rf-field">
              <label htmlFor="contract-source-search">
                {tx("Kaynak belge")}
              </label>
              {sourceKind === "none" ? (
                <span className="contracts-source-hint">
                  {tx("İsteğe bağlı")}
                </span>
              ) : (
                <>
                  <input
                    id="contract-source-search"
                    aria-label={tx("Kaynak belge ara")}
                    placeholder={
                      !counterpartyId
                        ? tx("Önce cari seçin")
                        : tx("Belge kodu veya cari ara")
                    }
                    value={sourceQuery}
                    disabled={!counterpartyId}
                    onChange={(e) => {
                      setSourceQuery(e.target.value);
                      setSourcePage(1);
                    }}
                  />
                  <select
                    aria-label={tx("Kaynak belgesi seç")}
                    value={sourceId}
                    disabled={sourceLoading || !counterpartyId}
                    onChange={(e) => {
                      const chosen =
                        sourcePageData?.items.find(
                          (x) => x.id === e.target.value,
                        ) || null;
                      setSourceId(e.target.value);
                      setSelectedSource(chosen);
                    }}
                  >
                    <option value="">
                      {sourceLoading
                        ? tx("Belgeler yükleniyor…")
                        : !counterpartyId
                          ? tx("Önce cari seçin")
                          : (sourcePageData?.total ?? 0) > 0
                            ? tx("Belge seçin")
                            : tx("Uygun belge yok")}
                    </option>
                    {sourceId &&
                      selectedSource &&
                      !sourcePageData?.items.some((x) => x.id === sourceId) && (
                        <option value={sourceId}>
                          {selectedSource.code} ·{" "}
                          {selectedSource.counterpartyName} ·{" "}
                          {selectedSource.currencyCode}
                        </option>
                      )}
                    {(sourcePageData?.items ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} · {item.counterpartyName} ·{" "}
                        {item.currencyCode}
                      </option>
                    ))}
                  </select>
                  <div className="contracts-source-paging">
                    <span>
                      {sourcePageData?.total ?? 0} {tx("uygun belge")} ·{" "}
                      {tx("sayfa")} {sourcePageData?.page ?? sourcePage} /{" "}
                      {Math.max(
                        1,
                        Math.ceil((sourcePageData?.total ?? 0) / 25),
                      )}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="secondary small-button"
                        disabled={sourcePage <= 1 || sourceLoading}
                        onClick={() => setSourcePage((x) => Math.max(1, x - 1))}
                      >
                        {tx("Önceki")}
                      </button>
                      <button
                        type="button"
                        className="secondary small-button"
                        disabled={
                          sourceLoading ||
                          sourcePage >=
                            Math.ceil((sourcePageData?.total ?? 0) / 25)
                        }
                        onClick={() => setSourcePage((x) => x + 1)}
                      >
                        {tx("Sonraki")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          <div className="contracts-source-hint">
            {tx(
              "Kaynaklar sunucuda tenant, cari ve para birimine göre filtrelenir. Arama ve sayfalama ile tüm uygun belgeleri bulabilirsiniz.",
            )}
          </div>
          </RecordFormGroup>
          </div>
          <RecordFormGroup title={tx("Geçerlilik")} bodyClassName="rf-pair">
            <label>
              <span>
                {tx("Başlangıç tarihi")} <RequiredMark />
              </span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </label>
            <label>
              <span>
                {tx("Bitiş tarihi")} <RequiredMark />
              </span>
              <input
                type="date"
                value={through}
                min={from}
                onChange={(e) => setThrough(e.target.value)}
                required
              />
            </label>
          </RecordFormGroup>
          <div className="contracts-form-note">
            {tx(
              "Sözleşme taslak olarak oluşturulur. Kaynak belge bağlantısı isteğe bağlıdır; bağlanan belge ile cari ve döviz tutarlılığı API’de yeniden doğrulanır.",
            )}
          </div>
        </RecordFormPage>
      </section>
    </div>
  );
}
