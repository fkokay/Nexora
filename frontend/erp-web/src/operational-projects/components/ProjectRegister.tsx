import { FolderKanban, Plus, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import ScreenViewGroupHeader from '../../ScreenViewGroupHeader'
import type { ProjectPage, ProjectScreenField, ProjectSummary } from '../types'

type Props = {
  page:ProjectPage|null; pageNumber:number; search:string; loading:boolean; en:boolean; canManage:boolean; busy:boolean; hasFilters:boolean
  fields:ProjectScreenField[]; selectedId:string|null
  renderValue:(project:ProjectSummary,key:string)=>ReactNode
  onQueryChange:(query:{search:string;page:number;sorts:{index:number;direction:'asc'|'desc'}[]})=>void
  onSelect:(project:ProjectSummary)=>void; onPageChange:(page:number)=>void; onClearFilters:()=>void; onCreate:()=>void; onImportRows?:(rows:Record<string,unknown>[])=>Promise<void>
}

export function ProjectRegister({ page,pageNumber,search,loading,en,canManage,busy,hasFilters,fields,selectedId,renderValue,onQueryChange,onSelect,onPageChange,onClearFilters,onCreate,onImportRows }:Props) {
  return <>
    <div className="op-project-register-wrap">{page===null?<div className="op-project-loading" role="status">{en?'Loading projects…':'Projeler yükleniyor…'}</div>:page.items.length===0?<div className="op-project-empty-list"><span className="op-project-empty-icon"><FolderKanban size={23}/></span><strong>{hasFilters?(en?'No projects match these filters':'Bu filtrelerle eşleşen proje yok'):(en?'No projects yet':'Henüz proje yok')}</strong><p>{hasFilters?(en?'Clear or adjust filters to see more projects.':'Daha fazla proje görmek için filtreleri temizleyin veya değiştirin.'):(en?'Create your first project using the button above.':'İlk projenizi üstteki düğmeyle oluşturabilirsiniz.')}</p>{hasFilters&&<button type="button" className="secondary" onClick={onClearFilters}><RotateCcw size={14}/>{en?'Clear filters':'Filtreleri temizle'}</button>}</div>:<AdvancedDataGrid hideSearch className="op-project-register" serverData={{page:page.page??pageNumber,pageSize:page.pageSize??100,total:page.total,search,loading,hideFooter:true,sortableColumns:fields.map((field,index)=>field.key==='actions'?-1:index).filter(index=>index>=0),supported:{filters:false,sorting:true},onQueryChange}} onImportRows={onImportRows}><thead><ScreenViewGroupHeader fields={fields} generalLabel={en?'Project':'Proje'}/><tr>{fields.map(field=><th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{page.items.map(project=><tr key={project.id} className={selectedId===project.id?'selected':''} onClick={()=>onSelect(project)}>{fields.map(field=><td key={field.key}>{field.key==='actions'?<button className="op-project-open" aria-label={en?`Open ${project.code}`:`${project.code} projesini aç`} onClick={event=>{event.stopPropagation();onSelect(project)}}>{en?'Open':'Aç'}</button>:renderValue(project,field.key)}</td>)}</tr>)}</tbody></AdvancedDataGrid>}</div>
    <div className={`op-project-pagination${page?.total===0?' is-empty':''}`}><span>{page?`${(page.page-1)*page.pageSize+1}–${Math.min(page.page*page.pageSize,page.total)} / ${page.total}`:'—'}</span><button className="secondary" disabled={!page||page.page<=1||busy} onClick={()=>onPageChange(Math.max(1,pageNumber-1))}>{en?'Previous':'Önceki'}</button><button className="secondary" disabled={!page||page.page*page.pageSize>=page.total||busy} onClick={()=>onPageChange(pageNumber+1)}>{en?'Next':'Sonraki'}</button></div>
    {page?.total===0&&canManage&&<div className="op-project-empty-create"><p>{en?'Start with a project to organize tasks, resources and time.':'Görevleri, kaynakları ve çalışma sürelerini düzenlemek için ilk projenizi oluşturun.'}</p><button type="button" className="primary" onClick={onCreate}><Plus size={15}/>{en?'Create project':'Proje oluştur'}</button></div>}
  </>
}
