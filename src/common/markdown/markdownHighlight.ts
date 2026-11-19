export const DEFAULT_MARKDOWN_HIGHLIGHT = '#fef9c3';

export function markdownHighlightTag(color: string): string {
    return `<mark data-color="${color}" style="background-color: ${color}; color: inherit">`;
}

export function renderLegacyMarkdownHighlights(markdown: string): string {
    if (!markdown.includes('==')) return markdown;

    // Skip code fences (including list and quote continuations), code spans,
    // escaped delimiters and HTML tags before looking for legacy highlights.
    const inline = /(?<!`)(`+)(?!`)[^\r\n]*?(?<!`)\1(?!`)|\\[\\=]|<[^<>\r\n]*>|(?<![=])==((?:<span\b[^<>\r\n]*>|<(?!span\b)|[^=<\r\n])+)==(?![=])/giu;
    let fence: string | undefined;
    return markdown.split(/(\r?\n)/u).map((line) => {
        const marker = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})(.*)$/u.exec(line);
        if (marker && (!fence || (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()))) {
            fence = fence ? undefined : marker[1];
            return line;
        }
        if (fence) return line;
        return line.replace(inline, (match, _code: string | undefined, content: string | undefined) =>
            content?.trim() ? `${markdownHighlightTag(DEFAULT_MARKDOWN_HIGHLIGHT)}${content}</mark>` : match);
    }).join('');
}
