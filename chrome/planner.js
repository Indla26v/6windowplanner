import { mountApp } from './shared/ui/app.js';
import { storage, inExtension, detectReset } from './storage.js';

mountApp(document.getElementById('app'), {
  storage,
  hooks: inExtension
    ? {
        detectReset,
        detectHint: 'Reads the weekly reset and usage % from claude.ai using the account you are signed in with in this browser. The data stays in this extension.',
      }
    : {},
});
