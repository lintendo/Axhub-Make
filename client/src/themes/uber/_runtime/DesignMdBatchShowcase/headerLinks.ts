export type BatchShowcaseSourceLinks = {
  sourceName?: string;
  originalDetailUrl?: string;
  websiteUrl?: string;
};

export type HeaderSourceLink = {
  ariaLabel: string;
  href: string;
  kind: 'website' | 'source';
  label: string;
  title: string;
};

function isExternalUrl(value?: string) {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

export function getHeaderLinks(source?: BatchShowcaseSourceLinks): HeaderSourceLink[] {
  return [
    source?.websiteUrl && isExternalUrl(source.websiteUrl)
      ? { ariaLabel: '打开品牌官网', href: source.websiteUrl, kind: 'website', label: '官网', title: '品牌官网' }
      : null,
    source?.originalDetailUrl && isExternalUrl(source.originalDetailUrl)
      ? { ariaLabel: '打开采集来源', href: source.originalDetailUrl, kind: 'source', label: '来源', title: '主题来源' }
      : null,
  ].filter((item): item is HeaderSourceLink => Boolean(item));
}
