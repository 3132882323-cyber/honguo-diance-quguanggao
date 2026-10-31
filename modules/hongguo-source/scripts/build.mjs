#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const goRoot = join(moduleRoot, 'go');
const buildRoot = join(moduleRoot, 'build');
const toolsRoot = join(buildRoot, 'tools');
const platform = process.argv[2];
if (!['android', 'ios'].includes(platform)) throw new Error('Usage: node modules/hongguo-source/scripts/build.mjs android|ios');
if (platform === 'ios' && process.platform !== 'darwin') throw new Error('iOS builds require macOS with Xcode. Run the macOS CI job or use a Mac.');

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: goRoot, stdio: 'inherit', ...options });
}

function removeGenerated(target) {
  const rel = relative(moduleRoot, resolve(target));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Refusing to remove path outside module: ${target}`);
  rmSync(target, { recursive: true, force: true });
}

mkdirSync(toolsRoot, { recursive: true });
const env = {
  ...process.env,
  GOBIN: toolsRoot,
  GOTOOLCHAIN: 'local',
  PATH: `${toolsRoot}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
};
const goVersion = execFileSync('go', ['version'], { encoding: 'utf8', env });
const version = /go(\d+)\.(\d+)/.exec(goVersion);
if (!version || Number(version[1]) < 1 || (Number(version[1]) === 1 && Number(version[2]) < 26)) {
  throw new Error(`Go 1.26+ is required; found ${goVersion.trim()}`);
}
if (platform === 'android' && (!env.ANDROID_HOME || !env.ANDROID_NDK_HOME)) {
  throw new Error('Set ANDROID_HOME and ANDROID_NDK_HOME (recommended NDK 27.2.12479018) before building Android.');
}

const mobileVersion = 'v0.0.0-20261011034528-197770444867';
run('go', ['install', `golang.org/x/mobile/cmd/gomobile@${mobileVersion}`, `golang.org/x/mobile/cmd/gobind@${mobileVersion}`], { env });
run('go', ['mod', 'download'], { env });
run('go', ['test', './...'], { env });
const gomobile = join(toolsRoot, `gomobile${process.platform === 'win32' ? '.exe' : ''}`);

if (platform === 'android') {
  const output = join(buildRoot, 'android');
  removeGenerated(output);
  mkdirSync(output, { recursive: true });
  const archive = join(output, 'core.aar');
  run(gomobile, ['bind', '-target', 'android', '-androidapi', '24', '-javapkg', 'dev.diance.hongguo', '-trimpath', '-ldflags=-s -w', '-o', archive, '.'], { env });
  const jar = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar') : 'jar';
  run(jar, ['xf', archive, 'classes.jar', 'jni'], { cwd: output, env });
  const libs = join(moduleRoot, 'android', 'libs');
  const jni = join(moduleRoot, 'android', 'src', 'main', 'jniLibs');
  if (!existsSync(join(output, 'classes.jar')) || !existsSync(join(output, 'jni'))) throw new Error('gomobile did not produce Android classes and JNI libraries.');
  mkdirSync(libs, { recursive: true });
  removeGenerated(jni);
  cpSync(join(output, 'classes.jar'), join(libs, 'core.jar'));
  cpSync(join(output, 'jni'), jni, { recursive: true });
  console.log('Built Hongguo Android core from source. Continue with the Expo Android build.');
} else {
  const framework = join(moduleRoot, 'ios', 'HongguoCore.xcframework');
  removeGenerated(framework);
  run(gomobile, ['bind', '-target', 'ios,iossimulator', '-iosversion', '15.1', '-trimpath', '-ldflags=-s -w', '-o', framework, '.'], { env });
  console.log('Built Hongguo iOS core from source. Continue with pod install / Expo iOS build.');
}
