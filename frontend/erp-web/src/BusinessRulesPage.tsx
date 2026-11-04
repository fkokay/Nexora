import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { useLowCodeCapabilities } from "./useLowCodeCapabilities";
import "./business-rules.css";
import { BusinessRulesHeader } from "./business-rules/components/BusinessRulesHeader";
import { RuleBuilder } from "./business-rules/components/RuleBuilder";
import { BusinessRuleCatalog } from "./business-rules/components/BusinessRuleCatalog";
import { BusinessRuleHistory } from "./business-rules/components/BusinessRuleHistory";
import {
  BusinessRuleTemplateGallery,
  type BusinessRuleTemplate,
} from "./business-rules/components/BusinessRuleTemplateGallery";
import type {
  Condition,
  Evaluation,
  Rule,
  Trigger,
  Workflow,
} from "./business-rules/types";

const defaultTrigger = "purchase-request.submitted";
const operators: Record<string, [string, string][]> = {
  text: [
    ["Equals", "Eşittir"],
    ["NotEquals", "Eşit değildir"],
    ["Contains", "İçerir"],
    ["IsEmpty", "Boş"],
    ["IsNotEmpty", "Dolu"],
  ],
  number: [
    ["Equals", "Eşittir"],
    ["NotEquals", "Eşit değildir"],
    ["GreaterThan", "Büyüktür"],
    ["GreaterThanOrEqual", "En az"],
    ["LessThan", "Küçüktür"],
    ["LessThanOrEqual", "En çok"],
    ["IsEmpty", "Boş"],
    ["IsNotEmpty", "Dolu"],
  ],
  date: [
    ["Equals", "Eşittir"],
    ["NotEquals", "Eşit değildir"],
    ["Before", "Önce"],
    ["OnOrBefore", "En geç"],
    ["After", "Sonra"],
    ["OnOrAfter", "En erken"],
    ["IsEmpty", "Boş"],
    ["IsNotEmpty", "Dolu"],
  ],
};
export default function BusinessRulesPage({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  const admin = role === "TenantAdmin";
  const capabilityState = useLowCodeCapabilities(token);
  const permissions = capabilityState.businessRules;
  const canReadWorkflows = capabilityState.workflows.canRead;
  const canDesign = permissions.canCreate || permissions.canUpdate;
  const [rules, setRules] = useState<Rule[]>([]),
    [workflows, setWorkflows] = useState<Workflow[]>([]),
    [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null),
    [builderOpen, setBuilderOpen] = useState(false),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [workflowCode, setWorkflowCode] = useState(""),
    [trigger, setTrigger] = useState(defaultTrigger),
    [triggerCatalog, setTriggerCatalog] = useState<Trigger[]>([]),
    [conditions, setConditions] = useState<Condition[]>([
      { field: "lineCount", operator: "GreaterThan", value: "5" },
    ]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const request = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const response = await authenticatedFetch(url, token, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          title?: string;
          errors?: Record<string, string[]>;
        } | null;
        throw new Error(
          body?.error ||
            Object.values(body?.errors ?? {})
              .flat()
              .join(" ") ||
            body?.title ||
            `İstek başarısız (${response.status})`,
        );
      }
      return response.status === 204
        ? (undefined as T)
        : (response.json() as Promise<T>);
    },
    [token],
  );
  const refresh = useCallback(async () => {
    const [r, catalog] = await Promise.all([
      request<Rule[]>("/api/business-rules/"),
      request<Trigger[]>("/api/business-rules/catalog"),
    ]);
    const w = canReadWorkflows
      ? await request<Workflow[]>("/api/workflows/definitions")
      : [];
    setRules(r);
    setWorkflows(w);
    setTriggerCatalog(catalog);
    if (admin)
      setEvaluations(
        await request<Evaluation[]>("/api/business-rules/evaluations"),
      );
  }, [request, admin, canReadWorkflows]);
  useEffect(() => {
    if (!permissions.canRead) return;
    void refresh().catch((e) => setError((e as Error).message));
  }, [permissions.canRead, refresh]);
  const publishedWorkflows = useMemo(
      () => workflows.filter((x) => x.status === "Published"),
      [workflows],
    ),
    drafts = useMemo(() => rules.filter((x) => x.status === "Draft"), [rules]),
    published = useMemo(
      () => rules.filter((x) => x.status === "Published"),
      [rules],
    );
  const selectedRule =
    rules.find((rule) => rule.id === selectedRuleId) ??
    published[0] ??
    drafts[0] ??
    null;
  const selectedTrigger = triggerCatalog.find((x) => x.code === trigger),
    fields = triggerCatalog
      .flatMap((x) => x.fields)
      .filter(
        (field, index, array) =>
          array.findIndex((other) => other.code === field.code) === index,
      ),
    selectedFields = selectedTrigger?.fields ?? [];
  const fieldType = (field: string) =>
      selectedFields.find((x) => x.code === field)?.type ?? "text",
    operatorsFor = (field: string) =>
      operators[fieldType(field)] ?? operators.text;
  const triggerLabel = (value: string) =>
    triggerCatalog.find((x) => x.code === value)?.label ?? value;
  function defaultCondition(value: string) {
    if (value === "sales-quote.accepted")
      return { field: "grandTotal", operator: "GreaterThan", value: "10000" };
    if (value === "project.task-completed")
      return {
        field: "plannedHours",
        operator: "GreaterThanOrEqual",
        value: "8",
      };
    return { field: "lineCount", operator: "GreaterThan", value: "5" };
  }
  function newRule() {
    const first =
      triggerCatalog.find((x) => x.code === defaultTrigger)?.code ??
      triggerCatalog[0]?.code ??
      defaultTrigger;
    setEditing(null);
    setBuilderOpen(true);
    setCode("");
    setName("");
    setDescription("");
    setTrigger(first);
    setWorkflowCode(publishedWorkflows[0]?.code ?? "");
    setConditions([defaultCondition(first)]);
  }
  function useRuleTemplate(template: BusinessRuleTemplate) {
    const existing = new Set(rules.map((rule) => rule.code.toLowerCase()));
    let availableCode = template.code;
    let suffix = 2;
    while (existing.has(availableCode.toLowerCase())) {
      availableCode = `${template.code}-${suffix++}`;
    }
    setEditing(null);
    setCode(availableCode);
    setName(template.name);
    setDescription(template.description);
    setTrigger(template.trigger);
    setWorkflowCode(publishedWorkflows[0]?.code ?? "");
    setConditions(template.conditions.map((condition) => ({ ...condition })));
    setBuilderOpen(true);
    setError("");
    setNotice("");
  }
  function editRule(rule: Rule) {
    setEditing(rule);
    setBuilderOpen(true);
    setCode(rule.code);
    setName(rule.name);
    setDescription(rule.description ?? "");
    setTrigger(rule.trigger);
    setWorkflowCode(rule.workflowCode);
    setConditions(rule.conditions.map((x) => ({ ...x })));
  }
  function updateCondition(index: number, patch: Partial<Condition>) {
    setConditions((current) =>
      current.map((condition, i) =>
        i === index ? { ...condition, ...patch } : condition,
      ),
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await request(
        editing ? `/api/business-rules/${editing.id}` : "/api/business-rules/",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            code,
            name,
            description,
            workflowCode,
            conditions,
            trigger,
          }),
        },
      );
      setNotice("Kural taslağı kaydedildi.");
      setBuilderOpen(false);
      setEditing(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function post(url: string) {
    setBusy(true);
    setError("");
    try {
      await request(url, { method: "POST" });
      setNotice("İşlem tamamlandı.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const archived = rules.filter((rule) => rule.status === "Archived");
  if (capabilityState.loading) return <div className="low-code-access-state" role="status">Yetkiler yükleniyor…</div>;
  if (!permissions.canRead) return <div className="low-code-access-state" role="alert">İş kurallarını görüntüleme izniniz yok.</div>;
  return (
    <div className="business-rules-page">
      <BusinessRulesHeader
        admin={admin}
        publishedCount={published.length}
        draftCount={drafts.length}
        evaluationCount={evaluations.length}
        matchedCount={evaluations.filter((item) => item.matched).length}
        canCreate={permissions.canCreate && canReadWorkflows && !!triggerCatalog.length}
        onCreate={newRule}
      />
      {error && <div className="rules-alert error">{error}</div>}
      {notice && (
        <div className="rules-alert success">
          {notice}
          <button onClick={() => setNotice("")}>Kapat</button>
        </div>
      )}
      {permissions.canCreate && !builderOpen && !error && (
        <BusinessRuleTemplateGallery
          triggerCatalog={triggerCatalog}
          hasPublishedWorkflow={publishedWorkflows.length > 0}
          onSelect={useRuleTemplate}
        />
      )}
      {canDesign && builderOpen && (
        <RuleBuilder
          editing={editing}
          code={code}
          name={name}
          description={description}
          workflowCode={workflowCode}
          trigger={trigger}
          triggerCatalog={triggerCatalog}
          publishedWorkflows={publishedWorkflows}
          selectedTrigger={selectedTrigger}
          selectedFields={selectedFields}
          conditions={conditions}
          busy={busy}
          fieldType={fieldType}
          operatorsFor={operatorsFor}
          onCodeChange={setCode}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onWorkflowChange={setWorkflowCode}
          onTriggerChange={(value) => {
            setTrigger(value);
            setConditions([defaultCondition(value)]);
          }}
          onConditionChange={updateCondition}
          onAddCondition={() => {
            const field = selectedFields[0];
            if (field)
              setConditions((current) => [
                ...current,
                {
                  field: field.code,
                  operator: operatorsFor(field.code)[0][0],
                  value: "",
                },
              ]);
          }}
          onRemoveCondition={(index) =>
            setConditions((current) => current.filter((_, i) => i !== index))
          }
          onCancel={() => setBuilderOpen(false)}
          onSave={() => void save()}
        />
      )}
      <BusinessRuleCatalog
        admin={admin}
        canDesign={canDesign}
        canManageDrafts={canDesign || permissions.canPublish}
        canUpdate={permissions.canUpdate}
        canPublish={permissions.canPublish}
        busy={busy}
        published={published}
        drafts={drafts}
        selectedRule={selectedRule}
        fields={fields}
        publishedWorkflows={publishedWorkflows}
        triggerLabel={triggerLabel}
        onSelect={setSelectedRuleId}
        onEdit={editRule}
        onPost={(url) => void post(url)}
      />
      {admin && (
        <BusinessRuleHistory
          busy={busy}
          evaluations={evaluations}
          archived={archived}
          totalRuleCount={rules.length}
          onPost={(url) => void post(url)}
        />
      )}
    </div>
  );
}
