# LAN Runtime URL Rewrite Design

## Problem

The Make admin server can be opened from another device through a LAN address, but project resource responses currently expose the Make client runtime origin recorded on the host machine. That origin is commonly `http://localhost:<runtime-port>`. A remote browser therefore sends the embedded prototype request to its own loopback interface instead of the machine running Make.

## Desired Behavior

- When an admin request uses a non-loopback hostname, prototype and theme runtime URLs whose hostname is loopback use the admin request hostname.
- Preserve the runtime URL protocol, port, path, query, and fragment.
- Keep loopback URLs unchanged for admin requests made through loopback.
- Keep non-loopback runtime URLs unchanged.
- Apply the behavior consistently to the project resources API, the legacy entries API, and theme resource APIs.

## Design

Keep the persisted runtime origin machine-local and adapt it only at the HTTP response boundary. Extend the shared Make client runtime-link helper with request-host context. After resolving the active project's runtime origin, rewrite its hostname only when both conditions hold:

1. The resolved runtime hostname is `localhost`, `127.0.0.1`, `::1`, or `[::1]`.
2. The incoming admin request hostname is present and is not loopback.

The helper will prefer the first `x-forwarded-host` value when present, then fall back to `Host`. Host parsing must support ports and bracketed IPv6 addresses. Resource handlers will pass the incoming request to the shared helper so all existing URL backfill behavior remains centralized.

This response-time approach avoids mutating project metadata or runtime registration. It also preserves local development behavior and does not rewrite intentionally configured remote preview origins.

## Error Handling

Malformed or missing request-host/runtime-origin values leave the original runtime URL unchanged. Rewriting is best-effort and must not prevent resource APIs from returning their normal response.

## Testing

- Add a regression test proving a LAN `Host` rewrites a localhost prototype origin while preserving the runtime port and route.
- Cover loopback admin requests and non-loopback runtime origins to prevent over-rewriting.
- Exercise the shared behavior through at least one real resource handler.
- Run the focused runtime-link and resource API tests, then the server TypeScript build.

## Scope

This change only fixes URLs returned by the Make management server. It does not change LAN access control, runtime listen addresses, persisted metadata, or unrelated localhost-based integrations.
