'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Command,
  FileText,
  FolderKanban,
  Hash,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
  Users,
  X,
  Zap,
} from 'lucide-react'

const articles = [
  { title: 'Designing private connectivity patterns with AWS Transit Gateway', category: 'NETWORKING', read: '8 min read', date: 'Sep 01, 2026', tags: ['Transit Gateway', 'VPC'], featured: true },
  { title: 'Identity boundaries for multi-account AWS environments', category: 'SECURITY', read: '12 min read', date: 'Aug 29, 2026', tags: ['IAM', 'Organizations'] },
  { title: 'A practical guide to CloudTrail data events', category: 'OBSERVABILITY', read: '6 min read', date: 'Aug 24, 2026', tags: ['CloudTrail', 'Audit'] },
  { title: 'Hardening S3 buckets with policy conditions', category: 'SECURITY', read: '10 min read', date: 'Aug 18, 2026', tags: ['S3', 'IAM'] },
]

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, href: '/' },
  { label: 'Write-ups', icon: FileText, href: '/write-ups', count: '24' },
  { label: 'Projects', icon: FolderKanban, href: '/projects', count: '06' },
  { label: 'Playbooks', icon: Terminal, href: '/playbooks' },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="section-label">{children}</div>
}

function App() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [activeFilter, setActiveFilter] = useState('All notes')
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [bookmarked, setBookmarked] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)

  const visibleArticles = useMemo(() => {
    const filtered = activeFilter === 'All notes' ? articles : articles.filter((article) => article.category === activeFilter.toUpperCase())
    return filtered.filter((article) => `${article.title} ${article.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  }, [activeFilter, query])

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><ShieldCheck size={19} /></div>
          <div><strong>ARC//SEC</strong><span>PROJECT HUB</span></div>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <div className="workspace-card"><div className="workspace-dot" /><div><span className="eyebrow">WORKSPACE</span><strong>cloud-security</strong></div><ChevronRight size={15} /></div>
        <nav className="primary-nav" aria-label="Main navigation">
          <SectionLabel>Workspace</SectionLabel>
          {navItems.map(({ label, icon: Icon, href, count }) => <Link key={label} href={href} onClick={() => { setActiveNav(label); setMobileNav(false) }} className={`nav-item ${activeNav === label ? 'active' : ''}`}><Icon size={17} /><span>{label}</span>{count && <em>{count}</em>}</Link>)}
          <SectionLabel>Library</SectionLabel>
          <button className="nav-item"><BookOpen size={17} /><span>Bookmarks</span><em>04</em></button>
          <button className="nav-item"><Hash size={17} /><span>Topics</span></button>
        </nav>
        <div className="sidebar-footer"><button className="nav-item"><Users size={17} /><span>Contributors</span></button><button className="nav-item"><Settings2 size={17} /><span>Settings</span></button><div className="profile"><div className="avatar">JD</div><div><strong>Dale Luke</strong><span>Administrator</span></div><div className="status-dot" /></div></div>
      </aside>

      <section className="content-area">
        <header className="topbar">
          <button className="icon-button menu-trigger" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>ARC//SEC</span><ChevronRight size={14} /><strong>{activeNav}</strong></div>
          <div className="top-actions"><button className="search-trigger" onClick={() => setSearchOpen(!searchOpen)}><Search size={16} /><span>Search hub</span><kbd><Command size={12} /> K</kbd></button><button className="icon-button notification" aria-label="Notifications"><Bell size={18} /><i /></button><button className="new-button"><Plus size={16} /> <span>New write-up</span></button></div>
        </header>
        {searchOpen && <div className="search-panel"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search write-ups, tags, projects..." /><button onClick={() => { setQuery(''); setSearchOpen(false) }} aria-label="Close search"><X size={16} /></button></div>}

        <div className="page-wrap">
          <div className="page-heading"><div><p className="kicker"><span className="pulse" /> SYSTEM ONLINE / US-EAST-1</p><h1>Good morning, Dale.</h1><p className="lede">Your security knowledge base is up to date. Here&apos;s what&apos;s happening across your workspace.</p></div><div className="heading-date"><span>MONDAY</span><strong>01 <small>SEP</small></strong><span>2026</span></div></div>

          <div className="posture-banner"><div className="posture-icon"><LockKeyhole size={19} /></div><div><strong>Security posture: <span>Healthy</span></strong><p>All workspace controls are operating within baseline.</p></div><div className="posture-meta"><span><CheckCircle2 size={14} /> 12 controls passing</span><button>View posture <ArrowUpRight size={14} /></button></div></div>

          <div className="metrics-grid"><Metric icon={FileText} label="Published notes" value="24" trend="+3" detail="this month" /><Metric icon={FolderKanban} label="Active projects" value="06" trend="+1" detail="this week" /><Metric icon={Zap} label="Reading streak" value="12d" trend="+4d" detail="personal best" /><Metric icon={Activity} label="Workspace health" value="98.4%" trend="+2.1%" detail="vs last month" /></div>

          <div className="section-header"><div><SectionLabel>Featured knowledge</SectionLabel><h2>Start with the signal.</h2></div><Link className="text-button" href="/write-ups">View all write-ups <ArrowUpRight size={15} /></Link></div>
          <article className="featured-card"><div className="featured-copy"><div className="article-topline"><span className="category orange">{articles[0].category}</span><span className="mono">{articles[0].date}</span></div><h3>{articles[0].title}</h3><p>How to build resilient, inspectable network boundaries across accounts without sacrificing developer velocity or operational clarity.</p><div className="tag-row">{articles[0].tags.map((tag) => <span key={tag}><Hash size={12} />{tag}</span>)}</div><div className="article-footer"><span><div className="avatar small">JD</div> Dale Luke · {articles[0].read}</span><button className="read-button">Read write-up <ArrowUpRight size={15} /></button></div></div><div className="network-visual"><div className="visual-header"><Network size={15} /><span>TOPOLOGY / TGW-CORE-01</span><span className="live-label"><i />LIVE</span></div><div className="network-lines"><div className="network-node node-one"><Cloud size={18} /><span>prod-vpc</span></div><div className="network-node node-two"><Network size={18} /><span>transit-gw</span></div><div className="network-node node-three"><ShieldCheck size={18} /><span>inspection</span></div><div className="line line-a" /><div className="line line-b" /><div className="line line-c" /></div><div className="visual-footer"><span>3 attachments</span><span>Updated 2h ago</span></div></div></article>

          <div className="lower-grid"><section><div className="section-header compact"><div><SectionLabel>Recent activity</SectionLabel><h2>Latest from the hub</h2></div><button className="filter-button" onClick={() => setActiveFilter(activeFilter === 'All notes' ? 'Security' : 'All notes')}>{activeFilter}<ChevronRight size={14} /></button></div><div className="notes-list">{visibleArticles.slice(1).map((article) => <div className="note-row" key={article.title}><div className="note-type"><FileText size={17} /></div><div className="note-info"><div><span className={`category ${article.category === 'SECURITY' ? 'orange' : 'cyan'}`}>{article.category}</span><span className="mono">{article.date}</span></div><h3>{article.title}</h3><p>{article.tags.join(' · ')} <span>·</span> {article.read}</p></div><button className={`bookmark-button ${bookmarked ? 'saved' : ''}`} aria-label="Bookmark note" onClick={() => setBookmarked(!bookmarked)}><Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} /></button></div>)}</div></section><aside className="side-panel"><SectionLabel>Workspace pulse</SectionLabel><div className="pulse-card"><div className="pulse-chart"><div className="chart-grid" /><svg viewBox="0 0 280 88" preserveAspectRatio="none" aria-label="Activity chart"><path d="M0 71 C17 68, 20 45, 38 54 S60 75, 80 47 S105 33, 123 43 S143 28, 160 42 S181 48, 196 25 S219 39, 235 19 S260 21, 280 8" /></svg></div><div className="pulse-stat"><strong>842</strong><span>total reads</span><em>+18.6%</em></div><div className="pulse-legend"><span><i />This month</span><span>Last 30 days</span></div></div><div className="quick-actions"><SectionLabel>Quick actions</SectionLabel><Link href="/projects"><Plus size={16} /> Create a project <ArrowUpRight size={14} /></Link><Link href="/playbooks"><Terminal size={16} /> Open playbooks <ArrowUpRight size={14} /></Link></div></aside></div>
        </div>
      </section>
    </main>
  )
}

function Metric({ icon: Icon, label, value, trend, detail }: { icon: React.ElementType; label: string; value: string; trend: string; detail: string }) { return <div className="metric-card"><div className="metric-icon"><Icon size={17} /></div><span>{label}</span><strong>{value}</strong><div className="metric-trend"><em>{trend}</em> {detail}</div></div> }

export default App
