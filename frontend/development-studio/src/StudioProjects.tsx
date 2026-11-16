import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  Folder,
  FolderKanban,
  FolderTree,
  GitBranch,
  History,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { api, authorizedFetch } from "./api";
import { DatabaseEngineer } from "./DatabaseEngineer";
import { ModuleSourceMappings } from "./ModuleSourceMappings";
import { WorkspaceCodeEditor } from "./WorkspaceCodeEditor";
import { moduleStarterFiles } from "./moduleStarterFiles";
import { confirmDialog, promptDialog } from "./ui/confirmDialog";
import "./studio-projects.css";
import "./studio-workspace.css";
import "./ui-designer-workflow.css";

import type {
  Tenant,
  DevelopmentProject,
  DevelopmentRequest,
  ProjectMember,
  WorkspaceRequest,
  PendingWorkspaceApproval,
  PendingWorkspaceApprovalsPage,
  WorkspaceFileListing,
  WorkspaceFileSearchResult,
  WorkspaceFileContent,
  WorkspaceAnalysis,
  WorkspaceSearchResult,
  SourceAnalysisResult,
  WorkspaceTestDiscovery,
  WorkspaceTestRunStatus,
  SandboxErrorAnalysisResponse,
  AITestPlan,
  SavedAITestPlan,
  SavedAITestPlanDetail,
  ArchitecturePlan,
  SavedArchitecturePlan,
  SavedArchitecturePlanDetail,
  StudioConversation,
  StudioConversationMessage,
  StudioChatCodeChangePreview,
  StudioKnowledgeDocument,
  StudioKnowledgeAutoRefresh,
  ApprovedHistoryCandidate,
  CodeSuggestionPreview,
  MultiFileCodeSuggestionPreview,
  AppliedCodeSuggestion,
  WorkspaceChange,
  WorkspaceChanges,
  WorkspaceCommitResult,
  WorkspaceGitStatus,
  ReleaseCandidate,
  ReleaseVersion,
  ReleasePackage,
  ReleaseDeployment,
  StagingDeploymentOperation,
  ProductionApproval,
  PullRequestDraft,
  PublishedPullRequest,
  WorkspaceGitDiff,
  StudioCodeReview,
  StudioCodeReviewThread,
  WorkspaceChangeDiff,
  RestoredWorkspaceChange,
  UiDesignPreview,
} from "./studio-projects/types";
import {
  maxManualWorkspaceFileBytes,
  projectAccessLabel,
  workspaceStatusTone,
  linkedDevelopmentContext,
  updateWorkspaceRoute,
} from "./studio-projects/helpers";
import { ProjectCreateDialog } from "./studio-projects/ProjectCreateDialog";
import { ProjectAccessDialog } from "./studio-projects/ProjectAccessDialog";
import { ReleaseDialog } from "./studio-projects/ReleaseDialog";
import { ChatDialog } from "./studio-projects/ChatDialog";
import { GitDiffDialog } from "./studio-projects/GitDiffDialog";
import { ChangeHistoryDialog } from "./studio-projects/ChangeHistoryDialog";
import { MultiFileSuggestionDialog } from "./studio-projects/MultiFileSuggestionDialog";
import { DeveloperSuggestionDialog } from "./studio-projects/DeveloperSuggestionDialog";
import { PlanHistoryDialog } from "./studio-projects/PlanHistoryDialog";
import { ArchitectPlanDialog } from "./studio-projects/ArchitectPlanDialog";
import { ProjectMapDialog } from "./studio-projects/ProjectMapDialog";
import { TestDiscoveryDialog } from "./studio-projects/TestDiscoveryDialog";
import { UiDesignerDialog } from "./studio-projects/UiDesignerDialog";
import { SourceSearchDialog } from "./studio-projects/SourceSearchDialog";

export function StudioProjects({
  token,
  tenant,
  projects,
  setProjects,
  refreshProjects,
}: {
  token: string;
  tenant: Tenant;
  projects: DevelopmentProject[];
  setProjects: Dispatch<SetStateAction<DevelopmentProject[]>>;
  refreshProjects: () => Promise<DevelopmentProject[]>;
}) {
  const [members, setMembers] = useState<ProjectMember[]>([]),
    [pendingApprovals, setPendingApprovals] = useState<
      PendingWorkspaceApproval[]
    >([]),
    [pendingApprovalsOffset, setPendingApprovalsOffset] = useState(0),
    [pendingApprovalsNextOffset, setPendingApprovalsNextOffset] = useState<
      number | null
    >(null),
    [approvalQueueLoading, setApprovalQueueLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false),
    [accessProject, setAccessProject] = useState<DevelopmentProject | null>(
      null,
    );
  const [moduleMappingProject, setModuleMappingProject] =
    useState<DevelopmentProject | null>(null);
  const [workspaceProject, setWorkspaceProject] =
      useState<DevelopmentProject | null>(null),
    [workspaceRequests, setWorkspaceRequests] = useState<WorkspaceRequest[]>(
      [],
    ),
    [workspaceBranches, setWorkspaceBranches] = useState<string[]>([]),
    [branchesLoading, setBranchesLoading] = useState(false),
    [branchesAvailable, setBranchesAvailable] = useState(false),
    [branchListError, setBranchListError] = useState(""),
    [customWorkspaceBranch, setCustomWorkspaceBranch] = useState(false),
    [projectDevelopmentRequests, setProjectDevelopmentRequests] = useState<
      DevelopmentRequest[]
    >([]),
    [selectedDevelopmentRequestId, setSelectedDevelopmentRequestId] =
      useState("");
  const [fileWorkspace, setFileWorkspace] = useState<WorkspaceRequest | null>(
      null,
    ),
    [fileListing, setFileListing] = useState<WorkspaceFileListing | null>(null),
    [fileContent, setFileContent] = useState<WorkspaceFileContent | null>(null),
    [filePath, setFilePath] = useState(""),
    [fileLoading, setFileLoading] = useState(false),
    [workspaceFileFilter, setWorkspaceFileFilter] = useState(""),
    [workspaceFileSearchResult, setWorkspaceFileSearchResult] =
      useState<WorkspaceFileSearchResult | null>(null),
    [workspaceFileSearchLoading, setWorkspaceFileSearchLoading] =
      useState(false);
  const [manualFileEditing, setManualFileEditing] = useState(false),
    [manualFileContent, setManualFileContent] = useState(""),
    [manualFilePath, setManualFilePath] = useState(""),
    [manualFileCreating, setManualFileCreating] = useState(false),
    [manualFileSaving, setManualFileSaving] = useState(false);
  const workspaceExplorerRef = useRef<HTMLDivElement>(null),
    workspaceExplorerCloseRef = useRef<HTMLButtonElement>(null);
  const workspaceRestoreRef = useRef("");

  const [multiFileSelecting, setMultiFileSelecting] = useState(false),
    [multiFilePaths, setMultiFilePaths] = useState<string[]>([]),
    [multiDeveloperWorkspace, setMultiDeveloperWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [multiFileRequest, setMultiFileRequest] = useState(""),
    [multiFileConsent, setMultiFileConsent] = useState(false),
    [multiFileSuggestion, setMultiFileSuggestion] =
      useState<MultiFileCodeSuggestionPreview | null>(null),
    [multiFileApplied, setMultiFileApplied] = useState<string[]>([]),
    [multiFileLoading, setMultiFileLoading] = useState(false);
  const [repairMode, setRepairMode] = useState<{
      operation: "test" | "build";
      targetPath: string;
    } | null>(null),
    [repairPathsDraft, setRepairPathsDraft] = useState("");
  const [workspaceAnalysis, setWorkspaceAnalysis] =
      useState<WorkspaceAnalysis | null>(null),
    [analysisWorkspace, setAnalysisWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [analysisLoading, setAnalysisLoading] = useState(false),
    [inventoryLayout, setInventoryLayout] = useState<"grid" | "list">("grid"),
    [analysisCompletedAt, setAnalysisCompletedAt] = useState<string | null>(
      null,
    );
  const [testDiscovery, setTestDiscovery] =
      useState<WorkspaceTestDiscovery | null>(null),
    [testDiscoveryWorkspace, setTestDiscoveryWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [testDiscoveryLoading, setTestDiscoveryLoading] = useState(false),
    [testExecution, setTestExecution] = useState<WorkspaceTestRunStatus | null>(
      null,
    ),
    [testExecutionTarget, setTestExecutionTarget] = useState(""),
    [testExecutionLoading, setTestExecutionLoading] = useState(false),
    [buildExecution, setBuildExecution] =
      useState<WorkspaceTestRunStatus | null>(null),
    [buildExecutionTarget, setBuildExecutionTarget] = useState(""),
    [buildExecutionWorkspaceId, setBuildExecutionWorkspaceId] = useState<
      string | null
    >(null),
    [buildExecutionLoading, setBuildExecutionLoading] = useState(false),
    [testPlan, setTestPlan] = useState<AITestPlan | null>(null),
    [testRequest, setTestRequest] = useState(""),
    [testAIConsent, setTestAIConsent] = useState(false),
    [testPlanLoading, setTestPlanLoading] = useState(false),
    [testPlanSaveLoading, setTestPlanSaveLoading] = useState(false),
    [testPlanSavedId, setTestPlanSavedId] = useState<string | null>(null),
    [savedTestPlans, setSavedTestPlans] = useState<SavedAITestPlan[]>([]);
  const [architectWorkspace, setArchitectWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [architectPlan, setArchitectPlan] = useState<ArchitecturePlan | null>(null),
    [architectRequest, setArchitectRequest] = useState(""),
    [architectConsent, setArchitectConsent] = useState(false),
    [architectLoading, setArchitectLoading] = useState(false);
  const [developerWorkspace, setDeveloperWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [developerFile, setDeveloperFile] = useState<WorkspaceFileContent | null>(
      null,
    ),
    [developerRequest, setDeveloperRequest] = useState(""),
    [developerConsent, setDeveloperConsent] = useState(false),
    [developerLoading, setDeveloperLoading] = useState(false),
    [developerSuggestion, setDeveloperSuggestion] =
      useState<CodeSuggestionPreview | null>(null),
    [developerApplyApproval, setDeveloperApplyApproval] = useState(false),
    [developerApplied, setDeveloperApplied] = useState(false);
  const [developerIsNewFile, setDeveloperIsNewFile] = useState(false),
    [developerNewPath, setDeveloperNewPath] = useState("");
  const [uiDesignerWorkspace, setUiDesignerWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [uiDesignRequest, setUiDesignRequest] = useState(""),
    [uiDesignPath, setUiDesignPath] = useState(""),
    [uiDesignConsent, setUiDesignConsent] = useState(false),
    [uiDesignResult, setUiDesignResult] = useState<UiDesignPreview | null>(
      null,
    ),
    [uiDesignLoading, setUiDesignLoading] = useState(false),
    [uiDesignApplyApproval, setUiDesignApplyApproval] = useState(false),
    [uiDesignApplied, setUiDesignApplied] = useState(false);
  const [changeWorkspace, setChangeWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [workspaceChanges, setWorkspaceChanges] = useState<WorkspaceChanges | null>(
      null,
    ),
    [changeDiff, setChangeDiff] = useState<WorkspaceChangeDiff | null>(null),
    [changeLoading, setChangeLoading] = useState(false),
    [restoreApproval, setRestoreApproval] = useState(false);
  const [gitStatusWorkspace, setGitStatusWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [workspaceGitStatus, setWorkspaceGitStatus] =
      useState<WorkspaceGitStatus | null>(null),
    [gitStatusLoading, setGitStatusLoading] = useState(false),
    [releaseTestEvidence, setReleaseTestEvidence] = useState<WorkspaceTestRunStatus | null>(null),
    [releaseCandidates, setReleaseCandidates] = useState<ReleaseCandidate[]>(
      [],
    ),
    [releaseCandidateSaving, setReleaseCandidateSaving] = useState(false),
    [releaseVersions, setReleaseVersions] = useState<ReleaseVersion[]>([]),
    [releasePackages, setReleasePackages] = useState<ReleasePackage[]>([]),
    [releasePackageLoading, setReleasePackageLoading] = useState<string | null>(
      null,
    ),
    [releasePackageDownloadLoading, setReleasePackageDownloadLoading] =
      useState<string | null>(null),
    [releaseDeployments, setReleaseDeployments] = useState<ReleaseDeployment[]>(
      [],
    ),
    [productionDeployments, setProductionDeployments] = useState<
      ReleaseDeployment[]
    >([]),
    [productionApprovals, setProductionApprovals] = useState<
      ProductionApproval[]
    >([]),
    [releaseDeploymentLoading, setReleaseDeploymentLoading] = useState(false),
    [stagingCredentials, setStagingCredentials] =
      useState<StagingDeploymentOperation | null>(null),
    [pullRequestDraft, setPullRequestDraft] = useState<{
      candidateId: string;
      draft: PullRequestDraft;
    } | null>(null),
    [pullRequestDraftLoading, setPullRequestDraftLoading] = useState(false),
    [publishedPullRequest, setPublishedPullRequest] =
      useState<PublishedPullRequest | null>(null),
    [pullRequestPublishLoading, setPullRequestPublishLoading] = useState(false),
    [pullRequestReadyLoading, setPullRequestReadyLoading] = useState<
      string | null
    >(null);
  const [sourceSearchWorkspace, setSourceSearchWorkspace] =
      useState<WorkspaceRequest | null>(null),
    [sourceSearchQuery, setSourceSearchQuery] = useState(""),
    [sourceSearchResult, setSourceSearchResult] =
      useState<WorkspaceSearchResult | null>(null),
    [sourceSearchLoading, setSourceSearchLoading] = useState(false),
    [selectedSourceMatches, setSelectedSourceMatches] = useState<string[]>([]),
    [sourceAnalysisQuestion, setSourceAnalysisQuestion] = useState(""),
    [sourceAnalysisConsent, setSourceAnalysisConsent] = useState(false),
    [sourceAnalysisLoading, setSourceAnalysisLoading] = useState(false),
    [sourceAnalysisResult, setSourceAnalysisResult] =
      useState<SourceAnalysisResult | null>(null);
  const [workspaceGitDiff, setWorkspaceGitDiff] =
      useState<WorkspaceGitDiff | null>(null),
    [gitDiffTarget, setGitDiffTarget] = useState<string | null>(null),
    [gitDiffLoading, setGitDiffLoading] = useState(false),
    [codeReview, setCodeReview] = useState<StudioCodeReview | null>(null),
    [codeReviewConsent, setCodeReviewConsent] = useState(false),
    [codeReviewLoading, setCodeReviewLoading] = useState(false);
  const [reviewThreads, setReviewThreads] = useState<StudioCodeReviewThread[]>(
      [],
    ),
    [reviewLine, setReviewLine] = useState("1"),
    [reviewDraft, setReviewDraft] = useState(""),
    [reviewReplyThread, setReviewReplyThread] = useState<string | null>(null),
    [reviewReplyDraft, setReviewReplyDraft] = useState(""),
    [reviewSaving, setReviewSaving] = useState(false);
  const [chatWorkspace, setChatWorkspace] = useState<WorkspaceRequest | null>(
      null,
    ),
    [studioConversations, setStudioConversations] = useState<
      StudioConversation[]
    >([]),
    [chatConversation, setChatConversation] =
      useState<StudioConversation | null>(null),
    [chatMessages, setChatMessages] = useState<StudioConversationMessage[]>([]),
    [chatTitle, setChatTitle] = useState(""),
    [chatDraft, setChatDraft] = useState(""),
    [chatAIConsent, setChatAIConsent] = useState(false),
    [chatKnowledgeConsent, setChatKnowledgeConsent] = useState(false),
    [chatSourceSharingConsent, setChatSourceSharingConsent] = useState(false),
    [chatLoading, setChatLoading] = useState(false),
    [chatStreamingText, setChatStreamingText] = useState(""),
    [chatCodeChangeLoading, setChatCodeChangeLoading] = useState(false),
    [chatCodeChange, setChatCodeChange] =
      useState<StudioChatCodeChangePreview | null>(null),
    [chatCodeChangeApplied, setChatCodeChangeApplied] = useState<string[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<StudioKnowledgeDocument[]>(
      [],
    ),
    [knowledgePaths, setKnowledgePaths] = useState<string[]>([]),
    [knowledgeHistoryCandidates, setKnowledgeHistoryCandidates] = useState<
      ApprovedHistoryCandidate[]
    >([]),
    [knowledgeHistoryIds, setKnowledgeHistoryIds] = useState<string[]>([]),
    [knowledgeLoading, setKnowledgeLoading] = useState(false),
    [knowledgeAutoRefresh, setKnowledgeAutoRefresh] =
      useState<StudioKnowledgeAutoRefresh>({
        enabled: false,
        allFiles: false,
        paths: [],
        lastRefreshedAt: null,
      }),
    [enableKnowledgeAutoRefresh, setEnableKnowledgeAutoRefresh] =
      useState(false),
    [knowledgePanelExpanded, setKnowledgePanelExpanded] = useState(false),
    [knowledgeDrawerOpen, setKnowledgeDrawerOpen] = useState(false);
  const [architectSavedPlanId, setArchitectSavedPlanId] = useState<
      string | null
    >(null),
    [savedArchitecturePlans, setSavedArchitecturePlans] = useState<
      SavedArchitecturePlan[]
    >([]),
    [showPlanHistory, setShowPlanHistory] = useState(false);
  const [aiDockOpen, setAiDockOpen] = useState(false);
  const [aiToolsViewOpen, setAiToolsViewOpen] = useState(false);
  const [aiToolsCategory, setAiToolsCategory] = useState("Tümü");
  const [aiToolsQuery, setAiToolsQuery] = useState("");
  const [moduleFilesLoading, setModuleFilesLoading] = useState(false);
  const [name, setName] = useState(""),
    [repositoryUrl, setRepositoryUrl] = useState(""),
    [defaultBranch, setDefaultBranch] = useState("main");
  const [memberEmail, setMemberEmail] = useState(""),
    [accessLevel, setAccessLevel] =
      useState<ProjectMember["accessLevel"]>("Viewer"),
    [workspaceBranch, setWorkspaceBranch] = useState(""),
    [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [sandboxErrorAnalysis, setSandboxErrorAnalysis] =
      useState<SandboxErrorAnalysisResponse | null>(null),
    [sandboxErrorAnalysisLoading, setSandboxErrorAnalysisLoading] =
      useState(false);
  const [workspaceCommitLoading, setWorkspaceCommitLoading] = useState(false);
  useEffect(() => {
    const query = workspaceFileFilter.trim();
    if (!fileWorkspace || !query) {
      setWorkspaceFileSearchResult(null);
      setWorkspaceFileSearchLoading(false);
      return;
    }
    let active = true;
    setWorkspaceFileSearchResult(null);
    setWorkspaceFileSearchLoading(true);
    const timer = window.setTimeout(() => {
      void api<WorkspaceFileSearchResult>(
        `/studio/projects/${fileWorkspace.projectId}/workspace-requests/${fileWorkspace.id}/files/search?query=${encodeURIComponent(query)}`,
        token,
      )
        .then((result) => {
          if (active) setWorkspaceFileSearchResult(result);
        })
        .catch((e) => {
          if (active) {
            setWorkspaceFileSearchResult({
              scannedEntries: 0,
              truncated: false,
              entries: [],
            });
            setError((e as Error).message);
          }
        })
        .finally(() => {
          if (active) setWorkspaceFileSearchLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [workspaceFileFilter, fileWorkspace, token]);
  const moduleCodeForWorkspace = (request: WorkspaceRequest | null) => {
    const code =
      /\bModül kodu:\s*([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)/i
        .exec(request?.developmentRequestDescription ?? "")?.[1]
        ?.toLowerCase() ?? "";
    return /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(code) ? code : "";
  };
  const moduleStarterForWorkspace = (request: WorkspaceRequest | null) =>
    /\bModül şablonu:\s*(greeting|price|text-summary)\b/i
      .exec(request?.developmentRequestDescription ?? "")?.[1]
      ?.toLowerCase() ?? "";
  const moduleDisplayNameForWorkspace = (request: WorkspaceRequest | null) =>
    /\bModül adı:\s*([^\r\n]+)/i
      .exec(request?.developmentRequestDescription ?? "")?.[1]
      ?.trim() ||
    moduleCodeForWorkspace(request) ||
    "Yeni modül";
  const moduleWorkspaceCode = moduleCodeForWorkspace(fileWorkspace);
  const moduleWorkspacePath = moduleWorkspaceCode
    ? `modules/${moduleWorkspaceCode}`
    : "";
  const moduleStarterId = moduleStarterForWorkspace(fileWorkspace);
  const moduleTemplateFiles = moduleStarterFiles(
    moduleStarterId,
    moduleWorkspaceCode,
    moduleDisplayNameForWorkspace(fileWorkspace),
  );
  const isInsideModuleWorkspace = (path: string) =>
    Boolean(
      moduleWorkspacePath &&
        (path === moduleWorkspacePath ||
          path.startsWith(`${moduleWorkspacePath}/`)),
    );
  const visibleWorkspaceEntries = (
    workspaceFileFilter.trim()
      ? (workspaceFileSearchResult?.entries ?? [])
      : (fileListing?.entries ?? [])
  ).filter((entry) => {
    if (!moduleWorkspacePath) return true;
    if (workspaceFileFilter.trim()) return isInsideModuleWorkspace(entry.path);
    if (filePath === "")
      return entry.path === "modules" && entry.kind === "Directory";
    if (filePath === "modules") return entry.path === moduleWorkspacePath;
    return isInsideModuleWorkspace(filePath)
      ? isInsideModuleWorkspace(entry.path)
      : false;
  });
  async function loadPendingApprovals(offset = 0) {
    setApprovalQueueLoading(true);
    try {
      const page = await api<PendingWorkspaceApprovalsPage>(
        `/studio/workspace-requests/pending?offset=${offset}`,
        token,
      );
      if (page.items.length === 0 && offset > 0) {
        await loadPendingApprovals(Math.max(0, offset - 100));
        return;
      }
      setPendingApprovals(page.items);
      setPendingApprovalsOffset(offset);
      setPendingApprovalsNextOffset(page.nextOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApprovalQueueLoading(false);
    }
  }
  async function load() {
    try {
      await refreshProjects();
      await loadPendingApprovals();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function refreshProjectStatus() {
    setBusy(true);
    setError("");
    try {
      const latest = await refreshProjects();
      const connected = latest.find((project) => project.githubAuthorized);
      setNotice(
        connected
          ? "GitHub bağlantı durumu sunucudan yenilendi."
          : "Sunucu yanıtında yetkilendirilmiş proje görünmüyor.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void loadPendingApprovals();
    void api<{ aiConfigured: boolean }>("/studio/capabilities", token)
      .then((status) => setAiConfigured(status.aiConfigured))
      .catch(() => setAiConfigured(null));
    const url = new URL(window.location.href);
    const result = url.searchParams.get("github");
    if (!result) return;
    const messages: Record<string, string> = {
      connected: "GitHub yetkisi bu projeye bağlandı.",
      expired:
        "GitHub yetkilendirme bağlantısının süresi doldu. Yeniden deneyin.",
      invalid: "GitHub yetkilendirmesi doğrulanamadı.",
      "not-authorized":
        "Projeye yetki veren kullanıcı artık proje Maintainer’ı değil.",
      unsupported: "Yalnız GitHub HTTPS depoları bağlanabilir.",
      "not-configured":
        "GitHub App sunucu yapılandırması eksik. Platform yöneticisiyle iletişime geçin.",
      "repository-access-denied":
        "GitHub App kurulumu bu depoya erişemiyor. Kurulumda doğru depoyu seçin.",
      "setup-failed":
        "GitHub kurulumu sunucuya kaydedilemedi. Studio yöneticinizden sunucu günlüklerini kontrol etmesini isteyin ve yeniden deneyin.",
    };
    setNotice(messages[result] ?? "GitHub yetkilendirmesi tamamlanamadı.");
    if (result === "connected") {
      const projectId = url.searchParams.get("projectId")?.toLowerCase();
      if (projectId) {
        void load().then(() => {
          setProjects((current) =>
            current.map((project) =>
              project.id.toLowerCase() === projectId
                ? { ...project, githubAuthorized: true }
                : project,
            ),
          );
          setWorkspaceProject((current) =>
            current?.id.toLowerCase() === projectId
              ? { ...current, githubAuthorized: true }
              : current,
          );
        });
      }
    }
    url.searchParams.delete("github");
    url.searchParams.delete("projectId");
    window.history.replaceState(null, "", url.toString());
  }, [token]);
  async function createProject(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<DevelopmentProject>("/studio/projects/", token, {
        method: "POST",
        body: JSON.stringify({ name, repositoryUrl, defaultBranch }),
      });
      setName("");
      setRepositoryUrl("");
      setDefaultBranch("main");
      setShowCreate(false);
      setNotice(
        "Proje kaydedildi. Bu aşamada depo içeriği okunmuyor veya çalıştırılmıyor.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openAccess(project: DevelopmentProject) {
    setAccessProject(project);
    setError("");
    try {
      setMembers(
        await api<ProjectMember[]>(
          `/studio/projects/${project.id}/members`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function grantAccess(e: FormEvent) {
    e.preventDefault();
    if (!accessProject) return;
    setBusy(true);
    setError("");
    try {
      await api<ProjectMember>(
        `/studio/projects/${accessProject.id}/members`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ email: memberEmail, accessLevel }),
        },
      );
      setMemberEmail("");
      setNotice("Proje erişimi güncellendi.");
      setMembers(
        await api<ProjectMember[]>(
          `/studio/projects/${accessProject.id}/members`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revokeAccess(member: ProjectMember) {
    if (
      !accessProject ||
      !(await confirmDialog({ title: "Proje erişimi kaldırılsın mı?", message: `${member.email} kullanıcısının proje erişimi kaldırılsın mı?`, tone: "danger", confirmLabel: "Erişimi kaldır" }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/studio/projects/${accessProject.id}/members/${member.userId}`,
        token,
        { method: "DELETE" },
      );
      setMembers(
        await api<ProjectMember[]>(
          `/studio/projects/${accessProject.id}/members`,
          token,
        ),
      );
      setNotice("Proje erişimi kaldırıldı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadProjectBranches(project: DevelopmentProject) {
    setBranchesLoading(true);
    setBranchListError("");
    try {
      const branchList = await api<{
        defaultBranch: string;
        branches: string[];
      }>(`/studio/projects/${project.id}/branches`, token);
      const branches = [...new Set(branchList.branches)];
      if (!branches.includes(branchList.defaultBranch))
        throw new Error(
          "Remote default branch is not in the repository branch list.",
        );
      setWorkspaceBranches(branches);
      setWorkspaceBranch(branchList.defaultBranch);
      const refreshedProject = {
        ...project,
        defaultBranch: branchList.defaultBranch,
      };
      setWorkspaceProject((current) =>
        current?.id === project.id ? refreshedProject : current,
      );
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? { ...item, defaultBranch: branchList.defaultBranch }
            : item,
        ),
      );
      setBranchesAvailable(true);
      setBranchListError("");
    } catch (e) {
      setBranchesAvailable(false);
      setCustomWorkspaceBranch(true);
      setWorkspaceBranch("");
      setBranchListError((e as Error).message);
    } finally {
      setBranchesLoading(false);
    }
  }
  async function openWorkspace(project: DevelopmentProject) {
    setWorkspaceProject(project);
    setWorkspaceBranch("");
    setSelectedDevelopmentRequestId("");
    setWorkspaceBranches([]);
    setBranchesAvailable(false);
    setBranchListError("");
    setCustomWorkspaceBranch(false);
    setBranchesLoading(true);
    setReviewNote("");
    setError("");
    try {
      const [requests, plans, developmentRequests] = await Promise.all([
        api<WorkspaceRequest[]>(
          `/studio/projects/${project.id}/workspace-requests`,
          token,
        ),
        api<SavedArchitecturePlan[]>(
          `/studio/projects/${project.id}/architecture-plans`,
          token,
        ),
        api<DevelopmentRequest[]>(
          `/studio/requests/?projectId=${project.id}`,
          token,
        ),
      ]);
      setWorkspaceRequests(requests);
      setSavedArchitecturePlans(plans);
      setProjectDevelopmentRequests(developmentRequests);
      await loadProjectBranches(project);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBranchesLoading(false);
    }
  }
  async function connectProjectGitHub() {
    if (!workspaceProject) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ authorizationUrl: string }>(
        `/studio/projects/${workspaceProject.id}/github/authorization`,
        token,
        { method: "POST" },
      );
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function disconnectProjectGitHub() {
    if (
      !workspaceProject ||
      !(await confirmDialog({ title: "GitHub App bağlantısı kaldırılsın mı?", message: "Bu projenin GitHub App bağlantısı kaldırılsın mı?", tone: "danger", confirmLabel: "Bağlantıyı kaldır" }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<void>(
        `/studio/projects/${workspaceProject.id}/github/authorization`,
        token,
        { method: "DELETE" },
      );
      const updated = { ...workspaceProject, githubAuthorized: false };
      setWorkspaceProject(updated);
      setProjects((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice("GitHub bağlantısı kaldırıldı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createWorkspaceRequest(e: FormEvent) {
    e.preventDefault();
    if (!workspaceProject) return;
    setBusy(true);
    setError("");
    try {
      await api<WorkspaceRequest>(
        `/studio/projects/${workspaceProject.id}/workspace-requests`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            branchName: workspaceBranch,
            developmentRequestId: selectedDevelopmentRequestId || null,
          }),
        },
      );
      setNotice(
        "İzole çalışma alanı talebi ve geliştirme bağlamı onaya gönderildi.",
      );
      setWorkspaceRequests(
        await api<WorkspaceRequest[]>(
          `/studio/projects/${workspaceProject.id}/workspace-requests`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reviewWorkspaceRequest(
    request: WorkspaceRequest,
    outcome: "Approve" | "Reject",
  ) {
    if (!workspaceProject) return;
    setBusy(true);
    setError("");
    try {
      await api<WorkspaceRequest>(
        `/studio/workspace-requests/${request.id}/review`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ outcome, note: reviewNote || null }),
        },
      );
      setWorkspaceRequests(
        await api<WorkspaceRequest[]>(
          `/studio/projects/${workspaceProject.id}/workspace-requests`,
          token,
        ),
      );
      await loadPendingApprovals(pendingApprovalsOffset);
      setNotice(
        outcome === "Approve"
          ? "Çalışma alanı talebi onaylandı."
          : "Çalışma alanı talebi reddedildi.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reviewPendingApproval(
    request: PendingWorkspaceApproval,
    outcome: "Approve" | "Reject",
  ) {
    if (outcome === "Reject" && !reviewNote.trim()) {
      setError("Ret için kısa bir gerekçe girin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api<WorkspaceRequest>(
        `/studio/workspace-requests/${request.id}/review`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ outcome, note: reviewNote.trim() || null }),
        },
      );
      const refreshOffset =
        pendingApprovals.length === 1 && pendingApprovalsOffset > 0
          ? pendingApprovalsOffset - 100
          : pendingApprovalsOffset;
      await loadPendingApprovals(refreshOffset);
      if (workspaceProject?.id === request.projectId)
        setWorkspaceRequests(
          await api<WorkspaceRequest[]>(
            `/studio/projects/${request.projectId}/workspace-requests`,
            token,
          ),
        );
      setReviewNote("");
      setNotice(
        outcome === "Approve"
          ? "Çalışma alanı talebi onaylandı."
          : "Çalışma alanı talebi reddedildi.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelWorkspaceRequest(request: WorkspaceRequest) {
    if (
      !workspaceProject ||
      !(await confirmDialog({ title: "Çalışma alanı talebi iptal edilsin mi?", message: `${request.branchName} dalı için bekleyen çalışma alanı talebi iptal edilsin mi?`, tone: "warning", confirmLabel: "Talebi iptal et" }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<WorkspaceRequest>(
        `/studio/workspace-requests/${request.id}/cancel`,
        token,
        { method: "POST" },
      );
      setWorkspaceRequests(
        await api<WorkspaceRequest[]>(
          `/studio/projects/${workspaceProject.id}/workspace-requests`,
          token,
        ),
      );
      setNotice(
        "Çalışma alanı talebi iptal edildi ve denetim kaydına yazıldı.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archiveWorkspaceRequest(request: WorkspaceRequest) {
    if (
      !workspaceProject ||
      !request.canDelete ||
      request.status === "Provisioning"
    )
      return;
    if (
      !(await confirmDialog({ title: "Çalışma alanı talebi listeden kaldırılsın mı?", message: `"${request.branchName}" çalışma alanı talebi etkin listeden silinsin mi? Denetim geçmişi ve izole çalışma alanındaki dosyalar korunur.`, tone: "warning", confirmLabel: "Listeden kaldır" }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api<void>(
        `/studio/workspace-requests/${request.id}/archive`,
        token,
        { method: "POST" },
      );
      setWorkspaceRequests((current) =>
        current.filter((item) => item.id !== request.id),
      );
      setNotice(
        "Çalışma alanı talebi etkin listeden kaldırıldı; denetim geçmişi ve dosyalar korundu.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function provisionWorkspace(request: WorkspaceRequest) {
    if (!workspaceProject) return;
    setBusy(true);
    setError("");
    try {
      await api<WorkspaceRequest>(
        `/studio/workspace-requests/${request.id}/provision`,
        token,
        { method: "POST" },
      );
      setWorkspaceRequests(
        await api<WorkspaceRequest[]>(
          `/studio/projects/${workspaceProject.id}/workspace-requests`,
          token,
        ),
      );
      setNotice(
        "İzole checkout oluşturuldu. Kaynak kodu henüz çalıştırılmadı.",
      );
    } catch (e) {
      setError((e as Error).message);
      setWorkspaceRequests(
        await api<WorkspaceRequest[]>(
          `/studio/projects/${workspaceProject.id}/workspace-requests`,
          token,
        ).catch(() => workspaceRequests),
      );
    } finally {
      setBusy(false);
    }
  }
  async function ensureWorkspaceBranch(request: WorkspaceRequest) {
    if (!workspaceProject) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<WorkspaceRequest>(
        `/studio/workspace-requests/${request.id}/working-branch`,
        token,
        { method: "POST" },
      );
      setWorkspaceRequests((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        `İzole çalışma dalı ${updated.workspaceBranchName} oluşturuldu; checkout içeriği korunarak ${updated.commitSha} commit’inden devam ediyor.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadWorkspaceFiles(
    request: WorkspaceRequest,
    path: string,
    offset = 0,
  ) {
    if (!workspaceProject) return;
    if (offset === 0) setWorkspaceFileFilter("");
    setFileLoading(true);
    setFileContent(null);
    setError("");
    try {
      const query = `path=${encodeURIComponent(path)}&offset=${offset}`;
      setFileListing(
        await api<WorkspaceFileListing>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/files?${query}`,
          token,
        ),
      );
      setFileWorkspace(request);
      setFilePath(path);
      updateWorkspaceRoute(workspaceProject.id, request.id, path);
      setKnowledgePaths([]);
      setKnowledgeHistoryIds([]);
      setEnableKnowledgeAutoRefresh(false);
      void api<{
        documents: StudioKnowledgeDocument[];
        autoRefresh: StudioKnowledgeAutoRefresh;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/knowledge`,
        token,
      )
        .then((result) => {
          setKnowledgeDocs(result.documents);
          setKnowledgeAutoRefresh(result.autoRefresh);
        })
        .catch(() => {
          setKnowledgeDocs([]);
          setKnowledgeAutoRefresh({
            enabled: false,
            paths: [],
            lastRefreshedAt: null,
          });
        });
      if (workspaceProject.accessLevel !== "Viewer")
        void api<{ items: ApprovedHistoryCandidate[] }>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/knowledge/approved-history`,
          token,
        )
          .then((result) => setKnowledgeHistoryCandidates(result.items))
          .catch(() => setKnowledgeHistoryCandidates([]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFileLoading(false);
    }
  }
  async function loadModuleStarterIntoWorkspace() {
    if (
      !workspaceProject ||
      !fileWorkspace ||
      workspaceProject.accessLevel === "Viewer" ||
      moduleFilesLoading ||
      moduleTemplateFiles.length === 0
    )
      return;
    const moduleRoot = `modules/${moduleWorkspaceCode}`;
    setModuleFilesLoading(true);
    setError("");
    try {
      const existing = new Set<string>();
      for (const directory of ["modules", moduleRoot, `${moduleRoot}/src`]) {
        try {
          const listing = await api<WorkspaceFileListing>(
            `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/files?path=${encodeURIComponent(directory)}&offset=0`,
            token,
          );
          for (const entry of listing.entries) existing.add(entry.path);
        } catch {
          /* A missing module directory is expected for a new module. */
        }
      }
      const missing = moduleTemplateFiles.filter(
        (file) => !existing.has(file.path),
      );
      if (!missing.length) {
        setNotice("Bu modülün başlangıç dosyaları çalışma alanında zaten var.");
        await loadWorkspaceFiles(fileWorkspace, moduleRoot);
        return;
      }
      if (
        !(await confirmDialog({ title: "Eksik dosyalar çalışma alanına eklensin mi?", message: `${missing.map((file) => file.path).join("\n")} dosyaları izole çalışma alanına eklenecek. Var olan dosyalar değiştirilmez; kod çalıştırılmaz. Devam edilsin mi?`, tone: "default", confirmLabel: "Dosyaları ekle" }))
      )
        return;
      for (const file of missing) {
        await api<AppliedCodeSuggestion>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/apply-code-suggestion`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              filePath: file.path,
              expectedSha256: "",
              proposedContent: file.content,
              approvalConfirmed: true,
              createNewFile: true,
              manualEdit: true,
            }),
          },
        );
      }
      setNotice(
        `${missing.length} modül başlangıç dosyası onayınızla eklendi.`,
      );
      await loadWorkspaceFiles(fileWorkspace, moduleRoot);
    } catch (e) {
      setError((e as Error).message);
      await loadWorkspaceFiles(fileWorkspace, moduleRoot);
    } finally {
      setModuleFilesLoading(false);
    }
  }
  async function indexSelectedKnowledge() {
    if (
      !workspaceProject ||
      !fileWorkspace ||
      (knowledgePaths.length === 0 && knowledgeHistoryIds.length === 0) ||
      knowledgeLoading
    )
      return;
    if (
      !(await confirmDialog({ title: "Dosyalar bilgi tabanına eklensin mi?", message: `${knowledgePaths.length} dosya ve ${knowledgeHistoryIds.length} onaylanmış geliştirme geçmişi kaydı tenant'a ait AI Studio bilgi tabanında saklanacak ve seçili AI sağlayıcısına anlamsal indeksleme için gönderilecek.${enableKnowledgeAutoRefresh ? ` Seçilen ${knowledgePaths.length} dosya, bilgi tabanı seçilen sonraki sohbetlerde tekrar kullanılmadan önce çalışma alanından otomatik yenilenecek.` : ""} Yalnızca seçtikleriniz paylaşılır. Devam edilsin mi?`, tone: "warning", confirmLabel: "Bilgi tabanına ekle" }))
    )
      return;
    setKnowledgeLoading(true);
    setError("");
    try {
      const result = await api<{
        indexed: number;
        indexedHistory: number;
        semanticIndexed: number;
        retrievalMode: "semantic" | "keyword";
        skippedUnchanged: number;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/knowledge`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            paths: knowledgePaths,
            approvedHistoryCandidateIds: knowledgeHistoryIds,
            aiSharingConfirmed: true,
            enableAutoRefresh: enableKnowledgeAutoRefresh,
          }),
        },
      );
      const current = await api<{
        documents: StudioKnowledgeDocument[];
        autoRefresh: StudioKnowledgeAutoRefresh;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/knowledge`,
        token,
      );
      setKnowledgeDocs(current.documents);
      setKnowledgeAutoRefresh(current.autoRefresh);
      setKnowledgePaths([]);
      setKnowledgeHistoryIds([]);
      setEnableKnowledgeAutoRefresh(false);
      setNotice(
        `${result.indexed} kaynak indekslendi (${result.indexedHistory} onaylı geçmiş kaydı); ${result.semanticIndexed} anlamsal aramaya hazır; ${result.skippedUnchanged} değişmemiş kaynak atlandı.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setKnowledgeLoading(false);
    }
  }
  async function revokeKnowledgeAutoRefresh() {
    if (
      !workspaceProject ||
      !fileWorkspace ||
      !(await confirmDialog({ title: "Otomatik yenileme izni kaldırılsın mı?", message: "Bu çalışma alanı için otomatik bilgi tabanı yenileme izni kaldırılsın mı?", tone: "warning", confirmLabel: "İzni kaldır" }))
    )
      return;
    setKnowledgeLoading(true);
    setError("");
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/knowledge/auto-refresh`,
        token,
        { method: "DELETE" },
      );
      setKnowledgeAutoRefresh({
        enabled: false,
        paths: [],
        lastRefreshedAt: null,
      });
      setNotice(
        "Otomatik yenileme izni kaldırıldı. Mevcut bilgi tabanı kayıtları silinmedi.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setKnowledgeLoading(false);
    }
  }
  async function enableKnowledgeAutoRefreshAll() {
    if (!workspaceProject || !fileWorkspace || knowledgeLoading) return;
    if (
      !(await confirmDialog({ title: "Sohbette kaynak kod araması açılsın mı?", message: `Her sohbet mesajı öncesinde bu izole çalışma alanındaki desteklenen kaynak kodunda ilgili arama yapılacak; güvenli eşleşmeler tenant'ta seçili AI sağlayıcısına gönderilecek. Bu izin bu workspace için kalıcıdır; ERP kayıtları, sır dosyaları ve ikili dosyalar kapsam dışıdır. Açmak istiyor musunuz?`, tone: "warning", confirmLabel: "İzni ver" }))
    )
      return;
    setKnowledgeLoading(true);
    setError("");
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/knowledge/auto-refresh-all`,
        token,
        { method: "POST", body: JSON.stringify({ confirmed: true }) },
      );
      setKnowledgeAutoRefresh({
        enabled: true,
        allFiles: true,
        paths: [],
        lastRefreshedAt: new Date().toISOString(),
      });
      setNotice(
        "Bu çalışma alanı için kalıcı AI erişimi açıldı. İlgili kaynak alıntıları her sohbet öncesinde otomatik aranıp kullanılacak.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setKnowledgeLoading(false);
    }
  }
  async function deleteKnowledgeDocument(document: StudioKnowledgeDocument) {
    if (
      !workspaceProject ||
      !fileWorkspace ||
      !(await confirmDialog({ title: "Dosya bilgi tabanından silinsin mi?", message: `${document.path} dosyasının bu sürümünü bilgi tabanından silmek istiyor musunuz?`, tone: "danger", confirmLabel: "Sil" }))
    )
      return;
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/knowledge/${document.id}`,
        token,
        { method: "DELETE" },
      );
      setKnowledgeDocs((current) =>
        current.filter((item) => item.path !== document.path),
      );
      setKnowledgeAutoRefresh((current) => {
        const paths = current.paths.filter((path) => path !== document.path);
        return {
          ...current,
          paths,
          enabled: current.enabled && paths.length > 0,
        };
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadWorkspaceFile(request: WorkspaceRequest, path: string) {
    if (!workspaceProject) return;
    setFileLoading(true);
    setFileContent(null);
    setError("");
    try {
      setFileContent(
        await api<WorkspaceFileContent>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/file-content?path=${encodeURIComponent(path)}`,
          token,
        ),
      );
      updateWorkspaceRoute(workspaceProject.id, request.id, filePath, path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFileLoading(false);
    }
  }
  function startManualFileEdit() {
    if (
      !fileWorkspace ||
      !fileContent ||
      workspaceProject?.accessLevel === "Viewer"
    )
      return;
    setManualFilePath(fileContent.path);
    setManualFileContent(fileContent.content);
    setManualFileCreating(false);
    setManualFileEditing(true);
    setError("");
  }
  function startManualNewFile(request: WorkspaceRequest) {
    if (!workspaceProject || workspaceProject.accessLevel === "Viewer") return;
    const moduleRoot = moduleCodeForWorkspace(request)
      ? `modules/${moduleCodeForWorkspace(request)}`
      : "";
    const modulePathIsOpen = Boolean(
      moduleRoot &&
        (filePath === moduleRoot || filePath.startsWith(`${moduleRoot}/`)),
    );
    const path = moduleRoot
      ? modulePathIsOpen
        ? `${filePath}/NewFile.rs`
        : `${moduleRoot}/src/lib.rs`
      : filePath
        ? `${filePath}/NewComponent.tsx`
        : "NewComponent.tsx";
    setFileWorkspace(request);
    setFileContent({ path, content: "", sizeBytes: 0, sha256: "" });
    setManualFilePath(path);
    setManualFileContent("");
    setManualFileCreating(true);
    setManualFileEditing(true);
    setError("");
  }
  async function saveManualFile(contentOverride?: string) {
    const contentToSave = contentOverride ?? manualFileContent;
    if (
      !workspaceProject ||
      !fileWorkspace ||
      !fileContent ||
      !manualFileEditing ||
      manualFileSaving
    )
      return;
    const path = manualFileCreating ? manualFilePath : fileContent.path;
    if (
      !(await confirmDialog({ title: "Manuel kod dosyaya uygulansın mı?", message: `Manuel kod ${path} dosyasına izole çalışma alanında uygulanacak. Güncel dosya değişmişse işlem durdurulur. Kod çalıştırılmayacak. Devam edilsin mi?`, tone: "default", confirmLabel: "Uygula" }))
    )
      return;
    setManualFileSaving(true);
    setError("");
    try {
      const applied = await api<AppliedCodeSuggestion>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/apply-code-suggestion`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            filePath: path,
            expectedSha256: fileContent.sha256,
            proposedContent: contentToSave,
            approvalConfirmed: true,
            createNewFile: manualFileCreating,
            manualEdit: true,
          }),
        },
      );
      const sizeBytes = new TextEncoder().encode(contentToSave).length;
      setFileContent({
        path,
        content: contentToSave,
        sizeBytes,
        sha256: applied.sha256,
      });
      setManualFileEditing(false);
      setManualFileCreating(false);
      setNotice(
        `Manuel kod ${path} dosyasına onayla kaydedildi. Kod çalıştırılmadı.`,
      );
      if (manualFileCreating) {
        const query = `path=${encodeURIComponent(filePath)}&offset=0`;
        setFileListing(
          await api<WorkspaceFileListing>(
            `/studio/projects/${workspaceProject.id}/workspace-requests/${fileWorkspace.id}/files?${query}`,
            token,
          ),
        );
      }
      if (changeWorkspace?.id === fileWorkspace.id)
        await loadWorkspaceChanges(fileWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setManualFileSaving(false);
    }
  }

  function hasUnsavedManualFileChanges() {
    return (
      manualFileEditing &&
      (manualFileCreating
        ? manualFileContent.length > 0 || manualFilePath !== fileContent?.path
        : manualFileContent !== fileContent?.content)
    );
  }
  async function cancelManualFileEdit() {
    if (
      hasUnsavedManualFileChanges() &&
      !(await confirmDialog({ title: "Düzenleme iptal edilsin mi?", message: "Kaydedilmemiş manuel kod değişiklikleri kaybolacak. Düzenlemeyi iptal etmek istiyor musunuz?", tone: "warning", confirmLabel: "Değişiklikleri at" }))
    )
      return;
    setManualFileEditing(false);
    setManualFileCreating(false);
  }
  async function closeWorkspaceFileExplorer() {
    if (
      hasUnsavedManualFileChanges() &&
      !(await confirmDialog({ title: "Dosya gezgini kapatılsın mı?", message: "Kaydedilmemiş manuel kod değişiklikleri kaybolacak. Dosya gezginini kapatmak istiyor musunuz?", tone: "warning", confirmLabel: "Kaydetmeden kapat" }))
    )
      return;
    updateWorkspaceRoute();
    setFileWorkspace(null);
    setFileListing(null);
    setFileContent(null);
    setManualFileEditing(false);
    setManualFileCreating(false);
  }
  function handleWorkspaceExplorerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeWorkspaceFileExplorer();
    }
  }
  useEffect(() => {
    if (!fileWorkspace) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      if (!manualFileEditing) workspaceExplorerCloseRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [fileWorkspace, manualFileEditing]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const projectId = url.searchParams.get("studioProject") || "";
    const requestId = url.searchParams.get("studioWorkspace") || "";
    if (!projectId || !requestId || !token || projects.length === 0) return;
    const restoreKey = `${projectId}:${requestId}`;
    if (workspaceRestoreRef.current === restoreKey) return;
    workspaceRestoreRef.current = restoreKey;
    const project = projects.find(
      (item) => item.id.toLowerCase() === projectId.toLowerCase(),
    );
    if (!project) {
      updateWorkspaceRoute();
      return;
    }
    const directoryPath = (url.searchParams.get("studioPath") || "").slice(
      0,
      500,
    );
    const openFilePath = (url.searchParams.get("studioFile") || "").slice(
      0,
      500,
    );
    setWorkspaceProject(project);
    setFileLoading(true);
    setError("");
    void api<WorkspaceRequest[]>(
      `/studio/projects/${project.id}/workspace-requests`,
      token,
    )
      .then(async (requests) => {
        const request = requests.find(
          (item) => item.id.toLowerCase() === requestId.toLowerCase(),
        );
        if (!request)
          throw new Error("Bu çalışma alanı artık erişilebilir değil.");
        setWorkspaceRequests(requests);
        setFileWorkspace(request);
        const query = `path=${encodeURIComponent(directoryPath)}&offset=0`;
        const knowledgePath = `/studio/projects/${project.id}/workspace-requests/${request.id}/knowledge`;
        const [listing, knowledge, history, file] = await Promise.all([
          api<WorkspaceFileListing>(
            `/studio/projects/${project.id}/workspace-requests/${request.id}/files?${query}`,
            token,
          ),
          api<{
            documents: StudioKnowledgeDocument[];
            autoRefresh: StudioKnowledgeAutoRefresh;
          }>(knowledgePath, token),
          project.accessLevel === "Viewer"
            ? Promise.resolve({ items: [] as ApprovedHistoryCandidate[] })
            : api<{ items: ApprovedHistoryCandidate[] }>(
                `${knowledgePath}/approved-history`,
                token,
              ),
          openFilePath
            ? api<WorkspaceFileContent>(
                `/studio/projects/${project.id}/workspace-requests/${request.id}/file-content?path=${encodeURIComponent(openFilePath)}`,
                token,
              )
            : Promise.resolve(null),
        ]);
        setFileListing(listing);
        setFilePath(directoryPath);
        setKnowledgeDocs(knowledge.documents);
        setKnowledgeAutoRefresh(knowledge.autoRefresh);
        setKnowledgeHistoryCandidates(history.items);
        setFileContent(file);
        setManualFileEditing(false);
        setManualFileCreating(false);
      })
      .catch((error) => setError((error as Error).message))
      .finally(() => setFileLoading(false));
  }, [projects, token]);

  async function loadWorkspaceAnalysis(request: WorkspaceRequest) {
    if (!workspaceProject) return;
    setAnalysisLoading(true);
    setError("");
    setWorkspaceAnalysis(null);
    setAnalysisWorkspace(request);
    try {
      setWorkspaceAnalysis(
        await api<WorkspaceAnalysis>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/analysis`,
          token,
        ),
      );
      setAnalysisCompletedAt(new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalysisLoading(false);
    }
  }
  async function searchWorkspaceSource(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !sourceSearchWorkspace ||
      !sourceSearchQuery.trim()
    )
      return;
    setSourceSearchLoading(true);
    setError("");
    setSelectedSourceMatches([]);
    setSourceAnalysisResult(null);
    setSourceAnalysisConsent(false);
    try {
      setSourceSearchResult(
        await api<WorkspaceSearchResult>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${sourceSearchWorkspace.id}/search?query=${encodeURIComponent(sourceSearchQuery.trim())}`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSourceSearchLoading(false);
    }
  }
  async function analyzeSelectedSource(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !sourceSearchWorkspace ||
      !sourceSearchResult ||
      !sourceAnalysisConsent ||
      !sourceAnalysisQuestion.trim()
    )
      return;
    const sources = sourceSearchResult.matches.filter((match, index) =>
      selectedSourceMatches.includes(`${match.path}:${match.line}:${index}`),
    );
    if (!sources.length) return;
    setSourceAnalysisLoading(true);
    setError("");
    setSourceAnalysisResult(null);
    try {
      setSourceAnalysisResult(
        await api<SourceAnalysisResult>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${sourceSearchWorkspace.id}/source-analysis`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              question: sourceAnalysisQuestion.trim(),
              sources,
              aiSharingConfirmed: sourceAnalysisConsent,
            }),
          },
        ),
      );
      setSourceAnalysisConsent(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSourceAnalysisLoading(false);
    }
  }
  async function discoverWorkspaceTests(request: WorkspaceRequest) {
    if (!workspaceProject) return;
    setTestDiscoveryLoading(true);
    setError("");
    setTestExecution(null);
    setTestExecutionTarget("");
    setTestDiscovery(null);
    setTestPlan(null);
    setTestAIConsent(false);
    setTestRequest("");
    setTestPlanSavedId(null);
    setTestDiscoveryWorkspace(request);
    try {
      const [discovery, plans] = await Promise.all([
        api<WorkspaceTestDiscovery>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/test-discovery`,
          token,
        ),
        api<SavedAITestPlan[]>(
          `/studio/projects/${workspaceProject.id}/test-plans?workspaceRequestId=${request.id}`,
          token,
        ),
      ]);
      setTestDiscovery(discovery);
      setSavedTestPlans(plans);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestDiscoveryLoading(false);
    }
  }
  async function runWorkspaceTest(
    target: WorkspaceTestDiscovery["targets"][number],
  ) {
    if (!workspaceProject || !testDiscoveryWorkspace || testExecutionLoading)
      return;
    const isNode = target.ecosystem === "Node.js";
    const isPython = target.ecosystem === "Python";
    const isGo = target.ecosystem === "Go";
    const isRust = target.ecosystem === "Rust";
    const executionLabel = isNode
      ? "Node.js yerleşik testleri"
      : isPython
        ? "Python pytest testleri"
        : isGo
          ? "Go testleri"
          : isRust
            ? "Rust testleri"
            : ".NET testleri";
    const limitation = isNode
      ? "node --test çalışır; npm scriptleri çağrılmaz ve paket bağımlılıkları kurulmaz."
      : isPython
        ? "Yalnız imajdaki pytest kullanılır; proje bağımlılıkları kurulmaz."
        : isGo
          ? "Yalnız Go standart kütüphanesi kullanılır; go.mod bağımlılıkları kurulmaz."
          : isRust
            ? "Yalnız bağımsız Cargo paketleri çalışır; crate bağımlılıkları ve Cargo workspace desteği yoktur."
            : "dotnet restore yalnız sandbox paket önbelleğini kullanır.";
    if (
      !(await confirmDialog({ title: "Test sandbox'ta çalıştırılsın mı?", message: `“${target.path}”${executionLabel} ağsız ve kaynak sınırları uygulanmış sandbox içinde çalıştırılacak. ${limitation} Devam edilsin mi?`, tone: "default", confirmLabel: "Testi çalıştır" }))
    )
      return;
    setTestExecutionLoading(true);
    setTestExecutionTarget(target.path);
    setError("");
    setTestExecution(null);
    try {
      const created = await api<{
        jobId: string;
        targetPath: string;
        commitSha: string;
        snapshotSha256: string;
        hasUncommittedChanges: boolean;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${testDiscoveryWorkspace.id}/test-runs`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            targetPath: target.path,
            executionConfirmed: true,
          }),
        },
      );
      let status: WorkspaceTestRunStatus = {
        jobId: created.jobId,
        targetPath: target.path,
        commitSha: created.commitSha,
        snapshotSha256: created.snapshotSha256,
        hasUncommittedChanges: created.hasUncommittedChanges,
        status: "Queued",
        message: "Sandbox işi bekliyor.",
        success: null,
        exitCode: null,
        durationMilliseconds: 0,
        output: "",
        completedAt: null,
      };
      setTestExecution(status);
      for (let i = 0; i < 900; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await api<WorkspaceTestRunStatus>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${testDiscoveryWorkspace.id}/test-runs/${created.jobId}`,
          token,
        );
        setTestExecution(status);
        if (
          [
            "Passed",
            "Failed",
            "TimedOut",
            "QueueExpired",
            "DependencyUnavailable",
            "Rejected",
            "SandboxError",
          ].includes(status.status)
        )
          break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestExecutionLoading(false);
    }
  }
  async function runWorkspaceBuild(
    target: WorkspaceTestDiscovery["targets"][number],
  ) {
    if (!workspaceProject || !testDiscoveryWorkspace || buildExecutionLoading)
      return;
    const buildCommand =
      target.ecosystem === ".NET"
        ? "dotnet build --no-restore"
        : target.ecosystem === "Node.js"
          ? "node --check (JavaScript files; no execution)"
          : target.ecosystem === "Python"
            ? "python3 -m py_compile (selected file)"
            : target.ecosystem === "Go"
              ? "go build -mod=readonly ./... (offline)"
              : target.ecosystem === "Rust"
                ? "cargo build --offline"
                : "fixed sandbox build";
    const limitation =
      target.ecosystem === ".NET"
        ? "Paketler yalnız onaylı çevrimdışı önbellekten geri yüklenebilir."
        : target.ecosystem === "Go"
          ? "Yalnız standart kütüphane modülleri desteklenir."
          : target.ecosystem === "Rust"
            ? "Yalnız bağımsız, harici bağımlılığı olmayan Cargo paketleri desteklenir."
            : "Paket yüklenmez ve proje komut dosyaları çalıştırılmaz.";
    if (
      !(await confirmDialog({ title: "Build sandbox'ta çalıştırılsın mı?", message: `“${target.path}” ${buildCommand} ile ağsız ve kaynak sınırları uygulanmış sandbox içinde işlenecek. ${limitation} Devam edilsin mi?`, tone: "default", confirmLabel: "Build'i çalıştır" }))
    )
      return;
    setBuildExecutionLoading(true);
    setBuildExecutionTarget(target.path);
    setBuildExecutionWorkspaceId(testDiscoveryWorkspace.id);
    setError("");
    setBuildExecution(null);
    try {
      const created = await api<{
        jobId: string;
        commitSha: string;
        snapshotSha256: string;
        hasUncommittedChanges: boolean;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${testDiscoveryWorkspace.id}/build-runs`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            targetPath: target.path,
            executionConfirmed: true,
          }),
        },
      );
      let status: WorkspaceTestRunStatus = {
        jobId: created.jobId,
        targetPath: target.path,
        commitSha: created.commitSha,
        snapshotSha256: created.snapshotSha256,
        hasUncommittedChanges: created.hasUncommittedChanges,
        status: "Queued",
        message: "Sandbox build işi bekliyor.",
        success: null,
        exitCode: null,
        durationMilliseconds: 0,
        output: "",
        completedAt: null,
      };
      setBuildExecution(status);
      for (let i = 0; i < 900; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await api<WorkspaceTestRunStatus>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${testDiscoveryWorkspace.id}/build-runs/${created.jobId}`,
          token,
        );
        setBuildExecution(status);
        if (
          [
            "Built",
            "BuildFailed",
            "TimedOut",
            "QueueExpired",
            "DependencyUnavailable",
            "Rejected",
            "SandboxError",
          ].includes(status.status)
        )
          break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuildExecutionLoading(false);
    }
  }
  async function pollWorkspaceBuildRun() {
    if (
      !workspaceProject ||
      !buildExecutionWorkspaceId ||
      !buildExecution ||
      buildExecutionLoading
    )
      return;
    setBuildExecutionLoading(true);
    setError("");
    try {
      let status = buildExecution;
      for (let i = 0; i < 900; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await api<WorkspaceTestRunStatus>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${buildExecutionWorkspaceId}/build-runs/${buildExecution.jobId}`,
          token,
        );
        setBuildExecution(status);
        if (
          [
            "Built",
            "BuildFailed",
            "TimedOut",
            "QueueExpired",
            "DependencyUnavailable",
            "Rejected",
            "SandboxError",
          ].includes(status.status)
        )
          break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuildExecutionLoading(false);
    }
  }
  async function pollWorkspaceTestRun() {
    if (
      !workspaceProject ||
      !testDiscoveryWorkspace ||
      !testExecution ||
      testExecutionLoading
    )
      return;
    setTestExecutionLoading(true);
    setError("");
    try {
      let status = testExecution;
      for (let i = 0; i < 900; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await api<WorkspaceTestRunStatus>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${testDiscoveryWorkspace.id}/test-runs/${testExecution.jobId}`,
          token,
        );
        setTestExecution(status);
        if (
          [
            "Passed",
            "Failed",
            "TimedOut",
            "QueueExpired",
            "DependencyUnavailable",
            "Rejected",
            "SandboxError",
          ].includes(status.status)
        )
          break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestExecutionLoading(false);
    }
  }
  async function analyzeSandboxFailure(
    operation: "test" | "build",
    workspaceRequestId: string,
    job: WorkspaceTestRunStatus,
  ) {
    if (!workspaceProject || sandboxErrorAnalysisLoading) return;
    if (
      !(await confirmDialog({ title: "Hata analizi için çıktı gönderilsin mi?", message: "Sandbox durum ve çıktısının hassas değerleri maskelenerek hata analizi için OpenAI’ye gönderilmesini onaylıyor musunuz? Ham çıktı veritabanında saklanmaz.", tone: "warning", confirmLabel: "Analiz için gönder" }))
    )
      return;
    setSandboxErrorAnalysisLoading(true);
    setError("");
    setSandboxErrorAnalysis(null);
    try {
      setSandboxErrorAnalysis(
        await api<SandboxErrorAnalysisResponse>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${workspaceRequestId}/sandbox-error-analysis/${job.jobId}`,
          token,
          {
            method: "POST",
            body: JSON.stringify({ operation, aiSharingConfirmed: true }),
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSandboxErrorAnalysisLoading(false);
    }
  }
  function beginSandboxRepair() {
    if (
      !testDiscoveryWorkspace ||
      !sandboxErrorAnalysis?.triage.sourceRepairCandidate
    )
      return;
    setRepairMode({
      operation: sandboxErrorAnalysis.operation,
      targetPath: sandboxErrorAnalysis.targetPath,
    });
    setRepairPathsDraft("");
    setMultiFilePaths([]);
    setMultiDeveloperWorkspace(testDiscoveryWorkspace);
    setMultiFileRequest(
      [
        `Repair the ${sandboxErrorAnalysis.operation} failure for ${sandboxErrorAnalysis.targetPath} at commit ${sandboxErrorAnalysis.commitSha}.`,
        sandboxErrorAnalysis.analysis.summary,
        `Likely cause: ${sandboxErrorAnalysis.analysis.likelyCause}`,
        "Recommended actions:",
        ...sandboxErrorAnalysis.analysis.recommendedActions.map(
          (action, index) => `${index + 1}. ${action}`,
        ),
      ]
        .join("\n")
        .slice(0, 2000),
    );
    setMultiFileConsent(false);
    setMultiFileSuggestion(null);
    setMultiFileApplied([]);
    setError("");
  }
  async function rerunAfterSandboxRepair() {
    if (
      !repairMode ||
      !multiFileSuggestion ||
      multiFileApplied.length !== multiFileSuggestion.changes.length ||
      (workspaceProject?.accessLevel !== "TenantAdmin" &&
        workspaceProject?.accessLevel !== "Maintainer")
    )
      return;
    const target = testDiscovery?.targets.find(
      (item) => item.path === repairMode.targetPath,
    );
    if (!target) {
      setError(
        "Onarım test hedefi artık keşif sonuçlarında bulunmuyor. Test merkezinden hedefi yeniden keşfedin.",
      );
      return;
    }
    const operation = repairMode.operation;
    setMultiDeveloperWorkspace(null);
    setSandboxErrorAnalysis(null);
    setRepairMode(null);
    if (operation === "test") void runWorkspaceTest(target);
    else void runWorkspaceBuild(target);
  }
  async function createAITestPlan(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !testDiscoveryWorkspace ||
      !testAIConsent ||
      !testRequest.trim()
    )
      return;
    setTestPlanLoading(true);
    setError("");
    setTestPlan(null);
    setTestPlanSavedId(null);
    try {
      setTestPlan(
        await api<AITestPlan>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${testDiscoveryWorkspace.id}/test-plan`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              request: testRequest,
              aiSharingConfirmed: testAIConsent,
            }),
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestPlanLoading(false);
    }
  }
  async function saveAITestPlan() {
    if (!workspaceProject || !testDiscoveryWorkspace || !testPlan) return;
    setTestPlanSaveLoading(true);
    setError("");
    try {
      const saved = await api<SavedAITestPlan>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${testDiscoveryWorkspace.id}/test-plans`,
        token,
        { method: "POST", body: JSON.stringify({ plan: testPlan }) },
      );
      setTestPlanSavedId(saved.id);
      setSavedTestPlans((current) =>
        [saved, ...current.filter((x) => x.id !== saved.id)].slice(0, 50),
      );
      setNotice(
        "AI Test Asistanı senaryo taslağı proje geçmişine kaydedildi; özgün talep metni saklanmadı.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestPlanSaveLoading(false);
    }
  }
  async function openSavedAITestPlan(saved: SavedAITestPlan) {
    if (!workspaceProject) return;
    setTestPlanLoading(true);
    setError("");
    try {
      const detail = await api<SavedAITestPlanDetail>(
        `/studio/projects/${workspaceProject.id}/test-plans/${saved.id}`,
        token,
      );
      setTestPlan(detail.plan);
      setTestPlanSavedId(saved.id);
      setTestRequest("");
      setTestAIConsent(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestPlanLoading(false);
    }
  }
  async function deleteSavedAITestPlan(saved: SavedAITestPlan) {
    if (!workspaceProject || !saved.canDelete) return;
    if (
      !(await confirmDialog({ title: "Test planı silinsin mi?", message: `“${saved.summary}” test planını kalıcı olarak silmek istiyor musunuz?`, tone: "danger", confirmLabel: "Planı sil" }))
    )
      return;
    setError("");
    try {
      await api<void>(
        `/studio/projects/${workspaceProject.id}/test-plans/${saved.id}`,
        token,
        { method: "DELETE", body: JSON.stringify({ confirm: true }) },
      );
      setSavedTestPlans((current) => current.filter((x) => x.id !== saved.id));
      if (testPlanSavedId === saved.id) {
        setTestPlanSavedId(null);
        setTestPlan(null);
      }
      setNotice("Test planı silindi; silme olayı denetim kaydına eklendi.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function startCodeSuggestion() {
    if (!fileWorkspace || !fileContent) return;
    setDeveloperWorkspace(fileWorkspace);
    setDeveloperFile(fileContent);
    setDeveloperIsNewFile(false);
    setDeveloperNewPath("");
    setDeveloperRequest(
      linkedDevelopmentContext(
        fileWorkspace.developmentRequestTitle,
        fileWorkspace.developmentRequestDescription,
      ),
    );
    setDeveloperConsent(false);
    setDeveloperSuggestion(null);
    setDeveloperApplyApproval(false);
    setDeveloperApplied(false);
    setError("");
  }
  function startNewCodeSuggestion(request: WorkspaceRequest) {
    if (!workspaceProject) return;
    const moduleRoot = moduleCodeForWorkspace(request)
      ? `modules/${moduleCodeForWorkspace(request)}`
      : "";
    const modulePathIsOpen = Boolean(
      moduleRoot &&
        (filePath === moduleRoot || filePath.startsWith(`${moduleRoot}/`)),
    );
    const suggestedPath = moduleRoot
      ? modulePathIsOpen
        ? `${filePath}/NewFile.rs`
        : `${moduleRoot}/src/lib.rs`
      : filePath
        ? `${filePath}/NewComponent.tsx`
        : "NewComponent.tsx";
    setDeveloperWorkspace(request);
    setDeveloperFile({
      path: suggestedPath,
      content: "",
      sizeBytes: 0,
      sha256: "",
    });
    setDeveloperIsNewFile(true);
    setDeveloperNewPath(suggestedPath);
    setDeveloperRequest(
      linkedDevelopmentContext(
        request.developmentRequestTitle,
        request.developmentRequestDescription,
      ),
    );
    setDeveloperConsent(false);
    setDeveloperSuggestion(null);
    setDeveloperApplyApproval(false);
    setDeveloperApplied(false);
    setFileContent(null);
    setError("");
  }
  function startUiDesigner(request: WorkspaceRequest) {
    if (!workspaceProject || workspaceProject.accessLevel === "Viewer") return;
    const suggestedPath = filePath
      ? `${filePath}/DesignedScreen.tsx`
      : "src/screens/DesignedScreen.tsx";
    setUiDesignerWorkspace(request);
    setUiDesignRequest(
      linkedDevelopmentContext(
        request.developmentRequestTitle,
        request.developmentRequestDescription,
      ),
    );
    setUiDesignPath(suggestedPath);
    setUiDesignConsent(false);
    setUiDesignResult(null);
    setUiDesignApplyApproval(false);
    setUiDesignApplied(false);
    setError("");
  }
  async function createUiDesign(e: FormEvent) {
    e.preventDefault();
    if (!workspaceProject || !uiDesignerWorkspace || !uiDesignConsent) return;
    setUiDesignLoading(true);
    setError("");
    setUiDesignResult(null);
    setUiDesignApplyApproval(false);
    setUiDesignApplied(false);
    try {
      setUiDesignResult(
        await api<UiDesignPreview>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${uiDesignerWorkspace.id}/ui-design`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              request: uiDesignRequest,
              targetFilePath: uiDesignPath,
              aiSharingConfirmed: true,
            }),
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUiDesignLoading(false);
    }
  }
  async function applyUiDesign() {
    if (
      !workspaceProject ||
      !uiDesignerWorkspace ||
      !uiDesignResult ||
      !uiDesignApplyApproval ||
      uiDesignApplied
    )
      return;
    if (
      !(await confirmDialog({ title: "Ekran taslağı çalışma alanına yazılsın mı?", message: `${uiDesignResult.filePath} ekran taslağı önizlemeden üretildi ve yalnızca yeni dosya olarak izole çalışma alanına yazılacak. Kod çalıştırılmayacak. Onaylıyor musunuz?`, tone: "default", confirmLabel: "Dosyayı yaz" }))
    )
      return;
    setUiDesignLoading(true);
    setError("");
    try {
      const applied = await api<AppliedCodeSuggestion>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${uiDesignerWorkspace.id}/apply-code-suggestion`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            filePath: uiDesignResult.filePath,
            expectedSha256: uiDesignResult.sourceSha256,
            proposedContent: uiDesignResult.proposedContent,
            approvalConfirmed: true,
            createNewFile: true,
          }),
        },
      );
      setUiDesignApplied(true);
      setUiDesignApplyApproval(false);
      setFileContent({
        path: applied.filePath,
        content: uiDesignResult.proposedContent,
        sizeBytes: new TextEncoder().encode(uiDesignResult.proposedContent)
          .length,
        sha256: applied.sha256,
      });
      setNotice(
        "AI UI Designer ekranını onayınızla yeni dosya olarak çalışma alanına ekledi. Kod çalıştırılmadı.",
      );
      if (fileWorkspace?.id === uiDesignerWorkspace.id) {
        const parentPath = uiDesignResult.filePath
          .split("/")
          .slice(0, -1)
          .join("/");
        const query = `path=${encodeURIComponent(parentPath)}&offset=0`;
        setFilePath(parentPath);
        setFileListing(
          await api<WorkspaceFileListing>(
            `/studio/projects/${workspaceProject.id}/workspace-requests/${uiDesignerWorkspace.id}/files?${query}`,
            token,
          ),
        );
      }
      if (changeWorkspace?.id === uiDesignerWorkspace.id)
        await loadWorkspaceChanges(uiDesignerWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUiDesignLoading(false);
    }
  }
  async function createCodeSuggestion(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !developerWorkspace ||
      !developerFile ||
      !developerConsent
    )
      return;
    const targetPath = developerIsNewFile
      ? developerNewPath
      : developerFile.path;
    setDeveloperLoading(true);
    setError("");
    setDeveloperSuggestion(null);
    setDeveloperApplyApproval(false);
    setDeveloperApplied(false);
    try {
      setDeveloperSuggestion(
        await api<CodeSuggestionPreview>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${developerWorkspace.id}/code-suggestion`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              request: developerRequest,
              filePath: targetPath,
              sourceSharingConfirmed: developerConsent,
              createNewFile: developerIsNewFile,
            }),
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeveloperLoading(false);
    }
  }
  function startMultiFileSuggestion(request: WorkspaceRequest) {
    if (
      !workspaceProject ||
      multiFilePaths.length < 2 ||
      multiFilePaths.length > 5
    )
      return;
    setMultiDeveloperWorkspace(request);
    setMultiFileRequest(
      linkedDevelopmentContext(
        request.developmentRequestTitle,
        request.developmentRequestDescription,
      ),
    );
    setMultiFileConsent(false);
    setMultiFileSuggestion(null);
    setMultiFileApplied([]);
    setMultiFileSelecting(false);
    setFileWorkspace(null);
    setError("");
  }
  async function createMultiFileSuggestion(e: FormEvent) {
    e.preventDefault();
    if (!workspaceProject || !multiDeveloperWorkspace || !multiFileConsent)
      return;
    const paths = repairMode
      ? repairPathsDraft
          .split(/\r?\n|,/)
          .map((path) => path.trim())
          .filter(Boolean)
      : multiFilePaths;
    if (
      paths.length < (repairMode ? 1 : 2) ||
      paths.length > 5 ||
      new Set(paths).size !== paths.length
    ) {
      setError(
        repairMode
          ? "1–5 farklı kaynak dosya yolu girin."
          : "2–5 farklı kaynak dosya seçin.",
      );
      return;
    }
    setMultiFilePaths(paths);
    setMultiFileLoading(true);
    setError("");
    setMultiFileSuggestion(null);
    setMultiFileApplied([]);
    try {
      if (paths.length === 1) {
        const result = await api<CodeSuggestionPreview>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${multiDeveloperWorkspace.id}/code-suggestion`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              request: multiFileRequest,
              filePath: paths[0],
              sourceSharingConfirmed: multiFileConsent,
            }),
          },
        );
        setMultiFileSuggestion({
          summary: result.summary,
          changes: [
            {
              filePath: result.filePath,
              sourceSha256: result.sourceSha256,
              originalContent: result.originalContent,
              proposedContent: result.proposedContent,
              notes: result.notes,
            },
          ],
          risks: [],
        });
      } else {
        setMultiFileSuggestion(
          await api<MultiFileCodeSuggestionPreview>(
            `/studio/projects/${workspaceProject.id}/workspace-requests/${multiDeveloperWorkspace.id}/multi-file-code-suggestion`,
            token,
            {
              method: "POST",
              body: JSON.stringify({
                request: multiFileRequest,
                filePaths: paths,
                sourceSharingConfirmed: multiFileConsent,
              }),
            },
          ),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMultiFileLoading(false);
    }
  }
  async function applyMultiFileSuggestion(
    change: MultiFileCodeSuggestionPreview["changes"][number],
  ) {
    if (
      !workspaceProject ||
      !multiDeveloperWorkspace ||
      multiFileApplied.includes(change.filePath) ||
      !(await confirmDialog({ title: "Bu dosyadaki değişiklik uygulansın mı?", message: `Yalnız ${change.filePath} dosyasındaki değişiklik açık onayla izole çalışma alanına uygulansın mı? Kod çalıştırılmaz.`, tone: "default", confirmLabel: "Değişikliği uygula" }))
    )
      return;
    setMultiFileLoading(true);
    setError("");
    try {
      await api<AppliedCodeSuggestion>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${multiDeveloperWorkspace.id}/apply-code-suggestion`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            filePath: change.filePath,
            expectedSha256: change.sourceSha256,
            proposedContent: change.proposedContent,
            approvalConfirmed: true,
          }),
        },
      );
      setMultiFileApplied((current) => [...current, change.filePath]);
      setNotice(
        `${change.filePath} için onaylı öneri uygulandı. Diğer dosyalar ayrıca onaylanmalı.`,
      );
      if (changeWorkspace?.id === multiDeveloperWorkspace.id)
        await loadWorkspaceChanges(multiDeveloperWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMultiFileLoading(false);
    }
  }
  async function applyCodeSuggestion() {
    if (
      !workspaceProject ||
      !developerWorkspace ||
      !developerSuggestion ||
      !developerApplyApproval ||
      developerApplied
    )
      return;
    setDeveloperLoading(true);
    setError("");
    try {
      const applied = await api<AppliedCodeSuggestion>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${developerWorkspace.id}/apply-code-suggestion`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            filePath: developerSuggestion.filePath,
            expectedSha256: developerSuggestion.sourceSha256,
            proposedContent: developerSuggestion.proposedContent,
            approvalConfirmed: developerApplyApproval,
            createNewFile: developerSuggestion.createNewFile,
          }),
        },
      );
      setDeveloperApplied(true);
      setDeveloperApplyApproval(false);
      setFileContent((current) =>
        developerSuggestion.createNewFile
          ? {
              path: applied.filePath,
              content: developerSuggestion.proposedContent,
              sizeBytes: new TextEncoder().encode(
                developerSuggestion.proposedContent,
              ).length,
              sha256: applied.sha256,
            }
          : current && current.path === applied.filePath
            ? {
                ...current,
                content: developerSuggestion.proposedContent,
                sizeBytes: new TextEncoder().encode(
                  developerSuggestion.proposedContent,
                ).length,
                sha256: applied.sha256,
              }
            : current,
      );
      setNotice(
        "AI önerisi açık onayınızla izole çalışma alanına uygulandı. Kod çalıştırılmadı.",
      );
      if (
        developerSuggestion.createNewFile &&
        fileWorkspace?.id === developerWorkspace.id
      ) {
        const query = `path=${encodeURIComponent(filePath)}&offset=0`;
        setFileListing(
          await api<WorkspaceFileListing>(
            `/studio/projects/${workspaceProject.id}/workspace-requests/${developerWorkspace.id}/files?${query}`,
            token,
          ),
        );
      }
      if (changeWorkspace?.id === developerWorkspace.id)
        await loadWorkspaceChanges(developerWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeveloperLoading(false);
    }
  }

  async function loadWorkspaceChanges(request: WorkspaceRequest) {
    if (!workspaceProject) return;
    setChangeLoading(true);
    setError("");
    setChangeWorkspace(request);
    setWorkspaceChanges(null);
    setChangeDiff(null);
    setRestoreApproval(false);
    try {
      setWorkspaceChanges(
        await api<WorkspaceChanges>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            request.id +
            "/changes",
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangeLoading(false);
    }
  }
  async function commitApprovedWorkspaceChanges() {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !workspaceGitStatus ||
      workspaceCommitLoading
    )
      return;
    if (
      workspaceGitStatus.truncated ||
      workspaceGitStatus.totalChangedFiles !== workspaceGitStatus.files.length
    ) {
      setError(
        "Git değişiklik listesi eksik; commit için önce durumu yenileyin.",
      );
      return;
    }
    setWorkspaceCommitLoading(true);
    setError("");
    let committedResult: WorkspaceCommitResult | null = null;
    try {
      const changes = await api<WorkspaceChanges>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/changes`,
        token,
      );
      if (changes.truncated) {
        setError("Studio değişiklik geçmişi kesilmiş; commit durduruldu.");
        return;
      }
      const current = [...changes.changes]
        .filter((x) => x.isCurrent && !x.isRestored)
        .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
      const latestByPath = new Map<string, WorkspaceChange>();
      for (const change of current)
        if (!latestByPath.has(change.path))
          latestByPath.set(change.path, change);
      const paths = workspaceGitStatus.files.map((x) => x.path).sort();
      if (paths.length === 0 || paths.some((path) => !latestByPath.has(path))) {
        setError(
          "Çalışma ağacındaki bütün dosyalar güncel Studio onay kayıtlarıyla eşleşmiyor; commit durduruldu.",
        );
        return;
      }
      const message = (await promptDialog({ title: "Commit mesajı", label: "Tek satırlık commit mesajı", defaultValue: "Apply approved Studio changes", required: true, hint: "8–160 karakter, tek satır.", confirmLabel: "Devam", tone: "default" }));
      if (message === null) return;
      if (
        !message.trim() ||
        message.trim().length < 8 ||
        message.trim().length > 160 ||
        /[\r\n\t]/.test(message)
      ) {
        setError("Commit mesajı tek satır ve 8–160 karakter olmalıdır.");
        return;
      }
      if (
        !(await confirmDialog({ title: "Onaylı değişiklikler commit edilsin mi?", message: `Yalnızca şu onaylı dosyalar ${workspaceGitStatus.branchName} dalına commit edilecek. Commit tamamlanınca değişikliklerle eşleşen test hedefi otomatik seçilip yalıtılmış sandbox'ta çalıştırılacak. Uzak depoya push yapılmayacak.\n\n${paths.join("\n")}`, tone: "default", confirmLabel: "Commit et" }))
      )
        return;
      const result = await api<WorkspaceCommitResult>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/commit-approved-changes`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            changeIds: paths.map((path) => latestByPath.get(path)!.id),
            expectedHeadCommitSha: workspaceGitStatus.headCommitSha,
            message: message.trim(),
            approvalConfirmed: true,
          }),
        },
      );
      committedResult = result;
      setWorkspaceGitStatus((current) =>
        current
          ? {
              ...current,
              headCommitSha: result.commitSha,
              totalChangedFiles: 0,
              truncated: false,
              files: [],
            }
          : current,
      );
      setReleaseCandidates([]);
      setNotice(
        `Commit oluşturuldu: ${result.commitSha.slice(0, 12)}. İlgili test hedefleri bulunuyor…`,
      );

      const discovery = await api<WorkspaceTestDiscovery>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/test-discovery`,
        token,
      );
      const ignored = new Set(["src", "tests", "test", "frontend", "backend", "app", "csproj", "package", "json"]);
      const pathTokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2 && !ignored.has(part));
      const changedTokens = new Set(paths.flatMap(pathTokens));
      const matchingTargets = discovery.targets
        .filter((target) => target.canTest === true)
        .map((target) => {
          const targetTokens = new Set(pathTokens(target.path));
          const score = [...targetTokens].reduce((total, part) => total + (changedTokens.has(part) ? part.length : 0), 0);
          return { target, score };
        })
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => b.score - a.score || a.target.path.localeCompare(b.target.path));
      const target = matchingTargets[0]?.target;
      if (!target) {
        setTestDiscoveryWorkspace(gitStatusWorkspace);
        setTestDiscovery(discovery);
        setTestExecution(null);
        setNotice(
          `Commit oluşturuldu: ${result.commitSha.slice(0, 12)}. Değişen dosyalarla eşleşen otomatik çalıştırılabilir test bulunamadı; sürüm için test kanıtı oluşmadı.`,
        );
        return;
      }

      setTestDiscoveryWorkspace(gitStatusWorkspace);
      setTestDiscovery(discovery);
      setTestExecutionTarget(target.path);
      setTestExecution(null);
      setTestExecutionLoading(true);
      setNotice(`Commit tamamlandı. İlgili test otomatik çalıştırılıyor: ${target.path}`);
      const created = await api<{
        jobId: string;
        targetPath: string;
        commitSha: string;
        snapshotSha256: string;
        hasUncommittedChanges: boolean;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/test-runs`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ targetPath: target.path, executionConfirmed: true }),
        },
      );
      let testStatus: WorkspaceTestRunStatus = {
        jobId: created.jobId,
        targetPath: created.targetPath,
        commitSha: created.commitSha,
        snapshotSha256: created.snapshotSha256,
        hasUncommittedChanges: created.hasUncommittedChanges,
        status: "Queued",
        message: "Sandbox işi bekliyor.",
        success: null,
        exitCode: null,
        durationMilliseconds: 0,
        output: "",
        completedAt: null,
      };
      setTestExecution(testStatus);
      for (let i = 0; i < 900; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        testStatus = await api<WorkspaceTestRunStatus>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/test-runs/${created.jobId}`,
          token,
        );
        setTestExecution(testStatus);
        if (["Passed", "Failed", "TimedOut", "QueueExpired", "DependencyUnavailable", "Rejected", "SandboxError"].includes(testStatus.status)) break;
      }
      setNotice(
        testStatus.status === "Passed"
          ? `Commit ${result.commitSha.slice(0, 12)} tamamlandı. ${target.path} testi başarılı.`
          : `Commit ${result.commitSha.slice(0, 12)} oluşturuldu; ${target.path} testi ${testStatus.status} durumunda. Ayrıntılar "Test ve build" bölümünde.`,
      );
      await loadWorkspaceGitStatus(gitStatusWorkspace);
    } catch (e) {
      const message = (e as Error).message;
      if (committedResult) {
        setNotice(`Commit ${committedResult.commitSha.slice(0, 12)} oluşturuldu, ancak otomatik test başlatılamadı.`);
        setError(`Commit korundu. Otomatik test hatası: ${message}`);
      } else {
        setError(message);
      }
    } finally {
      setTestExecutionLoading(false);
      setWorkspaceCommitLoading(false);
    }
  }
  async function loadWorkspaceGitStatus(request: WorkspaceRequest, refreshGithub = false) {
    if (!workspaceProject) return;
    setGitStatusLoading(true);
    setError("");
    setGitStatusWorkspace(request);
    setWorkspaceGitStatus(null);
    setReleaseTestEvidence(null);
    setReleaseCandidates([]);
    setReleaseVersions([]);
    setReleasePackages([]);
    setReleaseDeployments([]);
    setProductionDeployments([]);
    setProductionApprovals([]);
    setStagingCredentials(null);
    try {
      const [
        status,
        candidates,
        versions,
        packages,
        deployments,
        promotions,
        productionHistory,
      ] = await Promise.all([
        api<WorkspaceGitStatus>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            request.id +
            "/git-status",
          token,
        ),
        api<ReleaseCandidate[]>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            request.id +
            "/release-candidates" + (refreshGithub ? "?refreshGithub=true" : ""),
          token,
        ),
        api<ReleaseVersion[]>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            request.id +
            "/release-versions",
          token,
        ),
        api<ReleasePackage[]>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            request.id +
            "/release-packages",
          token,
        ),
        api<ReleaseDeployment[]>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            request.id +
            "/release-deployments",
          token,
        ),
        api<ProductionApproval[]>(
          "/studio/projects/" + workspaceProject.id + "/production-approvals",
          token,
        ),
        api<ReleaseDeployment[]>(
          "/studio/projects/" + workspaceProject.id + "/production-deployments",
          token,
        ),
      ]);
      const evidence = await api<{ test: WorkspaceTestRunStatus | null }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/test-runs/latest-passed?commitSha=${encodeURIComponent(status.headCommitSha)}`,
        token,
      );
      setWorkspaceGitStatus(status);
      setReleaseTestEvidence(evidence.test);
      setReleaseCandidates(candidates);
      setReleaseVersions(versions);
      setReleasePackages(packages);
      setReleaseDeployments(deployments);
      setProductionApprovals(promotions);
      setProductionDeployments(productionHistory);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGitStatusLoading(false);
    }
  }
  async function createReleaseCandidate() {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !workspaceGitStatus ||
      !releaseTestEvidence ||
      releaseCandidateSaving
    )
      return;
    setReleaseCandidateSaving(true);
    setError("");
    try {
      const created = await api<ReleaseCandidate>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ testJobId: releaseTestEvidence.jobId }),
        },
      );
      setReleaseCandidates((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      setNotice(
        "Sürüm adayı kaydedildi. Paket üretilmedi ve dağıtım başlatılmadı.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleaseCandidateSaving(false);
    }
  }
  async function createPullRequestDraft(candidate: ReleaseCandidate) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      candidate.decision !== "Approved" ||
      pullRequestDraftLoading
    )
      return;
    const summary = (await promptDialog({ title: "PR taslağı için değişiklik özeti", label: "Kısa özet", required: true, multiline: true, hint: "1–1500 karakter. Kaynak kod veya sır eklemeyin.", confirmLabel: "Devam", tone: "default" }));
    if (summary === null) return;
    if (!summary.trim()) {
      setError("Değişiklik özeti boş olamaz.");
      return;
    }
    if (
      !(await confirmDialog({ title: "PR taslağı için bilgiler gönderilsin mi?", message: `Bu özet ile proje/dal adı, commit kimliği ve başarılı sandbox test metadata'sı PR taslağı oluşturmak için OpenAI'ye gönderilecek. Kaynak kodu ve test çıktısı gönderilmez. Onaylıyor musunuz?`, tone: "warning", confirmLabel: "Taslak oluştur" }))
    )
      return;
    setPullRequestDraftLoading(true);
    setError("");
    setPullRequestDraft(null);
    try {
      const draft = await api<PullRequestDraft>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/pull-request-draft`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            changeSummary: summary.trim(),
            aiSharingConfirmed: true,
          }),
        },
      );
      setPullRequestDraft({ candidateId: candidate.id, draft });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPullRequestDraftLoading(false);
    }
  }
  async function publishPullRequest(candidate: ReleaseCandidate) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !pullRequestDraft ||
      pullRequestDraft.candidateId !== candidate.id ||
      candidate.decision !== "Approved" ||
      pullRequestPublishLoading
    )
      return;
    const draft = pullRequestDraft.draft;
    if (
      !(await confirmDialog({ title: "Dal push edilip draft PR açılsın mı?", message: `GitHub'a yalnız ${draft.commitSha.slice(0, 12)} commit'ini içeren ${draft.sourceBranch} dalı push edilecek ve ${draft.baseBranch} tabanına draft PR oluşturulacak. Mevcut remote dal farklıysa üzerine yazılmaz. Onaylıyor musunuz?`, tone: "warning", confirmLabel: "Push et ve PR aç" }))
    )
      return;
    setPullRequestPublishLoading(true);
    setError("");
    setPublishedPullRequest(null);
    try {
      const result = await api<PublishedPullRequest>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/publish-pull-request`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            githubInstallationId: 0,
            title: draft.title,
            body: draft.body,
            confirmation: true,
          }),
        },
      );
      setPublishedPullRequest(result);
      setReleaseCandidates(
        await api<ReleaseCandidate[]>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates`,
          token,
        ),
      );
      setNotice(
        result.created
          ? "Draft pull request GitHub’da oluşturuldu."
          : "Aynı dal ve taban için açık PR bulundu; mevcut PR açıldı.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPullRequestPublishLoading(false);
    }
  }
  async function submitGitHubReview(
    candidate: ReleaseCandidate,
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
  ) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !candidate.githubPullRequestNumber
    )
      return;
    const labels = {
      COMMENT: "Yorum",
      APPROVE: "Onay",
      REQUEST_CHANGES: "Değişiklik isteği",
    };
    const body = (await promptDialog({ title: `${labels[event]}`, label: "Açıklama", required: true, multiline: true, hint: "1–4000 karakter.", confirmLabel: "Devam", tone: "default" }));
    if (body === null) return;
    if (!body.trim()) {
      setError("GitHub inceleme açıklaması boş olamaz.");
      return;
    }
    if (
      !(await confirmDialog({ title: "İnceleme GitHub'da yayınlansın mı?", message: `Bu ${labels[event].toLocaleLowerCase("tr-TR")} yorumu GitHub PR #${candidate.githubPullRequestNumber} üzerinde yayınlanacak. Devam edilsin mi?`, tone: "warning", confirmLabel: "Yayınla" }))
    )
      return;
    setError("");
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/pull-request-review`,
        token,
        { method: "POST", body: JSON.stringify({ event, body: body.trim() }) },
      );
      setNotice(
        `GitHub PR #${candidate.githubPullRequestNumber} incelemesi gönderildi.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function requestGitHubReviewers(candidate: ReleaseCandidate) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !candidate.githubPullRequestNumber
    )
      return;
    const input = (await promptDialog({ title: "İnceleme talebi", label: "GitHub kullanıcı adları", required: true, hint: "Virgülle ayırın, en fazla 10 kişi.", confirmLabel: "Devam", tone: "default" }));
    if (input === null) return;
    const reviewers = input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (reviewers.length < 1 || reviewers.length > 10) {
      setError("1–10 GitHub kullanıcı adı girmelisiniz.");
      return;
    }
    if (
      !(await confirmDialog({ title: "İnceleme talebi gönderilsin mi?", message: `${reviewers.join(", ")} kullanıcılara PR #${candidate.githubPullRequestNumber} inceleme talebi gönderilecek. Devam edilsin mi?`, tone: "default", confirmLabel: "Talep gönder" }))
    )
      return;
    setError("");
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/request-reviewers`,
        token,
        { method: "POST", body: JSON.stringify({ reviewers }) },
      );
      setNotice("GitHub PR inceleme talebi gönderildi.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function markGitHubPullRequestReady(candidate: ReleaseCandidate) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !candidate.githubPullRequestNumber ||
      candidate.decision !== "Approved" ||
      candidate.githubPullRequestState !== "draft" ||
      pullRequestReadyLoading
    )
      return;
    if (
      !(await confirmDialog({ title: "Draft PR incelemeye açılsın mı?", message: `Yetkili Studio onayı alınmış ${candidate.commitSha.slice(0, 12)} commit’ine bağlı GitHub draft PR #${candidate.githubPullRequestNumber} incelemeye açılacak ve GitHub inceleme bildirimleri gönderilecek. Devam edilsin mi?`, tone: "warning", confirmLabel: "İncelemeye aç" }))
    )
      return;
    setPullRequestReadyLoading(candidate.id);
    setError("");
    try {
      const result = await api<{ state: string; htmlUrl: string }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/mark-pull-request-ready`,
        token,
        { method: "POST" },
      );
      setReleaseCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id
            ? { ...item, githubPullRequestState: result.state }
            : item,
        ),
      );
      setNotice(
        result.state === "merged"
          ? `GitHub PR #${candidate.githubPullRequestNumber} zaten birleştirilmiş; Studio durum kaydı güncellendi.`
          : `GitHub PR #${candidate.githubPullRequestNumber} incelemeye hazır; Studio onayı ve commit eşleşmesi doğrulandı.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPullRequestReadyLoading(null);
    }
  }
  async function syncGitHubReviewComments(candidate: ReleaseCandidate) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !candidate.githubPullRequestNumber
    )
      return;
    if (
      !(await confirmDialog({ title: "Dosya yorumları GitHub'a aktarılsın mı?", message: `Bu çalışma alanındaki ${candidate.commitSha.slice(0, 12)} commit’ine bağlı, henüz aktarılmamış dosya yorumları GitHub PR #${candidate.githubPullRequestNumber} üzerine yayınlanacak. Devam edilsin mi?`, tone: "warning", confirmLabel: "Yorumları aktar" }))
    )
      return;
    setError("");
    try {
      const result = await api<{ synced: number }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/sync-review-comments`,
        token,
        { method: "POST" },
      );
      setNotice(`${result.synced} yerel yorum GitHub’a aktarıldı.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importGitHubReviewComments(candidate: ReleaseCandidate) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !candidate.githubPullRequestNumber
    )
      return;
    if (
      !(await confirmDialog({ title: "GitHub yorumları içe alınsın mı?", message: `GitHub PR #${candidate.githubPullRequestNumber} üzerindeki dosya inceleme yorumları bu çalışma alanına salt okunur şekilde alınacak. Devam edilsin mi?`, tone: "default", confirmLabel: "Yorumları al" }))
    )
      return;
    setError("");
    try {
      const result = await api<{
        imported: number;
        skipped: number;
        truncated: boolean;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/sync-github-review-comments`,
        token,
        { method: "POST" },
      );
      setNotice(
        `${result.imported} GitHub yorumu içe aktarıldı${result.skipped ? `; ${result.skipped} konumu doğrulanamadığı için atlandı` : ""}${result.truncated ? " (ilk 500 yorum)" : ""}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function assignReleaseVersion(candidate: ReleaseCandidate) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      candidate.decision !== "Approved" ||
      releaseVersions.some((x) => x.releaseCandidateId === candidate.id)
    )
      return;
    const version = (await promptDialog({ title: "Sürüm numarası", label: "SemVer sürüm numarası", required: true, hint: "Örn. 1.2.3 veya 1.2.3-rc.1", confirmLabel: "Devam", tone: "default" }));
    if (version === null) return;
    if (
      !(await confirmDialog({ title: "Sürüm numarası kaydedilsin mi?", message: `${version.trim()} numarası bu projede benzersiz ve değiştirilemez sürüm kimliği olarak kaydedilecek. Dağıtım veya paket oluşturulmayacak. Onaylıyor musunuz?`, tone: "warning", confirmLabel: "Sürümü kaydet" }))
    )
      return;
    setError("");
    try {
      const created = await api<ReleaseVersion>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/version`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ version: version.trim(), confirmation: true }),
        },
      );
      setReleaseVersions((current) => [created, ...current]);
      setNotice(
        `${created.version} sürüm numarası atandı; kayıt değiştirilemez ve henüz yayınlanmadı.`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createReleasePackage(version: ReleaseVersion) {
    if (!workspaceProject || !gitStatusWorkspace || releasePackageLoading)
      return;
    if (
      !(await confirmDialog({ title: "Sürüm paketi oluşturulsun mu?", message: `${version.version} sürümü için onaylı commit ve başarılı sandbox testinden doğrulanmış ZIP paketi oluşturulsun mu? Bu işlem dağıtım başlatmaz.`, tone: "default", confirmLabel: "Paket oluştur" }))
    )
      return;
    setReleasePackageLoading(version.id);
    setError("");
    try {
      const created = await api<ReleasePackage>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-versions/${version.id}/package`,
        token,
        { method: "POST", body: JSON.stringify({ confirmation: true }) },
      );
      setReleasePackages((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      setNotice(
        `${created.version} paketi üretildi ve SHA-256 ile kaydedildi. Dağıtım başlatılmadı.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleasePackageLoading(null);
    }
  }
  async function downloadReleasePackage(pkg: ReleasePackage) {
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      releasePackageDownloadLoading
    )
      return;
    setReleasePackageDownloadLoading(pkg.id);
    setError("");
    try {
      const response = await authorizedFetch(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-packages/${pkg.id}/download`,
        token,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error ||
            body?.title ||
            `İndirme başarısız (${response.status}).`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = pkg.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleasePackageDownloadLoading(null);
    }
  }
  async function deployStaging(
    pkg: { id: string; version: string; commitSha: string },
    rollbackTargetDeploymentId?: string,
  ) {
    if (!workspaceProject || !gitStatusWorkspace || releaseDeploymentLoading)
      return;
    const active =
      releaseDeployments
        .filter(
          (item) =>
            item.environment === "Staging" && item.status === "Succeeded",
        )
        .sort((a, b) =>
          (b.completedAt ?? b.createdAt).localeCompare(
            a.completedAt ?? a.createdAt,
          ),
        )[0] ?? null;
    const description = rollbackTargetDeploymentId
      ? `Rollback: ${pkg.version} (${pkg.commitSha.slice(0, 12)}) eski sürümü aynı staging veritabanı üzerinde devreye alınacak.`
      : `${pkg.version} sürümü yerel Docker Compose staging ortamına kurulacak.`;
    if (
      !(await confirmDialog({ title: "Staging ortamına kurulsun mu?", message: `${description}\n\nYalnız bu bilgisayarda localhost üzerinden erişilir. İlk kurulumda staging yönetici parolası bir kez gösterilir. Devam edilsin mi?`, tone: "warning", confirmLabel: "Staging'e kur" }))
    )
      return;
    setReleaseDeploymentLoading(true);
    setError("");
    setStagingCredentials(null);
    try {
      const operation = await api<StagingDeploymentOperation>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-packages/${pkg.id}/deployments/staging`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            confirmation: true,
            expectedActiveDeploymentId: active?.id ?? null,
            rollbackTargetDeploymentId: rollbackTargetDeploymentId ?? null,
          }),
        },
      );
      setStagingCredentials(operation);
      setReleaseDeployments((current) => [
        operation.deployment,
        ...current.filter((item) => item.id !== operation.deployment.id),
      ]);
      setNotice(`Staging hazır: ${operation.deployment.environmentUrl}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleaseDeploymentLoading(false);
    }
  }
  async function deployProduction(approval: ProductionApproval) {
    if (
      !workspaceProject ||
      releaseDeploymentLoading ||
      tenant.role !== "TenantAdmin"
    )
      return;
    const active =
      releaseDeployments
        .filter(
          (item) =>
            item.environment === "Production" && item.status === "Succeeded",
        )
        .sort((a, b) =>
          (b.completedAt ?? b.createdAt).localeCompare(
            a.completedAt ?? a.createdAt,
          ),
        )[0] ?? null;
    if (
      !(await confirmDialog({ title: "Production ortamına kurulsun mu?", message: `${approval.version} sürümü onaylı yerel Docker Compose production ortamına kurulacak. Servis yalnız localhost üzerinden erişilir; production SQL verisi sürümler arasında korunur ve güncelleme öncesi yedeklenir. Dağıtım başlatılsın mı?`, tone: "danger", confirmLabel: "Production'a kur" }))
    )
      return;
    if (
      !(await confirmDialog({ title: "Veritabanı migration'ları uygulansın mı?", message: "Ayrı migration adımı onaylanıyor. Bekleyen SQL Server şema migration’ları production veritabanına uygulanacak. Başarısız güncellemede Deployer önceki uygulama sürümünü yeniden başlatmayı dener ve Compose başarılı olursa sağlık kontrolü yapar; sonucu yalnız Deployer loglarına yazar. Gerekirse production dağıtım geçmişindeki TenantAdmin geri yükleme kontrolü, o sürüm öncesindeki veritabanı ve uygulama paketini birlikte kurtarır; yedekten sonraki kayıtlar kaybolur. Devam edilsin mi?", tone: "danger", confirmLabel: "Migration'ları uygula" }))
    )
      return;
    setReleaseDeploymentLoading(true);
    setError("");
    setStagingCredentials(null);
    try {
      const operation = await api<StagingDeploymentOperation>(
        `/studio/projects/${workspaceProject.id}/production-approvals/${approval.id}/deploy`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: approval.id,
            confirmation: true,
            migrationConfirmation: true,
            expectedActiveDeploymentId: active?.id ?? null,
          }),
        },
      );
      setStagingCredentials(operation);
      setReleaseDeployments((current) => [
        operation.deployment,
        ...current.filter((item) => item.id !== operation.deployment.id),
      ]);
      setProductionApprovals((current) =>
        current.map((item) =>
          item.id === approval.id
            ? {
                ...item,
                productionDeploymentStarted: true,
                productionDeploymentId: operation.deployment.id,
                productionDeploymentStatus: operation.deployment.status,
                productionEnvironmentUrl: operation.deployment.environmentUrl,
              }
            : item,
        ),
      );
      setNotice(`Production hazır: ${operation.deployment.environmentUrl}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleaseDeploymentLoading(false);
    }
  }
  async function restoreProductionDatabase(deployment: ReleaseDeployment) {
    if (
      !workspaceProject ||
      releaseDeploymentLoading ||
      tenant.role !== "TenantAdmin" ||
      !deployment.canRestoreDatabase
    )
      return;
    const expectedActiveDeploymentId =
      deployment.status === "Failed"
        ? (deployment.rollbackOfDeploymentId ??
          deployment.rollbackTargetDeploymentId)
        : deployment.id;
    if (!expectedActiveDeploymentId) return;
    if (
      !(await confirmDialog({ title: "Production veritabanı yedekten geri yüklensin mi?", message: `Etkin production veritabanı ${deployment.version} sürümü öncesi alınan doğrulanmış yedekten geri yüklenecek. Bu yedekten sonra oluşan ERP kayıtları kaybolur. Önceki uygulama sürümü de yeniden başlatılacak. Devam edilsin mi?`, tone: "danger", confirmLabel: "Devam et" }))
    )
      return;
    const confirmationText = `RESTORE ${deployment.id.replaceAll("-", "")}`;
    if (
      !(await confirmDialog({
        title: "Geri yükleme kodunu yazın",
        message: "Bu son adım. Kod eşleşmeden geri yükleme başlamaz.",
        tone: "danger",
        details: [["Sürüm", deployment.version], ["Kod", confirmationText]],
        confirmText: confirmationText,
        confirmLabel: "Production'ı geri yükle",
      }))
    )
      return;
    setReleaseDeploymentLoading(true);
    setError("");
    try {
      const result = await api<StagingDeploymentOperation>(
        `/studio/projects/${workspaceProject.id}/production-deployments/restore`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            expectedActiveDeploymentId,
            backupDeploymentId: deployment.id,
            confirmation: true,
            confirmationText,
          }),
        },
      );
      setProductionDeployments((current) => [
        { ...result.deployment, canRestoreDatabase: true },
        ...current.map((item) =>
          item.id === expectedActiveDeploymentId
            ? { ...item, status: "Superseded", canRestoreDatabase: false }
            : item,
        ),
      ]);
      setNotice(
        `Production veritabanı ve uygulaması ${result.deployment.version} sürümüne geri yüklendi.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleaseDeploymentLoading(false);
    }
  }
  async function requestProductionApproval(deployment: ReleaseDeployment) {
    if (!workspaceProject || releaseDeploymentLoading) return;
    const note = (await promptDialog({ title: "Production onayı talep et", label: "Onay gerekçesi", required: true, multiline: true, hint: "1–1000 karakter. Bu adım canlıya yayın yapmaz.", confirmLabel: "Devam", tone: "default" }));
    if (note === null) return;
    if (!note.trim()) {
      setError("Onay talebi gerekçesi boş olamaz.");
      return;
    }
    if (
      !(await confirmDialog({ title: "Staging sürümü onaya gönderilsin mi?", message: "Başarılı staging sürümü TenantAdmin bağımsız incelemesine gönderilecek. Canlı üretime dağıtım BAŞLATILMAYACAK. Devam edilsin mi?", tone: "default", confirmLabel: "Onaya gönder" }))
    )
      return;
    setReleaseDeploymentLoading(true);
    setError("");
    try {
      const approval = await api<ProductionApproval>(
        `/studio/projects/${workspaceProject.id}/release-deployments/${deployment.id}/production-approval`,
        token,
        { method: "POST", body: JSON.stringify({ confirmation: true, note }) },
      );
      setProductionApprovals((current) => [
        approval,
        ...current.filter((item) => item.id !== approval.id),
      ]);
      setNotice("Üretim onay talebi kaydedildi. Canlı dağıtım başlatılmadı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleaseDeploymentLoading(false);
    }
  }
  async function reviewProductionApproval(
    approval: ProductionApproval,
    decision: "Approved" | "Rejected",
  ) {
    if (!workspaceProject || tenant.role !== "TenantAdmin") return;
    const note = (await promptDialog({ title: decision === "Approved" ? "Onay notu" : "Ret gerekçesi", label: decision === "Approved" ? "Onay notu" : "Ret gerekçesi", tone: decision === "Approved" ? "default" : "danger", confirmLabel: decision === "Approved" ? "Onayla" : "Reddet", required: true, multiline: true, hint: "1–1000 karakter." }));
    if (note === null) return;
    if (!note.trim()) {
      setError("İnceleme notu boş olamaz.");
      return;
    }
    try {
      const updated = await api<ProductionApproval>(
        `/studio/projects/${workspaceProject.id}/production-approvals/${approval.id}/review`,
        token,
        { method: "POST", body: JSON.stringify({ decision, note }) },
      );
      setProductionApprovals((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        decision === "Approved"
          ? "Üretim onayı kaydedildi. Canlı dağıtım başlatılmadı."
          : "Üretim onay talebi reddedildi.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function destroyStaging(deployment: ReleaseDeployment) {
    if (
      !workspaceProject ||
      releaseDeploymentLoading ||
      !(await confirmDialog({ title: "Staging ortamı silinsin mi?", message: `Yerel staging Compose servisleri, SQL veritabanı ve çalışma alanı verileri kalıcı olarak silinecek. Bu işlem geri alınamaz. Onaylıyor musunuz?`, tone: "danger", confirmLabel: "Staging'i sil" }))
    )
      return;
    setReleaseDeploymentLoading(true);
    setError("");
    try {
      const removed = await api<ReleaseDeployment>(
        `/studio/projects/${workspaceProject.id}/release-deployments/${deployment.id}/staging`,
        token,
        { method: "DELETE", body: JSON.stringify({ confirmation: true }) },
      );
      setReleaseDeployments((current) =>
        current.map((item) => (item.id === removed.id ? removed : item)),
      );
      setNotice("Staging servisleri ve veritabanı silindi.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReleaseDeploymentLoading(false);
    }
  }
  async function reviewReleaseCandidate(
    candidate: ReleaseCandidate,
    decision: "Approved" | "Rejected",
  ) {
    if (!workspaceProject || !gitStatusWorkspace) return;
    const note = (await promptDialog({ title: decision === "Approved" ? "Onay notu" : "Ret gerekçesi", label: decision === "Approved" ? "Onay notu" : "Ret gerekçesi", tone: decision === "Approved" ? "default" : "danger", confirmLabel: decision === "Approved" ? "Onayla" : "Reddet", required: true, multiline: true, hint: "1–1000 karakter." }));
    if (note === null) return;
    if (!note.trim()) {
      setError("İnceleme notu boş olamaz.");
      return;
    }
    setError("");
    try {
      const review = await api<{
        decision: string;
        note: string;
        createdAt: string;
        reviewedByUserId: string;
      }>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/release-candidates/${candidate.id}/review`,
        token,
        { method: "POST", body: JSON.stringify({ decision, note }) },
      );
      setReleaseCandidates((current) =>
        current.map((item) =>
          item.id === candidate.id
            ? {
                ...item,
                decision: review.decision,
                reviewNote: review.note,
                reviewedAt: review.createdAt,
                reviewedByUserId: review.reviewedByUserId,
                canReview: false,
              }
            : item,
        ),
      );
      setNotice(
        decision === "Approved"
          ? "Sürüm adayı yetkili kullanıcı tarafından onaylandı. Dağıtım başlatılmadı."
          : "Sürüm adayı reddedildi; karar geçmişe kaydedildi.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadCodeReviewThreads(path: string) {
    if (!workspaceProject || !gitStatusWorkspace) return;
    const result = await api<{ threads: StudioCodeReviewThread[] }>(
      `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/review-threads`,
      token,
    );
    setReviewThreads(result.threads.filter((thread) => thread.path === path));
  }
  async function openWorkspaceGitDiff(path: string) {
    if (!workspaceProject || !gitStatusWorkspace) return;
    setGitDiffTarget(path);
    setGitDiffLoading(true);
    setError("");
    setWorkspaceGitDiff(null);
    setCodeReview(null);
    setCodeReviewConsent(false);
    setReviewThreads([]);
    setReviewLine("1");
    setReviewDraft("");
    setReviewReplyThread(null);
    setReviewReplyDraft("");
    try {
      const diff = await api<WorkspaceGitDiff>(
        "/studio/projects/" +
          workspaceProject.id +
          "/workspace-requests/" +
          gitStatusWorkspace.id +
          "/git-diff?path=" +
          encodeURIComponent(path),
        token,
      );
      setWorkspaceGitDiff(diff);
      await loadCodeReviewThreads(path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGitDiffLoading(false);
    }
  }
  async function createCodeReviewThread(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !workspaceGitDiff ||
      !gitDiffTarget ||
      !reviewDraft.trim()
    )
      return;
    setReviewSaving(true);
    setError("");
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/review-threads`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            path: gitDiffTarget,
            lineNumber: Number(reviewLine),
            expectedHeadCommitSha: workspaceGitDiff.headCommitSha,
            body: reviewDraft.trim(),
          }),
        },
      );
      setReviewDraft("");
      await loadCodeReviewThreads(gitDiffTarget);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewSaving(false);
    }
  }
  async function replyToCodeReviewThread(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !gitDiffTarget ||
      !reviewReplyThread ||
      !reviewReplyDraft.trim()
    )
      return;
    setReviewSaving(true);
    setError("");
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/review-threads/${reviewReplyThread}/comments`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ body: reviewReplyDraft.trim() }),
        },
      );
      setReviewReplyDraft("");
      setReviewReplyThread(null);
      await loadCodeReviewThreads(gitDiffTarget);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewSaving(false);
    }
  }
  async function setCodeReviewThreadResolved(
    thread: StudioCodeReviewThread,
    resolved: boolean,
  ) {
    if (!workspaceProject || !gitStatusWorkspace || !gitDiffTarget) return;
    setReviewSaving(true);
    setError("");
    try {
      await api(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/review-threads/${thread.id}/status`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            resolved,
            expectedRowVersion: thread.rowVersion,
          }),
        },
      );
      await loadCodeReviewThreads(gitDiffTarget);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewSaving(false);
    }
  }
  async function reviewWorkspaceDiff(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !gitStatusWorkspace ||
      !workspaceGitDiff ||
      !codeReviewConsent
    )
      return;
    setCodeReviewLoading(true);
    setError("");
    setCodeReview(null);
    try {
      setCodeReview(
        await api<StudioCodeReview>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${gitStatusWorkspace.id}/code-review`,
          token,
          {
            method: "POST",
            body: JSON.stringify({
              path: workspaceGitDiff.path,
              aiSharingConfirmed: codeReviewConsent,
            }),
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCodeReviewConsent(false);
      setCodeReviewLoading(false);
    }
  }
  async function openStudioChat(request: WorkspaceRequest) {
    if (!workspaceProject) return;
    setChatWorkspace(request);
    setStudioConversations([]);
    setChatConversation(null);
    setChatMessages([]);
    setChatTitle("");
    setChatDraft("");
    setChatAIConsent(false);
    setChatKnowledgeConsent(false);
    setChatSourceSharingConsent(false);
    setChatCodeChange(null);
    setChatCodeChangeApplied([]);
    setError("");
    setChatLoading(true);
    void api<{ autoRefresh: StudioKnowledgeAutoRefresh }>(
      `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/knowledge`,
      token,
    )
      .then((result) => setKnowledgeAutoRefresh(result.autoRefresh))
      .catch(() =>
        setKnowledgeAutoRefresh({
          enabled: false,
          allFiles: false,
          paths: [],
          lastRefreshedAt: null,
        }),
      );
    try {
      const conversations = await api<StudioConversation[]>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/conversations`,
        token,
      );
      setStudioConversations(conversations);
      if (conversations[0]) {
        setChatConversation(conversations[0]);
        setChatMessages(
          await api<StudioConversationMessage[]>(
            `/studio/projects/${workspaceProject.id}/workspace-requests/${request.id}/conversations/${conversations[0].id}/messages`,
            token,
          ),
        );
      } else {
        await createStudioConversation(undefined, request);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChatLoading(false);
    }
  }
  async function createStudioConversation(
    e?: FormEvent,
    requestOverride?: WorkspaceRequest,
  ) {
    e?.preventDefault();
    const targetWorkspace = requestOverride ?? chatWorkspace;
    if (!workspaceProject || !targetWorkspace) return;
    setChatLoading(true);
    setError("");
    try {
      const conversation = await api<StudioConversation>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${targetWorkspace.id}/conversations`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ title: chatTitle.trim() || "Yeni sohbet" }),
        },
      );
      setStudioConversations((current) => [conversation, ...current]);
      setChatConversation(conversation);
      setChatMessages([]);
      setChatCodeChange(null);
      setChatCodeChangeApplied([]);
      setChatSourceSharingConsent(false);
      setChatTitle("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChatLoading(false);
    }
  }
  async function selectStudioConversation(conversation: StudioConversation) {
    if (!workspaceProject || !chatWorkspace) return;
    setChatLoading(true);
    setError("");
    setChatConversation(conversation);
    setChatCodeChange(null);
    setChatCodeChangeApplied([]);
    setChatSourceSharingConsent(false);
    try {
      setChatMessages(
        await api<StudioConversationMessage[]>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${chatWorkspace.id}/conversations/${conversation.id}/messages`,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChatLoading(false);
    }
  }
  async function deleteStudioConversation() {
    if (
      !workspaceProject ||
      !chatWorkspace ||
      !chatConversation?.canDelete ||
      !(await confirmDialog({ title: "Sohbet silinsin mi?", message: `“${chatConversation.title}” sohbeti ve mesaj geçmişi silinsin mi? Bu işlem geri alınamaz.`, tone: "danger", confirmLabel: "Sohbeti sil" }))
    )
      return;
    setChatLoading(true);
    setError("");
    try {
      await api<void>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${chatWorkspace.id}/conversations/${chatConversation.id}`,
        token,
        { method: "DELETE", body: JSON.stringify({ confirm: true }) },
      );
      setStudioConversations((current) =>
        current.filter((item) => item.id !== chatConversation.id),
      );
      setChatConversation(null);
      setChatMessages([]);
      setNotice(
        "Sohbet ve mesaj geçmişi silindi. Denetim kaydı yalnızca silme olayını içerir.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChatLoading(false);
    }
  }
  async function sendStudioChatMessage(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !chatWorkspace ||
      !chatConversation ||
      !chatAIConsent ||
      !chatDraft.trim()
    )
      return;
    if (
      /\b(?:adını\s+değiştir|olarak\s+değiştir|düzelt|uygula|koda\s+ekle|kodu\s+güncelle|rename|fix|apply|implement)\b/i.test(
        chatDraft.trim(),
      )
    ) {
      await createStudioChatCodeChange(e);
      return;
    }
    setChatLoading(true);
    setChatStreamingText("");
    setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70_000);
    try {
      const response = await authorizedFetch(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${chatWorkspace.id}/conversations/${chatConversation.id}/messages`,
        token,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: chatDraft.trim(),
            aiSharingConfirmed: chatAIConsent,
            includeKnowledgeBase:
              chatKnowledgeConsent || Boolean(knowledgeAutoRefresh.allFiles),
          }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          detail?: string;
          title?: string;
        } | null;
        throw new Error(
          payload?.error ||
            payload?.detail ||
            payload?.title ||
            `İstek başarısız (${response.status}).`,
        );
      }
      if (!response.body) throw new Error("Sohbet yanıt akışı alınamadı.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "",
        completed = false;
      const handleFrame = (frame: string) => {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (!data) return;
        const event = JSON.parse(data) as {
          type: string;
          content?: string;
          message?: string;
          userMessage?: StudioConversationMessage;
          assistantMessage?: StudioConversationMessage;
        };
        if (event.type === "delta" && event.content)
          setChatStreamingText((current) => current + event.content);
        else if (event.type === "error")
          throw new Error(event.message || "AI sohbet yanıtı alınamadı.");
        else if (
          event.type === "complete" &&
          event.userMessage &&
          event.assistantMessage
        ) {
          const reply = {
            userMessage: event.userMessage,
            assistantMessage: event.assistantMessage,
          };
          setChatMessages((current) =>
            [...current, reply.userMessage, reply.assistantMessage].slice(-100),
          );
          setStudioConversations((current) =>
            current
              .map((item) =>
                item.id === chatConversation.id
                  ? { ...item, updatedAt: reply.assistantMessage.createdAt }
                  : item,
              )
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
          setChatDraft("");
          setChatAIConsent(false);
          setChatKnowledgeConsent(false);
          setChatStreamingText("");
          completed = true;
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let separator;
        while ((separator = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const frame = buffer.slice(0, separator);
          const boundary =
            buffer.slice(separator).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
          buffer = buffer.slice(separator + boundary);
          handleFrame(frame);
        }
        if (done) break;
      }
      if (!completed)
        throw new Error(
          "AI yanıt akışı tamamlanmadan kesildi. Yeniden deneyin.",
        );
    } catch (e) {
      setChatStreamingText("");
      setError(
        controller.signal.aborted
          ? "AI sağlayıcısı 60 saniye içinde yanıt vermedi. Model erişilebilirliğini kontrol edin veya daha hızlı bir NVIDIA modeli seçin."
          : (e as Error).message,
      );
    } finally {
      clearTimeout(timeout);
      setChatLoading(false);
    }
  }
  async function createStudioChatCodeChange(e: FormEvent) {
    e.preventDefault();
    if (
      !workspaceProject ||
      !chatWorkspace ||
      !chatConversation ||
      !chatAIConsent ||
      !chatDraft.trim() ||
      chatCodeChangeLoading
    )
      return;
    if (chatDraft.trim().length > 2000) {
      setError("Kod değişikliği isteği en fazla 2000 karakter olabilir.");
      return;
    }
    if (!knowledgeAutoRefresh.allFiles && !chatSourceSharingConsent) {
      setError(
        "İlgili kaynak dosyalarını AI Geliştirici’ye göndermek için onay verin.",
      );
      return;
    }
    setChatCodeChangeLoading(true);
    setError("");
    setChatCodeChange(null);
    setChatCodeChangeApplied([]);
    try {
      const result = await api<StudioChatCodeChangePreview>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${chatWorkspace.id}/conversations/${chatConversation.id}/code-changes`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            request: chatDraft.trim(),
            aiSharingConfirmed: chatAIConsent,
            sourceSharingConfirmed: chatSourceSharingConsent,
          }),
        },
      );
      setChatCodeChange(result);
      setChatMessages((current) =>
        [...current, result.userMessage, result.assistantMessage].slice(-100),
      );
      setStudioConversations((current) =>
        current
          .map((item) =>
            item.id === chatConversation.id
              ? { ...item, updatedAt: result.assistantMessage.createdAt }
              : item,
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      setChatDraft("");
      setChatAIConsent(false);
      setChatSourceSharingConsent(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChatCodeChangeLoading(false);
    }
  }
  async function applyStudioChatCodeChange(
    change: StudioChatCodeChangePreview["changes"][number],
  ) {
    if (
      !workspaceProject ||
      !chatWorkspace ||
      chatCodeChangeApplied.includes(change.filePath) ||
      !(await confirmDialog({ title: "AI önerisi dosyaya uygulansın mı?", message: `AI önerisi ${change.filePath} dosyasına yalnızca bu izole çalışma alanında uygulansın mı? Dosyanın güncel özeti eşleşmezse işlem durdurulur. Kod çalıştırılmaz ve uzak depoya gönderilmez.`, tone: "default", confirmLabel: "Öneriyi uygula" }))
    )
      return;
    setChatCodeChangeLoading(true);
    setError("");
    try {
      await api<AppliedCodeSuggestion>(
        `/studio/projects/${workspaceProject.id}/workspace-requests/${chatWorkspace.id}/apply-code-patches`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            filePath: change.filePath,
            expectedSha256: change.sourceSha256,
            patches: change.patches.map((patch) => ({
              findText: patch.findText,
              replaceText: patch.replaceText,
              notes: patch.notes,
            })),
            approvalConfirmed: true,
          }),
        },
      );
      setChatCodeChangeApplied((current) => [...current, change.filePath]);
      setNotice(
        `${change.filePath} AI Asistanı önerisiyle izole çalışma alanına uygulandı. Kod çalıştırılmadı.`,
      );
      if (changeWorkspace?.id === chatWorkspace.id)
        await loadWorkspaceChanges(chatWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChatCodeChangeLoading(false);
    }
  }
  async function openWorkspaceChange(change: WorkspaceChange) {
    if (!workspaceProject || !changeWorkspace) return;
    setChangeLoading(true);
    setError("");
    setRestoreApproval(false);
    try {
      setChangeDiff(
        await api<WorkspaceChangeDiff>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            changeWorkspace.id +
            "/changes/" +
            change.id,
          token,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangeLoading(false);
    }
  }
  async function restoreWorkspaceChange() {
    if (
      !workspaceProject ||
      !changeWorkspace ||
      !changeDiff ||
      !restoreApproval ||
      !changeDiff.isCurrent ||
      changeDiff.isRestored
    )
      return;
    setChangeLoading(true);
    setError("");
    try {
      const restored = await api<RestoredWorkspaceChange>(
        "/studio/projects/" +
          workspaceProject.id +
          "/workspace-requests/" +
          changeWorkspace.id +
          "/changes/" +
          changeDiff.id +
          "/restore",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            expectedSha256: changeDiff.appliedSha256,
            approvalConfirmed: restoreApproval,
          }),
        },
      );
      setChangeDiff((current) =>
        current
          ? {
              ...current,
              currentContent: current.originalContent,
              isCurrent: false,
              isRestored: true,
            }
          : current,
      );
      setFileContent((current) =>
        current && current.path === restored.path
          ? changeDiff.wasCreated
            ? null
            : {
                ...current,
                content: changeDiff.originalContent,
                sizeBytes: new TextEncoder().encode(changeDiff.originalContent)
                  .length,
                sha256: restored.sha256,
              }
          : current,
      );
      setRestoreApproval(false);
      setWorkspaceChanges(
        await api<WorkspaceChanges>(
          "/studio/projects/" +
            workspaceProject.id +
            "/workspace-requests/" +
            changeWorkspace.id +
            "/changes",
          token,
        ),
      );
      setNotice(
        changeDiff.wasCreated
          ? "AI tarafından oluşturulan dosya, onayla çalışma alanından kaldırıldı. Kod çalıştırılmadı."
          : "Değişiklik kaydedilmiş önceki dosya içeriğine geri alındı. Kod çalıştırılmadı.",
      );
      if (changeDiff.wasCreated && fileWorkspace?.id === changeWorkspace.id) {
        const query = `path=${encodeURIComponent(filePath)}&offset=0`;
        setFileListing(
          await api<WorkspaceFileListing>(
            `/studio/projects/${workspaceProject.id}/workspace-requests/${changeWorkspace.id}/files?${query}`,
            token,
          ),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChangeLoading(false);
    }
  }
  async function createArchitecturePlan(e: FormEvent) {
    e.preventDefault();
    if (!workspaceProject || !architectWorkspace || !architectConsent) return;
    setArchitectLoading(true);
    setError("");
    setArchitectPlan(null);
    setArchitectSavedPlanId(null);
    try {
      setArchitectPlan(
        await api<ArchitecturePlan>(
          `/studio/projects/${workspaceProject.id}/workspace-requests/${architectWorkspace.id}/architecture-plan`,
          token,
          {
            method: "POST",
            body: JSON.stringify({ request: architectRequest }),
          },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchitectLoading(false);
    }
  }
  async function saveArchitecturePlan() {
    if (!workspaceProject || !architectWorkspace || !architectPlan) return;
    setArchitectLoading(true);
    setError("");
    try {
      const saved = await api<SavedArchitecturePlan>(
        `/studio/projects/${workspaceProject.id}/architecture-plans`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceRequestId: architectWorkspace.id,
            plan: architectPlan,
          }),
        },
      );
      setArchitectSavedPlanId(saved.id);
      setSavedArchitecturePlans((current) =>
        [saved, ...current.filter((x) => x.id !== saved.id)].slice(0, 50),
      );
      setNotice(
        "Mimari plan bu proje için saklandı. Özgün talep metni kaydedilmedi.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchitectLoading(false);
    }
  }
  async function openSavedArchitecturePlan(saved: SavedArchitecturePlan) {
    if (!workspaceProject) return;
    const request = workspaceRequests.find(
      (x) => x.id === saved.workspaceRequestId,
    );
    if (!request) {
      setError("Planın çalışma alanı isteği bulunamadı.");
      return;
    }
    setArchitectLoading(true);
    setError("");
    try {
      const detail = await api<SavedArchitecturePlanDetail>(
        `/studio/projects/${workspaceProject.id}/architecture-plans/${saved.id}`,
        token,
      );
      setArchitectWorkspace(request);
      setArchitectPlan(detail.plan);
      setArchitectSavedPlanId(saved.id);
      setArchitectRequest("");
      setArchitectConsent(false);
      setShowPlanHistory(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchitectLoading(false);
    }
  }
  async function deleteSavedArchitecturePlan(saved: SavedArchitecturePlan) {
    if (!workspaceProject || !saved.canDelete) return;
    if (
      !(await confirmDialog({ title: "Mimari plan silinsin mi?", message: `“${saved.summary}” mimari planını kalıcı olarak silmek istiyor musunuz?`, tone: "danger", confirmLabel: "Planı sil" }))
    )
      return;
    setError("");
    try {
      await api<void>(
        `/studio/projects/${workspaceProject.id}/architecture-plans/${saved.id}`,
        token,
        { method: "DELETE", body: JSON.stringify({ confirm: true }) },
      );
      setSavedArchitecturePlans((current) =>
        current.filter((x) => x.id !== saved.id),
      );
      if (architectSavedPlanId === saved.id) {
        setArchitectSavedPlanId(null);
        setArchitectPlan(null);
      }
      setNotice("Mimari plan silindi; silme olayı denetim kaydına eklendi.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const aiToolCategories = [
    "Tümü",
    "Kod üretimi",
    "Analiz",
    "İyileştirme",
    "Dokümantasyon",
    "Veri & ERP",
    "Özel araçlar",
  ];
  const canEditWorkspace = Boolean(
    workspaceProject && workspaceProject.accessLevel !== "Viewer",
  );
  const aiToolCards = [
    {
      id: "file",
      title: "AI dosya oluştur",
      category: "Kod üretimi",
      description:
        "İhtiyacınıza göre yeni bir kod dosyası için gözden geçirilebilir öneri hazırlayın.",
      tags: ["Kod üretimi", "Öneri"],
      icon: Sparkles,
      disabled: !canEditWorkspace,
      action: () => {
        setAiToolsViewOpen(false);
        startNewCodeSuggestion(fileWorkspace!);
      },
    },
    {
      id: "ui",
      title: "UI tasarla",
      category: "Kod üretimi",
      description:
        "Yeni bir ekran taslağı oluşturun; değişiklikleri çalışma alanına uygulamadan önce inceleyin.",
      tags: ["UI / UX", "React"],
      icon: Code2,
      disabled: !canEditWorkspace,
      action: () => {
        setAiToolsViewOpen(false);
        startUiDesigner(fileWorkspace!);
      },
    },
    {
      id: "analysis",
      title: "Hata analiz et",
      category: "Analiz",
      description:
        "Kaynak kod içinde hata veya teknik konu arayın ve eşleşmeleri inceleyin.",
      tags: ["Analiz", "Kod arama"],
      icon: ShieldCheck,
      disabled: false,
      action: () => {
        setAiToolsViewOpen(false);
        setSourceSearchWorkspace(fileWorkspace!);
        setSourceSearchQuery("");
        setSourceSearchResult(null);
        setSelectedSourceMatches([]);
        setSourceAnalysisResult(null);
        setSourceAnalysisQuestion("");
        setSourceAnalysisConsent(false);
        setError("");
      },
    },
    {
      id: "data",
      title: "Veri modeli oluştur",
      category: "Veri & ERP",
      description:
        "ERP veri modeli hakkında mühendis asistanıyla çalışın; öneriler ayrı onay gerektirir.",
      tags: ["ERP", "Veri tabanı"],
      icon: Folder,
      disabled: !canEditWorkspace,
      action: () => {
        setAiToolsViewOpen(false);
        setAiDockOpen(true);
      },
    },
    {
      id: "docs",
      title: "Dokümantasyon yaz",
      category: "Dokümantasyon",
      description:
        "Proje hakkında AI sohbetinde teknik dokümantasyon taslağı hazırlayın.",
      tags: ["Dokümantasyon", "Markdown"],
      icon: FileCode,
      disabled: !fileWorkspace?.workspaceBranchName,
      action: () => {
        setAiToolsViewOpen(false);
        void openStudioChat(fileWorkspace!);
      },
    },
    {
      id: "improve",
      title: "Kodu iyileştir",
      category: "İyileştirme",
      description:
        "Seçili kaynak dosya için iyileştirme önerisi üretin ve farkları gözden geçirin.",
      tags: ["İyileştirme", "Refactor"],
      icon: Code2,
      disabled:
        !fileContent ||
        !canEditWorkspace ||
        !/\.(cs|csx|razor|ts|tsx|js|jsx|html|css|scss|sql|py|go|rs|java)$/i.test(
          fileContent?.path ?? "",
        ),
      action: () => {
        setAiToolsViewOpen(false);
        startCodeSuggestion();
      },
    },
    {
      id: "architect",
      title: "Mimariyi planla",
      category: "Özel araçlar",
      description:
        "İstek için teknik plan, etki alanı ve inceleme adımları oluşturun.",
      tags: ["Mimari", "Planlama"],
      icon: Sparkles,
      disabled: !canEditWorkspace,
      action: () => {
        setAiToolsViewOpen(false);
        setArchitectWorkspace(fileWorkspace!);
        setArchitectPlan(null);
        setArchitectRequest(
          linkedDevelopmentContext(
            fileWorkspace!.developmentRequestTitle,
            fileWorkspace!.developmentRequestDescription,
          ),
        );
        setArchitectConsent(false);
        setError("");
      },
    },
  ];
  const filteredAiToolCards = aiToolCards.filter(
    (card) =>
      (aiToolsCategory === "Tümü" || card.category === aiToolsCategory) &&
      `${card.title} ${card.category} ${card.description} ${card.tags.join(" ")}`
        .toLocaleLowerCase("tr-TR")
        .includes(aiToolsQuery.trim().toLocaleLowerCase("tr-TR")),
  );
  return (
    <>
      {pendingApprovals.length > 0 && (
        <section className="ns-card sp-queue" aria-labelledby="sp-queue-title">
          <header className="ns-card-head">
            <div>
              <h3 id="sp-queue-title">Onay kuyruğu</h3>
              <p className="sp-sub">
                Yetkili olduğunuz projelerde bekleyen çalışma alanı talepleri
              </p>
            </div>
            <span className="ns-badge is-warning">
              {pendingApprovals.length} bekliyor
            </span>
          </header>
          {error && <div className="alert">{error}</div>}
          <ul className="sp-queue-list">
            {pendingApprovals.map((request) => (
              <li className="sp-queue-item" key={request.id}>
                <span className="sp-avatar" aria-hidden="true">
                  <Code2 size={16} />
                </span>
                <div className="sp-queue-info">
                  <b>
                    {request.projectName} · <code>{request.branchName}</code>
                  </b>
                  <small>
                    {request.requesterEmail} ·{" "}
                    {new Date(request.createdAt).toLocaleString("tr-TR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                  {request.developmentRequestTitle && (
                    <small>
                      Bağlı talep: <b>{request.developmentRequestTitle}</b>
                    </small>
                  )}
                  {request.developmentRequestDescription && (
                    <p>{request.developmentRequestDescription}</p>
                  )}
                </div>
                <div className="sp-actions">
                  <button
                    className="ns-btn ns-btn-sm small-button"
                    disabled={busy || !reviewNote.trim()}
                    title={
                      reviewNote.trim()
                        ? undefined
                        : "Reddetmek için aşağıya gerekçe yazın"
                    }
                    onClick={() => void reviewPendingApproval(request, "Reject")}
                  >
                    Reddet
                  </button>
                  <button
                    className="ns-btn ns-btn-sm small-button ns-btn-primary"
                    disabled={busy}
                    onClick={() => void reviewPendingApproval(request, "Approve")}
                  >
                    Onayla
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {approvalQueueLoading && (
            <div className="ns-empty">Onay kuyruğu yükleniyor…</div>
          )}
          <div className="sp-queue-foot">
            <label className="ns-field">
              <span className="ns-field-label">Ret gerekçesi</span>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Ret kararının kısa gerekçesini yazın…"
              />
              <small className="ns-field-hint">
                Reddetmek için gerekli. Gerekçe inceleme geçmişine kaydedilir.
                Talep sahibi kendi talebini inceleyemez.
              </small>
            </label>
            <nav className="sp-pager" aria-label="Onay kuyruğu sayfaları">
              <span>
                {pendingApprovalsOffset + 1}–
                {pendingApprovalsOffset + pendingApprovals.length}. kayıtlar
              </span>
              {pendingApprovalsOffset > 0 && (
                <button
                  className="ns-btn ns-btn-sm small-button"
                  disabled={approvalQueueLoading || busy}
                  onClick={() =>
                    void loadPendingApprovals(
                      Math.max(0, pendingApprovalsOffset - 100),
                    )
                  }
                >
                  Önceki
                </button>
              )}
              {pendingApprovalsNextOffset !== null && (
                <button
                  className="ns-btn ns-btn-sm small-button"
                  disabled={approvalQueueLoading || busy}
                  onClick={() =>
                    void loadPendingApprovals(pendingApprovalsNextOffset)
                  }
                >
                  Sonraki
                </button>
              )}
            </nav>
          </div>
        </section>
      )}
      <section className="ns-card sp-projects" aria-labelledby="sp-projects-title">
        <header className="ns-card-head">
          <div>
            <h3 id="sp-projects-title">Projeler</h3>
            <p className="sp-sub">
              Erişiminiz olan depolar · {projects.length} proje
            </p>
          </div>
          <div className="sp-actions">
            <button
              className="ns-btn ns-btn-sm small-button"
              disabled={busy}
              onClick={() => void refreshProjectStatus()}
            >
              <RefreshCw size={14} aria-hidden="true" /> Bağlantıları yenile
            </button>
            {tenant.role === "TenantAdmin" && (
              <button
                className="ns-btn ns-btn-sm small-button ns-btn-primary"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={15} aria-hidden="true" /> Proje kaydet
              </button>
            )}
          </div>
        </header>
        {error && <div className="alert">{error}</div>}
        {notice && <div className="notice">{notice}</div>}
        {aiConfigured === false && (
          <div className="notice">
            <b>AI sağlayıcısı yapılandırılmadı.</b> AI özelliklerini açmak için
            Docker ortamına <code>OPENAI_API_KEY</code> ekleyip{" "}
            <code>ai-service</code> servisini yeniden başlatın. Anahtar
            tarayıcıya gönderilmez.
          </div>
        )}
        {projects.length ? (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th scope="col">Proje / depo</th>
                  <th scope="col">Varsayılan dal</th>
                  <th scope="col">Rolünüz</th>
                  <th scope="col">GitHub</th>
                  <th scope="col">
                    <span className="ns-sr-only">İşlemler</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div className="sp-project-name">
                        <span className="sp-avatar" aria-hidden="true">
                          {project.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                        </span>
                        <div>
                          <button
                            type="button"
                            className="sp-link"
                            onClick={() => void openWorkspace(project)}
                          >
                            {project.name}
                          </button>
                          <small title={project.repositoryUrl}>
                            {project.repositoryUrl}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="sp-branch">{project.defaultBranch}</code>
                    </td>
                    <td>{projectAccessLabel(project.accessLevel)}</td>
                    <td>
                      <span
                        className={`ns-badge ${project.githubAuthorized ? "is-success" : "is-warning"}`}
                      >
                        {project.githubAuthorized ? "Bağlı" : "Yetki gerekli"}
                      </span>
                    </td>
                    <td>
                      <div className="sp-actions sp-row-actions">
                        {(project.accessLevel === "Maintainer" ||
                          project.accessLevel === "TenantAdmin") && (
                          <>
                            <button
                              className="ns-btn ns-btn-sm small-button ns-btn-ghost"
                              onClick={() => void openAccess(project)}
                            >
                              <ShieldCheck size={14} aria-hidden="true" />
                              Erişimler
                            </button>
                            <button
                              className="ns-btn ns-btn-sm small-button ns-btn-ghost"
                              onClick={() => setModuleMappingProject(project)}
                            >
                              <Code2 size={14} aria-hidden="true" />
                              Modül kaynağı
                            </button>
                          </>
                        )}
                        <button
                          className="ns-btn ns-btn-sm small-button"
                          onClick={() => void openWorkspace(project)}
                        >
                          <Folder size={14} aria-hidden="true" />
                          Çalışma alanı
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ns-empty">
            <span className="sp-avatar" aria-hidden="true">
              <FolderKanban size={16} />
            </span>
            <b>Henüz erişebildiğiniz proje yok</b>
            <span>
              {tenant.role === "TenantAdmin"
                ? "İlk depoyu kaydederek başlayın."
                : "Firma yöneticisi bir depo kaydedip size erişim verebilir."}
            </span>
            {tenant.role === "TenantAdmin" && (
              <button
                className="ns-btn ns-btn-sm small-button ns-btn-primary"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={15} aria-hidden="true" /> Proje kaydet
              </button>
            )}
          </div>
        )}
        <p className="sp-footnote">
          <ShieldCheck size={15} aria-hidden="true" />
          Proje gezgini onaylı checkout'taki dosya adlarını ve türlerini
          listeler. Git kimlik bilgisi alınmaz, önizleme salt okunurdur ve kod
          çalıştırılmaz.
        </p>
      </section>
      {showCreate && (
        <ProjectCreateDialog
          busy={busy}
          createProject={createProject}
          defaultBranch={defaultBranch}
          error={error}
          name={name}
          repositoryUrl={repositoryUrl}
          setDefaultBranch={setDefaultBranch}
          setName={setName}
          setRepositoryUrl={setRepositoryUrl}
          setShowCreate={setShowCreate}
        />
      )}
      {accessProject && (
        <ProjectAccessDialog
          accessLevel={accessLevel}
          accessProject={accessProject}
          busy={busy}
          error={error}
          grantAccess={grantAccess}
          memberEmail={memberEmail}
          members={members}
          revokeAccess={revokeAccess}
          setAccessLevel={setAccessLevel}
          setAccessProject={setAccessProject}
          setMemberEmail={setMemberEmail}
        />
      )}
      {workspaceProject && (
        <section className="studio-workspace-screen">
          <div className="studio-workspace-page">
            <nav className="studio-workspace-nav">
              <button
                type="button"
                className="studio-workspace-back"
                onClick={() => setWorkspaceProject(null)}
              >
                <ArrowLeft size={16} /> Projelere dön
              </button>
              <span>
                Studio <ChevronRight size={13} /> Projeler{" "}
                <ChevronRight size={13} /> Çalışma alanı
              </span>
            </nav>
            <header className="studio-workspace-hero">
              <div className="studio-workspace-hero-copy">
                <p className="eyebrow">İZOLE ÇALIŞMA ALANI</p>
                <h1>{workspaceProject.name}</h1>
                <p>
                  Seçtiğiniz dal başlangıç noktasıdır. Onaydan sonra Runner her
                  talep için ayrı bir yerel AI çalışma dalı açar; uzak depoya
                  push yapılmaz.
                </p>
                <div className="studio-workspace-meta">
                  <span>
                    <Code2 size={14} />
                    {workspaceProject.repositoryUrl}
                  </span>
                  <span>
                    <span className="studio-workspace-meta-dot" />
                    Başlangıç dalı: <b>{workspaceProject.defaultBranch}</b>
                  </span>
                </div>
              </div>
              <span className="studio-workspace-access">
                {workspaceProject.accessLevel === "TenantAdmin"
                  ? "Yönetici"
                  : workspaceProject.accessLevel === "Maintainer"
                    ? "Bakım sorumlusu"
                    : workspaceProject.accessLevel === "Contributor"
                      ? "Katılımcı"
                      : "Görüntüleyici"}
              </span>
            </header>
            <main className="studio-workspace-content">
              <section className="studio-workspace-intro">
                <div>
                  <p className="eyebrow">YENİ TALEP</p>
                  <h2>Çalışma alanı oluştur</h2>
                  <p>
                    Bir başlangıç dalı seçin ve isterseniz geliştirme talebine
                    bağlayın.
                  </p>
                </div>
              </section>
              {!workspaceProject.githubAuthorized && (
                <div className="boundary-note">
                  <ShieldCheck size={17} />
                  <span>
                    <b>GitHub depo erişimi</b>
                    {workspaceProject.githubAuthorized
                      ? "Bu proje GitHub App ile yetkilendirildi."
                      : "Özel depolar için GitHub App yetkilendirmesi gerekir."}
                  </span>
                  {(workspaceProject.accessLevel === "TenantAdmin" ||
                    workspaceProject.accessLevel === "Maintainer") && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {!workspaceProject.githubAuthorized &&
                        workspaceProject.repositoryUrl.startsWith(
                          "https://github.com/",
                        ) && (
                          <button
                            type="button"
                            className="ns-btn ns-btn-sm small-button ns-btn-primary"
                            disabled={busy}
                            onClick={() => void connectProjectGitHub()}
                          >
                            GitHub ile yetkilendir
                          </button>
                        )}
                      {workspaceProject.githubAuthorized && (
                        <button
                          type="button"
                          className="ns-btn ns-btn-sm small-button"
                          disabled={busy}
                          onClick={() => void disconnectProjectGitHub()}
                        >
                          Bağlantıyı kaldır
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {error && <div className="alert">{error}</div>}
              <div className="studio-workspace-layout">
                {(workspaceProject.accessLevel === "TenantAdmin" ||
                  workspaceProject.accessLevel === "Contributor" ||
                  workspaceProject.accessLevel === "Maintainer") && (
                  <section className="studio-workspace-create-card">
                    <form onSubmit={createWorkspaceRequest}>
                      <label>
                        Çalışma dalı
                        <select
                          aria-label="Çalışma dalı seçin"
                          value={
                            customWorkspaceBranch ? "__custom" : workspaceBranch
                          }
                          disabled={branchesLoading}
                          onChange={(e) => {
                            if (e.target.value === "__custom") {
                              setCustomWorkspaceBranch(true);
                              setWorkspaceBranch("");
                            } else {
                              setCustomWorkspaceBranch(false);
                              setWorkspaceBranch(e.target.value);
                            }
                          }}
                        >
                          {workspaceBranches.map((branch) => (
                            <option value={branch} key={branch}>
                              {branch}
                            </option>
                          ))}
                          <option value="__custom">
                            Başka bir dal adı gir…
                          </option>
                        </select>
                        {customWorkspaceBranch && (
                          <input
                            aria-label="Yeni çalışma dalı adı"
                            value={workspaceBranch}
                            onChange={(e) => setWorkspaceBranch(e.target.value)}
                            required
                            maxLength={256}
                            placeholder="feature/cari-hesaplar"
                          />
                        )}
                        <small>
                          {branchesLoading
                            ? "Git dalları yükleniyor…"
                            : branchesAvailable
                              ? `${workspaceBranches.length} dal seçilebilir; başka dal adı da girebilirsiniz.`
                              : branchListError ||
                                "Depo dalları şu anda alınamadı; varsayılan dalı seçebilir veya başka dal adı girebilirsiniz."}
                        </small>
                      </label>
                      {!branchesAvailable && !branchesLoading && (
                        <button
                          type="button"
                          className="ns-btn ns-btn-sm small-button"
                          disabled={busy}
                          onClick={() =>
                            void loadProjectBranches(workspaceProject)
                          }
                        >
                          Dalları yeniden yükle
                        </button>
                      )}
                      <label>
                        Bağlı geliştirme talebi
                        <select
                          value={selectedDevelopmentRequestId}
                          onChange={(e) =>
                            setSelectedDevelopmentRequestId(e.target.value)
                          }
                        >
                          <option value="">Bağımsız çalışma alanı</option>
                          {projectDevelopmentRequests.map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.title}
                            </option>
                          ))}
                        </select>
                        <small>
                          Seçilen talep, onay sırasında ve AI
                          Architect/Developer araçlarında bağlam olarak görünür.
                        </small>
                      </label>
                      <div className="modal-foot">
                        <span>
                          <ShieldCheck size={14} /> Onay bekleyen talep
                          oluşturulur
                        </span>
                        <button
                          className="ns-btn ns-btn-primary"
                          disabled={
                            busy ||
                            !workspaceBranch.trim() ||
                            (!customWorkspaceBranch &&
                              !workspaceBranches.includes(workspaceBranch))
                          }
                        >
                          {busy ? "Gönderiliyor…" : "Çalışma alanı iste"}{" "}
                          <span>→</span>
                        </button>
                      </div>
                    </form>
                  </section>
                )}
                <section className="studio-workspace-requests">
                  <div className="list-toolbar">
                    <div>
                      <h3>Çalışma alanı talepleri</h3>
                      <p>{workspaceRequests.length} kayıt</p>
                    </div>
                    <button
                      className="ns-btn ns-btn-sm small-button"
                      onClick={() => setShowPlanHistory(true)}
                    >
                      Plan geçmişi ({savedArchitecturePlans.length})
                    </button>
                  </div>
                  <div className="requests-list">
                    {workspaceRequests.length ? (
                      workspaceRequests.map((request) => (
                        <article
                          className="request-row expanded workspace-request-row"
                          key={request.id}
                        >
                          <div className="request-symbol">
                            <Code2 size={17} />
                          </div>
                          <div
                            className="request-info workspace-launch-area"
                            role={
                              request.status === "Ready" ? "button" : undefined
                            }
                            tabIndex={
                              request.status === "Ready" ? 0 : undefined
                            }
                            title={
                              request.status === "Ready"
                                ? "Çalışma alanının dosyalarını aç"
                                : undefined
                            }
                            onClick={() => {
                              if (request.status === "Ready")
                                void loadWorkspaceFiles(request, "");
                            }}
                            onKeyDown={(event) => {
                              if (
                                request.status === "Ready" &&
                                (event.key === "Enter" || event.key === " ")
                              ) {
                                event.preventDefault();
                                void loadWorkspaceFiles(request, "");
                              }
                            }}
                          >
                            <div className="workspace-request-heading">
                              <b>
                                {request.workspaceBranchName
                                  ? `${request.branchName} → ${request.workspaceBranchName}`
                                  : request.branchName}
                              </b>
                              <span
                                className={`ns-badge ${workspaceStatusTone(request.status)}`}
                              >
                                {request.status === "PendingApproval"
                                  ? "Onay bekliyor"
                                  : request.status === "Approved"
                                    ? "Onaylandı"
                                    : request.status === "Provisioning"
                                      ? "Hazırlanıyor"
                                      : request.status === "ProvisioningFailed"
                                        ? "Başarısız"
                                        : request.status === "Cancelled"
                                          ? "İptal edildi"
                                          : request.status === "Ready"
                                            ? "Hazır"
                                            : request.status === "Rejected"
                                              ? "Reddedildi"
                                              : "Reddedildi"}
                              </span>
                            </div>
                            {request.developmentRequestTitle && (
                              <small>
                                Talep: {request.developmentRequestTitle}
                              </small>
                            )}
                            <small>
                              {new Date(request.createdAt).toLocaleString(
                                "tr-TR",
                                { dateStyle: "medium", timeStyle: "short" },
                              )}
                              {request.reviewNote
                                ? " · " + request.reviewNote
                                : ""}
                              {request.provisioningError
                                ? " · " + request.provisioningError
                                : ""}
                              {request.commitSha
                                ? " · " + request.commitSha
                                : ""}
                              {request.provisionedAt
                                ? " · " +
                                  new Date(
                                    request.provisionedAt,
                                  ).toLocaleString("tr-TR", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : ""}
                              {request.status === "PendingApproval" &&
                              !request.canReview
                                ? " · farklı yetkili onayı bekleniyor"
                                : ""}
                            </small>
                          </div>
                          {request.status === "PendingApproval" &&
                            (request.canReview || request.canCancel) && (
                              <div style={{ display: "flex", gap: 6 }}>
                                {request.canReview && (
                                  <>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      disabled={busy}
                                      onClick={() =>
                                        void reviewWorkspaceRequest(
                                          request,
                                          "Approve",
                                        )
                                      }
                                    >
                                      Onayla
                                    </button>
                                    <button
                                      className="ns-btn ns-btn-sm small-button"
                                      disabled={busy}
                                      onClick={() =>
                                        void reviewWorkspaceRequest(
                                          request,
                                          "Reject",
                                        )
                                      }
                                    >
                                      Reddet
                                    </button>
                                  </>
                                )}
                                {request.canCancel && (
                                  <button
                                    className="ns-btn ns-btn-sm small-button"
                                    disabled={busy}
                                    onClick={() =>
                                      void cancelWorkspaceRequest(request)
                                    }
                                  >
                                    Talebi iptal et
                                  </button>
                                )}
                              </div>
                            )}
                          {request.canDelete &&
                            request.status !== "Provisioning" && (
                              <button
                                type="button"
                                className="ns-btn ns-btn-sm small-button workspace-request-delete"
                                disabled={busy}
                                onClick={() =>
                                  void archiveWorkspaceRequest(request)
                                }
                                title="Talebi etkin listeden sil"
                              >
                                Sil
                              </button>
                            )}
                          {(request.status === "Approved" ||
                            request.status === "ProvisioningFailed") &&
                            (workspaceProject.accessLevel === "TenantAdmin" ||
                              workspaceProject.accessLevel ===
                                "Maintainer") && (
                              <button
                                className="ns-btn ns-btn-sm small-button"
                                disabled={busy}
                                onClick={() => void provisionWorkspace(request)}
                              >
                                {request.status === "ProvisioningFailed"
                                  ? "Yeniden dene"
                                  : "Checkout oluştur"}
                              </button>
                            )}
                          {request.status === "Ready" && (
                            <div className="workspace-request-actions">
                              {request.workspaceBranchName === null &&
                                (workspaceProject.accessLevel ===
                                  "TenantAdmin" ||
                                  workspaceProject.accessLevel ===
                                    "Maintainer") && (
                                  <button
                                    className="ns-btn ns-btn-sm small-button"
                                    disabled={busy}
                                    onClick={() =>
                                      void ensureWorkspaceBranch(request)
                                    }
                                  >
                                    İzole dal oluştur
                                  </button>
                                )}
                              <button
                                type="button"
                                className="ns-btn ns-btn-sm small-button ns-btn-primary"
                                disabled={fileLoading}
                                onClick={() =>
                                  void loadWorkspaceFiles(request, "")
                                }
                              >
                                <Code2 size={14} /> Dosyaları aç{" "}
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          )}
                        </article>
                      ))
                    ) : (
                      <div className="empty-small">
                        <div>
                          <b>Bekleyen çalışma alanı talebi yok</b>
                          <small>Yeni talepler onay kuyruğunda görünür.</small>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
              {workspaceRequests.some(
                (x) => x.status === "PendingApproval" && x.canReview,
              ) && (
                <label className="review-note-field">
                  <span>Ret gerekçesi</span>
                  <small>Gerekçe inceleme geçmişine kaydedilir.</small>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Ret kararının kısa gerekçesini yazın…"
                  />
                </label>
              )}
              <div className="boundary-note">
                <ShieldCheck size={17} />
                <span>
                  <b>Yetkili onay</b>Yetkili onaydan sonra Runner seçilen kaynak
                  dalından ayrı bir yerel çalışma dalı oluşturur. Bu dal
                  şimdilik yalnız izole checkout içinde bulunur; push/PR ve kod
                  çalıştırma yapılmaz.
                </span>
              </div>
            </main>
          </div>
        </section>
      )}
      {gitStatusWorkspace && (
        <ReleaseDialog
          assignReleaseVersion={assignReleaseVersion}
          commitApprovedWorkspaceChanges={commitApprovedWorkspaceChanges}
          createPullRequestDraft={createPullRequestDraft}
          createReleaseCandidate={createReleaseCandidate}
          createReleasePackage={createReleasePackage}
          deployProduction={deployProduction}
          deployStaging={deployStaging}
          destroyStaging={destroyStaging}
          downloadReleasePackage={downloadReleasePackage}
          error={error}
          gitDiffLoading={gitDiffLoading}
          gitStatusLoading={gitStatusLoading}
          gitStatusWorkspace={gitStatusWorkspace}
          importGitHubReviewComments={importGitHubReviewComments}
          loadWorkspaceGitStatus={loadWorkspaceGitStatus}
          markGitHubPullRequestReady={markGitHubPullRequestReady}
          openWorkspaceGitDiff={openWorkspaceGitDiff}
          productionApprovals={productionApprovals}
          productionDeployments={productionDeployments}
          publishPullRequest={publishPullRequest}
          publishedPullRequest={publishedPullRequest}
          pullRequestDraft={pullRequestDraft}
          pullRequestDraftLoading={pullRequestDraftLoading}
          pullRequestPublishLoading={pullRequestPublishLoading}
          pullRequestReadyLoading={pullRequestReadyLoading}
          releaseCandidateSaving={releaseCandidateSaving}
          releaseCandidates={releaseCandidates}
          releaseDeploymentLoading={releaseDeploymentLoading}
          releaseDeployments={releaseDeployments}
          releasePackageDownloadLoading={releasePackageDownloadLoading}
          releasePackageLoading={releasePackageLoading}
          releasePackages={releasePackages}
          releaseTestEvidence={releaseTestEvidence}
          releaseVersions={releaseVersions}
          requestGitHubReviewers={requestGitHubReviewers}
          requestProductionApproval={requestProductionApproval}
          restoreProductionDatabase={restoreProductionDatabase}
          reviewProductionApproval={reviewProductionApproval}
          reviewReleaseCandidate={reviewReleaseCandidate}
          setGitStatusWorkspace={setGitStatusWorkspace}
          setWorkspaceGitStatus={setWorkspaceGitStatus}
          stagingCredentials={stagingCredentials}
          submitGitHubReview={submitGitHubReview}
          syncGitHubReviewComments={syncGitHubReviewComments}
          tenant={tenant}
          token={token}
          workspaceCommitLoading={workspaceCommitLoading}
          workspaceGitStatus={workspaceGitStatus}
          workspaceProject={workspaceProject}
        />
      )}{" "}
      {chatWorkspace && workspaceProject && (
        <ChatDialog
          applyStudioChatCodeChange={applyStudioChatCodeChange}
          chatAIConsent={chatAIConsent}
          chatCodeChange={chatCodeChange}
          chatCodeChangeApplied={chatCodeChangeApplied}
          chatCodeChangeLoading={chatCodeChangeLoading}
          chatConversation={chatConversation}
          chatDraft={chatDraft}
          chatKnowledgeConsent={chatKnowledgeConsent}
          chatLoading={chatLoading}
          chatMessages={chatMessages}
          chatSourceSharingConsent={chatSourceSharingConsent}
          chatStreamingText={chatStreamingText}
          chatWorkspace={chatWorkspace}
          createStudioChatCodeChange={createStudioChatCodeChange}
          createStudioConversation={createStudioConversation}
          deleteStudioConversation={deleteStudioConversation}
          error={error}
          knowledgeAutoRefresh={knowledgeAutoRefresh}
          selectStudioConversation={selectStudioConversation}
          sendStudioChatMessage={sendStudioChatMessage}
          setChatAIConsent={setChatAIConsent}
          setChatCodeChange={setChatCodeChange}
          setChatCodeChangeApplied={setChatCodeChangeApplied}
          setChatConversation={setChatConversation}
          setChatDraft={setChatDraft}
          setChatKnowledgeConsent={setChatKnowledgeConsent}
          setChatMessages={setChatMessages}
          setChatSourceSharingConsent={setChatSourceSharingConsent}
          setChatWorkspace={setChatWorkspace}
          studioConversations={studioConversations}
          workspaceProject={workspaceProject}
        />
      )}{" "}
      {gitDiffTarget && gitStatusWorkspace && (
        <GitDiffDialog
          aiConfigured={aiConfigured}
          codeReview={codeReview}
          codeReviewConsent={codeReviewConsent}
          codeReviewLoading={codeReviewLoading}
          createCodeReviewThread={createCodeReviewThread}
          error={error}
          gitDiffLoading={gitDiffLoading}
          gitDiffTarget={gitDiffTarget}
          replyToCodeReviewThread={replyToCodeReviewThread}
          reviewDraft={reviewDraft}
          reviewLine={reviewLine}
          reviewReplyDraft={reviewReplyDraft}
          reviewReplyThread={reviewReplyThread}
          reviewSaving={reviewSaving}
          reviewThreads={reviewThreads}
          reviewWorkspaceDiff={reviewWorkspaceDiff}
          setCodeReviewConsent={setCodeReviewConsent}
          setCodeReviewThreadResolved={setCodeReviewThreadResolved}
          setGitDiffTarget={setGitDiffTarget}
          setReviewDraft={setReviewDraft}
          setReviewLine={setReviewLine}
          setReviewReplyDraft={setReviewReplyDraft}
          setReviewReplyThread={setReviewReplyThread}
          setWorkspaceGitDiff={setWorkspaceGitDiff}
          workspaceGitDiff={workspaceGitDiff}
          workspaceProject={workspaceProject}
        />
      )}{" "}
      {changeWorkspace && (
        <ChangeHistoryDialog
          changeDiff={changeDiff}
          changeLoading={changeLoading}
          changeWorkspace={changeWorkspace}
          error={error}
          openWorkspaceChange={openWorkspaceChange}
          restoreApproval={restoreApproval}
          restoreWorkspaceChange={restoreWorkspaceChange}
          setChangeDiff={setChangeDiff}
          setChangeWorkspace={setChangeWorkspace}
          setRestoreApproval={setRestoreApproval}
          workspaceChanges={workspaceChanges}
          workspaceProject={workspaceProject}
        />
      )}
      {multiDeveloperWorkspace && (
        <MultiFileSuggestionDialog
          applyMultiFileSuggestion={applyMultiFileSuggestion}
          createMultiFileSuggestion={createMultiFileSuggestion}
          error={error}
          multiFileApplied={multiFileApplied}
          multiFileConsent={multiFileConsent}
          multiFileLoading={multiFileLoading}
          multiFilePaths={multiFilePaths}
          multiFileRequest={multiFileRequest}
          multiFileSuggestion={multiFileSuggestion}
          repairMode={repairMode}
          repairPathsDraft={repairPathsDraft}
          rerunAfterSandboxRepair={rerunAfterSandboxRepair}
          setMultiDeveloperWorkspace={setMultiDeveloperWorkspace}
          setMultiFileConsent={setMultiFileConsent}
          setMultiFileRequest={setMultiFileRequest}
          setMultiFileSuggestion={setMultiFileSuggestion}
          setRepairMode={setRepairMode}
          setRepairPathsDraft={setRepairPathsDraft}
          workspaceProject={workspaceProject}
        />
      )}
      {developerWorkspace && developerFile && (
        <DeveloperSuggestionDialog
          applyCodeSuggestion={applyCodeSuggestion}
          createCodeSuggestion={createCodeSuggestion}
          developerApplied={developerApplied}
          developerApplyApproval={developerApplyApproval}
          developerConsent={developerConsent}
          developerFile={developerFile}
          developerIsNewFile={developerIsNewFile}
          developerLoading={developerLoading}
          developerNewPath={developerNewPath}
          developerRequest={developerRequest}
          developerSuggestion={developerSuggestion}
          error={error}
          setDeveloperApplyApproval={setDeveloperApplyApproval}
          setDeveloperConsent={setDeveloperConsent}
          setDeveloperFile={setDeveloperFile}
          setDeveloperNewPath={setDeveloperNewPath}
          setDeveloperRequest={setDeveloperRequest}
          setDeveloperSuggestion={setDeveloperSuggestion}
          setDeveloperWorkspace={setDeveloperWorkspace}
        />
      )}
      {showPlanHistory && (
        <PlanHistoryDialog
          architectLoading={architectLoading}
          deleteSavedArchitecturePlan={deleteSavedArchitecturePlan}
          openSavedArchitecturePlan={openSavedArchitecturePlan}
          savedArchitecturePlans={savedArchitecturePlans}
          setShowPlanHistory={setShowPlanHistory}
        />
      )}
      {architectWorkspace && (
        <ArchitectPlanDialog
          architectConsent={architectConsent}
          architectLoading={architectLoading}
          architectPlan={architectPlan}
          architectRequest={architectRequest}
          architectSavedPlanId={architectSavedPlanId}
          createArchitecturePlan={createArchitecturePlan}
          error={error}
          saveArchitecturePlan={saveArchitecturePlan}
          setArchitectConsent={setArchitectConsent}
          setArchitectPlan={setArchitectPlan}
          setArchitectRequest={setArchitectRequest}
          setArchitectSavedPlanId={setArchitectSavedPlanId}
          setArchitectWorkspace={setArchitectWorkspace}
          workspaceProject={workspaceProject}
        />
      )}
      {analysisWorkspace && (
        <ProjectMapDialog
          analysisCompletedAt={analysisCompletedAt}
          analysisLoading={analysisLoading}
          analysisWorkspace={analysisWorkspace}
          error={error}
          inventoryLayout={inventoryLayout}
          loadWorkspaceAnalysis={loadWorkspaceAnalysis}
          setAnalysisWorkspace={setAnalysisWorkspace}
          setInventoryLayout={setInventoryLayout}
          setWorkspaceAnalysis={setWorkspaceAnalysis}
          workspaceAnalysis={workspaceAnalysis}
          workspaceProject={workspaceProject}
        />
      )}
      {testDiscoveryWorkspace && (
        <TestDiscoveryDialog
          analyzeSandboxFailure={analyzeSandboxFailure}
          beginSandboxRepair={beginSandboxRepair}
          buildExecution={buildExecution}
          buildExecutionLoading={buildExecutionLoading}
          buildExecutionTarget={buildExecutionTarget}
          buildExecutionWorkspaceId={buildExecutionWorkspaceId}
          createAITestPlan={createAITestPlan}
          deleteSavedAITestPlan={deleteSavedAITestPlan}
          error={error}
          openSavedAITestPlan={openSavedAITestPlan}
          pollWorkspaceBuildRun={pollWorkspaceBuildRun}
          pollWorkspaceTestRun={pollWorkspaceTestRun}
          runWorkspaceBuild={runWorkspaceBuild}
          runWorkspaceTest={runWorkspaceTest}
          sandboxErrorAnalysis={sandboxErrorAnalysis}
          sandboxErrorAnalysisLoading={sandboxErrorAnalysisLoading}
          saveAITestPlan={saveAITestPlan}
          savedTestPlans={savedTestPlans}
          setTestAIConsent={setTestAIConsent}
          setTestDiscovery={setTestDiscovery}
          setTestDiscoveryWorkspace={setTestDiscoveryWorkspace}
          setTestRequest={setTestRequest}
          testAIConsent={testAIConsent}
          testDiscovery={testDiscovery}
          testDiscoveryLoading={testDiscoveryLoading}
          testDiscoveryWorkspace={testDiscoveryWorkspace}
          testExecution={testExecution}
          testExecutionLoading={testExecutionLoading}
          testExecutionTarget={testExecutionTarget}
          testPlan={testPlan}
          testPlanLoading={testPlanLoading}
          testPlanSaveLoading={testPlanSaveLoading}
          testPlanSavedId={testPlanSavedId}
          testRequest={testRequest}
          workspaceProject={workspaceProject}
        />
      )}
      {fileWorkspace && (
        <div
          className="studio-ide-page studio-file-explorer"
          ref={workspaceExplorerRef}
          role="main"
          aria-labelledby="workspace-explorer-title"
          tabIndex={-1}
          onKeyDown={handleWorkspaceExplorerKeyDown}
        >
          <div className="modal-head">
            <div>
              <p className="eyebrow studio-explorer-eyebrow">
                <FolderTree size={14} /> Nexora Studio{" "}
                <span>İZOLE ÇALIŞMA ALANI</span>
              </p>
              <h2 id="workspace-explorer-title">
                <span>{workspaceProject?.name}</span>
                <code className="studio-explorer-branch">
                  {fileWorkspace.branchName}
                </code>
              </h2>
            </div>
            <button
              ref={workspaceExplorerCloseRef}
              type="button"
              className="icon-button"
              aria-label="Dosya gezginini kapat"
              onClick={closeWorkspaceFileExplorer}
            >
              <X size={19} />
            </button>
          </div>
          <p className="muted modal-sub studio-explorer-intro">
            Kod, AI sohbeti, arama, test ve sürüm hazırlığı aynı izole çalışma
            alanında.
          </p>
          <div
            className="studio-workbench-tools"
            role="toolbar"
            aria-label="Çalışma alanı araçları"
          >
            <div
              className="studio-workbench-group"
              role="group"
              aria-label="Dosyalar"
            >
              <span>Dosyalar</span>
              <button
                type="button"
                className="is-active"
                aria-label="Dosya gezginini aç"
                onClick={() => {
                  setFileContent(null);
                  setError("");
                }}
              >
                <FolderTree size={15} /> Dosyalar
              </button>
            </div>
            <div
              className="studio-workbench-group studio-ai-dock-toggle-group"
              role="group"
              aria-label="Yapay zekâ"
            >
              <span>Yapay zekâ</span>
              <button
                type="button"
                className={aiToolsViewOpen ? "is-active" : ""}
                aria-expanded={aiToolsViewOpen}
                aria-controls="studio-ai-tools-page"
                onClick={() => {
                  setAiToolsViewOpen((value) => !value);
                  setAiDockOpen(false);
                }}
              >
                <Sparkles size={15} /> AI araçları{" "}
                <ChevronRight
                  size={13}
                  className={aiToolsViewOpen ? "is-expanded" : ""}
                />
              </button>
            </div>
            <div
              className="studio-workbench-group"
              role="group"
              aria-label="İnceleme"
            >
              <span>İnceleme</span>
              <button
                type="button"
                title="Çoklu dosya seçimi"
                className={multiFileSelecting ? "is-active" : ""}
                onClick={() => {
                  setMultiFileSelecting((value) => !value);
                  setMultiFilePaths([]);
                }}
              >
                <FileCode size={15} />{" "}
                {multiFileSelecting ? "Seçimi kapat" : "Çoklu seç"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceSearchWorkspace(fileWorkspace);
                  setSourceSearchQuery("");
                  setSourceSearchResult(null);
                  setSelectedSourceMatches([]);
                  setSourceAnalysisResult(null);
                  setSourceAnalysisQuestion("");
                  setSourceAnalysisConsent(false);
                  setError("");
                }}
              >
                <Search size={15} /> Kod ara
              </button>
              <button
                type="button"
                disabled={analysisLoading}
                onClick={() => void loadWorkspaceAnalysis(fileWorkspace)}
              >
                <FolderTree size={15} /> Proje haritası
              </button>
              <button
                type="button"
                disabled={testDiscoveryLoading}
                onClick={() => void discoverWorkspaceTests(fileWorkspace)}
              >
                <Play size={15} /> Test ve build
              </button>
            </div>
            <div
              className="studio-workbench-group"
              role="group"
              aria-label="Sürüm"
            >
              <span>Sürüm</span>
              <button
                type="button"
                disabled={gitStatusLoading}
                onClick={() => void loadWorkspaceGitStatus(fileWorkspace)}
              >
                <GitBranch size={15} /> Durum
              </button>
              <button
                type="button"
                disabled={changeLoading}
                onClick={() => void loadWorkspaceChanges(fileWorkspace)}
              >
                <History size={15} /> Geçmiş
              </button>
            </div>
            <div
              className="studio-workbench-group"
              role="group"
              aria-label="Bilgi tabanı"
            >
              <span>Bilgi tabanı</span>
              <button
                type="button"
                className={knowledgeDrawerOpen ? "is-active" : ""}
                title="Proje bilgi tabanını aç"
                onClick={() => {
                  setKnowledgePanelExpanded(true);
                  setKnowledgeDrawerOpen(true);
                }}
              >
                <ShieldCheck size={15} /> Proje kaynakları
              </button>
            </div>
          </div>
          {error && <div className="alert">{error}</div>}
          <nav
            className="studio-vscode-activity-bar"
            aria-label="Çalışma alanı bölümleri"
          >
            <button
              type="button"
              className="active"
              title="Dosya gezgini"
              aria-label="Dosya gezgini"
              onClick={() => {
                setFileContent(null);
                setError("");
              }}
            >
              <FolderTree size={20} />
            </button>
            <button
              type="button"
              title="Kod ara"
              aria-label="Kod ara"
              onClick={() => {
                setSourceSearchWorkspace(fileWorkspace);
                setSourceSearchQuery("");
                setSourceSearchResult(null);
                setSelectedSourceMatches([]);
                setSourceAnalysisResult(null);
                setSourceAnalysisQuestion("");
                setSourceAnalysisConsent(false);
                setError("");
              }}
            >
              <Search size={19} />
            </button>
            <button
              type="button"
              title="Sürüm durumu"
              aria-label="Sürüm durumu"
              disabled={gitStatusLoading}
              onClick={() => void loadWorkspaceGitStatus(fileWorkspace)}
            >
              <GitBranch size={19} />
            </button>
            <button
              type="button"
              title="Değişiklik geçmişi"
              aria-label="Değişiklik geçmişi"
              disabled={changeLoading}
              onClick={() => void loadWorkspaceChanges(fileWorkspace)}
            >
              <History size={19} />
            </button>
            <span className="activity-spacer" />
            <ShieldCheck size={18} />
          </nav>
          <aside
            className="studio-vscode-explorer-sidebar"
            aria-label="Proje dosyaları"
          >
            <div className="studio-vscode-explorer-heading">
              <div>
                <span>DOSYA GEZGİNİ</span>
                <b>Dosyalar</b>
              </div>
              <div className="studio-vscode-explorer-actions">
                {workspaceProject?.accessLevel !== "Viewer" && (
                  <button
                    type="button"
                    title="Açık klasörde yeni dosya oluştur"
                    aria-label="Yeni dosya oluştur"
                    onClick={() => startManualNewFile(fileWorkspace)}
                  >
                    <Plus size={14} />
                    <span>Yeni dosya</span>
                  </button>
                )}
                {moduleStarterId &&
                  moduleWorkspaceCode &&
                  workspaceProject?.accessLevel !== "Viewer" && (
                    <button
                      type="button"
                      title="Onayınızla modül şablonundaki yeni dosyaları izole çalışma alanına ekle"
                      disabled={moduleFilesLoading}
                      onClick={() => void loadModuleStarterIntoWorkspace()}
                    >
                      <FileCode size={14} />
                      <span>
                        {moduleFilesLoading ? "Ekleniyor…" : "Modül şablonu"}
                      </span>
                    </button>
                  )}
                <small>{visibleWorkspaceEntries.length}</small>
              </div>
            </div>
            <div className="studio-vscode-tree-search">
              <Search size={14} />
              <input
                aria-label={
                  moduleWorkspaceCode
                    ? "Modül dosyalarında ara"
                    : "Tüm çalışma alanında dosya ara"
                }
                value={workspaceFileFilter}
                onChange={(e) => setWorkspaceFileFilter(e.target.value)}
                placeholder={
                  moduleWorkspaceCode
                    ? "Modül dosyalarında ara…"
                    : "Tüm dosyalarda ara…"
                }
              />
            </div>
            {workspaceFileFilter.trim() && (
              <small className="studio-vscode-search-status">
                {workspaceFileSearchLoading
                  ? moduleWorkspaceCode
                    ? "Modül alanı aranıyor…"
                    : "Tüm çalışma alanı aranıyor…"
                  : workspaceFileSearchResult
                    ? `${workspaceFileSearchResult.entries.length} eşleşme · ${workspaceFileSearchResult.scannedEntries.toLocaleString("tr-TR")} öğe tarandı${workspaceFileSearchResult.truncated ? " · sonuç sınırına ulaşıldı" : ""}`
                    : "Arama bekleniyor…"}
              </small>
            )}
            {filePath && (
              <button
                type="button"
                className="studio-vscode-parent-item"
                disabled={fileLoading || manualFileEditing}
                onClick={() =>
                  void loadWorkspaceFiles(
                    fileWorkspace,
                    filePath.split("/").slice(0, -1).join("/"),
                  )
                }
              >
                <ChevronRight size={13} /> Üst klasör
              </button>
            )}
            <nav className="studio-vscode-tree">
              {visibleWorkspaceEntries.map((entry) => (
                <div
                  className={
                    "studio-vscode-tree-row " + entry.kind.toLowerCase()
                  }
                  key={entry.path}
                >
                  {entry.kind === "File" &&
                    workspaceProject?.accessLevel !== "Viewer" &&
                    /\.(cs|csx|razor|ts|tsx|js|jsx|html|css|scss|sql|py|go|rs|java|md|json|xml|yml|yaml)$/i.test(
                      entry.path,
                    ) && (
                      <input
                        className="studio-knowledge-source-checkbox"
                        type="checkbox"
                        title="Proje bilgi tabanına ekle"
                        aria-label={`${entry.path} dosyasını AI bilgi tabanına ekle`}
                        checked={knowledgePaths.includes(entry.path)}
                        onChange={(e) =>
                          setKnowledgePaths((current) =>
                            e.target.checked
                              ? [...current, entry.path]
                              : current.filter((path) => path !== entry.path),
                          )
                        }
                      />
                    )}
                  {entry.kind === "File" && multiFileSelecting && (
                    <input
                      type="checkbox"
                      title="AI önerisine dahil et"
                      aria-label={`${entry.path} dosyasını AI önerisine ekle`}
                      checked={multiFilePaths.includes(entry.path)}
                      disabled={
                        !/\.(cs|csx|razor|ts|tsx|js|jsx|html|css|scss|sql|py|go|rs|java)$/i.test(
                          entry.path,
                        ) ||
                        (!multiFilePaths.includes(entry.path) &&
                          multiFilePaths.length >= 5)
                      }
                      onChange={(e) =>
                        setMultiFilePaths((current) =>
                          e.target.checked
                            ? [...current, entry.path]
                            : current.filter((path) => path !== entry.path),
                        )
                      }
                    />
                  )}
                  <button
                    type="button"
                    title={entry.path}
                    disabled={
                      fileLoading || manualFileEditing || entry.kind === "Link"
                    }
                    className={
                      "studio-vscode-tree-item " +
                      entry.kind.toLowerCase() +
                      (fileContent?.path === entry.path ? " is-active" : "")
                    }
                    onClick={() =>
                      entry.kind === "Directory"
                        ? void loadWorkspaceFiles(fileWorkspace, entry.path)
                        : entry.kind === "File"
                          ? void loadWorkspaceFile(fileWorkspace, entry.path)
                          : undefined
                    }
                  >
                    {entry.kind === "Directory" ? (
                      <Folder size={14} />
                    ) : (
                      <FileCode size={14} />
                    )}
                    <span>
                      {entry.name}
                      {workspaceFileFilter.trim() && (
                        <small className="studio-vscode-tree-match-path">
                          {entry.path}
                        </small>
                      )}
                    </span>
                    {entry.kind === "Directory" && (
                      <ChevronRight size={12} className="tree-chevron" />
                    )}
                  </button>
                </div>
              ))}
              {visibleWorkspaceEntries.length === 0 && (
                <div className="studio-vscode-tree-empty">
                  {workspaceFileFilter.trim()
                    ? workspaceFileSearchLoading
                      ? moduleWorkspaceCode
                        ? "Modül alanı aranıyor…"
                        : "Tüm çalışma alanı aranıyor…"
                      : "Eşleşme bulunamadı"
                    : fileLoading
                      ? "Klasör yükleniyor…"
                      : moduleWorkspacePath
                        ? `Modül klasörü henüz oluşturulmadı. Yeni dosya, ${moduleWorkspacePath}/src/lib.rs yolunda açılır.`
                        : "Klasör boş"}
                </div>
              )}
            </nav>
            {moduleTemplateFiles.length > 0 &&
              (filePath === "" || filePath === moduleWorkspacePath) && (
                <section className="studio-module-source-loader">
                  <div className="studio-module-source-loader-icon">
                    <Code2 size={16} />
                  </div>
                  <b>{moduleDisplayNameForWorkspace(fileWorkspace)}</b>
                  <p>
                    Başlangıç kodlarını modül klasörüne ekleyip dosya gezgininde
                    açın.
                  </p>
                  <button
                    type="button"
                    className="ns-btn ns-btn-sm small-button"
                    disabled={
                      moduleFilesLoading ||
                      fileLoading ||
                      manualFileEditing ||
                      workspaceProject?.accessLevel === "Viewer"
                    }
                    onClick={() => void loadModuleStarterIntoWorkspace()}
                  >
                    {moduleFilesLoading
                      ? "Modül dosyaları yükleniyor…"
                      : "Modül dosyalarını yükle"}
                    <ArrowUpRight size={13} />
                  </button>
                </section>
              )}
            <div className="studio-vscode-tree-footer">
              <ShieldCheck size={13} />
              <span>
                {manualFileEditing
                  ? "Düzenleme açık · gezinme kaydetme sonrası etkin"
                  : "İzole çalışma alanı"}
              </span>
            </div>
          </aside>
          <main className="studio-vscode-main">
            <div className="studio-vscode-tab-strip">
              <div
                className={
                  aiToolsViewOpen
                    ? "studio-vscode-tab"
                    : "studio-vscode-tab is-active"
                }
              >
                <Code2 size={14} />
                <span>
                  {fileContent
                    ? manualFileCreating
                      ? manualFilePath.split("/").pop()
                      : fileContent.path.split("/").pop()
                    : "Başlangıç"}
                </span>
                {fileContent && (
                  <button
                    type="button"
                    title="Sekmeyi kapat"
                    aria-label="Dosya sekmesini kapat"
                    onClick={async () => {
                      if (
                        manualFileEditing &&
                        !(await confirmDialog({ title: "Sekme kaydetmeden kapatılsın mı?", message: "Kaydedilmemiş düzenlemeyi kapatmak istiyor musunuz?", tone: "warning", confirmLabel: "Kaydetmeden kapat" }))
                      )
                        return;
                      setManualFileEditing(false);
                      setFileContent(null);
                      updateWorkspaceRoute(
                        workspaceProject!.id,
                        fileWorkspace!.id,
                        filePath,
                      );
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {aiToolsViewOpen && (
                <div className="studio-vscode-tab is-active studio-ai-tools-tab">
                  <Sparkles size={14} />
                  <span>Yapay zekâ araçları</span>
                  <button
                    type="button"
                    title="Sekmeyi kapat"
                    aria-label="AI araçları sekmesini kapat"
                    onClick={() => setAiToolsViewOpen(false)}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="studio-vscode-tab-spacer" />
              <span className="studio-vscode-tab-branch">
                {fileWorkspace.workspaceBranchName ?? fileWorkspace.branchName}
              </span>
            </div>
            {aiToolsViewOpen && (
              <section
                id="studio-ai-tools-page"
                className="studio-ai-tools-page"
                aria-label="Yapay zekâ araçları"
              >
                <div className="studio-ai-tools-layout">
                  <div className="studio-ai-tools-main">
                    <header className="studio-ai-tools-hero">
                      <div className="studio-ai-tools-hero-copy">
                        <span>STUDIO AI</span>
                        <h1>Yapay zekâ araçları</h1>
                        <p>
                          Geliştirme sürecinizi hızlandırın. Kod üretin, analiz
                          edin, iyileştirin ve teknik içerikler hazırlayın.
                        </p>
                        <div className="studio-ai-tools-hero-actions">
                          <button
                            type="button"
                            className="ns-btn ns-btn-primary"
                            onClick={() => {
                              setAiToolsViewOpen(false);
                              startNewCodeSuggestion(fileWorkspace);
                            }}
                            disabled={!canEditWorkspace}
                          >
                            <Sparkles size={15} /> Hızlı başlangıç
                          </button>
                          <button
                            type="button"
                            className="ns-btn"
                            onClick={() =>
                              document
                                .getElementById("studio-ai-tool-list")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                })
                            }
                          >
                            <Play size={14} /> Araçları keşfet
                          </button>
                        </div>
                      </div>
                      <div
                        className="studio-ai-tools-hero-art"
                        aria-hidden="true"
                      >
                        <div className="studio-ai-tools-art-glow" />
                        <div className="studio-ai-tools-art-card">
                          <Code2 size={42} />
                        </div>
                        <Sparkles
                          className="studio-ai-tools-art-sparkle"
                          size={25}
                        />
                      </div>
                    </header>
                    <div className="studio-ai-tools-filter-bar">
                      <div
                        className="studio-ai-tools-categories"
                        role="group"
                        aria-label="Araç kategorileri"
                      >
                        {aiToolCategories.map((category) => (
                          <button
                            type="button"
                            key={category}
                            className={
                              aiToolsCategory === category ? "is-active" : ""
                            }
                            aria-pressed={aiToolsCategory === category}
                            onClick={() => setAiToolsCategory(category)}
                          >
                            {category === "Tümü" && <Sparkles size={13} />}{" "}
                            {category}
                          </button>
                        ))}
                      </div>
                      <label className="studio-ai-tools-search">
                        <Search size={15} />
                        <input
                          type="search"
                          aria-label="Araçlarda ara"
                          placeholder="Araçlarda ara…"
                          value={aiToolsQuery}
                          onChange={(event) =>
                            setAiToolsQuery(event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <section
                      id="studio-ai-tool-list"
                      className="studio-ai-tools-catalog"
                    >
                      <header className="studio-ai-tools-catalog-heading">
                        <h2>
                          <Sparkles size={17} /> Öne çıkan araçlar
                        </h2>
                        <span>{filteredAiToolCards.length} araç</span>
                      </header>
                      {filteredAiToolCards.length > 0 ? (
                        <div className="studio-ai-tools-grid">
                          {filteredAiToolCards.map((card) => {
                            const Icon = card.icon;
                            return (
                              <article
                                className="studio-ai-tool-card"
                                key={card.id}
                              >
                                <div className="studio-ai-tool-card-heading">
                                  <span className="studio-ai-tool-icon">
                                    <Icon size={20} />
                                  </span>
                                  <div>
                                    <h3>{card.title}</h3>
                                    <p>{card.description}</p>
                                  </div>
                                  {card.id === "file" && (
                                    <span className="studio-ai-tool-badge">
                                      Önerilen
                                    </span>
                                  )}
                                </div>
                                <div className="studio-ai-tool-tags">
                                  {card.tags.map((tag) => (
                                    <span key={tag}>{tag}</span>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="studio-ai-tool-run"
                                  disabled={card.disabled}
                                  title={
                                    card.disabled
                                      ? card.id === "docs"
                                        ? "Önce izole çalışma dalı oluşturun"
                                        : card.id === "improve"
                                          ? "Düzenlenebilir bir kaynak dosya açın"
                                          : "Bu işlem için düzenleme yetkisi gerekir"
                                      : undefined
                                  }
                                  onClick={card.action}
                                >
                                  Çalıştır <ArrowUpRight size={14} />
                                </button>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="studio-ai-tools-empty">
                          <Search size={22} />
                          <b>Eşleşen araç yok</b>
                          <span>
                            Arama ifadesini veya kategori seçimini değiştirin.
                          </span>
                        </div>
                      )}
                    </section>
                  </div>
                  <aside className="studio-ai-tools-sidebar">
                    <section className="studio-ai-tools-status-card">
                      <div className="studio-ai-tools-status-title">
                        <span>
                          <Sparkles size={17} />
                        </span>
                        <div>
                          <h2>Kullanım durumu</h2>
                          <p>Bu çalışma alanındaki AI araçları</p>
                        </div>
                      </div>
                      <div className="studio-ai-tools-status-row">
                        <b>AI hizmeti</b>
                        <span
                          className={
                            aiConfigured === true
                              ? "is-ready"
                              : aiConfigured === false
                                ? "is-unavailable"
                                : ""
                          }
                        >
                          <i />
                          {aiConfigured === null
                            ? "Kontrol ediliyor"
                            : aiConfigured
                              ? "Bağlı"
                              : "Yapılandırılmadı"}
                        </span>
                      </div>
                      <div className="studio-ai-tools-status-detail">
                        {workspaceProject?.name && (
                          <div>
                            <span>Proje</span>
                            <b>{workspaceProject.name}</b>
                          </div>
                        )}
                        <div>
                          <span>Çalışma dalı</span>
                          <b>
                            {fileWorkspace.workspaceBranchName ??
                              fileWorkspace.branchName}
                          </b>
                        </div>
                        <div>
                          <span>Erişim</span>
                          <b>
                            {workspaceProject?.accessLevel === "Viewer"
                              ? "Salt okunur"
                              : "İzole çalışma alanı"}
                          </b>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="studio-ai-tools-manage"
                        onClick={() => {
                          setAiToolsViewOpen(false);
                          setAiDockOpen(true);
                        }}
                      >
                        <Sparkles size={15} /> Araçları yönet
                      </button>
                    </section>
                    <section className="studio-ai-tools-safety-card">
                      <div>
                        <ShieldCheck size={18} />
                        <h2>Kontrollü çalışma</h2>
                      </div>
                      <p>
                        AI çıktıları önce taslak olarak gösterilir. Dosya
                        değişikliği için inceleme ve ayrıca onay gerekir.
                      </p>
                      <ul>
                        <li>
                          <ShieldCheck size={14} /> İzole çalışma alanı
                        </li>
                        <li>
                          <ShieldCheck size={14} /> Değişiklikleri gözden geçir
                        </li>
                        <li>
                          <ShieldCheck size={14} /> Onaysız yazma yok
                        </li>
                      </ul>
                    </section>
                  </aside>
                </div>
              </section>
            )}
            <div className="panel-heading studio-explorer-location">
              <div className="studio-explorer-path">
                <span className="studio-explorer-kicker">
                  {fileContent ? "DOSYA" : "ÇALIŞMA ALANI"}
                </span>
                <b>
                  {fileContent
                    ? manualFileCreating
                      ? manualFilePath
                      : fileContent.path
                    : filePath
                      ? "/" + filePath
                      : "/ Proje kökü"}
                </b>
                <small>
                  {fileContent
                    ? fileContent.sizeBytes.toLocaleString("tr-TR") + " bayt"
                    : fileLoading
                      ? "Klasör okunuyor…"
                      : (fileListing?.entries.length ?? 0) + " kayıt"}
                </small>
              </div>
              {fileContent ? (
                <div className="studio-explorer-file-actions">
                  {!manualFileEditing &&
                    workspaceProject?.accessLevel !== "Viewer" &&
                    /\.(cs|csx|razor|ts|tsx|js|jsx|html|css|scss|sql|py|go|rs|java)$/i.test(
                      fileContent.path,
                    ) && (
                      <>
                        <button
                          className="ns-btn ns-btn-sm small-button"
                          onClick={startManualFileEdit}
                        >
                          Elle düzenle
                        </button>
                        <button
                          className="ns-btn ns-btn-sm small-button"
                          onClick={startCodeSuggestion}
                        >
                          AI önerisi
                        </button>
                      </>
                    )}
                  {manualFileEditing && (
                    <button
                      type="button"
                      className="ns-btn ns-btn-sm small-button"
                      disabled={manualFileSaving}
                      onClick={cancelManualFileEdit}
                    >
                      Düzenlemeyi iptal et
                    </button>
                  )}
                  <button
                    className="ns-btn ns-btn-sm small-button"
                    disabled={manualFileEditing || manualFileSaving}
                    onClick={() => setFileContent(null)}
                  >
                    Sekmeyi kapat
                  </button>
                </div>
              ) : (
                filePath && (
                  <button
                    className="ns-btn ns-btn-sm small-button"
                    disabled={fileLoading}
                    onClick={() =>
                      void loadWorkspaceFiles(
                        fileWorkspace,
                        filePath.split("/").slice(0, -1).join("/"),
                      )
                    }
                  >
                    Üst klasör
                  </button>
                )
              )}
            </div>
            {fileContent ? (
              manualFileEditing ? (
                <div className="studio-manual-editor">
                  {manualFileCreating && (
                    <label>
                      Dosya yolu
                      <input
                        value={manualFilePath}
                        onChange={(e) => setManualFilePath(e.target.value)}
                        maxLength={500}
                        required
                        placeholder="src/components/NewComponent.tsx"
                      />
                    </label>
                  )}
                  <WorkspaceCodeEditor
                    path={
                      manualFileCreating
                        ? manualFilePath
                        : (fileContent?.path ?? "")
                    }
                    value={manualFileContent}
                    dirty={
                      manualFileCreating
                        ? manualFileContent.length > 0 ||
                          manualFilePath !== (fileContent?.path ?? "")
                        : manualFileContent !== fileContent?.content
                    }
                    onChange={setManualFileContent}
                    saving={manualFileSaving}
                    onSave={(value) => void saveManualFile(value)}
                  />
                  <small
                    id="manual-editor-help"
                    className="studio-editor-shortcuts"
                  >
                    Tab girintiler. Ctrl+S (Mac: ⌘S) kaydetme onayını açar.
                  </small>
                  <div className="studio-manual-editor-footer">
                    <span>
                      {new TextEncoder()
                        .encode(manualFileContent)
                        .length.toLocaleString("tr-TR")}{" "}
                      /{" "}
                      {(manualFileCreating
                        ? 128 * 1024
                        : maxManualWorkspaceFileBytes
                      ).toLocaleString("tr-TR")}{" "}
                      bayt · UTF-8
                    </span>
                    <span className="studio-editor-approval-note">
                      Kaydetme onay penceresiyle kaydedilir.
                    </span>
                  </div>
                  <div className="boundary-note">
                    <ShieldCheck size={17} />
                    <span>
                      <b>İnsan onayı gerekli</b>Kaydetmeden önce değişikliği
                      gözden geçirin. Kod çalıştırılmaz.
                    </span>
                  </div>
                </div>
              ) : (
                <WorkspaceCodeEditor
                  path={fileContent.path}
                  value={fileContent.content}
                  readOnly
                />
              )
            ) : fileLoading ? (
              <div className="studio-vscode-welcome is-loading">
                <div className="studio-vscode-spinner" />
                <b>Çalışma alanı dosyaları yükleniyor…</b>
              </div>
            ) : (
              <section className="studio-vscode-welcome">
                <div className="studio-welcome-hero">
                  <div className="studio-welcome-copy">
                    <p className="studio-vscode-welcome-eyebrow">
                      ÇALIŞMA ALANI
                    </p>
                    <h1>
                      Merhaba, <span>{workspaceProject?.name}</span>
                    </h1>
                    <p>
                      Başlamak için soldaki gezginden bir dosya seçin.
                      <br />
                      Dosyalar izole çalışma alanınızda açılır.
                    </p>
                    {workspaceProject?.accessLevel !== "Viewer" && (
                      <div className="studio-vscode-welcome-actions">
                        <button
                          type="button"
                          onClick={() => startNewCodeSuggestion(fileWorkspace)}
                        >
                          <Sparkles size={18} /> AI ile dosya oluştur
                        </button>
                        <button
                          type="button"
                          onClick={() => startUiDesigner(fileWorkspace)}
                        >
                          <Code2 size={18} /> Ekran tasarla
                        </button>
                      </div>
                    )}
                  </div>
                  <img
                    className="studio-welcome-illustration"
                    src={
                      new URL("./assets/studio-workspace.svg", import.meta.url)
                        .href
                    }
                    alt=""
                    aria-hidden="true"
                  />
                </div>
                <div className="studio-welcome-quick">
                  <h2>Hızlı eylemler</h2>
                  <div className="studio-welcome-quick-grid">
                    <button type="button" onClick={closeWorkspaceFileExplorer}>
                      <span className="studio-quick-icon gold">
                        <Folder size={23} />
                      </span>
                      <span>
                        <b>Projelere dön</b>
                        <small>Proje listesine dön</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={gitStatusLoading}
                      onClick={() => void loadWorkspaceGitStatus(fileWorkspace)}
                    >
                      <span className="studio-quick-icon violet">
                        <GitBranch size={23} />
                      </span>
                      <span>
                        <b>Git durumu</b>
                        <small>Değişiklikleri incele</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={testDiscoveryLoading}
                      onClick={() => void discoverWorkspaceTests(fileWorkspace)}
                    >
                      <span className="studio-quick-icon green">
                        <Play size={23} />
                      </span>
                      <span>
                        <b>Test ve build</b>
                        <small>Testleri ve derlemeyi aç</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={analysisLoading}
                      onClick={() => void loadWorkspaceAnalysis(fileWorkspace)}
                    >
                      <span className="studio-quick-icon blue">
                        <FolderTree size={23} />
                      </span>
                      <span>
                        <b>Proje haritası</b>
                        <small>Yapıyı görselleştir</small>
                      </span>
                    </button>
                  </div>
                </div>
                <div className="studio-vscode-welcome-shortcuts">
                  <span>
                    <kbd>Ctrl + P</kbd>
                    <small>Dosya ara</small>
                  </span>
                  <span>
                    <kbd>Ctrl + Shift + F</kbd>
                    <small>Kod içinde ara</small>
                  </span>
                  <span>
                    <kbd>Ctrl + S</kbd>
                    <small>Onayla kaydet</small>
                  </span>
                </div>
              </section>
            )}
            {multiFileSelecting && (
              <div className="studio-vscode-multi-footer">
                <span>{multiFilePaths.length}/5 kaynak dosya seçildi</span>
                <button
                  type="button"
                  className="ns-btn ns-btn-primary"
                  disabled={
                    multiFilePaths.length < 2 || multiFilePaths.length > 5
                  }
                  onClick={() => startMultiFileSuggestion(fileWorkspace)}
                >
                  Çoklu AI önerisi hazırla
                </button>
              </div>
            )}
            <div className="studio-vscode-statusbar">
              <span>
                <GitBranch size={12} />
                {fileWorkspace.workspaceBranchName ?? fileWorkspace.branchName}
              </span>
              <span>
                {fileContent
                  ? manualFileCreating
                    ? "Yeni dosya"
                    : "UTF-8"
                  : filePath
                    ? "/" + filePath
                    : "Hazır"}
              </span>
              <span title="Yazma yalnız izinli kaynak dosyalarına açık onayla uygulanır. Git iç dizini gizlenir, sembolik bağlantılar izlenmez ve kod çalıştırılmaz.">
                {workspaceProject?.accessLevel === "Viewer"
                  ? "Salt okunur"
                  : "İzole çalışma alanı · Onaylı yazma"}
              </span>
            </div>
            {aiDockOpen && (
              <aside
                id="studio-ai-dock"
                className="studio-ai-dock"
                aria-label="Yapay zekâ araçları"
              >
                <header className="studio-ai-dock-header">
                  <div>
                    <span>STUDIO AI</span>
                    <b>Yapay zekâ araçları</b>
                    <small>
                      {workspaceProject?.name} ·{" "}
                      {fileWorkspace.workspaceBranchName ??
                        fileWorkspace.branchName}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Yapay zekâ panelini kapat"
                    onClick={() => setAiDockOpen(false)}
                  >
                    <X size={17} />
                  </button>
                </header>
                <section className="studio-ai-dock-section">
                  <p>ÜRETİM</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAiDockOpen(false);
                      startNewCodeSuggestion(fileWorkspace);
                    }}
                  >
                    <Sparkles size={16} />
                    <span>
                      <b>AI dosya oluştur</b>
                      <small>Yeni bir kaynak dosya için öneri hazırla</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiDockOpen(false);
                      startUiDesigner(fileWorkspace);
                    }}
                  >
                    <Code2 size={16} />
                    <span>
                      <b>UI tasarla</b>
                      <small>Yeni bir ekran taslağı oluştur</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </section>
                <section className="studio-ai-dock-section">
                  <p>ASİSTANLAR</p>
                  <button
                    type="button"
                    disabled={!fileWorkspace.workspaceBranchName}
                    title={
                      !fileWorkspace.workspaceBranchName
                        ? "Önce izole çalışma dalı oluşturulmalı"
                        : "AI sohbetini aç"
                    }
                    onClick={() => {
                      setAiDockOpen(false);
                      void openStudioChat(fileWorkspace);
                    }}
                  >
                    <MessageCircle size={16} />
                    <span>
                      <b>AI sohbet</b>
                      <small>Çalışma alanı hakkında konuş</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  <div className="studio-ai-dock-database">
                    <DatabaseEngineer
                      token={token}
                      projectId={workspaceProject!.id}
                      projectName={workspaceProject!.name}
                      requestId={fileWorkspace.id}
                      workspaceName={
                        fileWorkspace.workspaceBranchName ??
                        fileWorkspace.branchName
                      }
                      disabled={workspaceProject?.accessLevel === "Viewer"}
                    />
                    <small>Veritabanı şeması için mühendis asistanı</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAiDockOpen(false);
                      setArchitectWorkspace(fileWorkspace);
                      setArchitectPlan(null);
                      setArchitectRequest(
                        linkedDevelopmentContext(
                          fileWorkspace.developmentRequestTitle,
                          fileWorkspace.developmentRequestDescription,
                        ),
                      );
                      setArchitectConsent(false);
                      setError("");
                    }}
                  >
                    <Sparkles size={16} />
                    <span>
                      <b>AI Mimar</b>
                      <small>Teknik plan ve etki alanı çıkar</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </section>
                <div className="studio-ai-dock-note">
                  <ShieldCheck size={15} />
                  <span>
                    AI önerileri taslak olarak açılır; çalışma alanına yazmak
                    için ayrıca onay gerekir.
                  </span>
                </div>
              </aside>
            )}
          </main>
          {knowledgeDrawerOpen && (
            <div
              className="studio-knowledge-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setKnowledgeDrawerOpen(false);
              }}
            >
              <section
                className="panel studio-knowledge-panel"
                role="dialog"
                aria-modal="true"
                aria-label="Proje bilgi tabanı"
              >
                <button
                  type="button"
                  className="studio-knowledge-close icon-button"
                  aria-label="Proje bilgi tabanını kapat"
                  onClick={() => setKnowledgeDrawerOpen(false)}
                >
                  <X size={18} />
                </button>
                <button
                  type="button"
                  className="studio-knowledge-heading"
                  aria-expanded={knowledgePanelExpanded}
                  onClick={() => setKnowledgePanelExpanded((value) => !value)}
                >
                  <span>
                    <b>Proje bilgi tabanı</b>
                    <small>
                      {knowledgeDocs.length} güncel dosya · tenant ve workspace
                      kapsamında
                    </small>
                  </span>
                  <span className="studio-knowledge-state">
                    {knowledgeAutoRefresh.allFiles ? "Erişim açık" : "Ayarlar"}
                  </span>
                  <ChevronDown
                    size={15}
                    className={knowledgePanelExpanded ? "is-expanded" : ""}
                  />
                </button>
                {knowledgePanelExpanded && (
                  <div className="studio-knowledge-content">
                    {workspaceProject?.accessLevel !== "Viewer" &&
                      !knowledgeAutoRefresh.allFiles && (
                        <div
                          className="modal-foot"
                          style={{ justifyContent: "flex-start" }}
                        >
                          <button
                            type="button"
                            className="ns-btn ns-btn-sm small-button"
                            disabled={knowledgeLoading}
                            onClick={() => void enableKnowledgeAutoRefreshAll()}
                          >
                            {knowledgeLoading
                              ? "Açılıyor…"
                              : "Tüm proje kaynaklarına kalıcı AI erişimi ver"}
                          </button>
                          <span>
                            Bir kez açılır; ilgili kaynak kodu her sohbette
                            aranır ve eşleşmeler otomatik gönderilir.
                          </span>
                        </div>
                      )}
                    {knowledgeAutoRefresh.enabled && (
                      <div className="boundary-note" style={{ marginTop: 10 }}>
                        <ShieldCheck size={17} />
                        <span>
                          <b>
                            {knowledgeAutoRefresh.allFiles
                              ? "Tüm proje kaynakları için kalıcı AI erişimi açık"
                              : "Otomatik yenileme açık"}
                          </b>{" "}
                          {knowledgeAutoRefresh.allFiles
                            ? "Her sohbette desteklenen kaynak kodunda ilgili arama yapılır; güvenli eşleşmeler tenant’ın seçili AI sağlayıcısına otomatik gönderilir. ERP kayıtları ve olası sır dosyaları kapsama dahil değildir."
                            : `Yalnızca onayladığınız dosyalar (${knowledgeAutoRefresh.paths.join(", ")}) sohbet öncesinde otomatik yenilenir; sohbetlerde kullanmak için mesaj bazlı onay gerekir.`}
                          {knowledgeAutoRefresh.lastRefreshedAt && (
                            <small>
                              {" "}
                              {knowledgeAutoRefresh.allFiles
                                ? "İzin verildi"
                                : "Son yenileme"}
                              :{" "}
                              {new Date(
                                knowledgeAutoRefresh.lastRefreshedAt,
                              ).toLocaleString("tr-TR")}
                            </small>
                          )}
                        </span>
                        {workspaceProject?.accessLevel !== "Viewer" && (
                          <button
                            type="button"
                            className="ns-btn ns-btn-sm small-button"
                            disabled={knowledgeLoading}
                            onClick={() => void revokeKnowledgeAutoRefresh()}
                          >
                            İzni kaldır
                          </button>
                        )}
                      </div>
                    )}
                    {knowledgeHistoryCandidates.length > 0 && (
                      <div className="requests-list" style={{ marginTop: 10 }}>
                        <div className="panel-heading">
                          <div>
                            <b>Onaylanmış geliştirme geçmişi</b>
                            <small>
                              Bağımsız inceleme ve tamamlanmış test içeren sürüm
                              adayları · en çok 10 kayıt seçin
                            </small>
                          </div>
                        </div>
                        {knowledgeHistoryCandidates.map((item) => (
                          <article className="request-row" key={item.id}>
                            <input
                              type="checkbox"
                              aria-label={`${item.branchName} ${item.commitSha.slice(0, 12)} onaylı geçmiş kaydını bilgi tabanına ekle`}
                              checked={knowledgeHistoryIds.includes(item.id)}
                              disabled={
                                !knowledgeHistoryIds.includes(item.id) &&
                                knowledgeHistoryIds.length >= 10
                              }
                              onChange={(e) =>
                                setKnowledgeHistoryIds((current) =>
                                  e.target.checked
                                    ? [...current, item.id]
                                    : current.filter((id) => id !== item.id),
                                )
                              }
                            />
                            <div className="request-info">
                              <b>
                                {item.developmentRequestTitle ||
                                  item.branchName}
                              </b>
                              <small>
                                {item.branchName} ·{" "}
                                {item.commitSha.slice(0, 12)} · test:{" "}
                                {item.testTargetPath}
                              </small>
                              <small>
                                Onay:{" "}
                                {new Date(item.approvedAt).toLocaleString(
                                  "tr-TR",
                                )}{" "}
                                · test:{" "}
                                {new Date(item.testCompletedAt).toLocaleString(
                                  "tr-TR",
                                )}
                              </small>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                    {knowledgeDocs.map((doc) => (
                      <article className="request-row" key={doc.id}>
                        <div className="request-info">
                          <b>{doc.path}</b>
                          <small>
                            {doc.characterCount.toLocaleString("tr-TR")}{" "}
                            karakter · {doc.contentSha256.slice(0, 12)} ·{" "}
                            {new Date(doc.indexedAt).toLocaleString("tr-TR")}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="ns-btn ns-btn-sm small-button"
                          onClick={() => void deleteKnowledgeDocument(doc)}
                        >
                          Sil
                        </button>
                      </article>
                    ))}
                    {knowledgePaths.length > 0 &&
                      workspaceProject?.accessLevel !== "Viewer" &&
                      !knowledgeAutoRefresh.allFiles && (
                        <label
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 9,
                            marginTop: 12,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={enableKnowledgeAutoRefresh}
                            onChange={(e) =>
                              setEnableKnowledgeAutoRefresh(e.target.checked)
                            }
                            style={{ width: 16, marginTop: 3 }}
                          />
                          <span>
                            Seçtiğim dosyaları sohbet öncesinde otomatik yenile.
                            Bu izin yalnızca bu dosyaları kapsar; sohbetlerde
                            bilgi tabanını kullanma ve AI paylaşım onayı ayrıca
                            istenir.
                          </span>
                        </label>
                      )}
                    {(knowledgePaths.length > 0 ||
                      knowledgeHistoryIds.length > 0) && (
                      <div className="modal-foot">
                        <span>
                          {knowledgePaths.length} dosya +{" "}
                          {knowledgeHistoryIds.length} geçmiş kaydı seçildi ·
                          toplam en çok 50 kaynak
                        </span>
                        <button
                          type="button"
                          className="ns-btn ns-btn-primary"
                          disabled={
                            knowledgeLoading ||
                            knowledgePaths.length + knowledgeHistoryIds.length >
                              50
                          }
                          onClick={() => void indexSelectedKnowledge()}
                        >
                          {knowledgeLoading
                            ? "İndeksleniyor…"
                            : "Seçilen kaynakları bilgi tabanına ekle"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
          {!workspaceFileFilter.trim() &&
            fileListing?.nextOffset !== null &&
            fileListing?.nextOffset !== undefined && (
              <div className="modal-foot">
                <span>Daha fazla dosya var</span>
                <button
                  className="ns-btn ns-btn-sm small-button"
                  disabled={fileLoading}
                  onClick={() =>
                    void loadWorkspaceFiles(
                      fileWorkspace,
                      filePath,
                      fileListing.nextOffset!,
                    )
                  }
                >
                  Sonraki dosyalar
                </button>
              </div>
            )}
        </div>
      )}
      {uiDesignerWorkspace && workspaceProject && (
        <UiDesignerDialog
          applyUiDesign={applyUiDesign}
          createUiDesign={createUiDesign}
          error={error}
          setUiDesignApplyApproval={setUiDesignApplyApproval}
          setUiDesignConsent={setUiDesignConsent}
          setUiDesignPath={setUiDesignPath}
          setUiDesignRequest={setUiDesignRequest}
          setUiDesignResult={setUiDesignResult}
          setUiDesignerWorkspace={setUiDesignerWorkspace}
          uiDesignApplied={uiDesignApplied}
          uiDesignApplyApproval={uiDesignApplyApproval}
          uiDesignConsent={uiDesignConsent}
          uiDesignLoading={uiDesignLoading}
          uiDesignPath={uiDesignPath}
          uiDesignRequest={uiDesignRequest}
          uiDesignResult={uiDesignResult}
          uiDesignerWorkspace={uiDesignerWorkspace}
          workspaceProject={workspaceProject}
        />
      )}{" "}
      {sourceSearchWorkspace && (
        <SourceSearchDialog
          analyzeSelectedSource={analyzeSelectedSource}
          error={error}
          searchWorkspaceSource={searchWorkspaceSource}
          selectedSourceMatches={selectedSourceMatches}
          setSelectedSourceMatches={setSelectedSourceMatches}
          setSourceAnalysisConsent={setSourceAnalysisConsent}
          setSourceAnalysisQuestion={setSourceAnalysisQuestion}
          setSourceAnalysisResult={setSourceAnalysisResult}
          setSourceSearchQuery={setSourceSearchQuery}
          setSourceSearchResult={setSourceSearchResult}
          setSourceSearchWorkspace={setSourceSearchWorkspace}
          sourceAnalysisConsent={sourceAnalysisConsent}
          sourceAnalysisLoading={sourceAnalysisLoading}
          sourceAnalysisQuestion={sourceAnalysisQuestion}
          sourceAnalysisResult={sourceAnalysisResult}
          sourceSearchLoading={sourceSearchLoading}
          sourceSearchQuery={sourceSearchQuery}
          sourceSearchResult={sourceSearchResult}
          sourceSearchWorkspace={sourceSearchWorkspace}
          workspaceProject={workspaceProject}
        />
      )}
      {moduleMappingProject && (
        <ModuleSourceMappings
          token={token}
          project={moduleMappingProject}
          onClose={() => setModuleMappingProject(null)}
        />
      )}
    </>
  );
}
