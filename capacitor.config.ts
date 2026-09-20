import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.iptvnator.firetv',
    appName: 'IPTVnator',
    webDir: 'dist/apps/web',
    server: {
        androidScheme: 'https',
        cleartext: true,
    },
    plugins: {
        CapacitorHttp: {
            enabled: true,
        },
    },
};

export default config;
