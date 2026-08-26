import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CropEditor } from './CropEditor';
import { DEFAULT_CORNERS } from '../../utils/image';

afterEach(() => cleanup());

describe('CropEditor', () => {
  it('confirms with the default four corners when the user makes no adjustments', () => {
    const onConfirm = vi.fn();
    render(<CropEditor imageUrl="blob:test" onConfirm={onConfirm} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText('Confirm Crop'));
    expect(onConfirm).toHaveBeenCalledWith(DEFAULT_CORNERS);
  });

  it('calls onCancel when cancelled', () => {
    const onCancel = vi.fn();
    render(<CropEditor imageUrl="blob:test" onConfirm={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders four draggable corner handles', () => {
    render(<CropEditor imageUrl="blob:test" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Top-left crop handle')).toBeInTheDocument();
    expect(screen.getByLabelText('Top-right crop handle')).toBeInTheDocument();
    expect(screen.getByLabelText('Bottom-right crop handle')).toBeInTheDocument();
    expect(screen.getByLabelText('Bottom-left crop handle')).toBeInTheDocument();
  });
});
