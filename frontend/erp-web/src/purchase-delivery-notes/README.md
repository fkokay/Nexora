# Purchase delivery notes UI

`PurchaseDeliveryNotesPage.tsx` owns loading, search, selection, the action bar and mutation state. It has three views
(mockups 07 / 02):

- **List** (list type, as the Satış lists): `components/DeliveryNotesListPanel.tsx` on `SalesDocumentGrid` (checkbox
  column, current row, double-click / Enter / number link opens), the right panel from
  `src/purchasing/purchaseDeliveryNotePanel.tsx`, one page card ("Bağlantısı yok · bu sayfa"). A note has no status: the
  tag is derived from its receipt link ("Mal kabul eşleşti" ok / "Bağlantısı yok" warn). There is no amount.
- **Document**: `components/DeliveryNoteDocument.tsx` (`DocumentSurface` detail, no status flow, chain order → note →
  receipt, the tenant's `purchase-delivery-note-lines` grid).
- **Create view**: Yeni (F2) or İşlemler › Siparişi aç opens `components/DeliveryNoteCreateView.tsx` (`RecordFormPage`
  with the document header): order context (`OrderSelectionPanel`, its search is not a nested form), identity and
  line quantities (`DeliveryNoteComposePanel`) and the order's notes with receipt link / unlink
  (`OrderDeliveryNotesPanel`, buttons only). Requests and bodies are unchanged.

Shared record types and default screen-view fields live in `types.ts`.
The page remains the default export consumed by the existing router.
