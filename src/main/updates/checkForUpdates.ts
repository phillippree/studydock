import { UpdateCheckResult } from '../../shared/contracts/updates';

const LATEST_RELEASE_API = 'https://api.github.com/repos/phillippree/studydock/releases/latest';

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  if (!latestParts || !currentParts) return false;
  for (let index = 0; index < latestParts.length; index++) {
    if (latestParts[index] !== currentParts[index]) return latestParts[index] > currentParts[index];
  }
  return false;
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'StudyDock'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (response.status === 404) return { status: 'no-release' };
    if (!response.ok) return { status: 'unavailable' };

    const release: unknown = await response.json();
    if (!release || typeof release !== 'object' || !('tag_name' in release) || typeof release.tag_name !== 'string') {
      return { status: 'unavailable' };
    }

    const latestVersion = release.tag_name.replace(/^v/, '');
    if (!parseVersion(latestVersion)) return { status: 'unavailable' };
    return isNewerVersion(latestVersion, currentVersion)
      ? { status: 'available', latestVersion }
      : { status: 'current', latestVersion };
  } catch {
    return { status: 'unavailable' };
  }
}
