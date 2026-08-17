/**
 * @name 联途物流官网首页 · Mintlify 版
 */
import React from 'react';
import { ArrowRight, ChevronRight, Phone, Quote } from 'lucide-react';
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

export default function LogisticsHomeMintlify() {
  const demo = useLogisticsDemo();

  return (
    <div className="mint-home" id="top">
      <header className="mint-header">
        <div className="mint-shell mint-header-inner">
          <HeaderBrand />
          <nav className="mint-desktop-nav" aria-label="主导航">
            {NAV_ITEMS.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </nav>
          <div className="mint-header-actions">
            <a className="mint-phone" href="tel:4008002718"><Phone size={16} />400 800 2718</a>
            <a className="mint-header-cta" href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价 <ArrowRight size={16} /></a>
            <MobileMenuButton open={demo.mobileMenuOpen} onClick={() => demo.setMobileMenuOpen(!demo.mobileMenuOpen)} />
          </div>
          <MobileNavigation demo={demo} />
        </div>
      </header>

      <main>
        <section className="mint-hero" aria-labelledby="mint-hero-title">
          <img src={heroImage} alt="联途物流园区内的运输车辆正在执行发运任务" />
          <div className="mint-hero-scrim" />
          <div className="mint-shell mint-hero-content">
            <p className="mint-eyebrow"><span />{COPY.heroEyebrow}</p>
            <h1 id="mint-hero-title"><span>{BRAND.en}</span>{BRAND.serviceName}</h1>
            <p>{COPY.heroDescription}</p>
            <div className="mint-hero-actions">
              <a href="#tracking">查运单 <ArrowRight size={18} /></a>
              <a href="#services">了解服务 <ChevronRight size={18} /></a>
            </div>
            <TrustItems />
          </div>
          <div className="mint-hero-badge"><span />{COPY.heroBadge}</div>
        </section>

        <section className="mint-console-band">
          <div className="mint-shell"><ActionConsole demo={demo} idPrefix="mint" /></div>
        </section>

        <section className="mint-stats" aria-label="联途物流经营数据">
          <div className="mint-shell mint-stats-grid">
            {STATS.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
          </div>
        </section>

        <section className="mint-services" id="services">
          <div className="mint-shell">
            <SectionHeading eyebrow={COPY.servicesEyebrow} title={COPY.servicesTitle} description={COPY.servicesDescription} />
            <div className="mint-service-grid">
              {SERVICES.map((service) => {
                const Icon = service.icon;
                return (
                  <article key={service.title}>
                    <div className="mint-service-head"><span>{service.index}</span><Icon size={27} strokeWidth={1.7} /></div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <div className="mint-service-meta"><span>{service.meta}</span><ArrowRight size={18} /></div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mint-network" id="network">
          <div className="mint-shell mint-network-grid">
            <div className="mint-network-copy">
              <p className="mint-eyebrow"><span />{COPY.networkEyebrow}</p>
              <h2>{COPY.networkTitle}</h2>
              <p>{COPY.networkDescription}</p>
              <div className="mint-network-points">
                {NETWORK_POINTS.map((point) => <div key={point.city}><strong>{point.city}</strong><span>{point.role}</span></div>)}
              </div>
              <a href="#tracking" onClick={() => demo.selectTool('quote')}>获取线路方案 <ArrowRight size={18} /></a>
            </div>
            <div className="mint-network-media"><img src={operationsImage} alt="联途物流全国调度中心正在协调运输网络" /><span>{COPY.heroBadge}</span></div>
          </div>
        </section>

        <section className="mint-solutions" id="solutions">
          <div className="mint-shell">
            <SectionHeading eyebrow={COPY.solutionsEyebrow} title={COPY.solutionsTitle} description={COPY.solutionsDescription} />
            <div className="mint-solution-grid">
              {SOLUTIONS.map((solution, index) => {
                const Icon = solution.icon;
                return (
                  <article key={solution.title}>
                    <div><span>0{index + 1}</span><Icon size={25} /></div>
                    <h3>{solution.title}</h3>
                    <p>{solution.description}</p>
                    <strong>{solution.metric}</strong>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mint-process">
          <div className="mint-shell">
            <SectionHeading eyebrow={COPY.processEyebrow} title={COPY.processTitle} description={COPY.processDescription} />
            <ol className="mint-process-list">
              {PROCESS_STEPS.map((step) => <li key={step.index}><span>{step.index}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}
            </ol>
          </div>
        </section>

        <section className="mint-story" id="about">
          <div className="mint-shell mint-story-grid">
            <div className="mint-story-image"><img src={warehouseImage} alt="联途物流仓储中心正在完成货物分拣与出库" /></div>
            <div className="mint-story-copy">
              <p className="mint-eyebrow"><span />{COPY.testimonialEyebrow}</p>
              <h2>{COPY.testimonialTitle}</h2>
              <Quote size={36} strokeWidth={1.5} aria-hidden="true" />
              <blockquote>{TESTIMONIAL.quote}</blockquote>
              <div className="mint-story-result"><span>{TESTIMONIAL.author}<small>{TESTIMONIAL.role}</small></span><strong>{TESTIMONIAL.result}</strong></div>
            </div>
          </div>
        </section>

        <section className="mint-cta">
          <div className="mint-shell"><div><h2>{COPY.ctaTitle}</h2><p>{COPY.ctaDescription}</p></div><a href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价 <ArrowRight size={19} /></a></div>
        </section>
      </main>

      <footer className="mint-footer">
        <div className="mint-shell mint-footer-grid">
          <div className="mint-footer-brand"><HeaderBrand inverse /><p>{COPY.heroDescription}</p><strong>全国服务热线 400 800 2718</strong></div>
          {FOOTER_COLUMNS.map((column) => <div key={column.title}><h3>{column.title}</h3>{column.items.map((item) => <a href="#top" key={item}>{item}</a>)}</div>)}
        </div>
        <div className="mint-shell mint-footer-bottom"><span>© 2026 LINKROUTE. All rights reserved.</span><span>沪 ICP 备 20260814 号</span></div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mint-section-heading">
      <div><p className="mint-eyebrow"><span />{eyebrow}</p><h2>{title}</h2></div>
      <p>{description}</p>
    </div>
  );
}
