import React, { useState } from 'react';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAppData } from '../context/AppDataContext';
import type { CostCode, Group } from '../types';

const DEFAULT_COLOR = '#3E7368';

export const GroupsAndCodes: React.FC = () => {
  const { groups, costCodes, createGroup, updateGroup, deleteGroupById, createCostCode, updateCostCode, deleteCostCodeById } = useAppData();

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupParentId, setNewGroupParentId] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [groupError, setGroupError] = useState<string | null>(null);

  const [addingCodeGroupId, setAddingCodeGroupId] = useState<string | null>(null);
  const [newCodeName, setNewCodeName] = useState('');
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editingCodeName, setEditingCodeName] = useState('');

  const topLevelGroups = groups.filter((g) => !g.parentId && !g.archived);
  const childGroups = (parentId: string) => groups.filter((g) => g.parentId === parentId && !g.archived);
  const codesForGroup = (groupId: string | null) => costCodes.filter((c) => (c.groupId ?? null) === groupId && !c.archived);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase() && (g.parentId ?? '') === (newGroupParentId || ''))) {
      setGroupError('A group with this name already exists here.');
      return;
    }
    await createGroup(name, DEFAULT_COLOR, newGroupParentId || null);
    setNewGroupName('');
    setGroupError(null);
  };

  const startEditGroup = (group: Group) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const saveEditGroup = async (id: string) => {
    const name = editingGroupName.trim();
    if (!name) return;
    await updateGroup(id, { name });
    setEditingGroupId(null);
  };

  const handleDeleteGroup = async (group: Group) => {
    if (!window.confirm(`Delete "${group.name}"? This is only possible if it has no subgroups, cost codes, or receipts.`)) return;
    const result = await deleteGroupById(group.id);
    if (!result.ok) {
      window.alert('This group still has subgroups, cost codes, or receipts assigned to it. Remove or reassign them first.');
    }
  };

  const handleCreateCode = async (groupId: string | null) => {
    const name = newCodeName.trim();
    if (!name) return;
    await createCostCode(name, groupId);
    setNewCodeName('');
    setAddingCodeGroupId(null);
  };

  const startEditCode = (code: CostCode) => {
    setEditingCodeId(code.id);
    setEditingCodeName(code.name);
  };

  const saveEditCode = async (id: string) => {
    const name = editingCodeName.trim();
    if (!name) return;
    await updateCostCode(id, { name });
    setEditingCodeId(null);
  };

  const handleDeleteCode = async (code: CostCode) => {
    if (!window.confirm(`Delete "${code.name}"? This is only possible if no receipts use it.`)) return;
    const result = await deleteCostCodeById(code.id);
    if (!result.ok) {
      window.alert('This cost code is still assigned to one or more receipts. Reassign or delete those receipts first.');
    }
  };

  const renderCodeRow = (code: CostCode) => (
    <div key={code.id} className="flex items-center justify-between gap-2 pl-6 py-1.5 text-sm">
      {editingCodeId === code.id ? (
        <>
          <Input
            value={editingCodeName}
            onChange={(e) => setEditingCodeName(e.target.value)}
            className="flex-1"
            autoFocus
          />
          <Button size="sm" variant="primary" onClick={() => saveEditCode(code.id)}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingCodeId(null)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="text-graphite dark:text-stone">{code.name}</span>
          <div className="flex items-center gap-1">
            <button aria-label={`Edit ${code.name}`} onClick={() => startEditCode(code)} className="p-1 text-gray-500 hover:text-signal-dim">
              <Edit2 size={14} />
            </button>
            <button aria-label={`Delete ${code.name}`} onClick={() => handleDeleteCode(code)} className="p-1 text-gray-500 hover:text-rust">
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderAddCodeForm = (groupId: string | null, key: string) =>
    addingCodeGroupId === key ? (
      <div className="flex items-center gap-2 pl-6 py-1.5">
        <Input
          placeholder="Cost code name"
          value={newCodeName}
          onChange={(e) => setNewCodeName(e.target.value)}
          className="flex-1"
          autoFocus
        />
        <Button size="sm" variant="primary" onClick={() => handleCreateCode(groupId)} disabled={!newCodeName.trim()}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAddingCodeGroupId(null)}>
          Cancel
        </Button>
      </div>
    ) : (
      <button
        onClick={() => {
          setAddingCodeGroupId(key);
          setNewCodeName('');
        }}
        className="pl-6 py-1.5 text-xs font-semibold text-signal-dim dark:text-signal hover:underline flex items-center gap-1"
      >
        <Plus size={12} /> Add cost code
      </button>
    );

  const renderGroup = (group: Group, depth: number) => (
    <div key={group.id} style={{ marginLeft: depth * 16 }} className="border-l-2 border-graphite/10 dark:border-white/10 pl-3 py-2">
      {editingGroupId === group.id ? (
        <div className="flex items-center gap-2">
          <Input value={editingGroupName} onChange={(e) => setEditingGroupName(e.target.value)} className="flex-1" autoFocus />
          <Button size="sm" variant="primary" onClick={() => saveEditGroup(group.id)}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingGroupId(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-graphite dark:text-stone">{group.name}</span>
          <div className="flex items-center gap-1">
            <button aria-label={`Edit ${group.name}`} onClick={() => startEditGroup(group)} className="p-1 text-gray-500 hover:text-signal-dim">
              <Edit2 size={14} />
            </button>
            <button aria-label={`Delete ${group.name}`} onClick={() => handleDeleteGroup(group)} className="p-1 text-gray-500 hover:text-rust">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="mt-1 space-y-0.5">
        {codesForGroup(group.id).map(renderCodeRow)}
        {renderAddCodeForm(group.id, group.id)}
      </div>

      {childGroups(group.id).map((child) => renderGroup(child, depth + 1))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-graphite dark:text-stone">Groups &amp; Cost Codes</h1>

      <Panel className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone">New Group</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Group name (e.g. Client A, Site 12)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="flex-1"
          />
          <select
            value={newGroupParentId}
            onChange={(e) => setNewGroupParentId(e.target.value)}
            className="px-3 py-2 border border-graphite/20 dark:border-white/20 rounded-panel bg-white dark:bg-graphite text-graphite dark:text-stone text-sm"
          >
            <option value="">Top-level group</option>
            {groups.filter((g) => !g.archived).map((g) => (
              <option key={g.id} value={g.id}>
                Subgroup of {g.name}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
            <Plus size={16} className="mr-1" /> Add Group
          </Button>
        </div>
        {groupError && <p className="text-sm text-rust">{groupError}</p>}
      </Panel>

      <Panel className="p-4">
        <div className="space-y-1">
          {topLevelGroups.map((group) => renderGroup(group, 0))}
          {topLevelGroups.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No groups yet. Create one above.</p>
          )}
        </div>
      </Panel>

      <Panel className="p-4">
        <h2 className="text-sm font-semibold text-graphite dark:text-stone mb-2">Ungrouped Cost Codes</h2>
        <div className="space-y-0.5">
          {codesForGroup(null).map(renderCodeRow)}
          {renderAddCodeForm(null, '__none__')}
        </div>
      </Panel>
    </div>
  );
};
