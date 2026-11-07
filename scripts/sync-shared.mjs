// Copy shared/ into each extension (browsers and VS Code only load files inside the extension folder).
import { cpSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'shared');
const targets = [join(root, 'chrome', 'shared'), join(root, 'vscode', 'media', 'shared')];

for (const dest of targets) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`synced shared/ → ${dest.replace(root, '.')}`);
}
// Lets VS Code's Node runtime import the engine as an ES module.
writeFileSync(join(root, 'vscode', 'media', 'shared', 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');

// Claude Code Desktop mod: it bundles the planning engine (no UI files needed).
for (const f of ['engine.js', 'countries.js']) {
  cpSync(join(src, f), join(root, 'claude-desktop-mod', 'hooks', 'lib', f));
}
console.log('synced engine → ./claude-desktop-mod/hooks/lib');
