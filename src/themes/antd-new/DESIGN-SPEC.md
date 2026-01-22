# Ant Design 主题规范

> 本文档定义了 antd-new 主题的设计价值、能力边界与使用指南，帮助开发者和 AI 正确理解和应用该设计系统。

## 设计系统价值

### 为什么选择 Ant Design？

Ant Design 是由蚂蚁集团开发的企业级 UI 设计语言和 React 组件库，专为**中后台管理系统**设计。它的核心价值在于：

1. **降低决策成本** - 提供开箱即用的设计规范，减少设计与开发的沟通摩擦
2. **保证一致性** - 统一的视觉语言确保产品体验的连贯性
3. **提升效率** - 70+ 高质量组件覆盖绝大多数业务场景
4. **企业级品质** - 经过大规模生产环境验证，稳定可靠

### 设计原则

| 原则 | 含义 |
|------|------|
| **Stay on the Page** | 尽量在当前页面完成任务，减少页面跳转 |
| **React Immediately** | 即时反馈用户操作，让系统状态可见 |
| **Provide an Invitation** | 通过视觉引导帮助用户发现功能 |
| **Make it Direct** | 直接操作，所见即所得 |
| **Keep it Lightweight** | 保持界面轻量，避免信息过载 |
| **Use Transition** | 使用动效传达状态变化，建立空间感 |

---

## 能力边界

### ✅ 适合的场景

- 企业管理后台（CRM、ERP、OA 等）
- 数据可视化仪表盘
- 表单密集型应用
- 内部工具和工作台
- B 端 SaaS 产品

### ❌ 不适合的场景

- C 端消费类产品（需要强品牌个性）
- 高度定制的创意设计
- 游戏或娱乐类界面
- 需要极致轻量的移动端 H5（考虑使用 Ant Design Mobile）

---

## 组件体系

### 按功能分类

| 类别 | 组件 | 典型用途 |
|------|------|---------|
| **数据录入** | Form, Input, Select, DatePicker, Upload, Checkbox, Radio, Switch, Slider, Rate, Transfer, Cascader, TreeSelect, ColorPicker | 表单填写、筛选条件 |
| **数据展示** | Table, List, Card, Descriptions, Tree, Timeline, Tag, Avatar, Badge, Statistic, Calendar, Image, Empty, Skeleton | 信息呈现、列表展示 |
| **反馈** | Modal, Drawer, Message, Notification, Alert, Progress, Popconfirm, Result, Spin | 操作结果、状态提示 |
| **导航** | Menu, Tabs, Breadcrumb, Pagination, Steps, Dropdown, Anchor, Affix | 页面导航、流程指引 |
| **布局** | Layout, Grid, Space, Divider, Flex, Splitter | 页面结构、间距控制 |
| **通用** | Button, Icon, Typography, FloatButton, ConfigProvider | 基础交互、全局配置 |

### 组件选择决策树

```
需要用户输入？
├─ 是 → 使用「数据录入」组件
│   ├─ 单行文本 → Input
│   ├─ 多行文本 → Input.TextArea
│   ├─ 数字 → InputNumber
│   ├─ 选择（少量选项）→ Radio / Checkbox
│   ├─ 选择（多选项）→ Select / Cascader
│   ├─ 日期时间 → DatePicker / TimePicker
│   └─ 文件 → Upload
└─ 否 → 需要展示数据？
    ├─ 是 → 使用「数据展示」组件
    │   ├─ 表格数据 → Table
    │   ├─ 列表数据 → List / Card
    │   ├─ 详情信息 → Descriptions
    │   ├─ 树形数据 → Tree
    │   └─ 统计数值 → Statistic
    └─ 否 → 需要导航/反馈？
        ├─ 导航 → Menu / Tabs / Breadcrumb
        └─ 反馈 → Modal / Message / Notification
```

---

## 设计令牌（Design Tokens）

### 颜色系统

```
品牌色
├─ Primary: #1677ff (科技、理性、专业)
└─ 用于：主按钮、链接、选中态、强调元素

功能色
├─ Success: #52c41a (成功、正向反馈)
├─ Warning: #faad14 (警告、需要注意)
├─ Error: #ff4d4f (错误、危险操作)
└─ Info: #1677ff (信息提示，通常与主色一致)

中性色
├─ 标题文字: rgba(0,0,0,0.88)
├─ 正文文字: rgba(0,0,0,0.88)
├─ 次要文字: rgba(0,0,0,0.65)
├─ 禁用文字: rgba(0,0,0,0.25)
├─ 边框: #d9d9d9
└─ 背景: #ffffff
```

### 间距系统（基于 4px 网格）

| Token | 值 | 使用场景 |
|-------|-----|---------|
| `xxs` | 4px | 图标与文字间隙 |
| `xs` | 8px | 紧凑元素间距 |
| `sm` | 12px | 相关元素间距 |
| `md` | 16px | 标准间距（默认） |
| `lg` | 24px | 区块间距 |
| `xl` | 32px | 大区块间距 |
| `xxl` | 48px | 页面级间距 |

### 排版系统

| 层级 | 字号 | 使用场景 |
|------|------|---------|
| H1 | 38px | 页面大标题 |
| H2 | 30px | 区块标题 |
| H3 | 24px | 卡片标题 |
| H4 | 20px | 小标题 |
| H5 | 16px | 强调正文 |
| Body | 14px | 正文（默认） |
| Caption | 12px | 辅助说明 |

### 圆角与阴影

```
圆角
├─ xs: 2px (标签、小按钮)
├─ base: 6px (按钮、输入框、卡片)
└─ lg: 8px (弹窗、大卡片)

阴影（表达层级）
├─ 无阴影: 基础元素
├─ 小阴影: 悬浮卡片
├─ 中阴影: 下拉菜单、Popover
└─ 大阴影: Modal、Drawer
```

---

## 响应式断点

| 名称 | 范围 | 典型设备 |
|------|------|---------|
| `xs` | < 576px | 手机 |
| `sm` | ≥ 576px | 大屏手机/小平板 |
| `md` | ≥ 768px | 平板 |
| `lg` | ≥ 992px | 小型笔记本 |
| `xl` | ≥ 1200px | 桌面显示器 |
| `xxl` | ≥ 1600px | 大屏显示器 |

**注意**：Ant Design 基于 24 栅格系统，使用 `<Row>` 和 `<Col>` 组件实现响应式布局。

---

## 使用约束

### 必须遵守

1. **不要修改组件内部样式** - 使用 ConfigProvider 或 Design Token 进行主题定制
2. **保持语义正确** - 按钮类型（primary/default/text/link）要符合其语义
3. **遵循表单规范** - 使用 Form 组件管理表单状态和校验
4. **注意性能** - 大数据表格使用虚拟滚动，避免一次性渲染过多数据

### 建议做法

1. **使用 Space 组件** - 管理元素间距，而非手写 margin
2. **善用 ConfigProvider** - 全局配置主题、国际化、尺寸等
3. **合理使用 Modal vs Drawer** - 轻量操作用 Modal，复杂表单用 Drawer
4. **反馈层级分明** - 全局提示用 Message，需要用户确认用 Modal

### 禁止做法

1. ❌ 不要在 Ant Design 组件上使用 `!important` 覆盖样式
2. ❌ 不要混用多个 UI 库（如同时使用 Ant Design 和 Material UI）
3. ❌ 不要在循环中创建 Modal/Drawer 实例
4. ❌ 不要忽略 Form 的校验规则直接提交数据

---

## 版本说明

本规范基于 **Ant Design v5/v6** 标准，主要特性：

- CSS-in-JS 方案（@ant-design/cssinjs）
- Design Token 系统
- 组件级主题定制
- 更好的 Tree Shaking 支持

---

## 相关资源

- [Ant Design 官方文档](https://ant.design)
- [组件 API 文档](https://ant.design/components/overview)
- [设计模式指南](https://ant.design/docs/spec/overview)
- [主题定制指南](https://ant.design/docs/react/customize-theme)
