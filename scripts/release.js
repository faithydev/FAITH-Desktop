'use strict';
/**
 * One command to ship a new FAITH for Windows:
 *   npm run release            -> 1.0.0 becomes 1.0.1
 *   npm run release -- minor   -> 1.0.0 becomes 1.1.0
 *   npm run release -- 2.0.0   -> exact version
 *   npm run release -- --current   -> publish the version already in package.json (no bump)
 *
 * Steps: bump the version, build both .exe files, commit + tag + push this repo, create the GitHub
 * release with both files (GitHub CLI), then update the version and sizes on the website's
 * download page (../FAITH/apps/web/src/lib/desktop.ts) and push that one file.
 */
const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const site = path.join(root, '..', 'FAITH');
const siteFile = path.join(site, 'apps', 'web', 'src', 'lib', 'desktop.ts');
const files = ['dist/FAITH-Setup-x64.exe', 'dist/FAITH-Portable-x64.exe'];

const run = (cmd, args, opts = {}) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // npx is a .cmd file on Windows and needs a shell, so it gets one plain command line (its arguments have no spaces);
  // everything else runs directly so arguments keep their spaces.
  if (cmd === 'npx') return execSync(`npx ${args.join(' ')}`, { cwd: root, stdio: 'inherit', ...opts });
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
};
const out = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

function findGh() {
  const known = ['C:\\Program Files\\GitHub CLI\\gh.exe', path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI', 'gh.exe')];
  for (const p of known) if (fs.existsSync(p)) return p;
  return 'gh';
}

function nextVersion(current, arg) {
  if (/^\d+\.\d+\.\d+$/.test(arg || '')) return arg;
  const [a, b, c] = current.split('.').map(Number);
  if (arg === 'major') return `${a + 1}.0.0`;
  if (arg === 'minor') return `${a}.${b + 1}.0`;
  return `${a}.${b}.${c + 1}`;
}

const mb = (file) => `${Math.round(fs.statSync(path.join(root, file)).size / 1048576)} MB`;

const gh = findGh();
execFileSync(gh, ['auth', 'status'], { stdio: 'ignore' }); // fails early with a clear error if not signed in
if (out('git', ['status', '--porcelain'])) throw new Error('FAITH-Desktop has uncommitted changes; commit them first.');

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const arg = process.argv[2];
const version = arg === '--current' ? pkg.version : nextVersion(pkg.version, arg);
const tag = `v${version}`;

if (version !== pkg.version) {
  pkg.version = version;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
run('npx', ['electron-builder', '--win', '--x64'], { env });

if (out('git', ['status', '--porcelain'])) {
  run('git', ['add', 'package.json', 'package-lock.json']);
  run('git', ['commit', '-m', `Release ${tag}`]);
}
const tags = out('git', ['tag', '--list', tag]);
if (!tags) run('git', ['tag', tag]);
run('git', ['push', 'origin', 'main']);
run('git', ['push', 'origin', tag]);

const exists = (() => { try { execFileSync(gh, ['release', 'view', tag], { cwd: root, stdio: 'ignore' }); return true; } catch { return false; } })();
if (exists) {
  run(gh, ['release', 'upload', tag, ...files, '--clobber']);
  run(gh, ['release', 'edit', tag, '--draft=false', '--prerelease=false', '--latest']);
} else {
  run(gh, ['release', 'create', tag, ...files, '--title', `FAITH for Windows ${version}`, '--notes',
    `FAITH for Windows ${version}.\n\n- FAITH-Setup-x64.exe: installer (Desktop and Start menu shortcuts)\n- FAITH-Portable-x64.exe: runs without installing\n\nWindows 10/11, 64-bit.`, '--latest']);
}

if (fs.existsSync(siteFile)) {
  const before = fs.readFileSync(siteFile, 'utf8');
  const after = before
    .replace(/version: '[^']*'/, `version: '${version}'`)
    .replace(/(installer: \{[^}]*size: )'[^']*'/, `$1'${mb(files[0])}'`)
    .replace(/(portable: \{[^}]*size: )'[^']*'/, `$1'${mb(files[1])}'`);
  if (after !== before) {
    fs.writeFileSync(siteFile, after);
    const rel = path.relative(site, siteFile).split(path.sep).join('/');
    run('git', ['add', rel], { cwd: site });
    run('git', ['commit', '-m', `Show FAITH for Windows ${version} on the download page`, '--', rel], { cwd: site });
    run('git', ['push', 'origin', 'main'], { cwd: site });
  }
}

console.log(`\nDone: ${tag} is live at https://github.com/faithydev/FAITH-Desktop/releases/tag/${tag}`);
