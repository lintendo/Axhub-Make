import {
  type CodexIntegrationContext,
  doctorCodexIntegration,
  installCodexIntegration,
  uninstallCodexIntegration,
} from './install.ts';
import { openCodexIntegration } from './launcher.ts';

export const CODEX_INTEGRATION_USAGE = `Usage: axhub-make codex <command>

Commands:
  install    Install or update the Codex sidebar integration.
  open       Start official Codex with the Axhub CDP integration.
  doctor     Check installed files, background service, Make, and Codex clients.
  uninstall  Remove the Axhub Make Codex integration.

Daily use:
  Codex++: open Codex++ normally.
  Official Codex: run axhub-make codex open.
`;

function rejectExtraArguments(args: string[]): void {
  if (args.length > 1) throw new Error(`Unexpected codex argument: ${args[1]}`);
}

export async function runCodexIntegrationCli(
  args: string[],
  context?: CodexIntegrationContext,
): Promise<void> {
  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    console.log(CODEX_INTEGRATION_USAGE.trimEnd());
    return;
  }
  rejectExtraArguments(args);
  if (command === 'install') {
    const result = await installCodexIntegration(context);
    for (const warning of result.warnings) console.warn(`[warn] ${warning}`);
    console.log('Installed Axhub Make for Codex.');
    console.log(`Sidebar source: ${result.paths.sidebarSourceFile}`);
    console.log(result.nextAction);
    return;
  }
  if (command === 'open') {
    const result = await openCodexIntegration(context);
    console.log(result.reused
      ? 'Codex CDP is already ready. Click Axhub Make in the sidebar.'
      : 'Official Codex started with Axhub CDP. Click Axhub Make in the sidebar.');
    return;
  }
  if (command === 'doctor') {
    const result = await doctorCodexIntegration(context);
    for (const check of result.checks) {
      console.log(`[${check.status}] ${check.id}: ${check.message}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === 'uninstall') {
    await uninstallCodexIntegration(context);
    console.log('Uninstalled the Axhub Make Codex integration.');
    return;
  }
  throw new Error(`Unknown codex command: ${command}`);
}
