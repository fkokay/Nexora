import { Factory, Plus, RefreshCw } from "lucide-react";

type Props = {
  title: string;
  description: string;
  showRecipeScope: boolean;
  showCreateRecipe: boolean;
  showRecipeListBack: boolean;
  showCreateWorkCenter: boolean;
  showWorkCenterListBack: boolean;
  busy: boolean;
  onCreateRecipe: () => void;
  onBackToRecipeList: () => void;
  onCreateWorkCenter: () => void;
  onBackToWorkCenterList: () => void;
  onRefresh: () => void;
};

export default function ManufacturingPageHeader({
  title,
  description,
  showRecipeScope,
  showCreateRecipe,
  showRecipeListBack,
  showCreateWorkCenter,
  showWorkCenterListBack,
  busy,
  onCreateRecipe,
  onBackToRecipeList,
  onCreateWorkCenter,
  onBackToWorkCenterList,
  onRefresh,
}: Props) {
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
