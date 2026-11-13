import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { RecordFormPage, type RecordFormPageProps } from "../../record-form/RecordForm";
import "../../hr-projects-record-forms.css";

export type ModuleRecordFormProps = Omit<RecordFormPageProps, "onCancel"> & {
  /** Omit for a form that is always visible in its panel; the "Vazgeç" button is then hidden. */
  onCancel?: () => void;
  /**
   * Extra condition that blocks saving without the form being busy (no selected
   * employee, details still loading…). The save buttons are disabled and a submit
   * coming from the F2 shortcut is ignored.
   */
  saveDisabled?: boolean;
};

let mountedForms = 0;

/**
 * İK, duran varlık ve proje ekranlarında aynı sayfada birden çok kayıt formu aynı anda
 * görünür. Ortak RecordFormPage her form için F2'yi dinlediğinden, tek tuş hepsini birden
 * göndermesin diye kısayol burada yalnızca odaktaki (veya açık diyalogdaki) forma yönlendirilir.
 */
function routeSaveShortcut(event: KeyboardEvent) {
  if (event.key !== "F2" || event.altKey || event.shiftKey) return;
  const forms = Array.from(document.querySelectorAll<HTMLElement>(".record-form"));
  if (forms.length < 2) return;
  // A shared modal (record picker etc.) is open: the shared handler already scopes F2 to it.
  if (document.querySelector(".modal-backdrop")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const dialogs = document.querySelectorAll<HTMLElement>("dialog[open], .op-project-modal-backdrop");
  const dialog = dialogs[dialogs.length - 1];
  const active = document.activeElement;
  let target = forms.find((form) => form.contains(active));
  if (dialog) {
    if (target && !dialog.contains(target)) target = undefined;
    if (!target) {
      const inside = forms.filter((form) => dialog.contains(form));
      if (inside.length === 1) target = inside[0];
    }
  }
  if (!target) return;
  const buttons = target.querySelectorAll<HTMLButtonElement>('.rf-actions button[type="submit"]');
  const button = (event.ctrlKey && buttons[1]) || buttons[0];
  if (button && !button.disabled) button.click();
}

/**
 * RecordFormPage for the forms of the HR, fixed asset and project screens. Defaults to the
 * compact "dialog" variant because these forms live inside panels and dialogs of a larger page.
 */
export default function ModuleRecordForm({
  onCancel,
  saveDisabled = false,
  onSubmit,
  className,
  variant = "dialog",
  ...rest
}: ModuleRecordFormProps) {
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mountedForms += 1;
    if (mountedForms === 1) window.addEventListener("keydown", routeSaveShortcut, true);
    return () => {
      mountedForms -= 1;
      if (mountedForms === 0) window.removeEventListener("keydown", routeSaveShortcut, true);
    };
  }, []);

  // RecordFormPage only knows `busy`; mirror the extra save condition onto its submit buttons.
  useEffect(() => {
    host.current
      ?.querySelectorAll<HTMLButtonElement>('.rf-actions button[type="submit"]')
      .forEach((button) => {
        button.disabled = rest.busy || saveDisabled;
      });
  });

  return (
    <div ref={host} className="hrp-record-form-host">
      <RecordFormPage
        {...rest}
        variant={variant}
        className={`hrp-record-form${onCancel ? "" : " hrp-no-cancel"}${className ? ` ${className}` : ""}`}
        onCancel={onCancel ?? (() => undefined)}
        onSubmit={(event: FormEvent) => {
          if (saveDisabled) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
      >
        {rest.children}
      </RecordFormPage>
    </div>
  );
}
