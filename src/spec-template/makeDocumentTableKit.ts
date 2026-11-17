import { TableKit as BaseTableKit } from '@tiptap/extension-table';
import { MarkdownTextColor } from './markdownTextColor';

export const TableKit = BaseTableKit.extend({
    addExtensions() {
        return [...(this.parent?.() ?? []), MarkdownTextColor];
    },
});

export const MakeDocumentTableKit = TableKit;
