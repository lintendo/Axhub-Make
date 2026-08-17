/**
 * @name 联途物流官网首页 · Uber 版
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

export default function LogisticsHomeUber() {
  const demo = useLogisticsDemo();

  return (
    <div className="uber-home" id="top">
      <header className="uber-header">
        <HeaderBrand inverse />
        <nav className="uber-desktop-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
        <div className="uber-header-actions">
          <a className="uber-phone" href="tel:4008002718"><Phone size={16} />400 800 2718</a>
          <a className="uber-header-cta" href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价</a>
          <MobileMenuButton open={demo.mobileMenuOpen} onClick={() => demo.setMobileMenuOpen(!demo.mobileMenuOpen)} />
        </div>
        <MobileNavigation demo={demo} />
      </header>

      <main>
        <section className="uber-hero" aria-labelledby="uber-hero-title">
          <img src={heroImage} alt="联途物流园区内的运输车辆正在执行发运任务" />
          <div className="uber-hero-scrim" />
          <div className="uber-hero-content">
            <p className="uber-eyebrow">{COPY.heroEyebrow}</p>
            <h1 id="uber-hero-title">
              <span>{BRAND.en}</span>
              {BRAND.serviceName}
            </h1>
            <p className="uber-hero-description">稳定运力，覆盖全国，让每一公里都可控。</p>
            <div className="uber-hero-actions">
              <a href="#tracking">查运单 <ArrowRight size={19} /></a>
              <a href="#services">了解服务 <ChevronRight size={18} /></a>
            </div>
            <TrustItems />
          </div>
          <div className="uber-hero-badge"><span>覆盖网络</span><strong>{COPY.heroBadge}</strong></div>
        </section>

        <section className="uber-console-band">
          <div className="uber-shell"><ActionConsole demo={demo} idPrefix="uber" /></div>
        </section>

        <section className="uber-stats" aria-label="联途物流经营数据">
          <div className="uber-shell uber-stats-grid">
            {STATS.map((stat) => (
              <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>
            ))}
          </div>
        </section>

        <section className="uber-services" id="services">
          <div className="uber-shell">
            <SectionHeading eyebrow={COPY.servicesEyebrow} title={COPY.servicesTitle} description={COPY.servicesDescription} />
            <div className="uber-service-grid">
              {SERVICES.map((service, index) => {
                const Icon = service.icon;
                return (
                  <article className={index === 1 || index === 2 ? 'is-dark' : ''} key={service.title}>
                    <div className="uber-service-top"><span>{service.index}</span><Icon size={30} strokeWidth={1.7} /></div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <div className="uber-service-meta"><span>{service.meta}</span><ArrowRight size={20} /></div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="uber-network" id="network">
          <div className="uber-network-media"><img src={operationsImage} alt="联途物流全国调度中心正在协调运输网络" /></div>
          <div className="uber-network-copy">
            <p className="uber-eyebrow">{COPY.networkEyebrow}</p>
            <h2>{COPY.networkTitle}</h2>
            <p>{COPY.networkDescription}</p>
            <div className="uber-network-points">
              {NETWORK_POINTS.map((point) => (
                <div key={point.city}><strong>{point.city}</strong><span>{point.role}</span></div>
              ))}
            </div>
            <a href="#tracking" onClick={() => demo.selectTool('quote')}>获取线路方案 <ArrowRight size={18} /></a>
          </div>
        </section>

        <section className="uber-solutions" id="solutions">
          <div className="uber-shell">
            <SectionHeading eyebrow={COPY.solutionsEyebrow} title={COPY.solutionsTitle} description={COPY.solutionsDescription} />
            <div className="uber-solution-list">
              {SOLUTIONS.map((solution, index) => {
                const Icon = solution.icon;
                return (
                  <article key={solution.title}>
                    <span className="uber-solution-index">0{index + 1}</span>
                    <Icon size={26} />
                    <h3>{solution.title}</h3>
                    <p>{solution.description}</p>
                    <strong>{solution.metric}</strong>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="uber-process">
          <div className="uber-shell">
            <SectionHeading eyebrow={COPY.processEyebrow} title={COPY.processTitle} description={COPY.processDescription} />
            <ol className="uber-process-list">
              {PROCESS_STEPS.map((step) => (
                <li key={step.index}>
                  <span>{step.index}</span>
                  <div><h3>{step.title}</h3><p>{step.description}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="uber-story" id="about">
          <div className="uber-story-image"><img src={warehouseImage} alt="联途物流仓储中心正在完成货物分拣与出库" /></div>
          <div className="uber-story-copy">
            <p className="uber-eyebrow">{COPY.testimonialEyebrow}</p>
            <h2>{COPY.testimonialTitle}</h2>
            <Quote size={42} strokeWidth={1.5} aria-hidden="true" />
            <blockquote>{TESTIMONIAL.quote}</blockquote>
            <div className="uber-story-result">
              <span>{TESTIMONIAL.author}<small>{TESTIMONIAL.role}</small></span>
              <strong>{TESTIMONIAL.result}</strong>
            </div>
          </div>
        </section>

        <section className="uber-cta">
          <div className="uber-shell">
            <div><h2>{COPY.ctaTitle}</h2><p>{COPY.ctaDescription}</p></div>
            <a href="#tracking" onClick={() => demo.selectTool('quote')}>获取报价 <ArrowRight size={20} /></a>
          </div>
        </section>
      </main>

      <footer className="uber-footer">
        <div className="uber-shell uber-footer-grid">
          <div className="uber-footer-brand"><HeaderBrand inverse /><p>{COPY.heroDescription}</p><span>全国服务热线 400 800 2718</span></div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}><h3>{column.title}</h3>{column.items.map((item) => <a href="#top" key={item}>{item}</a>)}</div>
          ))}
        </div>
        <div className="uber-shell uber-footer-bottom"><span>© 2026 LINKROUTE. All rights reserved.</span><span>沪 ICP 备 20260814 号</span></div>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="uber-section-heading">
      <p className="uber-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
