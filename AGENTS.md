# Agents 工作流程说明

本项目为目标用户开发原型，代码运行在第三方平台中，目标用户是不会执行命令不会编码的产品经理或者设计师。

## 🧭 工作流程

1. **需求对齐** → 与用户沟通，根据模式产出文档（spec.md）
2. **生成代码** → 根据 spec 实现元素/页面
3. **自动验收** → 运行验收脚本检查构建状态
4. **协作调试** → 必要时修复问题（详见 debugging-guide.md）

## 📄 详细文档

| 阶段 | 文档 | 用途 |
|------|------|------|
| 需求对齐 | `rules/requirements-alignment.md` | 沟通需求，选择模式，产出文档 |
| 代码开发 | `rules/development-standards.md` | 代码规范和验收流程 |
| 问题调试 | `rules/debugging-guide.md` | 开发验收失败或用户反馈 bug 时使用 |

## 项目结构
```
├── src/
│   ├── common/      # 公共类型和工具
│   ├── elements/    # 原型元素
│   ├── pages/       # 原型页面
│   └── themes/      # 主题配置
└── assets/          # 原型资产
    ├── docs/        # 文档
    ├── database/    # 数据库
    └── themes/      # 主题库
```