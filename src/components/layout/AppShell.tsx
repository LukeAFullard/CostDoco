import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-graphite">
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <header className="md:hidden flex items-center justify-between p-3 border-b border-graphite/10 dark:border-white/10 bg-stone dark:bg-ink">
          <span className="font-bold text-graphite dark:text-stone">Cost<span className="text-signal">Doco</span></span>
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={20} className="text-graphite dark:text-stone" />
          </button>
        </header>

        <div className="hidden md:block h-full"><Sidebar /></div>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[80%]">
              <div className="relative h-full">
                <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute top-3 right-[-40px] text-white">
                  <X size={24} />
                </button>
                <Sidebar />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
