function Get-LiveAssistantReviewDecision {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [object[]] $Rubric,
        [Parameter(Mandatory)] [object[]] $FinalScores,
        [Parameter(Mandatory)] [bool] $ReviewersApproved,
        [Parameter(Mandatory)] [bool] $AdjudicationApproved
    )

    $passThresholds = @{}
    foreach ($dimension in $Rubric) {
        $id = [string]$dimension.id
        $passAt = [int]$dimension.passAt
        $scale = @($dimension.scale | ForEach-Object { [int]$_ })
        if ([string]::IsNullOrWhiteSpace($id) -or $passThresholds.ContainsKey($id) -or $scale.Count -eq 0 -or $passAt -notin $scale) {
            throw 'Evaluation rubric dimensions must have unique IDs and a passAt value included in the declared scale.'
        }
        $passThresholds[$id] = $passAt
    }
    if ($passThresholds.Count -eq 0 -or $FinalScores.Count -eq 0) {
        throw 'A rubric and at least one final case score are required.'
    }

    $allCriticalPassed = $true
    $allApplicablePassed = $true
    foreach ($case in $FinalScores) {
        if (-not [bool]$case.criticalChecksPassed) { $allCriticalPassed = $false }
        foreach ($dimension in $case.applicableRubricDimensions) {
            $id = [string]$dimension
            if (-not $passThresholds.ContainsKey($id) -or -not $case.scores.Contains($id)) {
                throw 'Final scores must contain every applicable rubric dimension declared by the evaluation set.'
            }
            if ([int]$case.scores[$id] -lt $passThresholds[$id]) { $allApplicablePassed = $false }
        }
    }

    $accepted = $allCriticalPassed -and $allApplicablePassed -and $ReviewersApproved -and $AdjudicationApproved
    return [ordered]@{
        allCriticalChecksPassed = $allCriticalPassed
        allApplicableRubricScoresPassed = $allApplicablePassed
        reviewersApproved = $ReviewersApproved
        adjudicationApproved = $AdjudicationApproved
        accepted = $accepted
    }
}

Export-ModuleMember -Function Get-LiveAssistantReviewDecision
