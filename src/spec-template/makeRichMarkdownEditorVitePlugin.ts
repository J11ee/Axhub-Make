import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const editorModuleQuery = 'make-document-editor';
const documentEditorImport = `tiptap-editor?${editorModuleQuery}`;
const featureDirectory = path.dirname(fileURLToPath(import.meta.url));
const documentTableKitPath = path.join(featureDirectory, 'makeDocumentTableKit.ts');

function withoutQuery(id: string): string {
    return id.split('?', 1)[0].replace(/\\/gu, '/');
}

function isFeatureSource(importer: string, featureDirectoryPath: string): boolean {
    return withoutQuery(importer).startsWith(`${featureDirectoryPath.replace(/\\/gu, '/')}/`);
}

/**
 * Creates an isolated Make PRD editor module. Other SimpleEditor users keep
 * the unmodified vendor entry and its original extension list.
 */
export function makeRichMarkdownEditorVitePlugin(): Plugin {
    let vendorEditorEntry: string | null = null;

    return {
        name: 'axhub-make-rich-markdown-editor',
        enforce: 'pre',
        async resolveId(source, importer) {
            if (source === documentEditorImport) {
                if (!importer) return null;
                const resolved = await this.resolve('tiptap-editor', importer, { skipSelf: true });
                if (!resolved || resolved.external) return null;
                vendorEditorEntry = withoutQuery(resolved.id);
                return `${vendorEditorEntry}?${editorModuleQuery}`;
            }

            if (!importer) return null;
            const normalizedImporter = withoutQuery(importer);

            const isDocumentEditorImporter = importer.startsWith(`${vendorEditorEntry}?${editorModuleQuery}`);
            if (vendorEditorEntry && normalizedImporter === vendorEditorEntry && isDocumentEditorImporter) {
                if (source === '@tiptap/extension-table') return documentTableKitPath;
                return null;
            }

            if (isFeatureSource(importer, featureDirectory) && source.startsWith('@tiptap/')) {
                if (!vendorEditorEntry) {
                    const resolved = await this.resolve('tiptap-editor', importer, { skipSelf: true });
                    if (!resolved || resolved.external) return null;
                    vendorEditorEntry = withoutQuery(resolved.id);
                }
                const resolved = await this.resolve(source, vendorEditorEntry, { skipSelf: true });
                return resolved?.id ?? null;
            }

            return null;
        },
    };
}
