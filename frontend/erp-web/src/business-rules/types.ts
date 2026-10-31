export type Condition = { field: string; operator: string; value: string }
export type Rule = { id: string; code: string; name: string; description: string | null; trigger: string; version: number; status: string; conditions: Condition[]; workflowCode: string; createdAt: string; updatedAt: string }
export type Workflow = { id: string; code: string; name: string; version: number; status: string }
export type Evaluation = { id: string; ruleId: string; eventId: string; matched: boolean; workflowInstanceId: string | null; details: string; createdAt: string }
export type TriggerField = { code: string; label: string; type: string }
export type Trigger = { code: string; label: string; description: string; fields: TriggerField[] }
export type Operator = [string, string]
