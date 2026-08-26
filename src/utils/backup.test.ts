import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { buildBackupZip, importBackupZip, parseManifest } from './backup';
import { closeDB, getCostCodes, getGroups, getReceipts, putBlob, putCostCode, putGroup, putReceipt, putSettings } from '../db';
import type { CostCode, Group, Receipt } from '../types';
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';

// fake-indexeddb's structured clone under jsdom doesn't preserve Blob's
// prototype (see src/db/index.test.ts's "round-trips a blob" test), so a
// round-tripped blob loses .arrayBuffer() — which buildBackupZip needs for
// real. Shadow every put blob by id (test blob ids are always unique, via
// putTestBlob below, so this never goes stale across tests) and serve reads
// from there, bypassing the corrupted round trip while still exercising the
// real backup.ts code under test.
vi.mock('../db', async () => {
  const actual = await vi.importActual<typeof import('../db')>('../db');
  const shadow = new Map<string, Parameters<typeof actual.putBlob>[0]>();
  return {
    ...actual,
    putBlob: vi.fn(async (blob: Parameters<typeof actual.putBlob>[0]) => {
      shadow.set(blob.id, blob);
      return actual.putBlob(blob);
    }),
    getBlob: vi.fn(async (id: string) => shadow.get(id) ?? actual.getBlob(id)),
  };
});

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
});

const now = new Date().toISOString();

const makeGroup = (overrides: Partial<Group> = {}): Group => ({
  id: crypto.randomUUID(),
  name: 'Client A',
  color: '#3E7368',
  parentId: null,
  archived: false,
  updatedAt: now,
  ...overrides,
});

const makeCode = (overrides: Partial<CostCode> = {}): CostCode => ({
  id: crypto.randomUUID(),
  name: 'Materials',
  groupId: null,
  archived: false,
  updatedAt: now,
  ...overrides,
});

const makeReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: crypto.randomUUID(),
  date: '2026-08-20',
  vendor: 'Acme Hardware',
  taxMode: 'header',
  lineItems: [{ id: crypto.randomUUID(), amountIncTax: 42 }],
  currency: 'USD',
  billable: false,
  pdfBlobRef: 'unused',
  pageBlobRefs: ['unused'],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

/** Stores a real blob under a fresh id and returns that id. */
const putTestBlob = async (content: string, mimeType = 'application/pdf'): Promise<string> => {
  const id = crypto.randomUUID();
  await putBlob({ id, blob: new Blob([content], { type: mimeType }), mimeType, createdAt: now });
  return id;
};

const zipToFile = (blob: Blob) => new File([blob], 'backup.zip', { type: 'application/zip' });

describe('buildBackupZip', () => {
  it('bundles groups, codes, receipts, and every referenced blob into manifest.json + blobs/', async () => {
    const group = makeGroup();
    await putGroup(group);
    const code = makeCode({ groupId: group.id });
    await putCostCode(code);
    const blobId = await putTestBlob('pdf-bytes');
    await putReceipt(makeReceipt({ groupId: group.id, codeId: code.id, pdfBlobRef: blobId, pageBlobRefs: [blobId] }));

    const zipBlob = await buildBackupZip();
    const unzipped = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
    const manifest = parseManifest(strFromU8(unzipped['manifest.json']));

    expect(manifest.groups).toHaveLength(1);
    expect(manifest.costCodes).toHaveLength(1);
    expect(manifest.receipts).toHaveLength(1);
    expect(manifest.blobs).toHaveLength(1);
    expect(unzipped[manifest.blobs[0].filename]).toBeDefined();
  });

  it('deduplicates a blob referenced by both pdfBlobRef and pageBlobRefs', async () => {
    const blobId = await putTestBlob('x');
    await putReceipt(makeReceipt({ pdfBlobRef: blobId, pageBlobRefs: [blobId] }));

    const zipBlob = await buildBackupZip();
    const unzipped = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
    const manifest = parseManifest(strFromU8(unzipped['manifest.json']));
    expect(manifest.blobs).toHaveLength(1);
  });
});

describe('importBackupZip', () => {
  it('restores groups, codes, receipts, and blobs on a clean install', async () => {
    const group = makeGroup();
    await putGroup(group);
    const code = makeCode({ groupId: group.id });
    await putCostCode(code);
    const blobId = await putTestBlob('pdf-bytes');
    await putReceipt(makeReceipt({ groupId: group.id, codeId: code.id, pdfBlobRef: blobId, pageBlobRefs: [blobId] }));
    const zipBlob = await buildBackupZip();

    // Simulate a clean install.
    await closeDB();
    indexedDB = new IDBFactory();

    const result = await importBackupZip(zipToFile(zipBlob));
    expect(result).toEqual({ groupsImported: 1, costCodesImported: 1, receiptsImported: 1, receiptsSkippedAsDuplicate: 0 });

    const [groups, codes, receipts] = await Promise.all([getGroups(), getCostCodes(), getReceipts()]);
    expect(groups).toHaveLength(1);
    expect(codes).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    // The imported receipt's group/code references should point at the newly-created records.
    expect(receipts[0].groupId).toBe(groups[0].id);
    expect(receipts[0].codeId).toBe(codes[0].id);
  });

  it('skips a receipt that looks like a duplicate of one already present', async () => {
    const blobId = await putTestBlob('x');
    const receipt = makeReceipt({ pdfBlobRef: blobId, pageBlobRefs: [blobId] });
    await putReceipt(receipt);
    const zipBlob = await buildBackupZip();

    // Re-import into the SAME store, where the receipt already exists.
    const result = await importBackupZip(zipToFile(zipBlob));
    expect(result.receiptsImported).toBe(0);
    expect(result.receiptsSkippedAsDuplicate).toBe(1);
    expect(await getReceipts()).toHaveLength(1);
  });

  it('reuses an existing group with the same name instead of creating a duplicate', async () => {
    const group = makeGroup({ name: 'Client A' });
    await putGroup(group);
    const blobId = await putTestBlob('x');
    await putReceipt(makeReceipt({ groupId: group.id, pdfBlobRef: blobId, pageBlobRefs: [blobId] }));
    const zipBlob = await buildBackupZip();

    // Import again into a store that already has "Client A" (a fresh receipt id
    // avoids the duplicate-receipt skip, isolating the group-reuse behavior).
    await closeDB();
    indexedDB = new IDBFactory();
    const preexistingGroup = makeGroup({ name: 'Client A' });
    await putGroup(preexistingGroup);

    const result = await importBackupZip(zipToFile(zipBlob));
    expect(result.groupsImported).toBe(0);
    expect(await getGroups()).toHaveLength(1);
    const receipts = await getReceipts();
    expect(receipts[0].groupId).toBe(preexistingGroup.id);
  });

  it('remaps a receipt\'s custom field values to the matched local definition id, not the source id', async () => {
    // Existing local settings already have a "Vendor Tax Number" custom field
    // definition, but under a DIFFERENT id than the one baked into the backup.
    await putSettings({
      id: 'app-settings',
      homeCurrency: 'USD',
      customFieldDefinitions: [{ id: 'local-def-id', label: 'Vendor Tax Number' }],
      theme: 'light',
      lastBackupAt: null,
      backupReminderDays: 30,
    });

    const blobId = await putTestBlob('x');
    await putReceipt(
      makeReceipt({
        pdfBlobRef: blobId,
        pageBlobRefs: [blobId],
        customFields: { 'source-def-id': 'GST-999' },
      })
    );
    // The backup's own manifest carries the source definition under its original id.
    await putSettings({
      id: 'app-settings',
      homeCurrency: 'USD',
      customFieldDefinitions: [{ id: 'source-def-id', label: 'Vendor Tax Number' }],
      theme: 'light',
      lastBackupAt: null,
      backupReminderDays: 30,
    });
    const zipBlob = await buildBackupZip();

    // Restore into a fresh store that already has the definition under yet another id.
    await closeDB();
    indexedDB = new IDBFactory();
    await putSettings({
      id: 'app-settings',
      homeCurrency: 'USD',
      customFieldDefinitions: [{ id: 'local-def-id', label: 'Vendor Tax Number' }],
      theme: 'light',
      lastBackupAt: null,
      backupReminderDays: 30,
    });

    await importBackupZip(zipToFile(zipBlob));
    const [imported] = await getReceipts();
    expect(imported.customFields).toEqual({ 'local-def-id': 'GST-999' });
  });

  it('imports a 3-level group hierarchy in the correct nesting order regardless of array order', async () => {
    const grandparent = makeGroup({ id: 'gp', name: 'Region', parentId: null });
    const parent = makeGroup({ id: 'p', name: 'City', parentId: 'gp' });
    const child = makeGroup({ id: 'c', name: 'Client A', parentId: 'p' });
    // Store in child-first order so a naive parent-before-child assumption would fail.
    await putGroup(child);
    await putGroup(parent);
    await putGroup(grandparent);
    const blobId = await putTestBlob('x');
    await putReceipt(makeReceipt({ groupId: 'c', pdfBlobRef: blobId, pageBlobRefs: [blobId] }));
    const zipBlob = await buildBackupZip();

    await closeDB();
    indexedDB = new IDBFactory();

    await importBackupZip(zipToFile(zipBlob));
    const groups = await getGroups();
    const byName = (name: string) => groups.find((g) => g.name === name)!;
    expect(byName('City').parentId).toBe(byName('Region').id);
    expect(byName('Client A').parentId).toBe(byName('City').id);
  });

  it('rejects a zip whose manifest has an unsupported or missing schema version', async () => {
    const badZip = zipSync({
      'manifest.json': strToU8(JSON.stringify({ schemaVersion: 99, groups: [], costCodes: [], receipts: [] })),
    });
    const badBlob = new Blob([badZip as BlobPart], { type: 'application/zip' });
    await expect(importBackupZip(zipToFile(badBlob))).rejects.toThrow(/schema/i);
  });

  it('rejects a zip with no manifest.json', async () => {
    const emptyZip = zipSync({ 'readme.txt': strToU8('nothing here') });
    const blob = new Blob([emptyZip as BlobPart], { type: 'application/zip' });
    await expect(importBackupZip(zipToFile(blob))).rejects.toThrow(/manifest\.json/i);
  });
});

describe('parseManifest', () => {
  it('rejects invalid JSON', () => {
    expect(() => parseManifest('not json')).toThrow(/valid json/i);
  });

  it('rejects a payload missing the expected arrays', () => {
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 1 }))).toThrow(/does not look like/i);
  });
});
