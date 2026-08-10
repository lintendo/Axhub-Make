/**
 * @name 发票限流模拟 · 生命周期复现
 */

import React from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    CircleStop,
    FileText,
    Gauge,
    Play,
    RotateCcw,
    ShieldCheck,
    TimerReset,
    Zap,
} from 'lucide-react';
import {
    FAULT_START_LIMIT,
    useFixedInvoiceSimulation,
    useFaultyInvoiceSimulation,
    type LifecycleMetrics,
    type SimulationLifecycle,
    type SimulationPhase,
} from './simulation-lifecycle';
import type { InvoiceFile } from './simulation';
import './style.css';

type Mode = 'fault' | 'fixed';

const phaseLabel: Record<SimulationPhase, string> = {
    idle: '待开始',
    running: '正在模拟',
    stopped: '已停止',
    'fault-reproduced': '已复现循环',
    completed: '运行完成',
};

const statusLabel: Record<InvoiceFile['status'], string> = {
    queued: '排队中',
    uploading: '上传中',
    'rate-limited': '429 限流',
    retrying: '退避重试',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
};

const statusTone: Record<InvoiceFile['status'], string> = {
    queued: 'neutral',
    uploading: 'blue',
    'rate-limited': 'pink',
    retrying: 'amber',
    completed: 'lime',
    failed: 'pink',
    cancelled: 'neutral',
};

function MetricCard({
    label,
    value,
    note,
    icon: Icon,
    tone = 'purple',
}: {
    label: string;
    value: number;
    note: string;
    icon: typeof Activity;
    tone?: string;
}) {
    return (
        <article className={`invoice-lab-metric invoice-lab-metric--${tone}`}>
            <div className="invoice-lab-metric-top">
                <span>{label}</span>
                <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
        </article>
    );
}

function Metrics({ metrics }: { metrics: LifecycleMetrics }) {
    return (
        <section className="invoice-lab-metrics" aria-label="生命周期指标">
            <MetricCard label="starts" value={metrics.starts} note="模拟启动次数" icon={Play} />
            <MetricCard label="cleanups" value={metrics.cleanups} note="effect 清理次数" icon={RotateCcw} tone="lime" />
            <MetricCard label="active runs" value={metrics.activeRuns} note="当前活跃任务" icon={Activity} tone="pink" />
            <MetricCard label="pending timers" value={metrics.pendingTimers} note="当前排队 timer" icon={TimerReset} tone="amber" />
            <MetricCard label="peak timers" value={metrics.peakPendingTimers} note="本次峰值 timer" icon={Gauge} />
        </section>
    );
}

function FileList({ files }: { files: InvoiceFile[] }) {
    return (
        <section className="invoice-lab-panel invoice-lab-files" aria-labelledby="invoice-files-title">
            <div className="invoice-lab-panel-heading">
                <div>
                    <p className="invoice-lab-kicker">WORK QUEUE / 16 FILES</p>
                    <h2 id="invoice-files-title">发票上传队列</h2>
                </div>
                <span className="invoice-lab-count">{files.filter((file) => file.status === 'completed').length} / {files.length} 完成</span>
            </div>
            <div className="invoice-lab-file-grid">
                {files.map((file) => (
                    <article className="invoice-lab-file" key={file.id}>
                        <div className="invoice-lab-file-icon"><FileText size={17} aria-hidden="true" /></div>
                        <div className="invoice-lab-file-main">
                            <div className="invoice-lab-file-name" title={file.name}>{file.name}</div>
                            <div className="invoice-lab-file-meta">
                                <span>{file.sizeLabel}</span>
                                {file.retries > 0 ? <span>retry ×{file.retries}</span> : null}
                            </div>
                            <div className="invoice-lab-progress" aria-label={`${file.name} ${file.progress}%`}>
                                <span style={{ width: `${file.progress}%` }} />
                            </div>
                        </div>
                        <span className={`invoice-lab-status invoice-lab-status--${statusTone[file.status]}`}>
                            {statusLabel[file.status]}
                        </span>
                    </article>
                ))}
            </div>
        </section>
    );
}

function EventLog({ lifecycle }: { lifecycle: SimulationLifecycle }) {
    return (
        <section className="invoice-lab-panel invoice-lab-events" aria-labelledby="invoice-events-title">
            <div className="invoice-lab-panel-heading">
                <div>
                    <p className="invoice-lab-kicker">TRACE / LAST 12 EVENTS</p>
                    <h2 id="invoice-events-title">事件时间线</h2>
                </div>
                <span className="invoice-lab-live"><i /> LIVE</span>
            </div>
            <div className="invoice-lab-event-list" aria-live="polite">
                {lifecycle.events.length === 0 ? (
                    <div className="invoice-lab-empty">点击上方按钮开始记录生命周期事件。</div>
                ) : lifecycle.events.slice(-12).reverse().map((event) => (
                    <div className={`invoice-lab-event invoice-lab-event--${event.kind}`} key={event.id}>
                        <span className="invoice-lab-event-dot" />
                        <span className="invoice-lab-event-kind">{event.kind}</span>
                        <span className="invoice-lab-event-message">{event.message}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function DiagnosticPanel({ lifecycle, mode }: { lifecycle: SimulationLifecycle; mode: Mode }) {
    const isRunning = lifecycle.phase === 'running';
    const isFault = mode === 'fault';
    const isWarning = lifecycle.phase === 'fault-reproduced' || (isFault && isRunning);

    return (
        <>
            <div className={`invoice-lab-result invoice-lab-result--${isWarning ? 'warning' : lifecycle.phase === 'completed' ? 'success' : 'neutral'}`} role="status">
                <div className="invoice-lab-result-icon">
                    {isWarning ? <AlertTriangle size={20} /> : lifecycle.phase === 'completed' ? <CheckCircle2 size={20} /> : <Zap size={20} />}
                </div>
                <div>
                    <strong>{phaseLabel[lifecycle.phase]}</strong>
                    <p>{isWarning
                        ? `startSimulation 因 files 变化重新创建，已触发 ${FAULT_START_LIMIT} 次受控重启。`
                        : lifecycle.phase === 'completed'
                            ? 'AbortController、稳定 callback 与功能性 setState 共同保持单次生命周期。'
                            : '先观察故障模式的指标，再切换到修复模式验证资源是否归零。'}</p>
                </div>
                <span className="invoice-lab-result-arrow"><ArrowRight size={17} /></span>
            </div>
            <Metrics metrics={lifecycle.metrics} />
            <div className="invoice-lab-actions">
                <button className="invoice-lab-button invoice-lab-button--primary" type="button" onClick={lifecycle.start} disabled={isRunning}>
                    <Play size={16} fill="currentColor" /> {isFault ? '开始复现' : '运行修复模拟'}
                </button>
                <button className="invoice-lab-button invoice-lab-button--secondary" type="button" onClick={lifecycle.stop} disabled={!isRunning}>
                    <CircleStop size={16} /> 停止并清理
                </button>
                <button className="invoice-lab-button invoice-lab-button--ghost" type="button" onClick={lifecycle.reset}>
                    <RotateCcw size={16} /> 重置
                </button>
            </div>
            <FileList files={lifecycle.files} />
            <EventLog lifecycle={lifecycle} />
        </>
    );
}

function FaultDiagnosticPanel() {
    const lifecycle = useFaultyInvoiceSimulation();
    return <DiagnosticPanel lifecycle={lifecycle} mode="fault" />;
}

function FixedDiagnosticPanel() {
    const lifecycle = useFixedInvoiceSimulation();
    return <DiagnosticPanel lifecycle={lifecycle} mode="fixed" />;
}

export default function InvoiceRateLimitA() {
    const [mode, setMode] = React.useState<Mode>('fault');

    return (
        <main className="invoice-lab">
            <header className="invoice-lab-header">
                <div className="invoice-lab-brand">
                    <span className="invoice-lab-brand-mark"><span /><span /><span /></span>
                    <span>AXHUB / LAB 07</span>
                </div>
                <div className="invoice-lab-header-meta"><span>RUNTIME DIAGNOSTIC</span><span>2026.08</span></div>
            </header>

            <div className="invoice-lab-shell">
                <section className="invoice-lab-hero">
                    <div className="invoice-lab-hero-copy">
                        <p className="invoice-lab-kicker">REPRODUCTION PROTOTYPE · INVOICE RATE LIMIT A</p>
                        <h1>当 effect 遇上<br /><em>无限重启。</em></h1>
                        <p className="invoice-lab-lede">一个最小化的 16 文件上传模拟，用可观测指标复现 callback 依赖链带来的生命周期抖动，并验证可取消的修复方案。</p>
                    </div>
                    <div className="invoice-lab-hero-aside">
                        <span className="invoice-lab-aside-index">01 / 02</span>
                        <p>先复现，再修复。<br />每一项指标都来自真实的 React state。</p>
                        <ShieldCheck size={28} strokeWidth={1.5} aria-hidden="true" />
                    </div>
                </section>

                <section className="invoice-lab-mode-switch" aria-label="模拟模式">
                    <button type="button" className={mode === 'fault' ? 'is-active is-fault' : ''} onClick={() => setMode('fault')}>
                        <span className="invoice-lab-mode-number">A</span>
                        <span><strong>故障复现</strong><small>依赖循环 · 有界重启</small></span>
                        {mode === 'fault' ? <ArrowRight size={17} /> : null}
                    </button>
                    <button type="button" className={mode === 'fixed' ? 'is-active is-fixed' : ''} onClick={() => setMode('fixed')}>
                        <span className="invoice-lab-mode-number">B</span>
                        <span><strong>生命周期修复</strong><small>稳定 callback · 可取消 timer</small></span>
                        {mode === 'fixed' ? <ArrowRight size={17} /> : null}
                    </button>
                </section>

                <section className="invoice-lab-stage" aria-label={`${mode === 'fault' ? '故障复现' : '生命周期修复'}模拟`}>
                    {mode === 'fault' ? <FaultDiagnosticPanel key="fault" /> : <FixedDiagnosticPanel key="fixed" />}
                </section>

                <footer className="invoice-lab-footer">
                    <span><span className="invoice-lab-footer-dot" /> NO ANNOTATION VIEWER · ROOT CAUSE ISOLATED</span>
                    <span>React 18.2 / deterministic mock / no network</span>
                </footer>
            </div>
        </main>
    );
}
