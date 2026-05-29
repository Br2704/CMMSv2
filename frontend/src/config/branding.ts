const rawAppName = String(import.meta.env.VITE_APP_NAME || '').trim();
const rawAppShortName = String(import.meta.env.VITE_APP_SHORT_NAME || '').trim();
const rawAppCompany = String(import.meta.env.VITE_APP_COMPANY || '').trim();
const rawAppTagline = String(import.meta.env.VITE_APP_TAGLINE || '').trim();

export const APP_NAME = rawAppName || 'OptiX Maintenance Pro';
export const APP_SHORT_NAME = rawAppShortName || 'OptiX Maint - Pro';
export const APP_COMPANY = rawAppCompany || 'TamOptiX Technologies';
export const APP_TAGLINE = rawAppTagline || 'OptiX Maintenance Pro developed by TamOptiX Technologies';
export const APP_BROWSER_TITLE = `${APP_COMPANY} - CMMS`;
export const APP_SIDEBAR_TITLE = APP_SHORT_NAME;
export const APP_DEFAULT_THEME_COLOR = '#0f766e';
export const APP_DEFAULT_BACKGROUND_COLOR = '#ffffff';
export const APP_FAVICON_SVG = '/tamoptix/tamoptix-favicon.svg';
export const APP_FAVICON_PNG = '/tamoptix/tamoptix-favicon.png';
export const APP_LOGO_SVG = '/tamoptix/tamoptix-logo.svg';
export const APP_LOGO_PNG = '/tamoptix/tamoptix-logo.png';
