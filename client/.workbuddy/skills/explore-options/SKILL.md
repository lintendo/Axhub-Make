---
name: explore-options
description: Use when a Make client批注 or user request asks for 多方案探索, 多方案生成, 多方案对比, 方案对比, 设计决策, 比稿, 先出方案, or choosing among 2-3 UI/code modification directions before executing one.
---

# 多方案探索

用于处理批注或需求里的多方案探索、生成和对比。目标是延续 Make client 的需求对齐和设计决策口径：先围绕当前问题发散出真实不同的设计方向，再通过方案对比收敛为一个可执行的设计决策。

## 流程

1. 先锁定共同约束：产品需求、当前页面目标、用户明确要求、不可改内容、设计基底和验收重点。
2. 先发散：没有指定数量时默认给 3 个方案；用户指定数量时严格按用户要求。
3. 方案差异必须来自页面骨架、信息组织、交互路径、内容密度、视觉反馈、动效状态或内容表达，不只换色换皮。
4. 方案梯度建议覆盖：稳健继承现有模式、平衡优化当前体验、突破探索新表达。不要让多个方案只是同一想法的轻微改写。
5. 所有方案都要遵守已确认的需求和设计决策，不能把锁定项当差异点。
6. 再收敛：比较方案适合的用户任务、实现成本、设计一致性、风险和可验证性，形成一个设计决策。
7. 执行最适合当前页面的一种；只有会改变需求范围、设计基底、核心流程或用户明确要求选择时，才停下来确认。

## 输出

- 多方案探索：每个方案一句话说明，体现真实差异。
- 差异说明：覆盖骨架、信息/交互、视觉/反馈、动效/状态和主要风险。
- 设计决策：写明采用哪个方案、为什么淘汰其他方案，以及取舍理由。
- 执行结果：列出改了什么和如何验收。

## 方案切换落地

如果用户要求“看看不同方向”“能切换比较”，或当前实现适合在页面内切换方案，就把方案做成 tweak：

- `@axhub/commentary-react` 只有把方案做成页面内可切换的 React tweak 时才需要；普通方案探索不依赖它。
- React 原型优先使用 `@axhub/commentary-react` 的 `createCommentaryReactTweakStore` 和 `useRegisterCommentaryTweak`。
- 复用项目现有 `schema / values / adapter / update` 模式，不另造平行配置。
- 方案字段优先用 `card`，不要用普通下拉。
- 每个 `options[]` 项至少包含 `label`、`description`、`value`。
- `label` 写方案标题，`description` 写核心差异，`value` 写稳定标识。
- 用户要求页面内切换时，必须落成 React tweak；否则只需要完成多方案探索、方案对比、设计决策和最终方案实现。

常用字段类型：

| type | 适用场景 |
| --- | --- |
| `card` | 多方案对比、布局方向、风格方向等带标题和描述的单选方案 |
| `select` | 简单枚举，例如尺寸、密度、variant |
| `switch` | 显示/隐藏、启用/禁用等布尔态 |
| `slider` | 连续数值，例如透明度、比例、间距强度 |
| `number` | 精确数值，例如列数、条目数、固定尺寸 |
| `text` | 需要长期配置的短标题或按钮文案 |
| `color` | 主题色、强调色、图表主色，优先使用语义色或 token |

最佳实践：

- 多方向单选用 `card`，这是方案对比的默认选择。
- 布尔状态用 `switch`；简单枚举用 `select`；连续调节用 `slider`。
- 默认只暴露 3-5 个最影响 UI/UX 的字段，不要把底层 props 全摊开。
- 文案通常可以直接编辑；只有需要长期配置或和方案切换绑定时才放进 schema。
- 字段名用用户能理解的语义，不直接暴露第三方库或实现细节。

React 最小形态：

```tsx
import React from 'react';
import {
  createCommentaryReactTweakStore,
  useCommentaryReactTweakStore,
  useRegisterCommentaryTweak,
} from '@axhub/commentary-react';

const optionSchema = {
  title: '多方案探索',
  fields: [{
    key: 'variant',
    label: '方案',
    type: 'card',
    options: [
      { label: '稳健型', description: '继承现有结构，小幅优化体验。', value: 'steady' },
      { label: '平衡型', description: '调整信息组织和交互路径。', value: 'balanced' },
      { label: '突破型', description: '探索更有差异的结构和反馈。', value: 'bold' },
    ],
  }],
};

function Example() {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const store = React.useMemo(
    () => createCommentaryReactTweakStore({ variant: 'balanced' }),
    [],
  );
  const values = useCommentaryReactTweakStore(store);

  useRegisterCommentaryTweak({
    elementRef: rootRef,
    schema: optionSchema,
    store,
    onUpdate: async (patch) => store.update(patch),
  });

  return <section ref={rootRef}>{renderVariant(values.variant)}</section>;
}
```
