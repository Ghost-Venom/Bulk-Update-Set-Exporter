// Bundle the React app into a single ES-module main.js for ServiceNow.
// ServiceNow sys_ux_lib_asset attachment. CSS imports are injected at runtime
// via a tiny plugin so the output mirrors the Vite-built original (single file,
// styles in <head>, no separate .css asset).

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'src/client/main.jsx');
const OUTFILE = path.join(ROOT, 'dist/main.js');

const cssInjectPlugin = {
    name: 'css-inject',
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
            const css = await fs.promises.readFile(args.path, 'utf8');
            const js = `
                const __css = ${JSON.stringify(css)};
                const __style = document.createElement('style');
                __style.setAttribute('data-source', ${JSON.stringify(path.basename(args.path))});
                __style.textContent = __css;
                document.head.appendChild(__style);
            `;
            return { contents: js, loader: 'js' };
        });
    },
};

esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    minify: true,
    outfile: OUTFILE,
    sourcemap: false,
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
    plugins: [cssInjectPlugin],
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
}).then((result) => {
    const stat = fs.statSync(OUTFILE);
    console.log(`Built ${path.relative(ROOT, OUTFILE)} — ${stat.size} bytes`);
    if (result.warnings.length) console.warn('warnings:', result.warnings);
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
