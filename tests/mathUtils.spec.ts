import { describe, it, expect } from 'vitest';
import { fitLine2D } from '../utils/mathUtils';

describe('mathUtils - fitLine2D', () => {
    it('should fit a perfect horizontal line', () => {
        const points = [
            { x: 0, y: 10 },
            { x: 10, y: 10 },
            { x: 20, y: 10 }
        ];
        const result = fitLine2D(points);
        expect(result).not.toBeNull();
        expect(result!.k).toBeCloseTo(0);
        expect(result!.b).toBeCloseTo(10);
    });

    it('should fit a perfect diagonal line', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 20, y: 20 }
        ];
        const result = fitLine2D(points);
        expect(result).not.toBeNull();
        expect(result!.k).toBeCloseTo(1);
        expect(result!.b).toBeCloseTo(0);
    });

    it('should fit a noisy line', () => {
        // y = 2x + 5 with some noise
        const points = [
            { x: 0, y: 5.1 },
            { x: 1, y: 6.9 },
            { x: 2, y: 9.2 },
            { x: 3, y: 10.8 }
        ];
        const result = fitLine2D(points);
        expect(result).not.toBeNull();
        // Theoretical k = (4*93.3 - 6*32)/(4*14 - 36) = (373.2 - 192)/(56-36) = 181.2 / 20 = 9.06? 
        // Wait, sumX=6, sumY=32, sumXY=0*5.1+1*6.9+2*9.2+3*10.8 = 0+6.9+18.4+32.4 = 57.7
        // sumXX = 0+1+4+9 = 14
        // k = (4*57.7 - 6*32) / (4*14 - 6*6) = (230.8 - 192) / (56 - 36) = 38.8 / 20 = 1.94
        // b = (32 - 1.94 * 6) / 4 = (32 - 11.64) / 4 = 20.36 / 4 = 5.09
        expect(result!.k).toBeCloseTo(1.94);
        expect(result!.b).toBeCloseTo(5.09);
    });

    it('should return null for less than 2 points', () => {
        expect(fitLine2D([{ x: 1, y: 1 }])).toBeNull();
    });

    it('should return null for vertical line (all same x)', () => {
        const points = [
            { x: 5, y: 0 },
            { x: 5, y: 10 },
            { x: 5, y: 20 }
        ];
        expect(fitLine2D(points)).toBeNull();
    });
});
