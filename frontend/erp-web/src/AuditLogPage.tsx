import React, { useEffect, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { api } from "./erpApi";
import type * as AppTypes from "./erp-types";
import { AuditLogFilters } from "./audit-log/components/AuditLogFilters";
import { AuditRetentionSettings } from "./audit-log/components/AuditRetentionSettings";
import { AuditEventGrid } from "./audit-log/components/AuditEventGrid";
import { AuditEventDetail } from "./audit-log/components/AuditEventDetail";
import type { AuditEvent, AuditRetentionPolicy } from "./audit-log/types";
import { ListPageHeader } from "./list-page/ListPageHeader";
import "./audit-log/audit-log-list-v2.css";
type AuditEventPage = AppTypes.AuditEventPage;

export function AuditLogPage({ token }: { token: string }) {
  const [items, setItems] = useState<AuditEvent[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [selectedAuditId, setSelectedAuditId] = useState<number | null>(null);
  const [retention, setRetention] = useState<AuditRetentionPolicy | null>(null),
    [retentionDays, setRetentionDays] = useState("365"),
    [retentionBusy, setRetentionBusy] = useState(false),
    [retentionError, setRetentionError] = useState(""),
    [retentionNotice, setRetentionNotice] = useState("");
  const [gridToolsSlot, setGridToolsSlot] = useState<HTMLDivElement | null>(
    null,
  );
  async function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (filter) params.set("q", filter);
    try {
      const result = await api<AuditEventPage>(
        `/api/audit-events?${params}`,
        token,
      );
      setItems(result.items);
      setTotal(result.totalCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function loadRetention() {
    try {
      const policy = await api<AuditRetentionPolicy>(
        "/api/audit-retention",
        token,
      );
      setRetention(policy);
      setRetentionDays(String(policy.retentionDays));
    } catch (e) {
      setRetentionError((e as Error).message);
    }
  }
  async function saveRetention(e: React.FormEvent) {
    e.preventDefault();
    setRetentionBusy(true);
    setRetentionError("");
    setRetentionNotice("");
    try {
      const policy = await api<AuditRetentionPolicy>(
        "/api/audit-retention",
        token,
        {
          method: "PUT",
          body: JSON.stringify({ retentionDays: Number(retentionDays) }),
        },
      );
      setRetention(policy);
      setRetentionDays(String(policy.retentionDays));
      setRetentionNotice(
        "Saklama politikası güncellendi; günlük temizlik bir sonraki 02.00 UTC çalışmasında uygular.",
      );
    } catch (e) {
      setRetentionError((e as Error).message);
    } finally {
      setRetentionBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [token, page, from, to, filter]);
  useEffect(() => {
    void loadRetention();
  }, [token]);
  const selectedAudit =
    items.find((item) => item.id === selectedAuditId) ?? items[0] ?? null;
  return (
    <div className="audit-log-page list-v2">
      <ListPageHeader
        title="İşlem kayıtları"
        description="Seçili firmadaki kullanıcı ve sistem işlemlerinin değiştirilemez kayıtları."
        count={loading && total === 0 ? null : total}
      >
        <span className="audit-page-scope">
          <ShieldCheck size={14} />
          TenantAdmin · Seçili firma
        </span>
      </ListPageHeader>
      {error && (
        <div className="alert inline-alert">
          {error}
          <button onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      <AuditLogFilters
        search={search}
        from={from}
        to={to}
        onSearchChange={setSearch}
        onFromChange={(value) => {
          setPage(1);
          setFrom(value);
        }}
        onToChange={(value) => {
          setPage(1);
          setTo(value);
        }}
        onApply={() => {
          setPage(1);
          setFilter(search.trim());
        }}
        onRefresh={() => void load()}
        toolsSlotRef={setGridToolsSlot}
      />
      <div className="audit-workbench">
        <section
          className="erp-list-pane audit-list-pane list-v2-list"
          aria-label="Denetim kayıtları"
        >
          <AuditEventGrid
            token={token}
            items={items}
            selectedId={selectedAudit?.id ?? null}
            loading={loading}
            toolbarContainer={gridToolsSlot}
            onSelect={setSelectedAuditId}
          />
        </section>
        {selectedAudit && <AuditEventDetail item={selectedAudit} />}
      </div>
      <div className="table-pagination">
        <span>
          {total
            ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} / ${total} kayıt`
            : "0 kayıt"}
        </span>
        <div>
          <button
            className="secondary small-button"
            disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Önceki
          </button>
          <button
            className="secondary small-button"
            disabled={page * 50 >= total || loading}
            onClick={() => setPage(page + 1)}
          >
            Sonraki
          </button>
        </div>
      </div>
      <AuditRetentionSettings
        retention={retention}
        retentionDays={retentionDays}
        busy={retentionBusy}
        error={retentionError}
        notice={retentionNotice}
        onDaysChange={setRetentionDays}
        onClearError={() => setRetentionError("")}
        onClearNotice={() => setRetentionNotice("")}
        onSubmit={saveRetention}
      />
    </div>
  );
}
