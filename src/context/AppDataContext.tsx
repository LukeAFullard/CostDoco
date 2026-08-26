import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CostCode, Group, Receipt, Settings } from '../types';
import {
  getGroups,
  putGroup,
  deleteGroup as dbDeleteGroup,
  getCostCodes,
  putCostCode,
  deleteCostCode as dbDeleteCostCode,
  getReceipts,
  putReceipt,
  deleteReceipt as dbDeleteReceipt,
  getSettings,
  putSettings,
} from '../db';

type DeleteResult = { ok: true } | { ok: false; reason: 'has-children' };

interface AppDataContextValue {
  groups: Group[];
  costCodes: CostCode[];
  receipts: Receipt[];
  settings: Settings | null;
  loading: boolean;

  createGroup: (name: string, color: string, parentId: string | null) => Promise<Group>;
  updateGroup: (id: string, updates: Partial<Pick<Group, 'name' | 'color' | 'archived' | 'parentId'>>) => Promise<void>;
  deleteGroupById: (id: string) => Promise<DeleteResult>;

  createCostCode: (name: string, groupId: string | null, color?: string) => Promise<CostCode>;
  updateCostCode: (id: string, updates: Partial<Pick<CostCode, 'name' | 'groupId' | 'color' | 'archived'>>) => Promise<void>;
  deleteCostCodeById: (id: string) => Promise<DeleteResult>;

  saveReceipt: (receipt: Receipt) => Promise<void>;
  removeReceipt: (id: string) => Promise<void>;

  updateSettings: (updates: Partial<Settings>) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [g, c, r, s] = await Promise.all([getGroups(), getCostCodes(), getReceipts(), getSettings()]);
    setGroups(g);
    setCostCodes(c);
    setReceipts(r);
    setSettings(s);
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const createGroup = async (name: string, color: string, parentId: string | null) => {
    const now = new Date().toISOString();
    const group: Group = { id: crypto.randomUUID(), name, color, parentId, archived: false, updatedAt: now };
    await putGroup(group);
    await reload();
    return group;
  };

  const updateGroup = async (id: string, updates: Partial<Pick<Group, 'name' | 'color' | 'archived' | 'parentId'>>) => {
    const existing = groups.find((g) => g.id === id);
    if (!existing) return;
    await putGroup({ ...existing, ...updates, updatedAt: new Date().toISOString() });
    await reload();
  };

  const deleteGroupById = async (id: string): Promise<DeleteResult> => {
    const hasChildGroups = groups.some((g) => g.parentId === id);
    const hasCodes = costCodes.some((c) => c.groupId === id);
    const hasReceipts = receipts.some((r) => r.groupId === id);
    if (hasChildGroups || hasCodes || hasReceipts) return { ok: false, reason: 'has-children' };

    await dbDeleteGroup(id);
    await reload();
    return { ok: true };
  };

  const createCostCode = async (name: string, groupId: string | null, color?: string) => {
    const now = new Date().toISOString();
    const code: CostCode = { id: crypto.randomUUID(), name, groupId, color, archived: false, updatedAt: now };
    await putCostCode(code);
    await reload();
    return code;
  };

  const updateCostCode = async (id: string, updates: Partial<Pick<CostCode, 'name' | 'groupId' | 'color' | 'archived'>>) => {
    const existing = costCodes.find((c) => c.id === id);
    if (!existing) return;
    await putCostCode({ ...existing, ...updates, updatedAt: new Date().toISOString() });
    await reload();
  };

  const deleteCostCodeById = async (id: string): Promise<DeleteResult> => {
    const hasReceipts = receipts.some((r) => r.codeId === id);
    if (hasReceipts) return { ok: false, reason: 'has-children' };

    await dbDeleteCostCode(id);
    await reload();
    return { ok: true };
  };

  const saveReceipt = async (receipt: Receipt) => {
    await putReceipt(receipt);
    await reload();
  };

  const removeReceipt = async (id: string) => {
    await dbDeleteReceipt(id);
    await reload();
  };

  const updateSettings = async (updates: Partial<Settings>) => {
    const base = settings ?? (await getSettings());
    const next = { ...base, ...updates };
    await putSettings(next);
    setSettings(next);
  };

  return (
    <AppDataContext.Provider
      value={{
        groups,
        costCodes,
        receipts,
        settings,
        loading,
        createGroup,
        updateGroup,
        deleteGroupById,
        createCostCode,
        updateCostCode,
        deleteCostCodeById,
        saveReceipt,
        removeReceipt,
        updateSettings,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within an AppDataProvider');
  return ctx;
}
