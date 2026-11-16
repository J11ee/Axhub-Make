import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = new URL('../', import.meta.url);
const records = new URL('docs/customizations/', repo);
const archivePath = 'docs/customizations/changes/';
const archiveName = /^CUST-\d+\.md$/u;
const sourcePath = /^(?:src\/|client\/|bin\/|vendor\/|scripts\/|(?:package\.json|pnpm-[^/]+\.yaml|(?:vite|vitest|tsconfig)[^/]*\.(?:ts|json)|vendor-packages\.config\.json)$)/u;

function git(...args) {
    return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', ...args], {
        cwd: fileURLToPath(repo),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function changedPaths(base) {
    const flags = ['--no-ext-diff', '--no-renames', '--ignore-cr-at-eol', '--name-only', '-z'];
    return new Set([
        ...git('diff', ...flags, base, '--').split('\0'),
        ...git('diff', '--cached', ...flags, base, '--').split('\0'),
        ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0'),
    ].filter(Boolean));
}

function check(base) {
    const changes = changedPaths(base);
    const index = readFileSync(new URL('README.md', records), 'utf8');
    const rows = [...index.matchAll(/\|\s*\[(CUST-\d+)\]\(changes\/(CUST-\d+)\.md\)\s*\|/gu)];
    const files = readdirSync(new URL('changes/', records)).filter((name) => archiveName.test(name));
    const issues = [];
    const updatedScopes = new Set();
    const indexed = new Set();

    for (const [, id, target] of rows) {
        if (id !== target || !files.includes(`${target}.md`)) issues.push(`索引链接缺失或编号不匹配：${id} → ${target}`);
        if (indexed.has(id)) issues.push(`索引编号重复：${id}`);
        indexed.add(id);
    }

    for (const file of files) {
        const id = file.slice(0, -3);
        if (!indexed.has(id)) issues.push(`档案未加入索引：${id}`);
        const relativePath = archivePath + file;
        const body = readFileSync(new URL(relativePath, repo), 'utf8');
        if (!body.startsWith(`# ${id} `)) issues.push(`档案标题与文件编号不符：${id}`);
        if (!changes.has(relativePath)) continue;
        const scope = body.split(/^## 关联路径\s*$/mu)[1]?.split(/^## /mu)[0] ?? '';
        for (const [, path] of scope.matchAll(/^- `([^`]+)`\s*$/gmu)) updatedScopes.add(path);
    }

    const candidates = [...changes].filter((path) => sourcePath.test(path) && path !== 'scripts/check-customizations.mjs');
    for (const path of candidates) {
        const covered = updatedScopes.has(path) ||
            [...updatedScopes].some((scope) => scope.endsWith('/') && path.startsWith(scope));
        if (!covered) issues.push(`缺少本次更新的匹配档案：${path}`);
    }

    for (const issue of issues) console.error(issue);
    if (issues.length) {
        console.error('请核对档案、索引及关联路径。上游同步和机械维护按文档人工复核。');
        return 1;
    }
    console.log(`检查通过：${files.length} 份档案，${candidates.length} 个候选变更路径。请人工核对实际行为和豁免范围。`);
    return 0;
}

try {
    if (process.argv.length > 3) throw new Error('用法：node scripts/check-customizations.mjs [比较基线]');
    const base = git('rev-parse', '--verify', '--end-of-options', `${process.argv[2] ?? 'HEAD'}^{commit}`).trim();
    process.exitCode = check(base);
} catch (error) {
    console.error(`登记检查无法执行：${error.stderr?.trim() || error.message}`);
    process.exitCode = 2;
}
