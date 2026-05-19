/**
 * Platform abstraction layer for CMMSv2
 * Handles detection and behavior differences between Web, PWA, and Native (Capacitor)
 */

export const isBrowser = typeof window !== 'undefined';

export const isIOS = isBrowser && /iPhone|iPad|iPod/i.test(navigator.userAgent);
export const isAndroid = isBrowser && /Android/i.test(navigator.userAgent);
export const isMobile = isIOS || isAndroid;

export const isPWA = isBrowser && (
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true ||
  document.referrer.includes('android-app://')
);

// This will be true when running inside a Capacitor/Cordova wrapper
export const isNative = isBrowser && (window as any).Capacitor !== undefined;

export const getPlatform = () => {
  if (isNative) return 'native';
  if (isPWA) return 'pwa';
  return 'web';
};

/**
 * Safe storage wrapper that handles platform-specific storage engines
 */
export const platformStorage = {
  get: (key: string) => isBrowser ? localStorage.getItem(key) : null,
  set: (key: string, value: string) => isBrowser && localStorage.setItem(key, value),
  remove: (key: string) => isBrowser && localStorage.removeItem(key),
};

/**
 * Trigger Haptic Feedback if available (Native only)
 */
export const triggerHaptic = (style: 'impact' | 'notification' | 'selection' = 'selection') => {
  if (isNative && (window as any).Capacitor?.Plugins?.Haptics) {
    (window as any).Capacitor.Plugins.Haptics.impact({ style });
  } else if (isBrowser && 'vibrate' in navigator) {
    // Subtle vibration for web/pwa
    navigator.vibrate(style === 'impact' ? 20 : 10);
  }
};
