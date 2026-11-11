import { useEffect, useState } from "react";
import { api, localDateString } from "./erpApi";
import type {
  FxRevaluationVoucherSummary,
  FxRevaluationVoucher,
} from "./erp-types";
import FxRevaluationHeader from "./fx-revaluation/components/FxRevaluationHeader";
import FxRevaluationMessages from "./fx-revaluation/components/FxRevaluationMessages";
import FxRevaluationCreateForm from "./fx-revaluation/components/FxRevaluationCreateForm";
import FxRevaluationVoucherGrid from "./fx-revaluation/components/FxRevaluationVoucherGrid";
import FxRevaluationVoucherDetail from "./fx-revaluation/components/FxRevaluationVoucherDetail";
import FxRevaluationEmptySelection from "./fx-revaluation/components/FxRevaluationEmptySelection";

export default function FxRevaluationPage({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  const today = localDateString();
  const [date, setDate] = useState(today),
    [vouchers, setVouchers] = useState<FxRevaluationVoucherSummary[]>([]),
    [selected, setSelected] = useState<FxRevaluationVoucher | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      setVouchers(
        await api<FxRevaluationVoucherSummary[]>(
          "/api/finance/fx-revaluations",
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  async function create() {
    if (
      !window.confirm(
        `${date} tarihi için değerleme fişi oluşturulsun mu? Fiş kaydedildikten sonra değiştirilemez.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const voucher = await api<FxRevaluationVoucher>(
        "/api/finance/fx-revaluations",
        token,
        { method: "POST", body: JSON.stringify({ asOfDate: date }) },
      );
      setSelected(voucher);
      setNotice(
        `${voucher.code} fişi oluşturuldu. Borç ve alacak toplamı ${voucher.totalDebit.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${voucher.baseCurrencyCode}.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setError("");
    try {
      setSelected(
        await api<FxRevaluationVoucher>(
          `/api/finance/fx-revaluations/${id}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const money = (value: number, currency: string) =>
    `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${currency}`;
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filteredVouchers = vouchers.filter((voucher) =>
    !normalizedQuery ||
    voucher.code.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
    voucher.asOfDate.includes(normalizedQuery),
  );
  return (
    <section className="panel finance-workbench fx-revaluation-workbench">
      <FxRevaluationHeader onRefresh={() => void load()} />
      <FxRevaluationMessages
        error={error}
        notice={notice}
        onDismissError={() => setError("")}
        onDismissNotice={() => setNotice("")}
      />
      <section className="fx-revaluation-summary" aria-label="Değerleme özeti">
        <article><span>Toplam fiş</span><b>{vouchers.length}</b></article>
        <article><span>Toplam döviz kalemi</span><b>{vouchers.reduce((sum, voucher) => sum + voucher.lineCount, 0)}</b></article>
        <article><span>Listelenen fiş</span><b>{filteredVouchers.length}</b></article>
      </section>
      <div className="finance-workbench-grid fx-revaluation-grid">
        <section className="finance-workbench-card">
          <div className="fx-revaluation-list-heading">
            <div>
              <h2>Değerleme fişleri</h2>
              <p>{filteredVouchers.length} / {vouchers.length} kayıt</p>
            </div>
          </div>
          <section className="fx-revaluation-filter-card" aria-label="Değerleme fişi filtreleri">
            <div>
              <h3>Filtreler</h3>
              <p>Fiş kodu veya dönem sonu tarihine göre daraltın.</p>
            </div>
            <label htmlFor="fx-revaluation-search">
              Ara
              <input
                id="fx-revaluation-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Fiş kodu veya YYYY-AA-GG"
              />
            </label>
          </section>
          <FxRevaluationVoucherGrid
            token={token}
            vouchers={filteredVouchers}
            emptyMessage={vouchers.length
              ? "Filtreye uygun değerleme fişi bulunamadı."
              : "Henüz değerleme fişi oluşturulmadı."}
            money={money}
            onOpen={(id) => void open(id)}
          />
          {role === "TenantAdmin" && (
            <FxRevaluationCreateForm
              date={date}
              today={today}
              busy={busy}
              onDateChange={setDate}
              onCreate={() => void create()}
            />
          )}
        </section>
        {selected ? (
          <FxRevaluationVoucherDetail
            token={token}
            voucher={selected}
            money={money}
            onClose={() => setSelected(null)}
          />
        ) : (
          <FxRevaluationEmptySelection />
        )}
      </div>
    </section>
  );
}
