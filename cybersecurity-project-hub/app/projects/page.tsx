'use client'
import { ArrowUpRight, FolderKanban, GitBranch, ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { DataCard, DetailModal, Metric, PageHeading, SectionLabel, Tag, WorkspaceShell } from '../../components/ui/app-shell'
import projects from '@/data/projects.json'

export default function Projects() {
    const [selected, setSelected] = useState<(typeof projects)[number] | null>(null);

    return <WorkspaceShell title="Projects">
        <PageHeading kicker="DELIVERY / 06 ACTIVE PROJECTS" heading="Projects" lede="Track architecture work, security initiatives, and the systems moving from idea to production." action={<button className="new-button">
            <FolderKanban size={15} /> New project</button>} />

        <div className="metrics-grid">
            <Metric label="Active projects" value="06" detail="this week" />
            <Metric label="Contributors" value="08" detail="across teams" />
            <Metric label="Controls shipped" value="42" detail="this quarter" />
            <Metric label="Delivery health" value="94%" detail="vs last month" />
        </div>

        <div className="section-header compact">
            <div><SectionLabel>PORTFOLIO</SectionLabel>
                <h2>Current initiatives</h2>
            </div>

            <span className="mono">LAST UPDATED 2H AGO</span></div>

        <div className="project-grid">{projects.map(p => <DataCard key={p.title} className="project-card" onClick={() => setSelected(p)}>
            <div className="project-card-top">
                <div className="project-icon">
                    <ShieldCheck size={18} /></div><Tag tone={p.status === 'ACTIVE' ? 'cyan' : 'orange'}>{p.status}</Tag>
            </div>

            <h3>{p.title}</h3><p>{p.description}</p>

            <div className="project-meta"><span>
                <GitBranch size={13} />{p.stack}</span><span>
                    <Users size={13} />{p.owners}</span></div><div className="progress-track"><i style={{ width: p.progress }} /></div><div className="project-footer"><span>{p.progress} complete</span>
                <ArrowUpRight size={15} /></div>
        </DataCard>)}</div>{selected && <DetailModal open onClose={() => setSelected(null)} title={selected.title} category={selected.status} image={selected.image}><p className="modal-lede">{selected.description}</p>
            <p className="modal-copy">{selected.detail}</p>
            <div className="modal-facts"><span>STACK<strong>{selected.stack}</strong></span><span>STATUS<strong>{selected.status}</strong></span><span>MILESTONES<strong>{selected.milestones}</strong></span></div>
        </DetailModal>}
    </WorkspaceShell>
}