import type { RefObject } from "react";
import { usePageCommands } from "../commands/CommandProvider";
import { ownsKeyboard } from "./recordFormKeys";

/**
 * Gives a plain form that is not a RecordFormPage (a side panel, a voucher entry) the action bar's Kaydet (Ctrl+S),
 * so saving uses the same key everywhere. Render it while the form is shown. `primary: false` for a form that stays
 * on screen next to a list, so the list's Yeni stays the primary command.
 */
export function FormSaveCommand({
  formRef,
  disabledReason,
  primary = true,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  disabledReason?: string;
  primary?: boolean;
}) {
  usePageCommands(
    {
      save: {
        primary,
        disabledReason,
        run: () => {
          // A dialog opened over the form owns the keyboard.
          if (ownsKeyboard(formRef.current)) formRef.current?.requestSubmit();
        },
      },
    },
    "form",
    formRef,
  );
  return null;
}
