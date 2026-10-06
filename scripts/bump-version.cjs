const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const messagePath = process.argv[2];
if (!messagePath) throw new Error('Git did not provide a commit message file.');

const message = readFileSync(messagePath, 'utf8');
const header = message.split(/\r?\n/, 1)[0];
const isBreaking = /^[a-z][a-z0-9-]*(?:\([^)]+\))?!:/i.test(header) || /^BREAKING CHANGE:\s*\S/im.test(message);
const isFeature = /^feat(?:\([^)]+\))?:/i.test(header);
const bump = isBreaking ? 'major' : isFeature ? 'minor' : 'patch';

try {
  execFileSync('git', ['diff', '--quiet', '--', 'package.json', 'package-lock.json'], {
    cwd: root,
    stdio: 'ignore'
  });
} catch {
  throw new Error('package.json or package-lock.json has unstaged changes. Stage or discard those changes before committing.');
}

function readStagedJson(file) {
  const content = execFileSync('git', ['show', `:${file}`], { cwd: root, encoding: 'utf8' });
  return JSON.parse(content);
}

const packageJson = readStagedJson('package.json');
const lockJson = readStagedJson('package-lock.json');

if (lockJson.version !== packageJson.version || lockJson.packages?.['']?.version !== packageJson.version) {
  throw new Error('package.json and package-lock.json must have matching versions before committing.');
}

let headVersion = null;
try {
  const headPackage = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { cwd: root, encoding: 'utf8' }));
  headVersion = headPackage.version;
} catch {
  // The first commit has no HEAD version to compare with.
}

const baseVersion = headVersion && packageJson.version !== headVersion ? headVersion : packageJson.version;
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(baseVersion);
if (!match) throw new Error(`Expected package version to use major.minor.patch; got "${baseVersion}".`);

let [major, minor, patch] = match.slice(1).map(Number);
if (bump === 'major') { major++; minor = 0; patch = 0; }
else if (bump === 'minor') { minor++; patch = 0; }
else patch++;

const nextVersion = `${major}.${minor}.${patch}`;

// A previous commit-msg hook may have staged the bump after a commit was
// interrupted or rejected. If the staged version is already the exact bump
// implied by HEAD and this message, commit it as-is instead of bumping twice.
if (headVersion && packageJson.version !== headVersion) {
  if (packageJson.version === nextVersion) {
    console.log(`StudyDock version already staged for this commit: ${packageJson.version}`);
    process.exit(0);
  }
  throw new Error(`Staged version ${packageJson.version} differs from HEAD (${headVersion}) and is not the expected ${bump} bump (${nextVersion}).`);
}

packageJson.version = nextVersion;
lockJson.version = nextVersion;
if (lockJson.packages?.['']) lockJson.packages[''].version = nextVersion;

writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(path.join(root, 'package-lock.json'), `${JSON.stringify(lockJson, null, 2)}\n`);
execFileSync('git', ['add', '--', 'package.json', 'package-lock.json'], { cwd: root, stdio: 'inherit' });
console.log(`StudyDock version bumped ${bump}: ${baseVersion} → ${nextVersion}`);
