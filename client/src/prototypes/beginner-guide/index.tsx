/**
 * @name 新手指导
 */

import React, { useMemo, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Copy,
    ExternalLink,
} from 'lucide-react';
import accessLinkMenuImage from './assets/access-link-menu.png';
import addPageToChatImage from './assets/add-page-to-chat.png';
import annotationToolbarImage from './assets/annotation-toolbar.png';
import exportMenuImage from './assets/export-menu.png';
import openAiButtonImage from './assets/open-ai-button.png';
import planModeMenuImage from './assets/plan-mode-menu.png';
import workbuddyTraeSoloNewProjectImage from './assets/workbuddy-trae-solo-new-project.png';
import { defineHashPageRoute, useHashPage } from '../../common/useHashPage';
import { copyTextToClipboard } from './clipboard';
import './style.css';

type GuideChapter = {
    id: string;
    title: string;
    eyebrow: string;
    summary: string;
    sections: string[];
    highlights: string[];
    note: string;
    wordCount: string;
    duration: string;
};

type AgentOption = {
    name: string;
    description: string;
    difficulty: string;
    ability: string;
    href: string;
};

type ModelRecommendation = {
    name: string;
    vendor: string;
    feature: string;
};

type InstructionTip = {
    title: string;
    detail: string;
};

type GuideShellProps = {
    config?: {
        projectPath?: string | null;
    };
};

const agentOptions: AgentOption[] = [
    {
        name: 'ChatGPT',
        description: '性价比综合高，软件简单，但模型单一',
        difficulty: '较难',
        ability: '强',
        href: 'https://chatgpt.com/',
    },
    {
        name: 'Cursor',
        description: '费用高，模型齐全，软件体验好',
        difficulty: '简单',
        ability: '强',
        href: 'https://cursor.com/',
    },
    {
        name: 'TRAE CN 系列',
        description: '中文友好，国内版免费',
        difficulty: '简单',
        ability: '一般',
        href: 'https://www.trae.ai/download',
    },
    {
        name: 'WorkBuddy',
        description: '中文友好，使用简单',
        difficulty: '简单',
        ability: '一般',
        href: 'https://www.codebuddy.cn/docs/workbuddy/Overview',
    },
];

const modelRecommendations: ModelRecommendation[] = [
    {
        name: 'GPT-5.6',
        vendor: 'OpenAI',
        feature: '适合处理复杂问题和任务，性价比高',
    },
    {
        name: 'Claude Opus 4.8',
        vendor: 'Anthropic',
        feature: '综合能力强，但价格高，适合规划',
    },
    {
        name: 'Grok 4.5',
        vendor: 'xAI',
        feature: '综合能力强，速度快，性价比高',
    },
    {
        name: 'GLM-5.2',
        vendor: '智谱 AI',
        feature: '国产平替，综合能力强，不支持多模态',
    },
    {
        name: 'Kimi K2.7',
        vendor: 'Moonshot',
        feature: '国产平替，UI/UX 设计能力优秀',
    },
    {
        name: 'DeepSeek V4 Pro',
        vendor: 'DeepSeek',
        feature: '国产平替，性价比高，综合能力强，不支持多模态',
    },
];

const instructionTips: InstructionTip[] = [
    {
        title: '一个任务开一个新对话',
        detail: '避免上下文干扰。改按钮就只聊按钮，做页面就重新开一轮。',
    },
    {
        title: '安装语音输入',
        detail: '推荐豆包、闪电说。输入效率提升 4 倍，沟通效率增加 40%。',
    },
    {
        title: '多提供图片',
        detail: '设计参考、调整反馈、Bug 反馈都可以截图。图片的效率远高于文字。',
    },
];

const guideRoute = defineHashPageRoute([
    { id: 'install-agent', title: '安装 Agent' },
    { id: 'choose-model', title: '选对模型' },
    { id: 'give-instructions', title: '给 AI 下达指令' },
    { id: 'create-prototype', title: '创建原型' },
    { id: 'edit-prototype', title: '编辑原型' },
    { id: 'publish-prototype', title: '发布原型' },
    { id: 'advanced-guide', title: '获取帮助' },
], { defaultPageId: 'install-agent' });

const chapters: GuideChapter[] = [
    {
        id: 'install-agent',
        title: '安装 Agent',
        eyebrow: '第 01 章',
        summary: '选一个你顺手的 AI 工具，把 Axhub Make 项目打开，然后做一次简单确认。',
        sections: ['选择工具', '打开项目', '验证成功'],
        highlights: ['已选择一个 Agent', '已在 Agent 中打开本项目', 'AI 回复“已打开正确项目”'],
        note: 'Agent 就是会帮你写代码的 AI 工具。Axhub Make 支持市面上主流的 Agent，不管是 IDE、CLI，还是在线工具，都能用。你只要挑一个顺手的，后面让 AI 做的步骤都发给它。',
        wordCount: '约 900 字',
        duration: '5 分钟',
    },
    {
        id: 'choose-model',
        title: '选对模型',
        eyebrow: '第 02 章',
        summary: '先手动选推荐模型，不要一上来就用 Auto。',
        sections: ['模型优先级', '避开 Auto', '对话框入口'],
        highlights: ['已选择推荐模型之一', '未使用非 Cursor 的 Auto', '知道在输入框附近切换模型'],
        note: '选择模型是新手最容易忽略、但最影响结果的一步。先把模型选对，再谈提示词和细节修改。',
        wordCount: '约 500 字',
        duration: '3 分钟',
    },
    {
        id: 'give-instructions',
        title: '给 AI 下达指令',
        eyebrow: '第 03 章',
        summary: '大胆说清楚你的想法，再用图片和新对话降低沟通成本。',
        sections: ['沟通心态', '三个技巧', '练习任务'],
        highlights: ['已用普通话描述任务', '已准备截图或参考图', '已复制练习提示词并发给 AI'],
        note: '和 AI 沟通不用端着。先把想法说出来，再让它按规范落地。',
        wordCount: '约 700 字',
        duration: '5 分钟',
    },
    {
        id: 'create-prototype',
        title: '创建原型',
        eyebrow: '第 04 章',
        summary: '直接说想法，让 AI 补全需求和设计，再生成原型。',
        sections: ['直接说需求', '补全信息', '练习任务'],
        highlights: ['知道清晰需求只要先说 3 项', '知道想法不完整时可以让 AI 补全', '已复制快递官网首页练习提示词'],
        note: '创建原型不用写方案。先把想法说出来，再让 AI 帮你补齐。',
        wordCount: '约 500 字',
        duration: '4 分钟',
    },
    {
        id: 'edit-prototype',
        title: '编辑原型',
        eyebrow: '第 05 章',
        summary: '直接说哪里要改，用截图、浏览器和批注减少来回沟通。',
        sections: ['直接描述', '带上页面', '使用批注'],
        highlights: ['会用截图、标注和语音描述修改', '知道把浏览器页面添加到对话', '知道用 Axhub Make 批注让 AI 执行'],
        note: '编辑原型不是写长需求。指出位置，说清变化，最好带图。',
        wordCount: '约 700 字',
        duration: '5 分钟',
    },
    {
        id: 'publish-prototype',
        title: '发布原型',
        eyebrow: '第 06 章',
        summary: '记住两个入口：右上角菜单负责发布和导出，项目菜单负责开发环境访问。',
        sections: ['右上角菜单', '项目菜单'],
        highlights: ['知道右上角菜单可以发布和导出', '知道可以导出 Axure、Figma 和 HTML', '会从项目菜单获取开发环境的局域网地址'],
        note: '发布原型主要看两个菜单。右上角菜单用于云端发布和文件导出；项目菜单用于获取开发环境的局域网地址。',
        wordCount: '约 500 字',
        duration: '4 分钟',
    },
    {
        id: 'advanced-guide',
        title: '获取帮助',
        eyebrow: '第 07 章',
        summary: '遇到问题时，你可以加入 Axhub 社群，也可以让 AI 按文档一步步指导你。',
        sections: ['加入 Axhub 社群', '让 AI 指导你'],
        highlights: ['知道从 Axhub 官网加入社群', '知道可以让 AI 指导使用 Axhub Make', '已复制 AI 指导提示词'],
        note: '遇到问题不用自己摸索。你可以从 Axhub 官网加入社群，也可以把指导文档交给 AI，让 AI 按文档陪你排查和操作。',
        wordCount: '约 300 字',
        duration: '2 分钟',
    },
];

function getProjectPath(config?: GuideShellProps['config']) {
    return String(config?.projectPath || '').trim();
}

function createVerificationPrompt(projectPath: string) {
    const pathLine = projectPath || '当前页面暂未拿到项目目录，请回到 Axhub Make 管理页打开本项目。';
    return [
        '请帮我确认一下：你现在打开的项目，是不是下面这个目录：',
        '',
        pathLine,
        '',
        '不要修改任何文件，只需要检查目录。',
        '',
        '如果你已经在这个项目里，请只回复：',
        '已打开正确项目',
        '',
        '如果不是，请告诉我现在打开的是哪个目录，并提醒我重新打开正确项目。',
    ].join('\n');
}

type CopyStatus = 'idle' | 'copied' | 'failed';

function getCopyButtonLabel(copyStatus: CopyStatus) {
    if (copyStatus === 'copied') return '已复制';
    if (copyStatus === 'failed') return '复制失败';
    return '复制';
}

function usePromptClipboard(prompt: string) {
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

    const handleCopyPrompt = async () => {
        const didCopy = await copyTextToClipboard(prompt);
        setCopyStatus(didCopy ? 'copied' : 'failed');
        window.setTimeout(() => setCopyStatus('idle'), didCopy ? 1400 : 2200);
    };

    return { copyStatus, handleCopyPrompt };
}

function InstallAgentChapter({ projectPath }: { projectPath: string }) {
    const prompt = useMemo(() => createVerificationPrompt(projectPath), [projectPath]);
    const { copyStatus, handleCopyPrompt } = usePromptClipboard(prompt);

    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="install-intro-title">
                <h3 className="beginner-guide-section-title" id="install-intro-title">先选一个 Agent</h3>
                <p className="beginner-guide-lede">
                    这里的 Agent，就是你接下来要对话的 AI 编程工具。Axhub Make 不挑工具：IDE、CLI、在线 Agent 都可以。
                    下面这张表列的是我们推荐的 Agent 应用，先挑一个自己顺手的，后面所有“让 AI 做”的步骤都发给它。
                </p>

                <div className="beginner-guide-agent-table-wrap">
                    <table className="beginner-guide-agent-table">
                        <thead>
                            <tr>
                                <th>名称</th>
                                <th>简介</th>
                                <th>上手</th>
                                <th>能力</th>
                                <th>官网</th>
                            </tr>
                        </thead>
                        <tbody>
                            {agentOptions.map((agent) => (
                                <tr key={agent.name}>
                                    <td>{agent.name}</td>
                                    <td>{agent.description}</td>
                                    <td>{agent.difficulty}</td>
                                    <td>{agent.ability}</td>
                                    <td>
                                        <a href={agent.href} target="_blank" rel="noreferrer">
                                            打开
                                            <ExternalLink size={13} />
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="open-project-title">
                <h3 className="beginner-guide-section-title" id="open-project-title">在 Agent 中打开这个项目</h3>
                <div className="beginner-guide-step-list">
                    <article className="beginner-guide-step-card">
                        <div className="beginner-guide-step-copy">
                            <span>1</span>
                            <div>
                                <h4>在 Make 首页打开 Agent 软件</h4>
                                <p>在 Axhub Make 左上角点击“打开 AI”按钮，系统会自动把正确项目打开。你只要确认 Agent 已经启动即可。</p>
                            </div>
                        </div>
                        <figure className="beginner-guide-step-image">
                            <img src={openAiButtonImage} alt="Axhub Make 左上角的打开 AI 按钮" />
                        </figure>
                    </article>
                    <article className="beginner-guide-step-card">
                        <div className="beginner-guide-step-copy">
                            <span>2</span>
                            <div>
                                <h4>在 Agent 软件中打开 Make 项目</h4>
                                <p>如果你用 WorkBuddy、TRAE Work、ChatGPT 这类工具，请在新建项目时，把这个目录加入进去。</p>
                            </div>
                        </div>
                        <figure className="beginner-guide-step-image">
                            <img src={workbuddyTraeSoloNewProjectImage} alt="WorkBuddy、TRAE Work、ChatGPT 新建项目时选择工作空间" />
                        </figure>
                    </article>
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="verify-project-title">
                <h3 className="beginner-guide-section-title" id="verify-project-title">最后做一次确认</h3>
                <p>
                    把下面这段话发给 AI。只要 AI 回复“已打开正确项目”，这一章就完成了。
                </p>
                <div className="beginner-guide-prompt-card">
                    <div className="beginner-guide-prompt-head">
                        <span>发给 AI 的提示词</span>
                        <button type="button" onClick={handleCopyPrompt} aria-live="polite">
                            <Copy size={14} />
                            {getCopyButtonLabel(copyStatus)}
                        </button>
                    </div>
                    <pre>{prompt}</pre>
                </div>
            </section>
        </>
    );
}

function ChooseModelChapter() {
    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="model-importance-title">
                <h3 className="beginner-guide-section-title" id="model-importance-title">先选推荐模型</h3>
                <p className="beginner-guide-lede">
                    模型就是 AI 的“大脑”。先选对，后面更稳。
                </p>
                <p>
                    新手先从下面这张表里选，不用研究更多模型。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="model-auto-title">
                <h3 className="beginner-guide-section-title" id="model-auto-title">不要盲信 Auto</h3>
                <p>
                    除了 Cursor，绝大多数 Agent 的 Auto 都不可信。看到 Auto，就换成表里的模型。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="model-table-title">
                <h3 className="beginner-guide-section-title" id="model-table-title">推荐模型</h3>

                <div className="beginner-guide-agent-table-wrap">
                    <table className="beginner-guide-agent-table beginner-guide-model-table">
                        <thead>
                            <tr>
                                <th>模型名称</th>
                                <th>厂商</th>
                                <th>特点</th>
                            </tr>
                        </thead>
                        <tbody>
                            {modelRecommendations.map((model) => (
                                <tr key={model.name}>
                                    <td>{model.name}</td>
                                    <td>{model.vendor}</td>
                                    <td>{model.feature}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="model-entry-title">
                <h3 className="beginner-guide-section-title" id="model-entry-title">模型入口通常在对话框</h3>
                <article className="beginner-guide-step-card beginner-guide-model-entry-card">
                    <div className="beginner-guide-step-copy">
                        <span>1</span>
                        <div>
                            <h4>看输入框附近</h4>
                            <p>
                                一般 Agent 的模型选择入口，都在输入框附近。
                            </p>
                            <p>
                                如果看到 Auto，就直接换成表里的模型。
                            </p>
                        </div>
                    </div>
                    <figure className="beginner-guide-step-image">
                        <img src={planModeMenuImage} alt="对话框中的 Plan 模式选择入口" />
                    </figure>
                </article>
            </section>
        </>
    );
}

const practicePrompt = [
    '请帮我修改第 03 章里的练习卡片。',
    '',
    '我想这样改：',
    '1. 标题改成：先试着和 AI 说一句',
    '2. 正文改成：不用写完美提示词，先把想法说清楚。',
    '3. 卡片颜色稍微更醒目一点，但不要跳出当前页面风格。',
    '',
    '改完后告诉我你改了哪些文字和样式。',
].join('\n');

const createPrototypePrompt = [
    '请帮我生成一个快递官网首页原型。',
    '面向个人寄件和小商家用户。',
].join('\n');

function GiveInstructionsChapter() {
    const { copyStatus, handleCopyPrompt } = usePromptClipboard(practicePrompt);

    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="instruction-mindset-title">
                <h3 className="beginner-guide-section-title" id="instruction-mindset-title">先正常沟通</h3>
                <p className="beginner-guide-lede">
                    大胆沟通。现在的 AI 很聪明，不需要背提示词模板，像和同事说话一样讲清楚就行。
                </p>
                <p>
                    谨慎预期。你从一个人工作，变成你和 AI 一起工作，会多一层沟通成本。新手期先追求稳定，不要急着追效率。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="instruction-cost-title">
                <h3 className="beginner-guide-section-title" id="instruction-cost-title">先接受沟通成本</h3>
                <div className="beginner-guide-flowcards" aria-label="AI 协作沟通成本流程图">
                    <article className="beginner-guide-flowcard">
                        <div className="beginner-guide-flowcard-head">
                            <strong>单人工作</strong>
                            <span>SOLO</span>
                        </div>
                        <div className="beginner-guide-flowcard-canvas">
                            <div className="beginner-guide-flowstack">
                                <span className="beginner-guide-flow-step">收到需求</span>
                                <span className="beginner-guide-flow-arrow" aria-hidden="true">↓</span>
                                <span className="beginner-guide-flow-step">构思方案</span>
                                <span className="beginner-guide-flow-arrow" aria-hidden="true">↓</span>
                                <span className="beginner-guide-flow-step">自己执行</span>
                            </div>
                        </div>
                        <p>自己想清楚后，直接执行。</p>
                    </article>
                    <article className="beginner-guide-flowcard beginner-guide-flowcard-ai">
                        <div className="beginner-guide-flowcard-head">
                            <strong>你 + AI</strong>
                            <span>WITH AI</span>
                        </div>
                        <div className="beginner-guide-flowcard-canvas beginner-guide-flowcard-canvas-ai">
                            <div className="beginner-guide-ai-flow" aria-label="AI 生成与执行流程">
                                <span className="beginner-guide-flow-step beginner-guide-flow-step--compact beginner-guide-ai-flow-step-1">收到需求</span>
                                <span className="beginner-guide-flow-arrow beginner-guide-ai-flow-arrow-12" aria-hidden="true">→</span>
                                <span className="beginner-guide-flow-step beginner-guide-flow-step--compact beginner-guide-flow-step-extra beginner-guide-flow-step--communication beginner-guide-ai-flow-step-2">
                                    <span>告知 AI</span>
                                    <small>沟通</small>
                                </span>
                                <span className="beginner-guide-flow-arrow beginner-guide-ai-flow-arrow-23" aria-hidden="true">→</span>
                                <span className="beginner-guide-flow-step beginner-guide-flow-step--compact beginner-guide-ai-flow-step-3">AI 生成方案</span>
                                <span className="beginner-guide-flow-arrow beginner-guide-ai-flow-arrow-34" aria-hidden="true">↓</span>
                                <span className="beginner-guide-flow-step beginner-guide-flow-step--compact beginner-guide-flow-step-extra beginner-guide-flow-step--communication beginner-guide-ai-flow-step-4">
                                    <span>确认方案</span>
                                    <small>沟通</small>
                                </span>
                                <span className="beginner-guide-flow-arrow beginner-guide-ai-flow-arrow-54" aria-hidden="true">←</span>
                                <span className="beginner-guide-flow-step beginner-guide-flow-step--compact beginner-guide-ai-flow-step-5">AI 执行</span>
                                <span className="beginner-guide-flow-arrow beginner-guide-ai-flow-arrow-65" aria-hidden="true">←</span>
                                <span className="beginner-guide-flow-step beginner-guide-flow-step--compact beginner-guide-flow-step-extra beginner-guide-flow-step--communication beginner-guide-ai-flow-step-6">
                                    <span>验收执行</span>
                                    <small>沟通</small>
                                </span>
                            </div>
                        </div>
                        <p>多出很多沟通成本，所以新手先追求稳定，再追求效率。</p>
                    </article>
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="instruction-uncertainty-title">
                <h3 className="beginner-guide-section-title" id="instruction-uncertainty-title">接受 AI 的不稳定性</h3>
                <p className="beginner-guide-lede">
                    这也是 Vibe Coding / Vibe Design 的特点：人负责方向和验收，但单次结果与完成时间不完全可预测。
                </p>
                <div className="beginner-guide-flowcards beginner-guide-uncertainty-cards">
                    <article className="beginner-guide-flowcard">
                        <div className="beginner-guide-flowcard-head">
                            <strong>效果不确定性</strong>
                            <span>RESULT</span>
                        </div>
                        <div className="beginner-guide-flowcard-canvas">
                            <div className="beginner-guide-uncertainty-effect-flow" aria-label="同一个提示词产生不同结果">
                                <span className="beginner-guide-flow-step beginner-guide-uncertainty-prompt">同一个提示词</span>
                                <span className="beginner-guide-flow-arrow beginner-guide-uncertainty-arrow-left" aria-hidden="true">↙</span>
                                <span className="beginner-guide-flow-arrow beginner-guide-uncertainty-arrow-right" aria-hidden="true">↘</span>
                                <span className="beginner-guide-flow-step beginner-guide-uncertainty-result-a">结果 A</span>
                                <span className="beginner-guide-flow-step beginner-guide-uncertainty-result-b">结果 B</span>
                            </div>
                        </div>
                        <p>同一个提示词，也可能得到不同结果。人需要判断方向，并决定保留哪一个。</p>
                    </article>
                    <article className="beginner-guide-flowcard">
                        <div className="beginner-guide-flowcard-head">
                            <strong>时间不确定性</strong>
                            <span>TIME</span>
                        </div>
                        <div className="beginner-guide-flowcard-canvas">
                            <div className="beginner-guide-uncertainty-time-flow" aria-label="任务完成时间存在波动">
                                <span className="beginner-guide-flow-step">任务开始</span>
                                <span className="beginner-guide-flow-arrow" aria-hidden="true">→</span>
                                <span className="beginner-guide-flow-step beginner-guide-flow-step-extra">
                                    <span>反复调整</span>
                                    <small>次数不定</small>
                                </span>
                                <span className="beginner-guide-flow-arrow" aria-hidden="true">→</span>
                                <span className="beginner-guide-flow-step">任务完成</span>
                            </div>
                        </div>
                        <p>单个任务的完成时间会波动。评估 AI 协作时，看一段时间内的平均效率提升。</p>
                    </article>
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="instruction-tips-title">
                <h3 className="beginner-guide-section-title" id="instruction-tips-title">三个技巧</h3>
                <div className="beginner-guide-card-grid beginner-guide-tip-grid">
                    {instructionTips.map((tip, index) => (
                        <article className="beginner-guide-outline-card beginner-guide-tip-card" key={tip.title}>
                            <span className="beginner-guide-outline-index">{index + 1}</span>
                            <h4>{tip.title}</h4>
                            <p>{tip.detail}</p>
                        </article>
                    ))}
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="instruction-practice-title">
                <h3 className="beginner-guide-section-title" id="instruction-practice-title">练习一下</h3>
                <article className="beginner-guide-practice-card">
                    <span>练习卡片</span>
                    <h4>让 AI 改一张卡片</h4>
                    <p>这次只改文字和一点样式。随便一点，不用写得像命令。</p>
                </article>
                <p>
                    复制下面这段话发给 AI。改完就行，这一章就算完成。
                </p>
                <div className="beginner-guide-prompt-card">
                    <div className="beginner-guide-prompt-head">
                        <span>发给 AI 的提示词</span>
                        <button type="button" onClick={handleCopyPrompt} aria-live="polite">
                            <Copy size={14} />
                            {getCopyButtonLabel(copyStatus)}
                        </button>
                    </div>
                    <pre>{practicePrompt}</pre>
                </div>
            </section>
        </>
    );
}

function CreatePrototypeChapter() {
    const { copyStatus, handleCopyPrompt } = usePromptClipboard(createPrototypePrompt);

    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="create-start-title">
                <h3 className="beginner-guide-section-title" id="create-start-title">直接说你要什么</h3>
                <p className="beginner-guide-lede">
                    创建原型不用写方案，直接跟 AI 讲你的需求就可以了。
                </p>
                <p>
                    清楚时，只说 <mark className="beginner-guide-inline-mark">3 项</mark>：做什么、给谁用、看起来像什么。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="create-clear-title">
                <h3 className="beginner-guide-section-title" id="create-clear-title">需求清楚时，说这三项</h3>
                <div className="beginner-guide-card-grid beginner-guide-compact-grid">
                    <article className="beginner-guide-outline-card">
                        <span className="beginner-guide-outline-index">01</span>
                        <h4>要做什么</h4>
                        <p>官网首页 / 后台列表 / 活动页</p>
                    </article>
                    <article className="beginner-guide-outline-card">
                        <span className="beginner-guide-outline-index">02</span>
                        <h4>给谁用</h4>
                        <p>新客户 / 门店店员 / 小商家</p>
                    </article>
                    <article className="beginner-guide-outline-card">
                        <span className="beginner-guide-outline-index">03</span>
                        <h4>看起来像什么</h4>
                        <p>模块 / 风格 / 参考图</p>
                    </article>
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="create-unclear-title">
                <h3 className="beginner-guide-section-title" id="create-unclear-title">没想清楚也没关系</h3>
                <p>
                    Axhub Make 内置了多个技能，会帮你补全需求；还有 <mark className="beginner-guide-inline-mark">80+</mark> 设计主题，会帮你补全设计。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="create-plan-title">
                <h3 className="beginner-guide-section-title" id="create-plan-title">重要提醒</h3>
                <article className="beginner-guide-step-card beginner-guide-model-entry-card">
                    <div className="beginner-guide-step-copy">
                        <span>!</span>
                        <div>
                            <h4>先用计划 / spec 模式</h4>
                            <p>
                                优先使用编辑器自带的计划模式或 spec 模式，先让 AI 写计划，再确认生成。
                            </p>
                        </div>
                    </div>
                    <figure className="beginner-guide-step-image">
                        <img src={planModeMenuImage} alt="编辑器对话框中的计划模式入口" />
                    </figure>
                </article>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="create-practice-title">
                <h3 className="beginner-guide-section-title" id="create-practice-title">练习一下</h3>
                <article className="beginner-guide-practice-card">
                    <span>练习任务</span>
                    <h4>生成快递官网首页</h4>
                    <p>这次只给一个简单方向，看 AI 如何自动补全内容和设计。</p>
                </article>
                <p>
                    复制下面这句话发给 AI。简单一点就够了。
                </p>
                <div className="beginner-guide-prompt-card">
                    <div className="beginner-guide-prompt-head">
                        <span>发给 AI 的提示词</span>
                        <button type="button" onClick={handleCopyPrompt} aria-live="polite">
                            <Copy size={14} />
                            {getCopyButtonLabel(copyStatus)}
                        </button>
                    </div>
                    <pre>{createPrototypePrompt}</pre>
                </div>
            </section>
        </>
    );
}

function EditPrototypeChapter() {
    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="edit-start-title">
                <h3 className="beginner-guide-section-title" id="edit-start-title">你的这个需求</h3>
                <p className="beginner-guide-lede">
                    编辑原型先直接描述：哪个区域、改成什么样、为什么要改。
                </p>
                <p>
                    不确定怎么说，就多用截图 + 标注，多用语音。越贴近你看到的问题，AI 越容易改准。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="edit-method-title">
                <h3 className="beginner-guide-section-title" id="edit-method-title">三种更省事的方式</h3>
                <div className="beginner-guide-step-list">
                    <article className="beginner-guide-step-card beginner-guide-step-card-text-only">
                        <div className="beginner-guide-step-copy">
                            <span>1</span>
                            <div>
                                <h4>截图 + 标注</h4>
                                <p>截图标注适合改局部。圈出位置，写一句“这里改成什么”，比长文字更清楚。</p>
                            </div>
                        </div>
                    </article>
                    <article className="beginner-guide-step-card">
                        <div className="beginner-guide-step-copy">
                            <span>2</span>
                            <div>
                                <h4>IDE 浏览器</h4>
                                <p>多数 IDE 自带浏览器，可以把当前页面添加到对话，让 AI 直接看见你说的页面。</p>
                            </div>
                        </div>
                        <figure className="beginner-guide-step-image beginner-guide-wide-shot">
                            <img src={addPageToChatImage} alt="IDE 浏览器中把当前原型页面添加到对话" />
                        </figure>
                    </article>
                    <article className="beginner-guide-step-card">
                        <div className="beginner-guide-step-copy">
                            <span>3</span>
                            <div>
                                <h4>Axhub Make 批注</h4>
                                <p>用 Axhub Make 批注直接点页面位置。批注后，让 AI 执行，少解释很多上下文。</p>
                            </div>
                        </div>
                        <figure className="beginner-guide-step-image beginner-guide-wide-shot">
                            <img src={annotationToolbarImage} alt="Axhub Make 页面批注工具栏" />
                        </figure>
                    </article>
                </div>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="edit-practice-title">
                <h3 className="beginner-guide-section-title" id="edit-practice-title">练习一下</h3>
                <article className="beginner-guide-practice-card">
                    <span>练习任务</span>
                    <h4>改一处你看不顺眼的地方</h4>
                    <p>截图或批注都可以。只说一处，先把改动跑通。</p>
                </article>
            </section>
        </>
    );
}

function PublishPrototypeChapter() {
    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="publish-start-title">
                <h3 className="beginner-guide-section-title" id="publish-start-title">先记住两个入口</h3>
                <p className="beginner-guide-lede">
                    原型做好后，主要看两个菜单。一个在页面右上角，负责发布和导出；一个在项目菜单里，负责本地开发环境访问。
                </p>
                <p>
                    如果只是新手入门，先知道入口在哪里就够了，具体配置可以等真正交付时再处理。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="publish-export-title">
                <h3 className="beginner-guide-section-title" id="publish-export-title">第一点：右上角菜单</h3>
                <article className="beginner-guide-step-card beginner-guide-publish-entry-card">
                    <div className="beginner-guide-step-copy">
                        <span>1</span>
                        <div>
                            <h4>发布和导出都在这里</h4>
                            <p>
                                右上角菜单支持发布到云端服务，也支持导出到 Axure 和 Figma、导出 HTML。
                                云服务支持多种部署渠道，这里先知道有这个入口就可以。
                            </p>
                        </div>
                    </div>
                    <figure className="beginner-guide-step-image">
                        <img src={exportMenuImage} alt="右上角导出菜单入口" />
                    </figure>
                </article>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="publish-lan-title">
                <h3 className="beginner-guide-section-title" id="publish-lan-title">第二点：项目菜单</h3>
                <article className="beginner-guide-step-card beginner-guide-publish-entry-card">
                    <div className="beginner-guide-step-copy">
                        <span>2</span>
                        <div>
                            <h4>获取开发环境的局域网地址</h4>
                            <p>
                                项目菜单里可以获取开发环境的局域网地址。团队沟通或手机端调试时，复制链接，或直接用手机扫二维码访问。
                            </p>
                        </div>
                    </div>
                    <figure className="beginner-guide-step-image beginner-guide-wide-shot">
                        <img src={accessLinkMenuImage} alt="更多菜单里的访问链接入口" />
                    </figure>
                </article>
            </section>
        </>
    );
}

const helpPrompt = [
    '请读取这个文档，并按里面的要求指导我使用 Axhub Make：',
    'https://raw.githubusercontent.com/lintendo/Axhub-Make/main/docs/guide-users-with-axhub-make.md',
].join('\n');

function HelpChapter() {
    const { copyStatus, handleCopyPrompt } = usePromptClipboard(helpPrompt);

    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="help-start-title">
                <h3 className="beginner-guide-section-title" id="help-start-title">需要帮助时，先来这里</h3>
                <p className="beginner-guide-lede">
                    遇到不会操作、看不懂报错或不知道下一步怎么做时，不用自己反复摸索。这里有两种获取帮助的方式，选择一种就可以继续。
                </p>
                <p>
                    需要交流时加入 Axhub 社群；想先自己解决时，让 AI 按 Axhub Make 指导文档陪你一步步处理。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="help-community-title">
                <h3 className="beginner-guide-section-title" id="help-community-title">方式一：加入 Axhub 社群</h3>
                <article className="beginner-guide-step-card beginner-guide-step-card-text-only beginner-guide-help-card">
                    <div className="beginner-guide-step-copy">
                        <span>1</span>
                        <div>
                            <h4>在 Axhub 官网加入社群</h4>
                            <p>
                                打开 Axhub 官网，按页面提示加入社群。你可以在社群里提问、交流使用经验，也能看到其他用户的实践分享。
                            </p>
                            <a className="beginner-guide-help-link" href="https://axhub.im/" target="_blank" rel="noreferrer">
                                打开 Axhub 官网
                                <ExternalLink size={14} />
                            </a>
                        </div>
                    </div>
                </article>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="help-ai-title">
                <h3 className="beginner-guide-section-title" id="help-ai-title">方式二：让 AI 指导你</h3>
                <p className="beginner-guide-lede">
                    把下面这段提示词发给你正在使用的 AI。AI 会先读取 Axhub Make 指导文档，再按文档内容一步步回答你的问题。
                </p>
                <div className="beginner-guide-prompt-card">
                    <div className="beginner-guide-prompt-head">
                        <span>发给 AI 的提示词</span>
                        <button type="button" onClick={handleCopyPrompt} aria-live="polite">
                            <Copy size={14} />
                            {getCopyButtonLabel(copyStatus)}
                        </button>
                    </div>
                    <pre>{helpPrompt}</pre>
                </div>
            </section>
        </>
    );
}

function DefaultChapterContent({ chapter }: { chapter: GuideChapter }) {
    return (
        <>
            <section className="beginner-guide-manuscript" aria-labelledby="chapter-note-title">
                <h3 className="beginner-guide-section-title" id="chapter-note-title">本章导读</h3>
                <p className="beginner-guide-lede">{chapter.note}</p>
                <p>
                    这一段是内容占位，用来观察 Kami 风格在网页原型中的阅读节奏：标题由衬线字体承担层级，正文保持紧凑行高，强调色只用于左侧标题线、编号和少量链接式文字。
                </p>
            </section>

            <section className="beginner-guide-manuscript" aria-labelledby="chapter-outline-title">
                <h3 className="beginner-guide-section-title" id="chapter-outline-title">章节内容占位</h3>

                <div className="beginner-guide-card-grid">
                    {chapter.sections.map((section, index) => (
                        <article className="beginner-guide-outline-card" key={section}>
                            <span className="beginner-guide-outline-index">{index + 1}</span>
                            <h4>{section}</h4>
                            <p>这里补充「{section}」的具体说明、截图提示或检查清单，目前先使用占位内容展示版式。</p>
                        </article>
                    ))}
                </div>
            </section>
        </>
    );
}

function GuideShell({ config }: GuideShellProps) {
    const { page: activeId, setPage } = useHashPage(guideRoute);
    const activeIndex = Math.max(chapters.findIndex((chapter) => chapter.id === activeId), 0);
    const activeChapter = chapters[activeIndex] ?? chapters[0];
    const projectPath = getProjectPath(config);

    const adjacent = useMemo(() => {
        const previous = chapters[activeIndex - 1] ?? null;
        const next = chapters[activeIndex + 1] ?? null;
        return { previous, next };
    }, [activeIndex]);

    return (
        <main className="beginner-guide-shell">
            <aside className="beginner-guide-sidebar" aria-label="新手指导目录">
                <div className="beginner-guide-brand">
                    <div>
                        <p className="beginner-guide-brand-kicker">Axhub Make</p>
                        <h1>新手指导</h1>
                    </div>
                </div>

                <nav className="beginner-guide-toc">
                    {chapters.map((chapter) => {
                        const isActive = chapter.id === activeChapter.id;

                        return (
                            <button
                                className={isActive ? 'beginner-guide-toc-item is-active' : 'beginner-guide-toc-item'}
                                key={chapter.id}
                                type="button"
                                onClick={() => setPage(chapter.id)}
                            >
                                <span className="beginner-guide-toc-copy">
                                    <span>{chapter.title}</span>
                                    <small>{chapter.eyebrow}</small>
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <section className="beginner-guide-content" aria-labelledby="beginner-guide-title">
                <div className="beginner-guide-content-inner">
                    <header className="beginner-guide-hero">
                        <div className="beginner-guide-hero-copy">
                            <p className="beginner-guide-eyebrow">{activeChapter.eyebrow}</p>
                            <h2 id="beginner-guide-title">{activeChapter.title}</h2>
                            <p>{activeChapter.summary}</p>
                        </div>
                        <dl className="beginner-guide-hero-meta" aria-label="章节信息">
                            <div>
                                <dt>字数</dt>
                                <dd>{activeChapter.wordCount}</dd>
                            </div>
                            <div>
                                <dt>学习时长</dt>
                                <dd>{activeChapter.duration}</dd>
                            </div>
                        </dl>
                    </header>

                    {activeChapter.id === 'install-agent'
                        ? <InstallAgentChapter projectPath={projectPath} />
                        : activeChapter.id === 'choose-model'
                            ? <ChooseModelChapter />
                            : activeChapter.id === 'give-instructions'
                                ? <GiveInstructionsChapter />
                                : activeChapter.id === 'create-prototype'
                                    ? <CreatePrototypeChapter />
                                    : activeChapter.id === 'edit-prototype'
                                        ? <EditPrototypeChapter />
                                        : activeChapter.id === 'publish-prototype'
                                            ? <PublishPrototypeChapter />
                                            : activeChapter.id === 'advanced-guide'
                                                ? <HelpChapter />
                                                : <DefaultChapterContent chapter={activeChapter} />}

                    {activeChapter.id !== 'advanced-guide' && (
                        <section className="beginner-guide-manuscript" aria-labelledby="chapter-checklist-title">
                            <h3 className="beginner-guide-section-title" id="chapter-checklist-title">完成标准</h3>

                            <div className="beginner-guide-checklist">
                                {activeChapter.highlights.map((highlight) => (
                                    <div className="beginner-guide-check-item" key={highlight}>
                                        <CheckCircle2 size={19} />
                                        <span>{highlight}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <footer className="beginner-guide-footer-actions">
                        <button
                            type="button"
                            disabled={!adjacent.previous}
                            onClick={() => adjacent.previous && setPage(adjacent.previous.id)}
                        >
                            <ArrowLeft size={17} />
                            上一章
                        </button>
                        <button
                            className="beginner-guide-next-button"
                            type="button"
                            disabled={!adjacent.next}
                            onClick={() => adjacent.next && setPage(adjacent.next.id)}
                        >
                            下一章
                            <ArrowRight size={17} />
                        </button>
                    </footer>
                </div>
            </section>
        </main>
    );
}

export default GuideShell;
