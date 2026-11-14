import { Factory, History, Plus, RefreshCw } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  title: string;
  description: string;
  /**
   * List pages (recipes, work centers, orders) get the shared list-v2 title row:
   * title, record count and the create action. Refresh sits in their toolbar row.
   */
  listMode?: boolean;
  /** Record count shown next to the title in list mode; null while unknown. */
  listCount?: number | null;
  /** Muted text after the record count (list mode), e.g. "· günlük kapasite 480 dk". */
  listMeta?: string;
  /**
   * Compact list-v2 title row without a record count (material planning): title,
   * muted meta line, plan history and an icon refresh button.
   */
  compactMode?: boolean;
  onShowHistory?: () => void;
  showRecipeScope: boolean;
  showCreateRecipe: boolean;
  showRecipeListBack: boolean;
  showCreateWorkCenter: boolean;
  showWorkCenterListBack: boolean;
  showCreateOrder: boolean;
  showOrderListBack: boolean;
  showOrderSave: boolean;
  canSaveOrder: boolean;
  busy: boolean;
  onCreateRecipe: () => void;
  onBackToRecipeList: () => void;
  onCreateWorkCenter: () => void;
  onBackToWorkCenterList: () => void;
  onCreateOrder: () => void;
  onBackToOrderList: () => void;
  onRefresh: () => void;
};

export default function ManufacturingPageHeader({
  title,
  description,
  listMode = false,
  listCount = null,
  listMeta,
  compactMode = false,
  onShowHistory,
  showRecipeScope,
  showCreateRecipe,
  showRecipeListBack,
  showCreateWorkCenter,
  showWorkCenterListBack,
  showCreateOrder,
  showOrderListBack,
  showOrderSave,
  canSaveOrder,
  busy,
  onCreateRecipe,
  onBackToRecipeList,
  onCreateWorkCenter,
  onBackToWorkCenterList,
  onCreateOrder,
  onBackToOrderList,
  onRefresh,
}: Props) {
  if (compactMode)
    return (
      <div className="page-heading list-v2-heading">
        <div className="list-v2-title">
          <h1 title={description}>{title}</h1>
          {listMeta && <span className="list-v2-count">{listMeta}</span>}
        </div>
        <div className="heading-actions">
          {onShowHistory && (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={onShowHistory}
            >
              <History size={15} /> Plan geçmişi
            </button>
          )}
          <button
            className="list-v2-icon-button"
            type="button"
            onClick={onRefresh}
            disabled={busy}
            aria-label="Yenile"
            title="Yenile"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
    );
  if (listMode && listMeta)
    return (
      <div className="page-heading list-v2-heading">
        <div className="list-v2-title">
          <h1 title={description}>{title}</h1>
          {listCount != null && (
            <span className="list-v2-count">
              <span>{listCount.toLocaleString("tr-TR")}</span> <span>kayıt</span>{" "}
              <span>{listMeta}</span>
            </span>
          )}
        </div>
        <div className="heading-actions">
          {/* AdvancedDataGrid portals its XLSX/CSV buttons here. */}
          <span className="list-v2-export-slot" />
          {showCreateWorkCenter && (
            <button
              className="primary"
              type="button"
              onClick={onCreateWorkCenter}
            >
              <Plus size={15} /> İş merkezi tanımla
            </button>
          )}
        </div>
      </div>
    );
  if (listMode)
    return (
      <ListPageHeader title={title} description={description} count={listCount}>
        {showCreateRecipe && (
          <button className="primary" type="button" onClick={onCreateRecipe}>
            <Plus size={15} /> Yeni reçete
          </button>
        )}
        {showCreateWorkCenter && (
          <button
            className="primary"
            type="button"
            onClick={onCreateWorkCenter}
          >
            <Plus size={15} /> İş merkezi tanımla
          </button>
        )}
        {showCreateOrder && (
          <button className="primary" type="button" onClick={onCreateOrder}>
            <Plus size={15} /> Yeni üretim emri
          </button>
        )}
      </ListPageHeader>
    );
  return (
    <header className="manufacturing-hero manufacturing-workbench-header screen-page-header">
      <div className="manufacturing-icon">
        <Factory size={22} />
      </div>
      <div>
        <p className="eyebrow">ÜRETİM YÖNETİMİ · İŞ ALANI</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="manufacturing-header-actions">
        {showRecipeScope && (
          <span className="manufacturing-record-scope">
            Firma kapsamı · Reçeteler
          </span>
        )}
        {showCreateRecipe && (
          <button className="primary" type="button" onClick={onCreateRecipe}>
            <Plus size={15} /> Yeni reçete
          </button>
        )}
        {showRecipeListBack && (
          <button
            className="secondary"
            type="button"
            onClick={onBackToRecipeList}
          >
            Listeye dön
          </button>
        )}
        {showCreateWorkCenter && (
          <button
            className="primary"
            type="button"
            onClick={onCreateWorkCenter}
          >
            <Plus size={15} /> İş merkezi tanımla
          </button>
        )}
        {showWorkCenterListBack && (
          <button
            className="secondary"
            type="button"
            onClick={onBackToWorkCenterList}
          >
            İş merkezlerine dön
          </button>
        )}
        {showCreateOrder && (
          <button className="primary" type="button" onClick={onCreateOrder}>
            <Plus size={15} /> Yeni üretim emri
          </button>
        )}
        {showOrderListBack && (
          <button className="secondary" type="button" onClick={onBackToOrderList}>
            Listeye dön
          </button>
        )}
        {showOrderSave && (
          <button className="primary" type="submit" form="manufacturing-order-create-form" disabled={busy || !canSaveOrder}>
            <Plus size={15} /> Emir planla
          </button>
        )}
        <button
          className="secondary"
          type="button"
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw size={15} /> Yenile
        </button>
      </div>
    </header>
  );
}
