const APPLE_SEARCH_URL = 'https://itunes.apple.com/search';
const APPLE_LOOKUP_URL = 'https://itunes.apple.com/lookup';

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': 'Axhub-theme-screenshot-collector/1.0' },
  });
  if (!response.ok) throw new Error(`SOURCE_HTTP_ERROR ${response.status} ${url}`);
  return response.json();
}

export async function discoverAppleCandidates({ term, storefront = 'us', fetchImpl = fetch }) {
  const url = new URL(APPLE_SEARCH_URL);
  url.searchParams.set('term', term);
  url.searchParams.set('entity', 'software');
  url.searchParams.set('country', storefront);
  url.searchParams.set('limit', '10');
  const payload = await fetchJson(url, fetchImpl);
  return (payload.results || []).map(({ trackId, trackName, artistName, bundleId, screenshotUrls = [] }) => ({
    trackId,
    trackName,
    artistName,
    bundleId,
    screenshotCount: screenshotUrls.length,
  }));
}

export async function lookupAppleScreenshots({ storeId, storefront = 'us', fetchImpl = fetch }) {
  const url = new URL(APPLE_LOOKUP_URL);
  url.searchParams.set('id', storeId);
  url.searchParams.set('entity', 'software');
  url.searchParams.set('country', storefront);
  const payload = await fetchJson(url, fetchImpl);
  const app = payload.results?.[0];
  if (!app) throw new Error(`SOURCE_NOT_RESOLVED ${storeId}`);
  const screenshotUrls = [...new Set(app.screenshotUrls || [])];
  if (screenshotUrls.length === 0) throw new Error(`STATIC_SCREENSHOTS_UNAVAILABLE ${storeId}`);
  if (screenshotUrls.length < 3) throw new Error(`INSUFFICIENT_SCREENSHOTS ${storeId} ${screenshotUrls.length}`);
  return {
    app,
    pageUrl: app.trackViewUrl,
    screenshotUrls: screenshotUrls.slice(0, 3),
  };
}
