# 来源清单

## 状态与证据属性

- 处理状态：`待处理`、`处理中`、`部分完成`（仍有可执行采集）、`已完成`（全部子项完成）、`阻塞`（已尝试且因外部或待用户决策无法继续）
- 证据属性：`已观察事实`、`合理推断`、`外部研究`、`待用户确认`

## 来源总表

| 来源 ID | 类型 | 原始位置 | 访问日期 | 访问条件 | 本地路径 | 覆盖范围 | 处理状态 | 证据属性 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src-001` | 网站链接 | `https://xl3n1thocz.feishu.cn/admin/index` | 2026-08-14 | 经用户明确授权，复用本机 Chrome 现有飞书登录态；当前账号可进入企业管理后台；未保存账号、密码或 Cookie 值 | `sources/web/src-001/` | 左侧导航及首页入口可达的 63 个一级页面；每页桌面默认态、实际路由、标题、可见内容、控件与截图 | 部分完成 | 已观察事实 |

## 网站架构

所有页面均保存同名 `.json` 结构化提取和 `.png` 桌面截图；表中路径列出截图，JSON 位于相同目录。

| 来源 ID | 页面/视图 | 路由或进入路径 | 核心状态 | 关键交互 | 截图路径 | 采集状态 |
| --- | --- | --- | --- | --- | --- | --- |
| `src-001` | 企业概览 | `/admin/index` | 企业未认证；组织 1 人、0 部门；展示快捷入口、权益预警、使用趋势和应用管理 | 认证、版本升级、快捷入口、应用配置 | `sources/web/src-001/001-enterprise-overview-default-desktop.png` | 默认态已完成 |
| `src-001` | 成员与部门 | `/admin/contacts/departmentanduser` | 组织树与成员列表可用；当前数据量很小 | 新建部门、邀请/添加成员、批量操作 | `sources/web/src-001/002-contacts-departmentanduser-default-desktop.png` | 默认态已完成；操作弹窗待补采 |
| `src-001` | 角色管理 | `/admin/contacts/role` | 角色列表能力可用 | 新增角色、批量导入/导出 | `sources/web/src-001/003-contacts-role-default-desktop.png` | 默认态已完成；操作弹窗待补采 |
| `src-001` | 单位管理 | `/admin/contacts/unit` | 当前版本受限，页面提供帮助和升级咨询 | 帮助中心、联系客服升级 | `sources/web/src-001/004-contacts-unit-default-desktop.png` | 默认态已完成 |
| `src-001` | 用户组管理 | `/admin/contacts/group`，实际 `/admin/contacts/group/static` | 静态用户组页可用 | 新建用户组、管理分组、批量导入/导出 | `sources/web/src-001/005-contacts-group-default-desktop.png` | 默认态已完成；操作弹窗待补采 |
| `src-001` | 字段配置 | `/admin/contacts/employee-field-new`，实际 `/custom` 子路由 | 成员字段配置列表可用 | 查看字段详情、API 调用设置 | `sources/web/src-001/006-contacts-employee-field-new-default-desktop.png` | 默认态已完成；详情待补采 |
| `src-001` | 人事企业版配置 | `/admin/contacts/corehr` | 当前版本受限，页面提供帮助和客服入口 | 帮助中心、联系客服 | `sources/web/src-001/007-contacts-corehr-default-desktop.png` | 默认态已完成 |
| `src-001` | 关联组织 | `/admin/relate/organizationlist` | 关联组织管理入口可用 | 全局设置、申请列表、分享组织邀请码 | `sources/web/src-001/008-relate-organizationlist-default-desktop.png` | 默认态已完成；操作状态待补采 |
| `src-001` | 会议室管理 | `/admin/meetingrooms/resource`，实际附带 `id=0` | 当前层级 0 个会议室，空表 | 设置、添加会议室、导入/更新、导出 | `sources/web/src-001/009-meetingrooms-resource-default-desktop.png` | 默认/空态已完成；操作弹窗待补采 |
| `src-001` | 设备与运维 | `/admin/meetingrooms/devices`，实际附带层级和设备页签参数 | 当前无主机、控制器、签到板和投屏盒子 | 设置、状态筛选、导出、批量操作、子页签 | `sources/web/src-001/010-meetingrooms-devices-default-desktop.png` | 默认/空态已完成；子页签待补采 |
| `src-001` | 应用审核 | `/admin/appCenter/audit` | 当前无待审核应用 | 设置审核规则、配置审批流程 | `sources/web/src-001/011-appcenter-audit-default-desktop.png` | 默认/空态已完成；规则配置待补采 |
| `src-001` | 应用管理 | `/admin/appCenter/manage` | 已安装应用列表有数据 | 获取/创建应用、管理规则、筛选、配置应用 | `sources/web/src-001/012-appcenter-manage-default-desktop.png` | 默认态已完成；详情与操作待补采 |
| `src-001` | 工作台设置 | `/admin/appCenter/configuration` | 管理员推荐页可用 | 添加推荐规则、切换自定义分组/应用展示 | `sources/web/src-001/013-appcenter-configuration-default-desktop.png` | 默认态已完成；规则弹窗与子页签待补采 |
| `src-001` | 定制工作台 | `/admin/appcenter/portal` | 增值版本介绍与套餐对比页 | 立即升级、升级咨询 | `sources/web/src-001/014-appcenter-portal-default-desktop.png` | 默认态已完成 |
| `src-001` | 基础 API 调用次数 | `/admin/appcenter/basic-api-calls` | 调用明细为空 | 应用搜索、日期范围 | `sources/web/src-001/015-appcenter-basic-api-calls-default-desktop.png` | 默认/空态已完成 |
| `src-001` | 我的产品 | `/admin/billing/subscriptions` | 当前标准版，无产品列表数据；出现首次引导 | 产品筛选、客服、席位帮助、关闭引导 | `sources/web/src-001/016-billing-subscriptions-default-desktop.png` | 默认/引导态已完成；引导后状态待补采 |
| `src-001` | 权益数据 | `/admin/billing/equity-data` | 展示 AI、存储、会议、自动化、API 等权益用量 | 充值、查看用量/额度来源、升级 | `sources/web/src-001/017-billing-equity-data-default-desktop.png` | 默认态已完成；详情待补采 |
| `src-001` | 订单列表 | `/admin/billing/bills` | 产品订单页为空 | 产品/ISV 页签、前往开票、导出订单 | `sources/web/src-001/018-billing-bills-default-desktop.png` | 默认/空态已完成；子页签待补采 |
| `src-001` | 发票管理 | `/admin/billing/invoice` | 当前无可开票账单；展示发票申请表 | 申请/列表/信息页签、样张、提交申请 | `sources/web/src-001/019-billing-invoice-default-desktop.png` | 默认/空态已完成；校验和提交结果未触发 |
| `src-001` | 账户管理 | `/admin/billing/accounts` | 支付通知邮箱暂无数据 | 编辑通知邮箱 | `sources/web/src-001/020-billing-accounts-default-desktop.png` | 默认/空态已完成；编辑弹窗待补采 |
| `src-001` | AI 用量概览 | `/admin/aibilling/usage-overview` | 飞书 AI 企业版购买介绍页 | 立即购买、联系客服 | `sources/web/src-001/021-aibilling-usage-overview-default-desktop.png` | 默认态已完成；当前套餐无业务数据 |
| `src-001` | AI 用量详情 | `/admin/aibilling/usage-detail` | 飞书 AI 企业版购买介绍页 | 立即购买、联系客服 | `sources/web/src-001/022-aibilling-usage-detail-default-desktop.png` | 默认态已完成；当前套餐无业务数据 |
| `src-001` | AI 用量日志 | `/admin/aibilling/usage-log` | 飞书 AI 企业版购买介绍页 | 立即购买、联系客服 | `sources/web/src-001/023-aibilling-usage-log-default-desktop.png` | 默认态已完成；当前套餐无业务数据 |
| `src-001` | AI 限额管理 | `/admin/aibilling/quota-manage` | 飞书 AI 企业版购买介绍页 | 立即购买、联系客服 | `sources/web/src-001/024-aibilling-quota-manage-default-desktop.png` | 默认态已完成；当前套餐无业务数据 |
| `src-001` | 容量概览 | `/admin/drive/quota/usage` | 展示存储总量、月度趋势和成员排行 | 月度视图、成员容量明细 | `sources/web/src-001/025-drive-quota-usage-default-desktop.png` | 默认态已完成；明细待补采 |
| `src-001` | 存储清理 | `/admin/drive/quota/clean` | 聊天文件、云文档、视频会议、邮箱清理入口 | 进入各类清理流程 | `sources/web/src-001/026-drive-quota-clean-default-desktop.png` | 默认态已完成；各清理流程待补采 |
| `src-001` | 上限管理 | `/admin/drive/quota/limit` | 统一存储上限管理升级页 | 成员/部门/提示配置页签、立即升级 | `sources/web/src-001/027-drive-quota-limit-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 策略管理 | `/admin/security/policy-center/policy-manage` | 策略中心增值能力介绍页 | 联系客服升级 | `sources/web/src-001/028-security-policy-center-policy-manage-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 安全概览 | `/admin/security/security-center/dashboard` | 安全中心新版介绍页 | 立即体验 | `sources/web/src-001/029-security-security-center-dashboard-default-desktop.png` | 默认态已完成；体验后状态待补采 |
| `src-001` | 成员异常 | `/admin/security/security-center/employee-alert` | 与安全中心共用新版介绍页 | 立即体验 | `sources/web/src-001/030-security-security-center-employee-alert-default-desktop.png` | 默认态已完成；体验后状态待补采 |
| `src-001` | 文档异常 | `/admin/security/security-center/document-alert` | 与安全中心共用新版介绍页 | 立即体验 | `sources/web/src-001/031-security-security-center-document-alert-default-desktop.png` | 默认态已完成；体验后状态待补采 |
| `src-001` | 成员权限 | `/admin/security/permission` | 部分成员与文档权限设置入口可见；高级安全能力受版本限制；出现升级引导 | 进入各设置项、升级、关闭引导 | `sources/web/src-001/032-security-permission-default-desktop.png` | 默认/引导态已完成；详情待补采 |
| `src-001` | 账号安全 | `/admin/security/accounts-security` | 账号安全增值能力介绍页 | 联系客服升级、查看能力详情 | `sources/web/src-001/033-security-accounts-security-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 终端安全 | `/admin/security/terminal-security` | 终端安全增值能力介绍页 | 联系客服升级、查看能力详情 | `sources/web/src-001/034-security-terminal-security-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 网络安全 | `/admin/security/network-security` | 网络安全增值能力介绍页 | 联系客服升级、查看能力详情 | `sources/web/src-001/035-security-network-security-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 链接安全 | `/admin/security/url-security/overview` | 近 7 天风险趋势、排行和点击日志为空 | 策略入口、日期/风险/成员筛选 | `sources/web/src-001/036-security-url-security-overview-default-desktop.png` | 默认/空态已完成；策略页待补采 |
| `src-001` | 数据分类 | `/admin/security/data-classification` | 数据分类增值能力介绍页 | 联系客服升级、数据发现详情 | `sources/web/src-001/037-security-data-classification-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 数据保护 | `/admin/security/data-security` | 数据保护增值能力介绍页 | 联系客服升级、能力详情 | `sources/web/src-001/038-security-data-security-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 部署与加密 | `/admin/security/organization-trust` | 数据私有化与自主密钥增值能力介绍页 | 联系客服升级、能力详情 | `sources/web/src-001/039-security-organization-trust-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 日志审计 | `/admin/security/compliance/internal-risk-control` | 成员、管理员、OpenAPI、People 日志入口可见 | 进入四类审计日志 | `sources/web/src-001/040-security-compliance-internal-risk-control-default-desktop.png` | 默认态已完成；日志子页待补采 |
| `src-001` | 权限审计 | `/admin/security/compliance/authz` | 展示权限审计能力，但当前账号页面显示“无操作权限” | 联系客服升级、查看能力说明 | `sources/web/src-001/041-security-compliance-authz-default-desktop.png` | 默认/权限态已完成；其他角色不可见 |
| `src-001` | 数据保险箱 | `/admin/security/compliance/vault` | 数据保留策略入口可见 | 进入数据保留配置 | `sources/web/src-001/042-security-compliance-vault-default-desktop.png` | 默认态已完成；策略详情待补采 |
| `src-001` | 内容合规 | `/admin/security/compliance/content-compliance` | 内容合规增值能力介绍页 | 联系客服升级、能力详情 | `sources/web/src-001/043-security-compliance-content-compliance-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 隐私设置 | `/admin/security/compliance/privacy-settings` | 地理位置、合规通知、移动端通知预览设置入口可见 | 进入三类隐私配置 | `sources/web/src-001/044-security-compliance-privacy-settings-default-desktop.png` | 默认态已完成；配置详情待补采 |
| `src-001` | 数据概览 | `/admin/data-analysis/overview`，实际 `/uptodate` | 展示截至 2026-08-13 的员工和各产品使用指标 | 组织/版本筛选、导出、查看详情 | `sources/web/src-001/045-data-analysis-overview-default-desktop.png` | 默认态已完成；筛选和详情待补采 |
| `src-001` | 成员活跃数据 | `/admin/data-analysis/member-active`，实际 `/uptodate` | 概览页展示活跃、激活、新增、离职和使用时长指标 | 概览/详情页签、组织/版本筛选、导出 | `sources/web/src-001/046-data-analysis-member-active-default-desktop.png` | 默认态已完成；详情页签待补采 |
| `src-001` | 消息报表 | `/admin/data-analysis/application/im` | 展示消息活跃与发送指标，当前值为 0 | 组织/版本筛选、导出 | `sources/web/src-001/047-data-analysis-application-im-default-desktop.png` | 默认态已完成 |
| `src-001` | 云文档报表 | `/admin/data-analysis/application/space` | 展示云文档活跃与创建指标，当前值为 0 | 组织/版本筛选、导出 | `sources/web/src-001/048-data-analysis-application-space-default-desktop.png` | 默认态已完成 |
| `src-001` | 日历报表 | `/admin/data-analysis/application/calendar` | 展示日历活跃与日程创建指标，当前值为 0 | 组织/版本筛选、导出 | `sources/web/src-001/049-data-analysis-application-calendar-default-desktop.png` | 默认态已完成 |
| `src-001` | 邮箱报表 | `/admin/data-analysis/application/email` | 展示内外部邮件收发指标，当前值为 0 | 组织/版本筛选、导出 | `sources/web/src-001/050-data-analysis-application-email-default-desktop.png` | 默认态已完成 |
| `src-001` | 任务报表 | `/admin/data-analysis/application/todo` | 展示任务活跃与创建指标，当前值为 0 | 组织/版本筛选、导出 | `sources/web/src-001/051-data-analysis-application-todo-default-desktop.png` | 默认态已完成 |
| `src-001` | 视频会议报表 | `/admin/data-analysis/application/vc`，实际 `/dashboard` | 会议数、时长、参会、设备和服务数据均为空 | 概览/报告页签、维度切换、多处导出 | `sources/web/src-001/052-data-analysis-application-vc-default-desktop.png` | 默认/空态已完成；子页签待补采 |
| `src-001` | 服务台报表 | `/admin/data-analysis/application/helpdesk`，实际 `/usage` | 使用情况页无趋势数据 | 使用/运营页签、服务台/部门筛选、导出 | `sources/web/src-001/053-data-analysis-application-helpdesk-default-desktop.png` | 默认/空态已完成；运营页签待补采 |
| `src-001` | 知识库报表 | `/admin/data-analysis/application/wiki` | 增值版本介绍、案例和套餐对比页 | 帮助中心、升级、咨询 | `sources/web/src-001/054-data-analysis-application-wiki-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 应用使用数据 | `/admin/data-analysis/app-usage` | 增值版本介绍、问答和套餐对比页 | 帮助中心、升级、咨询 | `sources/web/src-001/055-data-analysis-app-usage-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 品牌配置 | `/admin/customization/brand-config` | 展示品牌、帮助入口、关于页、下载引导和机器人消息配置入口；均标注增值版本 | 进入各配置项 | `sources/web/src-001/056-customization-brand-config-default-desktop.png` | 默认态已完成；配置详情待补采 |
| `src-001` | 功能配置 | `/admin/customization/feature-config` | 客户端导航栏可配置；其余多项标注增值版本 | 进入导航栏、开屏、皮肤、表情、勋章、红包和提示语配置 | `sources/web/src-001/057-customization-feature-config-default-desktop.png` | 默认态已完成；配置详情待补采 |
| `src-001` | 企业信息 | `/admin/enterprise/info` | 企业未认证；展示基础信息、联系人、地址和解散入口 | 信息/地址页签、编辑、认证、解散企业 | `sources/web/src-001/058-enterprise-info-default-desktop.png` | 默认态已完成；编辑与破坏性操作未触发 |
| `src-001` | 管理员权限 | `/admin/enterprise/auth` | 管理员角色列表有系统角色和自定义示例角色 | 角色搜索、日志、导出、创建角色、详情、添加管理员 | `sources/web/src-001/059-enterprise-auth-default-desktop.png` | 默认态已完成；操作弹窗待补采 |
| `src-001` | 组织架构数据同步 | `/admin/enterprise/sync` | 外部组织架构同步数据源创建入口 | 创建同步数据源、帮助 | `sources/web/src-001/060-enterprise-sync-default-desktop.png` | 默认态已完成；创建流程待补采 |
| `src-001` | 数据迁移 | `/admin/enterprise/data-governance` | Exchange/Google 日历同步和 IMAP 邮箱迁移入口 | 进入三类迁移流程 | `sources/web/src-001/061-enterprise-data-governance-default-desktop.png` | 默认态已完成；迁移流程待补采 |
| `src-001` | 风险控制 | `/admin/enterprise/risk-control` | 敏感操作保护和机密成员保护均未启用，且标注增值版本 | 前往配置 | `sources/web/src-001/062-enterprise-risk-control-default-desktop.png` | 默认态已完成；当前版本受限 |
| `src-001` | 版本升级提醒 | `/admin/enterprise/version-manage` | 当前无提醒记录 | 选择版本/提醒方式、新建提醒 | `sources/web/src-001/063-enterprise-version-manage-default-desktop.png` | 默认/空态已完成；新建与校验待补采 |

## 图片与文档

| 来源 ID | 文件 | 内容范围 | 关联模块 | 提取结果 | 处理状态 |
| --- | --- | --- | --- | --- | --- |
| `src-001` | `sources/web/src-001/*.png`（63 个） | 63 个一级页面的 1440 × 1000 桌面默认态 | 全部后台模块 | 与网站架构表逐项对应 | 已完成 |
| `src-001` | `sources/web/src-001/*.json`（63 个） | 页面标题、请求/实际路由、可见文本、按钮、表单控件和标题层级 | 全部后台模块 | 与同名前缀截图逐项对应 | 已完成 |

## 来源缺口与冲突

| 来源 ID | 缺口/冲突/决定（含范围与日期） | 影响 | 后续处理 |
| --- | --- | --- | --- |
| `src-001` | 2026-08-14：一级导航与默认态主采集完成；新建/编辑弹窗、抽屉、二级页签、详情页、表单校验、错误态和提交结果未逐项展开。 | 可以反推信息架构、默认/空/版本/权限状态和一级操作入口；不能据此断言完整字段规则、状态转换或错误处理。 | 等待用户选择“继续补采”或“接受缺口并进入计划确认”。 |
| `src-001` | 2026-08-14：当前套餐导致 AI 管理、部分安全、知识库/应用报表、品牌与文化能力显示升级页；权限审计显示“无操作权限”。 | 无法观察受限功能的真实业务页面、字段和交互。 | 若需要纳入现状 PRD，需提供具备对应套餐/权限的登录视角；否则按当前受限状态记录。 |
| `src-001` | 2026-08-14：会议室、设备、审核、API、订单、账户、链接安全、提醒等页面当前无业务记录。 | 无法观察行详情、批量操作结果和有数据状态。 | 可提供脱敏测试数据后补采，或接受现有空态边界。 |
| `src-001` | 2026-08-14：页面证据包含当前企业的可见数据和联系人信息。 | PRD 如直接复述会暴露非必要标识信息。 | 后续 PRD 仅保留产品结构和业务规则，企业编号、联系人等具体值统一脱敏。 |
| `src-001` | 2026-08-14：用户选择“接受缺口并规划”。接受范围包括已登记的未展开交互、受套餐/权限限制页面、空数据页面和其他角色视角缺失。 | 允许进入 `PROJECT.md` 与 `PLAN.md` 确认；PRD 只能描述已观察范围，不能补造受限功能内部规则。 | 已接受；后续如新增证据，保留 `src-001` 编号并补采更新。 |
