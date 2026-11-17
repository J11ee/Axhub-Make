import { describe, expect, it } from 'vitest';
import { buildPrototypePageSegments } from '../index/components/sidebar/prototypePageGroups';
import { buildPagePrdDirectory, FULL_PRD_ID, pagePrdId } from './pagePrd';

describe('page PRD projection', () => {
    it('keeps preprocessed annotation images when an existing document becomes a page PRD', () => {
        const scene = { projectId: 'project', targetPath: 'prototypes/demo' };
        const pages = buildPrototypePageSegments('demo', [{ id: 'a', title: '页面' }]);
        const savedMarkdown = '![图片](__ANNOTATION_IMAGE_ASSET__)';
        const { nodes } = buildPagePrdDirectory({ ...scene, pages }, {
            a: { path: 'src/prototypes/demo/docs/a.md', content: savedMarkdown },
        }, [{
            type: 'markdown', id: 'ordinary-a', title: '旧普通文档', markdownPath: 'docs/a.md',
            markdown: '![图片](/prototypes/demo/assets/asset.png)',
        }]);
        expect(nodes).toHaveLength(2);
        expect(nodes.map((node) => node.markdown)).toEqual([
            '# 整篇 PRD\n\n## 页面\n\n![图片](/prototypes/demo/assets/asset.png)',
            '![图片](/prototypes/demo/assets/asset.png)',
        ]);
    });

    it('shares bound paths, retains empty parents and derives titles and order from the current route tree', () => {
        const paths = { projectId: 'project', targetPath: 'prototypes/demo' };
        const pages = buildPrototypePageSegments('demo',
            [{ id: 'parent', title: '空父页' }, { id: 'a', title: '已改名' }, { id: 'b', title: '已移动' }],
            [{ kind: 'page', id: 'b' }, { kind: 'page', id: 'parent', children: [{ kind: 'page', id: 'a' }] }],
        );
        const { nodes, entries } = buildPagePrdDirectory({ ...paths, pages }, {
            a: { path: 'src/prototypes/demo/docs/a.md', content: '| Row |\n| --- |\n| Cell |' },
            b: { path: 'src/resources/b.md', content: 'B BODY' },
            gone: { path: 'src/resources/gone.md', content: 'GONE BODY' },
        }, [
            { type: 'markdown', id: 'old-a', title: '旧标题', markdownPath: 'docs/a.md' },
            { type: 'markdown', id: 'ordinary', title: '普通', markdownPath: 'docs/ordinary.md' },
        ]);
        expect(nodes.map((node) => node.id)).toEqual([FULL_PRD_ID, pagePrdId('b'), 'make-page-prd:branch:parent', 'ordinary']);
        expect(nodes[0].markdown).toBe('# 整篇 PRD\n\n## 已移动\n\nB BODY\n\n## 空父页\n\n### 已改名\n\n| Row |\n| --- |\n| Cell |');
        expect(entries.find((entry) => entry.pageId === 'a')?.contentUrl).toContain('document-content?path=src%2Fprototypes%2Fdemo%2Fdocs%2Fa.md');
        expect(entries.find((entry) => entry.pageId === 'parent')?.contentUrl).toContain('page-prd?projectId=project');
        expect(entries.find((entry) => entry.pageId === 'a')?.pageUrl).toBe('/api/prototype-annotation/page-prd?projectId=project&targetPath=prototypes%2Fdemo&pageId=a');
    });
});
