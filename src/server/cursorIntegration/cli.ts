import {
  type CursorIntegrationContext,
  doctorCursorIntegration,
  installCursorIntegration,
  uninstallCursorIntegration,
} from './install.ts';
import { openCursorIntegration } from './launcher.ts';

export const CURSOR_INTEGRATION_USAGE = `Usage: axhub-make cursor <command>

Commands:
  install    Install or update the Cursor Agents integration.
  open       Start Cursor with the Axhub loopback CDP integration.
  doctor     Check the companion, Make, and Cursor native browser state.
  uninstall  Remove only the Axhub Make Cursor integration.

Daily use:
  Fully quit an ordinary Cursor instance, then run npx -y @axhub/make@latest cursor open.
  Click Axhub Make in Cursor Agents; Make starts automatically and opens in Cursor's native browser.
`;

function rejectExtraArguments(args: string[]): void {
  if (args.length > 1) throw new Error(`Unexpected cursor argument: ${args[1]}`);
}

export async function runCursorIntegrationCli(
  args: string[],
  context?: CursorIntegrationContext,
): Promise<void> {
  const command = args[0];
  if (!command || command === '--help' || command === '-h') {
    console.log(CURSOR_INTEGRATION_USAGE.trimEnd());
    return;
  }
  rejectExtraArguments(args);
  if (command === 'install') {
    const result = await installCursorIntegration(context);
    for (const warning of result.warnings) console.warn(`[warn] ${warning}`);
    console.log('Installed Axhub Make for Cursor.');
    console.log(`Launcher source: ${result.paths.launcherSourceFile}`);
    console.log(result.nextAction);
    return;
  }
  if (command === 'open') {
    const result = await openCursorIntegration(context);
    console.log(result.reused
      ? 'Cursor Axhub CDP is already ready. Click Axhub Make; Make starts automatically.'
      : 'Cursor started with Axhub CDP. Click Axhub Make; Make starts automatically.');
    return;
  }
  if (command === 'doctor') {
    const result = await doctorCursorIntegration(context);
    for (const check of result.checks) {
      console.log(`[${check.status}] ${check.id}: ${check.message}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === 'uninstall') {
    const result = await uninstallCursorIntegration(context);
    for (const warning of result.warnings) console.warn(`[warn] ${warning}`);
    console.log('Uninstalled the Axhub Make Cursor integration.');
    return;
  }
  throw new Error(`Unknown cursor command: ${command}`);
}
