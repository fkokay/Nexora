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
import { confirmLocalized } from "./locale";
import { ListToolbar } from "./list-page/ListToolbar";
import "./fx-revaluation/fx-revaluation-list-v2.css";

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
  // The count next to the title stays hidden until the first successful load.
  const [loaded, setLoaded] = useState(false);
  // list-v2: the toolbar row hosts the voucher list's own tools (columns, export…).
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
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
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [token]);
  async function create() {
    if (
      !confirmLocalized(
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
    <section className="panel finance-workbench fx-revaluation-workbench list-v2">
      <FxRevaluationHeader count={loaded ? vouchers.length : null} />
      <FxRevaluationMessages
        error={error}
        notice={notice}
        onDismissError={() => setError("")}
        onDismissNotice={() => setNotice("")}
      />
      <ListToolbar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Fiş kodu veya YYYY-AA-GG"
        toolsSlotRef={setToolsSlot}
        onRefresh={() => void load()}
      />
      <div className="finance-workbench-grid fx-revaluation-grid">
        <section
          className="finance-workbench-card list-v2-list"
          aria-label="Değerleme fişleri"
        >
          <FxRevaluationVoucherGrid
            token={token}
            vouchers={filteredVouchers}
            emptyMessage={vouchers.length
              ? "Filtreye uygun değerleme fişi bulunamadı."
              : "Henüz değerleme fişi oluşturulmadı."}
            toolbarContainer={toolsSlot}
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
