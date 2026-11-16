// Studio proje ve çalışma alanı ekranlarının API tipleri (StudioProjects.tsx'ten taşındı).
import type { UiDesignPlan } from "../UIDesigner";

export type Tenant = { id: string; name: string; slug: string; role: string };
export type DevelopmentProject = {
  id: string;
  name: string;
  repositoryUrl: string;
  defaultBranch: string;
  accessLevel: string;
  createdAt: string;
  githubAuthorized: boolean;
};
export type DevelopmentRequest = {
  id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
};

export type ProjectMember = {
  userId: string;
  email: string;
  accessLevel: "Viewer" | "Contributor" | "Maintainer";
  grantedAt: string;
};

export type WorkspaceRequest = {
  id: string;
  projectId: string;
  developmentRequestId: string | null;
  developmentRequestTitle: string | null;
  developmentRequestDescription: string | null;
  requestedByUserId: string;
  branchName: string;
  workspaceBranchName: string | null;
  status:
    | "PendingApproval"
    | "Approved"
    | "Rejected"
    | "Cancelled"
    | "Provisioning"
    | "ProvisioningFailed"
    | "Ready"
    | "Archived";
  createdAt: string;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  canReview: boolean;
  canCancel: boolean;
  canDelete: boolean;
  commitSha: string | null;
  provisioningError: string | null;
  provisionedAt: string | null;
};
export type PendingWorkspaceApproval = {
  id: string;
  projectId: string;
  projectName: string;
  requestedByUserId: string;
  requesterEmail: string;
  branchName: string;
  createdAt: string;
  reviewNote: string | null;
  developmentRequestTitle: string | null;
  developmentRequestDescription: string | null;
};
export type PendingWorkspaceApprovalsPage = {
  items: PendingWorkspaceApproval[];
  nextOffset: number | null;
};
export type WorkspaceFileEntry = {
  name: string;
  path: string;
  kind: "Directory" | "File" | "Link";
  sizeBytes: number | null;
};
export type WorkspaceFileListing = {
  path: string;
  entries: WorkspaceFileEntry[];
  nextOffset: number | null;
};
export type WorkspaceFileSearchResult = {
  scannedEntries: number;
  truncated: boolean;
  entries: WorkspaceFileEntry[];
};
export type WorkspaceFileContent = {
  path: string;
  content: string;
  sizeBytes: number;
  sha256: string;
};
export type WorkspaceAnalysis = {
  scannedFiles: number;
  truncated: boolean;
  technologies: { name: string; fileCount: number }[];
  entryPoints: string[];
};
export type WorkspaceSearchResult = {
  scannedFiles: number;
  truncated: boolean;
  matches: { path: string; line: number; excerpt: string }[];
};
export type SourceAnalysisResult = { answer: string; sourceCount: number };
export type WorkspaceTestDiscovery = {
  scannedFiles: number;
  truncated: boolean;
  targets: {
    path: string;
    ecosystem: string;
    evidence: string;
    suggestedCommand: string;
    canTest?: boolean;
    canBuild?: boolean;
  }[];
};
export type WorkspaceTestRunStatus = {
  jobId: string;
  targetPath: string;
  commitSha: string;
  snapshotSha256: string;
  hasUncommittedChanges: boolean;
  status: string;
  message: string | null;
  success: boolean | null;
  exitCode: number | null;
  durationMilliseconds: number;
  output: string;
  completedAt: string | null;
};
export type SandboxErrorAnalysisResponse = {
  jobId: string;
  analysis: {
    summary: string;
    likelyCause: string;
    recommendedActions: string[];
    limitations: string[];
  };
  triage: {
    category: string;
    summary: string;
    sourceRepairCandidate: boolean;
    nextStep: string;
  };
  operation: "test" | "build";
  targetPath: string;
  status: string;
  commitSha: string;
  outputWasRedacted: boolean;
  sourceOutputPersisted: boolean;
};
export type AITestPlan = {
  summary: string;
  scenarios: {
    title: string;
    category: string;
    objective: string;
    steps: string[];
    expectedResult: string;
    priority: string;
  }[];
  assumptions: string[];
  risks: string[];
};
export type SavedAITestPlan = {
  id: string;
  workspaceRequestId: string;
  branchName: string;
  commitSha: string;
  summary: string;
  createdAt: string;
  createdByUserId: string;
  canDelete: boolean;
};
export type SavedAITestPlanDetail = { metadata: SavedAITestPlan; plan: AITestPlan };
export type ArchitecturePlan = {
  summary: string;
  affectedAreas: string[];
  steps: { title: string; description: string; files: string[] }[];
  assumptions: string[];
  risks: string[];
};
export type SavedArchitecturePlan = {
  id: string;
  workspaceRequestId: string;
  branchName: string;
  commitSha: string;
  summary: string;
  createdAt: string;
  createdByUserId: string;
  canDelete: boolean;
};
export type SavedArchitecturePlanDetail = {
  metadata: SavedArchitecturePlan;
  plan: ArchitecturePlan;
};
export type StudioConversation = {
  id: string;
  title: string;
  workspaceRequestId: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  canDelete: boolean;
};
export type StudioConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
export type StudioChatCodeChangePreview = {
  summary: string;
  risks: string[];
  changes: {
    filePath: string;
    sourceSha256: string;
    patches: { findText: string; replaceText: string; notes: string[] }[];
  }[];
  userMessage: StudioConversationMessage;
  assistantMessage: StudioConversationMessage;
};
export type StudioKnowledgeDocument = {
  id: string;
  path: string;
  contentSha256: string;
  commitSha: string;
  indexedAt: string;
  embeddingModel: string | null;
  characterCount: number;
};
export type StudioKnowledgeAutoRefresh = {
  enabled: boolean;
  allFiles?: boolean;
  paths: string[];
  lastRefreshedAt: string | null;
};
export type ApprovedHistoryCandidate = {
  id: string;
  branchName: string;
  commitSha: string;
  testTargetPath: string;
  testCompletedAt: string;
  approvedAt: string;
  developmentRequestTitle: string | null;
};
export type CodeSuggestionPreview = {
  filePath: string;
  sourceSha256: string;
  originalContent: string;
  summary: string;
  proposedContent: string;
  notes: string[];
  createNewFile: boolean;
};
export type MultiFileCodeSuggestionPreview = {
  summary: string;
  risks: string[];
  changes: {
    filePath: string;
    sourceSha256: string;
    originalContent: string;
    proposedContent: string;
    notes: string[];
  }[];
};
export type AppliedCodeSuggestion = { filePath: string; sha256: string };
export type WorkspaceChange = {
  id: string;
  path: string;
  originalSha256: string;
  appliedSha256: string;
  appliedAt: string;
  isRestored: boolean;
  isCurrent: boolean;
  wasCreated: boolean;
};
export type WorkspaceChanges = { changes: WorkspaceChange[]; truncated: boolean };
export type WorkspaceCommitResult = {
  workspaceId: string;
  branchName: string;
  parentCommitSha: string;
  commitSha: string;
  files: string[];
};
export type WorkspaceGitStatus = {
  branchName: string;
  headCommitSha: string;
  totalChangedFiles: number;
  truncated: boolean;
  files: { path: string; status: string }[];
};
export type ReleaseCandidate = {
  id: string;
  workspaceRequestId: string;
  branchName: string;
  commitSha: string;
  testJobId: string;
  testTargetPath: string;
  testSnapshotSha256: string;
  testCompletedAt: string;
  createdAt: string;
  createdByUserId: string;
  decision: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  canReview: boolean;
  githubPullRequestNumber: number | null;
  githubPullRequestUrl: string | null;
  githubPullRequestState: string | null;
};
export type ReleaseVersion = {
  id: string;
  releaseCandidateId: string;
  version: string;
  commitSha: string;
  createdAt: string;
  createdByUserId: string;
};
export type ReleasePackage = {
  id: string;
  releaseVersionId: string;
  version: string;
  commitSha: string;
  testSnapshotSha256: string;
  packageSha256: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  createdByUserId: string;
};
export type ReleaseDeployment = {
  id: string;
  releasePackageId: string;
  rollbackOfDeploymentId: string | null;
  rollbackTargetDeploymentId: string | null;
  canRestoreDatabase: boolean;
  environment: string;
  provider: string;
  status: string;
  packageSha256: string;
  commitSha: string;
  environmentUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failureCode: string | null;
  version: string;
};
export type StagingDeploymentOperation = {
  deployment: ReleaseDeployment;
  bootstrapEmail: string;
  bootstrapPassword: string;
};
export type ProductionApproval = {
  id: string;
  stagingDeploymentId: string;
  releasePackageId: string;
  version: string;
  status: string;
  stagingUrl: string | null;
  requestNote: string;
  reviewNote: string | null;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  productionDeploymentStarted: boolean;
  productionDeploymentId: string | null;
  productionDeploymentStatus: string | null;
  productionEnvironmentUrl: string | null;
};
export type PullRequestDraft = {
  title: string;
  body: string;
  draftSource?: "ai" | "template";
  risks: string[];
  limitations: string[];
  sourceBranch: string;
  baseBranch: string;
  commitSha: string;
  testTargetPath: string;
  testCompletedAt: string;
  remotePullRequestCreated: boolean;
};
export type PublishedPullRequest = {
  pullNumber: number;
  htmlUrl: string;
  state: string;
  draft: boolean;
  created: boolean;
  branchName: string;
  baseBranch: string;
  commitSha: string;
  pushed: boolean;
};
export type WorkspaceGitDiff = {
  path: string;
  status: string;
  baseContent: string;
  currentContent: string;
  baseSha256: string;
  currentSha256: string;
  headCommitSha: string;
};
export type StudioCodeReview = {
  summary: string;
  findings: {
    severity: "Critical" | "High" | "Medium" | "Low" | "Info";
    title: string;
    detail: string;
    recommendation: string;
  }[];
  limitations: string[];
};
export type StudioCodeReviewThread = {
  id: string;
  path: string;
  lineNumber: number;
  headCommitSha: string;
  status: "Open" | "Resolved";
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: string;
  isStale: boolean;
  comments: {
    id: string;
    createdByUserId: string;
    body: string;
    createdAt: string;
    githubAuthorLogin?: string | null;
  }[];
};
export type WorkspaceChangeDiff = {
  id: string;
  path: string;
  originalContent: string;
  currentContent: string;
  originalSha256: string;
  appliedSha256: string;
  appliedAt: string;
  isRestored: boolean;
  isCurrent: boolean;
  wasCreated: boolean;
};
export type RestoredWorkspaceChange = {
  changeId: string;
  path: string;
  sha256: string;
};
export type UiDesignPreview = {
  filePath: string;
  sourceSha256: string;
  summary: string;
  plan: UiDesignPlan;
  proposedContent: string;
};
