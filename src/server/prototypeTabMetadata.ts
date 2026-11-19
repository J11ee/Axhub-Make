import fs from 'node:fs';
import { createProjectMetadataStore, readPrototypeSidebarTitle } from './projectCore/index.ts';

const makeFavicon = new URL('../../assets/images/favicon.ico', import.meta.url);

export function getPrototypeTabTitle(projectRoot: string, entryName: string, displayName?: string): string {
  const sidebarTitle = readPrototypeSidebarTitle(projectRoot, entryName);
  if (sidebarTitle) return `${sidebarTitle}原型`;
  const prototype = displayName ? undefined : createProjectMetadataStore(projectRoot).getMetadata()
    .resources.prototypes.find((item) => item.id === entryName || item.name === entryName);
  return `${displayName?.trim() || prototype?.title || entryName}原型`;
}

export function getPrototypeFaviconLink(): string {
  const icon = fs.readFileSync(makeFavicon).toString('base64');
  return `<link rel="icon" type="image/png" href="data:image/png;base64,${icon}">`;
}
