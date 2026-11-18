import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('pagePrdReader node visual and indentation alignment', () => {
  it('uses blue folder icon for empty folder nodes and monochrome file icon for content nodes', () => {
    const source = readFileSync(resolve(__dirname, './pagePrdReader.ts'), 'utf8');

    // 验证空节点使用页面需求蓝色图标（收起与展开状态）
    expect(source).toContain('function createFolderIcon(expanded: boolean)');
    expect(source).toContain("svg.style.color = '#2563eb'");
    expect(source).toContain("svg.style.fill = expanded ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.2)'");
    expect(source).toContain('function createFileIcon()');
    expect(source).toContain("svg.style.fill = 'none'");

    // 验证空节点（isFolder）与有内容节点（isPageBranch / leaf）的区分判断
    expect(source).toContain("const isFolder = type === 'folder' && !isPageBranch");
    expect(source).toContain('const icon = isFolder ? createFolderIcon(isExpanded) : createFileIcon()');
  });

  it('keeps nativeIcon as a 14px placeholder for leaf nodes to prevent indentation inversion (backspace issue)', () => {
    const source = readFileSync(resolve(__dirname, './pagePrdReader.ts'), 'utf8');

    // 验证不再直接 display: none 隐藏叶子节点的 nativeIcon，而是保留为不可见占位符，避免父子退格
    expect(source).not.toContain("if (nativeIcon && type !== 'folder') nativeIcon.style.display = 'none';");
    expect(source).toContain("if (nativeIcon && type !== 'folder') {");
    expect(source).toContain("nativeIcon.style.visibility = 'hidden'");
    expect(source).toContain("nativeIcon.style.width = '14px'");
    expect(source).toContain("nativeIcon.style.height = '14px'");
    expect(source).toContain("nativeIcon.style.flex = '0 0 14px'");
  });

  it('maintains consistent structure between branch nodes and leaf nodes', () => {
    const source = readFileSync(resolve(__dirname, './pagePrdReader.ts'), 'utf8');

    // 验证无论 folder 还是 leaf，第一列均为 14px（folder 为展开箭头，leaf 为占位符），紧跟插入的视觉 icon
    expect(source).toContain('nativeIcon.style.display = \'inline-flex\'');
    expect(source).toContain("nativeIcon.innerHTML = ''");
    expect(source).toContain('button.insertBefore(icon, button.querySelector(NODE_TITLE_SELECTOR))');
  });
});
