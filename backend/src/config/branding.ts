const rawAppName = process.env.APP_NAME?.trim();
const rawAppCompany = process.env.APP_COMPANY?.trim();
const rawAppTagline = process.env.APP_TAGLINE?.trim();

export const APP_NAME = rawAppName || 'OptiX Maintenance Pro';
export const APP_SHORT_NAME = process.env.APP_SHORT_NAME?.trim() || 'OptiX Maint - Pro';
export const APP_COMPANY = rawAppCompany || 'TamOptiX Technologies';
export const APP_TAGLINE = rawAppTagline || `Powered by ${APP_COMPANY}`;
export const APP_BROWSER_TITLE = `${APP_COMPANY} - CMMS`;
export const APP_SIDEBAR_TITLE = APP_SHORT_NAME;
export const APP_DEFAULT_THEME_COLOR = '#0f766e';
export const APP_DEFAULT_BACKGROUND_COLOR = '#ffffff';
