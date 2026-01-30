import type { Plugin } from 'vite';
import path from 'path';

/**
 *本项目组件规范强制检查插件
 * 1. 检查是否包含 export default Component
 * 2. 在底部注入第三方平台所需的注册代码
 */
export function axhubComponentEnforcer(entryPath?: string): Plugin {
  return {
    name: 'axhub-component-enforcer',
    enforce: 'pre',
    transform(code, id) {
      if (!entryPath || path.resolve(id) !== path.resolve(entryPath)) {
        return null;
      }

      if (!code.includes('export default Component')) {
        throw new Error(`\n\n❌ 构建失败: ${entryPath}\n必须包含 "export default Component" 以符合本项目组件规范。\n`);
      }

      const injection = `
if (typeof window !== 'undefined' && window.__AXHUB_DEFINE_COMPONENT__) {
  window.__AXHUB_DEFINE_COMPONENT__(Component);
}
`;
      return code + injection;
    }
  };
}
