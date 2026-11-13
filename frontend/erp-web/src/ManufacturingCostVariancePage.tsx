import { useCallback, useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./authApi";
import "./manufacturing-cost-variance.css";
import "./manufacturing-cost-variance/manufacturing-cost-list-v2.css";
import { ManufacturingCostVarianceError } from "./manufacturing-cost-variance/components/ManufacturingCostVarianceError";
import { ManufacturingCostVarianceFilters } from "./manufacturing-cost-variance/components/ManufacturingCostVarianceFilters";
import { ManufacturingCostVarianceHeader } from "./manufacturing-cost-variance/components/ManufacturingCostVarianceHeader";
import { ManufacturingCostVarianceLimitations } from "./manufacturing-cost-variance/components/ManufacturingCostVarianceLimitations";
import {
  defaultCostVarianceFields,
  ManufacturingCostVarianceResults,
  type CostVarianceScreenViewField,
} from "./manufacturing-cost-variance/components/ManufacturingCostVarianceResults";
import { ManufacturingCostVarianceSummary } from "./manufacturing-cost-variance/components/ManufacturingCostVarianceSummary";
import type { CostReport } from "./manufacturing-cost-variance/components/types";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export default function ManufacturingCostVariancePage({
  token,
}: {
  token: string;
}) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const [screenFields, setScreenFields] = useState<
    CostVarianceScreenViewField[]
  >(defaultCostVarianceFields);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void authenticatedFetch(
      "/api/screen-views/manufacturing-cost-variance/active",
      token,
    )
      .then(async (response) => {
        if (!response.ok) return;
        const view = (await response.json()) as {
          fields?: CostVarianceScreenViewField[];
        };
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  const load = useCallback(
    async (nextPage: number) => {
      const current = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          from,
          to,
          page: String(nextPage),
          pageSize: "50",
        });
        const response = await authenticatedFetch(
          `/api/reports/manufacturing-cost-variance?${query}`,
          token,
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
            title?: string;
          } | null;
          throw new Error(
            body?.error ||
              body?.title ||
              `İstek başarısız (${response.status})`,
          );
        }
        const data = (await response.json()) as CostReport;
        if (current !== generation.current) return;
        setReport(data);
        setPage(data.page);
      } catch (cause) {
        if (current === generation.current) setError((cause as Error).message);
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [from, to, token],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const pageCount = Math.max(
    1,
    Math.ceil((report?.totalCount ?? 0) / (report?.pageSize ?? 50)),
  );
  const code = report?.baseCurrencyCode || "TRY";
  const maxTo = from
    ? new Date(new Date(`${from}T00:00:00Z`).getTime() + 365 * 86400000)
        .toISOString()
        .slice(0, 10)
    : undefined;

  return (
    <div className="manufacturing-cost-page list-v2">
      <ManufacturingCostVarianceHeader total={report?.totalCount ?? null} />
      {/* Cost totals have no filter equivalent, so these cards stay. */}
      {report && (
        <ManufacturingCostVarianceSummary report={report} currency={code} />
      )}
      {/* Changing a date reloads the report through the effect above. */}
      <ManufacturingCostVarianceFilters
        from={from}
        to={to}
        maxTo={maxTo}
        onFromChange={setFrom}
        onToChange={setTo}
        onRefresh={() => {
          if (!loading) void load(page);
        }}
        toolsSlotRef={setToolsSlot}
      />
      <ManufacturingCostVarianceError
        error={error}
        onDismiss={() => setError("")}
      />
      {report && (
        <>
          <ManufacturingCostVarianceResults
            report={report}
            currency={code}
            pageCount={pageCount}
            loading={loading}
            onPageChange={(nextPage) => void load(nextPage)}
            fields={screenFields}
            toolbarContainer={toolsSlot}
          />
          <ManufacturingCostVarianceLimitations text={report.limitations} />
        </>
      )}
    </div>
  );
}
