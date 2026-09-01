'use client'
import { ArrowUpRight, CheckCircle2, Clock3, Play, Terminal } from 'lucide-react'
import { useState } from 'react'
import { DataCard, PageHeading, SectionLabel, Tag, WorkspaceShell } from '@/components/workspace-shell'


const playbooks = [['Incident response: exposed access key', 'SECURITY', '8 steps', '12 min', 'Ready'],
['AWS account compromise triage', 'RESPONSE', '11 steps', '25 min', 'Ready'],
['Rotate secrets without downtime', 'OPERATIONS', '6 steps', '9 min', 'In review'],
['Contain a public S3 bucket', 'SECURITY', '7 steps', '14 min', 'Ready'],
['Evidence collection for IR', 'FORENSICS', '9 steps', '18 min', 'Ready'],
['Deploy a detective control', 'GOVERNANCE', '5 steps', '11 min', 'Draft']]


export default function Playbooks() {

    const [ran, setRan] = useState<string | null>(null);

    return <WorkspaceShell title="Playbooks">
        <PageHeading kicker="RUNBOOKS / OPERATIONAL READINESS" heading="Playbooks" lede="Repeatable response procedures for the moments when speed, clarity, and evidence matter most." action={<button className="new-button"><Terminal size={15} /> New playbook</button>} />
        <div className="section-header compact">
            <div><SectionLabel>RUNBOOK LIBRARY</SectionLabel>
                <h2>Operational procedures</h2>
            </div><span className="mono">06 PLAYBOOKS</span></div>
        <div className="playbook-grid">{playbooks.map(p => <DataCard key={p[0]} className="playbook-card">
            <div className="playbook-card-top">
                <div className="terminal-mark">&gt;_</div><Tag tone={p[1] === 'SECURITY' ? 'orange' : 'cyan'}>{p[1]}</Tag></div>
            <h3>{p[0]}</h3><div className="playbook-meta"><span><Terminal size={13} />{p[2]}</span><span><Clock3 size={13} />{p[3]}</span></div>
            <div className="playbook-footer">
                <span>{ran === p[0] ? <><CheckCircle2 size={14} /> Started</> : p[4]}</span>
                <button aria-label={`Run ${p[0]}`} onClick={() => setRan(p[0])}>{ran === p[0] ? 'Running' : 'Run playbook'} <Play size={13} /></button>
            </div></DataCard>)}</div></WorkspaceShell>
}
