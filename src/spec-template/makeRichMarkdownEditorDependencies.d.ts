declare module '@tiptap/core' {
    export const Mark: { create(config: any): any };
    export function mergeAttributes(...attributes: any[]): Record<string, unknown>;
    export class Editor {
        constructor(options: any);
        commands: Record<string, (...args: any[]) => boolean>;
        getJSON(): any;
        getMarkdown(): string;
        destroy(): void;
    }
}

declare module '@tiptap/extension-highlight' {
    export const Highlight: { extend(config: any): { configure(options: any): any } };
}

declare module '@tiptap/extension-table' {
    export const TableKit: { extend(config: any): any };
}

declare module '@tiptap/markdown' {
    export const Markdown: any;
}

declare module '@tiptap/starter-kit' {
    export const StarterKit: any;
}

declare module 'tiptap-editor?make-document-editor' {
    export { SimpleEditor, type SimpleEditorProps } from 'tiptap-editor';
}
