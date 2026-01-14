# Stitch 转换工具使用说明

## 功能

将 Google Stitch 导出的 HTML 项目自动转换为 Axhub 页面组件。

## 使用方法

```bash
node scripts/stitch-converter.mjs <stitch-dir> [output-name]
```

### 参数说明

- `stitch-dir`: Stitch 项目目录路径（相对于项目根目录）
- `output-name`: 输出页面名称（可选，默认使用目录名）

## 示例

### 转换单页面项目

```bash
# 使用默认名称
node scripts/stitch-converter.mjs ".drafts/stitch_project"

# 指定输出名称
node scripts/stitch-converter.mjs ".drafts/stitch_project" my-page
```

### 转换多页面项目

```bash
# 多页面项目会将第一个页面作为主页面，其他页面放在 components 目录
node scripts/stitch-converter.mjs ".drafts/stitch_multi_page_project" my-app
```

## 输出结构

### 单页面项目

```
src/pages/[output-name]/
├── index.tsx              # 页面组件
├── style.css              # 样式文件
├── tailwind-config.txt    # Tailwind 配置（如果有）
└── README.md              # 说明文档
```

### 多页面项目

```
src/pages/[output-name]/
├── index.tsx              # 主页面组件
├── style.css              # 样式文件
├── components/            # 其他页面作为组件
│   ├── page-2/
│   │   ├── index.tsx
│   │   └── style.css
│   └── page-3/
│       ├── index.tsx
│       └── style.css
├── tailwind-config.txt
└── README.md
```

## 转换内容

脚本会自动处理：

1. ✅ 提取 Tailwind 配置
2. ✅ 提取自定义样式
3. ✅ 转换 HTML 为 JSX
   - `class` → `className`
   - `for` → `htmlFor`
   - HTML 注释 → JSX 注释
   - `style` 属性 → JSX 对象格式
4. ✅ 生成符合 Axhub 规范的组件结构

## 后续步骤

转换完成后，你需要：

1. **检查 JSX 语法**
   - 虽然脚本会自动转换大部分内容，但复杂的 HTML 可能需要手动调整
   - 特别注意 `style` 属性和事件处理

2. **添加交互逻辑**
   - 添加 state 管理
   - 实现事件处理函数
   - 配置 eventList、actionList 等

3. **测试页面**
   ```bash
   npm run dev
   ```
   访问: `http://localhost:5173/#/pages/[output-name]`

## 常见问题

### Q: 转换后页面样式不对？

A: 检查以下几点：
- 确保 Tailwind CSS 已正确配置
- 检查 `style.css` 中的自定义样式
- 查看 `tailwind-config.txt` 中的配置，可能需要手动添加到项目的 `tailwind.config.ts`

### Q: 页面加载失败？

A: 检查：
- 运行 `getDiagnostics` 查看 TypeScript 错误
- 检查控制台是否有语法错误
- 确认所有 import 路径正确

### Q: Material Icons 不显示？

A: 确保在项目中引入了 Material Symbols 字体：

```html
<!-- index.html -->
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
```

### Q: 多页面项目如何使用其他页面？

A: 其他页面在 `components/` 目录下，可以这样导入：

```tsx
import OtherPage from './components/page-2';

// 在主页面中使用
<OtherPage />
```

## 技术细节

### HTML 到 JSX 转换规则

1. **属性转换**
   - `class` → `className`
   - `for` → `htmlFor`

2. **注释转换**
   ```html
   <!-- HTML 注释 -->
   ```
   转换为：
   ```jsx
   {/* JSX 注释 */}
   ```

3. **Style 属性转换**
   ```html
   <div style="background-color: #fff; padding: 10px;">
   ```
   转换为：
   ```jsx
   <div style={{ backgroundColor: '#fff', padding: '10px' }}>
   ```

### 限制

- 不支持复杂的 JavaScript 逻辑转换
- 不支持服务端渲染相关代码
- 某些复杂的 CSS 可能需要手动调整

## 更新日志

- v1.0.0 (2026-01-12)
  - 初始版本
  - 支持单页面和多页面项目
  - 自动转换 HTML 到 JSX
  - 提取 Tailwind 配置和自定义样式
