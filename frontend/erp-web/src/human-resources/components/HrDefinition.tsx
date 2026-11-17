import type { ReactNode } from "react";
import { X } from "lucide-react";
import { DefinitionEmptyPane, DefinitionLayout } from "../../list-page/DefinitionLayout";
import { isInPopup } from "../../record-form/recordFormKeys";

type ScreenProps = {
  /** Accessible name of the right pane ("Kural seti kaydı"). */
  paneLabel: string;
  /** Grid (selectable, current row) and its footer. */
  list: ReactNode;
  /** Yeni (F2) opened the create form. */
  creating: boolean;
  createForm: ReactNode;
  /** The current row, read-only (the İK approval records have no PUT; a change is a new version). */
  record: ReactNode | null;
  emptyText: string;
  /** Esc / close: closes the create form or the record (the form keeps its values in the page). */
  onClose: () => void;
};

/**
 * An İK definition screen (approved mockup 04 "Tanım ekranı"): the list on the left, the selected record or the create
 * form on the right; below 1280px the pane is a drawer. Approve / Reject are in İşlemler.
 */
export function HrDefinitionScreen({ paneLabel, list, creating, createForm, record, emptyText, onClose }: ScreenProps) {
  const open = creating || !!record;
  return (
    <div
      className="hr-def"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || !open || isInPopup(event.target)) return;
        event.preventDefault();
        onClose();
      }}
    >
      <DefinitionLayout
        paneOpen={open}
        paneLabel={paneLabel}
        list={list}
        pane={
          creating ? (
            <section className="inv-rf-embedded hr-def-form">{createForm}</section>
          ) : record ? (
            record
          ) : (
            <DefinitionEmptyPane>{emptyText}</DefinitionEmptyPane>
          )
        }
      />
    </div>
  );
}

type RecordProps = {
  /** Name of the record (the pane itself carries the accessible name). */
  label: string;
  code?: string;
  title: string;
  status: ReactNode;
  facts: { label: string; value: ReactNode }[];
  /** JSON data of the record, shown as a read-only code block. */
  data?: { title: string; text: string }[];
  note?: ReactNode;
  onClose: () => void;
  closeLabel: string;
};

/** Pretty-prints stored JSON when it parses; otherwise shows it as stored. */
export function formatStoredJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Read-only record pane of an İK definition screen. */
export function HrDefinitionRecord({ code, title, status, facts, data = [], note, onClose, closeLabel }: RecordProps) {
  return (
    <section className="inv-rf-embedded hr-def-record" tabIndex={-1}>
      <header className="hr-def-head">
        <div>
          {code && <span className="nx-code">{code}</span>}
          <h3>{title}</h3>
          <span className="hr-def-status">{status}</span>
        </div>
        <button type="button" className="hr-def-close" aria-label={closeLabel} title={`${closeLabel} (Esc)`} onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <div className="hr-def-group">
        <dl className="hr-def-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {data.map((block) => (
        <div className="hr-def-group" key={block.title}>
          <h4>{block.title}</h4>
          <pre className="hr-def-code" tabIndex={0}>
            {formatStoredJson(block.text)}
          </pre>
        </div>
      ))}
      {note && <p className="hr-def-note">{note}</p>}
    </section>
  );
}
