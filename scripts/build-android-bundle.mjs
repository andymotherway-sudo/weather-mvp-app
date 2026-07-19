import { spawnSync } from 'node:child_process';
import path from 'node:path';

const target = String(process.argv[2] || 'production').trim().toLowerCase();

const targetConfig = {
  development: {
    apiEnvironment: 'development',
    apiBase: 'https://omniwx-api.omniwx.workers.dev',
  },
  production: {
    apiEnvironment: 'production',
    apiBase: 'https://omniwx-api-production.omniwx.workers.dev',
  },
};

if (!(target in targetConfig)) {
  console.error(`Unsupported build target "${target}". Use "development" or "production".`);
  process.exit(1);
}

const selected = targetConfig[target];
const androidDir = path.join(process.cwd(), 'android');
const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

const result = spawnSync(gradleCmd, ['bundleRelease', '--console=plain'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    OMNIWX_API_ENV: selected.apiEnvironment,
    EXPO_PUBLIC_API_BASE: selected.apiBase,
    EXPO_PUBLIC_OMNIWX_API_BASE: selected.apiBase,
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
