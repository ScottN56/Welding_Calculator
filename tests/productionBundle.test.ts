import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const verifierPath = join(process.cwd(), 'scripts', 'verify-production-bundle.mjs');
let temporaryRoot: string | undefined;

function runVerifier(): ReturnType<typeof spawnSync> {
  if (!temporaryRoot) throw new Error('Test directory has not been created');
  return spawnSync(process.execPath, [join(temporaryRoot, 'scripts', 'verify-production-bundle.mjs')], {
    cwd: temporaryRoot,
    encoding: 'utf8',
  });
}

function createProductionTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'weld-production-bundle-'));
  temporaryRoot = root;
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
  copyFileSync(verifierPath, join(root, 'scripts', 'verify-production-bundle.mjs'));
  return root;
}

afterEach(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe('production bundle verifier', () => {
  it('accepts clean text assets', () => {
    const root = createProductionTree();
    writeFileSync(join(root, 'dist', 'index.html'), '<main>Weld Calculator</main>');
    writeFileSync(join(root, 'dist', 'assets', 'app.js'), 'export const ready = true;');
    writeFileSync(join(root, 'dist', 'assets', 'styles.css'), 'body { color: white; }');

    const result = runVerifier();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Production bundle is clean.');
  });

  it.each([
    ['index.html', 'SAMPLE / UNVERIFIED DATA'],
    ['assets/app.js', 'SAMPLE DATA — placeholder values'],
    ['assets/styles.css', 'sample-gmaw-'],
    ['assets/config.json', 'Placeholder values for development only'],
    ['assets/developer.js', 'Developer staged GMAW entry'],
    ['assets/developer.js.map', 'DeveloperDataEntryPage'],
    ['assets/developer.txt', 'Mark Ready for Review'],
    ['assets/staging.json', 'weldcalc-dev-staged-gmaw'],
    ['assets/source-import.js', 'esab-recommended-welding-parameters-html'],
    ['assets/lincoln-import.js', 'lincoln-pdf-setting-tables'],
    ['assets/miller-import.js', 'miller-public-source-data'],
    ['assets/scan.js', 'Official welding-source scan summary'],
    ['assets/dashboard.js', 'Developer scan summary'],
    ['assets/source-fetch.js', 'WeldCalculator-SourceReview/1.0'],
  ])('rejects forbidden marker in %s', (relativePath, marker) => {
    const root = createProductionTree();
    const file = join(root, 'dist', relativePath);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, marker);

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production bundle contains sample welding data:');
    expect(result.stderr).toContain(marker);
  });

  it('fails when no text assets are found', () => {
    createProductionTree();

    const result = runVerifier();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no text assets found');
  });
});