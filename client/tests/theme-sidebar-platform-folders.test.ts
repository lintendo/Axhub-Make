import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface SidebarNode {
  id: string;
  kind: 'folder' | 'item';
  title: string;
  itemKey?: string;
  children?: SidebarNode[];
}

const clientRoot = path.resolve(__dirname, '..');
const sidebarPath = path.join(clientRoot, '.axhub/make/sidebar-tree.json');
const templateSidebarPath = path.join(clientRoot, 'template-seed/.axhub/make/sidebar-tree.json');
const themesRoot = path.join(clientRoot, 'src/themes');
const pcCategoryTitles = [
  '智能', '开发', '协作', '金融', '电商', '出行', '健康',
  '教育', '文娱', '媒体', '安全', '工业', '机构', '消费',
];
const mobileCategories = {
  智能: ['chatgpt-mobile'],
  协作: [
    'linkedin-mobile', 'whatsapp-mobile', 'wechat-mobile', 'telegram-mobile',
    'discord-mobile', 'slack-mobile', 'notion-mobile', 'google-calendar-mobile',
    'jira-mobile', 'trello-mobile', 'zoom-mobile', 'canva-mobile', 'gmail-mobile',
  ],
  金融: [
    'paypal-mobile', 'coinbase-mobile', 'revolut-mobile',
    'robinhood-mobile', 'cash-app-mobile', 'binance-mobile',
  ],
  电商: ['uber-eats-mobile', 'doordash-mobile', 'starbucks-mobile', 'mcdonalds-mobile'],
  出行: ['airbnb-mobile', 'uber-mobile', 'google-maps-mobile', 'booking-mobile', 'waze-mobile'],
  健康: ['strava-mobile', 'headspace-mobile', 'myfitnesspal-mobile', 'fitbit-mobile', 'calm-mobile'],
  教育: ['duolingo-mobile'],
  文娱: [
    'youtube-mobile', 'netflix-mobile', 'twitch-mobile', 'disney-plus-mobile',
    'spotify-mobile', 'apple-music-mobile', 'soundcloud-mobile', 'audible-mobile',
  ],
  媒体: ['instagram-mobile', 'tiktok-mobile', 'x-twitter-mobile', 'facebook-mobile', 'reddit-mobile'],
  消费: ['tinder-mobile', 'bumble-mobile'],
} as const;

function collectItemKeys(nodes: SidebarNode[]): string[] {
  return nodes.flatMap((node) => (
    node.kind === 'item'
      ? node.itemKey ? [node.itemKey] : []
      : collectItemKeys(node.children || [])
  ));
}

describe('theme sidebar platform folders', () => {
  it('groups every current theme exactly once under PC and mobile roots', () => {
    const sidebar = JSON.parse(fs.readFileSync(sidebarPath, 'utf8')) as { themesTree: SidebarNode[] };
    expect(sidebar.themesTree.map((node) => [node.kind, node.title])).toEqual([
      ['folder', 'PC端'],
      ['folder', '移动端'],
    ]);

    const [pcRoot, mobileRoot] = sidebar.themesTree;
    expect(pcRoot.children?.map((node) => node.title)).toEqual(pcCategoryTitles);
    expect(mobileRoot.children?.map((node) => node.title)).toEqual(Object.keys(mobileCategories));

    for (const [category, slugs] of Object.entries(mobileCategories)) {
      const folder = mobileRoot.children?.find((node) => node.title === category);
      expect(folder?.children?.map((node) => node.itemKey)).toEqual(
        slugs.map((slug) => `themes/${slug}`),
      );
    }

    const actualThemeKeys = fs.readdirSync(themesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(themesRoot, entry.name, 'index.tsx')))
      .map((entry) => `themes/${entry.name}`)
      .sort();
    const treeItemKeys = collectItemKeys(sidebar.themesTree);

    expect(treeItemKeys).toHaveLength(122);
    expect(new Set(treeItemKeys).size).toBe(treeItemKeys.length);
    expect([...treeItemKeys].sort()).toEqual(actualThemeKeys);
    expect(collectItemKeys(pcRoot.children || [])).toHaveLength(72);
    expect(collectItemKeys(mobileRoot.children || [])).toHaveLength(50);
    expect(collectItemKeys(pcRoot.children || []).every((key) => !key.endsWith('-mobile'))).toBe(true);
    expect(collectItemKeys(mobileRoot.children || []).every((key) => key.endsWith('-mobile'))).toBe(true);
  });

  it('keeps runtime and release seed theme indexes complete', () => {
    const actualThemeIds = fs.readdirSync(themesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(themesRoot, entry.name, 'index.tsx')))
      .map((entry) => entry.name)
      .sort();

    for (const filePath of [sidebarPath, templateSidebarPath]) {
      const sidebar = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        themesTree: SidebarNode[];
        themes: string[];
      };
      const treeThemeIds = collectItemKeys(sidebar.themesTree)
        .map((itemKey) => itemKey.replace(/^themes\//u, ''))
        .sort();

      expect(treeThemeIds).toEqual(actualThemeIds);
      expect([...sidebar.themes].sort()).toEqual(actualThemeIds);
    }
  });
});
