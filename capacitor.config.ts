import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.weldcalculator',
  appName: 'Weld Calculator',
  // Vite's build output (see vite.config.ts build.outDir).
  webDir: 'dist',
  backgroundColor: '#0a0c0f',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    // Bundled with @capacitor/core. Injects --safe-area-inset-* on Android WebViews with broken env() insets.
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
    },
  },
};

export default config;
