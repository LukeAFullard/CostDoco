import React from 'react';
import { NavLink } from 'react-router-dom';
import { Receipt, FolderTree, Settings as SettingsIcon } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Receipts', icon: Receipt, end: true },
  { to: '/groups', label: 'Groups & Codes', icon: FolderTree, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
];

export const Sidebar: React.FC = () => {
  return (
    <nav className="h-full w-64 bg-stone dark:bg-ink border-r border-graphite/10 dark:border-white/10 p-4 flex flex-col gap-1">
      <div className="font-bold text-lg text-graphite dark:text-stone mb-4 px-2">
        Cost<span className="text-signal">Doco</span>
      </div>
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-panel text-sm font-medium transition-colors ${
              isActive
                ? 'bg-graphite text-stone dark:bg-stone dark:text-ink'
                : 'text-graphite dark:text-stone hover:bg-gray-200/60 dark:hover:bg-gray-800'
            }`
          }
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
};
