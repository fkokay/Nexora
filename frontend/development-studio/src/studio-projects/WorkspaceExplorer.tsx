// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import type { ModuleStarterFile } from "../moduleStarterFiles";
import { FolderTree, X, Sparkles, ChevronRight, FileCode, Search, Play, GitBranch, History, ShieldCheck, Plus, Folder, Code2, ArrowUpRight, MessageCircle, ChevronDown, BookOpen, Network, Pencil, ListChecks } from "lucide-react";
import "./workspace-explorer.css";
import { confirmDialog } from "../ui/confirmDialog";
import { updateWorkspaceRoute, maxManualWorkspaceFileBytes, linkedDevelopmentContext } from "./helpers";
import { WorkspaceCodeEditor } from "../WorkspaceCodeEditor";
import { DatabaseEngineer } from "../DatabaseEngineer";
import type { ApprovedHistoryCandidate, ArchitecturePlan, DevelopmentProject, SourceAnalysisResult, StudioKnowledgeAutoRefresh, StudioKnowledgeDocument, WorkspaceFileContent, WorkspaceFileEntry, WorkspaceFileListing, WorkspaceFileSearchResult, WorkspaceRequest, WorkspaceSearchResult } from "./types";

export type WorkspaceExplorerProps = {
  aiConfigured: boolean | null;
  aiDockOpen: boolean;
  aiToolCategories: string[];
  aiToolsCategory: string;
  aiToolsQuery: string;
  aiToolsViewOpen: boolean;
  analysisLoading: boolean;
  canEditWorkspace: boolean;
  cancelManualFileEdit: () => Promise<void>;
  changeLoading: boolean;
  closeWorkspaceFileExplorer: () => Promise<void>;
  deleteKnowledgeDocument: (document: StudioKnowledgeDocument) => Promise<void>;
  discoverWorkspaceTests: (request: WorkspaceRequest) => Promise<void>;
  enableKnowledgeAutoRefresh: boolean;
  enableKnowledgeAutoRefreshAll: () => Promise<void>;
  error: string;
  fileContent: WorkspaceFileContent | null;
  fileListing: WorkspaceFileListing | null;
  fileLoading: boolean;
  filePath: string;
  fileWorkspace: WorkspaceRequest;
  filteredAiToolCards: { id: string; title: string; category: string; description: string; tags: string[]; icon: LucideIcon; disabled: boolean; action: () => void; }[];
  gitStatusLoading: boolean;
  handleWorkspaceExplorerKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  indexSelectedKnowledge: () => Promise<void>;
  knowledgeAutoRefresh: StudioKnowledgeAutoRefresh;
  knowledgeDocs: StudioKnowledgeDocument[];
  knowledgeDrawerOpen: boolean;
  knowledgeHistoryCandidates: ApprovedHistoryCandidate[];
  knowledgeHistoryIds: string[];
  knowledgeLoading: boolean;
  knowledgePanelExpanded: boolean;
  knowledgePaths: string[];
  loadModuleStarterIntoWorkspace: () => Promise<void>;
  loadWorkspaceAnalysis: (request: WorkspaceRequest) => Promise<void>;
  loadWorkspaceChanges: (request: WorkspaceRequest) => Promise<void>;
  loadWorkspaceFile: (request: WorkspaceRequest, path: string) => Promise<void>;
  loadWorkspaceFiles: (request: WorkspaceRequest, path: string, offset?: number) => Promise<void>;
  loadWorkspaceGitStatus: (request: WorkspaceRequest, refreshGithub?: boolean) => Promise<void>;
  manualFileContent: string;
  manualFileCreating: boolean;
  manualFileEditing: boolean;
  manualFilePath: string;
  manualFileSaving: boolean;
  moduleDisplayNameForWorkspace: (request: WorkspaceRequest | null) => string;
  moduleFilesLoading: boolean;
  moduleStarterId: string;
  moduleTemplateFiles: ModuleStarterFile[];
  moduleWorkspaceCode: string;
  moduleWorkspacePath: string;
  multiFilePaths: string[];
  multiFileSelecting: boolean;
  openStudioChat: (request: WorkspaceRequest) => Promise<void>;
  revokeKnowledgeAutoRefresh: () => Promise<void>;
  saveManualFile: (contentOverride?: string) => Promise<void>;
  setAiDockOpen: Dispatch<SetStateAction<boolean>>;
  setAiToolsCategory: Dispatch<SetStateAction<string>>;
  setAiToolsQuery: Dispatch<SetStateAction<string>>;
  setAiToolsViewOpen: Dispatch<SetStateAction<boolean>>;
  setArchitectConsent: Dispatch<SetStateAction<boolean>>;
  setArchitectPlan: Dispatch<SetStateAction<ArchitecturePlan | null>>;
  setArchitectRequest: Dispatch<SetStateAction<string>>;
  setArchitectWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  setEnableKnowledgeAutoRefresh: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setFileContent: Dispatch<SetStateAction<WorkspaceFileContent | null>>;
  setKnowledgeDrawerOpen: Dispatch<SetStateAction<boolean>>;
  setKnowledgeHistoryIds: Dispatch<SetStateAction<string[]>>;
  setKnowledgePanelExpanded: Dispatch<SetStateAction<boolean>>;
  setKnowledgePaths: Dispatch<SetStateAction<string[]>>;
  setManualFileContent: Dispatch<SetStateAction<string>>;
  setManualFileEditing: Dispatch<SetStateAction<boolean>>;
  setManualFilePath: Dispatch<SetStateAction<string>>;
  setMultiFilePaths: Dispatch<SetStateAction<string[]>>;
  setMultiFileSelecting: Dispatch<SetStateAction<boolean>>;
  setSelectedSourceMatches: Dispatch<SetStateAction<string[]>>;
  setSourceAnalysisConsent: Dispatch<SetStateAction<boolean>>;
  setSourceAnalysisQuestion: Dispatch<SetStateAction<string>>;
  setSourceAnalysisResult: Dispatch<SetStateAction<SourceAnalysisResult | null>>;
  setSourceSearchQuery: Dispatch<SetStateAction<string>>;
  setSourceSearchResult: Dispatch<SetStateAction<WorkspaceSearchResult | null>>;
  setSourceSearchWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  setWorkspaceFileFilter: Dispatch<SetStateAction<string>>;
  startCodeSuggestion: () => void;
  startManualFileEdit: () => void;
  startManualNewFile: (request: WorkspaceRequest) => void;
  startMultiFileSuggestion: (request: WorkspaceRequest) => void;
  startNewCodeSuggestion: (request: WorkspaceRequest) => void;
  startUiDesigner: (request: WorkspaceRequest) => void;
  testDiscoveryLoading: boolean;
  token: string;
  visibleWorkspaceEntries: WorkspaceFileEntry[];
  workspaceExplorerCloseRef: React.RefObject<HTMLButtonElement | null>;
  workspaceExplorerRef: React.RefObject<HTMLDivElement | null>;
  workspaceFileFilter: string;
  workspaceFileSearchLoading: boolean;
  workspaceFileSearchResult: WorkspaceFileSearchResult | null;
  workspaceProject: DevelopmentProject | null;
};

export function WorkspaceExplorer({
  aiConfigured,
  aiDockOpen,
  aiToolCategories,
  aiToolsCategory,
  aiToolsQuery,
  aiToolsViewOpen,
  analysisLoading,
  canEditWorkspace,
  cancelManualFileEdit,
  changeLoading,
  closeWorkspaceFileExplorer,
  deleteKnowledgeDocument,
  discoverWorkspaceTests,
  enableKnowledgeAutoRefresh,
  enableKnowledgeAutoRefreshAll,
  error,
  fileContent,
  fileListing,
  fileLoading,
  filePath,
  fileWorkspace,
  filteredAiToolCards,
  gitStatusLoading,
  handleWorkspaceExplorerKeyDown,
  indexSelectedKnowledge,
  knowledgeAutoRefresh,
  knowledgeDocs,
  knowledgeDrawerOpen,
  knowledgeHistoryCandidates,
  knowledgeHistoryIds,
  knowledgeLoading,
  knowledgePanelExpanded,
  knowledgePaths,
  loadModuleStarterIntoWorkspace,
  loadWorkspaceAnalysis,
  loadWorkspaceChanges,
  loadWorkspaceFile,
  loadWorkspaceFiles,
  loadWorkspaceGitStatus,
  manualFileContent,
  manualFileCreating,
  manualFileEditing,
  manualFilePath,
  manualFileSaving,
  moduleDisplayNameForWorkspace,
  moduleFilesLoading,
  moduleStarterId,
  moduleTemplateFiles,
  moduleWorkspaceCode,
  moduleWorkspacePath,
  multiFilePaths,
  multiFileSelecting,
  openStudioChat,
  revokeKnowledgeAutoRefresh,
  saveManualFile,
  setAiDockOpen,
  setAiToolsCategory,
  setAiToolsQuery,
  setAiToolsViewOpen,
  setArchitectConsent,
  setArchitectPlan,
  setArchitectRequest,
  setArchitectWorkspace,
  setEnableKnowledgeAutoRefresh,
  setError,
  setFileContent,
  setKnowledgeDrawerOpen,
  setKnowledgeHistoryIds,
  setKnowledgePanelExpanded,
  setKnowledgePaths,
  setManualFileContent,
  setManualFileEditing,
  setManualFilePath,
  setMultiFilePaths,
  setMultiFileSelecting,
  setSelectedSourceMatches,
  setSourceAnalysisConsent,
  setSourceAnalysisQuestion,
  setSourceAnalysisResult,
  setSourceSearchQuery,
  setSourceSearchResult,
  setSourceSearchWorkspace,
  setWorkspaceFileFilter,
  startCodeSuggestion,
  startManualFileEdit,
  startManualNewFile,
  startMultiFileSuggestion,
  startNewCodeSuggestion,
  startUiDesigner,
  testDiscoveryLoading,
  token,
  visibleWorkspaceEntries,
  workspaceExplorerCloseRef,
  workspaceExplorerRef,
  workspaceFileFilter,
  workspaceFileSearchLoading,
  workspaceFileSearchResult,
  workspaceProject,
}: WorkspaceExplorerProps) {
  return (
    <div
      className="studio-ide-page studio-file-explorer wx-ide"
      ref={workspaceExplorerRef}
      role="main"
      aria-labelledby="workspace-explorer-title"
      tabIndex={-1}
      onKeyDown={handleWorkspaceExplorerKeyDown}
    >
      <header className="modal-head wx-top">
        <span className="wx-brand" aria-hidden="true">
          <Sparkles size={14} /> Studio
        </span>
        <h2 id="workspace-explorer-title" className="wx-title">
          <span>{workspaceProject?.name}</span>
          <code>
            {fileWorkspace.workspaceBranchName ?? fileWorkspace.branchName}
          </code>
        </h2>
        <button
          type="button"
          className="wx-command"
          onClick={() =>
            document
              .querySelector<HTMLInputElement>(".studio-vscode-tree-search input")
              ?.focus()
          }
        >
          <Search size={14} aria-hidden="true" />
          <span>Dosya ara</span>
          <kbd>Ctrl P</kbd>
        </button>
        <details
          className="wx-menu"
          onKeyDown={(event) => {
            if (event.key === "Escape" && event.currentTarget.open) {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              event.currentTarget.open = false;
          }}
        >
          <summary className="wx-btn">
            <GitBranch size={14} aria-hidden="true" /> Sürüm
            <ChevronDown size={13} aria-hidden="true" />
          </summary>
          <div className="wx-menu-list" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={gitStatusLoading}
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                void loadWorkspaceGitStatus(fileWorkspace);
              }}
            >
              <GitBranch size={14} aria-hidden="true" />
              <span>
                <b>Durum</b>
                <small>Değişiklikleri incele</small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={changeLoading}
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                void loadWorkspaceChanges(fileWorkspace);
              }}
            >
              <History size={14} aria-hidden="true" />
              <span>
                <b>Geçmiş</b>
                <small>Onaylı değişiklikler</small>
              </span>
            </button>
          </div>
        </details>
        <button
          type="button"
          className={`wx-btn wx-btn-primary${aiToolsViewOpen ? " is-active" : ""}`}
          aria-expanded={aiToolsViewOpen}
          aria-controls="studio-ai-tools-page"
          onClick={() => {
            setAiToolsViewOpen((value) => !value);
            setAiDockOpen(false);
          }}
        >
          <Sparkles size={14} aria-hidden="true" /> AI asistanı
        </button>
        <button
          ref={workspaceExplorerCloseRef}
          type="button"
          className="wx-icon-btn"
          aria-label="Dosya gezginini kapat"
          title="Projelere dön"
          onClick={closeWorkspaceFileExplorer}
        >
          <X size={17} />
        </button>
      </header>
      {error && <div className="alert">{error}</div>}
      <nav
        className="studio-vscode-activity-bar"
        aria-label="Çalışma alanı bölümleri"
      >
        <button
          type="button"
          className={!aiToolsViewOpen ? "active" : undefined}
          title="Dosyalar"
          aria-label="Dosyalar"
          onClick={() => {
            setAiToolsViewOpen(false);
            setFileContent(null);
            setError("");
          }}
        >
          <FolderTree size={19} />
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
          title="Git durumu"
          aria-label="Git durumu"
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
        <button
          type="button"
          title="Test ve build"
          aria-label="Test ve build"
          disabled={testDiscoveryLoading}
          onClick={() => void discoverWorkspaceTests(fileWorkspace)}
        >
          <Play size={19} />
        </button>
        <button
          type="button"
          title="Proje haritası"
          aria-label="Proje haritası"
          disabled={analysisLoading}
          onClick={() => void loadWorkspaceAnalysis(fileWorkspace)}
        >
          <Network size={19} />
        </button>
        <button
          type="button"
          className={knowledgeDrawerOpen ? "active" : undefined}
          title="Bilgi tabanı · proje kaynakları"
          aria-label="Bilgi tabanı"
          onClick={() => {
            setKnowledgePanelExpanded(true);
            setKnowledgeDrawerOpen(true);
          }}
        >
          <BookOpen size={19} />
        </button>
        <span className="activity-spacer" />
        <span
          className="wx-activity-shield"
          title="İzole çalışma alanı · onaysız yazma yok"
        >
          <ShieldCheck size={17} aria-hidden="true" />
        </span>
      </nav>
      <aside
        className="studio-vscode-explorer-sidebar"
        aria-label="Proje dosyaları"
      >
        <div className="studio-vscode-explorer-heading wx-explorer-head">
          <span className="wx-explorer-label">
            Dosyalar <small>{visibleWorkspaceEntries.length}</small>
          </span>
          <div className="wx-explorer-actions">
            {workspaceProject?.accessLevel !== "Viewer" && (
              <button
                type="button"
                title="Açık klasörde yeni dosya oluştur"
                aria-label="Yeni dosya oluştur"
                onClick={() => startManualNewFile(fileWorkspace)}
              >
                <Plus size={15} />
              </button>
            )}
            {moduleStarterId &&
              moduleWorkspaceCode &&
              workspaceProject?.accessLevel !== "Viewer" && (
                <button
                  type="button"
                  title="Onayınızla modül şablonundaki yeni dosyaları izole çalışma alanına ekle"
                  aria-label="Modül şablonunu ekle"
                  disabled={moduleFilesLoading}
                  onClick={() => void loadModuleStarterIntoWorkspace()}
                >
                  <FileCode size={15} />
                </button>
              )}
            <button
              type="button"
              title={
                multiFileSelecting
                  ? "Çoklu seçimi kapat"
                  : "Çoklu dosya seç (AI önerisi için)"
              }
              aria-label="Çoklu dosya seçimi"
              aria-pressed={multiFileSelecting}
              className={multiFileSelecting ? "is-active" : undefined}
              onClick={() => {
                setMultiFileSelecting((value) => !value);
                setMultiFilePaths([]);
              }}
            >
              <ListChecks size={15} />
            </button>
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
          {fileContent && !aiToolsViewOpen && (
            <div className="wx-tab-actions">
              {!manualFileEditing &&
                workspaceProject?.accessLevel !== "Viewer" &&
                /\.(cs|csx|razor|ts|tsx|js|jsx|html|css|scss|sql|py|go|rs|java)$/i.test(
                  fileContent.path,
                ) && (
                  <>
                    <button
                      type="button"
                      className="wx-btn"
                      onClick={startManualFileEdit}
                    >
                      <Pencil size={13} aria-hidden="true" /> Düzenle
                    </button>
                    <button
                      type="button"
                      className="wx-btn"
                      onClick={startCodeSuggestion}
                    >
                      <Sparkles size={13} aria-hidden="true" /> AI önerisi
                    </button>
                  </>
                )}
              {manualFileEditing && (
                <button
                  type="button"
                  className="wx-btn"
                  disabled={manualFileSaving}
                  onClick={cancelManualFileEdit}
                >
                  Düzenlemeyi iptal et
                </button>
              )}
            </div>
          )}
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
        {!fileContent && (
        <div className="panel-heading studio-explorer-location wx-location">
          <nav className="wx-crumbs" aria-label="Konum">
            {filePath
              .split("/")
              .filter(Boolean)
              .map((part, index, parts) => (
                <span
                  key={`${index}-${part}`}
                  className={index === parts.length - 1 ? "is-current" : undefined}
                >
                  {index > 0 && (
                    <ChevronRight size={12} aria-hidden="true" />
                  )}
                  {part}
                </span>
              ))}
            {!filePath && <span className="is-current">Proje kökü</span>}
          </nav>
          <small className="wx-location-meta">
            {fileLoading
              ? "Klasör okunuyor…"
              : `${fileListing?.entries.length ?? 0} öğe`}
          </small>
          {!fileContent && filePath && (
            <button
              type="button"
              className="wx-btn"
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
          )}
        </div>
        )}
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
          <section className="studio-vscode-welcome wx-welcome">
            <div className="wx-welcome-head">
              <h1>{workspaceProject?.name}</h1>
              <p>
                Soldaki gezginden bir dosya seçin. Dosyalar izole çalışma
                alanınızda, salt okunur açılır.
              </p>
              {workspaceProject?.accessLevel !== "Viewer" && (
                <div className="wx-welcome-actions">
                  <button
                    type="button"
                    className="wx-btn wx-btn-primary"
                    onClick={() => startNewCodeSuggestion(fileWorkspace)}
                  >
                    <Sparkles size={15} aria-hidden="true" /> AI ile dosya oluştur
                  </button>
                  <button
                    type="button"
                    className="wx-btn"
                    onClick={() => startUiDesigner(fileWorkspace)}
                  >
                    <Code2 size={15} aria-hidden="true" /> Ekran tasarla
                  </button>
                </div>
              )}
            </div>
            <div className="wx-welcome-grid">
              <button
                type="button"
                disabled={gitStatusLoading}
                onClick={() => void loadWorkspaceGitStatus(fileWorkspace)}
              >
                <GitBranch size={16} aria-hidden="true" />
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
                <Play size={16} aria-hidden="true" />
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
                <Network size={16} aria-hidden="true" />
                <span>
                  <b>Proje haritası</b>
                  <small>Yapıyı görselleştir</small>
                </span>
              </button>
              <button type="button" onClick={closeWorkspaceFileExplorer}>
                <Folder size={16} aria-hidden="true" />
                <span>
                  <b>Projelere dön</b>
                  <small>Proje listesine dön</small>
                </span>
              </button>
            </div>
            <div className="wx-shortcuts">
              <span>
                <kbd>Ctrl P</kbd> Dosya ara
              </span>
              <span>
                <kbd>Ctrl Shift F</kbd> Kod içinde ara
              </span>
              <span>
                <kbd>Ctrl S</kbd> Onayla kaydet
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
  );
}
