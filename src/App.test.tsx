import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import App from './App';
import { closeDB } from './db';

beforeEach(async () => {
  await closeDB();
  indexedDB = new IDBFactory();
});

afterEach(() => cleanup());

describe('App', () => {
  it('renders the dashboard by default with the sidebar visible', async () => {
    render(<App />);
    expect(await screen.findAllByText('Receipts')).not.toHaveLength(0);
    expect(await screen.findByText(/no receipts yet/i)).toBeInTheDocument();
  });
});
