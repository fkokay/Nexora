import { useState } from "react";
import { X } from "lucide-react";
import BindingInput, { type BindingSuggestion } from "./BindingInput";
import { IconSelect, ToneSelect } from "./DesignLanguageFields";
import { queryKindLabels, type PageQuery } from "./QueriesPanel";
import { ALL_KINDS, QueryFieldActions, READ_KINDS, type QueryBinder } from "./QueryEditorDialog";
import { chipSummary, dropOnto, selectableColumns, setVisible, visibleCodes, type ColumnsResult, type SourceColumn } from "./columnEditing";
import { basicFieldsFor, moreSettingsText, type InspectorMode } from "./inspectorBasicFields";
import "./page-designer-extras.css";

type Patch = Record<string, unknown>;

/** Özellikler panelinin üstündeki "Basit | Gelişmiş" seçici. */
export function InspectorModeToggle({ mode, onChange }: { mode: InspectorMode; onChange: (mode: InspectorMode) => void }) {
  return <div className="pd-mode-toggle" role="group" aria-label="Özellikler kipi">
    {([["basic", "Basit"], ["advanced", "Gelişmiş"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} className={mode === value ? "active" : ""} onClick={() => onChange(value)}>{label}</button>)}
  </div>;
}

export type BasicInspectorProps = {
  component: { id: string; type: string; name?: string; props: Record<string, unknown> };
  contentKeys: string[];
  readQueries: PageQuery[];
  queries: PageQuery[];
  /** Izgaranın bağlı sorgusunun sonuç sütunları (önizleme ya da ERP kataloğu). */
  resultColumns: SourceColumn[];
  sourceLabel?: string;
  suggestions: BindingSuggestion[];
  disabled: boolean;
  span: number;
  inputTypeOptions: { value: string; label: string }[];
  onSetInputType: (value: string) => void;
  buttonActionTypes: [string, string][];
  buttonAction: string;
  workflows: { id: string; name: string; code: string }[];
  dialogs: { id: string; label: string }[];
  /** Mevcut select'lerin onChange yaması (sıfırlamalarıyla): ızgara/gösterge sorgusu ve düğmenin sorgusu. */
  bindTable: QueryBinder;
  bindMetric: QueryBinder;
  bindButton: QueryBinder;
  onUpdate: (key: string, value: string | number) => void;
  onPatch: (patch: Patch) => void;
  onAdvanced: () => void;
  onOpenSettings: () => void;
};

const WIDTHS = [3, 4, 6, 8, 9, 12];
const textLabels: Record<string, string> = { title: "Başlık", text: "Metin", label: "Etiket" };

/** Basit kip: bileşen türüne göre seçilmiş birkaç alan (inspectorBasicFields tablosu) ve "Gelişmiş ›" bağlantısı. */
export function BasicInspector(props: BasicInspectorProps) {
  const { component, readQueries, queries, resultColumns, suggestions, disabled, onUpdate, onPatch } = props;
  const p = component.props;
  const [chipProblem, setChipProblem] = useState("");
  const [dragCode, setDragCode] = useState<string | null>(null);
  const fields = basicFieldsFor(component.type, props.contentKeys);
  const queryId = typeof p.query === "string" ? p.query : "";
  const metricValueMode = component.type === "metric" && !queryId && !p.source && typeof p.value === "string";
  const columns = selectableColumns(resultColumns);
  const selected = Array.isArray(p.columns) ? p.columns.filter((item): item is string => typeof item === "string") : [];
  const applyColumns = (result: ColumnsResult) => { if (!result.ok) { setChipProblem(result.error); return; } setChipProblem(""); onPatch({ columns: result.columns }); };
  const target = component.type === "dataTable" ? "Izgara (liste)" : component.type === "metric" ? "Gösterge" : "Düğme";

  const querySelect = (value: string, bind: QueryBinder, kindsLabel: boolean, list: PageQuery[]) => <select value={value} disabled={disabled} aria-label="Sorgu"
    onChange={(event) => { const query = list.find((item) => item.id === event.target.value); if (query) onPatch(bind(query, [])); }}>
    {!value && <option value="">Sorgu seçin</option>}
    {list.map((query) => <option key={query.id} value={query.id}>{query.name}{kindsLabel ? ` (${queryKindLabels[query.kind]})` : ""}</option>)}
  </select>;

  const render = (field: string) => {
    switch (field) {
      case "title": case "text": case "label": {
        const key = field;
        const label = component.type === "button" ? "Etiket" : textLabels[key];
        return <label key={field} className="pd-field">{label}<BindingInput value={String(p[key] ?? "")} suggestions={suggestions} disabled={disabled} ariaLabel={label} maxLength={key === "label" ? 60 : 200} onChange={(next) => onUpdate(key, next)}/></label>;
      }
      case "dataQuery":
        return <div key={field} className="pd-field">Veri
          {p.source && !queryId ? <small>Rapor kaynağı: {props.sourceLabel ?? String(p.source)}. Sorguya geçmek için aşağıdan seçin.</small> : null}
          {querySelect(queryId, props.bindTable, false, readQueries)}
          {readQueries.length === 0 && <small>Henüz okuma sorgusu yok; “Yeni sorgu” ile tanımlayın.</small>}
          <QueryFieldActions kinds={READ_KINDS} target={target} value={queryId} componentId={component.id} bind={props.bindTable} disabled={disabled}/>
        </div>;
      case "columns": {
        if (!queryId) return null;
        if (columns.length === 0) return <div key={field} className="pd-field">Sütunlar<small>Sütunlar sorgunun örnek verisi gelince listelenir.</small></div>;
        const visible = visibleCodes(selected, columns);
        const { shown, more } = chipSummary(visible, 8);
        const hidden = columns.length - visible.length;
        const labelOf = (code: string) => columns.find((column) => column.code === code)?.label || code;
        return <div key={field} className="pd-field">Sütunlar
          <div className="pd-chips">
            {shown.map((code) => <span key={code} className={`pd-chip${dragCode && dragCode !== code ? "" : ""}`} draggable={!disabled}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", code); setDragCode(code); }}
              onDragEnd={() => setDragCode(null)} onDragOver={(event) => { if (dragCode) event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); if (dragCode) { const rect = event.currentTarget.getBoundingClientRect(); applyColumns(dropOnto(selected, columns, dragCode, code, event.clientX > rect.left + rect.width / 2)); } setDragCode(null); }}>
              {labelOf(code)}<button type="button" aria-label={`${labelOf(code)} sütununu gizle`} disabled={disabled} onClick={() => applyColumns(setVisible(selected, columns, [code], false))}><X size={10}/></button>
            </span>)}
            {more > 0 ? <button type="button" className="pd-chip pd-chip-more" onClick={props.onOpenSettings} title="Tüm sütunları düzenle">+ {more}</button>
              : hidden > 0 ? <button type="button" className="pd-chip pd-chip-more" onClick={props.onOpenSettings} title="Gizli sütunları göster">+ {hidden} gizli</button> : null}
          </div>
          <small>Sırayı sürükleyerek değiştirin; gizlemek için çarpıya basın.</small>
          {chipProblem && <small className="pd-query-warning">{chipProblem}</small>}
        </div>;
      }
      case "width":
        return <div key={field} className="pd-field">Genişlik<div className="pd-segment">{WIDTHS.map((width) => <button type="button" key={width} disabled={disabled} className={props.span === width ? "active" : ""} onClick={() => onUpdate("width", width)}>{width} / 12</button>)}</div></div>;
      case "metricValue":
        return <div key={field} className="pd-field">Değer
          {metricValueMode ? <BindingInput value={String(p.value ?? "")} maxLength={200} suggestions={suggestions} disabled={disabled} ariaLabel="Değer" placeholder="{{sayilar.customers}} ya da 42" onChange={(next) => onUpdate("value", next)}/>
            : <>{p.source && !queryId ? <small>Rapor kaynağı: {props.sourceLabel ?? String(p.source)} (kayıt sayısı).</small> : <small>Gösterge, sorgunun ilk satırındaki ilk sütunu gösterir.</small>}
              {querySelect(queryId, props.bindMetric, false, readQueries)}
              <QueryFieldActions kinds={READ_KINDS} target={target} value={queryId} componentId={component.id} bind={props.bindMetric} disabled={disabled}/></>}
        </div>;
      case "icon":
        return <div key={field} className="pd-field">Simge<IconSelect value={typeof p.icon === "string" ? p.icon : undefined} disabled={disabled} onChange={(icon) => onPatch({ icon })}/></div>;
      case "tone":
        return <div key={field} className="pd-field">Ton<ToneSelect value={(["info", "success", "warning", "danger"] as const).find((tone) => tone === p.variant)} disabled={disabled} onChange={(tone) => onPatch({ variant: tone })}/></div>;
      case "inputType":
        return <label key={field} className="pd-field">Tür<select value={String(p.inputType || "text")} disabled={disabled} onChange={(event) => props.onSetInputType(event.target.value)}>{props.inputTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          {(p.inputType === "select" || p.inputType === "lookup") && <small>Seçenek sorgusunu Gelişmiş kipte bağlayın.</small>}</label>;
      case "required":
        return <label key={field} className="pd-check"><input type="checkbox" checked={p.required === true} disabled={disabled} onChange={(event) => onPatch({ required: event.target.checked ? true : undefined })}/>Zorunlu</label>;
      case "actionType":
        return <div key={field} className="pd-field">Eylem türü<div className="pd-segment pd-action-type" role="group" aria-label="Eylem türü">
          {props.buttonActionTypes.map(([value, label]) => <button type="button" key={value} disabled={disabled} aria-pressed={props.buttonAction === value} className={props.buttonAction === value ? "active" : ""}
            onClick={() => { if (props.buttonAction !== value) onPatch({ actionType: value }); }}>{label}</button>)}
        </div></div>;
      case "actionMain": {
        const action = props.buttonAction;
        if (action === "workflow") return <label key={field} className="pd-field">İş akışı<select value={String(p.workflowId || "")} disabled={disabled} onChange={(event) => onUpdate("workflowId", event.target.value)}><option value="">Yayımlanmış akış seçin</option>{props.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name} · {workflow.code}</option>)}</select></label>;
        if (action === "openDialog") return <label key={field} className="pd-field">Açılacak pencere<select value={typeof p.dialogId === "string" ? p.dialogId : ""} disabled={disabled} onChange={(event) => onPatch({ dialogId: event.target.value || undefined })}><option value="">Pencere seçin</option>{props.dialogs.map((dialog) => <option key={dialog.id} value={dialog.id}>{dialog.label}</option>)}</select></label>;
        if (action === "query") {
          const value = typeof p.queryId === "string" ? p.queryId : "";
          return <div key={field} className="pd-field">Çalıştırılacak sorgu{querySelect(value, props.bindButton, true, queries)}
            <QueryFieldActions kinds={ALL_KINDS} target={target} value={value} componentId={component.id} bind={props.bindButton} disabled={disabled}/></div>;
        }
        return <p key={field} className="pd-binding-note">Bu eylemin ayrıntıları Gelişmiş kipte düzenlenir.</p>;
      }
      default: return null;
    }
  };

  return <div className="pd-basic">
    {fields.map(render)}
    <div className="pd-basic-more"><span>{moreSettingsText(component.type)}</span><button type="button" onClick={props.onAdvanced}>Gelişmiş ›</button></div>
  </div>;
}
