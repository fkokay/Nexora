# AI Assistant Evaluation

## Offline orchestration contract

The deterministic ERP assistant evaluation set is `tests/UnitTests/AIERP.Platform.UnitTests/EvaluationSets/erp-assistant-orchestration-v1.json`. It is versioned independently from code (`schemaVersion` and set `version`) and SHA-256 identified in test output and generated reports. The dataset defines seven tenant-read tool-routing scenarios and three trust, tool-budget, and failure-sanitization scenarios. Unit tests check that its tool names and argument payloads still match the executable scripted-provider cases.

Run it without a live provider key:

```powershell
./tests/integration/Invoke-OfflineErpAssistantEvaluation.ps1
```

The runner invokes only the focused mocked-provider unit-test classes and writes `offline-orchestration-report.json` under the unit-test project's ignored `TestResults/ai-evaluation` directory by default. A different report path can be supplied with `-ReportPath`. The report records the evaluation-set hash/version, per-case test outcomes, totals, and `externalRequests: 0`. It always marks `semanticQualityScored: false`; the scripted model returns predetermined responses and is not a semantic quality measurement. The runner does not read or print OpenAI keys.

The recorded run for this checkout is [ai-evaluation-offline-report.json](ai-evaluation-offline-report.json).

## Future live quality evaluation

The data file includes a prospective five-dimension, 0–2 human-review rubric for factual grounding, intent relevance, tenant scope, instruction boundaries, and uncertainty/refusal. It is a rubric definition, not an evaluated result. A live acceptance run still needs an explicitly approved model/version, synthetic tenant-safe prompts and gold facts, repeatable sampling settings, reviewer scores with disagreement resolution, provider/request metadata, and securely provisioned credentials in the intended environment. This offline runner must not be used as a substitute for that live evaluation.
