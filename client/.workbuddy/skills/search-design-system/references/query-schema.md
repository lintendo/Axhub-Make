# Design system search query

> Generated from `apps/make-template/knowledge/schemas/search-request.schema.json`. Do not edit by hand.

searchContractVersion: `1.0.0`

Reader range: `1.0.0` to `2.0.0` (exclusive)

## Fields

| Field | Contract |
| --- | --- |
| `schemaVersion` | const 1 |
| `readerVersion` | string |
| `platform` | desktop \| mobile |
| `terms` | array |
| `hardFilters` | #/$defs/filters |
| `softFilters` | #/$defs/filters |
| `exclude` | #/$defs/filters |
| `limit` | integer |

## Structured example

```json
{
  "schemaVersion": 1,
  "readerVersion": "1.0.0",
  "platform": "desktop",
  "terms": ["analytics", "finance"],
  "hardFilters": { "industries": ["finance-payments"] },
  "softFilters": { "styles": ["professional"], "density": ["high"] },
  "exclude": { "styles": ["playful"] },
  "limit": 4
}
```

Use canonical values from [taxonomy.md](taxonomy.md). Build this object locally; do not send the user's original request to the search script or endpoint.

For installation, use a separate minimal request containing only the confirmed `themeId` and `platform`; pass the project path through `--project-root`.
