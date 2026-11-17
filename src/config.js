'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** The live FAITH web app. The desktop app is a window onto it, so it never runs its own copy. */
const DEFAULT_URL = 'https://faith-platform-green.vercel.app';

/**
 * Hosts that may load inside the FAITH window besides the app itself:
 * sign-in providers (the OAuth round trip must come back to the same window to keep the session)
 * and payment pages that redirect back to FAITH after paying.
 * Everything else opens in the user's normal browser.
 */
const IN_APP_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'appleid.apple.com',
  'idmsa.apple.com',
  'checkout.paycom.uz',
  'test.paycom.uz',
  'my.click.uz',
  'checkout.stripe.com',
];

function readFileConfig(userData) {
  try {
    const raw = fs.readFileSync(path.join(userData, 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normaliseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) {
      return null; // only HTTPS, or plain HTTP on this computer for local testing
    }
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Where the app points. First match wins:
 *   1. --url=https://... on the command line
 *   2. FAITH_URL environment variable
 *   3. "url" in %APPDATA%\FAITH\config.json
 *   4. the live site
 */
function resolveConfig(argv, env, userData) {
  const arg = argv.find((a) => a.startsWith('--url='));
  const file = readFileConfig(userData);
  const url =
    normaliseUrl(arg && arg.slice('--url='.length)) ||
    normaliseUrl(env.FAITH_URL) ||
    normaliseUrl(file.url) ||
    DEFAULT_URL;
  const extraHosts = Array.isArray(file.inAppHosts) ? file.inAppHosts.filter((h) => typeof h === 'string') : [];
  return { url, origin: new URL(url).origin, inAppHosts: [...IN_APP_HOSTS, ...extraHosts] };
}

module.exports = { DEFAULT_URL, IN_APP_HOSTS, resolveConfig, normaliseUrl };
