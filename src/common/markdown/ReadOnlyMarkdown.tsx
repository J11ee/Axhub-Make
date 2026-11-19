import { Mermaid } from '@ant-design/x';
import { XMarkdown } from '@ant-design/x-markdown';
import type { ComponentProps, XMarkdownProps } from '@ant-design/x-markdown';
import '@ant-design/x-markdown/themes/light.css';

import { MarkdownImage, type MarkdownImageProps } from './markdownImage';
import { renderLegacyMarkdownHighlights } from './markdownHighlight';

export interface ReadOnlyMarkdownProps {
  content: string;
  documentUrl?: string;
  components?: XMarkdownProps['components'];
  className?: string;
}

export function MarkdownCode(props: ComponentProps) {
  const { className, children } = props;
  const lang = className?.match(/language-(\w+)/u)?.[1] || '';

  if (typeof children !== 'string') return null;

  if (lang === 'mermaid') {
    return <Mermaid>{children}</Mermaid>;
  }

  return <code className={className}>{children}</code>;
}

function MarkdownHighlight(props: ComponentProps) {
  const color = props['data-color'];
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/iu.test(color)) {
    return <mark>{props.children}</mark>;
  }
  return <mark data-color={color} style={{ backgroundColor: color, color: 'inherit' }}>{props.children}</mark>;
}

export function ReadOnlyMarkdown({
  content,
  documentUrl,
  components,
  className,
}: ReadOnlyMarkdownProps) {
  const resolvedComponents = {
    code: MarkdownCode,
    mark: MarkdownHighlight,
    img: (props: ComponentProps) => (
      <MarkdownImage {...props as MarkdownImageProps} documentUrl={documentUrl} />
    ),
    ...components,
  };

  return (
    <XMarkdown
      className={['axhub-readonly-markdown', 'x-markdown-light', className].filter(Boolean).join(' ')}
      content={renderLegacyMarkdownHighlights(content)}
      components={resolvedComponents}
    />
  );
}
