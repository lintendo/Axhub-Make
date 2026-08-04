import {
  copyDocumentForFigmaNewOfficialClipboard,
  serializeDocumentForFigmaNewOfficialClipboard,
} from '../src/export-core/dom/figma-new';

declare global {
  interface Window {
    __AXHUB_WEBPAGE_TO_FIGMA__?: {
      copy: (options?: { selector?: string }) => ReturnType<
        typeof copyDocumentForFigmaNewOfficialClipboard
      >;
      serialize: (options?: { selector?: string }) => ReturnType<
        typeof serializeDocumentForFigmaNewOfficialClipboard
      >;
    };
  }
}

window.__AXHUB_WEBPAGE_TO_FIGMA__ = {
  copy: (options = {}) => copyDocumentForFigmaNewOfficialClipboard(options.selector || 'body'),
  serialize: (options = {}) =>
    serializeDocumentForFigmaNewOfficialClipboard(options.selector || 'body'),
};
