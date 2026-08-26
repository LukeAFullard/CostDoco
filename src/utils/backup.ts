import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';
import {
  getGroups,
  getCostCodes,
  getReceipts,
  getSettings,
  getBlob,
  putGroup,
  putCostCode,
  putReceipt,
  putBlob,
  putSettings,
} from '../db';
import { findLikelyDuplicate } from './duplicateDetection';
import type { CostCode, CustomFieldDefinition, Group, Receipt } from '../types';
import { receiptTotalIncTax } from '../types';

const SCHEMA_VERSION = 1;

export interface BackupManifest {
  schemaVersion: 1;
  exportedAt: string;
  groups: Group[];
  costCodes: CostCode[];
  receipts: Receipt[];
  customFieldDefinitions: CustomFieldDefinition[];
  homeCurrency: string;
  blobs: { id: string; filename: string; mimeType: string }[];
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  return 'jpg';
}

/**
 * Full-fidelity backup: every group, cost code, and receipt, plus the actual
 * bytes of every blob any receipt references (pdfBlobRef and pageBlobRefs,
 * deduplicated) — distinct from the CSV/PDF reports, which are lossy
 * summaries. Bundled as a zip (manifest.json + blobs/) via fflate.
 */
export async function buildBackupZip(): Promise<Blob> {
  const [groups, costCodes, receipts, settings] = await Promise.all([
    getGroups(),
    getCostCodes(),
    getReceipts(),
    getSettings(),
  ]);

  const blobIds = new Set<string>();
  for (const receipt of receipts) {
    blobIds.add(receipt.pdfBlobRef);
    for (const ref of receipt.pageBlobRefs) blobIds.add(ref);
  }

  const manifestBlobs: BackupManifest['blobs'] = [];
  const zipData: Record<string, Uint8Array> = {};

  for (const id of blobIds) {
    const record = await getBlob(id);
    if (!record) continue;
    const filename = `blobs/${id}.${extensionFor(record.mimeType)}`;
    zipData[filename] = new Uint8Array(await record.blob.arrayBuffer());
    manifestBlobs.push({ id, filename, mimeType: record.mimeType });
  }

  const manifest: BackupManifest = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    groups,
    costCodes,
    receipts,
    customFieldDefinitions: settings.customFieldDefinitions,
    homeCurrency: settings.homeCurrency,
    blobs: manifestBlobs,
  };
  zipData['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  return new Blob([zipSync(zipData) as BlobPart], { type: 'application/zip' });
}

export function parseManifest(json: string): BackupManifest {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const candidate = data as Partial<BackupManifest>;
  if (candidate.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported or missing backup schema version.');
  }
  if (!Array.isArray(candidate.groups) || !Array.isArray(candidate.receipts) || !Array.isArray(candidate.costCodes)) {
    throw new Error('This file does not look like a CostDoco backup.');
  }
  return candidate as BackupManifest;
}

export interface ImportResult {
  groupsImported: number;
  costCodesImported: number;
  receiptsImported: number;
  receiptsSkippedAsDuplicate: number;
}

/**
 * Imports a backup as new records rather than overwriting existing data by id:
 * groups/cost codes are matched by name and reused when they already exist
 * (so re-importing the same backup doesn't create duplicates of those), and
 * every receipt is run through duplicate-detection — a likely duplicate is
 * skipped, everything else is imported under a fresh id with its blobs.
 */
export async function importBackupZip(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error('Failed to extract zip file.');
  }

  const manifestBytes = unzipped['manifest.json'];
  if (!manifestBytes) throw new Error('Invalid backup zip: missing manifest.json.');
  const manifest = parseManifest(strFromU8(manifestBytes));

  const [existingGroups, existingCostCodes, existingReceipts, existingSettings] = await Promise.all([
    getGroups(),
    getCostCodes(),
    getReceipts(),
    getSettings(),
  ]);

  // Groups: match by (name, remapped parentId) so subgroups with the same name
  // under different parents aren't merged into one. Process in dependency
  // order — a group only once its parent (if any) has already been remapped —
  // rather than assuming the manifest array happens to list parents first;
  // groups come from db.getAll(), ordered by id, unrelated to hierarchy depth.
  const groupIdMap = new Map<string, string>();
  let groupsImported = 0;
  const liveGroups = [...existingGroups];
  let remainingGroups = [...manifest.groups];
  while (remainingGroups.length > 0) {
    const ready = remainingGroups.filter((g) => !g.parentId || groupIdMap.has(g.parentId));
    if (ready.length === 0) {
      // Every remaining group's parentId is missing from this manifest (or
      // forms a cycle, which shouldn't happen for valid data) — import the
      // rest as top-level rather than dropping them silently.
      ready.push(...remainingGroups);
    }

    for (const group of ready) {
      const newParentId = group.parentId ? groupIdMap.get(group.parentId) ?? null : null;
      const existing = liveGroups.find(
        (g) => g.name.toLowerCase() === group.name.toLowerCase() && (g.parentId ?? null) === newParentId
      );
      if (existing) {
        groupIdMap.set(group.id, existing.id);
        continue;
      }
      const newGroup: Group = { ...group, id: crypto.randomUUID(), parentId: newParentId };
      await putGroup(newGroup);
      liveGroups.push(newGroup);
      groupIdMap.set(group.id, newGroup.id);
      groupsImported++;
    }

    const readyIds = new Set(ready.map((g) => g.id));
    remainingGroups = remainingGroups.filter((g) => !readyIds.has(g.id));
  }

  // Cost codes: match by (name, remapped groupId).
  const codeIdMap = new Map<string, string>();
  let costCodesImported = 0;
  const liveCodes = [...existingCostCodes];
  for (const code of manifest.costCodes) {
    const newGroupId = code.groupId ? groupIdMap.get(code.groupId) ?? null : null;
    const existing = liveCodes.find((c) => c.name.toLowerCase() === code.name.toLowerCase() && (c.groupId ?? null) === newGroupId);
    if (existing) {
      codeIdMap.set(code.id, existing.id);
      continue;
    }
    const newCode: CostCode = { ...code, id: crypto.randomUUID(), groupId: newGroupId };
    await putCostCode(newCode);
    liveCodes.push(newCode);
    codeIdMap.set(code.id, newCode.id);
    costCodesImported++;
  }

  // Blobs: always imported under a fresh id, to guarantee no collision with
  // anything already in the local store.
  const blobIdMap = new Map<string, string>();
  for (const blobMeta of manifest.blobs) {
    const bytes = unzipped[blobMeta.filename];
    if (!bytes) continue;
    const newId = crypto.randomUUID();
    await putBlob({
      id: newId,
      blob: new Blob([bytes as BlobPart], { type: blobMeta.mimeType }),
      mimeType: blobMeta.mimeType,
      createdAt: new Date().toISOString(),
    });
    blobIdMap.set(blobMeta.id, newId);
  }

  // Custom field definitions: merge by label so the device keeps its own
  // homeCurrency/theme (device-local preferences), never silently overwritten.
  // Build the old-id -> local-id map first so receipts' customFields (keyed by
  // definition id) can be remapped below, same as groupId/codeId/blob refs —
  // otherwise an imported receipt's custom field values become permanently
  // invisible (keyed by an id no local definition has).
  const customFieldIdMap = new Map<string, string>();
  const mergedDefinitions = [...existingSettings.customFieldDefinitions];
  for (const def of manifest.customFieldDefinitions) {
    const existing = mergedDefinitions.find((d) => d.label.toLowerCase() === def.label.toLowerCase());
    if (existing) {
      customFieldIdMap.set(def.id, existing.id);
      continue;
    }
    const newDef: CustomFieldDefinition = { ...def, id: crypto.randomUUID() };
    mergedDefinitions.push(newDef);
    customFieldIdMap.set(def.id, newDef.id);
  }
  if (mergedDefinitions.length !== existingSettings.customFieldDefinitions.length) {
    await putSettings({ ...existingSettings, customFieldDefinitions: mergedDefinitions });
  }

  let receiptsImported = 0;
  let receiptsSkippedAsDuplicate = 0;
  const liveReceipts = [...existingReceipts];
  for (const receipt of manifest.receipts) {
    const totalIncTax = receiptTotalIncTax(receipt);
    const duplicate = findLikelyDuplicate(
      { date: receipt.date, vendor: receipt.vendor, totalIncTax, pdfHash: receipt.pdfHash },
      liveReceipts
    );
    if (duplicate) {
      receiptsSkippedAsDuplicate++;
      continue;
    }

    const remappedCustomFields = receipt.customFields
      ? Object.fromEntries(
          Object.entries(receipt.customFields).map(([defId, value]) => [customFieldIdMap.get(defId) ?? defId, value])
        )
      : undefined;

    const newReceipt: Receipt = {
      ...receipt,
      id: crypto.randomUUID(),
      groupId: receipt.groupId ? groupIdMap.get(receipt.groupId) ?? undefined : undefined,
      codeId: receipt.codeId ? codeIdMap.get(receipt.codeId) ?? undefined : undefined,
      pdfBlobRef: blobIdMap.get(receipt.pdfBlobRef) ?? receipt.pdfBlobRef,
      pageBlobRefs: receipt.pageBlobRefs.map((ref) => blobIdMap.get(ref) ?? ref),
      customFields: remappedCustomFields,
    };
    await putReceipt(newReceipt);
    liveReceipts.push(newReceipt);
    receiptsImported++;
  }

  return { groupsImported, costCodesImported, receiptsImported, receiptsSkippedAsDuplicate };
}
