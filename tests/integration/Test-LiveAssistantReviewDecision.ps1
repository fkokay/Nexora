$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'LiveAssistantReviewDecision.psm1') -Force

function Assert-Equal($Expected, $Actual, [string]$Message) {
    if ($Expected -ne $Actual) { throw "$Message Expected '$Expected', got '$Actual'." }
}

$rubric = @(
    @{ id = 'factual-grounding'; scale = @(0, 1, 2); passAt = 1 },
    @{ id = 'intent-relevance'; scale = @(0, 1, 2); passAt = 2 }
)
$caseScores = @(
    @{ id = 'synthetic-case'; criticalChecksPassed = $true; applicableRubricDimensions = @('factual-grounding', 'intent-relevance'); scores = @{ 'factual-grounding' = 1; 'intent-relevance' = 2 } }
)
$decision = Get-LiveAssistantReviewDecision -Rubric $rubric -FinalScores $caseScores -ReviewersApproved $true -AdjudicationApproved $true
Assert-Equal $true $decision.allApplicableRubricScoresPassed 'The configured per-dimension passAt threshold must be honored.'
Assert-Equal $true $decision.accepted 'The review should be accepted when all configured thresholds and approvals pass.'

$caseScores[0].scores['intent-relevance'] = 1
$decision = Get-LiveAssistantReviewDecision -Rubric $rubric -FinalScores $caseScores -ReviewersApproved $true -AdjudicationApproved $true
Assert-Equal $false $decision.allApplicableRubricScoresPassed 'A score below that dimension passAt must fail.'
Assert-Equal $false $decision.accepted 'A failed applicable score must reject the evaluation.'

$caseScores[0].scores['intent-relevance'] = 2
$decision = Get-LiveAssistantReviewDecision -Rubric $rubric -FinalScores $caseScores -ReviewersApproved $false -AdjudicationApproved $true
Assert-Equal $false $decision.accepted 'Missing human reviewer approval must reject the evaluation.'

$caseScores[0].scores['unknown-dimension'] = 2
$caseScores[0].applicableRubricDimensions += 'unknown-dimension'
$threw = $false
try { Get-LiveAssistantReviewDecision -Rubric $rubric -FinalScores $caseScores -ReviewersApproved $true -AdjudicationApproved $true | Out-Null }
catch { $threw = $true }
Assert-Equal $true $threw 'A final score for a dimension missing from the rubric must be rejected.'

Write-Output 'Live assistant review decision contract passed.'
