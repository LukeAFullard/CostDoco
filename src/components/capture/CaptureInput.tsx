import React, { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import { Button } from '../ui/Button';

interface CaptureInputProps {
  onFileSelected: (file: File) => void;
}

export const CaptureInput: React.FC<CaptureInputProps> = ({ onFileSelected }) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
        aria-label="Take photo"
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleChange}
        aria-label="Upload file"
      />
      <Button variant="primary" onClick={() => cameraInputRef.current?.click()} className="flex-1">
        <Camera size={18} className="mr-2" /> Take Photo
      </Button>
      <Button variant="secondary" onClick={() => uploadInputRef.current?.click()} className="flex-1">
        <Upload size={18} className="mr-2" /> Upload File
      </Button>
    </div>
  );
};
