import { useState, type ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type {
  Contract,
  ContractStatus,
  Page,
  ScreenField,
  Translate,
} from "../types";

type Props = {
  tx: Translate;
  /** Text typed into the search box. */
  search: string;
  setSearch: (value: string) => void;
  /** Search text applied to the list query. */
  query: string;
  setQuery: (value: string) => void;
  onRefresh: () => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  labels: Record<ContractStatus, string>;
  pageNumber: number;
  setPageNumber: (value: number) => void;
  pageSize: number;
  setPageSize: (value: number) => void;
  page: Page | null;
  loading: boolean;
  detailLoading: boolean;
  visibleFields: ScreenField[];
  filtered: Contract[];
  hasFilters: boolean;
  canEdit: boolean;
  setGridSort: (value: { field: string; direction: "asc" | "desc" }) => void;
  renderField: (item: Contract, field: ScreenField) => ReactNode;
};

export default function ContractsListPanel(props: Props) {
  const {
    tx,
    search,
    setSearch,
    query,
    setQuery,
    onRefresh,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    labels,
    pageNumber,
    setPageNumber,
    pageSize,
    setPageSize,
    page,
    loading,
    detailLoading,
    visibleFields,
    filtered,
    hasFilters,
    canEdit,
    setGridSort,
    renderField,
  } = props;
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchApply={() => {
          setQuery(search);
          setPageNumber(1);
        }}
        searchLabel={tx("Kod veya cari hesapta ara")}
        searchPlaceholder={tx("Kod veya cari ara")}
        toolsSlotRef={setToolsSlot}
        onRefresh={() => {
          if (!loading) onRefresh();
        }}
      >
        <ListChipGroup
          label={tx("Tür filtresi")}
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value);
            setPageNumber(1);
          }}
          options={[
            { value: "", label: tx("Tüm türler") },
            { value: "Sales", label: tx("Satış") },
            { value: "Purchase", label: tx("Satın alma") },
          ]}
        />
        <ListChipGroup
          label={tx("Durum filtresi")}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPageNumber(1);
          }}
          allowClear
          options={Object.entries(labels).map(([key, label]) => ({
            value: key,
            label,
          }))}
        />
      </ListToolbar>
      <section className="contracts-panel list-v2-list">
      <div
        className="contracts-table-wrap"
        role="region"
        aria-label={tx("Sözleşme listesi")}
        tabIndex={0}
        aria-busy={loading || detailLoading}
      >
        <AdvancedDataGrid
          hideSearch
          className="customer-table"
          gridId="commercial-contracts"
          {...screenViewGridDefaults(visibleFields)}
          toolbarContainer={toolsSlot}
          serverData={{
            page: page?.page ?? pageNumber,
            pageSize: page?.pageSize ?? pageSize,
            total: page?.total ?? 0,
            search: query,
            loading,
            sortableColumns: visibleFields
              .map((field, index) => (field.key === "actions" ? -1 : index))
              .filter((index) => index >= 0),
            supported: { filters: false, sorting: true },
            onQueryChange: (next) => {
              setQuery(next.search);
              setPageNumber(next.page);
              setPageSize(next.pageSize);
              const sort = next.sorts[0],
                field = visibleFields[sort?.index ?? -1]?.key;
              if (sort && field && field !== "actions")
                setGridSort({ field, direction: sort.direction });
            },
          }}
        >
          <thead>
            <ScreenViewGroupHeader fields={visibleFields} />
            <tr>
              {visibleFields.map((field) => (
                <th key={field.key} scope="col">
                  {field.key === "actions" ? (
                    <span className="sr-only">{field.label}</span>
                  ) : (
                    field.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={loading}>
            {loading ? (
              <tr>
                <td
                  colSpan={visibleFields.length}
                  className="table-empty"
                  role="status"
                  aria-live="polite"
                >
                  {tx("Sözleşmeler yükleniyor…")}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleFields.length}
                  className="table-empty"
                  role="status"
                >
                  {hasFilters
                    ? tx("Seçili filtrelerle eşleşen sözleşme bulunamadı.")
                    : tx("Henüz sözleşme bulunmuyor.")}
                  {hasFilters && (
                    <button
                      type="button"
                      className="contracts-clear-filters"
                      onClick={() => {
                        setSearch("");
                        setQuery("");
                        setTypeFilter("");
                        setStatusFilter("");
                        setPageNumber(1);
                      }}
                    >
                      {tx("Filtreleri temizle")}
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  {visibleFields.map((field) => (
                    <td key={field.key}>{renderField(item, field)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
      {canEdit && (
        <footer className="contracts-foot">
          <span>
            {tx(
              "Oluşturma ve durum değiştirme işlemleri firma yöneticisine açıktır.",
            )}
          </span>
        </footer>
      )}
      </section>
    </>
  );
}
