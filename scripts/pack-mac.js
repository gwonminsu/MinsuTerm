'use strict';
/**
 * Builds the macOS app from Windows (electron-builder only builds Mac targets on a Mac).
 *
 *   node scripts/pack-mac.js            -> dist/MinsuTerm-<ver>-mac-arm64.zip and -mac-x64.zip
 *
 * How: unpack the official Electron macOS app (rebuilding its symlinks and remembering every Unix
 * permission, which Windows file systems don't keep), rename Electron.app → MinsuTerm.app, patch
 * Info.plist + icon, add our app under Contents/Resources/app with the macOS node-pty build, then
 * sign the whole bundle ad-hoc with rcodesign (apple-codesign, runs on Windows) and zip it with the
 * permissions and symlinks restored. A signed bundle is no longer "damaged" on Apple Silicon: macOS
 * only asks once whether to open an app from an unidentified developer.
 *   rcodesign: $RCODESIGN, or ~/rcs/apple-codesign-*\/rcodesign.exe (needs Windows Developer Mode for symlinks)
 * On a Mac, `npm run dist:mac` makes a proper .dmg instead.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const yauzl = require('yauzl');
const archiver = require('archiver');
const plist = require('plist');
const tar = require('tar');
const { downloadArtifact } = require('@electron/get');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const ELECTRON = require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version;
const PTY_VER = require(path.join(ROOT, 'node_modules', '@lydell', 'node-pty', 'package.json')).version;
const ARCHS = (process.argv.find((a) => a.startsWith('--arch=')) || '--arch=arm64,x64').slice(7).split(',');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-mac-'));

function findRcodesign() {
  if (process.env.RCODESIGN && fs.existsSync(process.env.RCODESIGN)) return process.env.RCODESIGN;
  const base = path.join(os.homedir(), 'rcs');
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    const exe = path.join(base, d, process.platform === 'win32' ? 'rcodesign.exe' : 'rcodesign');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}
const RCODESIGN = findRcodesign();

const S_IFLNK = 0o120000;
const S_IFMT = 0o170000;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

/** The macOS node-pty prebuild for one arch, unpacked from npm. */
function ptyPackage(arch) {
  const name = `@lydell/node-pty-darwin-${arch}`;
  const dir = path.join(TMP, `pty-${arch}`);
  fs.mkdirSync(dir, { recursive: true });
  const tgz = execSync(`npm pack ${name}@${PTY_VER} --silent`, { cwd: dir, encoding: 'utf8' }).trim().split(/\r?\n/).pop();
  tar.x({ file: path.join(dir, tgz), cwd: dir, sync: true });
  return path.join(dir, 'package');
}

/** Files of our app → paths inside Contents/Resources/app. */
function appFiles(arch) {
  const files = [];
  const add = (abs, rel, mode = 0o644) => files.push({ abs, rel: rel.split(path.sep).join('/'), mode });
  const pj = { ...pkg };
  delete pj.devDependencies;
  delete pj.build;
  delete pj.scripts;
  const pjPath = path.join(TMP, 'package.json');
  fs.writeFileSync(pjPath, JSON.stringify(pj, null, 2));
  add(pjPath, 'package.json');
  for (const f of walk(path.join(ROOT, 'src'))) add(f, path.relative(ROOT, f));
  for (const dep of Object.keys(pkg.dependencies)) {
    const base = path.join(ROOT, 'node_modules', dep);
    for (const f of walk(base)) add(f, path.relative(ROOT, f));
  }
  const ptyDir = ptyPackage(arch);
  for (const f of walk(ptyDir)) {
    const rel = path.join('node_modules', '@lydell', `node-pty-darwin-${arch}`, path.relative(ptyDir, f));
    const exec = /spawn-helper$|\.node$/.test(f); // native code must stay executable
    add(f, rel, exec ? 0o755 : 0o644);
  }
  return files;
}

function patchPlist(xml) {
  const p = plist.parse(xml);
  Object.assign(p, {
    CFBundleName: 'MinsuTerm',
    CFBundleDisplayName: 'MinsuTerm',
    CFBundleIdentifier: 'com.minsu.minsuterm',
    CFBundleShortVersionString: pkg.version,
    CFBundleVersion: pkg.version,
    CFBundleIconFile: 'electron.icns',
    LSApplicationCategoryType: 'public.app-category.developer-tools',
    NSHumanReadableCopyright: `Copyright © ${new Date().getFullYear()} Minsu`,
    LSMinimumSystemVersion: p.LSMinimumSystemVersion || '11.0',
  });
  return plist.build(p);
}

const INSTALL_COMMAND = `#!/bin/bash
# MinsuTerm 설치: /Applications 로 복사하고, 인터넷에서 받은 앱 표시를 지운 뒤 이 Mac 에서 서명합니다.
set -e
cd "$(dirname "$0")"
APP="MinsuTerm.app"
DEST="/Applications/$APP"
echo "MinsuTerm 설치 중…"
if [ -d "$DEST" ]; then
  osascript -e 'tell application "MinsuTerm" to quit' >/dev/null 2>&1 || true
  rm -rf "$DEST" 2>/dev/null || sudo rm -rf "$DEST"
fi
cp -R "$APP" /Applications/ 2>/dev/null || sudo cp -R "$APP" /Applications/
xattr -cr "$DEST" 2>/dev/null || sudo xattr -cr "$DEST"
codesign --force --deep --sign - "$DEST" >/dev/null 2>&1 || sudo codesign --force --deep --sign - "$DEST"
echo "설치 완료! MinsuTerm 을 엽니다."
open "$DEST"
`;

const README = `MinsuTerm ${pkg.version} (macOS)

설치
  1. 이 폴더의 "MinsuTerm 설치.command" 를 오른쪽 클릭 → 열기 → 열기
     (처음 한 번은 macOS 가 "확인되지 않은 개발자" 라고 물어봅니다)
  2. 끝! /Applications 에 설치되고 바로 실행됩니다.

  MinsuTerm.app 을 응용 프로그램 폴더로 직접 옮겨도 됩니다. 처음 열 때 막히면:
  시스템 설정 → 개인정보 보호 및 보안 → 아래쪽 "그래도 열기" 를 누르세요.

터미널로 설치하려면
  cd 이 폴더 && bash "MinsuTerm 설치.command"

제거
  /Applications/MinsuTerm.app 을 휴지통으로 옮기면 됩니다.
  설정까지 지우려면: ~/Library/Application Support/MinsuTerm
`;

function readZip(file) {
  return new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (e, z) => (e ? reject(e) : resolve(z))));
}
const entryBuffer = (zip, entry) => new Promise((resolve, reject) => {
  zip.openReadStream(entry, (e, s) => {
    if (e) return reject(e);
    const chunks = [];
    s.on('data', (c) => chunks.push(c));
    s.on('end', () => resolve(Buffer.concat(chunks)));
    s.on('error', reject);
  });
});

/** Walk a staged tree: files, dirs and symlinks (not followed). */
function walkAll(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).split(path.sep).join('/');
    if (e.isSymbolicLink()) out.push({ p, rel, link: true });
    else if (e.isDirectory()) { out.push({ p, rel, dir: true }); walkAll(p, base, out); }
    else out.push({ p, rel });
  }
  return out;
}

async function build(arch) {
  console.log(`\n[${arch}] Electron ${ELECTRON} 받는 중…`);
  const electronZip = await downloadArtifact({ version: ELECTRON, platform: 'darwin', arch, artifactName: 'electron' });
  const stage = path.join(TMP, `stage-${arch}`);
  const appDir = path.join(stage, 'MinsuTerm.app');
  const modes = new Map(); // rel path inside the .app → Unix mode bits (Windows can't keep them)
  const links = []; // symlinks, made once every file is in place
  const icns = fs.readFileSync(path.join(ROOT, 'build', 'icon.icns'));

  // 1. unpack Electron.app as MinsuTerm.app
  const zip = await readZip(electronZip);
  let count = 0;
  await new Promise((resolve, reject) => {
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.on('entry', async (entry) => {
      try {
        const name = entry.fileName;
        if (!name.startsWith('Electron.app/')) return zip.readEntry();
        const rel = name.slice('Electron.app/'.length).replace(/\/$/, '');
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        const dest = path.join(appDir, rel);
        if (name.endsWith('/')) { fs.mkdirSync(dest, { recursive: true }); modes.set(rel, (mode & 0o7777) || 0o755); return zip.readEntry(); }
        if (rel === 'Contents/Resources/default_app.asar') return zip.readEntry();
        let data = await entryBuffer(zip, entry);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if ((mode & S_IFMT) === S_IFLNK) {
          links.push({ dest, target: data.toString('utf8'), rel, mode: (mode & 0o7777) || 0o755 });
        } else {
          if (rel === 'Contents/Info.plist') data = Buffer.from(patchPlist(data.toString('utf8')));
          if (rel === 'Contents/Resources/electron.icns') data = icns;
          fs.writeFileSync(dest, data);
          modes.set(rel, (mode & 0o7777) || 0o644);
        }
        count++;
        zip.readEntry();
      } catch (err) { reject(err); }
    });
    zip.readEntry();
  });
  zip.close();
  for (const l of links) {
    const isDir = fs.existsSync(path.resolve(path.dirname(l.dest), l.target)) && fs.statSync(path.resolve(path.dirname(l.dest), l.target)).isDirectory();
    fs.symlinkSync(l.target, l.dest, isDir ? 'dir' : 'file');
    modes.set(l.rel, l.mode);
  }

  // 2. our app
  const files = appFiles(arch);
  for (const f of files) {
    const rel = `Contents/Resources/app/${f.rel}`;
    const dest = path.join(appDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f.abs, dest);
    modes.set(rel, f.mode);
  }

  // 3. sign (ad-hoc): nested frameworks, helper apps and native modules first, then the app
  let signed = false;
  if (RCODESIGN) {
    try {
      execSync(`"${RCODESIGN}" sign "${appDir}"`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      // (rcodesign's own 'verify' is flagged as unreliable by its authors: read the signature back instead)
      const info = execSync(`"${RCODESIGN}" print-signature-info "${path.join(appDir, 'Contents', 'MacOS', 'Electron')}"`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      signed = /code_directory|cdhash/i.test(info);
    } catch (e) {
      console.warn(`[${arch}] 서명 실패 — 서명 없이 만듭니다: ${String(e.stderr || e.message).split('\n').slice(-3).join(' ')}`);
    }
  } else {
    console.warn(`[${arch}] rcodesign 을 찾지 못해 서명 없이 만듭니다 (설치 스크립트가 Mac 에서 서명합니다)`);
  }

  // 4. zip, restoring permissions and symlinks
  const outFile = path.join(ROOT, 'dist', `MinsuTerm-${pkg.version}-mac-${arch}.zip`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const out = fs.createWriteStream(outFile);
  const zipOut = archiver('zip', { zlib: { level: 9 } });
  const finished = new Promise((resolve, reject) => { out.on('close', resolve); zipOut.on('error', reject); });
  zipOut.pipe(out);
  const TOP = 'MinsuTerm/';
  const APP = `${TOP}MinsuTerm.app/`;
  for (const it of walkAll(appDir)) {
    const name = APP + it.rel;
    if (it.link) zipOut.symlink(name, fs.readlinkSync(it.p).split(path.sep).join('/'), modes.get(it.rel) || 0o755);
    else if (it.dir) zipOut.append(null, { name: name + '/', type: 'directory', mode: modes.get(it.rel) || 0o755 });
    else zipOut.file(it.p, { name, mode: modes.get(it.rel) || 0o644 }); // files rcodesign added (_CodeSignature/…) are plain data
  }
  zipOut.append(INSTALL_COMMAND, { name: `${TOP}MinsuTerm 설치.command`, mode: 0o755 });
  zipOut.append(README, { name: `${TOP}읽어주세요.txt`, mode: 0o644 });
  await zipOut.finalize();
  await finished;
  console.log(`[${arch}] ${signed ? '서명됨(ad-hoc)' : '서명 안 됨'} · Electron ${count}개 + 앱 ${files.length}개 파일 → ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)`);
}

(async () => {
  try {
    for (const arch of ARCHS) await build(arch);
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
