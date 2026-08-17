import React from 'react';
import {
  ArrowRight,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Factory,
  Headphones,
  MapPinned,
  Menu,
  PackageCheck,
  Route,
  Search,
  ShieldCheck,
  Truck,
  Warehouse,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const BRAND = {
  zh: '联途物流',
  en: 'LINKROUTE',
  serviceName: '联途综合物流服务',
};

export const COPY = {
  heroEyebrow: '企业供应链服务',
  heroDescription: '从一票零担到整套供应链，以稳定运力、全国仓网和可视化履约，让每一公里都在掌控之中。',
  heroBadge: '自营与协同运力覆盖 280+ 城市',
  servicesEyebrow: '核心服务',
  servicesTitle: '从运输到仓配，一站协同',
  servicesDescription: '按货量、时效与业务场景组合服务，让复杂物流回到清晰可控。',
  networkEyebrow: '全国网络',
  networkTitle: '一张网，协同每一次履约',
  networkDescription: '32 个分拨中心连接干线与区域配送，统一调度、节点预警和专人响应，让跨区域交付始终稳定。',
  solutionsEyebrow: '行业方案',
  solutionsTitle: '贴合业务节奏的交付方案',
  solutionsDescription: '把行业特性落实到仓网、运力、时效与异常处理的每个环节。',
  processEyebrow: '履约流程',
  processTitle: '每一步，都有明确结果',
  processDescription: '从需求确认到持续优化，用统一节点和责任人推进交付。',
  testimonialEyebrow: '客户故事',
  testimonialTitle: '让供应链真正连成一条线',
  ctaTitle: '准备好优化下一段物流了吗？',
  ctaDescription: '提交运输需求，专属顾问将在 30 分钟内联系你。',
};

export const NAV_ITEMS = [
  { label: '核心服务', href: '#services' },
  { label: '全国网络', href: '#network' },
  { label: '行业方案', href: '#solutions' },
  { label: '关于我们', href: '#about' },
];

export const STATS = [
  { value: '280+', label: '服务城市' },
  { value: '32', label: '分拨中心' },
  { value: '99.3%', label: '准时交付率' },
  { value: '96%', label: '核心线路次日达率' },
];

export type Service = {
  index: string;
  title: string;
  description: string;
  meta: string;
  icon: LucideIcon;
};

export const SERVICES: Service[] = [
  {
    index: '01',
    title: '企业零担',
    description: '班次稳定、节点透明，覆盖多批次、多目的地的企业货运需求。',
    meta: '20 kg 起运 · 全国覆盖',
    icon: Boxes,
  },
  {
    index: '02',
    title: '整车直达',
    description: '专属车辆点到点运输，适配大批量、计划性与高时效货物。',
    meta: '车型灵活 · 一车一单',
    icon: Truck,
  },
  {
    index: '03',
    title: '一体化仓配',
    description: '入库、存储、分拣、包装与配送协同，降低多节点管理成本。',
    meta: '智能仓储 · 弹性履约',
    icon: Warehouse,
  },
  {
    index: '04',
    title: '供应链方案',
    description: '从网络规划到运力协同，为复杂业务搭建可持续的履约体系。',
    meta: '专属顾问 · 持续优化',
    icon: Route,
  },
];

export const SOLUTIONS = [
  {
    title: '制造业',
    description: '原材料入厂、工厂调拨与成品出库协同，保障生产节拍。',
    metric: '准时入厂率 99.6%',
    icon: Factory,
  },
  {
    title: '零售连锁',
    description: '区域仓到门店的多频次补货，兼顾时效、成本与到货完整率。',
    metric: '门店覆盖 18,000+',
    icon: Building2,
  },
  {
    title: '电商履约',
    description: '大促弹性仓容与多渠道订单履约，让波峰期仍然稳定交付。',
    metric: '峰值处理 240 万单/日',
    icon: Zap,
  },
];

export const PROCESS_STEPS = [
  { index: '01', title: '需求确认', description: '明确线路、货量、时效与交付要求。' },
  { index: '02', title: '方案与报价', description: '匹配运力和仓网，给出透明报价。' },
  { index: '03', title: '全程履约', description: '节点可视、异常预警、专人跟进。' },
  { index: '04', title: '复盘优化', description: '按履约数据持续优化成本与效率。' },
];

export const NETWORK_POINTS = [
  { city: '上海', role: '华东运营中心' },
  { city: '武汉', role: '华中转运枢纽' },
  { city: '广州', role: '华南运营中心' },
  { city: '成都', role: '西南转运枢纽' },
];

export const TESTIMONIAL = {
  quote: '联途把仓、干线和门店配送真正串成了一条链路。旺季订单增长三倍，我们依然能在同一个看板里掌握每个节点。',
  author: '陈恺',
  role: '森屿家居 · 供应链负责人',
  result: '综合履约成本降低 17%',
};

export const FOOTER_COLUMNS = [
  { title: '服务', items: ['企业零担', '整车直达', '一体化仓配', '供应链方案'] },
  { title: '支持', items: ['运单查询', '服务网点', '客户中心', '常见问题'] },
  { title: '公司', items: ['关于联途', '加入我们', '责任与安全', '联系我们'] },
];

export const TRACK_EVENTS = [
  { time: '08 月 14 日 07:35', title: '上海嘉定 · 已集货', detail: '货物已完成交接并进入干线运输。', done: true },
  { time: '08 月 14 日 13:20', title: '苏州分拨 · 运输中', detail: '车辆已发往杭州余杭目的站。', done: true },
  { time: '预计 08 月 15 日 18:00', title: '杭州余杭 · 待派送', detail: '到站后将安排末端配送。', done: false },
];

export type QuoteForm = {
  origin: string;
  destination: string;
  cargo: string;
  weight: string;
  contact: string;
  phone: string;
};

const EMPTY_QUOTE: QuoteForm = {
  origin: '',
  destination: '',
  cargo: '',
  weight: '',
  contact: '',
  phone: '',
};

export function useLogisticsDemo() {
  const [activeTool, setActiveTool] = React.useState<'track' | 'quote'>('track');
  const [trackingNo, setTrackingNo] = React.useState('');
  const [trackingState, setTrackingState] = React.useState<'idle' | 'loading' | 'success'>('idle');
  const [trackError, setTrackError] = React.useState('');
  const [quote, setQuote] = React.useState<QuoteForm>(EMPTY_QUOTE);
  const [quoteErrors, setQuoteErrors] = React.useState<Partial<Record<keyof QuoteForm, string>>>({});
  const [quoteSuccess, setQuoteSuccess] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const selectTool = (tool: 'track' | 'quote') => {
    setActiveTool(tool);
    setTrackError('');
    setQuoteErrors({});
  };

  const submitTracking = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trackingNo.trim()) {
      setTrackError('请输入运单号');
      setTrackingState('idle');
      return;
    }
    setTrackError('');
    setTrackingState('loading');
    window.setTimeout(() => setTrackingState('success'), 650);
  };

  const closeTracking = () => setTrackingState('idle');

  const updateQuote = (field: keyof QuoteForm, value: string) => {
    setQuote((current) => ({ ...current, [field]: value }));
    setQuoteErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submitQuote = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Partial<Record<keyof QuoteForm, string>> = {};
    (Object.keys(quote) as Array<keyof QuoteForm>).forEach((field) => {
      if (!quote[field].trim()) nextErrors[field] = '请填写此项';
    });
    if (quote.phone && !/^1\d{10}$/.test(quote.phone.trim())) nextErrors.phone = '请输入 11 位手机号';
    setQuoteErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setQuoteSuccess(true);
  };

  const resetQuote = () => {
    setQuoteSuccess(false);
    setQuoteErrors({});
  };

  return {
    activeTool,
    selectTool,
    trackingNo,
    setTrackingNo,
    trackingState,
    trackError,
    submitTracking,
    closeTracking,
    quote,
    quoteErrors,
    updateQuote,
    submitQuote,
    quoteSuccess,
    resetQuote,
    mobileMenuOpen,
    setMobileMenuOpen,
  };
}

export type LogisticsDemo = ReturnType<typeof useLogisticsDemo>;

type ActionConsoleProps = {
  demo: LogisticsDemo;
  idPrefix: string;
};

export function ActionConsole({ demo, idPrefix }: ActionConsoleProps) {
  return (
    <div className="lh-console" id="tracking">
      <div className="lh-console__head">
        <div>
          <span className="lh-kicker">即刻开始</span>
          <h2>查运单或获取运输报价</h2>
        </div>
        <div className="lh-tool-tabs" role="tablist" aria-label="物流服务工具">
          <button
            type="button"
            role="tab"
            aria-selected={demo.activeTool === 'track'}
            className={demo.activeTool === 'track' ? 'is-active' : ''}
            onClick={() => demo.selectTool('track')}
          >
            <Search size={17} aria-hidden="true" />
            查运单
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={demo.activeTool === 'quote'}
            className={demo.activeTool === 'quote' ? 'is-active' : ''}
            onClick={() => demo.selectTool('quote')}
          >
            <ArrowRight size={17} aria-hidden="true" />
            获取报价
          </button>
        </div>
      </div>

      {demo.activeTool === 'track' ? (
        <div className="lh-tool-panel" role="tabpanel">
          <form className="lh-track-form" onSubmit={demo.submitTracking} noValidate>
            <label htmlFor={`${idPrefix}-tracking`}>运单号</label>
            <div className="lh-inline-field">
              <input
                id={`${idPrefix}-tracking`}
                value={demo.trackingNo}
                onChange={(event) => demo.setTrackingNo(event.target.value)}
                placeholder="例如 LT20260814001"
                aria-describedby={demo.trackError ? `${idPrefix}-track-error` : undefined}
                aria-invalid={Boolean(demo.trackError)}
              />
              <button type="submit" disabled={demo.trackingState === 'loading'}>
                {demo.trackingState === 'loading' ? '查询中' : '查询运单'}
                {demo.trackingState !== 'loading' ? <ArrowRight size={18} aria-hidden="true" /> : null}
              </button>
            </div>
            {demo.trackError ? <p className="lh-field-error" id={`${idPrefix}-track-error`}>{demo.trackError}</p> : null}
            <p className="lh-field-note">支持联途物流运单号与客户参考号</p>
          </form>

          {demo.trackingState === 'success' ? (
            <div className="lh-track-result" aria-live="polite">
              <div className="lh-result-head">
                <div>
                  <span>当前状态</span>
                  <strong><Truck size={18} aria-hidden="true" />运输中</strong>
                </div>
                <button type="button" onClick={demo.closeTracking} aria-label="关闭运单结果" title="关闭">
                  <X size={18} />
                </button>
              </div>
              <div className="lh-result-meta">
                <span>运单 {demo.trackingNo}</span>
                <span>预计 08 月 15 日 18:00 前送达</span>
              </div>
              <ol className="lh-timeline">
                {TRACK_EVENTS.map((item) => (
                  <li className={item.done ? 'is-done' : ''} key={item.title}>
                    <span className="lh-timeline__dot">{item.done ? <Check size={12} /> : <Clock3 size={12} />}</span>
                    <div>
                      <time>{item.time}</time>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="lh-tool-panel" role="tabpanel">
          {demo.quoteSuccess ? (
            <div className="lh-quote-success" aria-live="polite">
              <CheckCircle2 size={26} aria-hidden="true" />
              <div>
                <span>需求已记录</span>
                <h3>{demo.quote.origin} → {demo.quote.destination}</h3>
                <p>{demo.quote.cargo} · {demo.quote.weight} kg · 我们将在 30 分钟内联系 {demo.quote.contact}</p>
              </div>
              <button type="button" onClick={demo.resetQuote}>返回修改</button>
            </div>
          ) : (
            <form className="lh-quote-form" onSubmit={demo.submitQuote} noValidate>
              <QuoteField id={`${idPrefix}-origin`} label="始发地" error={demo.quoteErrors.origin}>
                <input id={`${idPrefix}-origin`} value={demo.quote.origin} onChange={(event) => demo.updateQuote('origin', event.target.value)} placeholder="上海市" />
              </QuoteField>
              <QuoteField id={`${idPrefix}-destination`} label="目的地" error={demo.quoteErrors.destination}>
                <input id={`${idPrefix}-destination`} value={demo.quote.destination} onChange={(event) => demo.updateQuote('destination', event.target.value)} placeholder="杭州市" />
              </QuoteField>
              <QuoteField id={`${idPrefix}-cargo`} label="货物类型" error={demo.quoteErrors.cargo}>
                <select id={`${idPrefix}-cargo`} value={demo.quote.cargo} onChange={(event) => demo.updateQuote('cargo', event.target.value)}>
                  <option value="">请选择</option>
                  <option value="普通货物">普通货物</option>
                  <option value="家具家电">家具家电</option>
                  <option value="工业原料">工业原料</option>
                  <option value="电商商品">电商商品</option>
                </select>
              </QuoteField>
              <QuoteField id={`${idPrefix}-weight`} label="预估重量（kg）" error={demo.quoteErrors.weight}>
                <input id={`${idPrefix}-weight`} inputMode="decimal" value={demo.quote.weight} onChange={(event) => demo.updateQuote('weight', event.target.value)} placeholder="500" />
              </QuoteField>
              <QuoteField id={`${idPrefix}-contact`} label="联系人" error={demo.quoteErrors.contact}>
                <input id={`${idPrefix}-contact`} value={demo.quote.contact} onChange={(event) => demo.updateQuote('contact', event.target.value)} placeholder="您的称呼" />
              </QuoteField>
              <QuoteField id={`${idPrefix}-phone`} label="手机号" error={demo.quoteErrors.phone}>
                <input id={`${idPrefix}-phone`} inputMode="tel" value={demo.quote.phone} onChange={(event) => demo.updateQuote('phone', event.target.value)} placeholder="11 位手机号" />
              </QuoteField>
              <button className="lh-quote-submit" type="submit">
                提交需求
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

type QuoteFieldProps = {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
};

function QuoteField({ id, label, error, children }: QuoteFieldProps) {
  return (
    <label className="lh-quote-field" htmlFor={id}>
      <span>{label}</span>
      {children}
      {error ? <small>{error}</small> : null}
    </label>
  );
}

type HeaderBrandProps = {
  inverse?: boolean;
};

export function HeaderBrand({ inverse = false }: HeaderBrandProps) {
  return (
    <a className={`lh-brand${inverse ? ' is-inverse' : ''}`} href="#top" aria-label="联途物流首页">
      <span className="lh-brand__mark"><Route size={21} strokeWidth={2.4} /></span>
      <span>
        <strong>{BRAND.zh}</strong>
        <small>{BRAND.en}</small>
      </span>
    </a>
  );
}

type MobileMenuButtonProps = {
  open: boolean;
  onClick: () => void;
};

export function MobileMenuButton({ open, onClick }: MobileMenuButtonProps) {
  return (
    <button
      className="lh-mobile-trigger"
      type="button"
      aria-label={open ? '关闭导航菜单' : '打开导航菜单'}
      aria-expanded={open}
      onClick={onClick}
      title={open ? '关闭菜单' : '打开菜单'}
    >
      {open ? <X size={22} /> : <Menu size={22} />}
    </button>
  );
}

export function MobileNavigation({ demo }: { demo: LogisticsDemo }) {
  const navRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!demo.mobileMenuOpen || !navRef.current) return undefined;
    const nav = navRef.current;
    const focusable = Array.from(nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        demo.setMobileMenuOpen(false);
        document.querySelector<HTMLElement>('.lh-mobile-trigger')?.focus();
        return;
      }
      if (event.key !== 'Tab' || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [demo.mobileMenuOpen, demo.setMobileMenuOpen]);

  if (!demo.mobileMenuOpen) return null;
  return (
    <nav className="lh-mobile-nav" aria-label="移动端导航" ref={navRef}>
      {NAV_ITEMS.map((item) => (
        <a key={item.href} href={item.href} onClick={() => demo.setMobileMenuOpen(false)}>{item.label}</a>
      ))}
      <a className="lh-mobile-nav__action" href="#tracking" onClick={() => demo.setMobileMenuOpen(false)}>查运单 / 询价</a>
    </nav>
  );
}

export function TrustItems() {
  return (
    <div className="lh-trust-items" aria-label="服务保障">
      <span><ShieldCheck size={17} />标准化安全保障</span>
      <span><PackageCheck size={17} />全程节点可视</span>
      <span><Headphones size={17} />7×24 小时响应</span>
      <span><MapPinned size={17} />全国网络协同</span>
    </div>
  );
}
