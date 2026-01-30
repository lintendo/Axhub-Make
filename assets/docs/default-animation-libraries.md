# 默认动画库推荐

**使用时机**：仅在需要复杂动画交互 且 用户未指定动画方案 且 主题中无自定义动画系统时使用。

## ⚠️ 重要提醒：动画不是必须的！

- 少量简单动画 → 直接使用 CSS 原生动画（`transition`、`@keyframes`、`animation`）
- Tailwind 项目 → 优先使用内置的 `transition-*`、`animate-*` 类
- 只有在动画数量多或交互复杂时，才考虑引入动画库

## 🎬 推荐列表

| 动画库 | 推荐理由 | AI 生成友好度 | 核心劣势 | 适用场景 |
|-------|---------|--------------|---------|---------|
| **CSS 原生动画** | ⚡️ 零依赖首选<br>浏览器原生支持，无包体积，性能最优。 | 🌟🌟🌟🌟🌟<br>AI 对 CSS 动画极度熟悉 | 复杂时序控制困难，<br>手势交互需额外代码 | 默认首选。<br>Hover、Focus、简单过渡。 |
| **Tailwind Animate**<br>(tailwindcss-animate) | ⚡️ Shadcn/UI 默认方案<br>纯 Class 控制，零 JS 心智负担。 | 🌟🌟🌟🌟🌟<br>AI 只需拼 class，几乎不会翻车 | 表达力有限，<br>无法处理复杂时序和状态 | 下拉、Toast、Modal、<br>Tooltip 等基础过渡。 |
| **Framer Motion** | 👑 React 动画事实标准<br>声明式 API + Layout 动画 + 手势系统。 | 🌟🌟🌟🌟🌟<br>训练数据极多，AI 可稳定生成复杂动画 | 包体积偏大，<br>学习成本略高 | 复杂交互原型、页面转场、<br>拖拽排序、微交互系统。 |
| **AutoAnimate**<br>(@formkit/auto-animate) | ✨ 一行代码魔法动画<br>DOM 变化即动画，极致省心。 | 🌟🌟🌟🌟<br>AI 基本不用理解动画原理 | 不可控，<br>难以产品级精调 | 列表 CRUD、表格增删、<br>卡片排序。 |

## 🎯 选择策略

**按需求复杂度匹配**：

1. **不需要动画** → 不引入任何动画库 ✅
2. **需要动画但数量少（< 5 处）** → **CSS 原生动画** ✅
3. **大量动画** → 按复杂度选择：
   - **简单过渡** → **Tailwind Animate**
   - **列表增删** → **AutoAnimate**
   - **手势/布局/复杂时序** → **Framer Motion**

## 💡 CSS 原生动画示例

```css
/* 简单 Hover 效果 - 无需任何库 */
.button {
  transition: all 0.2s ease;
}
.button:hover {
  transform: scale(1.05);
}

/* 淡入动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.card {
  animation: fadeIn 0.3s ease-out;
}
```

```html
<!-- Tailwind 内置动画 - 无需额外依赖 -->
<div class="transition-all duration-300 hover:scale-105">
  Hover 放大
</div>
<div class="animate-pulse">
  加载占位符
</div>
```

## ⚠️ 注意事项

1. **性能优先**：动画过多会影响性能，尤其在移动端
2. **避免过度使用**：克制使用动画，仅在提升 UX 时添加
3. **按需引入**：Framer Motion 较大，确认需要复杂动画再引入
4. **一致性**：同一项目尽量使用统一的动画方案
5. **可访问性**：尊重用户的 `prefers-reduced-motion` 设置
