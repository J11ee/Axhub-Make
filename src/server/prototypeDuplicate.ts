import fs from 'node:fs';
import path from 'node:path';

import { isResolvedProjectPathSafe } from './managementApi.projectRegistry.ts';
import { createPrototypePagePrdStore, relocateMarkdownLinks } from './prototypePagePrds.ts';
import { isPathInside, readPrototypeSidebarTitle, type ProjectMetadata } from './projectCore/index.ts';

type MetadataStore = {
  getMetadata: () => ProjectMetadata;
  saveMetadata: (metadata: ProjectMetadata) => ProjectMetadata;
};

const portablePath = (value: string) => value.split(path.sep).join('/');

export async function duplicatePrototype(projectRoot: string, prototypesDir: string, store: MetadataStore, sourceId: string) {
  const metadata = store.getMetadata();
  const source = metadata.resources.prototypes.find((entry) => entry.id === sourceId || entry.name === sourceId);
  const sourceDir = path.join(prototypesDir, sourceId);
  if (!source || !isResolvedProjectPathSafe(projectRoot, sourceDir) || !fs.lstatSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
    return null;
  }
  const records = Object.entries(createPrototypePagePrdStore(projectRoot, sourceDir).list());
  const missing = records.find(([, record]) => record.missing);
  if (missing) throw new Error(`需求文件不存在：${missing[1].path}`);

  const usedIds = new Set(metadata.resources.prototypes.flatMap((entry) => [entry.id.toLowerCase(), entry.name.toLowerCase()]));
  const usedTitles = new Set(metadata.resources.prototypes.map((entry) => entry.title));
  const sidebarTitle = readPrototypeSidebarTitle(projectRoot, sourceId);
  const generatedTitle = sourceId.replace(/[-_]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  const baseTitle = sidebarTitle && sidebarTitle !== sourceId && sidebarTitle !== generatedTitle
    ? sidebarTitle
    : source.title || sourceId;
  let number = 1;
  let id = `${sourceId}-copy`;
  let title = `${baseTitle}（副本）`;
  let targetDir = path.join(prototypesDir, id);
  while (usedIds.has(id.toLowerCase()) || usedTitles.has(title) || fs.lstatSync(targetDir, { throwIfNoEntry: false })) {
    number += 1;
    id = `${sourceId}-copy${number}`;
    title = `${baseTitle}（副本 ${number}）`;
    targetDir = path.join(prototypesDir, id);
  }

  fs.mkdirSync(targetDir);
  try {
    fs.cpSync(sourceDir, targetDir, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: (file) => {
        if (fs.lstatSync(file).isSymbolicLink()) {
          throw new Error(`原型包含无法独立复制的符号链接：${portablePath(path.relative(sourceDir, file))}`);
        }
        return file !== path.join(sourceDir, '.page-prds.json') && file !== path.join(sourceDir, '.page-prds.json.tmp');
      },
    });
    const targetPrds = createPrototypePagePrdStore(projectRoot, targetDir);
    for (const [pageId, record] of records) {
      const sourceFile = path.resolve(projectRoot, record.path);
      if (isPathInside(sourceDir, sourceFile)) {
        const targetFile = path.join(targetDir, path.relative(sourceDir, sourceFile));
        targetPrds.bind(pageId, portablePath(path.relative(projectRoot, targetFile)));
      } else {
        const targetFile = path.join(targetDir, 'docs', 'page-prd', pageId, path.basename(sourceFile));
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        const content = relocateMarkdownLinks(record.content, sourceFile, targetFile, projectRoot, (referencedFile) =>
          isPathInside(sourceDir, referencedFile)
            ? path.join(targetDir, path.relative(sourceDir, referencedFile))
            : referencedFile);
        fs.writeFileSync(targetFile, content, { flag: 'wx' });
        targetPrds.bind(pageId, portablePath(path.relative(projectRoot, targetFile)));
      }
    }

    const rebase = (value: string | undefined) => {
      if (!value) return undefined;
      const absolute = path.resolve(projectRoot, value);
      if (!isPathInside(sourceDir, absolute)) return undefined;
      const target = path.join(targetDir, path.relative(sourceDir, absolute));
      return path.isAbsolute(value) ? target : portablePath(path.relative(projectRoot, target));
    };
    store.saveMetadata({
      ...metadata,
      resources: {
        ...metadata.resources,
        prototypes: [...metadata.resources.prototypes, {
          ...source,
          id,
          name: id,
          title,
          clientUrl: `/prototypes/${encodeURIComponent(id)}`,
          filePath: rebase(source.filePath),
          absoluteFilePath: rebase(source.absoluteFilePath),
          specFilePath: rebase(source.specFilePath),
          updatedAt: new Date().toISOString(),
        }],
      },
      navigation: { ...metadata.navigation, prototypes: [...metadata.navigation.prototypes, id] },
    });
    return { id, title };
  } catch (error) {
    await fs.promises.rm(targetDir, { recursive: true, force: true });
    throw error;
  }
}
