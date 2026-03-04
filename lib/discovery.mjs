import { mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';

const SCREENSHOTS_DIR = 'screenshots';

export async function dumpPage(page, label) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const ts = Date.now();

  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${label}-${ts}.png`, fullPage: true });
  console.log(`  Screenshot saved: ${SCREENSHOTS_DIR}/${label}-${ts}.png`);

  const html = await page.content();
  await writeFile(`${SCREENSHOTS_DIR}/${label}-${ts}.html`, html);
  console.log(`  HTML saved: ${SCREENSHOTS_DIR}/${label}-${ts}.html`);

  // Dump a simplified DOM outline (tag, id, class, text snippet)
  const outline = await page.evaluate(() => {
    function walk(el, depth = 0) {
      if (!el || !el.tagName) return '';
      const indent = '  '.repeat(depth);
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string'
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : '';
      const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
        ? ` "${el.textContent.trim().slice(0, 80)}"`
        : '';
      let result = `${indent}<${el.tagName.toLowerCase()}${id}${cls}>${text}\n`;
      for (const child of el.children) {
        result += walk(child, depth + 1);
      }
      return result;
    }
    return walk(document.body);
  });
  await writeFile(`${SCREENSHOTS_DIR}/${label}-${ts}-outline.txt`, outline);
  console.log(`  DOM outline saved: ${SCREENSHOTS_DIR}/${label}-${ts}-outline.txt`);
}
