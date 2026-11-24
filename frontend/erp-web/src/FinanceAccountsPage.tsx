import { useRef, useState } from "react";
import { FinancePage } from "./FinancePages";
import { api } from "./erpApi";
import type { FinancialAccount } from "./erp-types";
import { pageParamsOf, useTakePageParam } from "./pageNavigation";

const CREATE_PAGE = "finance-account-create";

export default function FinanceAccountsPage({
  token,
  role,
  section = "finance-accounts",
  createOnOpen = false,
}: {
  token: string;
  role: string;
  section?: "finance-accounts" | "finance-banks";
  createOnOpen?: boolean;
}) {
  // Sistem Kasalar / Bankalar listeleri kartı `finance-account-create` sekmesinde açar (kart sistem sayfası yayımlı değilken bu
  // eski ekran çizilir): `accountType=Cash|Bank` yeni kartın türünü, `accountId` düzenlenecek hesabı verir. Parametreler bir kez
  // okunur (her açılış isteği sekmeye yeniden yazılır); her istek formu baştan kurar, açık sekme yeni hesabı yükler.
  const paramPage = createOnOpen ? CREATE_PAGE : undefined;
  const [kind, setKind] = useState<"Cash" | "Bank">(() =>
    createOnOpen && pageParamsOf(CREATE_PAGE).accountType === "Bank" ? "Bank" : "Cash",
  );
  const [pendingAccountId, setPendingAccountId] = useState(() =>
    createOnOpen ? pageParamsOf(CREATE_PAGE).accountId ?? "" : "",
  );
  const [editRequest, setEditRequest] = useState<{ account: FinancialAccount; seq: number } | null>(null);
  const [paramError, setParamError] = useState("");
  const [formKey, setFormKey] = useState(0);
  const requestId = useRef(0);
  useTakePageParam(paramPage, "accountType", (value) => {
    requestId.current += 1;
    setPendingAccountId("");
    setParamError("");
    setEditRequest(null);
    setKind(value === "Bank" ? "Bank" : "Cash");
    setFormKey((key) => key + 1);
  });
  useTakePageParam(paramPage, "accountId", (id) => {
    const current = ++requestId.current;
    setPendingAccountId(id);
    setParamError("");
    void api<FinancialAccount>(`/api/finance/accounts/${encodeURIComponent(id)}?page=1&pageSize=1`, token)
      .then((account) => {
        if (current !== requestId.current) return;
        setKind(account.type === "Bank" ? "Bank" : "Cash");
        setEditRequest((previous) => ({ account, seq: (previous?.seq ?? 0) + 1 }));
        setFormKey((key) => key + 1);
      })
      .catch((e) => {
        if (current === requestId.current) setParamError(`Hesap açılamadı: ${(e as Error).message}`);
      })
      .finally(() => {
        if (current === requestId.current) setPendingAccountId("");
      });
  });
  if (pendingAccountId)
    return <div className="panel page-loading" role="status">Hesap yükleniyor…</div>;
  const shownSection = createOnOpen ? (kind === "Bank" ? "finance-banks" : "finance-accounts") : section;
  return (
    <>
      {paramError && (
        <div className="alert inline-alert" role="alert">
          {paramError}
          <button type="button" aria-label="Hata mesajını kapat" onClick={() => setParamError("")}>×</button>
        </div>
      )}
      <FinancePage
        key={`${shownSection}-${createOnOpen}-${formKey}`}
        token={token}
        role={role}
        section={shownSection}
        createOnOpen={createOnOpen}
        editAccountRequest={editRequest}
      />
    </>
  );
}
