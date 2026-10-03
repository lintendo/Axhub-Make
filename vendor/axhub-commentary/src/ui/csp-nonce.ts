/**
 * Read the nonce that the host page uses for dynamically inserted styles.
 *
 * CSP hides the nonce attribute from CSS selectors in some browsers, but the
 * HTMLStyleElement/HTMLScriptElement `nonce` property remains readable.
 */
export function resolveCspNonce(ownerDocument?: Document): string | undefined {
  const documentRef = ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  if (!documentRef) return undefined;

  const metaNonce = typeof documentRef.querySelector === 'function'
    ? documentRef
      .querySelector('meta[name="csp-nonce"], meta[property="csp-nonce"]')
      ?.getAttribute('content')
      ?.trim()
    : undefined;
  if (metaNonce) return metaNonce;

  if (typeof documentRef.querySelectorAll === 'function') {
    for (const element of Array.from(documentRef.querySelectorAll('style'))) {
      const nonce = (element as HTMLStyleElement).nonce?.trim();
      if (nonce) return nonce;
    }
  }

  if (typeof documentRef.querySelectorAll === 'function') {
    for (const element of Array.from(documentRef.querySelectorAll('script'))) {
      const nonce = (element as HTMLScriptElement).nonce?.trim();
      if (nonce) return nonce;
    }
  }

  return undefined;
}
