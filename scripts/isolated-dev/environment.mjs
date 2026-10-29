import path from 'node:path';

// No copying of the parent environment. In particular, no Google/Firebase,
// Vercel, payment, Sentry, mail, GitHub token, proxy or NODE_OPTIONS inheritance.
export function isolatedBuildEnvironment(parent, runtime, defaultPubCache) {
  return {
    PATH: parent.PATH, LANG: 'en_US.UTF-8', CI: 'true',
    HOME: runtime, XDG_CONFIG_HOME: path.join(runtime, 'config'),
    XDG_CACHE_HOME: path.join(runtime, 'cache'), TMPDIR: runtime,
    PUB_CACHE: parent.PUB_CACHE || defaultPubCache,
    FLUTTER_SUPPRESS_ANALYTICS: 'true', DART_SUPPRESS_ANALYTICS: 'true',
  };
}
