/**
 * @name 批注演示
 */

import React, { useMemo } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    AudioLines,
    Bot,
    CheckCircle2,
    FileText,
    Image,
    Keyboard,
    LayoutDashboard,
    ListChecks,
    MessageSquareText,
    Mic2,
    PanelRightOpen,
    PencilLine,
    Smartphone,
    type LucideIcon,
} from 'lucide-react';
import { defineHashPageRoute, useHashPage } from '../../common/useHashPage';
import annotationCoverImage from './assets/annotation-cover.png';
import quickAnnotationFlowImage from './assets/quick-annotation-flow.png';
import quickExecutePromptImage from './assets/quick-execute-prompt.png';
import quickExecuteSkillsImage from './assets/quick-execute-skills.png';
import './style.css';

type ChapterId =
    | 'cover'
    | 'quick-flow'
    | 'voice-annotation'
    | 'common-tips'
    | 'capability-matrix'
    | 'quick-execute'
    | 'more-scenarios';

type Chapter = {
    id: ChapterId;
    nav: string;
    title: string;
    kicker: string;
    summary: string;
    icon: LucideIcon;
    tone: 'hero-dark' | 'light' | 'dark' | 'hero-light';
};

type ScreenshotFrameProps = {
    title: string;
    caption: string;
    src: string;
    alt: string;
    compact?: boolean;
};

type CapabilityRequirement = '需要' | '不需要';

type CapabilityRow = {
    feature: string;
    executionAgent: CapabilityRequirement;
    commentarySkill: CapabilityRequirement;
};

const capabilityRows: CapabilityRow[] = [
    { feature: '添加/编辑批注', executionAgent: '不需要', commentarySkill: '不需要' },
    { feature: '复制提示词', executionAgent: '不需要', commentarySkill: '不需要' },
    { feature: '文本和样式编辑', executionAgent: '不需要', commentarySkill: '不需要' },
    { feature: 'AI 自动读取批注', executionAgent: '不需要', commentarySkill: '需要' },
    { feature: 'AI 执行', executionAgent: '需要', commentarySkill: '不需要' },
    { feature: '开启需求标注', executionAgent: '不需要', commentarySkill: '不需要' },
];

const chapters: Chapter[] = [
    {
        id: 'cover',
        nav: 'Touch And Talk',
        title: 'Touch And Talk',
        kicker: 'Axhub Make · Annotation Field Note',
        summary: '老罗在早年就预见到了与 AI 最好的协作方式之一。TNT 就是最自然、最快速、最准确的与 AI 沟通方法。',
        icon: MessageSquareText,
        tone: 'hero-dark',
    },
    {
        id: 'quick-flow',
        nav: '快速批注',
        title: '快速即可体验',
        kicker: 'Workflow',
        summary: '从打开批注到告知 AI，目标是让一次局部修改在 30 秒内完成表达。',
        icon: PencilLine,
        tone: 'dark',
    },
    {
        id: 'voice-annotation',
        nav: '语音批注',
        title: 'Talk 是另一重点',
        kicker: 'Voice Note',
        summary: '语音输入效率是普通的4倍，提升 40% 的沟通效率。',
        icon: Mic2,
        tone: 'hero-light',
    },
    {
        id: 'common-tips',
        nav: '常用技巧',
        title: '四个技巧',
        kicker: 'Playbook',
        summary: '除了语音以外，还有这些辅助使用方式。',
        icon: Keyboard,
        tone: 'light',
    },
    {
        id: 'capability-matrix',
        nav: '能力条件',
        title: '批注能力条件',
        kicker: 'Requirements',
        summary: '不同功能对应不同使用条件，按实际需要选择即可。',
        icon: ListChecks,
        tone: 'light',
    },
    {
        id: 'quick-execute',
        nav: '快速执行',
        title: '站在你身旁的 AI',
        kicker: 'Execution',
        summary: '上一页先说明使用条件；这里展示两条路径：在页面上直接执行，或让配套 Skill 自动读取批注。',
        icon: PanelRightOpen,
        tone: 'dark',
    },
    {
        id: 'more-scenarios',
        nav: '更多场景',
        title: '还有这些使用场景',
        kicker: 'Scenes',
        summary: 'TNT 是一个通用的模式，在很多场景都适用。',
        icon: Smartphone,
        tone: 'light',
    },
];

const route = defineHashPageRoute(
    [
        { id: 'cover', title: 'Touch And Talk' },
        { id: 'quick-flow', title: '快速批注' },
        { id: 'voice-annotation', title: '语音批注' },
        { id: 'common-tips', title: '常用技巧' },
        { id: 'capability-matrix', title: '能力条件' },
        { id: 'quick-execute', title: '快速执行' },
        { id: 'more-scenarios', title: '更多场景' },
    ],
    { defaultPageId: 'cover' },
);

function ScreenshotFrame({ title, caption, src, alt, compact = false }: ScreenshotFrameProps) {
    return (
        <figure className={`tat-media-frame${compact ? ' is-compact' : ''}`}>
            <div className="tat-media-head">
                <span>{title}</span>
                <i aria-hidden="true" />
            </div>
            <img src={src} alt={alt} />
            <figcaption>{caption}</figcaption>
        </figure>
    );
}

function SlideChrome({ chapter, index }: { chapter: Chapter; index: number }) {
    return (
        <div className="tat-slide-chrome" aria-hidden="true">
            <span>Touch And Talk · 批注演示</span>
            <span>{String(index + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')} · {chapter.nav}</span>
        </div>
    );
}

function CoverSlide({ chapter }: { chapter: Chapter }) {
    const principles = [
        ['01', '位置不用解释', '批注天然绑定元素，AI 不需要猜“左上角那个卡片”到底是哪一个。'],
        ['02', '意图不离现场', '修改原因、视觉偏好、例外条件，都和页面一起进入上下文。'],
        ['03', '交付不是截图', '当前页面批注可以进入本地 ACP UI、CLI Agent 或配套 Skill 的执行链路，而不是停在聊天记录里。'],
    ];

    return (
        <section className="tat-slide-body tat-cover-slide">
            <div className="tat-cover-top">
                <div className="tat-cover-copy">
                    <p className="tat-kicker">{chapter.kicker}</p>
                    <h1>
                        {chapter.title.split(' ').map((word) => (
                            <span key={word}>{word}</span>
                        ))}
                    </h1>
                    <p>{chapter.summary}</p>
                    <div className="tat-cover-manifesto">
                        <span>点中元素</span>
                        <i aria-hidden="true" />
                        <span>说出想法</span>
                        <i aria-hidden="true" />
                        <span>交给 AI</span>
                    </div>
                </div>
                <div className="tat-cover-visual">
                    <ScreenshotFrame
                        title="批注演示"
                        src={annotationCoverImage}
                        alt="移动端页面中开启批注后的产品截图"
                        caption="批注后快速微调页面。"
                        compact
                    />
                </div>
            </div>
            <div className="tat-cover-principles" aria-label="核心思想">
                {principles.map(([index, title, detail]) => (
                    <article key={title}>
                        <span>{index}</span>
                        <div>
                            <h3>{title}</h3>
                            <p>{detail}</p>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function QuickFlowSlide({ chapter }: { chapter: Chapter }) {
    return (
        <section className="tat-slide-body tat-flow-slide">
            <div className="tat-section-copy">
                <p className="tat-kicker">{chapter.kicker}</p>
                <h2>{chapter.title}</h2>
                <p>{chapter.summary}</p>
            </div>
            <div className="tat-flow-layout">
                <div className="tat-flow-steps">
                    {[
                        ['开启批注', '打开原型顶部的批注入口，让页面进入可点选状态。'],
                        ['选择元素', '选中按钮、卡片、图表或文字，任意元素都可以批注。'],
                        ['输入批注', '写一句要改什么；能说清目的，比格式漂亮更重要。'],
                        ['告知 AI', '把当前页面链接或原型名称告知 AI，即可持续处理批注。'],
                    ].map(([title, detail], index) => (
                        <article key={title}>
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <h3>{title}</h3>
                            <p>{detail}</p>
                        </article>
                    ))}
                </div>
                <div className="tat-prompt-stack">
                    <ScreenshotFrame
                        title="快速批注"
                        src={quickAnnotationFlowImage}
                        alt="快速批注流程截图"
                        caption="选中页面内容后，用批注说明需求和判断依据。"
                    />
                </div>
            </div>
        </section>
    );
}

function VoiceAnnotationSlide({ chapter }: { chapter: Chapter }) {
    return (
        <section className="tat-slide-body tat-voice-slide">
            <div className="tat-section-copy">
                <p className="tat-kicker">{chapter.kicker}</p>
                <h2>{chapter.title}</h2>
                <p>{chapter.summary}</p>
            </div>
            <div className="tat-voice-layout">
                <article className="tat-voice-card tat-voice-main">
                    <AudioLines size={38} />
                    <h3>像录口播一样说</h3>
                    <p>语音批注的价值不在“更正式”，而在更快。不用担心语气，语病和错误，AI 很聪明都能理解。</p>
                    <div className="tat-transcript">
                        <span>嗯，这个元素我想改成折线图。</span>
                        <span>那个，还是不要吧，改成面积图。</span>
                        <strong>AI 以最后意图为准：改成面积图。</strong>
                    </div>
                </article>
                <div className="tat-voice-side">
                    <article>
                        <CheckCircle2 size={22} />
                        <h3>可能有利于身心健康</h3>
                        <p>AI 也会犯错。把情绪和修改意见直接说出来，是一个无害的发泄出口。</p>
                    </article>
                    <article>
                        <Bot size={22} />
                        <h3>优先豆包系</h3>
                        <p>语音输入工具优先选择豆包或支持豆包大模型，例如闪电说，中文识别更稳。</p>
                    </article>
                </div>
            </div>
        </section>
    );
}

function CommonTipsSlide({ chapter }: { chapter: Chapter }) {
    const tips: Array<{ title: string; detail: string; icon: LucideIcon }> = [
        { title: '修改文案', detail: '选中文本后双击，即可自由进行编辑。', icon: FileText },
        { title: '样式编辑', detail: '点击装饰按钮，即可像 Figma 一样编辑样式。', icon: LayoutDashboard },
        { title: '图片批注', detail: '标注输入框内可直接粘贴图片，代替大量上下文。', icon: Image },
        { title: '恢复交互', detail: '通过顶部“选择元素”的开关，可随时恢复页面交互。', icon: Keyboard },
    ];

    return (
        <section className="tat-slide-body tat-tips-slide">
            <div className="tat-section-copy">
                <p className="tat-kicker">{chapter.kicker}</p>
                <h2>{chapter.title}</h2>
                <p>{chapter.summary}</p>
            </div>
            <div className="tat-tip-grid">
                {tips.map((tip, index) => {
                    const Icon = tip.icon;
                    return (
                        <article key={tip.title}>
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <Icon size={28} />
                            <h3>{tip.title}</h3>
                            <p>{tip.detail}</p>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function CapabilityMatrixSlide({ chapter }: { chapter: Chapter }) {
    const columns: Array<{ key: keyof Pick<CapabilityRow, 'executionAgent' | 'commentarySkill'>; label: string }> = [
        { key: 'executionAgent', label: '执行 Agent' },
        { key: 'commentarySkill', label: '批注技能' },
    ];

    return (
        <section className="tat-slide-body tat-capability-slide">
            <div className="tat-section-copy">
                <p className="tat-kicker">{chapter.kicker}</p>
                <h2>{chapter.title}</h2>
                <p>{chapter.summary}</p>
            </div>
            <div className="tat-capability-table-wrap">
                <table className="tat-capability-table">
                    <caption className="tat-visually-hidden">批注能力使用条件</caption>
                    <thead>
                        <tr>
                            <th scope="col">功能</th>
                            {columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {capabilityRows.map((row) => (
                            <tr key={row.feature}>
                                <th scope="row">{row.feature}</th>
                                {columns.map((column) => {
                                    const requirement = row[column.key];
                                    return (
                                        <td key={column.key} className={requirement === '需要' ? 'is-required' : 'is-optional'}>
                                            {requirement}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <dl className="tat-capability-legend">
                <div><dt>执行 Agent</dt><dd>在工具栏中选择的执行 Agent；完成 AI 设置后，可直接执行当前页面批注。</dd></div>
                <div><dt>批注技能</dt><dd>设置中的推荐技能，用于让 AI 读取页面批注、定位元素并理解需求标注。</dd></div>
            </dl>
        </section>
    );
}

function QuickExecuteSlide({ chapter }: { chapter: Chapter }) {
    return (
        <section className="tat-slide-body tat-execute-slide">
            <div className="tat-section-copy">
                <p className="tat-kicker">{chapter.kicker}</p>
                <h2>{chapter.title}</h2>
                <p>{chapter.summary}</p>
            </div>
            <div className="tat-execute-grid">
                <article>
                    <div className="tat-execute-label">Route A</div>
                    <h3>页面上直接执行</h3>
                    <p>当前批注能力提供页面上下文，本地 ACP UI 连接已登录的 CLI Agent 后，AI 可以直接修改关联的源文件。</p>
                    <ScreenshotFrame
                        title="批注面板"
                        src={quickExecutePromptImage}
                        alt="页面批注面板中直接执行的截图"
                        caption="在页面现场写下修改意图，并直接发送给 AI。"
                        compact
                    />
                </article>
                <article>
                    <div className="tat-execute-label">Route B</div>
                    <h3>通过技能直接读取批注</h3>
                    <p>本地 ACP UI 配合配套 Skill 自动读取当前页面批注，不需要手动复制提示词。</p>
                    <ScreenshotFrame
                        title="技能读取批注"
                        src={quickExecuteSkillsImage}
                        alt="AI 技能读取页面批注的截图"
                        caption="表示 AI 自动读取当前页面批注并处理。"
                        compact
                    />
                </article>
            </div>
        </section>
    );
}

function MoreScenariosSlide({ chapter }: { chapter: Chapter }) {
    return (
        <section className="tat-slide-body tat-scenes-slide">
            <div className="tat-section-copy">
                <p className="tat-kicker">{chapter.kicker}</p>
                <h2>{chapter.title}</h2>
                <p>{chapter.summary}</p>
            </div>
            <div className="tat-scenes-grid">
                <article>
                    <FileText size={30} />
                    <h3>文档批注</h3>
                    <p>Make 中的 PRD、规格文档等，都可以通过选中文本再批注。</p>
                </article>
                <article>
                    <Smartphone size={30} />
                    <h3>移动端批注</h3>
                    <p>专门为了移动端做了优化，让你通过手机也能修改原型。</p>
                </article>
                <article>
                    <PanelRightOpen size={30} />
                    <h3>双端批注</h3>
                    <p>双端模式下也可以使用批注，一次性调好 PC + 移动端。</p>
                </article>
            </div>
        </section>
    );
}

function ChapterContent({ chapter }: { chapter: Chapter }) {
    if (chapter.id === 'cover') return <CoverSlide chapter={chapter} />;
    if (chapter.id === 'quick-flow') return <QuickFlowSlide chapter={chapter} />;
    if (chapter.id === 'voice-annotation') return <VoiceAnnotationSlide chapter={chapter} />;
    if (chapter.id === 'common-tips') return <CommonTipsSlide chapter={chapter} />;
    if (chapter.id === 'capability-matrix') return <CapabilityMatrixSlide chapter={chapter} />;
    if (chapter.id === 'quick-execute') return <QuickExecuteSlide chapter={chapter} />;
    return <MoreScenariosSlide chapter={chapter} />;
}

export default function TouchAndTalkAnnotationDemo() {
    const { page, setPage } = useHashPage(route);
    const activeIndex = Math.max(chapters.findIndex((chapter) => chapter.id === page), 0);
    const activeChapter = chapters[activeIndex] || chapters[0];

    const adjacent = useMemo(() => ({
        previous: chapters[activeIndex - 1] || null,
        next: chapters[activeIndex + 1] || null,
    }), [activeIndex]);

    return (
        <main className={`tat-shell tat-app is-${activeChapter.tone}`}>
            <aside className="tat-sidebar" aria-label="Touch And Talk 批注演示目录">
                <div className="tat-brand">
                    <p>AXHUB MAKE</p>
                    <h1>批注演示</h1>
                    <span>Style A · E-Ink Magazine</span>
                </div>
                <nav className="tat-nav">
                    {chapters.map((chapter, index) => {
                        const Icon = chapter.icon;
                        return (
                            <button
                                key={chapter.id}
                                type="button"
                                className={chapter.id === activeChapter.id ? 'is-active' : ''}
                                aria-current={chapter.id === activeChapter.id ? 'page' : undefined}
                                onClick={() => setPage(chapter.id)}
                            >
                                <small>{String(index + 1).padStart(2, '0')}</small>
                                <Icon size={18} />
                                <span>{chapter.nav}</span>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <div className="tat-stage">
                <article className="tat-slide">
                    <SlideChrome chapter={activeChapter} index={activeIndex} />
                    <ChapterContent chapter={activeChapter} />
                    <footer className="tat-slide-footer">
                        <button
                            type="button"
                            disabled={!adjacent.previous}
                            onClick={() => adjacent.previous && setPage(adjacent.previous.id)}
                        >
                            <ArrowLeft size={15} />
                            上一页
                        </button>
                        <span>{activeChapter.title}</span>
                        <button
                            type="button"
                            disabled={!adjacent.next}
                            onClick={() => adjacent.next && setPage(adjacent.next.id)}
                        >
                            下一页
                            <ArrowRight size={15} />
                        </button>
                    </footer>
                </article>
            </div>
        </main>
    );
}
