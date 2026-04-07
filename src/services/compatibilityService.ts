import { CompatibilitySettings } from '@/types/settings.types';

export interface CompatibilityStatus {
  isCompatible: boolean;
  warningLevel: 'none' | 'info' | 'warning' | 'error';
  message: string | null;
}

export function checkBrowserCompatibility(
  browserName: string,
  browserVersion: string,
  settings: CompatibilitySettings | null
): CompatibilityStatus {
  // Geen settings = geen check
  if (!settings) {
    return { isCompatible: true, warningLevel: 'none', message: null };
  }

  const browserConfig = settings.calycompta.browsers[browserName];
  const versionNumber = parseFloat(browserVersion);

  // Browser niet in config = unsupported
  if (!browserConfig || browserConfig.status === 'unsupported') {
    return {
      isCompatible: false,
      warningLevel: 'error',
      message: settings.messages.unsupported
    };
  }

  // Browser is untested
  if (browserConfig.status === 'untested') {
    return {
      isCompatible: true,
      warningLevel: 'info',
      message: settings.messages.browserUntested
    };
  }

  // Check minimum supported versie
  if (browserConfig.minSupported && versionNumber < browserConfig.minSupported) {
    return {
      isCompatible: false,
      warningLevel: 'error',
      message: settings.messages.unsupported
    };
  }

  // Check recommended versie
  if (browserConfig.minRecommended && versionNumber < browserConfig.minRecommended) {
    return {
      isCompatible: true,
      warningLevel: 'warning',
      message: settings.messages.warning
    };
  }

  return { isCompatible: true, warningLevel: 'none', message: null };
}

export function checkMemberBrowserCompatibility(
  member: any,
  settings: CompatibilitySettings | null
): CompatibilityStatus {
  if (!member?.browser_name || !member?.browser_version) {
    return { isCompatible: true, warningLevel: 'none', message: null };
  }

  return checkBrowserCompatibility(
    member.browser_name,
    member.browser_version,
    settings
  );
}
