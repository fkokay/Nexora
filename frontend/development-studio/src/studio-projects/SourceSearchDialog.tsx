// StudioProjects.tsx'ten taşındı; state ana bileşende kalır, burada yalnız props ile kullanılır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Dialog } from "../ui/Dialog";
import { Search, X, FileCode, Sparkles, ArrowUpRight, ShieldCheck } from "lucide-react";
import type { DevelopmentProject, SourceAnalysisResult, WorkspaceRequest, WorkspaceSearchResult } from "./types";

export type SourceSearchDialogProps = {
  analyzeSelectedSource: (e: FormEvent) => Promise<void>;
  error: string;
  searchWorkspaceSource: (e: FormEvent) => Promise<void>;
  selectedSourceMatches: string[];
  setSelectedSourceMatches: Dispatch<SetStateAction<string[]>>;
  setSourceAnalysisConsent: Dispatch<SetStateAction<boolean>>;
  setSourceAnalysisQuestion: Dispatch<SetStateAction<string>>;
  setSourceAnalysisResult: Dispatch<SetStateAction<SourceAnalysisResult | null>>;
  setSourceSearchQuery: Dispatch<SetStateAction<string>>;
  setSourceSearchResult: Dispatch<SetStateAction<WorkspaceSearchResult | null>>;
  setSourceSearchWorkspace: Dispatch<SetStateAction<WorkspaceRequest | null>>;
  sourceAnalysisConsent: boolean;
  sourceAnalysisLoading: boolean;
  sourceAnalysisQuestion: string;
  sourceAnalysisResult: SourceAnalysisResult | null;
  sourceSearchLoading: boolean;
  sourceSearchQuery: string;
  sourceSearchResult: WorkspaceSearchResult | null;
  sourceSearchWorkspace: WorkspaceRequest;
  workspaceProject: DevelopmentProject | null;
};

export function SourceSearchDialog({
  analyzeSelectedSource,
  error,
  searchWorkspaceSource,
  selectedSourceMatches,
  setSelectedSourceMatches,
  setSourceAnalysisConsent,
  setSourceAnalysisQuestion,
  setSourceAnalysisResult,
  setSourceSearchQuery,
  setSourceSearchResult,
  setSourceSearchWorkspace,
  sourceAnalysisConsent,
  sourceAnalysisLoading,
  sourceAnalysisQuestion,
  sourceAnalysisResult,
  sourceSearchLoading,
  sourceSearchQuery,
  sourceSearchResult,
  sourceSearchWorkspace,
  workspaceProject,
}: SourceSearchDialogProps) {
  return (
    <Dialog
  onClose={() => { setSourceSearchWorkspace(null);
          setSourceSearchResult(null); }}
  className="studio-source-search-modal"
  backdropClassName="studio-source-search-backdrop"
  labelledBy="studio-source-search-title"
>
        <header className="studio-source-search-header">
          <div className="studio-source-search-heading">
            <div className="studio-source-search-kicker">
              <Search size={14} />
              <span>KOD TABANI · SALT OKUNUR ARAMA</span>
            </div>
            <h2 id="studio-source-search-title">Kaynak kodda ara</h2>
            <div className="studio-source-search-scope">
              <b>{workspaceProject?.name}</b>
              <span>/</span>
              <code>{sourceSearchWorkspace.branchName}</code>
            </div>
          </div>
          <button
            type="button"
            className="studio-source-search-close"
            aria-label="Aramayı kapat"
            onClick={() => {
              setSourceSearchWorkspace(null);
              setSourceSearchResult(null);
            }}
          >
            <X size={19} />
          </button>
        </header>
        <p className="studio-source-search-intro">
          Eşleşmeler dosya ve satır bilgisiyle listelenir. Kod parçaları,
          ayrıca onaylamadığınız sürece AI’ye gönderilmez.
        </p>
        {error && <div className="alert">{error}</div>}
        <form
          onSubmit={searchWorkspaceSource}
          className="studio-source-search-form"
        >
          <label htmlFor="studio-source-search-query">Kod içinde ara</label>
          <div className="studio-source-search-input-row">
            <Search size={18} />
            <input
              id="studio-source-search-query"
              type="search"
              value={sourceSearchQuery}
              onChange={(e) => setSourceSearchQuery(e.target.value)}
              maxLength={120}
              required
              autoComplete="off"
              placeholder="Metin, sembol veya dosya adı yazın…"
            />
            <button
              className="ns-btn ns-btn-primary"
              disabled={sourceSearchLoading || !sourceSearchQuery.trim()}
            >
              {sourceSearchLoading ? "Aranıyor…" : "Ara"}
              <Search size={15} />
            </button>
          </div>
          <div className="studio-source-search-hint">
            <span>Salt okunur arama</span>
            <span>En çok 8.000 dosya · 30 eşleşme</span>
          </div>
        </form>
        {sourceSearchResult && (
          <section
            className="studio-source-search-results"
            aria-label="Arama sonuçları"
          >
            <header className="studio-source-search-results-heading">
              <div>
                <b>{sourceSearchResult.matches.length} eşleşme</b>
                <span>
                  {sourceSearchResult.scannedFiles.toLocaleString("tr-TR")}{" "}
                  dosya tarandı
                  {sourceSearchResult.truncated
                    ? " · sonuç sınırına ulaşıldı"
                    : ""}
                </span>
              </div>
              <small>{selectedSourceMatches.length}/5 seçili</small>
            </header>
            <div className="studio-source-search-results-list">
              {sourceSearchResult.matches.map((match, index) => (
                <article
                  className="studio-source-search-result"
                  key={`${match.path}-${match.line}-${index}`}
                >
                  <label
                    className="studio-source-search-result-select"
                    title="AI incelemesi için seç"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSourceMatches.includes(
                        `${match.path}:${match.line}:${index}`,
                      )}
                      disabled={
                        !selectedSourceMatches.includes(
                          `${match.path}:${match.line}:${index}`,
                        ) && selectedSourceMatches.length >= 5
                      }
                      onChange={(e) => {
                        const id = `${match.path}:${match.line}:${index}`;
                        setSelectedSourceMatches((current) =>
                          e.target.checked
                            ? [...current, id]
                            : current.filter((item) => item !== id),
                        );
                        setSourceAnalysisResult(null);
                      }}
                    />
                    <span>İncele</span>
                  </label>
                  <div className="studio-source-search-result-content">
                    <div className="studio-source-search-result-path">
                      <FileCode size={14} />
                      <b>{match.path}</b>
                      <code>:{match.line}</code>
                    </div>
                    <pre>
                      <code>{match.excerpt}</code>
                    </pre>
                  </div>
                </article>
              ))}
              {sourceSearchResult.matches.length === 0 && (
                <div className="studio-source-search-empty">
                  <Search size={20} />
                  <b>Eşleşme bulunamadı</b>
                  <span>Başka bir metin veya sembol deneyin.</span>
                </div>
              )}
            </div>
          </section>
        )}
        {sourceSearchResult && selectedSourceMatches.length > 0 && (
          <form
            onSubmit={analyzeSelectedSource}
            className="studio-source-search-analysis"
          >
            <div className="studio-source-search-analysis-heading">
              <div>
                <b>Seçili kodu AI ile incele</b>
                <span>
                  {selectedSourceMatches.length} kod parçası · en çok 5
                </span>
              </div>
              <Sparkles size={17} />
            </div>
            <label htmlFor="studio-source-analysis-question">
              İnceleme sorusu
              <textarea
                id="studio-source-analysis-question"
                value={sourceAnalysisQuestion}
                onChange={(e) => setSourceAnalysisQuestion(e.target.value)}
                required
                maxLength={1000}
                rows={3}
                placeholder="Örn. Bu kod parçasının sorumluluğu nedir?"
              />
            </label>
            <label className="studio-source-search-consent">
              <input
                type="checkbox"
                checked={sourceAnalysisConsent}
                onChange={(e) => setSourceAnalysisConsent(e.target.checked)}
                required
              />
              <span>
                Seçtiğim kod satırlarının ve sorumun OpenAI’ye
                gönderilmesini onaylıyorum. İçerik sohbet geçmişinde veya
                veritabanında saklanmaz.
              </span>
            </label>
            <div className="studio-source-search-analysis-footer">
              <span>Yalnızca seçtiğiniz eşleşmeler paylaşılır.</span>
              <button
                className="ns-btn ns-btn-primary"
                disabled={sourceAnalysisLoading || !sourceAnalysisConsent}
              >
                {sourceAnalysisLoading
                  ? "İnceleniyor…"
                  : "Seçili kodu incele"}
                <ArrowUpRight size={14} />
              </button>
            </div>
          </form>
        )}
        {sourceAnalysisResult && (
          <section className="studio-source-search-answer">
            <div className="studio-source-search-analysis-heading">
              <div>
                <b>AI incelemesi</b>
                <span>
                  {sourceAnalysisResult.sourceCount} kaynak parçası
                  incelendi
                </span>
              </div>
              <Sparkles size={17} />
            </div>
            <p>{sourceAnalysisResult.answer}</p>
          </section>
        )}
        <footer className="studio-source-search-footer">
          <ShieldCheck size={15} />
          <span>
            Arama sonuçları bu ekranda kalır. AI incelemesi için ayrıca onay
            gerekir.
          </span>
        </footer>
      </Dialog>
  );
}
