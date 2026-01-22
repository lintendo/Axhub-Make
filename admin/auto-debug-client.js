/**
 * 客户端自动调试工具
 * 在页面加载时自动检测错误并上报到服务器
 * 
 * 功能：
 * 1. 白屏检测
 * 2. 运行时错误捕获
 * 3. 自动上报到服务器
 * 4. 提供调试建议
 */

(function() {
  'use strict';
  
  const AUTO_DEBUG_CONFIG = {
    enabled: true,
    whiteScreenTimeout: 3000, // 3秒后检测白屏
    reportUrl: '/api/report-error',
    autoReport: true
  };
  
  // 获取当前页面路径
  function getCurrentPath() {
    const pathname = window.location.pathname;
    // 从 /pages/xxx.html 或 /elements/xxx.html 提取路径
    const match = pathname.match(/\/(pages|elements)\/([^.]+)/);
    return match ? `${match[1]}/${match[2]}` : null;
  }
  
  // 上报错误到服务器
  function reportError(error) {
    if (!AUTO_DEBUG_CONFIG.autoReport) return;
    
    const currentPath = getCurrentPath();
    if (!currentPath) return;
    
    fetch(AUTO_DEBUG_CONFIG.reportUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: currentPath,
        error: {
          message: error.message,
          stack: error.stack,
          type: error.type || 'error',
          timestamp: Date.now()
        }
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.suggestion) {
        console.log('%c[Auto Debug] 修复建议:', 'color: #1890ff; font-weight: bold;');
        console.log('%c' + data.suggestion, 'color: #52c41a;');
      }
    })
    .catch(err => {
      console.error('[Auto Debug] 上报错误失败:', err);
    });
  }
  
  // 白屏检测
  function checkWhiteScreen() {
    const root = document.getElementById('root');
    const hasContent = root && root.children.length > 0;
    const hasError = document.getElementById('__fallback_error_overlay__');
    
    if (!hasContent && !hasError) {
      console.error('%c[Auto Debug] 检测到白屏问题', 'color: #ff4d4f; font-weight: bold;');
      
      // 诊断白屏原因
      const diagnostics = {
        rootExists: !!root,
        reactExists: !!window.React,
        reactDOMExists: !!window.ReactDOM,
        componentExists: !!window.AxhubDevComponent,
        bootstrapExists: !!window.DevTemplateBootstrap,
        errorQueueLength: window.__ERROR_SYSTEM__?.getErrorQueue()?.length || 0
      };
      
      console.log('%c[Auto Debug] 诊断信息:', 'color: #1890ff;', diagnostics);
      
      // 提供修复建议
      const suggestions = [];
      
      if (!diagnostics.rootExists) {
        suggestions.push('❌ #root 元素不存在，检查 HTML 模板');
      }
      if (!diagnostics.reactExists) {
        suggestions.push('❌ React 未加载，检查 bootstrap 脚本');
      }
      if (!diagnostics.componentExists) {
        suggestions.push('❌ 组件未加载，检查组件导出和导入路径');
      }
      if (diagnostics.errorQueueLength > 0) {
        suggestions.push(`⚠️ 发现 ${diagnostics.errorQueueLength} 个错误，可能导致渲染失败`);
      }
      
      if (suggestions.length === 0) {
        suggestions.push('⚠️ 未发现明显问题，可能是组件渲染逻辑错误');
      }
      
      console.log('%c[Auto Debug] 修复建议:', 'color: #faad14; font-weight: bold;');
      suggestions.forEach(s => console.log('%c  ' + s, 'color: #faad14;'));
      
      // 上报白屏问题
      reportError({
        message: 'White screen detected',
        stack: JSON.stringify(diagnostics),
        type: 'white-screen'
      });
    } else {
      console.log('%c[Auto Debug] 页面渲染正常 ✓', 'color: #52c41a; font-weight: bold;');
    }
  }
  
  // 性能监控
  function monitorPerformance() {
    if (!window.performance || !window.performance.timing) return;
    
    window.addEventListener('load', function() {
      setTimeout(function() {
        const timing = window.performance.timing;
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
        const renderTime = timing.domComplete - timing.domLoading;
        
        console.log('%c[Auto Debug] 性能指标:', 'color: #1890ff; font-weight: bold;');
        console.log(`  页面加载时间: ${loadTime}ms`);
        console.log(`  DOM 就绪时间: ${domReady}ms`);
        console.log(`  渲染时间: ${renderTime}ms`);
        
        if (loadTime > 5000) {
          console.warn('%c[Auto Debug] 页面加载较慢，可能影响用户体验', 'color: #faad14;');
        }
      }, 0);
    });
  }
  
  // 组件渲染监控
  function monitorComponentRender() {
    // 监听 React 组件挂载
    const originalCreateElement = window.React?.createElement;
    if (originalCreateElement) {
      let renderCount = 0;
      
      window.React.createElement = function() {
        renderCount++;
        return originalCreateElement.apply(this, arguments);
      };
      
      setTimeout(function() {
        console.log(`%c[Auto Debug] React 渲染次数: ${renderCount}`, 'color: #1890ff;');
        
        if (renderCount === 0) {
          console.warn('%c[Auto Debug] React 未执行任何渲染，可能是组件问题', 'color: #faad14;');
        }
      }, 2000);
    }
  }
  
  // 依赖检查
  function checkDependencies() {
    const requiredGlobals = {
      'React': window.React,
      'ReactDOM': window.ReactDOM,
      'DevTemplateBootstrap': window.DevTemplateBootstrap
    };
    
    const missing = [];
    Object.keys(requiredGlobals).forEach(function(name) {
      if (!requiredGlobals[name]) {
        missing.push(name);
      }
    });
    
    if (missing.length > 0) {
      console.error('%c[Auto Debug] 缺少必需的全局变量:', 'color: #ff4d4f; font-weight: bold;', missing);
      return false;
    }
    
    console.log('%c[Auto Debug] 依赖检查通过 ✓', 'color: #52c41a;');
    return true;
  }
  
  // 初始化
  function init() {
    if (!AUTO_DEBUG_CONFIG.enabled) return;
    
    console.log('%c[Auto Debug] 自动调试工具已启用', 'color: #1890ff; font-weight: bold;');
    
    // 检查依赖
    checkDependencies();
    
    // 监控性能
    monitorPerformance();
    
    // 监控组件渲染
    monitorComponentRender();
    
    // 延迟检测白屏
    setTimeout(checkWhiteScreen, AUTO_DEBUG_CONFIG.whiteScreenTimeout);
    
    // 集成错误捕获系统
    if (window.__ERROR_SYSTEM__) {
      const originalAddError = window.__ERROR_SYSTEM__.addError;
      window.__ERROR_SYSTEM__.addError = function(message, stack) {
        // 调用原始方法
        if (originalAddError) {
          originalAddError.call(this, message, stack);
        }
        
        // 上报错误
        reportError({
          message: message,
          stack: stack,
          type: 'manual'
        });
      };
    }
  }
  
  // 暴露 API
  window.__AUTO_DEBUG__ = {
    config: AUTO_DEBUG_CONFIG,
    checkWhiteScreen: checkWhiteScreen,
    reportError: reportError,
    checkDependencies: checkDependencies,
    
    // 手动触发检测
    runDiagnostics: function() {
      console.log('%c[Auto Debug] 开始诊断...', 'color: #1890ff; font-weight: bold;');
      checkDependencies();
      checkWhiteScreen();
    }
  };
  
  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  console.log('%c[Auto Debug] 客户端调试工具已加载', 'color: #52c41a; font-weight: bold;');
})();
