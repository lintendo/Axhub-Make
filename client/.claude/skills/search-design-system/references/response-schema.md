# 搜索结果内部参考

本文件只用于解析脚本响应，不是用户输出模板。机器字段和状态不得直接展示给用户。

searchContractVersion: `1.0.0`

## 顶层字段

| 字段 | 约束 |
| --- | --- |
| `schemaVersion` | const 1 |
| `taxonomyVersion` | const 1.0.0 |
| `searchContractVersion` | const 1.0.0 |
| `cacheStatus` | bundled \| local \| fresh \| stale |
| `cacheVersion` | string |
| `resultSummary` | object |
| `results` | array |
| `error` | object |

## 使用原则

- 用户只需要看到主题名称、推荐理由、不匹配项、预览链接或图片，以及本地 `DESIGN.md`。
- `cacheStatus`、`cacheVersion`、`reviewStatus`、`publishable`、`approved`、`deferred`、`bundled`、`fresh`、`stale` 等内容只用于机器判断，不进入用户文案。
- 不只按分数选主题；必须结合完整 `DESIGN.md` 判断。

## 错误码

- `INVALID_REQUEST`
- `UNSUPPORTED_SCHEMA_VERSION`
- `INCOMPATIBLE_READER_VERSION`
- `INCOMPATIBLE_TAXONOMY_VERSION`
- `INCOMPATIBLE_SEARCH_CONTRACT_VERSION`
- `INVALID_INDEX`
- `INDEX_HASH_MISMATCH`
- `ARTIFACT_HASH_MISMATCH`
- `UNSAFE_ARTIFACT_URL`
- `FETCH_FAILED`
- `CACHE_MISS`
- `STALE_CACHE_DISALLOWED`
- `RESULT_NOT_FOUND`
- `ANNOTATION_INVALID`
- `ANNOTATION_INPUT_HASH_MISMATCH`
- `BUNDLED_SNAPSHOT_NOT_FOUND`
- `BUNDLED_SNAPSHOT_INVALID`
- `PACKAGE_SOURCE_INVALID`
- `DOWNLOAD_TIMEOUT`
- `PACKAGE_BOTH_SOURCES_FAILED`
- `INSTALL_DESTINATION_INVALID`
- `METADATA_SYNC_FAILED`

## 安装结果

`installed` 包含 `themeId`、`platform`、`source`、`themeDir`、`entryPath` 和 `metadataSync: "completed"`，表示完整主题已经安装。

`spec-only` 只写入 `DESIGN.md` 和 `SOURCE.md`，没有完整主题实现。对用户只说明“完整主题下载失败，已保留 `DESIGN.md`，可以重试”，不要展示状态名或内部错误细节。
