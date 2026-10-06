import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appLogger } from '../../src/main/logging/logger';
import { storagePaths } from '../../src/main/storage/paths';

describe('App logger', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studydock-logs-test-'));
    storagePaths.setCustomRoot(testRoot);
  });

  afterEach(() => {
    storagePaths.setCustomRoot(null);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  it('writes timestamped diagnostics under the application logs directory and redacts API keys', () => {
    appLogger.info('Gemini response included key AIza12345678901234567890ABCDE');

    const logPath = path.join(testRoot, 'logs', 'studydock.log');
    const contents = fs.readFileSync(logPath, 'utf8');
    expect(contents).toMatch(/^\d{4}-\d\d-\d\dT.*\[INFO\]/);
    expect(contents).toContain('[REDACTED_API_KEY]');
    expect(contents).not.toContain('AIza12345678901234567890ABCDE');
  });
});
