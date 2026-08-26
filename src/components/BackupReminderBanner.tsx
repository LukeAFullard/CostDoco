import { useEffect, useState } from 'react';
import { differenceInDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import { getSettings, getReceipts } from '../db';

const DISMISS_KEY = 'costdoco-backup-reminder-dismissed';
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000;

export function BackupReminderBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = async () => {
      const [settings, receipts] = await Promise.all([getSettings(), getReceipts()]);
      if (receipts.length === 0) {
        setVisible(false);
        return;
      }

      let shouldShow: boolean;
      if (!settings.lastBackupAt) {
        shouldShow = true;
      } else {
        const daysSince = differenceInDays(new Date(), new Date(settings.lastBackupAt));
        shouldShow = daysSince >= settings.backupReminderDays;
      }

      let isDismissed = false;
      const dismissalData = localStorage.getItem(DISMISS_KEY);
      if (dismissalData) {
        try {
          const { timestamp } = JSON.parse(dismissalData);
          if (Date.now() - timestamp < DISMISS_WINDOW_MS) {
            isDismissed = true;
          } else {
            localStorage.removeItem(DISMISS_KEY);
          }
        } catch {
          localStorage.removeItem(DISMISS_KEY);
        }
      }

      setVisible(shouldShow && !isDismissed);
    };
    check();
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ timestamp: Date.now() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="w-full bg-signal/10 dark:bg-signal/20 border-b border-signal/20 dark:border-signal/30 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle size={18} className="text-signal-dim dark:text-signal shrink-0" />
        <p className="text-sm font-medium text-signal-dim dark:text-signal truncate">
          It has been a while since your last backup. We recommend exporting your data soon.{' '}
          <Link to="/settings" className="underline">Go to Settings</Link>
        </p>
      </div>
      <button type="button" onClick={handleDismiss} aria-label="Dismiss" className="shrink-0 text-signal-dim dark:text-signal">
        <X size={16} />
      </button>
    </div>
  );
}
