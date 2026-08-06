import { afterEach, describe, expect, it, vi } from 'vitest';

const runCodexIntegrationCliMock = vi.hoisted(() => vi.fn());
const runCursorIntegrationCliMock = vi.hoisted(() => vi.fn());
const startMakeServerMock = vi.hoisted(() => vi.fn());

vi.mock('../codexIntegration/cli.ts', () => ({
  runCodexIntegrationCli: runCodexIntegrationCliMock,
}));

vi.mock('../cursorIntegration/cli.ts', () => ({
  runCursorIntegrationCli: runCursorIntegrationCliMock,
}));

vi.mock('../index.ts', () => ({ startMakeServer: startMakeServerMock }));
vi.mock('../diagnosticLog.ts', () => ({
  resolveDefaultDiagnosticLogFile: () => '/tmp/axhub-make.log',
  startDiagnosticLog: vi.fn(),
}));

import { runCli } from '../cli.ts';

afterEach(() => {
  runCodexIntegrationCliMock.mockReset();
  runCursorIntegrationCliMock.mockReset();
  startMakeServerMock.mockReset();
});

describe('Cursor integration CLI routing', () => {
  it('routes cursor subcommands without starting Make immediately', async () => {
    await runCli(['cursor', 'install']);

    expect(runCursorIntegrationCliMock).toHaveBeenCalledWith(['install']);
    expect(runCodexIntegrationCliMock).not.toHaveBeenCalled();
    expect(startMakeServerMock).not.toHaveBeenCalled();
  });
});
