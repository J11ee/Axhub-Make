import fs from 'node:fs';
import path from 'node:path';
import { isResolvedProjectPathSafe, resolveProjectDocumentContentFile } from './managementApi.projectRegistry.ts';
import type { PagePrdRecord, PagePrdRecords } from '../common/pagePrdRecords.ts';
import { isPathInside } from './projectCore/safe-path.ts';

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
    assertAvailable(pageId, fs.realpathSync.native(file.path));
    writeBinding(pageId, file.projectRelativePath);
    return file.projectRelativePath;
  }

  function assertAvailable(pageId: string, realFile: string) {
    for (const [otherId, boundPath] of bindings) {
      if (otherId === pageId) continue;
      const other = resolveMarkdown(boundPath);
      if (fs.existsSync(other.path) && fs.realpathSync.native(other.path) === realFile) {
        throw new Error('该文档已关联到其他页面');
      }
    }
  }

  function writeBinding(pageId: string, documentPath: string | undefined) {
    const next = new Map(bindings);
    if (documentPath === undefined) next.delete(pageId);
    else next.set(pageId, documentPath);
    const temporaryPath = `${bindingsPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(Object.fromEntries(next), null, 2)}\n`, { flag: 'wx' });
    try {
      fs.renameSync(temporaryPath, bindingsPath);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
    if (documentPath === undefined) bindings.delete(pageId);
    else bindings.set(pageId, documentPath);
  }

  function associate(pageId: string, projectRelativePath: string) {
    if (!PAGE_ID.test(pageId)) throw new Error('Invalid page ID');
    const source = resolveMarkdown(projectRelativePath);
    if (!fs.lstatSync(source.path, { throwIfNoEntry: false })?.isFile()) {
      throw new Error('请选择存在的 Markdown 文件');
    }
    const realSource = fs.realpathSync.native(source.path);
    const realPrototype = fs.realpathSync.native(prototypeDir);
    assertAvailable(pageId, realSource);
    if (isPathInside(prototypeDir, source.path) && isPathInside(realPrototype, realSource)) {
      writeBinding(pageId, source.projectRelativePath);
      return source.projectRelativePath;
    }

    const prototypesDir = path.dirname(prototypeDir);
    const prototypeSiblings = fs.readdirSync(prototypesDir, { withFileTypes: true });
    for (const sibling of prototypeSiblings) {
      if (!sibling.isDirectory()) continue;
      const siblingDir = path.join(prototypesDir, sibling.name);
      if (path.relative(prototypeDir, siblingDir) === '') continue;
      const siblingBindings = path.join(siblingDir, BINDINGS_FILE);
      if (!fs.existsSync(siblingBindings)) continue;
      const paths = Object.values(JSON.parse(fs.readFileSync(siblingBindings, 'utf8')) as Record<string, string>);
      if (paths.some((value) => {
        const other = resolveProjectDocumentContentFile(projectRoot, value);
        return other && fs.existsSync(other.path) && fs.realpathSync.native(other.path) === realSource;
      })) {
        throw new Error('该文档已关联其他原型的页面，无法移动');
      }
    }
    if (isPathInside(fs.realpathSync.native(prototypesDir), realSource)) {
      throw new Error('该文档位于原型源码目录，请选择当前原型或项目文档目录中的 Markdown');
    }

    const targetDir = path.join(prototypeDir, 'docs', 'page-prd', pageId);
    if (!isResolvedProjectPathSafe(prototypeDir, targetDir)) {
      throw new Error('页面需求目录必须位于原型内');
    }
    const { name, ext, base } = path.parse(source.path);
    let targetPath = path.join(targetDir, base);
    for (let suffix = 2; fs.lstatSync(targetPath, { throwIfNoEntry: false }); suffix += 1) {
      targetPath = path.join(targetDir, `${name}-${suffix}${ext}`);
    }
    const target = resolveMarkdown(path.relative(projectRoot, targetPath));
    const original = bindings.get(pageId);
    const content = relocateMarkdownLinks(fs.readFileSync(source.path, 'utf8'), source.path, target.path, projectRoot,
      (referencedFile) => path.relative(source.path, referencedFile) === '' ? target.path : referencedFile);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(target.path, content, { flag: 'wx' });
    try {
      writeBinding(pageId, target.projectRelativePath);
      try {
        fs.unlinkSync(source.path);
        if (fs.lstatSync(source.path, { throwIfNoEntry: false })) throw new Error('文档原路径仍然存在');
      } catch (error) {
        writeBinding(pageId, original);
        throw error;
      }
    } catch (error) {
      if (bindings.get(pageId) !== target.projectRelativePath) fs.unlinkSync(target.path);
      throw error;
    }
    return target.projectRelativePath;
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
    associate, bind, read, save,
    isBound: (projectRelativePath: string) => [...bindings.values()].includes(projectRelativePath),
    list: (): PagePrdRecords => Object.fromEntries([...bindings].map(([pageId, binding]) => {
      if (!PAGE_ID.test(pageId)) throw new Error('Invalid page ID');
      return [pageId, readBinding(binding)];
    })),
  };
}

export function relocateMarkdownLinks(
  content: string,
  sourceFile: string,
  targetFile: string,
  projectRoot: string,
  mapReference: (file: string) => string,
): string {
  const relocate = (url: string) => {
    const [pathname] = url.split(/[?#]/u, 1);
    if (!pathname || /^(?:[a-z][a-z0-9+.-]*:|[/\\])/iu.test(pathname)) return url;
    let referencedFile: string;
    try {
      referencedFile = path.resolve(path.dirname(sourceFile), decodeURIComponent(pathname));
    } catch {
      return url;
    }
    if (!fs.existsSync(referencedFile) || !isResolvedProjectPathSafe(projectRoot, referencedFile)) return url;
    const target = path.relative(path.dirname(targetFile), mapReference(referencedFile)).split(path.sep).join('/');
    return target + url.slice(pathname.length);
  };

  return content.replace(
    /(\]\(\s*|^ {0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]+>|(?:[^\s()]|\([^\s()]*\))+)|\b(src|href)=(["'])([^"'\n]+)\4/gmu,
    (match, prefix: string | undefined, destination: string | undefined, attribute: string | undefined, quote: string | undefined, url: string | undefined) => {
      if (attribute && url) return `${attribute}=${quote}${relocate(url)}${quote}`;
      if (!destination) return match;
      const wrapped = destination.startsWith('<');
      const next = relocate(wrapped ? destination.slice(1, -1) : destination);
      return wrapped || /\s/u.test(next) ? `${prefix}<${next}>` : `${prefix}${next}`;
    },
  );
}
