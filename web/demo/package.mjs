/**
 * Packages the built walkthrough into one self-contained HTML file.
 *
 * The artifact host blocks every external request, so the CSS, the JS and all four font
 * files have to travel inside the document. Fonts become data URIs inside the stylesheet;
 * the stylesheet and the bundle become inline tags. The result is a single file that runs
 * with the network switched off.
 *
 *   node demo/package.mjs   (after: npx vite build --config vite.demo.config.ts)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const DIST = resolve('demo-dist')
const read = (name) => readFileSync(resolve(DIST, name), 'utf8')

let css = read('index.css')
const js = read('demo.js')
// Vite keeps the entry's directory in the output tree.
let html = read('demo/index.html')

// url(./Font.ttf) → url(data:font/ttf;base64,…)
css = css.replace(/url\(([^)]+\.ttf)\)/g, (_match, path) => {
  const bytes = readFileSync(resolve(DIST, basename(path.replace(/["']/g, ''))))
  return `url(data:font/ttf;base64,${bytes.toString('base64')})`
})

html = html
  .replace(/\s*<script type="module"[^>]*><\/script>/, '')
  .replace(/\s*<link rel="stylesheet"[^>]*>/, '')
  .replace('</head>', `  <style>\n${css}\n  </style>\n  </head>`)
  .replace('</body>', `  <script type="module">\n${js}\n  </script>\n  </body>`)

const out = resolve(DIST, 'gsih-walkthrough.html')
writeFileSync(out, html)
console.log(`${out} — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`)

/*
 * A second copy as a body fragment.
 *
 * The artifact host supplies its own doctype, head and body and wraps whatever it is
 * given, so publishing the full document above would nest one page inside another. This
 * emits the same style, root and script without the shell around them.
 */
// Assembled from the same pieces rather than sliced out of the document above. Cutting
// the string is what it looks like it should be, and it is wrong twice over: React's
// minified bundle contains the literal "</body>", and any slice wide enough to keep the
// whole script also drags `</head><body>` along with it.
const fragment = [
  `<style>\n${css}\n</style>`,
  '<div id="root"></div>',
  `<script type="module">\n${js}\n</script>`,
].join('\n')
const fragmentOut = resolve(DIST, 'gsih-walkthrough.fragment.html')
writeFileSync(fragmentOut, fragment)
console.log(`${fragmentOut} — ${(Buffer.byteLength(fragment) / 1024 / 1024).toFixed(2)} MB`)
