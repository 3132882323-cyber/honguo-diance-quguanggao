import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = new URL('../extensions/shadowrocket/', import.meta.url);
const load = (name: string) => readFile(new URL(name, folder), 'utf8');
const semanticLines = (source: string) => source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));

function sections(source: string) {
  const result: Record<string, string[]> = {};
  let current = '';
  for (const line of semanticLines(source)) {
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) { current = section[1]; result[current] = []; }
    else { assert.ok(current, 'rules must be inside a section'); result[current].push(line); }
  }
  return result;
}

function hostMatches(line: string, host: string) {
  const [kind, value, policy] = line.split(',');
  assert.equal(policy, 'REJECT');
  if (kind === 'DOMAIN') return value === host;
  if (kind === 'DOMAIN-SUFFIX') return host === value || host.endsWith(`.${value}`);
  assert.equal(kind, 'DOMAIN-WILDCARD');
  const expression = value.split('').map(char => char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  return new RegExp(`^${expression}$`, 'i').test(host);
}

test('Shadowrocket published files exactly preserve the three existing artifacts', async () => {
  const provenance = JSON.parse(await load('PROVENANCE.json'));
  for (const file of provenance.files as { path: string; bytes: number; sha256: string }[]) {
    const bytes = await readFile(new URL(file.path, folder));
    assert.equal(bytes.byteLength, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  const module = await load('hongguo-shadowrocket.sgmodule');
  const copy = await load('hongguo-shadowrocket-copy.txt');
  assert.equal(module, copy);
  assert.deepEqual(semanticLines(module), semanticLines(copy));
  assert.equal(provenance.upstream.commit, '54412489b99934abf4652ee7729cb3e1bdaf3528');
  assert.equal(provenance.upstream.license, 'MIT');
});

test('Shadowrocket format contains only bounded host rejects and the original MITM host list', async () => {
  const source = await load('hongguo-shadowrocket.sgmodule');
  const config = sections(source);
  assert.deepEqual(Object.keys(config), ['Rule', 'URL Rewrite', 'MITM']);
  assert.equal(config.Rule.length, 18);
  assert.equal(config.Rule.filter(line => line.startsWith('DOMAIN-WILDCARD,')).length, 10);
  for (const line of config.Rule) assert.match(line, /^DOMAIN(?:-SUFFIX|-WILDCARD)?,[a-z0-9*?.-]+,REJECT$/);
  assert.equal(config.MITM.length, 1);
  assert.equal(config.MITM[0], 'hostname = %APPEND% *.pangolin-sdk-toutiao.com, *.pangolin-sdk-toutiao1.com, *.pglstatp-toutiao.com, *.pstatp.com, *.snssdk.com');
  assert.doesNotMatch(source, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|-----BEGIN CERTIFICATE-----|\b(?:script-path|http-request|http-response)\s*=/i);
  assert.doesNotMatch(source, /^\s*(?:FINAL|MATCH|DOMAIN-KEYWORD|IP-CIDR),/mi);
});

test('Shadowrocket domain rules block ad samples while keeping media, account and unrelated hosts', async () => {
  const rules = sections(await load('hongguo-shadowrocket.sgmodule')).Rule;
  for (const host of ['api-access.pangolin-sdk-toutiao.com', 'ads3-normal-lq.zijieapi.com', 'p6-ad-sign.byteimg.com', 'p3-developer-sign.bytemaimg.com', 'ecom5-normal-lq.ecombdapi.com', 'ec5-core-lq.ecombdapi.com', 'v100-reading-ad.qznovelvod.com', 'v26-se-sjy-daily-reading-ad.qznovelvod.com', 'zlink.ugsdk.cn']) {
    assert.ok(rules.some(line => hostMatches(line, host)), `advertising host should match: ${host}`);
  }
  for (const host of ['v11-reading-video.qznovelvod.com', 'v6-reading-videocdn.qznovelvod.com', 'v9-novelapp.fqnovelvod.com', 'p3-novel-sign.byteimg.com', 'p3-reading-sign.fqnovelpic.com', 'api5-normal.fqnovel.com', 'security.snssdk.com', 'example.com', 'pangolin-sdk-toutiao.com.attacker.test']) {
    assert.ok(!rules.some(line => hostMatches(line, host)), `content/unrelated host should stay allowed: ${host}`);
  }
});

test('Shadowrocket URL rewrites compile and are scoped to original ad hosts and paths', async () => {
  const rewrites = sections(await load('hongguo-shadowrocket.sgmodule'))['URL Rewrite'];
  assert.equal(rewrites.length, 3);
  const regexes = rewrites.map(line => {
    const [pattern, separator, action] = line.split(/\s+/);
    assert.equal(separator, '-'); assert.ok(['reject-dict', 'reject-video'].includes(action));
    assert.ok(pattern.startsWith('^https?://'));
    assert.ok(/pangolin-sdk-toutiao|pglstatp-toutiao|snssdk/.test(pattern));
    assert.ok(/\/api\/ad\/|ad-app-package/.test(pattern));
    return new RegExp(pattern);
  });
  for (const url of ['https://api.pangolin-sdk-toutiao.com/api/ad/union/sdk/get_ads/', 'https://p3.pglstatp-toutiao.com/obj/ad/banner.mp4', 'https://ads.snssdk.com/api/ad/load']) assert.ok(regexes.some(regex => regex.test(url)), url);
  for (const url of ['https://example.com/api/ad/load', 'https://security.snssdk.com/passport/login/', 'https://v11-reading-video.qznovelvod.com/movie.mp4', 'https://p3.pstatp.com/obj/novel-cover/image.jpg', 'https://api.pangolin-sdk-toutiao.com.attacker.test/api/ad/union/sdk/get_ads/']) assert.ok(!regexes.some(regex => regex.test(url)), url);
});

test('Shadowrocket attribution retains full MIT grant and clearly labels conversion limits', async () => {
  const license = await load('LICENSE');
  const module = await load('hongguo-shadowrocket.sgmodule');
  const readme = await load('README.md');
  assert.match(license, /Copyright \(c\) 2026 bluee1111/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.match(license, /Shadowrocket-format derivative/);
  const embedded = module.slice(module.indexOf('# MIT License')).split(/\r?\n/).map(line => line.replace(/^# ?/, '')).join('\n').trim();
  assert.equal(embedded, license.split('\nAdaptation notice')[0].trim());
  assert.match(readme, /https:\/\/raw\.githubusercontent\.com\/3132882323-cyber\/honguo-diance-quguanggao\/main\/extensions\/shadowrocket\/hongguo-shadowrocket\.sgmodule/);
  assert.match(readme, /匹配范围略宽/); assert.match(readme, /尚未在真实 iPhone/);
});
