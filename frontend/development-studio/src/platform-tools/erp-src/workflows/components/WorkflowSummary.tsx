import { localizedText } from '../../locale'

type Props = { admin: boolean; publishedCount: number; draftCount: number; inProgressCount: number; awaitingDecisionCount: number }

export function WorkflowSummary({ admin, publishedCount, draftCount, inProgressCount, awaitingDecisionCount }: Props) {
  return <section className="workflow-summary" aria-label={localizedText('İş akışı özeti','Workflow summary')}><div><span>{localizedText('Yayımlanmış akış','Published workflows')}</span><b>{publishedCount}</b></div>{admin&&<div><span>{localizedText('Taslak','Drafts')}</span><b>{draftCount}</b></div>}<div><span>{localizedText('Devam eden süreç','In progress')}</span><b>{inProgressCount}</b></div><div><span>{localizedText('Kararınızı bekleyen','Awaiting your decision')}</span><b>{awaitingDecisionCount}</b></div></section>
}
