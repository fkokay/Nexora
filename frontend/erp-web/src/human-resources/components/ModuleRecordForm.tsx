import type { FormEvent } from "react";
import { RecordFormPage, type RecordFormPageProps } from "../../record-form/RecordForm";
import "../../hr-projects-record-forms.css";

export type ModuleRecordFormProps = Omit<RecordFormPageProps, "onCancel"> & {
  /** Omit for a form that is always visible in its panel; the "Vazgeç" button is then hidden. */
  onCancel?: () => void;
  /**
   * Extra condition that blocks saving without the form being busy (no selected employee, details still
   * loading…). Kaydet (the bar's, or the form's own inside a dialog) is disabled and a submit is ignored.
   */
  saveDisabled?: boolean;
};

const SAVE_DISABLED_REASON = "Kaydetmek için gerekli seçimleri tamamlayın.";

/**
 * RecordFormPage for the forms of the HR, fixed asset and project screens. Defaults to the
 * compact "dialog" variant because these forms live inside panels and dialogs of a larger page.
 * With several forms on one page, Ctrl+S and Ctrl+F2 go to the form that holds the focus (RecordFormPage).
 */
export default function ModuleRecordForm({
  onCancel,
  saveDisabled = false,
  saveDisabledReason,
  onSubmit,
  className,
  variant = "dialog",
  ...rest
}: ModuleRecordFormProps) {
  return (
    <div className="hrp-record-form-host">
      <RecordFormPage
        {...rest}
        variant={variant}
        saveDisabledReason={saveDisabledReason ?? (saveDisabled ? SAVE_DISABLED_REASON : undefined)}
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
