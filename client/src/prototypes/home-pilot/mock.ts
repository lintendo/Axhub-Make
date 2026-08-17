/**
 * 首页工作台（home-pilot）· mock 数据
 */

export type TodoCategory = '公文' | '董事会事务' | '会议';
export type TodoBusinessType = '调研' | '信息' | '会议发起' | '归档材料' | '制度' | '收文' | '发文' | '会议变更' | '董事签字';

export interface TodoItem {
  id: string;
  system: string;
  type: TodoBusinessType;
  title: string;
  submitter: string;
  submitTime: string;
  category: TodoCategory;
  taskId?: string;
  node?: string;
  role?: string;
}

export interface AppTile {
  key: string;
  label: string;
  icon: string;
  gradient: string;
}

export interface SystemTile {
  key: string;
  label: string;
  icon: string;
  gradient: string;
}

export const APP_TILES: AppTile[] = [
  { key: 'rule', label: '制度发起', icon: 'file-text', gradient: 'linear-gradient(135deg, #E5EDFF 0%, #DBE5FF 100%)' },
  { key: 'proposal', label: '议案征集', icon: 'clipboard-list', gradient: 'linear-gradient(135deg, #E5EDFF 0%, #DBE5FF 100%)' },
  { key: 'meeting', label: '会议发起', icon: 'calendar-days', gradient: 'linear-gradient(135deg, #DFF6F0 0%, #D2F0E8 100%)' },
  { key: 'archive', label: '材料归档', icon: 'archive', gradient: 'linear-gradient(135deg, #E4F3E1 0%, #D6ECD1 100%)' },
  { key: 'sign', label: '签字发起', icon: 'file-signature', gradient: 'linear-gradient(135deg, #E8F4FF 0%, #D6EBFF 100%)' },
  { key: 'research', label: '调研发起', icon: 'search', gradient: 'linear-gradient(135deg, #FDECD1 0%, #FBE0B8 100%)' },
  { key: 'info', label: '信息发起', icon: 'info', gradient: 'linear-gradient(135deg, #FDE1D6 0%, #FBD1C1 100%)' },
];

export const SYSTEM_TILES: SystemTile[] = [
  { key: 'mail', label: '石化邮箱', icon: 'mail', gradient: 'linear-gradient(135deg, #E5EDFF 0%, #DBE5FF 100%)' },
  { key: 'office', label: '协同办公系统', icon: 'monitor', gradient: 'linear-gradient(135deg, #DFF6F0 0%, #D2F0E8 100%)' },
  { key: 'finance', label: '财务共享平台', icon: 'circle-dollar-sign', gradient: 'linear-gradient(135deg, #FDECD1 0%, #FBE0B8 100%)' },
];

export const TODO_CATEGORIES: TodoCategory[] = ['公文', '董事会事务', '会议'];

function buildTodos(): TodoItem[] {
  const items: TodoItem[] = [
    // 董事签字流程全部环节待办（按流程顺序置顶）
    {
      id: 't-sign-001',
      system: '董事会事务',
      type: '董事签字',
      title: '第四届董事会第三十一次会议决议签字',
      submitter: '王炜硕',
      submitTime: '2026-07-28 09:30:00',
      category: '董事会事务',
      taskId: 'sign-001',
      node: 'approve-dept',
      role: '部室负责人',
    },
    {
      id: 't-sign-002',
      system: '董事会事务',
      type: '董事签字',
      title: '战略与投资委员会第十五次会议审阅意见签字',
      submitter: '王炜硕',
      submitTime: '2026-07-27 16:00:00',
      category: '董事会事务',
      taskId: 'sign-002',
      node: 'approve-office',
      role: '董办负责人',
    },
    {
      id: 't-sign-003',
      system: '董事会事务',
      type: '董事签字',
      title: '第四届董事会审计与风险委员会第十四次会议通知签字',
      submitter: '王炜硕',
      submitTime: '2026-07-26 10:00:00',
      category: '董事会事务',
      taskId: 'sign-003',
      node: 'approve-secretary',
      role: '董秘',
    },
    {
      id: 't-sign-004',
      system: '董事会事务',
      type: '董事签字',
      title: '薪酬与考核委员会第十二次会议授权委托书签字',
      submitter: '王炜硕',
      submitTime: '2026-07-25 14:20:00',
      category: '董事会事务',
      taskId: 'sign-004',
      node: 'deliver',
      role: '董办经办人',
    },
    {
      id: 't-sign-005',
      system: '董事会事务',
      type: '董事签字',
      title: '第四届董事会第三十一次会议决议签字',
      submitter: '王炜硕',
      submitTime: '2026-07-28 09:30:00',
      category: '董事会事务',
      taskId: 'sign-001',
      node: 'sign',
      role: '外部董事',
    },
    {
      id: 't-sign-006',
      system: '董事会事务',
      type: '董事签字',
      title: '第四届董事会社会责任委员会第四次会议决议签字',
      submitter: '王炜硕',
      submitTime: '2026-07-24 09:00:00',
      category: '董事会事务',
      taskId: 'sign-005',
      node: 'party-office-clerk',
      role: '党组组织部文书',
    },
    {
      id: 't-sign-007',
      system: '董事会事务',
      type: '董事签字',
      title: '战略与投资委员会第十五次会议审阅意见签字',
      submitter: '王炜硕',
      submitTime: '2026-07-27 16:00:00',
      category: '董事会事务',
      taskId: 'sign-002',
      node: 'office-director',
      role: '办公室主任',
    },
    {
      id: 't-sign-008',
      system: '董事会事务',
      type: '董事签字',
      title: '第四届董事会审计与风险委员会第十四次会议通知签字',
      submitter: '王炜硕',
      submitTime: '2026-07-26 10:00:00',
      category: '董事会事务',
      taskId: 'sign-003',
      node: 'detail',
      role: '董办经办人',
    },
    {
      id: 't-sign-009',
      system: '董事会事务',
      type: '董事签字',
      title: '第四届董事会社会责任委员会第四次会议决议签字',
      submitter: '王炜硕',
      submitTime: '2026-07-24 09:00:00',
      category: '董事会事务',
      taskId: 'sign-005',
      node: 'finish',
      role: '董办经办人',
    },
    {
      id: 't-001',
      system: '董事会事务',
      type: '调研',
      title: '股份董事会赴中石化炼化工程调研方案',
      submitter: '张三',
      submitTime: '2020-11-25 23:26:08',
      category: '董事会事务',
    },
    {
      id: 't-002',
      system: '董事会事务',
      type: '信息',
      title: '董事参考第32期',
      submitter: '张三',
      submitTime: '2020-11-25 23:26:08',
      category: '董事会事务',
    },
    {
      id: 't-003',
      system: '董事会事务',
      type: '会议发起',
      title: '第四届董事会监督委员会（审计与风险委员会）第八次会议会议安排与材料',
      submitter: '李四',
      submitTime: '2020-11-25 23:26:08',
      category: '董事会事务',
    },
    {
      id: 't-004',
      system: '董事会事务',
      type: '归档材料',
      title: '第四届董事会第二十一次会议归档材料',
      submitter: '李四',
      submitTime: '2020-11-25 23:26:08',
      category: '董事会事务',
    },
    {
      id: 't-005',
      system: '董事会事务',
      type: '归档材料',
      title: '第三届董事会第十五次会议归档材料',
      submitter: '王五',
      submitTime: '2020-11-24 18:12:33',
      category: '董事会事务',
    },
    {
      id: 't-006',
      system: '公文',
      type: '收文',
      title: '关于报送2024年度董事会工作报告的通知',
      submitter: '赵六',
      submitTime: '2020-11-24 16:45:21',
      category: '公文',
    },
    {
      id: 't-007',
      system: '公文',
      type: '发文',
      title: '关于聘任公司高级管理人员的议案',
      submitter: '孙七',
      submitTime: '2020-11-24 11:08:55',
      category: '公文',
    },
    {
      id: 't-008',
      system: '公文',
      type: '收文',
      title: '关于加强子公司董事会建设的指导意见',
      submitter: '周八',
      submitTime: '2020-11-23 09:33:17',
      category: '公文',
    },
    {
      id: 't-009',
      system: '会议',
      type: '会议发起',
      title: '2024年第四次临时会议发起审批',
      submitter: '吴九',
      submitTime: '2020-11-23 14:22:40',
      category: '会议',
    },
    {
      id: 't-010',
      system: '会议',
      type: '会议变更',
      title: '第四届董事会第二十一次会议时间变更申请',
      submitter: '郑十',
      submitTime: '2020-11-22 10:15:08',
      category: '会议',
    },
    {
      id: 't-011',
      system: '会议',
      type: '会议发起',
      title: '2024年年度会议发起审批',
      submitter: '钱十一',
      submitTime: '2020-11-22 08:50:29',
      category: '会议',
    },
    {
      id: 't-012',
      system: '董事会事务',
      type: '制度',
      title: '董事会议事规则修订稿',
      submitter: '冯十二',
      submitTime: '2020-11-21 17:05:44',
      category: '董事会事务',
    },
    {
      id: 't-013',
      system: '董事会事务',
      type: '调研',
      title: '独立董事赴销售板块调研安排',
      submitter: '陈十三',
      submitTime: '2020-11-21 11:30:12',
      category: '董事会事务',
    },
    {
      id: 't-014',
      system: '公文',
      type: '发文',
      title: '关于召开2024年年度会议的通知',
      submitter: '褚十四',
      submitTime: '2020-11-20 15:18:36',
      category: '公文',
    },
    {
      id: 't-016',
      system: '公文',
      type: '收文',
      title: '关于做好2024年度重点工作总结的通知',
      submitter: '沈十六',
      submitTime: '2020-11-20 13:26:18',
      category: '公文',
    },
    {
      id: 't-017',
      system: '公文',
      type: '发文',
      title: '关于印发公司董事会授权管理清单的通知',
      submitter: '韩十七',
      submitTime: '2020-11-19 17:05:42',
      category: '公文',
    },
    {
      id: 't-018',
      system: '公文',
      type: '收文',
      title: '关于开展子企业规范董事会建设情况检查的函',
      submitter: '杨十八',
      submitTime: '2020-11-19 10:48:09',
      category: '公文',
    },
    {
      id: 't-019',
      system: '公文',
      type: '发文',
      title: '关于报送年度重点议案落实情况的请示',
      submitter: '朱十九',
      submitTime: '2020-11-18 16:12:35',
      category: '公文',
    },
    {
      id: 't-015',
      system: '会议',
      type: '会议变更',
      title: '临时会议议程调整申请',
      submitter: '卫十五',
      submitTime: '2020-11-20 09:42:51',
      category: '会议',
    },
  ];
  return items;
}

export const todoList: TodoItem[] = buildTodos();

export const doneList: TodoItem[] = [
  {
    id: 'd-001',
    system: '公文',
    type: '发文',
    title: '关于聘任公司总法律顾问的议案',
    submitter: '赵六',
    submitTime: '2020-11-20 10:30:00',
    category: '公文',
  },
  {
    id: 'd-002',
    system: '董事会事务',
    type: '制度',
    title: '董事会授权管理办法（试行）',
    submitter: '张三',
    submitTime: '2020-11-18 14:20:00',
    category: '董事会事务',
  },
  {
    id: 'd-003',
    system: '会议',
    type: '会议发起',
    title: '第三届董事会第十二次会议发起审批',
    submitter: '吴九',
    submitTime: '2020-11-15 09:10:00',
    category: '会议',
  },
  {
    id: 'd-004',
    system: '董事会事务',
    type: '调研',
    title: '外部董事赴新能源板块调研方案',
    submitter: '李四',
    submitTime: '2020-11-13 16:45:00',
    category: '董事会事务',
  },
  {
    id: 'd-005',
    system: '公文',
    type: '收文',
    title: '关于进一步规范董事会决策程序的通知',
    submitter: '孙七',
    submitTime: '2020-11-12 11:20:00',
    category: '公文',
  },
  {
    id: 'd-006',
    system: '董事会事务',
    type: '信息',
    title: '董事参考第31期',
    submitter: '张三',
    submitTime: '2020-11-10 15:36:00',
    category: '董事会事务',
  },
  {
    id: 'd-007',
    system: '会议',
    type: '会议变更',
    title: '第三届董事会第十二次会议议程调整申请',
    submitter: '郑十',
    submitTime: '2020-11-09 10:05:00',
    category: '会议',
  },
  {
    id: 'd-008',
    system: '公文',
    type: '发文',
    title: '关于印发董事会年度重点工作计划的通知',
    submitter: '赵六',
    submitTime: '2020-11-06 17:18:00',
    category: '公文',
  },
  {
    id: 'd-009',
    system: '董事会事务',
    type: '归档材料',
    title: '第三届董事会第十一次会议归档材料',
    submitter: '王五',
    submitTime: '2020-11-04 14:52:00',
    category: '董事会事务',
  },
  {
    id: 'd-010',
    system: '会议',
    type: '会议发起',
    title: '2020年第三次临时会议发起审批',
    submitter: '吴九',
    submitTime: '2020-11-02 09:28:00',
    category: '会议',
  },
];

/**
 * 会议发起 / 待办审批 所需数据
 */

export interface MeetingDetail {
  id: string;
  title: string;
  secretLevel: string;
  meetingType: string;
  date: string;
  description: string;
  attachments: string[];
}

export interface ApprovalRecord {
  id: string;
  node: string;
  handler: string;
  time: string;
  result: string;
  comment: string;
}

export interface SmsRecord {
  id: string;
  receiver: string;
  time: string;
  content: string;
  success: boolean;
}

export interface ChangeRecord {
  id: string;
  time: string;
  status: string;
  handler: string;
}

export interface MeetingTodoItem {
  id: string;
  name: string;
  form: string;
  time: string;
  status: string;
}

export const meetingDetail: MeetingDetail = {
  id: 'm-001',
  title: '第四届董事会监督委员会（审计与风险委员会）第八次会议会议安排与材料',
  secretLevel: '内部',
  meetingType: '董事沟通会前',
  date: '2025-04-21 12:00:00',
  description:
    '我是情况简述内容，我是情况简述内容，我是情况简述内容，我是情况简述内容，我是情况简述内容，我是情况简述内容，我是情况简述内容。',
  attachments: ['会议议程.pdf', '议案材料汇总.docx', '审计报告2024年度.pdf'],
};

export const meetingApprovalRecords: ApprovalRecord[] = [
  { id: 'a-001', node: '部室负责人审核', handler: '张征', time: '2023-02-28 08:21', result: '同意', comment: '同意发起。' },
  { id: 'a-002', node: '董办负责人审核', handler: '乔茹', time: '2023-02-28 08:21', result: '同意', comment: '材料齐全，同意。' },
  { id: 'a-003', node: '董秘审批', handler: '李敏', time: '2023-02-28 08:21', result: '同意', comment: '同意。' },
  { id: 'a-004', node: '董事办理', handler: '王强', time: '2023-02-28 08:21', result: '同意', comment: '已阅，同意。' },
];

export const meetingSmsRecords: SmsRecord[] = [
  { id: 's-001', receiver: '司庆才', time: '2023-09-19 17:24:11', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。', success: true },
  { id: 's-002', receiver: '司庆才', time: '2023-09-19 17:24:11', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。', success: false },
  { id: 's-003', receiver: '司庆才', time: '2023-09-19 17:24:11', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。', success: true },
  { id: 's-004', receiver: '司庆才', time: '2023-09-19 17:24:11', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。', success: true },
  { id: 's-005', receiver: '司庆才', time: '2023-09-19 17:24:11', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。', success: true },
];

export const meetingChangeRecords: ChangeRecord[] = [
  { id: 'c-001', time: '2023-04-01 10:46:25', status: '草稿', handler: '系统自动处理' },
  { id: 'c-002', time: '2023-04-01 10:46:25', status: '已过期', handler: '司庆才' },
  { id: 'c-003', time: '2023-04-01 10:46:25', status: '已下发', handler: '系统自动处理' },
  { id: 'c-004', time: '2023-04-01 10:46:25', status: '已作废', handler: '司庆才' },
  { id: 'c-005', time: '2023-04-01 10:46:25', status: '已下发', handler: '系统自动处理' },
];

export const meetingTodoList: MeetingTodoItem[] = [
  { id: 'mt-001', name: '第四届董事会第二十一次会议', form: '现场', time: '2025-03-31 10:30', status: '待归档' },
  { id: 'mt-002', name: '第四届董事会审计与风险委员会第八次会议', form: '现场', time: '2025-04-15 09:00', status: '审批中' },
  { id: 'mt-003', name: '第四届董事会第二十一次会议（临时）', form: '现场', time: '2025-04-25 15:30', status: '审批中' },
  { id: 'mt-004', name: '第四届董事会监督委员会第六次会议', form: '现场、通讯', time: '2025-04-28 09:30', status: '待归档' },
];

/**
 * 制度列表数据
 */

export type RegulationCategory = '全部' | '公司章程' | '议事规则' | '决策运行' | '支撑保障' | '管理监督';

export interface RegulationItem {
  id: string;
  name: string;
  docNo: string;
  category: Exclude<RegulationCategory, '全部'>;
  issueDate: string;
}

export const REGULATION_CATEGORIES: RegulationCategory[] = ['全部', '公司章程', '议事规则', '决策运行', '支撑保障', '管理监督'];

export const regulationList: RegulationItem[] = [
  {
    id: 'r-001',
    name: '中国石化高级管理人员绩效考核和薪酬管理办法',
    docNo: '中国石化制〔2026〕3号',
    category: '管理监督',
    issueDate: '2026-01-25',
  },
  {
    id: 'r-002',
    name: '中国石油化工集团有限公司“三重一大”决策事项清单（2026年版）',
    docNo: '2026 年版',
    category: '决策运行',
    issueDate: '2026-01-01',
  },
  {
    id: 'r-003',
    name: '中国石油化工集团有限公司董事会授权管理办法',
    docNo: '中国石化制〔2025〕44号',
    category: '决策运行',
    issueDate: '2025-12-19',
  },
  {
    id: 'r-004',
    name: '中国石油化工集团有限公司总经理工作规则',
    docNo: '中国石化制〔2025〕45号',
    category: '议事规则',
    issueDate: '2025-12-19',
  },
  {
    id: 'r-005',
    name: '中国石油化工集团有限公司章程',
    docNo: '中国石化制〔2025〕10号',
    category: '公司章程',
    issueDate: '2025-01-26',
  },
  {
    id: 'r-006',
    name: '中国石油化工集团有限公司董事会审计与风险委员会工作规则',
    docNo: '中国石化制〔2025〕1号',
    category: '议事规则',
    issueDate: '2025-01-07',
  },
  {
    id: 'r-007',
    name: '中国石油化工集团有限公司“三重一大”决策制度实施办法',
    docNo: '中国石化党组制〔2024〕4号',
    category: '决策运行',
    issueDate: '2024-11-13',
  },
  {
    id: 'r-008',
    name: '中国石油化工集团有限公司董事会议案管理工作规范',
    docNo: '中国石化制〔2022〕21号',
    category: '支撑保障',
    issueDate: '2022-02-18',
  },
  {
    id: 'r-009',
    name: '中国石油化工集团有限公司董事会议事规则',
    docNo: '中国石化制〔2021〕238号',
    category: '议事规则',
    issueDate: '2021-11-11',
  },
  {
    id: 'r-010',
    name: '中国石油化工集团有限公司董事长专题会议制度',
    docNo: '中国石化制〔2021〕238号',
    category: '议事规则',
    issueDate: '2021-11-11',
  },
  {
    id: 'r-011',
    name: '中国石油化工集团有限公司董事会薪酬与考核委员会工作规则',
    docNo: '中国石化制〔2021〕237号',
    category: '议事规则',
    issueDate: '2021-11-10',
  },
  {
    id: 'r-012',
    name: '中国石油化工集团有限公司董事会战略委员会工作规则',
    docNo: '中国石化制〔2021〕236号',
    category: '议事规则',
    issueDate: '2021-11-09',
  },
  {
    id: 'r-013',
    name: '中国石油化工集团有限公司外部董事履职保障办法',
    docNo: '中国石化制〔2021〕235号',
    category: '支撑保障',
    issueDate: '2021-11-08',
  },
  {
    id: 'r-014',
    name: '中国石油化工集团有限公司董事会决议执行跟踪办法',
    docNo: '中国石化制〔2021〕234号',
    category: '决策运行',
    issueDate: '2021-11-05',
  },
  {
    id: 'r-015',
    name: '中国石油化工集团有限公司董事会议案征集管理办法',
    docNo: '中国石化制〔2021〕233号',
    category: '支撑保障',
    issueDate: '2021-11-03',
  },
  {
    id: 'r-016',
    name: '中国石油化工集团有限公司董事会年度工作报告制度',
    docNo: '中国石化制〔2021〕232号',
    category: '管理监督',
    issueDate: '2021-11-01',
  },
  {
    id: 'r-017',
    name: '中国石油化工集团有限公司章程（2024年修订版）',
    docNo: '中国石化制〔2024〕1号',
    category: '公司章程',
    issueDate: '2024-03-15',
  },
  {
    id: 'r-018',
    name: '中国石油化工股份有限公司章程',
    docNo: '中国石化制〔2023〕12号',
    category: '公司章程',
    issueDate: '2023-06-20',
  },
  {
    id: 'r-019',
    name: '中国石化集团子公司章程范本',
    docNo: '中国石化制〔2023〕15号',
    category: '公司章程',
    issueDate: '2023-08-10',
  },
  {
    id: 'r-020',
    name: '中国石油化工集团有限公司章程修正案',
    docNo: '中国石化制〔2022〕8号',
    category: '公司章程',
    issueDate: '2022-04-28',
  },
  {
    id: 'r-021',
    name: '中国石油化工集团有限公司境外公司章程管理办法',
    docNo: '中国石化制〔2022〕18号',
    category: '公司章程',
    issueDate: '2022-09-16',
  },
  {
    id: 'r-022',
    name: '中国石油化工集团有限公司董事会提名委员会工作规则',
    docNo: '中国石化制〔2023〕22号',
    category: '议事规则',
    issueDate: '2023-07-12',
  },
  {
    id: 'r-023',
    name: '中国石油化工集团有限公司董事会可持续发展委员会工作规则',
    docNo: '中国石化制〔2023〕25号',
    category: '议事规则',
    issueDate: '2023-09-05',
  },
  {
    id: 'r-024',
    name: '中国石油化工集团有限公司总经理办公会议事规则',
    docNo: '中国石化制〔2022〕30号',
    category: '议事规则',
    issueDate: '2022-11-30',
  },
  {
    id: 'r-025',
    name: '中国石油化工集团有限公司董事会秘书工作规则',
    docNo: '中国石化制〔2022〕28号',
    category: '议事规则',
    issueDate: '2022-10-18',
  },
  {
    id: 'r-026',
    name: '中国石油化工集团有限公司董事会会议议事规则',
    docNo: '中国石化制〔2021〕230号',
    category: '议事规则',
    issueDate: '2021-10-28',
  },
  {
    id: 'r-027',
    name: '中国石油化工集团有限公司投资决策管理办法',
    docNo: '中国石化制〔2024〕5号',
    category: '决策运行',
    issueDate: '2024-02-20',
  },
  {
    id: 'r-028',
    name: '中国石油化工集团有限公司融资管理办法',
    docNo: '中国石化制〔2024〕8号',
    category: '决策运行',
    issueDate: '2024-04-12',
  },
  {
    id: 'r-029',
    name: '中国石油化工集团有限公司对外担保管理办法',
    docNo: '中国石化制〔2023〕30号',
    category: '决策运行',
    issueDate: '2023-10-25',
  },
  {
    id: 'r-030',
    name: '中国石油化工集团有限公司资产处置管理办法',
    docNo: '中国石化制〔2023〕35号',
    category: '决策运行',
    issueDate: '2023-11-18',
  },
  {
    id: 'r-031',
    name: '中国石油化工集团有限公司年度投资计划管理办法',
    docNo: '中国石化制〔2023〕38号',
    category: '决策运行',
    issueDate: '2023-12-10',
  },
  {
    id: 'r-032',
    name: '中国石油化工集团有限公司并购管理办法',
    docNo: '中国石化制〔2022〕35号',
    category: '决策运行',
    issueDate: '2022-08-22',
  },
  {
    id: 'r-033',
    name: '中国石油化工集团有限公司董事会秘书工作细则',
    docNo: '中国石化制〔2024〕10号',
    category: '支撑保障',
    issueDate: '2024-05-08',
  },
  {
    id: 'r-034',
    name: '中国石油化工集团有限公司董事会专门委员会工作细则',
    docNo: '中国石化制〔2024〕12号',
    category: '支撑保障',
    issueDate: '2024-06-15',
  },
  {
    id: 'r-035',
    name: '中国石油化工集团有限公司董事履职评价办法',
    docNo: '中国石化制〔2023〕42号',
    category: '支撑保障',
    issueDate: '2023-07-28',
  },
  {
    id: 'r-036',
    name: '中国石油化工集团有限公司董事会会议组织管理办法',
    docNo: '中国石化制〔2023〕45号',
    category: '支撑保障',
    issueDate: '2023-09-12',
  },
  {
    id: 'r-037',
    name: '中国石油化工集团有限公司董事会信息披露管理办法',
    docNo: '中国石化制〔2023〕48号',
    category: '支撑保障',
    issueDate: '2023-10-08',
  },
  {
    id: 'r-038',
    name: '中国石油化工集团有限公司董事会档案管理办法',
    docNo: '中国石化制〔2022〕40号',
    category: '支撑保障',
    issueDate: '2022-07-15',
  },
  {
    id: 'r-039',
    name: '中国石油化工集团有限公司董事会决议执行监督办法',
    docNo: '中国石化制〔2022〕42号',
    category: '支撑保障',
    issueDate: '2022-08-30',
  },
  {
    id: 'r-040',
    name: '中国石化内部审计工作规定',
    docNo: '中国石化制〔2024〕15号',
    category: '管理监督',
    issueDate: '2024-03-22',
  },
  {
    id: 'r-041',
    name: '中国石化合规管理办法',
    docNo: '中国石化制〔2024〕18号',
    category: '管理监督',
    issueDate: '2024-04-28',
  },
  {
    id: 'r-042',
    name: '中国石化风险管理办法',
    docNo: '中国石化制〔2023〕52号',
    category: '管理监督',
    issueDate: '2023-11-15',
  },
  {
    id: 'r-043',
    name: '中国石化反垄断合规管理办法',
    docNo: '中国石化制〔2023〕55号',
    category: '管理监督',
    issueDate: '2023-12-05',
  },
  {
    id: 'r-044',
    name: '中国石化商业道德与反腐败管理办法',
    docNo: '中国石化制〔2022〕48号',
    category: '管理监督',
    issueDate: '2022-09-20',
  },
  {
    id: 'r-045',
    name: '中国石化境外投资监督管理办法',
    docNo: '中国石化制〔2022〕50号',
    category: '管理监督',
    issueDate: '2022-10-12',
  },
  {
    id: 'r-046',
    name: '中国石化子公司董事会建设评价办法',
    docNo: '中国石化制〔2021〕225号',
    category: '管理监督',
    issueDate: '2021-10-15',
  },
];

/**
 * 调研列表 / 调研详情数据
 */

export interface ResearchAttachment {
  id: string;
  name: string;
  type: 'doc' | 'docx' | 'pdf';
}

export interface ResearchListItem {
  id: string;
  title: string;
  location: string;
  members: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface ResearchApprovalRecord {
  seq: number;
  handler: string;
  node: string;
  result: string;
  time: string;
  opinion: string;
}

export interface ResearchSmsRecord {
  seq: number;
  receiver: string;
  sendTime: string;
  result: '成功' | '失败';
  content: string;
}

export interface ResearchChangeRecord {
  seq: number;
  handler: string;
  status: string;
  changeTime: string;
}

export interface ResearchDetail {
  id: string;
  title: string;
  stages: string[];
  startDate: string;
  endDate: string;
  location: string;
  members: string;
  planFiles: ResearchAttachment[];
  materialFiles: ResearchAttachment[];
  reportFiles: ResearchAttachment[];
  approvalRecords: ResearchApprovalRecord[];
  smsRecords: ResearchSmsRecord[];
  changeRecords: ResearchChangeRecord[];
}

export const researchList: ResearchListItem[] = [
  {
    id: 'rs-001',
    title: '集团公司董事赴浙江调研',
    location: '宁波、杭州',
    members: '周渝波、陈壁、冯树臣、李新华，张征',
    startDate: '2026-03-30',
    endDate: '2026-04-03',
    status: '已结束',
  },
  {
    id: 'rs-002',
    title: '集团公司董事赴港澳调研',
    location: '香港、澳门',
    members: '周渝波、陈月明、陈壁、冯树臣、蔡勇、张征',
    startDate: '2025-11-10',
    endDate: '2025-11-14',
    status: '已结束',
  },
  {
    id: 'rs-003',
    title: '集团公司董事赴东北调研',
    location: '长春、大庆、哈尔滨',
    members: '周渝波、陈月明、吴献东、陈壁、冯树臣，郭洪金、张征',
    startDate: '2025-07-01',
    endDate: '2025-07-04',
    status: '已结束',
  },
  {
    id: 'rs-004',
    title: '集团公司董事赴驻川渝企业调研',
    location: '重庆、阆中',
    members: '周渝波、陈月明、吴献东、陈壁、冯树臣、牛栓文，张征',
    startDate: '2025-05-26',
    endDate: '2025-06-30',
    status: '已结束',
  },
  {
    id: 'rs-005',
    title: '集团公司董事赴福建调研',
    location: '厦门、漳州、泉州、福州',
    members: '吴献东、陈月明、陈壁、潘正义、张征',
    startDate: '2025-02-24',
    endDate: '2025-02-28',
    status: '已结束',
  },
  {
    id: 'rs-006',
    title: '集团公司董事赴中东调研',
    location: '多哈、达曼、延布、迪拜',
    members: '吴献东、陈月明、陈壁、潘正义、张少峰、张征',
    startDate: '2024-11-04',
    endDate: '2024-11-12',
    status: '已结束',
  },
  {
    id: 'rs-007',
    title: '集团公司董事赴广东调研',
    location: '广州、湛江',
    members: '焦开河、陈月明、吴献东、陈壁、潘正义、万涛、张征',
    startDate: '2024-09-23',
    endDate: '2024-09-27',
    status: '已结束',
  },
  {
    id: 'rs-008',
    title: '集团公司董事赴内蒙古、甘肃调研',
    location: '内蒙古、甘肃',
    members: '钟韧、焦开河、陈月明、吴献东、陈壁、潘正义、张征',
    startDate: '2024-06-03',
    endDate: '2024-06-08',
    status: '已结束',
  },
  {
    id: 'rs-009',
    title: '集团公司董事赴上海、南京调研',
    location: '上海、南京',
    members: '焦开河、陈月明、吴献东、陈壁、潘正义、喻宝才、张征',
    startDate: '2024-03-11',
    endDate: '2024-03-15',
    status: '已结束',
  },
  {
    id: 'rs-010',
    title: '集团公司董事赴新疆调研',
    location: '乌鲁木齐、克拉玛依',
    members: '周渝波、陈月明、吴献东、陈壁、冯树臣、张征',
    startDate: '2023-09-12',
    endDate: '2023-09-16',
    status: '已结束',
  },
  {
    id: 'rs-011',
    title: '集团公司董事赴山东调研',
    location: '青岛、济南、烟台',
    members: '周渝波、陈壁、冯树臣、李新华、张征',
    startDate: '2023-05-18',
    endDate: '2023-05-22',
    status: '已结束',
  },
  {
    id: 'rs-012',
    title: '集团公司董事赴海南调研',
    location: '海口、三亚',
    members: '吴献东、陈月明、陈壁、潘正义、张征',
    startDate: '2023-03-06',
    endDate: '2023-03-10',
    status: '已结束',
  },
  {
    id: 'rs-013',
    title: '集团公司董事赴云南调研',
    location: '昆明、大理',
    members: '焦开河、陈月明、吴献东、陈壁、潘正义、万涛、张征',
    startDate: '2022-11-14',
    endDate: '2022-11-18',
    status: '已结束',
  },
  {
    id: 'rs-014',
    title: '集团公司董事赴湖北调研',
    location: '武汉、宜昌',
    members: '钟韧、焦开河、陈月明、吴献东、陈壁、潘正义、张征',
    startDate: '2022-08-22',
    endDate: '2022-08-26',
    status: '已结束',
  },
];

function buildResearchDetail(item: ResearchListItem): ResearchDetail {
  const planFile: ResearchAttachment = {
    id: `${item.id}-plan`,
    name: `${item.title}工作手册（呈报董事）.doc`,
    type: 'doc',
  };
  const reportFile: ResearchAttachment = {
    id: `${item.id}-report`,
    name: `关于${item.title}有关情况的报告（呈报董事稿）.docx`,
    type: 'docx',
  };

  const materialFiles: ResearchAttachment[] = [
    { id: `${item.id}-m1`, name: '1-中石化可持续航空燃料生产技术研究及进展.pdf', type: 'pdf' },
    { id: `${item.id}-m2`, name: '2-镇海炼化工作汇报.pdf', type: 'pdf' },
    { id: `${item.id}-m3`, name: '3-浙江石油工作汇报.pdf', type: 'pdf' },
  ];

  return {
    id: item.id,
    title: item.title,
    stages: ['调研安排', '调研材料', '调研报告'],
    startDate: item.startDate,
    endDate: item.endDate,
    location: item.location,
    members: item.members,
    planFiles: [planFile],
    materialFiles,
    reportFiles: [reportFile],
    approvalRecords: [
      { seq: 1, handler: '马永生', node: '董事办理', result: '同意', time: '2023-02-28 08:21', opinion: '同意' },
      { seq: 2, handler: '黄文生', node: '董秘审批', result: '同意', time: '2023-02-28 08:21', opinion: '同意' },
      { seq: 3, handler: '张征', node: '董办负责人审核', result: '同意', time: '2023-02-28 08:21', opinion: '同意' },
      { seq: 4, handler: '乔茹', node: '部室负责人审核', result: '同意', time: '2023-02-28 08:21', opinion: '同意' },
    ],
    smsRecords: [
      { seq: 1, receiver: '司庆才', sendTime: '2023-09-19 17:24:11', result: '成功', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。' },
      { seq: 2, receiver: '司庆才', sendTime: '2023-09-19 17:24:11', result: '失败', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。' },
      { seq: 3, receiver: '司庆才', sendTime: '2023-09-19 17:24:11', result: '成功', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。' },
      { seq: 4, receiver: '司庆才', sendTime: '2023-09-19 17:24:11', result: '成功', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。' },
      { seq: 5, receiver: '司庆才', sendTime: '2023-09-19 17:24:11', result: '成功', content: '您有1条董事会审批需要办理，请登录董事会系统进行办理。' },
    ],
    changeRecords: [
      { seq: 1, handler: '司庆才', status: '草稿', changeTime: '2023-04-01 10:46:25' },
      { seq: 2, handler: '系统自动处理', status: '已过期', changeTime: '2023-04-01 10:46:25' },
      { seq: 3, handler: '司庆才', status: '已下发', changeTime: '2023-04-01 10:46:25' },
      { seq: 4, handler: '司庆才', status: '已作废', changeTime: '2023-04-01 10:46:25' },
      { seq: 5, handler: '系统自动处理', status: '已完成', changeTime: '2023-04-01 10:46:25' },
      { seq: 6, handler: '系统自动处理', status: '已结束', changeTime: '2023-04-01 10:46:25' },
    ],
  };
}

export const researchDetailMap: Record<string, ResearchDetail> = Object.fromEntries(
  researchList.map((item) => [item.id, buildResearchDetail(item)]),
);

export function getResearchDetail(id: string): ResearchDetail | undefined {
  return researchDetailMap[id];
}

/**
 * 会议列表 / 会议材料归档详情数据（原 meeting-pilot 迁移合并）
 */

export type MeetingStatus = '待归档' | '审批中' | '审批通过' | '已归档';

export type MeetingCategory =
  | '董事会'
  | '战略与投资委员会'
  | '提名委员会'
  | '薪酬与考核委员会'
  | '审计与风险委员会'
  | '社会责任委员会';

export const MEETING_CATEGORIES: MeetingCategory[] = [
  '董事会',
  '战略与投资委员会',
  '提名委员会',
  '薪酬与考核委员会',
  '审计与风险委员会',
  '社会责任委员会',
];

export interface MeetingItem {
  id: string;
  name: string;
  category: MeetingCategory;
  form: string;
  time: string;
  status: MeetingStatus;
}

export interface MeetingArchive {
  id: string;
  title: string;
  meetingType: MeetingCategory;
  secretLevel: string;
  form: string;
  date: string;
  meetingNotice: string;
  proposalMaterials: string[];
  meetingResolution: string;
}

export const MEETING_STATUS_MAP: Record<MeetingStatus, string> = {
  待归档: 'default',
  审批中: 'warning',
  审批通过: 'success',
  已归档: 'info',
};

function makeMeetings(): MeetingItem[] {
  const base: Omit<MeetingItem, 'id' | 'name' | 'time' | 'status'>[] = [
    { category: '董事会', form: '书面' },
    { category: '董事会', form: '现场' },
    { category: '战略与投资委员会', form: '书面' },
    { category: '审计与风险委员会', form: '现场' },
    { category: '薪酬与考核委员会', form: '现场' },
    { category: '社会责任委员会', form: '书面' },
    { category: '董事会', form: '书面' },
    { category: '审计与风险委员会', form: '现场' },
    { category: '战略与投资委员会', form: '书面' },
    { category: '董事会', form: '书面' },
    { category: '提名委员会', form: '现场' },
    { category: '薪酬与考核委员会', form: '通讯' },
  ];

  const names: Record<MeetingCategory, string[]> = {
    董事会: ['第二十七次', '第二十八次', '第二十九次', '第三十次'],
    '战略与投资委员会': ['第十四次', '第十五次', '第十六次'],
    提名委员会: ['第三次', '第四次'],
    '薪酬与考核委员会': ['第十一次', '第十二次'],
    '审计与风险委员会': ['第十二次', '第十三次', '第十四次'],
    '社会责任委员会': ['第三次', '第四次'],
  };

  const dates = [
    '2026-04-29',
    '2026-04-23 14:00',
    '2026-04-20',
    '2026-04-17 14:00',
    '2026-04-17 08:30',
    '2026-04-17',
    '2026-03-17',
    '2026-03-13 14:30',
    '2026-03-13',
    '2026-02-13',
    '2026-02-10 09:00',
    '2026-01-28 10:00',
  ];

  const statuses: MeetingStatus[] = ['待归档', '审批中', '审批通过', '已归档'];

  const usedNames: Record<MeetingCategory, number> = {
    董事会: 0,
    '战略与投资委员会': 0,
    提名委员会: 0,
    '薪酬与考核委员会': 0,
    '审计与风险委员会': 0,
    '社会责任委员会': 0,
  };

  const list: MeetingItem[] = base.map((item, idx) => {
    const category = item.category;
    const nameIndex = usedNames[category];
    usedNames[category] += 1;
    const namePart = names[category][nameIndex % names[category].length];
    return {
      id: `m-${String(idx + 1).padStart(3, '0')}`,
      name: `第四届董事会${category === '董事会' ? '' : category}${namePart}会议`,
      ...item,
      time: dates[idx % dates.length],
      status: statuses[idx % statuses.length],
    };
  });

  // 补齐到 78 条，使分页更有真实感
  for (let i = list.length; i < 78; i += 1) {
    const category = MEETING_CATEGORIES[i % MEETING_CATEGORIES.length];
    const nameIndex = usedNames[category];
    usedNames[category] += 1;
    const namePart = names[category][nameIndex % names[category].length];
    list.push({
      id: `m-${String(i + 1).padStart(3, '0')}`,
      name: `第四届董事会${category === '董事会' ? '' : category}${namePart}会议`,
      category,
      form: i % 3 === 0 ? '书面' : i % 3 === 1 ? '现场' : '通讯',
      time: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      status: statuses[i % statuses.length],
    });
  }

  return list;
}

export const meetingList: MeetingItem[] = makeMeetings();

export const meetingArchive: MeetingArchive = {
  id: 'm-001',
  title: '第四届董事会第三十次会议',
  meetingType: '董事会',
  secretLevel: '内部',
  form: '书面',
  date: '2026-04-29',
  meetingNotice: '第四届董事会第三十次会议通知.pdf',
  proposalMaterials: [
    '1.关于解聘和聘任集团公司副总经理的议案.pdf',
    '1.1 国务院《关于同意陈燕斌、吕亮功职务调整的通知》.pdf',
    '1.2 陈燕斌简历.pdf',
    '2.会议决议.pdf',
  ],
  meetingResolution: '第四届董事会第三十次会议决议.pdf',
};

/**
 * 信息列表 / 信息详情数据（原 info-pilot 迁移合并）
 */

export type InfoType = '月报' | '季报' | '专报' | '专项报告';
export type InfoSecretLevel = '内部';
export type InfoItemStatus = '已结束';
export type InfoSendResult = '成功' | '失败';
export type InfoApproveResult = '同意' | '驳回' | '呈送' | '提交' | '超时系统自动办结' | '已办';

export interface InfoItem {
  id: string;
  name: string;
  type: InfoType;
  secretLevel: InfoSecretLevel;
  date: string;
  status: InfoItemStatus;
}

export interface InfoAttachment {
  id: number;
  name: string;
  type: 'docx' | 'pdf';
}

export interface InfoApprovalRecord {
  id: number;
  handler: string;
  node: string;
  result: InfoApproveResult;
  time: string;
  opinion: string;
}

export interface InfoDirectorRecord {
  id: number;
  handler: string;
  node: string;
  result: InfoApproveResult;
  time: string;
  opinion: string;
}

export interface InfoSmsRecord {
  id: number;
  time: string;
  receiver: string;
  result: InfoSendResult;
  content: string;
}

export interface InfoMailRecord {
  id: number;
  time: string;
  receiver: string;
  result: InfoSendResult;
  content: string;
}

export interface InfoViewRecord {
  id: number;
  text: string;
}

export interface InfoDetail extends InfoItem {
  category: InfoType;
  attachments: InfoAttachment[];
  approvals: InfoApprovalRecord[];
  externalDirectorRecords: InfoDirectorRecord[];
  employeeDirectorRecords: InfoDirectorRecord[];
  viewRecords: InfoViewRecord[];
  smsRecords: InfoSmsRecord[];
  mailRecords: InfoMailRecord[];
}

const typeList: InfoType[] = ['月报', '季报', '专报', '专项报告'];

function buildInfoList(): InfoItem[] {
  const items: InfoItem[] = [
    { id: 'info-001', name: '董事参考第48期', type: '月报', secretLevel: '内部', date: '2026-05-29', status: '已结束' },
    { id: 'info-002', name: '关于中国石化可持续航空燃料进展情况的报告', type: '专项报告', secretLevel: '内部', date: '2026-05-21', status: '已结束' },
    { id: 'info-003', name: '董事参考第47期', type: '季报', secretLevel: '内部', date: '2026-04-23', status: '已结束' },
    { id: 'info-004', name: '董事参考第46期', type: '月报', secretLevel: '内部', date: '2026-03-30', status: '已结束' },
    { id: 'info-005', name: '董事参考第45期', type: '月报', secretLevel: '内部', date: '2026-02-28', status: '已结束' },
    { id: 'info-006', name: '董事参考第44期', type: '月报', secretLevel: '内部', date: '2026-01-26', status: '已结束' },
    { id: 'info-007', name: '董事参考第43期', type: '季报', secretLevel: '内部', date: '2026-01-09', status: '已结束' },
    { id: 'info-008', name: '董事参考第42期', type: '月报', secretLevel: '内部', date: '2025-12-30', status: '已结束' },
    { id: 'info-009', name: '董事参考第41期', type: '月报', secretLevel: '内部', date: '2025-11-28', status: '已结束' },
    { id: 'info-010', name: '董事参考第39期-关于全国碳市场扩围的影响分析及建议', type: '专报', secretLevel: '内部', date: '2025-10-13', status: '已结束' },
  ];
  // 补足到 48 条
  const baseDate = new Date('2025-09-15');
  for (let i = 0; i < 38; i += 1) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i * 7);
    const type = typeList[i % typeList.length];
    const index = 49 + i;
    items.push({
      id: `info-${String(items.length + 1).padStart(3, '0')}`,
      name: `董事参考第${index}期`,
      type,
      secretLevel: '内部',
      date: d.toISOString().slice(0, 10),
      status: '已结束',
    });
  }
  return items;
}

export const infoList: InfoItem[] = buildInfoList();

const infoDetailMap: Record<string, InfoDetail> = {
  'info-001': {
    id: 'info-001',
    name: '董事参考第48期',
    type: '月报',
    category: '月报',
    secretLevel: '内部',
    date: '2026-05-29',
    status: '已结束',
    attachments: [
      { id: 1, name: '董事参考第48期.docx', type: 'docx' },
      { id: 2, name: '附件1：4月份主要绩效指标及财务指标运行情况.pdf', type: 'pdf' },
      { id: 3, name: '附件2：4月份资产负债、利润、现金流量表.pdf', type: 'pdf' },
    ],
    approvals: [
      { id: 1, handler: '王炜硕', node: '董办经办人', result: '同意', time: '2026/07/06 13:51:04', opinion: '' },
      { id: 2, handler: '王炜硕', node: '董办经办人', result: '呈送', time: '2026/05/29 18:09:12', opinion: '' },
      { id: 3, handler: '张征', node: '董办负责人', result: '同意', time: '2026/05/29 17:59:25', opinion: '已阅核。呈请各位董事阅。' },
      { id: 4, handler: '孙友', node: '部室负责人', result: '同意', time: '2026/05/29 10:33:37', opinion: '请张主任审签。' },
      { id: 5, handler: '王炜硕', node: '提交', result: '提交', time: '2026/05/29 10:03:33', opinion: '请孙处阅审。' },
    ],
    externalDirectorRecords: [
      { id: 1, handler: '陈月明', node: '董事办理', result: '超时系统自动办结', time: '2026/06/13 08:00:01', opinion: '' },
      { id: 2, handler: '李新华', node: '董事办理', result: '已办', time: '2026/06/08 05:06:59', opinion: '已阅知。谢谢！' },
      { id: 3, handler: '周渝波', node: '董事办理', result: '已办', time: '2026/06/04 14:12:30', opinion: '已阅。' },
      { id: 4, handler: '陈壁', node: '董事办理', result: '已办', time: '2026/05/30 21:36:52', opinion: '' },
      { id: 5, handler: '冯树臣', node: '董事办理', result: '已办', time: '2026/05/30 09:05:17', opinion: '已阅。' },
    ],
    employeeDirectorRecords: [
      { id: 1, handler: '秦都', node: '董事办理', result: '已办', time: '2026/07/06 09:59:25', opinion: '已阅' },
      { id: 2, handler: '杨应忠', node: '办公室主任', result: '已办', time: '2026/05/29 19:13:47', opinion: '' },
      { id: 3, handler: '李子嘉', node: '党组织部文书', result: '已办', time: '2026/05/29 18:11:02', opinion: '' },
    ],
    viewRecords: [
      { id: 34, text: '综合管理部王炜硕2026-05-29 17:29:13查看信息填报。' },
      { id: 35, text: '综合管理部张征2026-05-29 16:30:13查看信息填报。' },
      { id: 36, text: '综合管理部王炜硕2026-05-29 15:56:57查看信息填报。' },
      { id: 37, text: '综合管理部王炜硕2026-05-29 15:56:48查看信息填报。' },
      { id: 38, text: '综合管理部王炜硕2026-05-29 13:15:46查看信息填报。' },
      { id: 39, text: '综合管理部王炜硕2026-05-29 10:33:51查看信息填报。' },
      { id: 40, text: '综合管理部王炜硕2026-05-29 10:33:39查看信息填报。' },
      { id: 41, text: '综合管理部孙友2026-05-29 10:25:24查看信息填报。' },
      { id: 42, text: '综合管理部王炜硕2026-05-29 10:06:25查看信息填报。' },
      { id: 43, text: '综合管理部王炜硕2026-05-29 10:05:48查看信息填报。' },
      { id: 44, text: '综合管理部王炜硕2026-05-29 10:05:25查看信息填报。' },
    ],
    smsRecords: [
      { id: 1, time: '2026/05/29', receiver: '李新华', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 2, time: '2026/05/29', receiver: '陈月明', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 3, time: '2026/05/29', receiver: '陈壁', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 4, time: '2026/05/29', receiver: '冯树臣', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 5, time: '2026/05/29', receiver: '周渝波', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 6, time: '2026/05/29', receiver: '李子嘉', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 7, time: '2026/05/29', receiver: '王炜硕', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 8, time: '2026/05/29', receiver: '张征', result: '成功', content: '请您处理：信息—董事参考第48期' },
      { id: 9, time: '2026/05/29', receiver: '孙友', result: '成功', content: '请您处理：信息—董事参考第48期' },
    ],
    mailRecords: [],
  },
};

// 兜底：未命中 id 时回退到 info-001
export function getInfoDetail(id: string | undefined): InfoDetail {
  if (id && infoDetailMap[id]) return infoDetailMap[id];
  return infoDetailMap['info-001'];
}

/**
 * 我的发起列表数据
 */

export type MyInitiationTaskType = '信息' | '会议发起' | '材料归档' | '董事签字';

export type MyInitiationStatus =
  | '草稿'
  | '审批中'
  | '已驳回'
  | '已呈送'
  | '已完成'
  | '已结束'
  | '待归档'
  | '已归档';

export interface MyInitiationItem {
  id: string;
  name: string;
  taskType: MyInitiationTaskType;
  createTime: string;
  status: MyInitiationStatus;
  currentHandler: string;
  taskId?: string;
}

export const MY_INITIATION_TASK_TYPES: MyInitiationTaskType[] = ['信息', '会议发起', '材料归档', '董事签字'];

export const MY_INITIATION_STATUSES: MyInitiationStatus[] = [
  '草稿',
  '审批中',
  '已驳回',
  '已呈送',
  '已完成',
  '已结束',
  '待归档',
  '已归档',
];

function buildMyInitiationList(): MyInitiationItem[] {
  const baseNames: string[] = [
    '董事参考第51期',
    '请审阅第四届董事会第三十一次会议有关议案修改完善情况',
    '第四届董事会第三十一次会议安排及有关议案材料',
    '董事参考第50期',
    '董事参考第49期—2026年世界能源投资报告有关解读及分析建议',
    '转呈 国务院国资委研究中心有关研究报告',
    '第四届董事会薪酬与考核委员会第十二次会议',
    '第四届董事会审计与风险委员会第十四次会议',
    '第四届董事会第三十次会议',
    '第四届董事会薪酬与考核委员会第十一次会议',
    '第四届董事会战略与投资委员会第十五次会议',
    '董事参考第48期',
    '董事参考第47期',
    '关于聘任公司高级管理人员的议案',
    '关于加强子公司董事会建设的指导意见',
    '第四届董事会提名委员会第四次会议',
    '第四届董事会社会责任委员会第四次会议',
    '2024年年度会议发起审批',
    '2024年第四次临时会议发起审批',
    '第四届董事会第二十一次会议时间变更申请',
    '第三届董事会第十五次会议归档材料',
    '第四届董事会第二十一次会议归档材料',
    '关于召开2024年年度会议的通知',
    '临时会议议程调整申请',
    '董事会议事规则修订稿',
    '独立董事赴销售板块调研安排',
  ];

  const handlers = ['', '张征', '乔茹', '李敏', '王强', '司庆才', '孙友', '王炜硕'];

  const signNames = [
    '第四届董事会第三十一次会议决议签字',
    '战略与投资委员会第十五次会议审阅意见签字',
    '第四届董事会审计与风险委员会第十四次会议通知签字',
    '薪酬与考核委员会第十二次会议授权委托书签字',
    '第四届董事会社会责任委员会第四次会议决议签字',
  ];
  const signStatuses: MyInitiationStatus[] = ['草稿', '审批中', '已驳回', '已呈送', '已完成', '已结束'];

  const list: MyInitiationItem[] = [];
  const total = 168;
  const signCount = 5;
  const startDate = new Date('2026-01-01');

  // 前 5 条固定为董事签字任务，确保展示在「我的发起」第一页
  for (let i = 0; i < signCount; i += 1) {
    const status = signStatuses[i % signStatuses.length];
    const d = new Date(startDate);
    d.setDate(d.getDate() - i);
    const createTime = d.toISOString().slice(0, 10).replace(/-/g, '/');
    const currentHandler = status === '已呈送' || status === '已结束' ? '' : handlers[i % handlers.length];
    list.push({
      id: `mi-${String(i + 1).padStart(3, '0')}`,
      name: signNames[i % signNames.length],
      taskType: '董事签字',
      createTime,
      status,
      currentHandler,
      taskId: `sign-${String((i % signStatuses.length) + 1).padStart(3, '0')}`,
    });
  }

  // 其余为非董事签字任务
  for (let i = signCount; i < total; i += 1) {
    const nameBase = baseNames[i % baseNames.length];
    const name = i < baseNames.length ? nameBase : `${nameBase}（${Math.floor(i / baseNames.length) + 1}）`;
    const taskType: MyInitiationTaskType = i % 3 === 0 ? '信息' : i % 3 === 1 ? '会议发起' : '材料归档';
    const status: MyInitiationStatus = i % 4 === 0 ? '已呈送' : i % 4 === 1 ? '待归档' : i % 4 === 2 ? '审批中' : '已归档';
    const d = new Date(startDate);
    d.setDate(d.getDate() - i);
    const createTime = d.toISOString().slice(0, 10).replace(/-/g, '/');
    const currentHandler = status === '已呈送' || status === '已归档' ? '' : handlers[i % handlers.length];

    list.push({
      id: `mi-${String(i + 1).padStart(3, '0')}`,
      name,
      taskType,
      createTime,
      status,
      currentHandler,
    });
  }

  return list;
}

export const myInitiationList: MyInitiationItem[] = buildMyInitiationList();
