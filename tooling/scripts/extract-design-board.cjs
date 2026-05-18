// One-shot extractor for the M1.5b PR 1 Class Select Design Board HTML.
// Reads the self-extracting bundle at the path provided as argv[2], decodes
// the manifest's base64+gzip assets, resolves UUID references in the template,
// and writes each text/babel asset (the React component source) to ./.designboard-extracted/.
//
// Not wired into any pipeline — invoked manually during M1.5b PR 1 Implementation B
// to read the board source for the React port.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error('usage: node extract-design-board.cjs <html-path>');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

function extractScript(typeAttr) {
  const re = new RegExp(`<script type="${typeAttr}">([\\s\\S]*?)</script>`);
  const m = html.match(re);
  if (!m) throw new Error(`Could not find script type="${typeAttr}"`);
  return m[1].trim();
}

const manifest = JSON.parse(extractScript('__bundler/manifest'));
let template = JSON.parse(extractScript('__bundler/template'));

const outDir = path.join(path.dirname(htmlPath), '.designboard-extracted');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const decoded = {};
for (const uuid of Object.keys(manifest)) {
  const entry = manifest[uuid];
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) {
    bytes = zlib.gunzipSync(bytes);
  }
  decoded[uuid] = { mime: entry.mime, bytes };
  // Filename includes mime suffix so the user can browse the output.
  const mimeExt = (entry.mime || 'bin').split('/').pop().split(';')[0] || 'bin';
  const fname = `${uuid}.${mimeExt}`;
  fs.writeFileSync(path.join(outDir, fname), bytes);
}

// Re-resolve UUIDs in the template so the template makes textual sense
// when read (UUIDs become file paths).
for (const uuid of Object.keys(manifest)) {
  template = template.split(uuid).join(`./${uuid}.${(manifest[uuid].mime || 'bin').split('/').pop().split(';')[0]}`);
}
fs.writeFileSync(path.join(outDir, '_template.html'), template);

console.log(`extracted ${Object.keys(manifest).length} assets to ${outDir}`);
for (const uuid of Object.keys(manifest)) {
  console.log(`  ${uuid}  ${manifest[uuid].mime}  ${decoded[uuid].bytes.length} bytes`);
}
