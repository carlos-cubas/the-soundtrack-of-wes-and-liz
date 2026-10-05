import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.samiracubas.wesandliz',
  appName: 'Wes & Liz',
  webDir: 'dist',
  // Sunny yellow from the book cover, shown behind the web view while it loads.
  backgroundColor: '#f8de4f',
  ios: {
    // The game draws edge to edge and handles safe areas itself.
    contentInset: 'never',
    // No rubber-band scrolling or link previews: it is a game, not a page.
    scrollEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
  },
  plugins: {
    // Hide the status bar and auto-hide the home indicator.
    SystemBars: { hidden: true },
  },
};

export default config;
