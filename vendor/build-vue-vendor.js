import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModulesRoot = resolve(root, '.codex-codemirror-build/node_modules');

function vendorVue() {
    const vuePackagePath = resolve(nodeModulesRoot, 'vue/package.json');
    const sourcePath = resolve(nodeModulesRoot, 'vue/dist/vue.esm-browser.prod.js');
    const outputPath = resolve(root, 'vendor/vue.esm-browser.prod.js');
    const metaPath = resolve(root, 'vendor/vue.vendor.json');

    const vuePackage = JSON.parse(readFileSync(vuePackagePath, 'utf8'));

    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(sourcePath, outputPath);
    writeFileSync(
        metaPath,
        `${JSON.stringify({
            package: 'vue',
            version: vuePackage.version,
            source: '.codex-codemirror-build/node_modules/vue/dist/vue.esm-browser.prod.js',
            output: 'vendor/vue.esm-browser.prod.js',
        }, null, 2)}\n`,
    );

    console.log(`Vendored Vue ${vuePackage.version} to ${outputPath}`);
}

function vendorVueDraggable() {
    const draggablePackagePath = resolve(nodeModulesRoot, 'vue-draggable-next/package.json');
    const sourcePath = resolve(nodeModulesRoot, 'vue-draggable-next/dist/vue-draggable-next.esm-bundler.js');
    const outputPath = resolve(root, 'vendor/vue-draggable-next.esm-browser.prod.js');
    const metaPath = resolve(root, 'vendor/vue-draggable-next.vendor.json');

    const draggablePackage = JSON.parse(readFileSync(draggablePackagePath, 'utf8'));

    mkdirSync(dirname(outputPath), { recursive: true });

    // Rewrite Vue import to our vendored Vue
    let content = readFileSync(sourcePath, 'utf8');
    content = content.replace(/from\s+['"]vue['"]/g, "from './vue.esm-browser.prod.js'");

    writeFileSync(outputPath, content);
    writeFileSync(
        metaPath,
        `${JSON.stringify({
            package: 'vue-draggable-next',
            version: draggablePackage.version,
            source: '.codex-codemirror-build/node_modules/vue-draggable-next/dist/vue-draggable-next.esm-bundler.js',
            output: 'vendor/vue-draggable-next.esm-browser.prod.js',
        }, null, 2)}\n`,
    );

    console.log(`Vendored vue-draggable-next ${draggablePackage.version} to ${outputPath}`);
}

vendorVue();
vendorVueDraggable();
