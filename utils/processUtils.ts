
import * as UPNG from 'upng-js';
import { ConverterConfig, GridData } from '../types';
import { fitPlane } from './mathUtils';

export const processImageToGrid = (
    buffer: ArrayBuffer,
    config: ConverterConfig
): GridData => {
    // 1. Decode Image using UPNG
    const img = UPNG.decode(buffer);
    const { width, height, depth } = img;
    const { pixelSizeX, pixelSizeY, zScalePerGray, stepX, stepY, rotation, references } = config;

    // 2. Extract Raw Pixel Data (Handling 8-bit and 16-bit)
    // Note: UPNG data is in Big Endian for 16-bit.
    let rawPixels: Uint8Array | Uint16Array;
    const pixelCount = width * height;
    
    if (depth === 16) {
        // img.data is often a Uint8Array containing the raw bytes, DataView needs an ArrayBuffer
        const buffer = img.data instanceof ArrayBuffer ? img.data : img.data.buffer;
        const byteOffset = img.data instanceof ArrayBuffer ? 0 : img.data.byteOffset;
        const view = new DataView(buffer, byteOffset, img.data.byteLength);
        
        rawPixels = new Uint16Array(pixelCount);
        // Correctly handle byte order for 16-bit PNG (Big Endian)
        for (let i = 0; i < pixelCount; i++) {
            rawPixels[i] = view.getUint16(i * 2, false);
        }
    } else {
        // Fallback to 8-bit (or convert to 8-bit if other depth)
        // If it's already 8-bit grayscale, we can use it directly
        if (depth === 8 && img.ctype === 0) {
            rawPixels = new Uint8Array(img.data);
        } else {
            // For other types (RGB/RGBA), use UPNG's conversion to RGBA8 then take Red channel as gray
            const rgba8 = new Uint8Array(UPNG.toRGBA8(img)[0]);
            rawPixels = new Uint8Array(pixelCount);
            for (let i = 0; i < pixelCount; i++) {
                rawPixels[i] = rgba8[i * 4];
            }
        }
    }

    // 3. Determine Target Dimensions based on Rotation & Sampling
    let srcW = width;
    let srcH = height;
    
    const isRotated = rotation === 90 || rotation === -90;
    const targetW_px = isRotated ? srcH : srcW;
    const targetH_px = isRotated ? srcW : srcH;

    const effectiveStepX = isRotated ? stepY : stepX;
    const effectiveStepY = isRotated ? stepX : stepY;
    
    // Output Grid Dimensions
    const outW = Math.floor(targetW_px / effectiveStepX);
    const outH = Math.floor(targetH_px / effectiveStepY);
    
    const grid = new Float32Array(outW * outH);
    
    // Helper to get raw Z (pixel value)
    const getRawPixel = (x: number, y: number): number => {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;
        return rawPixels[y * width + x];
    };

    // 4. Collection points for Plane Fitting (Reference Planes)
    const fitPoints: {x: number, y: number, z: number}[] = [];

    // Helper to map Output Grid Coordinates (gx, gy) back to Source Image Coordinates (sx, sy)
    const mapGridToSource = (gx: number, gy: number): {sx: number, sy: number} => {
        const tx = gx * effectiveStepX;
        const ty = gy * effectiveStepY;
        
        let sx = 0, sy = 0;
        if (rotation === 0) {
            sx = tx; sy = ty;
        } else if (rotation === 90) {
            sx = ty; sy = srcH - 1 - tx;
        } else if (rotation === 180) {
            sx = srcW - 1 - tx; sy = srcH - 1 - ty;
        } else if (rotation === -90) {
             sx = srcW - 1 - ty; sy = tx;
        }
        return { sx, sy };
    };

    // 5. Build the Grid & Collect Reference Points
    for (let gy = 0; gy < outH; gy++) {
        for (let gx = 0; gx < outW; gx++) {
            const { sx, sy } = mapGridToSource(gx, gy);
            const val = getRawPixel(Math.floor(sx), Math.floor(sy));
            const zMM = val * (zScalePerGray || 0);
            
            const idx = gy * outW + gx;
            grid[idx] = zMM; 

            // Check Reference Planes
            for (const ref of references) {
                if (sx >= ref.x && sx < ref.x + ref.w && sy >= ref.y && sy < ref.y + ref.h) {
                    // fitZ = rawZ - offsetZ (as requested by user)
                    fitPoints.push({ x: gx, y: gy, z: zMM - ref.offsetZ });
                }
            }
        }
    }

    // 6. Fit Plane
    let plane = fitPlane(fitPoints);
    if (!plane) {
        plane = [0, 0, 0];
    }
    const [a, b, c] = plane;

    // 7. Level Data & Construct Physical Coordinates (Centered)
    let minZ = Infinity, maxZ = -Infinity;
    
    const xs = new Float32Array(outW);
    const ys = new Float32Array(outH);

    // Cartesian Coordinates with Origin at Center
    for (let i = 0; i < outW; i++) {
        xs[i] = (i - (outW - 1) / 2) * effectiveStepX * pixelSizeX;
    }
    for (let i = 0; i < outH; i++) {
        // gy=0 is top, which is positive Y in Cartesian
        ys[i] = ((outH - 1) / 2 - i) * effectiveStepY * pixelSizeY;
    }

    for (let i = 0; i < grid.length; i++) {
        const gx = i % outW;
        const gy = Math.floor(i / outW);
        const rawZMM = grid[i];
        
        let correctedZ: number;
        if (fitPoints.length > 0) {
            const planeZ = a * gx + b * gy + c;
            correctedZ = rawZMM - planeZ;
        } else {
            correctedZ = rawZMM;
        }
        
        grid[i] = correctedZ;
        if (correctedZ < minZ) minZ = correctedZ;
        if (correctedZ > maxZ) maxZ = correctedZ;
    }

    return {
        w: outW,
        h: outH,
        data: grid,
        minZ,
        maxZ,
        xs,
        ys
    };
};
