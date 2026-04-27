import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const command =
  process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', 'pnpm exec tailwindcss -i index.css -o static-tailwind.css --minify']]
    : ['pnpm', ['exec', 'tailwindcss', '-i', 'index.css', '-o', 'static-tailwind.css', '--minify']];

execFileSync(command[0], command[1], { cwd: root, stdio: 'inherit' });

const outputPath = join(root, 'static-tailwind.css');
const originalCss = readFileSync(outputPath, 'utf8');
const fontFileNames = [...originalCss.matchAll(/url\(\.\/files\/([^)]+)\)/g)].map((match) => match[1]);
const uniqueFontFileNames = [...new Set(fontFileNames)];
const fontOutputDir = join(root, 'assets', 'fonts');
const fontSourceDirs = [
  join(root, 'node_modules', '@fontsource', 'plus-jakarta-sans', 'files'),
  join(root, 'node_modules', '@fontsource', 'jetbrains-mono', 'files'),
];

mkdirSync(fontOutputDir, { recursive: true });

for (const fileName of uniqueFontFileNames) {
  let copied = false;

  for (const sourceDir of fontSourceDirs) {
    try {
      copyFileSync(join(sourceDir, fileName), join(fontOutputDir, fileName));
      copied = true;
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  if (!copied) {
    throw new Error(`Unable to find Fontsource asset: ${fileName}`);
  }
}

writeFileSync(outputPath, originalCss.replaceAll('url(./files/', 'url(./assets/fonts/'));
