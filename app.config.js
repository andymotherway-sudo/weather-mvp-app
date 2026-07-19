const baseConfig = require('./app.json');

const DEV_API_BASE = 'https://omniwx-api.omniwx.workers.dev';
const PROD_API_BASE = 'https://omniwx-api-production.omniwx.workers.dev';

function trimTrailingSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveApiEnvironment() {
  const explicit = String(process.env.OMNIWX_API_ENV || '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'prod' || explicit === 'release') return 'production';
  if (explicit === 'development' || explicit === 'dev' || explicit === 'preview') return 'development';

  const profile = String(process.env.EAS_BUILD_PROFILE || '').trim().toLowerCase();
  if (profile === 'production') return 'production';
  return 'development';
}

function resolveApiBase(apiEnvironment) {
  const explicit = trimTrailingSlashes(
    process.env.EXPO_PUBLIC_OMNIWX_API_BASE || process.env.EXPO_PUBLIC_API_BASE,
  );
  if (explicit) return explicit;
  return apiEnvironment === 'production' ? PROD_API_BASE : DEV_API_BASE;
}

module.exports = () => {
  const expo = baseConfig.expo;
  const apiEnvironment = resolveApiEnvironment();
  const apiBaseUrl = resolveApiBase(apiEnvironment);

  return {
    ...expo,
    extra: {
      ...expo.extra,
      apiBaseUrl,
      apiEnvironment,
      buildProfile: process.env.EAS_BUILD_PROFILE || null,
    },
  };
};
