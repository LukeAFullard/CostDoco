import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CaptureInput } from './CaptureInput';

afterEach(() => cleanup());

describe('CaptureInput', () => {
  it('calls onFileSelected when a file is chosen via "Take Photo"', () => {
    const onFileSelected = vi.fn();
    render(<CaptureInput onFileSelected={onFileSelected} />);

    const file = new File(['data'], 'receipt.jpg', { type: 'image/jpeg' });
    const cameraInput = screen.getByLabelText('Take photo') as HTMLInputElement;
    fireEvent.change(cameraInput, { target: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('calls onFileSelected when a file is chosen via "Upload File"', () => {
    const onFileSelected = vi.fn();
    render(<CaptureInput onFileSelected={onFileSelected} />);

    const file = new File(['data'], 'receipt.pdf', { type: 'application/pdf' });
    const uploadInput = screen.getByLabelText('Upload file') as HTMLInputElement;
    fireEvent.change(uploadInput, { target: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('clicking the visible buttons triggers the corresponding hidden input', () => {
    render(<CaptureInput onFileSelected={vi.fn()} />);
    const cameraInput = screen.getByLabelText('Take photo') as HTMLInputElement;
    const clickSpy = vi.spyOn(cameraInput, 'click');

    fireEvent.click(screen.getByText('Take Photo'));
    expect(clickSpy).toHaveBeenCalled();
  });
});
