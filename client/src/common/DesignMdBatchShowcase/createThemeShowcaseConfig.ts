import type {
  BatchPaletteSwatch,
  BatchShowcaseConfig,
  BatchStyleSystemItem,
} from './index';
import type { BatchShowcaseSourceLinks } from './headerLinks';

type ThemePreviewImage = {
  type?: string;
  path?: string;
};

type ThemeIdentity = {
  slug?: string;
  titleZh?: string;
  titleEn?: string;
  descriptionZh?: string;
  descriptionEn?: string;
};

type ThemeDisplay = Omit<Partial<Omit<BatchShowcaseConfig, 'previewImages'>>, 'spacing' | 'variant'> & {
  previewImages?: ThemePreviewImage[];
  spacing?: unknown;
  variant?: string;
};

type ThemeData = {
  display?: ThemeDisplay;
  identity?: ThemeIdentity;
  previewImages?: ThemePreviewImage[];
  source?: BatchShowcaseSourceLinks;
  tags?: { distributionTags?: string[] };
  tokens?: {
    palette?: Array<string | BatchPaletteSwatch>;
    typography?: string[] | {
      display?: string;
      body?: string;
      mono?: string;
      hints?: string[];
    };
    radius?: BatchShowcaseConfig['radius'];
    spacing?: unknown;
    shadows?: BatchStyleSystemItem[];
    borders?: BatchStyleSystemItem[];
  };
};

const variants = new Set<BatchShowcaseConfig['variant']>([
  'saas-devtool',
  'dashboard',
  'consumer-commerce',
  'editorial-agency',
  'dark-experimental',
  'mobile-product',
]);

function typographyFrom(theme: ThemeData): string[] {
  const value = theme.display?.typography ?? theme.tokens?.typography;
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (value.hints?.length) return value.hints.filter(Boolean);
  return [value.display, value.body, value.mono].filter((item): item is string => Boolean(item));
}

export function createThemeShowcaseConfig({
  theme,
  imageUrls,
}: {
  theme: ThemeData;
  imageUrls: Record<string, string>;
}): BatchShowcaseConfig {
  const display = theme.display ?? {};
  const identity = theme.identity ?? {};
  const previewImages = theme.previewImages ?? display.previewImages ?? [];
  const variant = variants.has(display.variant as BatchShowcaseConfig['variant'])
    ? display.variant as BatchShowcaseConfig['variant']
    : 'saas-devtool';

  return {
    brand: display.brand || identity.titleZh || identity.titleEn || identity.slug || '主题',
    ...(display.brandAlias || identity.titleEn
      ? { brandAlias: display.brandAlias || identity.titleEn }
      : {}),
    description: display.description || identity.descriptionZh || identity.descriptionEn || '',
    ...(display.descriptionEn || identity.descriptionEn
      ? { descriptionEn: display.descriptionEn || identity.descriptionEn }
      : {}),
    ...(theme.source ? { source: theme.source } : {}),
    variant,
    distributionTags: display.distributionTags ?? theme.tags?.distributionTags ?? [],
    ...(display.fontStylesheets ? { fontStylesheets: display.fontStylesheets } : {}),
    palette: display.palette ?? theme.tokens?.palette ?? [],
    ...(display.radius || theme.tokens?.radius
      ? { radius: display.radius ?? theme.tokens?.radius }
      : {}),
    ...(display.spacing || theme.tokens?.spacing
      ? { spacing: (display.spacing ?? theme.tokens?.spacing) as BatchShowcaseConfig['spacing'] }
      : {}),
    ...(display.shadows || theme.tokens?.shadows
      ? { shadows: display.shadows ?? theme.tokens?.shadows }
      : {}),
    ...(display.borders || theme.tokens?.borders
      ? { borders: display.borders ?? theme.tokens?.borders }
      : {}),
    typography: typographyFrom(theme),
    previewImages: previewImages.map((image) => {
      const imagePath = image.path?.trim();
      const imageUrl = imagePath ? imageUrls[imagePath] : undefined;
      if (!imagePath || !imageUrl) {
        throw new Error(`Missing verified preview image URL for ${imagePath || '<empty path>'}`);
      }
      return {
        type: image.type || 'preview-image',
        url: imageUrl,
      };
    }),
    panels: display.panels ?? [],
    ...(display.usageGuidance ? { usageGuidance: display.usageGuidance } : {}),
  };
}
