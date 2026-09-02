'use client'
import { Bookmark, FileText, Hash, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataCard, PageHeading, SectionLabel, Tag, WorkspaceShell } from '../../components/ui/app-shell'

const notes = [
  ['Designing private connectivity patterns with AWS Transit Gateway','NETWORKING','8 min read','Sep 01, 2026',['Transit Gateway','VPC']],
  ['Identity boundaries for multi-account AWS environments','SECURITY','12 min read','Aug 29, 2026',['IAM','Organizations']],
  ['A practical guide to CloudTrail data events','OBSERVABILITY','6 min read','Aug 24, 2026',['CloudTrail','Audit']],
  ['Hardening S3 buckets with policy conditions','SECURITY','10 min read','Aug 18, 2026',['S3','IAM']],
  ['Threat modeling an event-driven architecture','ARCHITECTURE','14 min read','Aug 12, 2026',['EventBridge','Threat model']],
]


export default function WriteUps() { 

  const [q,setQ]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [saved,setSaved]=useState<string[]>([]);
  const visible=useMemo(()=>notes.filter(n=>(filter==='ALL'||n[1]===filter)&&`${n[0]} ${n[4].join(' ')}`.toLowerCase().includes(q.toLowerCase())),[q,filter]);
  
  return <WorkspaceShell title="Write-ups">
         <PageHeading kicker="KNOWLEDGE BASE / 24 PUBLISHED" heading="Write-ups" lede="Field notes, architecture decisions, and security research from the cloud-security workspace." action={<button className="new-button">
          <FileText size={15}/> New write-up</button>}/>

          <div className="toolbar"><div className="inline-search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search notes and tags..."/>
          </div>
          
          <button className="filter-button" onClick={()=>setFilter(filter==='ALL'?'SECURITY':'ALL')}><SlidersHorizontal size={14}/> {filter==='ALL'?'All topics':filter}</button></div>
          <div className="section-header compact">
            <div><SectionLabel>ARCHIVE</SectionLabel>
            <h2>{visible.length} notes in view</h2>
            </div>
            
            <span className="mono">SORT: RECENT</span>
          </div>
          
          <div className="notes-list page-list">{visible.map(n=><DataCard key={n[0]} className="note-row">
            <div className="note-type"><FileText size={17}/></div>
            <div className="note-info">
              <div><Tag tone={n[1]==='SECURITY'?'orange':'cyan'}>{n[1]}</Tag><span className="mono">{n[3]}</span></div>
              <h3>{n[0]}</h3><p>{n[4].map(t=><span key={t}><Hash size={11}/>{t} </span>)} · {n[2]}</p></div>
              <button className={`bookmark-button ${saved.includes(n[0])?'saved':''}`} aria-label={`Bookmark ${n[0]}`} onClick={()=>setSaved(s=>s.includes(n[0])?s.filter(x=>x!==n[0]):[...s,n[0]])}><Bookmark size={17} fill={saved.includes(n[0])?'currentColor':'none'}/></button>
              </DataCard>)}</div>
              </WorkspaceShell>}
