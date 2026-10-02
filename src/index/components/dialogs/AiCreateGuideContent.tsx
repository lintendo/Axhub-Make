import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const MODEL_RECOMMENDATIONS = [
    { model: 'Claude Opus 4.8', feature: '综合能力强，适合规划' },
    { model: 'Gemini 3.1 Pro', feature: 'UI/UX 设计能力优秀' },
    { model: 'GPT-5.5', feature: '适合处理复杂问题和任务' },
    { model: 'Kimi K2.7', feature: '国产平替，UI/UX 设计能力优秀' },
    { model: 'GLM-5.3', feature: '国产平替，综合能力强' },
];

export default function AiCreateGuideContent() {
    return (
        <div className="py-1">
            <h3 className="text-[15px] font-medium text-foreground mb-4">
                直接与 AI 对话，描述你的需求即可完成新建。
            </h3>

            <ul className="text-[13px] leading-relaxed text-muted-foreground space-y-2 list-none m-0 p-0 mb-6">
                <li className="flex items-start gap-1">
                    <span className="text-foreground shrink-0 mt-0.5">•</span>
                    <span><strong className="text-foreground font-medium">新建一个对话：</strong>一个任务一个对话窗口，上下文越集中，输出质量越高。</span>
                </li>
                <li className="flex items-start gap-1">
                    <span className="text-foreground shrink-0 mt-0.5">•</span>
                    <span><strong className="text-foreground font-medium">选择正确模型：</strong>手动选择适合当前任务的模型，不要选择 auto。</span>
                </li>
                <li className="flex items-start gap-1">
                    <span className="text-foreground shrink-0 mt-0.5">•</span>
                    <span><strong className="text-foreground font-medium">多提供图片和语音：</strong>视觉信息比文字描述更精确，语音输入效率比打字高 3-5 倍。</span>
                </li>
            </ul>

            <div className="pt-3">
                <h4 className="text-[14px] font-medium text-foreground mb-3">模型推荐</h4>

                <div className="rounded-md border border-border/50">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[45%] h-9 text-[13px] font-medium text-foreground">模型</TableHead>
                                <TableHead className="h-9 text-[13px] font-medium text-foreground">特点</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {MODEL_RECOMMENDATIONS.map((item) => (
                                <TableRow key={item.model} className="border-border/40 hover:bg-muted/10">
                                    <TableCell className="py-2.5 text-[13px] font-medium text-foreground">{item.model}</TableCell>
                                    <TableCell className="py-2.5 text-[13px] text-muted-foreground">{item.feature}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
