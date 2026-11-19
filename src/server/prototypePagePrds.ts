import fs from 'node:fs';
import path from 'node:path';
import { isResolvedProjectPathSafe, resolveProjectDocumentContentFile } from './managementApi.projectRegistry.ts';
import type { PagePrdRecord, PagePrdRecords } from '../common/pagePrdRecords.ts';

const PAGE_ID = /^[a-z0-9-]+$/u;
const BINDINGS_FILE = '.page-prds.json';

export function createPrototypePagePrdStore(projectRoot: string, prototypeDir: string) {
  const bindingsPath = path.join(prototypeDir, BINDINGS_FILE);
  if (!fs.existsSync(prototypeDir) || !isResolvedProjectPathSafe(projectRoot, bindingsPath)) {
    throw new Error('Invalid prototype directory');
  }
  const bindings = new Map<string, string>(fs.existsSync(bindingsPath)
    ? Object.entries(JSON.parse(fs.readFileSync(bindingsPath, 'utf8')) as Record<string, string>)
    : []);

  const resolveMarkdown = (relativePath: string) => {
    const file = resolveProjectDocumentContentFile(projectRoot, relativePath);
    if (!file || !file.projectRelativePath.toLowerCase().endsWith('.md')) {
      throw new Error('请选择项目内的 Markdown 文件');
    }
    return file;
  };

  function bind(pageId: string, projectRelativePath: string) {
    if (!PAGE_ID.test(pageId)) throw new Error('Invalid page ID');
    const file = resolveMarkdown(projectRelativePath);
    if (!fs.existsSync(file.path) || !fs.statSync(file.path).isFile()) {
      throw new Error('关联的 Markdown 文件不存在');
    }
    const realFile = fs.realpathSync.native(file.path);
    for (const [otherId, boundPath] of bindings) {
      if (otherId === pageId) continue;
      const other = resolveMarkdown(boundPath);
      if (fs.existsSync(other.path) && fs.realpathSync.native(other.path) === realFile) {
        throw new Error('该文档已关联到其他页面');
      }
    }
    bindings.set(pageId, file.projectRelativePath);
    const temporaryPath = `${bindingsPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(Object.fromEntries(bindings), null, 2)}\n`, { flag: 'wx' });
    try {
      fs.renameSync(temporaryPath, bindingsPath);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
    return file.projectRelativePath;
  }

  function readBinding(binding: string): PagePrdRecord {
    const file = resolveMarkdown(binding);
    const exists = fs.existsSync(file.path) && fs.statSync(file.path).isFile();
    return { path: file.projectRelativePath, content: exists ? fs.readFileSync(file.path, 'utf8') : '', missing: !exists };
  }

  function read(pageId: string) {
    if (!PAGE_ID.test(pageId)) throw new Error('Invalid page ID');
    const binding = bindings.get(pageId);
    return binding ? readBinding(binding) : { content: '' };
  }

  function save(pageId: string, content: string) {
    if (!PAGE_ID.test(pageId)) throw new Error('Invalid page ID');
    const binding = bindings.get(pageId);
    if (binding) {
      const file = resolveMarkdown(binding);
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      fs.writeFileSync(file.path, content, 'utf8');
      return file.projectRelativePath;
    }
    const relativePrototype = path.relative(projectRoot, prototypeDir).split(path.sep).join('/');
    const file = resolveMarkdown(`${relativePrototype}/docs/page-prd/${pageId}.md`);
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, content, { encoding: 'utf8', flag: 'wx' });
    try {
      return bind(pageId, file.projectRelativePath);
    } catch (error) {
      fs.rmSync(file.path, { force: true });
      throw error;
    }
  }

  return {
    bind, read, save,
    isBound: (projectRelativePath: string) => [...bindings.values()].includes(projectRelativePath),
    list: (): PagePrdRecords => Object.fromEntries([...bindings].map(([pageId, binding]) => {
      if (!PAGE_ID.test(pageId)) throw new Error('Invalid page ID');
      return [pageId, readBinding(binding)];
    })),
  };
}
