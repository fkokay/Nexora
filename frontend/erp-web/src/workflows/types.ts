export type WorkflowStep = { name: string; approverRole: string }

export type WorkflowDefinition = {
  id: string
  code: string
  name: string
  description: string | null
  version: number
  status: string
  steps: WorkflowStep[]
  createdAt: string
  updatedAt: string
}

export type WorkflowAction = {
  id: string
  stepIndex: number
  stepName: string
  decision: string
  comment: string | null
  actorUserId: string
  actorRole: string
  createdAt: string
}

export type WorkflowInstance = {
  id: string
  definitionId: string
  definitionCode: string
  definitionName: string
  definitionVersion: number
  steps: WorkflowStep[]
  subjectType: string
  subjectTitle: string
  subjectId: string | null
  context: Record<string, string | null>
  status: string
  currentStepIndex: number
  currentStep: WorkflowStep
  startedByUserId: string
  startedAt: string
  completedAt: string | null
  actions: WorkflowAction[]
}
