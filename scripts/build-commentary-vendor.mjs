import { createRequire } from 'node:module';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild');
const vendor = fileURLToPath(new URL('../vendor/axhub-commentary/', import.meta.url));
const staging = await mkdtemp(path.join(tmpdir(), 'axhub-commentary-'));

try {
    // Build outside the vendored package's ESM boundary to preserve the upstream CommonJS output.
    await cp(path.join(vendor, 'src'), path.join(staging, 'src'), { recursive: true });
    const options = {
        absWorkingDir: staging,
        entryPoints: ['src/index.ts', 'src/prompt-card-skills.ts'],
        outdir: 'dist',
        bundle: true,
        write: false,
        jsx: 'automatic',
        target: 'es2020',
        tsconfigRaw: { compilerOptions: { useDefineForClassFields: false } },
        external: [
            '@ant-design/cssinjs', '@ant-design/icons', 'antd', 'axhub-export-core',
            'html-to-image', 'motion', 'overlayscrollbars', 'overlayscrollbars-react',
            'react', 'react-dom',
        ],
    };
    const esm = await build({
        ...options,
        format: 'esm',
        splitting: true,
        outExtension: { '.js': '.mjs' },
    });
    const cjs = await build({
        ...options,
        format: 'cjs',
        platform: 'node',
        tsconfigRaw: { compilerOptions: { ...options.tsconfigRaw.compilerOptions, alwaysStrict: true } },
    });
    for (const file of [...esm.outputFiles, ...cjs.outputFiles]) {
        const destination = path.join(vendor, 'dist', path.basename(file.path));
        const existing = await readFile(destination, 'utf8').catch((error) => {
            if (error.code !== 'ENOENT') throw error;
            return '';
        });
        if (existing.replace(/\r\n/g, '\n') !== file.text) {
            await writeFile(destination, file.contents);
        }
    }
} finally {
    await rm(staging, { recursive: true, force: true });
}
