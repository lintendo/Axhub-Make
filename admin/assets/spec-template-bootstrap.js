import{r as h,j as r,a9 as b,aW as M,aX as j,ab as S,aY as E,aZ as $,a_ as H,aQ as g}from"./chunks/vendor.js";import{d as I}from"./chunks/index.js";const C=`
  body {
    background: #f5f5f5;
  }
  .markdown-container {
    display: flex;
    gap: 40px;
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px;
    position: relative;
    align-items: flex-start;
  }
  .markdown-content {
    flex: 1;
    min-width: 0;
  }
  .markdown-content > div {
    background: #fff;
    padding: 24px;
    borderRadius: 8px;
    boxShadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02);
  }
  .anchor-sidebar {
    width: 240px;
    flex-shrink: 0;
    position: sticky;
    top: 40px;
  }
  @media (max-width: 1200px) {
    .anchor-sidebar {
      display: none;
    }
  }
  .ant-anchor-link-title {
    font-size: 12px;
  }
  .markdown-tabs-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 24px 0;
  }
  .markdown-tabs-container .ant-tabs-nav {
    margin-bottom: 0;
  }
`;function w(n){return n.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g,"-").replace(/^-+|-+$/g,"")}function L(n){const e=[],t=n.split(`
`),o=[];for(const s of t){const a=s.match(/^(#{1,6})\s+(.+)$/);if(a){const i=a[1].length,p=a[2].trim(),d={id:w(p),title:p,level:i};for(;o.length>0&&o[o.length-1].level>=i;)o.pop();if(o.length===0)e.push(d);else{const c=o[o.length-1];c.children||(c.children=[]),c.children.push(d)}o.push(d)}}return e}function u(n){return n.map(e=>({key:e.id,href:`#${e.id}`,title:e.title,children:e.children?u(e.children):void 0}))}const B=n=>{var s;const{className:e,children:t}=n,o=((s=e==null?void 0:e.match(/language-(\w+)/))==null?void 0:s[1])||"";return typeof t!="string"?null:o==="mermaid"?r.jsx(H,{children:t}):r.jsx("code",{className:e,children:t})},l=n=>t=>{const{children:o}=t,a=w(typeof o=="string"?o:""),i=`h${n}`;return r.jsx(i,{id:a,children:o})};function k({content:n,documents:e}){var m,d;const[t,o]=h.useState(((m=e==null?void 0:e[0])==null?void 0:m.key)||"default"),s=e&&e.length>0,a=s?((d=e.find(c=>c.key===t))==null?void 0:d.content)||"":n||"";h.useEffect(()=>{s&&window.parent!==window&&window.parent.postMessage({type:"spec-doc-changed",activeDocKey:t},"*")},[t,s]);const{anchorItems:i}=h.useMemo(()=>{const c=L(a);return{anchorItems:u(c)}},[a]),p=()=>r.jsxs("div",{className:"markdown-container",children:[r.jsx("div",{className:"markdown-content",children:r.jsx("div",{children:r.jsx(E,{className:"x-markdown-light",content:a,components:{code:B,h1:l(1),h2:l(2),h3:l(3),h4:l(4),h5:l(5),h6:l(6)}})})}),i.length>0&&r.jsxs("div",{className:"anchor-sidebar",children:[r.jsx("div",{style:{marginBottom:12,fontWeight:600,fontSize:16,paddingLeft:16,borderLeft:"2px solid transparent"},children:"目录"}),r.jsx($,{affix:!1,offsetTop:40,targetOffset:80,items:i,onClick:(c,f)=>{c.preventDefault();const v=f.href.replace("#",""),x=document.getElementById(v);x&&x.scrollIntoView({behavior:"smooth",block:"start"})}})]})]});return r.jsx(b,{theme:I,children:r.jsxs(M,{locale:j,children:[r.jsx("style",{children:C}),s&&e.length>1?r.jsx("div",{className:"markdown-tabs-container",children:r.jsx(S,{activeKey:t,onChange:o,items:e.map(c=>({key:c.key,label:c.label,children:p()}))})}):p()]})})}function y(n){const e=document.getElementById("spec-root");if(!e){console.error("[Spec Template] 找不到 #spec-root 元素");return}try{e.className="",e.innerHTML="",g(e).render(r.jsx(k,{content:n})),console.log("[Spec Template] Markdown 已渲染")}catch(t){console.error("[Spec Template] 渲染失败:",t),e.innerHTML=`
      <div style="color: red; padding: 20px;">
        <h2>渲染失败</h2>
        <pre>${t}</pre>
      </div>
    `}}function T(n){const e=document.getElementById("spec-root");if(!e){console.error("[Spec Template] 找不到 #spec-root 元素");return}try{e.className="",e.innerHTML="",g(e).render(r.jsx(k,{documents:n})),console.log("[Spec Template] 多文档 Markdown 已渲染")}catch(t){console.error("[Spec Template] 渲染失败:",t),e.innerHTML=`
      <div style="color: red; padding: 20px;">
        <h2>渲染失败</h2>
        <pre>${t}</pre>
      </div>
    `}}async function N(n){try{console.log("[Spec Template] 加载 Markdown:",n);const e=await fetch(n);if(!e.ok)throw new Error(`HTTP ${e.status}: ${e.statusText}`);const t=await e.text();y(t)}catch(e){console.error("[Spec Template] 加载失败:",e);const t=document.getElementById("spec-root");t&&(t.innerHTML=`
        <div style="color: red; padding: 20px;">
          <h2>加载失败</h2>
          <p>无法加载 Markdown 文件: ${n}</p>
          <pre>${e}</pre>
        </div>
      `)}}async function D(n){try{console.log("[Spec Template] 加载多个 Markdown 文档:",n);const e=await Promise.all(n.map(async({key:t,label:o,url:s})=>{const a=await fetch(s);if(!a.ok)throw new Error(`HTTP ${a.status}: ${a.statusText} for ${s}`);const i=await a.text();return{key:t,label:o,content:i}}));T(e)}catch(e){console.error("[Spec Template] 加载失败:",e);const t=document.getElementById("spec-root");t&&(t.innerHTML=`
        <div style="color: red; padding: 20px;">
          <h2>加载失败</h2>
          <p>无法加载 Markdown 文件</p>
          <pre>${e}</pre>
        </div>
      `)}}typeof window<"u"&&(window.SpecTemplateBootstrap={renderMarkdown:y,renderMarkdownDocuments:T,loadMarkdownFromUrl:N,loadMarkdownDocumentsFromUrls:D},console.log("[Spec Template Bootstrap] 已挂载到全局"));
