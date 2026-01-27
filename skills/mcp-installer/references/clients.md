# MCP Client Reference

## Client IDs (target list)

- claude
- claude-code
- cline
- roocode
- windsurf
- witsy
- enconvo
- cursor
- vscode
- vscode-insiders
- boltai
- amazon-bedrock
- amazonq
- librechat
- gemini-cli
- codex
- antigravity
- trae
- trae-cn

## Known manual config paths

Use the OS base dir and the per-client suffix below.

Base dirs:
- macOS: `~/Library/Application Support`
- Windows: `%APPDATA%` (usually `C:\Users\<user>\AppData\Roaming`)
- Linux: `$XDG_CONFIG_HOME` or `~/.config`
- VSCode globalStorage: `<base>/Code/User/globalStorage`

Known paths:
- `claude`: `<base>/Claude/claude_desktop_config.json`
- `cline`: `<vscodeGlobalStorage>/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- `roocode`: `<vscodeGlobalStorage>/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`
- `windsurf`: `~/.codeium/windsurf/mcp_config.json`
- `witsy`: `<base>/Witsy/settings.json`
- `enconvo`: `~/.config/enconvo/mcp_config.json`
- `cursor`: `~/.cursor/mcp.json`
- `trae`: `<base>/Trae/User/mcp.json`
- `trae-cn`: `<base>/Trae CN/User/mcp.json`
- `antigravity`: `~/.gemini/antigravity/mcp_config.json` (macOS/Linux) or `C:\Users\<user>\.gemini\antigravity\mcp_config.json` (Windows)

Notes:
- `claude-code` is CLI-only; install via the client CLI if it supports MCP commands.
- `roocode` uses the VSCode extension ID `rooveterinaryinc.roo-cline` for its settings path.

## Unknown or CLI-only clients

For these, prefer @smithery/cli. If manual config is required, search standard config dirs for `mcp.json`, `mcp_config.json`, or other MCP-related files:

- `vscode`, `vscode-insiders`
- `boltai`
- `amazon-bedrock`
- `amazonq`
- `librechat`
- `gemini-cli`
- `codex`
- `antigravity`

## Path discovery checklist

- Search config roots for MCP files: `rg --files -g 'mcp*.json' <config-root>`.
- If a client stores MCP under a settings file, open it and look for a top-level `mcpServers` key.
- If no file exists, create one at the client-specific location and start with `{ "mcpServers": {} }`.
