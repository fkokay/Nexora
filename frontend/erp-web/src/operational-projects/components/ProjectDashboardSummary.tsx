import type { ProjectDashboardSummary as Summary } from '../types'

type Props = { summary:Summary; en:boolean; timeEntryDays:string; hourUnit:string; formatHours:(value:number)=>string }

export function ProjectDashboardSummary({ summary:dashboard,en,timeEntryDays,hourUnit,formatHours }:Props) {
  return <section className="op-project-dashboard" aria-label={en?'Project overview':'Proje özeti'}>
    <article><small>{en?'Projects':'Projeler'}</small><b>{dashboard.projectCount}</b><span>{dashboard.activeProjectCount} {en?'active':'devam ediyor'}</span></article>
    <article><small>{en?'Task completion':'Görev tamamlanma'}</small><b>{dashboard.completedTaskCount}/{dashboard.taskCount}</b><span>{dashboard.taskCount?Math.round(dashboard.completedTaskCount/dashboard.taskCount*100):0}%</span></article>
    <article><small>{en?'Overdue tasks':'Geciken görevler'}</small><b>{dashboard.overdueTaskCount}</b><span>{en?'Open tasks past their end date':'Bitiş tarihi geçen açık görev'}</span></article>
    <article><small>{en?'Projects due in 30 days':'30 günde bitiş tarihi olan proje'}</small><b>{dashboard.projectsEndingIn30Days}</b><span>{en?'Project end date':'Proje bitiş tarihi'}</span></article>
    <article><small>{en?`Time logged · ${timeEntryDays||'all'} days`:`Kaydedilen süre · ${timeEntryDays||'tümü'} gün`}</small><b>{formatHours(dashboard.timeEntryHours)} {hourUnit}</b><span>{dashboard.timeEntryCount} {en?'entries':'süre kaydı'}{en?' · visible to your role':' · rolünüzün görebildiği'}</span></article>
  </section>
}
