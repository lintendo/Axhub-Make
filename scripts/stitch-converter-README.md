# Stitch 转换器使用指南

## 功能说明

将 Google Stitch 导出的 HTML 项目转换为 Axhub 页面组件。

## 核心特性

✅ **完整 Tailwind 配置支持** - 自动提取并转换所有 Tailwind 配置项  
✅ **自动检测项目类型** - 支持单页面和多页面项目  
✅ **构建时 Tailwind** - 使用项目的 Tailwind 而非 CDN，确保样式正确生效  
✅ **外部资源注入** - 字体、图标等 CDN 资源动态加载  
✅ **JSX 转换** - class→className、style 属性转对象等  
✅ **完整 body 保留** - 保留 body 标签及其所有属性  

## 支持的 Tailwind 配置项

转换器支持提取和转换以下 Tailwind 配置：

### 主题扩展 (theme.extend)
- **colors** - 颜色（支持嵌套对象）→ CSS 变量 `--color-*`
- **spacing** - 间距 → CSS 变量 `--spacing-*`
- **fontSize** - 字体大小 → CSS 变量 `--font-size-*`
- **fontFamily** - 字体族 → CSS 变量 `--font-family-*`
- **borderRadius** - 圆角 → CSS 变量 `--radius-*`
- **boxShadow** - 阴影 → CSS 变量 `--shadow-*`
- **zIndex** - 层级 → CSS 变量 `--z-index-*`
- **opacity** - 透明度 → CSS 变量 `--opacity-*`
- **transitionDuration** - 过渡时长 → CSS 变量 `--duration-*`
- **transitionTimingFunction** - 缓动函数 → CSS 变量 `--ease-*`
- **backgroundImage** - 背景图（渐变）→ CSS 变量 `--gradient-*`
- **screens** - 断点（作为注释保留）
- **keyframes** - 动画关键帧 → `@keyframes`
- **animation** - 动画类 → `.animate-*` 工具类

### 其他配置
- **darkMode** - 暗色模式配置（作为注释保留）

## 使用方法

```bash
# 单页面项目
node scripts/stitch-converter.mjs ".drafts/stitch_project" output-name

# 多页面项目（自动检测）
node scripts/stitch-converter.mjs ".drafts/stitch_multi_project" output-name
```

## 输出结构

### 单页面项目
```
src/pages/output-name/
  ├── index.tsx    # 组件代码
  └── style.css    # 样式文件（包含提取的 Tailwind 配置）
```

### 多页面项目
每个页面生成独立的顶级文件夹：
```
src/pages/
  ├── output-name-page1/
  │   ├── index.tsx
  │   └── style.css
  └── output-name-page2/
      ├── index.tsx
      └── style.css
```

**访问 URL：**
- 页面 1: `http://localhost:51720/pages/output-name-page1/`
- 页面 2: `http://localhost:51720/pages/output-name-page2/`

## 技术实现

### Tailwind 配置提取

1. **解析配置** - 从 `<script>` 标签中提取 `tailwind.config` 对象
2. **转换为 CSS** - 将配置项转换为 CSS 变量和规则
3. **写入 style.css** - 与原始样式一起输出

### 为什么不使用 Tailwind CDN？

- ❌ CDN 版本与构建时 Tailwind 不兼容
- ❌ 运行时配置可能导致样式闪烁
- ✅ 构建时处理确保样式稳定可靠
- ✅ 与项目现有 Tailwind 配置集成

### 动态注入机制

仅用于外部资源（字体、图标等）：

1. **Links** - 字体、图标等外部资源
2. **Scripts** - 非 Tailwind 的外部脚本

## 配置示例

### 输入（Stitch HTML）
```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: "#059669",
          "background-dark": "#0f172a"
        },
        animation: {
          'fade-in': 'fadeIn 0.5s ease-out'
        },
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0' },
            '100%': { opacity: '1' }
          }
        }
      }
    }
  }
</script>
```

### 输出（style.css）
```css
@import "tailwindcss";

@theme {
  --color-primary: #059669;
  --color-background-dark: #0f172a;
}

@keyframes fadeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-out;
}
```

## 测试结果

所有测试项目均成功转换并编译通过：

- ✅ `stitch-test` - 单页面项目
- ✅ `stitch-ai-directory-assistant-dark-ide-mode-3` - 带动画和自定义颜色
- ✅ `stitch-multi-test-ai_directory_assistant_-_dark_ide_mode` - 多页面项目（暗色模式）
- ✅ `stitch-multi-test-ai_directory_assistant_-_light_mode` - 多页面项目（亮色模式）

## 访问页面

转换完成后，通过以下 URL 访问：

- 单页面: `http://localhost:51720/pages/{output-name}/`
- 多页面: `http://localhost:51720/pages/{output-name-page-name}/`

## 注意事项

1. 确保 Stitch 项目包含 `code.html` 文件
2. 多页面项目每个子文件夹都应包含 `code.html`
3. 输出名称会自动转换为小写并替换特殊字符为 `-`
4. 截图文件不会被复制到输出目录
5. Tailwind CDN 脚本会被自动排除，配置会被提取并转换为 CSS
