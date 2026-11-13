import { Factory, Plus, RefreshCw } from "lucide-react";
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
