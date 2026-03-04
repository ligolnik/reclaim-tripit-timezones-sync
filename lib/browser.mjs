import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const AUTH_DIR = '.auth';

export async function launchBrowser() {
  mkdirSync(AUTH_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(AUTH_DIR, {
    headless: false,
    slowMo: 100,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  return context;
}
