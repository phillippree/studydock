import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { storagePaths } from '../../src/main/storage/paths';
import { SecretsService } from '../../src/main/settings/secrets';

describe('Settings and Secrets Service', () => {
  let testRoot: string;
  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studydock-secrets-test-'));
    storagePaths.setCustomRoot(testRoot);
    storagePaths.ensureDirectories();
  });
  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
    storagePaths.setCustomRoot(null);
  });
  it('masks API keys safely without leaking key content', () => {
    const secrets = new SecretsService();
    secrets.saveKey('FAKE-test-credential-not-a-real-key-stuv', true);

    expect(secrets.hasKey()).toBe(true);
    const masked = secrets.getMaskedKey();
    expect(masked).toBe('FAKE••••••••stuv');
    expect(masked).not.toContain('1234567890abcdef');
  });

  it('handles removal of API key', () => {
    const secrets = new SecretsService();
    secrets.saveKey('FAKE-test-key-123456', true);
    expect(secrets.hasKey()).toBe(true);

    secrets.removeKey();
    expect(secrets.hasKey()).toBe(false);
    expect(secrets.getKey()).toBeNull();
    expect(secrets.getMaskedKey()).toBeNull();
  });

  it('refuses project-local fallback when app storage is unavailable', () => {
    storagePaths.setCustomRoot(null);
    expect(() => storagePaths.getRoot()).toThrow('Refusing to save runtime data');
  });

  it('rejects blank API keys', () => {
    const secrets = new SecretsService();
    const result = secrets.saveKey('   ');
    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot be empty');
  });
});
