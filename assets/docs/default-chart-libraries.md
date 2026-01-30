# 默认图表库推荐

**使用时机**：仅在用户未指定图表库 且 项目中无现有图表方案时使用。

## 📊 推荐列表

| 图表库 | 推荐理由 | 核心优劣 | 适用场景 |
|-------|---------|---------|---------|
| **Recharts** | 🌟 首选通用方案<br>React 原生，组件化极好，代码最干净。 | ✅ 组件化设计，代码简洁<br>✅ React 原生，易于集成<br>⚠️ 复杂交互（3D、地理）支持较弱 | 常规折线、柱状、面积图。<br>**兜底必选**。 |
| **Tremor** | Tailwind 绝配<br>专为 Dashboard 设计，样式极美，开箱即用。 | ✅ API 极简，上手快<br>✅ 与 Tailwind 完美融合<br>⚠️ 定制性低，仅支持预设图表类型 | 现代 SaaS 风格的 KPI 面板、统计卡片。 |
| **Ant Design Charts**<br>(@ant-design/plots) | B 端业务神器<br>基于 G2，交互强，默认样式符合国内审美。 | ✅ 图表类型丰富，交互强<br>✅ 国内 B 端审美<br>⚠️ 包体积大，非 React 原生 (Canvas)<br>⚠️ 需锁定 v2 版本避免混淆 | 后台管理系统，复杂漏斗图、桑基图。 |
| **ECharts**<br>(echarts-for-react) | 重型全能王<br>图表类型最全（地图/3D），渲染性能最强。 | ✅ 图表类型最全，性能强<br>✅ 文档和示例丰富<br>⚠️ 难与 Tailwind 融合<br>⚠️ 配置项繁琐 | 数据大屏、复杂的地理可视化、炫酷特效。 |

## 🎯 选择策略

**按需匹配**：
1. **没想好/通用场景** → 直接用 **Recharts**
2. **需要漂亮的 Dashboard** → 用 **Tremor**
3. **国内 B 端后台** → 用 **Ant Design Charts**
4. **需要地图/3D/大屏** → 用 **ECharts**

## 📦 安装命令

```bash
# Recharts (推荐默认安装)
pnpm add recharts

# Tremor
pnpm add @tremor/react

# Ant Design Charts
pnpm add @ant-design/plots

# ECharts
pnpm add echarts echarts-for-react
```
