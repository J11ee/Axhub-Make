export const documentInsets = {
  top: 40,
  outer: 24,
  narrowOuter: 12,
  content: 24,
  compactContent: 16,
  compactViewport: 768,
  narrowViewport: 400,
} as const;

export function documentTypography(scope: string): string {
  return `
  ${scope} {
    font: 400 16px/1.6 system-ui, "Microsoft YaHei", sans-serif;
    color: #222325;
    overflow-wrap: break-word;
  }
  ${scope} :is(h1, h2, h3, h4, h5, h6) {
    color: inherit;
    line-height: inherit;
    margin: 0 0 .5em;
  }
  ${scope} h1 { font-size: 1.5em; font-weight: 700; margin-top: 3em; }
  ${scope} h2 { font-size: 1.25em; font-weight: 700; margin-top: 2.5em; }
  ${scope} h3 { font-size: 1.125em; font-weight: 600; margin-top: 2em; }
  ${scope} h4 { font-size: 1em; font-weight: 600; margin-top: 2em; }
  ${scope} :is(h5, h6) { font-size: 1em; font-weight: 500; }
  ${scope} :is(h1, h2, h3, h4):first-child,
  ${scope} .ProseMirror-widget + :is(h1, h2, h3, h4) { margin-top: 0; }
  ${scope} p { font: inherit; color: inherit; margin: 0 0 1em; }
  ${scope} p:not(:first-child):not(:is(li, td, th, blockquote) p) { margin-top: 20px; }
  ${scope} :is(ul, ol) { margin: 1.5em 0; padding: 0 0 0 1.5em; }
  ${scope} :is(ul, ol):first-child { margin-top: 0; }
  ${scope} :is(ul, ol):last-child { margin-bottom: 0; }
  ${scope} :is(ul, ol) :is(ul, ol) { margin-block: 0; }
  ${scope} ul:not([data-type="taskList"]) { list-style: disc; }
  ${scope} ul:not([data-type="taskList"]) ul { list-style: circle; }
  ${scope} ul:not([data-type="taskList"]) ul ul { list-style: square; }
  ${scope} ol { list-style: decimal; }
  ${scope} ol ol { list-style: lower-alpha; }
  ${scope} ol ol ol { list-style: lower-roman; }
  ${scope} li, ${scope} li + li { margin: 0; color: inherit; line-height: inherit; }
  ${scope} li::marker { font: inherit; color: inherit; }
  ${scope} :is(li, td, th) > p:only-child { margin: 0; }
  ${scope} blockquote {
    margin: 1.5em 0;
    padding: .375em 0 .375em .75em;
    border: 0;
    border-left: .25em solid currentColor;
    border-radius: 0;
    color: inherit;
    background: transparent;
  }
  ${scope} blockquote::before { content: none; }
  ${scope} blockquote:first-child { margin-top: 0; }
  ${scope} :is(th, td) {
    padding: .75em;
    border: 1px solid #e5e5e7;
    text-align: left;
    vertical-align: top;
    font-size: inherit;
  }
  ${scope} th { background: #f7f7f8; font-weight: 600; }
  ${scope} a { color: #008f5d; text-decoration: underline; }
  ${scope} code {
    font: .875em ui-monospace, Consolas, monospace;
    background: #f4f4f5;
    border: 1px solid #e5e5e7;
    border-radius: 6px;
    padding: .1em .2em;
  }
  ${scope} pre {
    margin: 1.5em 0;
    padding: 1em;
    background: #f4f4f5;
    border: 1px solid #e5e5e7;
    border-radius: 6px;
    overflow: auto;
  }
  ${scope} pre code { font-size: 1em; background: transparent; border: 0; padding: 0; }
  ${scope} img { display: inline-block; max-width: 100%; height: auto; margin: 0; border-radius: 0; }
  `;
}
