import { useEffect } from "react";

/**
 * RecordFormPage binds F2 / Ctrl+F2 on the window, so two record forms that are visible at the
 * same time (for example the return and payment forms of one invoice, or the province and
 * district forms of one page) would both be submitted by a single key press.
 *
 * Call this hook from a screen that can show more than one record form at once. While several
 * forms share the keyboard scope (the topmost dialog, or the page when no dialog is open) the
 * shortcut is routed only to the form that holds the focus; with a single form it does nothing
 * and the shared handler keeps working as usual.
 */
export function useRecordFormShortcutScope() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.altKey || event.shiftKey) return;
      const backdrops = document.querySelectorAll(".modal-backdrop");
      const topmost = backdrops[backdrops.length - 1];
      const scope: ParentNode = topmost ?? document;
      const forms = Array.from(scope.querySelectorAll<HTMLFormElement>(".record-form form.rf-form"));
      if (forms.length < 2) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const focused = forms.find((form) => form.closest(".record-form")?.contains(document.activeElement));
      const submitButtons = focused
        ?.closest(".record-form")
        ?.querySelectorAll<HTMLButtonElement>(".rf-actions button[type='submit']");
      if (!submitButtons?.length) return;
      // The second submit button, when present, is "Kaydet ve Yeni".
      const button = event.ctrlKey && submitButtons.length > 1 ? submitButtons[1] : submitButtons[0];
      if (!button.disabled) button.click();
    };
    // Capture phase on the window runs before RecordFormPage's own (bubble phase) listener.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
