import { Check } from "lucide-react";
import "./document-page.css";

export type DocumentFlowStep = { key: string; label: string };

/**
 * Status flow in the document header (mockup 02): the steps of the document type in order, numbered; the earlier
 * ones done, the current one highlighted. `terminal` is an end state outside the normal flow (İptal, Reddedildi):
 * it is drawn as a grey last step only while the document is in it. Pass it through DocumentSurface `statusFlow`.
 */
export function DocumentStatusFlow({
  steps,
  current,
  terminal,
  label = "Durum akışı",
}: {
  steps: DocumentFlowStep[];
  /** Key of the document's current step (or of `terminal`). */
  current?: string;
  terminal?: DocumentFlowStep;
  label?: string;
}) {
  const ended = !!terminal && current === terminal.key;
  const currentIndex = ended ? -1 : steps.findIndex((step) => step.key === current);
  const shown = ended ? [...steps, terminal] : steps;
  return (
    <ol className={`doc-flow${ended ? " is-ended" : ""}`} aria-label={label}>
      {shown.map((step, index) => {
        const isTerminal = ended && index === steps.length;
        const state = isTerminal ? "is-terminal" : index === currentIndex ? "is-current" : index < currentIndex ? "is-done" : "";
        return (
          <li key={step.key} className={`doc-flow-step${state ? ` ${state}` : ""}`} aria-current={state === "is-current" || isTerminal ? "step" : undefined}>
            <i aria-hidden="true">{state === "is-done" ? <Check size={11} strokeWidth={3} /> : index + 1}</i>
            <span>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
