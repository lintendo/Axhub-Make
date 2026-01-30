# 默认图标库推荐

**使用时机**：仅在用户未指定图标库 且 主题中无自定义图标系统时使用。

## 🎨 推荐列表

| 图标库 | 推荐理由 | 风格特点 | 核心优劣 | 适用场景 |
|-------|---------|---------|---------|---------|
| **Lucide React** | 🌟 目前最流行 (No.1)<br>Shadcn/UI 默认图标库，极轻量，SVG 质量极高。 | 线性、圆润、现代<br>(Stroke based) | ✅ Tailwind 类名直接控制样式<br>✅ 包体积小，Tree-shaking 友好 | **Axhub Make 默认首选**。<br>适合所有现代 Web 原型。 |
| **Ant Design Icons** | Ant Design 组件库官方配套，图标极多。 | 偏粗、商务、稳重<br>(实心/线框/双色) | ✅ 图标丰富，双色图标独特<br>⚠️ 包体积大，需配合 Antd 使用 | 必须配合 Ant Design 组件使用，<br>或需要双色图标时。 |
| **Heroicons** | Tailwind 团队开发，无缝集成。 | 简洁、中性<br>(Outline/Solid) | ✅ Tailwind 原生支持<br>⚠️ 图标数量相对较少 | 追求 Tailwind 原生体验。 |
| **React Icons** | 万能聚合器<br>包含 FontAwesome, Material 等几十个库。 | 风格杂乱，<br>取决于引入的子库 | ✅ 图标库最全<br>⚠️ 容易导致打包体积过大 | 需要非常冷门的图标<br>（如特定品牌 Logo）。 |

## 🎯 选择策略

**按需匹配**：
1. **默认/不确定** → 直接用 **Lucide React**
2. **用了 Ant Design 组件库** → 用 **Ant Design Icons**
3. **Tailwind 纯粹主义者** → 用 **Heroicons**
4. **需要特殊品牌图标** → 用 **React Icons**


## ⚠️ 注意事项

1. **避免混用**：同一个项目只用一个图标库，保持视觉一致性
2. **按需导入**：使用具名导入而非 `import *`，优化打包体积
3. **优先推荐**：Lucide React（轻量、现代、Tailwind 友好）
