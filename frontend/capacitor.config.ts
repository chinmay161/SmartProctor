import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.smartproctor.exam',
  appName: 'SmartProctor',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      style: 'DEFAULT',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
