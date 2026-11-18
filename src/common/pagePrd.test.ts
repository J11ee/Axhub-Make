import { describe, expect, it } from 'vitest';
import { buildPrototypePageSegments } from '../index/components/sidebar/prototypePageGroups';
import type { AnnotationDocumentDirectoryNode } from '../index/types';
import { buildPagePrdDirectory, pagePrdId, PRD_OVERVIEW_ID, PRD_PROTOTYPE_ID } from './pagePrd';

const scope = { projectId: 'project', targetPath: 'prototypes/demo' };
const pages = [{ id: 'board', title: '公文面板' }, { id: 'urge', title: '催办内容' }, { id: 'other', title: '其他' }];
const center = { kind: 'group', id: 'center', title: '公文中心', children: [
    { kind: 'page', id: 'board', children: [{ kind: 'page', id: 'urge' }] },
] } as const;

describe('page PRD projection', () => {
    it('numbers sections, grouping nodes and true pages even when a page has no binding', () => {
        const segments = buildPrototypePageSegments(scope.targetPath, pages, [
            { ...center, children: [{ kind: 'page', id: 'board', children: [{ kind: 'page', id: 'urge' }] }] },
            { kind: 'page', id: 'other' },
        ]);
        const record = { path: 'src/prototypes/demo/docs/board.md', content: '![图片](__ANNOTATION_IMAGE_ASSET__)' };
        const { nodes, entries, fullMarkdown } = buildPagePrdDirectory({ ...scope, pages: segments }, { board: record }, [{
            type: 'markdown', id: 'ordinary-board', title: '旧普通文档', markdownPath: 'docs/board.md',
            markdown: '![图片](/prototypes/demo/assets/asset.png)',
        }]);
        expect(nodes.map(({ title }) => title)).toEqual(['1. 产品总述', '2. 原型说明']);
        expect(nodes[0].children).toEqual([]);
        expect(nodes[1].children?.[0].title).toBe('2.1 公文中心');
        const board = nodes[1].children?.[0].children?.[0];
        expect(board?.title).toBe('2.1.1 公文面板');
        expect(board?.children?.map(({ title }) => title)).toEqual(['2.1.1 公文面板', '2.1.1.1 催办内容']);
        expect(fullMarkdown).toBe([
            '# 1. 产品总述', '# 2. 原型说明', '## 2.1 公文中心', '### 2.1.1 公文面板',
            '![图片](/prototypes/demo/assets/asset.png)', '#### 2.1.1.1 催办内容', '## 2.2 其他',
        ].join('\n\n'));
        expect(entries.find((entry) => entry.pageId === 'urge')).toMatchObject({ status: 'unbound', pageUrl: expect.stringContaining('pageId=urge') });
        expect(entries.find((entry) => entry.pageId === 'board')?.contentUrl).toContain('document-content?path=src%2Fprototypes%2Fdemo%2Fdocs%2Fboard.md');
    });

    it('keeps independent documents with their parent and anchor on prototype reorder', () => {
        const ordinary: AnnotationDocumentDirectoryNode[] = [{
            type: 'folder', id: 'folder', title: '旧文件夹', children: [{
                type: 'markdown', id: 'legacy', title: '旧需求', markdownPath: 'docs/legacy.md', markdown: '# 旧正文',
            }],
        }, {
            type: 'markdown', id: 'note', title: '独立需求', markdownPath: 'docs/note.md', markdown: '独立正文',
            prdPlacement: { parentId: PRD_PROTOTYPE_ID, beforeId: pagePrdId('board') },
        }, {
            type: 'markdown', id: 'nested', title: '页面下的独立需求', markdownPath: 'docs/nested.md', markdown: '补充正文',
            prdPlacement: { parentId: pagePrdId('board'), beforeId: pagePrdId('urge') },
        }];
        const prototype = buildPrototypePageSegments(scope.targetPath, pages, [
            { kind: 'page', id: 'other' },
            { kind: 'page', id: 'board', children: [{ kind: 'page', id: 'urge' }] },
        ]);
        const records = { other: { path: 'src/resources/other.md', content: '', missing: true } };
        const result = buildPagePrdDirectory({ ...scope, pages: prototype }, records, ordinary);
        expect(result.tree[1].children.map(({ id, number }) => [id, number])).toEqual([
            [pagePrdId('other'), '2.1'], ['note', '2.2'], [pagePrdId('board'), '2.3'],
        ]);
        expect(result.tree[1].children[2].children.map(({ id, number }) => [id, number])).toEqual([
            ['nested', '2.3.1'], [pagePrdId('urge'), '2.3.2'],
        ]);
        expect(result.entries.find(({ pageId }) => pageId === 'other')?.status).toBe('missing');
        expect(result.fullMarkdown).toContain('### 1.1.1 旧需求\n\n#### 旧正文');
        expect(result.fullMarkdown).toContain('## 2.2 独立需求\n\n独立正文');
        const reordered = buildPagePrdDirectory({ ...scope, pages: [prototype[1], prototype[0]] }, records, ordinary);
        expect(reordered.tree[1].children.map(({ id }) => id)).toEqual(['note', pagePrdId('board'), pagePrdId('other')]);
        const edited = buildPagePrdDirectory({ ...scope, pages: [prototype[0]] }, records, ordinary);
        expect(edited.tree[0].children.map(({ id }) => id)).toEqual(['folder', 'nested']);
        expect(edited.tree[1].children.map(({ id }) => id)).toEqual([pagePrdId('other'), 'note']);
        expect(edited.tree[0].id).toBe(PRD_OVERVIEW_ID);
    });
});
