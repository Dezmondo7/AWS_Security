'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, BookOpen, ChevronRight, Command, FileText, FolderKanban, Hash, LayoutDashboard, Menu, Plus, Search, Settings2, ShieldCheck, Terminal, Users, X } from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { label: 'Overview', href: '/', icon: LayoutDashboard },
  { label: 'Write-ups', href: '/write-ups', icon: FileText, count: '24' },
  { label: 'Projects', href: '/projects', icon: FolderKanban, count: '06' },
  { label: 'Playbooks', href: '/playbooks', icon: Terminal },
]

export function WorkspaceShell({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname()
  const [mobileNav, setMobileNav] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const active = navItems.find((item) => item.href === pathname)?.label ?? title

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand-row"><div className="brand-mark"><ShieldCheck size={19} /></div><div><strong>ARC//SEC</strong><span>PROJECT HUB</span></div><button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button></div>
      <div className="workspace-card"><div className="workspace-dot" /><div><span className="eyebrow">WORKSPACE</span><strong>cloud-security</strong></div><ChevronRight size={15} /></div>
      <nav className="primary-nav" aria-label="Main navigation"><div className="section-label">Workspace</div>{navItems.map(({ label, href, icon: Icon, count }) => <Link key={label} href={href} onClick={() => setMobileNav(false)} className={`nav-item ${active === label ? 'active' : ''}`}><Icon size={17} /><span>{label}</span>{count && <em>{count}</em>}</Link>)}<div className="section-label">Library</div><button className="nav-item"><BookOpen size={17} /><span>Bookmarks</span><em>04</em></button><button className="nav-item"><Hash size={17} /><span>Topics</span></button></nav>
      <div className="sidebar-footer"><button className="nav-item"><Users size={17} /><span>Contributors</span></button><button className="nav-item"><Settings2 size={17} /><span>Settings</span></button><div className="profile"><div className="avatar">JD</div><div><strong>Jordan Davis</strong><span>Administrator</span></div><div className="status-dot" /></div></div>
    </aside>
    <section className="content-area"><header className="topbar"><button className="icon-button menu-trigger" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button><div className="breadcrumb"><span>ARC//SEC</span><ChevronRight size={14} /><strong>{active}</strong></div><div className="top-actions"><button className="search-trigger" onClick={() => setSearchOpen(!searchOpen)}><Search size={16} /><span>Search hub</span><kbd><Command size={12} /> K</kbd></button><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i /></button><button className="new-button"><Plus size={16} /> <span>New write-up</span></button></div></header>{searchOpen && <div className="search-panel"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search write-ups, tags, projects..." /><button onClick={() => { setQuery(''); setSearchOpen(false) }} aria-label="Close search"><X size={16} /></button></div>}<div className="page-wrap">{children}</div></section>
  </main>
}

export function PageHeading({ kicker, heading, lede, action }: { kicker: string; heading: string; lede: string; action?: React.ReactNode }) { return <div className="page-heading"><div><p className="kicker"><span className="pulse" /> {kicker}</p><h1>{heading}</h1><p className="lede">{lede}</p></div>{action}</div> }
export function SectionLabel({ children }: { children: React.ReactNode }) { return <div className="section-label">{children}</div> }
export function Tag({ children, tone = 'cyan' }: { children: React.ReactNode; tone?: 'cyan' | 'orange' }) { return <span className={`category ${tone}`}>{children}</span> }
export function DataCard({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <div className={`data-card ${className}`}>{children}</div> }
export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong><div className="metric-trend"><em>+12%</em> {detail}</div></div> }
export function IconLabel({ children }: { children: React.ReactNode }) { return <span className="icon-label">{children}</span> }

export { navItems }

