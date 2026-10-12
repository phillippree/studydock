import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const openPath = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ shell: { openPath }, app: {} }));

import { SettingsService } from '../../src/main/settings/service';
import { storagePaths } from '../../src/main/storage/paths';

describe('Settings folder shortcuts', () => {
  let root: string;
  const service = new SettingsService();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'studydock-settings-folders-'));
    storagePaths.setCustomRoot(root);
    openPath.mockReset().mockResolvedValue('');
  });

  afterEach(() => {
    storagePaths.setCustomRoot(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('opens the isolated logs and audio cache directories', async () => {
    await expect(service.openLogsFolder()).resolves.toEqual({ success: true });
    expect(openPath).toHaveBeenLastCalledWith(path.join(root, 'logs'));
    await expect(service.openAudioCacheFolder()).resolves.toEqual({ success: true });
    expect(openPath).toHaveBeenLastCalledWith(path.join(root, 'storage', 'audio', 'vocab-pronunciation'));
  });

  it('reports Finder failures instead of claiming the folder opened', async () => {
    openPath.mockResolvedValue('Finder could not open this folder');
    await expect(service.openLogsFolder()).rejects.toThrow('Finder could not open this folder');
    await expect(service.openAudioCacheFolder()).rejects.toThrow('Finder could not open this folder');
  });
});
