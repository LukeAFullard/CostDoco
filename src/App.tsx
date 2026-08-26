import { useEffect, type ReactNode } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { CaptureReceipt } from './pages/CaptureReceipt';
import { OcrReview } from './pages/OcrReview';
import { ReceiptForm } from './pages/ReceiptForm';
import { GroupsAndCodes } from './pages/GroupsAndCodes';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { UnlockGate } from './components/UnlockGate';
import { isUnlocked } from './security/session';

function ThemeEffect() {
  const { settings } = useAppData();

  useEffect(() => {
    const root = window.document.documentElement;
    const theme = settings?.theme ?? 'light';
    root.classList.remove('light', 'dark');
    const activeTheme = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    root.classList.add(activeTheme);
  }, [settings?.theme]);

  return null;
}

/** Blocks the whole app behind a passphrase prompt whenever encryption is enabled and the session is locked. */
function EncryptionGate({ children }: { children: ReactNode }) {
  const { settings, loading } = useAppData();

  if (loading) return null;
  if (settings?.encryptionEnabled && !isUnlocked()) return <UnlockGate />;
  return <>{children}</>;
}

function App() {
  return (
    <AppDataProvider>
      <ThemeEffect />
      <EncryptionGate>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/receipts/new" element={<CaptureReceipt />} />
              <Route path="/receipts/:id/review" element={<OcrReview />} />
              <Route path="/receipts/:id" element={<ReceiptForm />} />
              <Route path="/groups" element={<GroupsAndCodes />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </HashRouter>
      </EncryptionGate>
    </AppDataProvider>
  );
}

export default App;
