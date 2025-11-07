import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

const ENV_FILES = [
  '.env',
  '.env.local',
  '.env.test',
  '.env.test.local',
  '.env.visual-editing',
  '.env.visual-editing.local',
  'test/.env',
  'test/.env.local'
] as const;

for (const file of ENV_FILES) {
  const filePath = join(process.cwd(), file);
  if (existsSync(filePath)) {
    config({ path: filePath, override: true });
  }
}
