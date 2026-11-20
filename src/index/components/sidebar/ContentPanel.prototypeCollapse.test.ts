import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import ContentPanel from './ContentPanel';
import type { ItemData } from '../../types';

vi.mock('./OpenInDropdown', () => ({ default: () => null }));
vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: React.PropsWithChildren) => children,
    DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => children,
    DropdownMenuContent: ({ children }: React.PropsWithChildren) => children,
    DropdownMenuItem: (props: object) => React.createElement('test-menu-item', props),
    DropdownMenuLabel: () => null,
    DropdownMenuSeparator: () => null,
    DropdownMenuSub: () => null,
    DropdownMenuSubContent: () => null,
    DropdownMenuSubTrigger: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

it('collapses folders independently of the prototype tree and page branches', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', new EventTarget());
    const prototype: ItemData = {
        name: 'example', displayName: 'Example prototype', jsUrl: '', specUrl: '',
        pages: [
            { id: 'folder-page', title: 'Folder page' },
            { id: 'parent-page', title: 'Parent page' },
            { id: 'child-page', title: 'Child page' },
        ],
        pageTree: [
            { kind: 'group', id: 'outer', title: 'Outer folder', children: [
                { kind: 'group', id: 'inner', title: 'Inner folder', children: [
                    { kind: 'page', id: 'folder-page' },
                ] },
            ] },
            { kind: 'page', id: 'parent-page', children: [{ kind: 'page', id: 'child-page' }] },
        ],
    };
    const onItemClick = vi.fn();
    const onPrototypePageSelect = vi.fn();
    const props = {
        activeTab: 'prototype', activeProjectId: null, projectTitle: 'Project', projects: [],
        resourceWriteCapabilities: {}, items: [prototype], selectedItem: prototype,
        selectedPrototypePageId: 'folder-page', searchText: '',
        tree: [{ id: 'example', kind: 'item', title: prototype.displayName, itemKey: 'prototypes/example' }],
        onItemClick, onPrototypePageSelect,
    } as React.ComponentProps<typeof ContentPanel>;
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(React.createElement(ContentPanel, props)); });
    try {
        const clickArrow = (label: string) => {
            act(() => renderer.root.findByProps({ 'aria-label': label }).props.onClick({
                stopPropagation() {},
            }));
        };
        const visible = (title: string) => renderer.root.findAllByProps({ title }).length > 0;
        clickArrow('展开Parent page子页');
        expect(visible('Folder page')).toBe(true);
        expect(visible('Child page')).toBe(true);

        clickArrow('折叠原型');
        expect(visible('Outer folder')).toBe(false);
        expect(visible('Parent page')).toBe(false);
        clickArrow('展开原型');
        expect(visible('Folder page')).toBe(true);
        expect(visible('Child page')).toBe(true);

        const collapseFolders = renderer.root.find((node) => node.type === 'test-menu-item'
            && React.Children.toArray(node.props.children).includes('折叠所有文件夹'));
        expect(collapseFolders.props.disabled).toBe(false);
        act(() => collapseFolders.props.onSelect());
        expect(visible('Outer folder')).toBe(true);
        expect(visible('Inner folder')).toBe(false);
        expect(visible('Child page')).toBe(true);
        clickArrow('展开Outer folder');
        expect(visible('Inner folder')).toBe(true);
        expect(visible('Folder page')).toBe(false);
        expect(onItemClick).not.toHaveBeenCalled();
        expect(onPrototypePageSelect).not.toHaveBeenCalled();
    } finally {
        act(() => renderer.unmount());
    }
});
