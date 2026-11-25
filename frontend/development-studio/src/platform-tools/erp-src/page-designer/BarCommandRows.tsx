import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { ConditionBuilder, type ConditionPath } from "./ConditionBuilder";
import { BAR_COMMAND_IDS, getCommandCondition, isCommandHidden, setCommandCondition, setCommandHidden, type BarCommandId, type BarConditionId } from "./barLook";

/**
 * İşlem Çubuğu komutları: ERP'deki sabit sıra ve kısayollar; "Kaydettikten sonra" çubukta düğme değildir (göz ve koşul yok).
 * "Kaydet ve yeni" İşlemler menüsündedir: koşulu olur, gözü olmaz (`hiddenCommands` almaz).
 */
export const BAR_COMMAND_ROWS: readonly { id: BarConditionId | "afterSave"; label: string; key?: string }[] = [
  { id: "new", label: "Yeni", key: "F2" }, { id: "open", label: "Düzenle", key: "Enter" }, { id: "view", label: "Görüntüle", key: "Shift+Enter" },
  { id: "save", label: "Kaydet", key: "Ctrl+S" },
  { id: "saveNew", label: "Kaydet ve yeni", key: "Ctrl+F2" },
  { id: "delete", label: "Sil", key: "Ctrl+Del" }, { id: "refresh", label: "Yenile", key: "F5" }, { id: "filter", label: "Filtre", key: "Ctrl+F" },
  { id: "print", label: "Yazdır", key: "Ctrl+P" }, { id: "export", label: "Excel", key: "Ctrl+E" }, { id: "more", label: "İşlemler", key: "Alt+İ" },
  { id: "afterSave", label: "Kaydettikten sonra" },
];

/**
 * Komutlar sekmesinin listesi: satır başına göz (`hiddenCommands`), ad + kısayol, tek satırlık özet ve ok. Satıra tıklanınca açılır
 * (aynı anda tek satır); açık satırda önce "Bu komut ne zaman görünsün" (`commandWhen`), sonra `renderDetail(id)` çizilir.
 */
export function BarCommandRows({ props, summaries, renderDetail, paths, pageNames, disabled, onPatch }: {
  props: Record<string, unknown>; summaries: Record<string, string>; renderDetail: (id: string) => ReactNode;
  paths: ConditionPath[]; pageNames: string[]; disabled?: boolean; onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // "Koşula göre" seçilip henüz koşul yazılmamış komutlar (koşul yazılınca commandWhen'den okunur).
  const [conditional, setConditional] = useState<Record<string, boolean>>({});

  return <div className="pd-cmd-rows" role="list">
    {BAR_COMMAND_ROWS.map(({ id, label, key }) => {
      const command = id === "afterSave" ? null : id;
      const eye = (BAR_COMMAND_IDS as readonly string[]).includes(id) ? id as BarCommandId : null;
      const hidden = eye !== null && isCommandHidden(props.hiddenCommands, eye);
      const condition = command === null ? undefined : getCommandCondition(props.commandWhen, command);
      const open = openId === id;
      const byCondition = condition !== undefined || conditional[id] === true;
      return <div key={id} role="listitem" className={`pd-cmd-row${hidden ? " is-hidden" : ""}${open ? " is-open" : ""}`}>
        <div className="pd-cmd-row-head">
          {eye !== null
            ? <button type="button" className="pd-cmd-eye" aria-label={hidden ? "Göster" : "Gizle"} title={hidden ? `${label} çubukta gösterilsin` : `${label} çubukta gizlensin`}
              aria-pressed={hidden} disabled={disabled} onClick={() => onPatch({ hiddenCommands: setCommandHidden(props.hiddenCommands, eye, !hidden) })}>
              {hidden ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
            : <span className="pd-cmd-eye is-none" aria-hidden="true"/>}
          <button type="button" className="pd-cmd-row-main" aria-expanded={open} onClick={() => setOpenId(open ? null : id)}>
            <span className="pd-cmd-row-title">
              <b className="pd-cmd-name">{label}</b>{key && <span className="pd-action-key">{key}</span>}
              {condition !== undefined && <span className="pd-cmd-chip">Koşul</span>}
              {hidden && <span className="pd-cmd-hidden-note">Çubukta gizli</span>}
            </span>
            {summaries[id] && <small className="pd-cmd-summary">{summaries[id]}</small>}
            <span className="pd-cmd-chevron" aria-hidden="true">{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}</span>
          </button>
        </div>
        {open && <div className="pd-cmd-row-detail">
          {command !== null && <div className="pd-field">Bu komut ne zaman görünsün
            <div className="pd-segment" role="group" aria-label="Bu komut ne zaman görünsün">
              <button type="button" disabled={disabled} aria-pressed={!byCondition} className={byCondition ? "" : "active"}
                onClick={() => { setConditional((state) => ({ ...state, [id]: false })); if (condition !== undefined) onPatch({ commandWhen: setCommandCondition(props.commandWhen, command, undefined) }); }}>Her zaman</button>
              <button type="button" disabled={disabled} aria-pressed={byCondition} className={byCondition ? "active" : ""}
                onClick={() => setConditional((state) => ({ ...state, [id]: true }))}>Koşula göre</button>
            </div>
            {byCondition && <ConditionBuilder key={id} value={condition} paths={paths} pageNames={pageNames} disabled={disabled} prop="commandWhen"
              onChange={(next) => onPatch({ commandWhen: setCommandCondition(props.commandWhen, command, next) })}/>}
          </div>}
          {renderDetail(id)}
        </div>}
      </div>;
    })}
  </div>;
}
