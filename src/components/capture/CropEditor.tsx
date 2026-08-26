import React, { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { DEFAULT_CORNERS, type Point } from '../../utils/image';

interface CropEditorProps {
  imageUrl: string;
  onConfirm: (corners: Point[]) => void;
  onCancel: () => void;
}

const HANDLE_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];

export const CropEditor: React.FC<CropEditorProps> = ({ imageUrl, onConfirm, onCancel }) => {
  const [corners, setCorners] = useState<Point[]>(DEFAULT_CORNERS);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIndex = useRef<number | null>(null);

  const clientToFraction = (clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingIndex.current = index;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIndex.current === null) return;
    const point = clientToFraction(e.clientX, e.clientY);
    setCorners((prev) => prev.map((p, i) => (i === draggingIndex.current ? point : p)));
  };

  const handlePointerUp = () => {
    draggingIndex.current = null;
  };

  const minX = Math.min(...corners.map((p) => p.x)) * 100;
  const maxX = Math.max(...corners.map((p) => p.x)) * 100;
  const minY = Math.min(...corners.map((p) => p.y)) * 100;
  const maxY = Math.max(...corners.map((p) => p.y)) * 100;

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative w-full select-none touch-none bg-black/80 rounded-panel overflow-hidden"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img src={imageUrl} alt="Captured receipt, ready to crop" className="w-full h-auto block pointer-events-none" draggable={false} />

        <div
          className="absolute border-2 border-signal bg-signal/10"
          style={{
            left: `${minX}%`,
            top: `${minY}%`,
            width: `${maxX - minX}%`,
            height: `${maxY - minY}%`,
          }}
        />

        {corners.map((corner, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${HANDLE_LABELS[i]} crop handle`}
            onPointerDown={handlePointerDown(i)}
            className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-signal border-2 border-white shadow-md cursor-grab active:cursor-grabbing touch-none"
            style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }}
          />
        ))}
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-400">
        Drag the four corner handles to select the receipt area, then confirm the crop.
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onConfirm(corners)}>
          Confirm Crop
        </Button>
      </div>
    </div>
  );
};
