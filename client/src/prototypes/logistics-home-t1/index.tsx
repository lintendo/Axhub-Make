/**
 * @name 联途物流官网首页 · T1 Energy 版
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

export default function LogisticsHomeT1() {
  const demo = useLogisticsDemo();

  return (
    <div className="t1-home" id="top">
      <header className="t1-header">
        <HeaderBrand inverse />
        <nav className="t1-desktop-nav" aria-label="主导航">
          {NAV_ITEMS.map((item, index) => <a key={item.href} href={item.href}><span>0{index + 1}</span>{item.label}</a>)}
        </nav>
        <div className="t1-header-actions">
          <a className="t1-phone" href="tel:4008002718"><Phone size={16} />400 800 2718</a>
          <a className="t1-header-cta" href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价 <ArrowRight size={17} /></a>
          <MobileMenuButton open={demo.mobileMenuOpen} onClick={() => demo.setMobileMenuOpen(!demo.mobileMenuOpen)} />
        </div>
        <MobileNavigation demo={demo} />
      </header>

      <main>
        <section className="t1-hero" aria-labelledby="t1-hero-title">
          <img src={heroImage} alt="联途物流园区内的运输车辆正在执行发运任务" />
          <div className="t1-hero-scrim" />
          <div className="t1-hero-content">
            <div className="t1-hero-index">01 / HOME</div>
            <p className="t1-eyebrow">{COPY.heroEyebrow}</p>
            <h1 id="t1-hero-title"><span>{BRAND.en}</span>{BRAND.serviceName}</h1>
            <p>{COPY.heroDescription}</p>
            <div className="t1-hero-actions">
              <a href="#tracking">查运单 <ArrowRight size={19} /></a>
              <a href="#services">了解服务 <ChevronRight size={18} /></a>
            </div>
            <TrustItems />
          </div>
          <div className="t1-hero-badge"><span>NETWORK</span><strong>{COPY.heroBadge}</strong></div>
        </section>

        <section className="t1-console-band">
          <div className="t1-shell"><ActionConsole demo={demo} idPrefix="t1" /></div>
        </section>

        <section className="t1-stats" aria-label="联途物流经营数据">
          <div className="t1-shell t1-stats-grid">
            {STATS.map((stat, index) => (
              <div key={stat.label}><span>0{index + 1}</span><strong>{stat.value}</strong><small>{stat.label}</small></div>
            ))}
          </div>
        </section>

        <section className="t1-services" id="services">
          <div className="t1-shell">
            <SectionHeading index="02" eyebrow={COPY.servicesEyebrow} title={COPY.servicesTitle} description={COPY.servicesDescription} />
            <div className="t1-service-grid">
              {SERVICES.map((service, index) => {
                const Icon = service.icon;
                return (
                  <article className={index === 0 ? 'is-featured' : ''} key={service.title}>
                    <div className="t1-service-head"><span>{service.index}</span><Icon size={32} strokeWidth={1.6} /></div>
                    <div className="t1-service-body"><h3>{service.title}</h3><p>{service.description}</p></div>
                    <div className="t1-service-meta"><span>{service.meta}</span><ArrowRight size={20} /></div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="t1-network" id="network">
          <div className="t1-network-copy">
            <SectionHeading index="03" eyebrow={COPY.networkEyebrow} title={COPY.networkTitle} description={COPY.networkDescription} />
            <div className="t1-network-points">
              {NETWORK_POINTS.map((point, index) => (
                <div key={point.city}><span>0{index + 1}</span><strong>{point.city}</strong><small>{point.role}</small></div>
              ))}
            </div>
            <a href="#tracking" onClick={() => demo.selectTool('quote')}>获取线路方案 <ArrowRight size={18} /></a>
          </div>
          <div className="t1-network-media">
            <img src={operationsImage} alt="联途物流全国调度中心正在协调运输网络" />
            <span>{COPY.heroBadge}</span>
          </div>
        </section>

        <section className="t1-solutions" id="solutions">
          <div className="t1-shell">
            <SectionHeading index="04" eyebrow={COPY.solutionsEyebrow} title={COPY.solutionsTitle} description={COPY.solutionsDescription} />
            <div className="t1-solution-grid">
              {SOLUTIONS.map((solution, index) => {
                const Icon = solution.icon;
                return (
                  <article key={solution.title}>
                    <div className="t1-solution-index">0{index + 1}</div>
                    <Icon size={30} strokeWidth={1.6} />
                    <h3>{solution.title}</h3>
                    <p>{solution.description}</p>
                    <strong>{solution.metric}</strong>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="t1-process">
          <div className="t1-shell">
            <SectionHeading index="05" eyebrow={COPY.processEyebrow} title={COPY.processTitle} description={COPY.processDescription} />
            <ol className="t1-process-list">
              {PROCESS_STEPS.map((step) => (
                <li key={step.index}><span>{step.index}</span><h3>{step.title}</h3><p>{step.description}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="t1-story" id="about">
          <img src={warehouseImage} alt="联途物流仓储中心正在完成货物分拣与出库" />
          <div className="t1-story-panel">
            <p className="t1-eyebrow">{COPY.testimonialEyebrow}</p>
            <h2>{COPY.testimonialTitle}</h2>
            <Quote size={38} strokeWidth={1.4} aria-hidden="true" />
            <blockquote>{TESTIMONIAL.quote}</blockquote>
            <div className="t1-story-result">
              <span>{TESTIMONIAL.author}<small>{TESTIMONIAL.role}</small></span>
              <strong>{TESTIMONIAL.result}</strong>
            </div>
          </div>
        </section>

        <section className="t1-cta">
          <div className="t1-shell"><div><h2>{COPY.ctaTitle}</h2><p>{COPY.ctaDescription}</p></div><a href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价 <ArrowRight size={20} /></a></div>
        </section>
      </main>

      <footer className="t1-footer">
        <div className="t1-shell t1-footer-top"><HeaderBrand inverse /><strong>全国服务热线 400 800 2718</strong></div>
        <div className="t1-shell t1-footer-grid">
          <p>{COPY.heroDescription}</p>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}><h3>{column.title}</h3>{column.items.map((item) => <a href="#top" key={item}>{item}</a>)}</div>
          ))}
        </div>
        <div className="t1-shell t1-footer-bottom"><span>© 2026 LINKROUTE. All rights reserved.</span><span>沪 ICP 备 20260814 号</span></div>
      </footer>
    </div>
  );
}

function SectionHeading({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: string; description: string }) {
  return (
    <div className="t1-section-heading">
      <div className="t1-section-index">{index}</div>
      <div><p className="t1-eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      <p>{description}</p>
    </div>
  );
}
