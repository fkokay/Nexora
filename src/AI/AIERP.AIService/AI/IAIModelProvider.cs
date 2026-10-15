namespace AIERP.AIService.AI;

public sealed record ArchitecturePlanStep(string Title, string Description, IReadOnlyList<string> Files);
public sealed record ArchitecturePlan(string Summary, IReadOnlyList<string> AffectedAreas,
    IReadOnlyList<ArchitecturePlanStep> Steps, IReadOnlyList<string> Assumptions, IReadOnlyList<string> Risks);
public sealed record ArchitectureTechnology(string Name, int FileCount);
public sealed record AITestTarget(string Path, string Ecosystem, string Evidence);
public sealed record AITestScenario(string Title, string Category, string Objective, IReadOnlyList<string> Steps, string ExpectedResult, string Priority);
public sealed record AITestPlan(string Summary, IReadOnlyList<AITestScenario> Scenarios, IReadOnlyList<string> Assumptions, IReadOnlyList<string> Risks);
public sealed record CodeSuggestion(string Summary, string ProposedContent, IReadOnlyList<string> Notes);
public sealed record CodeSourceFile(string Path, string Content, string Sha256);
public sealed record ProposedCodeFile(string Path, string ProposedContent, IReadOnlyList<string> Notes);
public sealed record MultiFileCodeSuggestion(string Summary, IReadOnlyList<ProposedCodeFile> Changes, IReadOnlyList<string> Risks);
public sealed record StudioChatTurn(string Role, string Content);
public sealed record StudioCodeContext(string Path, int Line, string Excerpt);
public sealed record StudioDiffContext(string Path, string Status, string BaseContent, string CurrentContent, string CommitSha);
public sealed record StudioCodeReviewFinding(string Severity, string Title, string Detail, string Recommendation);
public sealed record StudioCodeReview(string Summary, IReadOnlyList<StudioCodeReviewFinding> Findings, IReadOnlyList<string> Limitations);
public sealed record StudioPullRequestDraft(string Title, string Body, IReadOnlyList<string> Risks, IReadOnlyList<string> Limitations);
public sealed record StudioPullRequestContext(string ProjectName, string SourceBranch, string BaseBranch, string CommitSha, string TestTargetPath, string ChangeSummary);
public sealed record SandboxErrorContext(string Operation, string TargetPath, string Status, int? ExitCode,
    string? Message, string Output, string CommitSha);
public sealed record SandboxErrorAnalysis(string Summary, string LikelyCause, IReadOnlyList<string> RecommendedActions,
    IReadOnlyList<string> Limitations);

public interface IAIModelProvider
{
    Task<string> ReplyToStudioChatAsync(string projectName, string branchName, IReadOnlyList<StudioChatTurn> history,
        CancellationToken cancellationToken);

    Task<string> AnalyzeStudioSourceAsync(string question, string projectName, string branchName,
        IReadOnlyList<StudioCodeContext> sources, CancellationToken cancellationToken);

    Task<StudioCodeReview> ReviewStudioDiffAsync(string projectName, string branchName, StudioDiffContext diff,
        CancellationToken cancellationToken);

    Task<StudioPullRequestDraft> CreateStudioPullRequestDraftAsync(StudioPullRequestContext context,
        CancellationToken cancellationToken);

    Task<ArchitecturePlan> CreateArchitecturePlanAsync(string request, string projectName, string branchName,
        IReadOnlyList<ArchitectureTechnology> technologies, IReadOnlyList<string> entryPoints,
        CancellationToken cancellationToken);

    Task<AITestPlan> CreateTestPlanAsync(string request, string projectName, string branchName,
        IReadOnlyList<AITestTarget> targets, CancellationToken cancellationToken);

    Task<CodeSuggestion> CreateCodeSuggestionAsync(string request, string projectName, string branchName,
        string filePath, string sourceContent, CancellationToken cancellationToken, bool createNewFile = false);

    Task<MultiFileCodeSuggestion> CreateMultiFileCodeSuggestionAsync(string request, string projectName, string branchName,
        IReadOnlyList<CodeSourceFile> sources, CancellationToken cancellationToken);

    Task<SandboxErrorAnalysis> AnalyzeSandboxErrorAsync(string projectName, string branchName,
        SandboxErrorContext error, CancellationToken cancellationToken);
}

public sealed class AIProviderNotConfiguredException : Exception { }
public sealed class AIProviderResponseException : Exception
{
    public AIProviderResponseException(string message) : base(message) { }
}
