import type { FormEvent, ReactNode } from "react";
import type { CustomerGroupItem } from "../../erp-types";
import { StatusTag } from "../../list-page/StatusTag";
import { RecordFieldChange, RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import "../../sales/sales-record-forms.css";

export type CustomerGroupDraft = { code: string; name: string };
export type CustomerGroupDraftKey = keyof CustomerGroupDraft;

/** Whether a draft field differs from the baseline (the code compares upper-cased, as the server stores it). */
export function customerGroupFieldChanged(key: CustomerGroupDraftKey, draft: CustomerGroupDraft, base: CustomerGroupDraft) {
  if (key === "code") return draft.code.trim().toUpperCase() !== base.code.trim().toUpperCase();
  return draft.name.trim() !== base.name.trim();
}

type Props = {
  mode: "create" | "edit";
  /** The open group (edit). */
  current?: CustomerGroupItem;
  draft: CustomerGroupDraft;
  /** Loaded values (edit): previous values of changed fields. */
  baseline: CustomerGroupDraft | null;
  changedCount: number;
  busy: boolean;
  error: string;
  saveDisabledReason?: string;
  formId: string;
  onDismissError: () => void;
  onChange: (draft: CustomerGroupDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/** Right-hand form of the Cari Grupları definition screen: the group's code and name. */
export function CustomerGroupDefinitionForm(p: Props) {
  const edit = p.mode === "edit";
  const g = p.current;
  const set = (patch: Partial<CustomerGroupDraft>) => p.onChange({ ...p.draft, ...patch });
  const changed = (key: CustomerGroupDraftKey) => !!p.baseline && customerGroupFieldChanged(key, p.draft, p.baseline);
  const wrap = (key: CustomerGroupDraftKey, previous: ReactNode, control: ReactNode) =>
    edit ? (
      <RecordFieldChange changed={changed(key)} previous={previous}>
        {control}
      </RecordFieldChange>
    ) : (
      control
    );
  return (
    <section className="inv-rf-embedded">
      <RecordFormPage
        variant="dialog"
        className="sales-rf"
        title={edit && g ? g.name : "Yeni Grup"}
        subtitle={
          edit && g ? (
            <>
              <span className="rf-code">{g.code}</span>
              <StatusTag tone={g.isActive ? "ok" : "off"}>{g.isActive ? "Aktif" : "Pasif"}</StatusTag>
            </>
          ) : undefined
        }
        mode={p.mode}
        busy={p.busy}
        saveLabel={edit ? "Değişiklikleri kaydet" : "Grup ekle"}
        formId={p.formId}
        saveDisabledReason={p.saveDisabledReason}
        dirty={edit ? p.changedCount : undefined}
        onSubmit={p.onSubmit}
        onCancel={p.onCancel}
        error={p.error}
        onDismissError={p.onDismissError}
        status={<span>Yalnızca bu firmada kullanılır.</span>}
      >
        <RecordFormGroup title="Grup Kimliği" bodyClassName="rf-identity sales-rf-identity-2">
          {wrap(
            "code",
            p.baseline?.code,
            <label>
              <span>
                Kod <RequiredMark />
              </span>
              <input
                className="rf-must rf-mono"
                value={p.draft.code}
                onChange={(event) => set({ code: event.target.value.toUpperCase() })}
                maxLength={40}
                required
                placeholder="Örn. B2B"
              />
            </label>,
          )}
          {wrap(
            "name",
            p.baseline?.name,
            <label>
              <span>
                Ad <RequiredMark />
              </span>
              <input
                className="rf-must"
                value={p.draft.name}
                onChange={(event) => set({ name: event.target.value })}
                maxLength={120}
                required
                placeholder="Örn. Kurumsal müşteriler"
              />
            </label>,
          )}
        </RecordFormGroup>
      </RecordFormPage>
    </section>
  );
}
