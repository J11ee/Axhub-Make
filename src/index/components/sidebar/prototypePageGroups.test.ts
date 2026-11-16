import { describe, expect, it } from 'vitest';

import {
  buildPrototypePageSegments,
  findPrototypePageAncestorKeys,
  getPrototypePageBranchKeys,
  normalizePrototypePageTree,
} from './prototypePageGroups';

describe('prototype page groups', () => {
  it('keeps ungrouped pages flat and combines only adjacent matching groups', () => {
    const segments = buildPrototypePageSegments('shop', [
      { id: 'dashboard', title: '工作台' },
      { id: 'orders', title: '订单列表', group: '订单管理' },
      { id: 'order-detail', title: '订单详情', group: '订单管理' },
      { id: 'help', title: '帮助' },
      { id: 'returns', title: '退货列表', group: '订单管理' },
    ]);

    expect(segments.map(({ key }) => key)).toEqual([
      'shop:page:dashboard', 'shop:group:1', 'shop:page:help', 'shop:group:4',
    ]);
    expect(segments[1].children.map(({ key }) => key)).toEqual(['shop:page:orders', 'shop:page:order-detail']);
    expect(segments[3].children.map(({ key }) => key)).toEqual(['shop:page:returns']);
  });

  it('trims group labels and treats blank labels as ungrouped', () => {
    const [group, page] = buildPrototypePageSegments('shop', [
      { id: 'orders', title: '订单列表', group: '  订单管理  ' },
      { id: 'customers', title: '客户列表', group: '   ' },
    ]);
    expect(group).toMatchObject({ kind: 'group', title: '订单管理' });
    expect(page).toMatchObject({ kind: 'page', page: { id: 'customers', title: '客户列表' } });
  });

  it('finds the independent group segment containing the active page', () => {
    const segments = buildPrototypePageSegments('shop', [
      { id: 'orders', title: '订单列表', group: '订单管理' },
      { id: 'help', title: '帮助' },
      { id: 'returns', title: '退货列表', group: '订单管理' },
    ]);

    expect(findPrototypePageAncestorKeys(segments, 'orders')).toEqual(['shop:group:0']);
    expect(findPrototypePageAncestorKeys(segments, 'returns')).toEqual(['shop:group:2']);
    expect(findPrototypePageAncestorKeys(segments, 'help')).toEqual([]);
    expect(findPrototypePageAncestorKeys(segments, null)).toEqual([]);
  });

  it('preserves nested groups, clickable parents and registered pages omitted from the tree', () => {
    const pages = [
      { id: 'list', title: '审批流管理' },
      { id: 'create', title: '新建审批流' },
      { id: 'print', title: '打印1' },
    ];
    const tree = normalizePrototypePageTree([
      { kind: 'group', id: 'center', title: '公文中心', children: [
        { kind: 'group', id: 'config', title: '公文配置', children: [
          { kind: 'page', id: 'list', children: [
            { kind: 'page', id: 'create' },
            { kind: 'page', id: 'missing' },
          ] },
        ] },
      ] },
      { kind: 'page', id: 'list' },
    ], pages);
    const segments = buildPrototypePageSegments('documents', pages, tree);

    expect(segments.map(({ key }) => key)).toEqual(['documents:folder:center', 'documents:page:print']);
    expect(getPrototypePageBranchKeys(segments)).toEqual([
      'documents:folder:center', 'documents:folder:config', 'documents:page:list',
    ]);
    expect(findPrototypePageAncestorKeys(segments, 'create')).toEqual([
      'documents:folder:center', 'documents:folder:config', 'documents:page:list',
    ]);
    expect(findPrototypePageAncestorKeys(segments, 'list')).toEqual([
      'documents:folder:center', 'documents:folder:config',
    ]);
    expect(normalizePrototypePageTree([{ kind: 'page', id: 'missing' }], pages)).toBeUndefined();
  });

});
