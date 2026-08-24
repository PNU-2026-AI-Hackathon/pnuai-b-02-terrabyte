import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const localGoogleServicesFile = join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    ?? (existsSync(localGoogleServicesFile) ? './google-services.json' : undefined);

  return {
    ...config,
    name: config.name ?? 'TerraByte',
    slug: config.slug ?? 'app',
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
