import { describe, expect, it } from 'vitest';
import { boundingRectFromCorners } from './image';

describe('boundingRectFromCorners', () => {
  it('computes the bounding box of four corners regardless of order', () => {
    const rect = boundingRectFromCorners([
      { x: 0.8, y: 0.1 },
      { x: 0.2, y: 0.1 },
      { x: 0.2, y: 0.9 },
      { x: 0.8, y: 0.9 },
    ]);
    expect(rect.x).toBeCloseTo(0.2);
    expect(rect.y).toBeCloseTo(0.1);
    expect(rect.width).toBeCloseTo(0.6);
    expect(rect.height).toBeCloseTo(0.8);
  });

  it('clamps coordinates outside the 0..1 range', () => {
    const rect = boundingRectFromCorners([
      { x: -0.5, y: -0.2 },
      { x: 1.5, y: 1.2 },
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('returns a zero-size rect when all corners collapse to a point', () => {
    const rect = boundingRectFromCorners([
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(rect).toEqual({ x: 0.5, y: 0.5, width: 0, height: 0 });
  });
});
