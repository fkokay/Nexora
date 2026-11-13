import { useEffect, useState } from "react";
import { authenticatedFetch } from "./authApi";
import SupplierQuoteDetailPane from "./purchase-supplier-quotes/components/SupplierQuoteDetailPane";
import SupplierQuotesFilters from "./purchase-supplier-quotes/components/SupplierQuotesFilters";
import SupplierQuotesHeader from "./purchase-supplier-quotes/components/SupplierQuotesHeader";
import { ListPagination } from "./list-page/ListPagination";
import SupplierQuotesTable, {
  defaultSupplierQuoteFields,
} from "./purchase-supplier-quotes/components/SupplierQuotesTable";
import "./purchase-list-v2/purchase-list-v2.css";
import type {
  Quote,
  QuoteDetail,
  QuotePage,
  ScreenField,
} from "./purchase-supplier-quotes/types";

type Props = { token: string; onOpenRequests: () => void };

async function request<T>(url: string, token: string): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let message = `İstek başarısız (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || body.title || message;
    } catch {
      // Response may be empty.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export default function PurchaseSupplierQuotesPage({
  token,
  onOpenRequests,
}: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // Search text that is applied to the query (set shortly after typing stops).
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<QuotePage | null>(null);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [screenFields, setScreenFields] = useState<ScreenField[]>(
    defaultSupplierQuoteFields,
  );

  useEffect(() => {
    let active = true;
    request<{ fields: ScreenField[] }>(
      "/api/screen-views/purchase-supplier-quotes/active",
      token,
    )
      .then((view) => {
        if (active && view.fields?.length) setScreenFields(view.fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (filter) params.set("search", filter);
    if (status) params.set("status", status);
    request<QuotePage>(`/api/purchasing/supplier-quotes/?${params}`, token)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setSelected((current) =>
          current && result.items.some((item) => item.id === current.id)
            ? (result.items.find((item) => item.id === current.id) ?? null)
            : (result.items[0] ?? null),
        );
      })
      .catch((error) => {
        if (!cancelled) setError((error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, page, filter, status]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    if (!selected) return;
    request<QuoteDetail[]>(
      `/api/purchasing/requests/${selected.purchaseRequestId}/supplier-quotes`,
      token,
    )
      .then((items) => {
        if (!cancelled)
          setDetail(items.find((item) => item.id === selected.id) ?? null);
      })
      .catch((error) => {
        if (!cancelled) setError((error as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selected?.id]);


  return (
    <div className="purchase-requests-page supplier-quotes-page list-v2">
      <SupplierQuotesHeader
        onOpenRequests={onOpenRequests}
        total={data?.totalCount ?? null}
      />
      {error && (
        <div role="alert" className="inline-error">
          {error}
        </div>
      )}
      <SupplierQuotesFilters
        search={search}
        status={status}
        onSearchChange={setSearch}
        onSearchApply={() => {
          setPage(1);
          setFilter(search.trim());
        }}
        onStatusChange={(value) => {
          setPage(1);
          setStatus(value);
        }}
      />
      <div
        className={`supplier-quotes-workspace${selected ? " has-selection" : ""}`}
      >
        <section
          className="supplier-quotes-list list-v2-list"
          aria-label="Tedarikçi teklif listesi"
        >
          <SupplierQuotesTable
            items={data?.items ?? []}
            fields={screenFields}
            loading={loading}
            selectedId={selected?.id}
            onSelect={setSelected}
          />
          <ListPagination
            page={page}
            total={data?.totalCount ?? 0}
            pageSize={50}
            loading={loading}
            onPageChange={setPage}
          />
        </section>
        {selected && (
          <SupplierQuoteDetailPane
            selected={selected}
            detail={detail}
            onOpenRequests={onOpenRequests}
          />
        )}
      </div>
    </div>
  );
}
