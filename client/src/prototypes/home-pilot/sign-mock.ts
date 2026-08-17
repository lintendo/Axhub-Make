/**
 * 首页工作台·董事签字 mock 数据
 */

export type MeetingType =
  | '董事会'
  | '战略与投资委员会'
  | '提名委员会'
  | '薪酬与考核委员会'
  | '审计与风险委员会'
  | '社会责任委员会';

export const MEETING_TYPES: MeetingType[] = [
  '董事会',
  '战略与投资委员会',
  '提名委员会',
  '薪酬与考核委员会',
  '审计与风险委员会',
  '社会责任委员会',
];

export type SignFileType = '会议通知' | '授权委托书' | '审阅意见' | '会议决议' | '会议记录';

export const SIGN_FILE_TYPES: SignFileType[] = ['会议通知', '授权委托书', '审阅意见', '会议决议', '会议记录'];

export type DirectorType = '内部董事' | '外部董事' | '职工董事';

export interface Director {
  id: string;
  name: string;
  type: DirectorType;
  dept?: string;
}

export interface SignAttachment {
  id: string;
  name: string;
  size?: string;
}

export interface Delegation {
  directorType: DirectorType;
  delegatorId: string;
  delegateId: string;
}

export type SignTaskStatus =
  | '草稿'
  | '审批中'
  | '已驳回'
  | '已呈送'
  | '已完成'
  | '已结束';

export type SignNode =
  | '发起'
  | '部室负责人审批'
  | '董办负责人审批'
  | '董秘审批'
  | '董办经办人办理（呈送前）'
  | '经办人呈送'
  | '党组组织部文书办理'
  | '办公室主任办理'
  | '职工董事批阅'
  | '内部董事秘书办理'
  | '内部董事批阅签署'
  | '外部董事批阅签署'
  | '董事签署'
  | '董办经办人办理（办结前）'
  | '办结';

export interface ApprovalRecord {
  id: string;
  node: SignNode | string;
  handler: string;
  role: string;
  result: string;
  time: string;
  opinion: string;
}

export interface CirculationRecord {
  id: string;
  node: SignNode | string;
  handler: string;
  role: string;
  result: string;
  time: string;
  opinion: string;
}

export interface AttachmentUpdateRecord {
  id: string;
  time: string;
  updater: string;
  attachments: string[];
}

export interface SignTask {
  id: string;
  title: string;
  meetingTypes: MeetingType[];
  signFiles: SignFileType[];
  attachments: SignAttachment[];
  hasDelegation: boolean;
  delegation?: Delegation;
  deptManagerId: string;
  officeManagerId?: string;
  needSecretary?: boolean;
  selectedDirectors?: string[];
  signMode?: '并行' | '串行';
  status: SignTaskStatus;
  currentNode: SignNode | string;
  submitter: string;
  submitTime: string;
  remark?: string;
}

export interface TodoItem {
  id: string;
  taskId: string;
  title: string;
  node: SignNode | string;
  role: string;
  submitter: string;
  submitTime: string;
}

export const DIRECTORS: Director[] = [
  { id: 'd-001', name: '马永生', type: '内部董事', dept: '集团' },
  { id: 'd-002', name: '赵东', type: '内部董事', dept: '集团' },
  { id: 'd-003', name: '钟韧', type: '内部董事', dept: '集团' },
  { id: 'd-004', name: '喻宝才', type: '内部董事', dept: '集团' },
  { id: 'd-005', name: '张少峰', type: '内部董事', dept: '集团' },
  { id: 'd-006', name: '牛栓文', type: '内部董事', dept: '集团' },
  { id: 'd-007', name: '万涛', type: '内部董事', dept: '集团' },
  { id: 'd-008', name: '吕亮功', type: '内部董事', dept: '集团' },
  { id: 'd-009', name: '周渝波', type: '外部董事' },
  { id: 'd-010', name: '陈月明', type: '外部董事' },
  { id: 'd-011', name: '吴献东', type: '外部董事' },
  { id: 'd-012', name: '陈壁', type: '外部董事' },
  { id: 'd-013', name: '冯树臣', type: '外部董事' },
  { id: 'd-014', name: '李新华', type: '外部董事' },
  { id: 'd-015', name: '潘正义', type: '外部董事' },
  { id: 'd-016', name: '蔡勇', type: '外部董事' },
  { id: 'd-017', name: '郭洪金', type: '外部董事' },
  { id: 'd-018', name: '秦都', type: '职工董事' },
];

export const DEPT_MANAGERS = [
  { id: 'u-001', name: '孙友', dept: '综合管理部' },
  { id: 'u-002', name: '张征', dept: '综合管理部' },
  { id: 'u-003', name: '乔茹', dept: '综合管理部' },
  { id: 'u-011', name: '常伟晶', dept: '综合管理部' },
];

export const OFFICE_MANAGERS = [
  { id: 'u-004', name: '李敏', dept: '董事会事务管理' },
  { id: 'u-005', name: '王强', dept: '董事会事务管理' },
];

export const SECRETARIES = [
  { id: 'u-006', name: '黄文生', dept: '综合管理部' },
  { id: 'u-007', name: '赵日峰', dept: '综合管理部' },
];

export const PARTY_OFFICE_CLERKS = [
  { id: 'u-008', name: '李子嘉', dept: '党组组织部' },
];

export const OFFICE_DIRECTORS = [
  { id: 'u-009', name: '杨应忠', dept: '办公室' },
];

export const INTERNAL_DIRECTOR_SECRETARIES = [
  { id: 'u-010', name: '王秘书', dept: '董事会事务管理' },
];

export const APPROVAL_RECORDS: ApprovalRecord[] = [
  {
    id: 'ar-001',
    node: '发起',
    handler: '王炜硕',
    role: '集团董事会-董办经办人',
    result: '提交',
    time: '2026-07-28 09:30',
    opinion: '',
  },
  {
    id: 'ar-002',
    node: '部室负责人审批',
    handler: '孙友',
    role: '集团董事会-部室负责人',
    result: '同意',
    time: '2026-07-28 10:21',
    opinion: '同意发起。',
  },
  {
    id: 'ar-003',
    node: '董办负责人审批',
    handler: '李敏',
    role: '董事会事务管理-董办负责人',
    result: '同意',
    time: '2026-07-28 11:05',
    opinion: '材料齐全，同意。',
  },
  {
    id: 'ar-004',
    node: '董秘审批',
    handler: '黄文生',
    role: '董事会事务管理-董秘',
    result: '同意',
    time: '2026-07-28 14:30',
    opinion: '同意。',
  },
  {
    id: 'ar-005',
    node: '董办经办人办理（呈送前）',
    handler: '王炜硕',
    role: '集团董事会-董办经办人',
    result: '呈送董事',
    time: '2026-07-28 14:50',
    opinion: '',
  },
  {
    id: 'ar-006',
    node: '经办人呈送',
    handler: '王炜硕',
    role: '集团董事会-董办经办人',
    result: '呈送',
    time: '2026-07-28 15:00',
    opinion: '',
  },
  {
    id: 'ar-007',
    node: '董事签署',
    handler: '',
    role: '',
    result: '',
    time: '',
    opinion: '',
  },
  {
    id: 'ar-008',
    node: '董办经办人办理（办结前）',
    handler: '',
    role: '',
    result: '',
    time: '',
    opinion: '',
  },
  {
    id: 'ar-009',
    node: '办结',
    handler: '',
    role: '',
    result: '',
    time: '',
    opinion: '',
  },
];

export const INTERNAL_CIRCULATION_RECORDS: CirculationRecord[] = [
  {
    id: 'cr-in-001',
    node: '内部董事秘书办理',
    handler: '王秘书',
    role: '内部董事秘书',
    result: '已办',
    time: '2026-07-28 15:10',
    opinion: '',
  },
  {
    id: 'cr-in-002',
    node: '内部董事批阅签署',
    handler: '马永生',
    role: '内部董事',
    result: '已阅',
    time: '2026-07-28 16:20',
    opinion: '同意。',
  },
];

export const EXTERNAL_CIRCULATION_RECORDS: CirculationRecord[] = [
  {
    id: 'cr-ex-001',
    node: '外部董事批阅签署',
    handler: '周渝波',
    role: '外部董事',
    result: '已阅',
    time: '2026-07-28 16:25',
    opinion: '同意。',
  },
  {
    id: 'cr-ex-002',
    node: '外部董事批阅签署',
    handler: '陈月明',
    role: '外部董事',
    result: '已阅',
    time: '2026-07-28 16:45',
    opinion: '',
  },
  {
    id: 'cr-ex-003',
    node: '外部董事批阅签署',
    handler: '陈壁',
    role: '外部董事',
    result: '',
    time: '',
    opinion: '',
  },
];

export const EMPLOYEE_CIRCULATION_RECORDS: CirculationRecord[] = [
  {
    id: 'cr-em-001',
    node: '党组组织部文书办理',
    handler: '李子嘉',
    role: '党组组织部文书',
    result: '已办',
    time: '2026-07-28 15:10',
    opinion: '',
  },
  {
    id: 'cr-em-002',
    node: '办公室主任办理',
    handler: '杨应忠',
    role: '办公室主任',
    result: '已办',
    time: '2026-07-28 15:35',
    opinion: '',
  },
  {
    id: 'cr-em-003',
    node: '职工董事批阅',
    handler: '秦都',
    role: '职工董事',
    result: '已阅',
    time: '2026-07-28 16:00',
    opinion: '已阅。',
  },
];

export const ATTACHMENT_UPDATE_RECORDS: AttachmentUpdateRecord[] = [
  {
    id: 'atr-001',
    time: '2026-07-28 17:20',
    updater: '王炜硕',
    attachments: ['会议决议（修订版）.docx', '会议记录（修订版）.docx'],
  },
];

function buildSignTasks(): SignTask[] {
  return [
    {
      id: 'sign-001',
      title: '第四届董事会第三十一次会议决议签字',
      meetingTypes: ['董事会'],
      signFiles: ['会议决议', '会议记录'],
      attachments: [
        { id: 'a-001', name: '第四届董事会第三十次会议决议.docx', size: '120KB' },
        { id: 'a-002', name: '第四届董事会第三十次会议记录.docx', size: '98KB' },
      ],
      hasDelegation: false,
      deptManagerId: 'u-001',
      officeManagerId: 'u-004',
      needSecretary: true,
      selectedDirectors: ['d-018', 'd-009', 'd-010', 'd-001'],
      signMode: '并行',
      status: '已呈送',
      currentNode: '董事签署',
      submitter: '王炜硕',
      submitTime: '2026-07-28 09:30',
      remark: '',
    },
    {
      id: 'sign-002',
      title: '战略与投资委员会第十五次会议审阅意见签字',
      meetingTypes: ['战略与投资委员会'],
      signFiles: ['审阅意见'],
      attachments: [{ id: 'a-003', name: '战略与投资委员会第十五次会议审阅意见.docx', size: '85KB' }],
      hasDelegation: true,
      delegation: { directorType: '外部董事', delegatorId: 'd-011', delegateId: 'd-012' },
      deptManagerId: 'u-002',
      officeManagerId: 'u-005',
      needSecretary: false,
      selectedDirectors: ['d-011', 'd-012'],
      signMode: '串行',
      status: '已呈送',
      currentNode: '经办人呈送',
      submitter: '王炜硕',
      submitTime: '2026-07-27 16:00',
      remark: '',
    },
    {
      id: 'sign-003',
      title: '第四届董事会审计与风险委员会第十四次会议通知签字',
      meetingTypes: ['审计与风险委员会'],
      signFiles: ['会议通知'],
      attachments: [{ id: 'a-004', name: '审计与风险委员会第十四次会议通知.docx', size: '65KB' }],
      hasDelegation: false,
      deptManagerId: 'u-001',
      status: '已驳回',
      currentNode: '发起',
      submitter: '王炜硕',
      submitTime: '2026-07-26 10:00',
      remark: '会议时间需调整。',
    },
    {
      id: 'sign-004',
      title: '薪酬与考核委员会第十二次会议授权委托书签字',
      meetingTypes: ['薪酬与考核委员会'],
      signFiles: ['授权委托书'],
      attachments: [{ id: 'a-005', name: '授权委托书.docx', size: '45KB' }],
      hasDelegation: false,
      deptManagerId: 'u-003',
      officeManagerId: 'u-004',
      needSecretary: true,
      selectedDirectors: ['d-018'],
      signMode: '并行',
      status: '审批中',
      currentNode: '董秘审批',
      submitter: '王炜硕',
      submitTime: '2026-07-25 14:20',
      remark: '',
    },
    {
      id: 'sign-005',
      title: '第四届董事会社会责任委员会第四次会议决议签字',
      meetingTypes: ['社会责任委员会'],
      signFiles: ['会议决议'],
      attachments: [{ id: 'a-006', name: '社会责任委员会第四次会议决议.docx', size: '78KB' }],
      hasDelegation: false,
      deptManagerId: 'u-001',
      officeManagerId: 'u-005',
      needSecretary: false,
      selectedDirectors: ['d-009', 'd-010', 'd-011'],
      signMode: '并行',
      status: '已完成',
      currentNode: '董办经办人办理（办结前）',
      submitter: '王炜硕',
      submitTime: '2026-07-24 09:00',
      remark: '',
    },
  ];
}

export const signTasks: SignTask[] = buildSignTasks();

export function getSignTask(id: string | undefined): SignTask | undefined {
  if (!id) return undefined;
  return signTasks.find((t) => t.id === id);
}

export const SIGN_TODOS: TodoItem[] = [
  {
    id: 'todo-001',
    taskId: 'sign-001',
    title: '第四届董事会第三十一次会议决议签字',
    node: '董事签署',
    role: '外部董事',
    submitter: '王炜硕',
    submitTime: '2026-07-28 09:30',
  },
  {
    id: 'todo-002',
    taskId: 'sign-004',
    title: '薪酬与考核委员会第十二次会议授权委托书签字',
    node: '董秘审批',
    role: '董秘',
    submitter: '王炜硕',
    submitTime: '2026-07-25 14:20',
  },
  {
    id: 'todo-003',
    taskId: 'sign-005',
    title: '第四届董事会社会责任委员会第四次会议决议签字',
    node: '董办经办人办理（办结前）',
    role: '董办经办人',
    submitter: '王炜硕',
    submitTime: '2026-07-24 09:00',
  },
];

export const COMMON_OPINIONS = [
  '同意。',
  '已阅，同意。',
  '请按程序办理。',
  '材料齐全，同意。',
  '退回修改。',
];

export function getDirectorName(id: string): string {
  return DIRECTORS.find((d) => d.id === id)?.name ?? id;
}

export function getDirectorTypeLabel(type: DirectorType): string {
  return type;
}

export function getDirectorOptions(type: DirectorType): Director[] {
  return DIRECTORS.filter((d) => d.type === type);
}

export function getDeptManagerName(id: string): string {
  return DEPT_MANAGERS.find((u) => u.id === id)?.name ?? id;
}

export function getOfficeManagerName(id: string): string {
  return OFFICE_MANAGERS.find((u) => u.id === id)?.name ?? id;
}

export function getPartyOfficeClerkName(id: string): string {
  return PARTY_OFFICE_CLERKS.find((u) => u.id === id)?.name ?? id;
}

export function getOfficeDirectorName(id: string): string {
  return OFFICE_DIRECTORS.find((u) => u.id === id)?.name ?? id;
}

export function getDirectorTypeById(id: string): DirectorType | undefined {
  return DIRECTORS.find((d) => d.id === id)?.type;
}
