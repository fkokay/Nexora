type Props = {
  en:boolean; search:string; statusFilter:string; taskFilter:string; overdueOnly:boolean; upcomingWithinDays:string; timeEntryDays:string
  status:(value:string)=>string
  onSearch:(value:string)=>void; onStatus:(value:string)=>void; onTask:(value:string)=>void; onOverdue:(value:boolean)=>void; onUpcoming:(value:string)=>void; onTimeEntryDays:(value:string)=>void
}

export function ProjectListFilters({ en,search,statusFilter,taskFilter,overdueOnly,upcomingWithinDays,timeEntryDays,status,onSearch,onStatus,onTask,onOverdue,onUpcoming,onTimeEntryDays }:Props) {
  return <>
    <label className="op-project-search">{en?'Search':'Ara'}<input value={search} onChange={e=>onSearch(e.target.value)} placeholder={en?'Code or name':'Kod veya ad'}/></label>
    <div className="op-project-filters">
      <label>{en?'Status':'Durum'}<select value={statusFilter} onChange={e=>onStatus(e.target.value)}><option value="">{en?'All statuses':'Tüm durumlar'}</option><option value="Draft">{status('Draft')}</option><option value="Active">{status('Active')}</option><option value="OnHold">{status('OnHold')}</option><option value="Completed">{status('Completed')}</option><option value="Cancelled">{status('Cancelled')}</option></select></label>
      <label>{en?'Tasks':'Görevler'}<select value={taskFilter} onChange={e=>onTask(e.target.value)}><option value="">{en?'Any task state':'Tüm görev durumları'}</option><option value="has-open">{en?'Has open tasks':'Açık görevi olan'}</option><option value="all-complete">{en?'All tasks complete':'Tüm görevleri tamamlanan'}</option><option value="no-tasks">{en?'No tasks':'Görevi olmayan'}</option></select></label>
      <label>{en?'Upcoming date':'Yaklaşan tarih'}<select value={upcomingWithinDays} onChange={e=>onUpcoming(e.target.value)}><option value="">{en?'Any date':'Tüm tarihler'}</option><option value="30">{en?'Next 30 days':'Önümüzdeki 30 gün'}</option><option value="90">{en?'Next 90 days':'Önümüzdeki 90 gün'}</option><option value="365">{en?'Next year':'Önümüzdeki 365 gün'}</option></select></label>
      <label>{en?'Time records':'Süre kayıtları'}<select value={timeEntryDays} onChange={e=>onTimeEntryDays(e.target.value)}><option value="">{en?'Any time':'Tüm dönemler'}</option><option value="7">{en?'Last 7 days':'Son 7 gün'}</option><option value="30">{en?'Last 30 days':'Son 30 gün'}</option><option value="90">{en?'Last 90 days':'Son 90 gün'}</option></select></label>
      <label className="op-project-check"><input type="checkbox" checked={overdueOnly} onChange={e=>onOverdue(e.target.checked)}/>{en?'Overdue tasks only':'Yalnız geciken görevi olanlar'}</label>
    </div>
  </>
}
