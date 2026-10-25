# AI Assistant Evaluation

## Offline orchestration contract

The deterministic ERP assistant evaluation set is `tests/UnitTests/AIERP.Platform.UnitTests/EvaluationSets/erp-assistant-orchestration-v1.json`. It is versioned independently from code (`schemaVersion` and set `version`) and SHA-256 identified in test output and generated reports. It covers 18 tenant-read tool-routing scenarios and ten deterministic behavior scenarios, including an operational purchase-order fulfillment fixture and a bounded supplier-ledger lookup. Its synthetic `PO-SYN-01` case contains 20 ordered, 12 received, and 8 outstanding units. A scripted-provider contract checks that the authorized report facts are handed back unchanged, that ordered minus received reconciles to outstanding, and that the answer states the result is a one-row synthetic sample. This is repeatable semantic-fixture evidence for orchestration and fact reconciliation; the scripted model returns a predetermined answer, so these checks do not score a language model's semantic quality. Every scenario declares unique assertions, and the runner reports case outcomes with the evaluation set's SHA-256.

Run it without a live provider key:

```powershell
./tests/integration/Invoke-OfflineErpAssistantEvaluation.ps1
```

The runner invokes the focused mocked-provider evaluation tests and the offline/live evaluation-set contract checks, then writes `offline-orchestration-report.json` under the unit-test project's ignored `TestResults/ai-evaluation` directory by default. A different report path can be supplied with `-ReportPath`. The report records the offline evaluation-set hash/version, per-check test outcomes, totals, and `externalRequests: 0`; the live-set contract check validates rubric applicability but makes no provider request. It always marks `semanticQualityScored: false`; the scripted model returns predetermined responses and is not a semantic quality measurement. The runner does not read or print OpenAI keys.

The recorded run for this checkout is [ai-evaluation-offline-report.json](ai-evaluation-offline-report.json).

## Live model quality review

The review contract is versioned at `tests/UnitTests/AIERP.Platform.UnitTests/EvaluationSets/erp-assistant-live-quality-v1.json` (set version 1.2.1). It contains five synthetic cases, gold facts, critical checks, and a 0–2 rubric for factual grounding, intent relevance, tenant scope, instruction boundaries, and uncertainty/refusal. Each case declares which dimensions apply, so reviewers do not score irrelevant criteria (for example, instruction-boundary handling on a plain arithmetic question). The contract test and runner validate that each case selects one or more unique dimensions from the rubric. It explicitly requires two distinct human reviewers who attest to their identity and independence, plus a distinct human adjudicator if any critical-check or rubric score differs. It forbids ERP access and sets a maximum of one provider request with no retries. Its version and SHA-256 identify the reviewed set.

When securely provisioned credentials and an approved model are available, run the interactive review once:

```powershell
$env:AIERP_LIVE_EVAL_PROVIDER = 'OpenAI'
$env:AIERP_LIVE_EVAL_OPENAI_MODEL = '<approved-model-id>'
# Provision AIERP_LIVE_EVAL_OPENAI_API_KEY through the approved secret mechanism; never paste it into a command, file, or transcript.
./tests/integration/Invoke-LiveErpAssistantHumanReview.ps1
```

The runner sends all five cases together in exactly one Responses API request (`store: false`, no tools, 700-token output ceiling); it has no retry path. It presents each answer with its synthetic facts and expected behavior, then collects the first reviewer’s complete scores and clears the console before the second independent review. Reviewers must not inspect or discuss previous scores. The runner compares all case-critical decisions and applicable rubric dimensions. Any disagreement requires a third, distinct adjudicator to resolve each disputed item; the adjudicator’s final scores are stored alongside both independent score sets. Raw answers are displayed only for the session and are not written to the report. Do not enable shell transcript/log capture during the review. The default report is under the ignored unit-test `TestResults/ai-evaluation` directory and contains only the set hash/version, provider/model, request counts, pseudonymous reviewer IDs, applicable dimensions and scores, disagreement resolutions, critical-check decisions, and explicit approvals. A run is accepted only if both reviewers approve, every final critical check passes, every final applicable rubric score is 2, and any required adjudicator approves. The adjudicator ID must differ from both reviewers.

The offline orchestration runner remains separate: it proves deterministic tool routing and fact handoff, not live model quality. The pre-existing `ai-live-chat-smoke-20261020.json` is not evidence for this synthetic-only review: its metadata says tenant data was used. The earlier `ai-live-assistant-semantic-evaluation.json` records a rejected request (HTTP 429), not a scored result.

The separate `docs/ai-live-chat-smoke-20261020.json` records three earlier live requests through the ERP UI using `gpt-6-luna`: two synthetic prompts and one consented read-only warehouse-list tool call. That smoke confirms the configured provider path worked, but it did not score the five cases in this quality set and is not an accepted semantic-quality evaluation. This PowerShell harness was not run for that smoke; it requires its own process-scoped provider/key/model settings and then pauses for two independent reviewers, with a third adjudicator required only when they disagree. No rubric-based live-quality result is recorded yet.
