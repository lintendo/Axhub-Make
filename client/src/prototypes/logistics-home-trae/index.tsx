/**
 * @name 联途物流官网首页 · TRAE 版
 */
import React from 'react';
import { ArrowRight, ArrowUpRight, Phone, Quote } from 'lucide-react';
import {
  ActionConsole,
  BRAND,
  COPY,
  FOOTER_COLUMNS,
  HeaderBrand,
  MobileMenuButton,
  MobileNavigation,
  NAV_ITEMS,
  NETWORK_POINTS,
  PROCESS_STEPS,
  SERVICES,
  SOLUTIONS,
  STATS,
  TESTIMONIAL,
  TrustItems,
  useLogisticsDemo,
} from '../logistics-home-core';
import heroImage from './assets/hero.webp';
import operationsImage from './assets/operations.webp';
import warehouseImage from './assets/warehouse.webp';
import './style.css';

export default function LogisticsHomeTrae() {
  const demo = useLogisticsDemo();

  return (
    <div className="trae-home" id="top">
      <header className="trae-header">
        <HeaderBrand inverse />
        <nav className="trae-desktop-nav" aria-label="主导航">
          {NAV_ITEMS.map((item, index) => <a key={item.href} href={item.href}><span>[0{index + 1}]</span>{item.label}</a>)}
        </nav>
        <div className="trae-header-actions">
          <a className="trae-phone" href="tel:4008002718"><Phone size={16} />400 800 2718</a>
          <a className="trae-header-cta" href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价 <ArrowUpRight size={17} /></a>
          <MobileMenuButton open={demo.mobileMenuOpen} onClick={() => demo.setMobileMenuOpen(!demo.mobileMenuOpen)} />
        </div>
        <MobileNavigation demo={demo} />
      </header>

      <main>
        <section className="trae-hero" aria-labelledby="trae-hero-title">
          <img src={heroImage} alt="联途物流园区内的运输车辆正在执行发运任务" />
          <div className="trae-hero-scrim" />
          <div className="trae-shell trae-hero-content">
            <p className="trae-hero-eyebrow">{COPY.heroEyebrow}</p>
            <h1 id="trae-hero-title">{BRAND.serviceName}</h1>
            <p>{COPY.heroDescription}</p>
            <div className="trae-hero-actions">
              <a href="#tracking">查运单 <ArrowRight size={19} /></a>
              <a href="#services">了解服务 <ArrowUpRight size={18} /></a>
            </div>
            <TrustItems />
          </div>
          <div className="trae-hero-status"><span>NETWORK / ONLINE</span><strong>{COPY.heroBadge}</strong></div>
        </section>

        <section className="trae-console-band">
          <div className="trae-shell"><ActionConsole demo={demo} idPrefix="trae" /></div>
        </section>

        <section className="trae-stats" aria-label="联途物流经营数据">
          <div className="trae-shell trae-stats-grid">
            {STATS.map((stat, index) => <div key={stat.label}><span>[0{index + 1}]</span><strong>{stat.value}</strong><small>{stat.label}</small></div>)}
          </div>
        </section>

        <section className="trae-services" id="services">
          <div className="trae-shell">
            <SectionHeading index="02" eyebrow={COPY.servicesEyebrow} title={COPY.servicesTitle} description={COPY.servicesDescription} />
            <div className="trae-service-grid">
              {SERVICES.map((service) => {
                const Icon = service.icon;
                return (
                  <article key={service.title}>
                    <div className="trae-service-head"><span>[{service.index}]</span><Icon size={29} strokeWidth={1.6} /></div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <div className="trae-service-meta"><span>{service.meta}</span><ArrowUpRight size={18} /></div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="trae-network" id="network">
          <div className="trae-shell trae-network-grid">
            <div className="trae-network-copy">
              <p className="trae-code-label">[ SYSTEM / 03 ] {COPY.networkEyebrow}</p>
              <h2>{COPY.networkTitle}</h2>
              <p>{COPY.networkDescription}</p>
              <div className="trae-network-points">
                {NETWORK_POINTS.map((point, index) => <div key={point.city}><span>NODE_0{index + 1}</span><strong>{point.city}</strong><small>{point.role}</small></div>)}
              </div>
              <a href="#tracking" onClick={() => demo.selectTool('quote')}>获取线路方案 <ArrowRight size={18} /></a>
            </div>
            <div className="trae-network-media"><img src={operationsImage} alt="联途物流全国调度中心正在协调运输网络" /><span>STATUS: {COPY.heroBadge}</span></div>
          </div>
        </section>

        <section className="trae-solutions" id="solutions">
          <div className="trae-shell">
            <SectionHeading index="04" eyebrow={COPY.solutionsEyebrow} title={COPY.solutionsTitle} description={COPY.solutionsDescription} />
            <div className="trae-solution-grid">
              {SOLUTIONS.map((solution, index) => {
                const Icon = solution.icon;
                return (
                  <article key={solution.title}>
                    <div><span>[0{index + 1}]</span><Icon size={26} strokeWidth={1.6} /></div>
                    <h3>{solution.title}</h3>
                    <p>{solution.description}</p>
                    <strong>{solution.metric}</strong>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="trae-process">
          <div className="trae-shell">
            <SectionHeading index="05" eyebrow={COPY.processEyebrow} title={COPY.processTitle} description={COPY.processDescription} />
            <ol className="trae-process-list">
              {PROCESS_STEPS.map((step) => <li key={step.index}><span>[{step.index}]</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}
            </ol>
          </div>
        </section>

        <section className="trae-story" id="about">
          <div className="trae-story-image"><img src={warehouseImage} alt="联途物流仓储中心正在完成货物分拣与出库" /></div>
          <div className="trae-story-copy">
            <p className="trae-code-label">[ SYSTEM / 06 ] {COPY.testimonialEyebrow}</p>
            <h2>{COPY.testimonialTitle}</h2>
            <Quote size={38} strokeWidth={1.4} aria-hidden="true" />
            <blockquote>{TESTIMONIAL.quote}</blockquote>
            <div className="trae-story-result"><span>{TESTIMONIAL.author}<small>{TESTIMONIAL.role}</small></span><strong>{TESTIMONIAL.result}</strong></div>
          </div>
        </section>

        <section className="trae-cta">
          <div className="trae-shell"><div><p className="trae-code-label">[ READY ]</p><h2>{COPY.ctaTitle}</h2><span>{COPY.ctaDescription}</span></div><a href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价 <ArrowUpRight size={20} /></a></div>
        </section>
      </main>

      <footer className="trae-footer">
        <div className="trae-shell trae-footer-grid">
          <div className="trae-footer-brand"><HeaderBrand inverse /><p>{COPY.heroDescription}</p><strong>全国服务热线 400 800 2718</strong></div>
          {FOOTER_COLUMNS.map((column) => <div key={column.title}><h3>{column.title}</h3>{column.items.map((item) => <a href="#top" key={item}>{item}</a>)}</div>)}
        </div>
        <div className="trae-shell trae-footer-bottom"><span>© 2026 LINKROUTE. All rights reserved.</span><span>沪 ICP 备 20260814 号</span></div>
      </footer>
    </div>
  );
}

function SectionHeading({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: string; description: string }) {
  return (
    <div className="trae-section-heading">
      <p className="trae-code-label">[ SYSTEM / {index} ] {eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
