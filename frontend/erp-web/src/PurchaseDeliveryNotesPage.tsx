import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link2Off, X } from "lucide-react";
import { authenticatedFetch } from "./authApi";
import { localDateString } from "./dateUtils";
import type { GridExportActions } from "./AdvancedDataGrid";
import { ListSummaryCards } from "./list-page/ListSummaryCards";
import { ListToolbar } from "./list-page/ListToolbar";
import { PageCommandsSlot, confirmStartNew, documentOpenCommands } from "./commands/PageCommandsSlot";
import { csvExportCommand, focusedRecordId } from "./commands/gridCommands";
import type { MenuCommand, PageCommands } from "./commands/types";
import { useSalesListPanel } from "./sales/useSalesListPanel";
import { SalesListPanelToggle } from "./sales/components/SalesListDetailPanel";
import "./sales/sales-list-v2.css";
import "./purchase-delivery-notes.css";
import { DeliveryNoteComposePanel } from "./purchase-delivery-notes/components/DeliveryNoteComposePanel";
import { DeliveryNoteCreateView } from "./purchase-delivery-notes/components/DeliveryNoteCreateView";
import { DeliveryNoteDocument } from "./purchase-delivery-notes/components/DeliveryNoteDocument";
import { DeliveryNotesListPanel } from "./purchase-delivery-notes/components/DeliveryNotesListPanel";
import { OrderDeliveryNotesPanel } from "./purchase-delivery-notes/components/OrderDeliveryNotesPanel";
import { OrderSelectionPanel } from "./purchase-delivery-notes/components/OrderSelectionPanel";
import { PurchaseDeliveryNotesHeader } from "./purchase-delivery-notes/components/PurchaseDeliveryNotesHeader";
import {
  PurchaseDeliveryNoteListPanel,
  PurchaseDeliveryNoteListPanelEmpty,
} from "./purchasing/purchaseDeliveryNotePanel";
import {
  deliveryNotePageSize,
  detailGridDefaults,
  purchaseNoteDefaultFields,
} from "./purchase-delivery-notes/types";
import type {
  Note,
  NotePage,
  OrderDetail,
  OrderSummary,
  ScreenField,
} from "./purchase-delivery-notes/types";
import { problemDetail } from "./erpApi";
import { usePurchasingPageParams } from "./sales/purchasingPageParams";

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      title?: string;
    } | null;
    throw new Error(
      body?.error || problemDetail(body) || `İstek başarısız (${response.status}).`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export default function PurchaseDeliveryNotesPage({
  token,
}: {
  token: string;
}) {
  const [orders, setOrders] = useState<OrderSummary[]>([]),
    [orderId, setOrderId] = useState(""),
    [orderQuery, setOrderQuery] = useState(""),
    [orderPage, setOrderPage] = useState(1),
    [orderTotal, setOrderTotal] = useState(0),
    [detail, setDetail] = useState<OrderDetail | null>(null),
    [notes, setNotes] = useState<Note[]>([]),
    [selectedNote, setSelectedNote] = useState<Note | null>(null),
    [noteDetailLoading, setNoteDetailLoading] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState<Note[]>([]),
    [noteTotal, setNoteTotal] = useState(0),
    [notePage, setNotePage] = useState(1),
    [noteSearch, setNoteSearch] = useState(""),
    [noteSearchResults, setNoteSearchResults] = useState<Note[] | null>(null),
    [noteSearchTotal, setNoteSearchTotal] = useState(0),
    [noteSearchPage, setNoteSearchPage] = useState(1),
    [noteListLoading, setNoteListLoading] = useState(false);
  const [documentNumber, setDocumentNumber] = useState(""),
    [documentDate, setDocumentDate] = useState(localDateString()),
    [receiptId, setReceiptId] = useState(""),
    [quantities, setQuantities] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mutationOrderError, setMutationOrderError] = useState(""),
    [notice, setNotice] = useState("");
  // List type (mockup 07): the current row (click, ↑/↓) and ticked rows; the create view replaces the list.
  const [creating, setCreating] = useState(false),
    [currentId, setCurrentId] = useState<string | null>(null),
    [ticked, setTicked] = useState<string[]>([]),
    [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const gridExportRef = useRef<GridExportActions | null>(null);
  const [screenFields, setScreenFields] = useState<ScreenField[]>(
    purchaseNoteDefaultFields,
  );
  const [detailGridFields, setDetailGridFields] =
    useState<Record<string, ScreenField[]>>(detailGridDefaults);
  const visibleScreenFields = screenFields
    .filter((field) => field.visible || field.fixed)
    .sort((a, b) => a.position - b.position);
  const visibleDetailFields = (key: string) =>
    (detailGridFields[key] || detailGridDefaults[key])
      .filter((field) => field.visible || field.fixed)
      .sort((a, b) => a.position - b.position);
  const orderLoadSequence = useRef(0);
  const orderSelectionGeneration = useRef(0);
  const noteDetailSequence = useRef(0);
  // The search runs while typing, so a slower earlier response must not win.
  const noteSearchSequence = useRef(0);
  const noteSearchPending = useRef(0);

  const loadDeliveryNotes = useCallback(
    async (page: number) => {
      setNoteListLoading(true);
      setError("");
      try {
        const requestedPage = Math.max(1, page);
        let currentPage = requestedPage;
        let result = await request<NotePage>(
          `/api/purchasing/delivery-notes/?page=${currentPage}&pageSize=${deliveryNotePageSize}`,
          token,
        );
        const lastPage = Math.max(
          1,
          Math.ceil(result.totalCount / deliveryNotePageSize),
        );
        if (currentPage > lastPage) {
          currentPage = lastPage;
          result = await request<NotePage>(
            `/api/purchasing/delivery-notes/?page=${lastPage}&pageSize=${deliveryNotePageSize}`,
            token,
          );
        }
        while (
          result.items.length === 0 &&
          result.totalCount > 0 &&
          currentPage > 1
        ) {
          currentPage--;
          result = await request<NotePage>(
            `/api/purchasing/delivery-notes/?page=${currentPage}&pageSize=${deliveryNotePageSize}`,
            token,
          );
        }
        if (currentPage !== requestedPage) setNotePage(currentPage);
        setDeliveryNotes(result.items);
        setNoteTotal(result.totalCount);
      } catch (e) {
        setDeliveryNotes([]);
        setNoteTotal(0);
        setError((e as Error).message);
      } finally {
        setNoteListLoading(false);
      }
    },
    [token],
  );

  const loadOrders = useCallback(
    async (pageNumber = 1, query = orderQuery) => {
      setLoading(true);
      setError("");
      try {
        const page = await request<{
          items: OrderSummary[];
          page: number;
          totalCount: number;
        }>(
          `/api/purchasing/orders/?q=${encodeURIComponent(query.trim())}&page=${pageNumber}&pageSize=25`,
          token,
        );
        setOrders(page.items);
        setOrderPage(page.page);
        setOrderTotal(page.totalCount);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [orderQuery, token],
  );

  const loadOrder = useCallback(
    async (id: string, postMutation = false) => {
      const sequence = ++orderLoadSequence.current;
      setDetail(null);
      setNotes([]);
      setReceiptId("");
      setQuantities({});
      if (!id) {
        setError("");
        setMutationOrderError("");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      if (postMutation) setMutationOrderError("");
      try {
        const [order, items] = await Promise.all([
          request<OrderDetail>(`/api/purchasing/orders/${id}`, token),
          request<Note[]>(`/api/purchasing/delivery-notes/orders/${id}`, token),
        ]);
        if (sequence !== orderLoadSequence.current) return;
        setDetail(order);
        setNotes(items);
      } catch (e) {
        if (sequence === orderLoadSequence.current) {
          setDetail(null);
          setNotes([]);
          if (postMutation) setMutationOrderError((e as Error).message);
          else setError((e as Error).message);
        }
      } finally {
        if (sequence === orderLoadSequence.current) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);
  useEffect(() => {
    void loadDeliveryNotes(notePage);
  }, [loadDeliveryNotes, notePage]);
  useEffect(() => {
    let active = true;
    void request<{ fields: ScreenField[] }>(
      "/api/screen-views/purchase-delivery-notes/active",
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
    let active = true;
    void Promise.all(
      Object.keys(detailGridDefaults).map(async (key) => {
        try {
          const view = await request<{ fields: ScreenField[] }>(
            `/api/screen-views/${key}/active`,
            token,
          );
          if (active && view.fields?.length)
            setDetailGridFields((current) => ({
              ...current,
              [key]: view.fields,
            }));
        } catch {}
      }),
    );
    return () => {
      active = false;
    };
  }, [token]);

  async function loadDeliveryNoteSearch(page: number, query = noteSearch) {
    const term = query.trim();
    if (!term) {
      clearDeliveryNoteSearch();
      return;
    }
    const sequence = ++noteSearchSequence.current;
    noteSearchPending.current++;
    setNoteListLoading(true);
    setError("");
    try {
      const result = await request<NotePage>(
        `/api/purchasing/delivery-notes/?q=${encodeURIComponent(term)}&page=${page}&pageSize=${deliveryNotePageSize}`,
        token,
      );
      if (sequence !== noteSearchSequence.current) return;
      setNoteSearchResults(result.items);
      setNoteSearchTotal(result.totalCount);
      setNoteSearchPage(result.page);
    } catch (e) {
      if (sequence !== noteSearchSequence.current) return;
      setNoteSearchResults(null);
      setNoteSearchTotal(0);
      setError((e as Error).message);
    } finally {
      noteSearchPending.current--;
      if (sequence === noteSearchSequence.current) setNoteListLoading(false);
    }
  }

  function applyDeliveryNoteSearch() {
    const term = noteSearch.trim();
    if (!term) {
      clearDeliveryNoteSearch();
      return;
    }
    void loadDeliveryNoteSearch(1, term);
  }
  function clearDeliveryNoteSearch() {
    // Drops a search that is still in flight; its response is ignored, so the
    // loading flag it raised is lowered here.
    noteSearchSequence.current++;
    if (noteSearchPending.current > 0) setNoteListLoading(false);
    setNoteSearch("");
    setNoteSearchResults(null);
    setNoteSearchTotal(0);
    setNoteSearchPage(1);
    setNotePage(1);
  }
  function closeDeliveryNoteDetail() {
    noteDetailSequence.current++;
    setSelectedNote(null);
    setNoteDetailLoading(false);
  }
  function selectOrder(id: string) {
    if (id !== orderId) {
      orderSelectionGeneration.current++;
      closeDeliveryNoteDetail();
      setDocumentNumber("");
      setNotice("");
      setError("");
      setMutationOrderError("");
    }
    setOrderId(id);
    void loadOrder(id);
  }
  async function openDeliveryNote(note: Note) {
    const sequence = ++noteDetailSequence.current;
    setSelectedNote(note);
    setNoteDetailLoading(true);
    try {
      const result = await request<Note>(
        `/api/purchasing/delivery-notes/${note.id}`,
        token,
      );
      if (sequence === noteDetailSequence.current) setSelectedNote(result);
    } catch (e) {
      if (sequence === noteDetailSequence.current) {
        setError((e as Error).message);
        setSelectedNote(null);
      }
    } finally {
      if (sequence === noteDetailSequence.current) setNoteDetailLoading(false);
    }
  }
  async function refreshDeliveryNotes() {
    noteSearchSequence.current++;
    setNoteSearch("");
    setNoteSearchResults(null);
    setNoteSearchPage(1);
    if (notePage === 1) await loadDeliveryNotes(1);
    else setNotePage(1);
  }
  async function reloadMutatedOrder(id: string, generation: number) {
    if (generation === orderSelectionGeneration.current)
      await loadOrder(id, true);
  }
  const noteEligibleOrders = orders.filter(
    (order) =>
      !["Cancelled", "PendingApproval", "Rejected"].includes(order.status),
  );

  async function createNote(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    const orderToReload = detail.id,
      generation = orderSelectionGeneration.current;
    const lines = detail.lines.flatMap((line) => {
      const quantity = Number(quantities[line.lineNumber] || 0);
      return quantity > 0
        ? [
            {
              orderLineNumber: line.lineNumber,
              quantity,
              unitCode: line.unitCode,
            },
          ]
        : [];
    });
    if (!lines.length) {
      setError("İrsaliyeye en az bir satır miktarı girin.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/purchasing/delivery-notes/orders/${orderToReload}`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            documentNumber,
            documentDate,
            lines,
            purchaseReceiptId: receiptId || null,
          }),
        },
      );
      if (generation === orderSelectionGeneration.current) {
        setNotice(
          receiptId
            ? "İrsaliye kaydedildi ve stok hareketi oluşturmadan mal kabul ile mutabık hale getirildi."
            : "İrsaliye kaydedildi; stok girişi mal kabul işleminde yapılır.",
        );
        setDocumentNumber("");
        setQuantities({});
      }
      await refreshDeliveryNotes();
      await reloadMutatedOrder(orderToReload, generation);
    } catch (e) {
      if (generation === orderSelectionGeneration.current)
        setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function linkNote(note: Note) {
    if (!detail || !receiptId) return;
    const orderToReload = detail.id,
      generation = orderSelectionGeneration.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/purchasing/delivery-notes/${note.id}/link-receipt`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ purchaseReceiptId: receiptId }),
        },
      );
      if (generation === orderSelectionGeneration.current)
        setNotice(
          "İrsaliye mal kabule bağlandı; yeni stok hareketi oluşturulmadı.",
        );
      await refreshDeliveryNotes();
      await reloadMutatedOrder(orderToReload, generation);
    } catch (e) {
      if (generation === orderSelectionGeneration.current)
        setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlinkNote(note: Note) {
    if (!detail) return;
    const orderToReload = detail.id,
      generation = orderSelectionGeneration.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(
        `/api/purchasing/delivery-notes/${note.id}/unlink-receipt`,
        token,
        { method: "POST" },
      );
      if (generation === orderSelectionGeneration.current)
        setNotice("Mal kabul bağlantısı kaldırıldı; irsaliye kaydı korundu.");
      await refreshDeliveryNotes();
      await reloadMutatedOrder(orderToReload, generation);
    } catch (e) {
      if (generation === orderSelectionGeneration.current)
        setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Action bar: the list (Yeni opens the create view, Aç the current note), an open note, or the create view (its
  // form registers Kaydet; Yeni starts a fresh note on the same order). A delivery note has no delete endpoint.
  const shownNotes = noteSearchResults ?? deliveryNotes;
  const current = shownNotes.find((note) => note.id === currentId);
  const target = selectedNote ?? current ?? (ticked.length === 1 ? shownNotes.find((note) => note.id === ticked[0]) : undefined);
  const listActive = !creating && !selectedNote;
  const formDirty = Boolean(documentNumber.trim() || Object.values(quantities).some((value) => Number(value) > 0));
  function startCreate(orderToOpen?: string) {
    closeDeliveryNoteDetail();
    setCreating(true);
    if (orderToOpen) selectOrder(orderToOpen);
  }
  // A system page opens this tab with `purchaseOrderId` (K7): the create / link view opens on that order.
  usePurchasingPageParams("sales-purchase-delivery-notes", ["purchaseOrderId"], ({ purchaseOrderId }) => { if (purchaseOrderId) startCreate(purchaseOrderId); });
  const commands: PageCommands = {};
  const more: MenuCommand[] = [];
  if (creating) {
    commands.new = {
      run: async () => {
        if (!(await confirmStartNew(formDirty))) return;
        setDocumentNumber("");
        setQuantities({});
        setNotice("");
        setError("");
      },
    };
  } else {
    commands.new = { primary: !selectedNote, run: () => startCreate() };
    commands.delete = {
      disabledReason: target
        ? "İrsaliye kaydı silinemez — mal kabul bağlantısı İşlemler › Siparişi aç'ta yönetilir"
        : "Önce bir kayıt seçin",
    };
    if (selectedNote) {
      Object.assign(commands, documentOpenCommands(() => openDeliveryNote(selectedNote)));
    } else {
      commands.open = {
        disabledReason: target ? undefined : "Önce bir kayıt seçin",
        run: () => {
          const id = focusedRecordId() ?? target?.id;
          const note = shownNotes.find((item) => item.id === id);
          if (note) return openDeliveryNote(note);
        },
      };
    }
    if (target)
      more.push({ id: "delivery-note-open-order", label: "Siparişi aç", run: () => startCreate(target.purchaseOrderId) });
    if (!selectedNote) more.push(csvExportCommand(gridExportRef));
  }
  commands.more = more;

  const panel = useSalesListPanel<Note>({
    active: listActive,
    token,
    currentId: current?.id ?? null,
    path: (id) => `/api/purchasing/delivery-notes/${id}`,
    reloadKey: current ? JSON.stringify(current) : undefined,
  });
  const listPanel =
    panel.open && listActive ? (
      current ? (
        <PurchaseDeliveryNoteListPanel
          row={current}
          detail={panel.detail}
          error={panel.error}
          onOpen={() => void openDeliveryNote(current)}
          onClose={panel.close}
          takeFocus={panel.takeFocus}
        />
      ) : (
        <PurchaseDeliveryNoteListPanelEmpty />
      )
    ) : null;
  const searching = noteSearchResults !== null;

  return (
    <div className="purchase-delivery-notes-page list-v2">
      <PageCommandsSlot commands={commands} />
      {creating ? (
        <DeliveryNoteCreateView
          detail={detail}
          documentNumber={documentNumber}
          busy={busy}
          error={mutationOrderError || error}
          notice={notice}
          dirty={formDirty}
          onSubmit={(event) => {
            void createNote(event);
          }}
          onCancel={() => setCreating(false)}
          onDismissError={() => {
            setError("");
            setMutationOrderError("");
          }}
        >
          <OrderSelectionPanel
            orders={noteEligibleOrders}
            orderId={orderId}
            query={orderQuery}
            page={orderPage}
            total={orderTotal}
            loading={loading}
            onQueryChange={setOrderQuery}
            onSearch={() => {
              void loadOrders(1, orderQuery);
            }}
            onSelect={selectOrder}
            onRefresh={() => {
              void loadOrders(orderPage);
            }}
            onPageChange={(page) => {
              void loadOrders(page);
            }}
          />
          {detail && (
            <>
              <DeliveryNoteComposePanel
                detail={detail}
                notes={notes}
                receiptId={receiptId}
                quantities={quantities}
                documentNumber={documentNumber}
                documentDate={documentDate}
                fields={visibleDetailFields("purchase-delivery-order-lines")}
                onDocumentNumberChange={setDocumentNumber}
                onDocumentDateChange={setDocumentDate}
                onReceiptChange={setReceiptId}
                onQuantityChange={(lineNumber, value) =>
                  setQuantities((current) => ({ ...current, [lineNumber]: value }))
                }
              />
              <OrderDeliveryNotesPanel
                detail={detail}
                notes={notes}
                fields={visibleDetailFields("purchase-order-delivery-notes")}
                receiptId={receiptId}
                busy={busy}
                onReceiptChange={setReceiptId}
                onLink={(note) => {
                  void linkNote(note);
                }}
                onUnlink={(note) => {
                  void unlinkNote(note);
                }}
              />
            </>
          )}
        </DeliveryNoteCreateView>
      ) : (
        <>
          <div className="sales-lv2-stack">
            <PurchaseDeliveryNotesHeader
              total={noteListLoading && noteTotal === 0 ? null : noteTotal}
            />
            <ListSummaryCards
              cards={[
                {
                  id: "unlinked",
                  label: "Bağlantısı yok",
                  value: noteListLoading ? "—" : shownNotes.filter((note) => !note.purchaseReceiptId).length.toLocaleString("tr-TR"),
                  icon: Link2Off,
                  tone: "warn",
                  hint: "bu sayfa",
                },
              ]}
            />
            <ListToolbar
              search={noteSearch}
              onSearchChange={setNoteSearch}
              onSearchApply={applyDeliveryNoteSearch}
              searchLabel="Gelen irsaliyelerde ara"
              searchPlaceholder="İrsaliye no, sipariş, tedarikçi veya mal kabul ara"
              toolsSlotRef={setToolsSlot}
              onRefresh={() => {
                if (noteListLoading) return;
                void loadOrders();
                void refreshDeliveryNotes();
              }}
            >
              <SalesListPanelToggle open={panel.open} onToggle={panel.toggle} />
            </ListToolbar>
          </div>
          {(mutationOrderError || error) && (
            <div className="alert inline-alert" role="alert">
              {mutationOrderError || error}
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => {
                  setError("");
                  setMutationOrderError("");
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div ref={panel.rootRef} className={`sales-list-body${listPanel ? " has-detail" : ""}`}>
            <DeliveryNotesListPanel
              fields={visibleScreenFields.filter((field) => field.key !== "actions")}
              rows={shownNotes}
              searching={searching}
              page={searching ? noteSearchPage : notePage}
              total={searching ? noteSearchTotal : noteTotal}
              loading={noteListLoading}
              currentId={currentId}
              ticked={ticked.length}
              listActive={listActive}
              exportActionsRef={gridExportRef}
              toolbarContainer={toolsSlot}
              onCurrentChange={setCurrentId}
              onTickedChange={setTicked}
              onPageChange={(page) =>
                noteSearchResults === null
                  ? setNotePage(page)
                  : void loadDeliveryNoteSearch(page)
              }
              onOpenNote={(note) => {
                void openDeliveryNote(note);
              }}
            />
            {listPanel}
          </div>
        </>
      )}
      {selectedNote && (
        <DeliveryNoteDocument
          note={selectedNote}
          loading={noteDetailLoading}
          fields={visibleDetailFields("purchase-delivery-note-lines")}
          onClose={closeDeliveryNoteDetail}
        />
      )}
    </div>
  );
}
