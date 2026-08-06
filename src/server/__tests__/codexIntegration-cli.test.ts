import { afterEach, describe, expect, it, vi } from 'vitest';

const runCodexIntegrationCliMock = vi.hoisted(() => vi.fn());
const startMakeServerMock = vi.hoisted(() => vi.fn());

vi.mock('../codexIntegration/cli.ts', () => ({
  runCodexIntegrationCli: runCodexIntegrationCliMock,
}));

vi.mock('../index.ts', () => ({
  startMakeServer: startMakeServerMock,
}));

vi.mock('../diagnosticLog.ts', () => ({
  resolveDefaultDiagnosticLogFile: () => '/tmp/axhub-make.log',
  startDiagnosticLog: vi.fn(),
}));

import { runCli } from '../cli.ts';

afterEach(() => {
  runCodexIntegrationCliMock.mockReset();
  startMakeServerMock.mockReset();
});

describe('Codex++ integration CLI routing', () => {
  it('routes codex subcommands without starting the Make server', async () => {
    await runCli(['codex', 'install']);

    expect(runCodexIntegrationCliMock).toHaveBeenCalledWith(['install']);
    expect(startMakeServerMock).not.toHaveBeenCalled();
  });
});
