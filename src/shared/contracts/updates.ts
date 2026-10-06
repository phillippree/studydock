export type UpdateCheckResult =
  | { status: 'available'; latestVersion: string }
  | { status: 'current'; latestVersion: string }
  | { status: 'no-release' }
  | { status: 'unavailable' };
