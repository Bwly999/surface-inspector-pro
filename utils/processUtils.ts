
import { ConverterConfig, GridData } from '../types';
import { fitPlane } from './mathUtils';

export const processImageToGrid = (
    imgData: ImageData,
    config: ConverterConfig
): GridData => {
    const { width, height, data } = imgData;
    const { widthMM, heightMM, zScale, stepX, stepY, rotation, references } = config;

    // 1. Determine Target Dimensions based on Rotation & Sampling
    let srcW = width;
    let srcH = height;
    
    const isRotated = rotation === 90 || rotation === -90;
    const targetW_px = isRotated ? srcH : srcW;
    const targetH_px = isRotated ? srcW : srcH;

    // Adaptive Sampling & Dimensions: 
    // If rotated, the "Target X" axis corresponds to "Source Y" axis (or vice versa).
    // So we must swap the steps and physical dimensions to match the source orientation.
    const effectiveStepX = isRotated ? stepY : stepX;
    const effectiveStepY = isRotated ? stepX : stepY;
    
    const effectiveWidthMM = isRotated ? heightMM : widthMM;
    const effectiveHeightMM = isRotated ? widthMM : heightMM;

    // Output Grid Dimensions
    const outW = Math.floor(targetW_px / effectiveStepX);
    const outH = Math.floor(targetH_px / effectiveStepY);
    
    const grid = new Float32Array(outW * outH);
    
    // Helper to get Z from original image (Gray value 0-255 normalized to 0-1)
    const getZ = (x: number, y: number): number => {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;
        return data[(y * width + x) * 4] / 255.0;
    };

    // 2. Collection points for Plane Fitting (Reference Planes)
    const fitPoints: {x: number, y: number, z: number}[] = [];

    // Helper to map Output Grid Coordinates (gx, gy) back to Source Image Coordinates (sx, sy)
    const mapGridToSource = (gx: number, gy: number): {sx: number, sy: number} => {
        // 1. Scale up to Target Pixel Space using effective steps
        const tx = gx * effectiveStepX;
        const ty = gy * effectiveStepY;
        
        // 2. Inverse Rotation to get Source Pixel
        let sx = 0, sy = 0;
        if (rotation === 0) {
            sx = tx; sy = ty;
        } else if (rotation === 90) {
            // 90 deg CW: x' = H-1-y, y' = x
            // Inverse: x = y', y = H-1-x'
            // Here tx is x', ty is y'
            sx = ty; sy = srcH - 1 - tx;
        } else if (rotation === 180) {
            sx = srcW - 1 - tx; sy = srcH - 1 - ty;
        } else if (rotation === -90) {
             // -90 deg (270 CW): x' = y, y' = W-1-x
             // Inverse: x = W-1-y', y = x'
             sx = srcW - 1 - ty; sy = tx;
        }
        return { sx, sy };
    };

    // 3. Build the Grid & Collect Reference Points
    // We iterate the OUTPUT grid
    for (let gy = 0; gy < outH; gy++) {
        for (let gx = 0; gx < outW; gx++) {
            const { sx, sy } = mapGridToSource(gx, gy);
            const z = getZ(Math.floor(sx), Math.floor(sy));
            
            const idx = gy * outW + gx;
            grid[idx] = z; // Store raw Z temporarily (0-1)

            // Check if this source pixel falls into any Reference Plane ROI
            for (const ref of references) {
                // references are in Source Image Coordinates
                if (sx >= ref.x && sx < ref.x + ref.w && sy >= ref.y && sy < ref.y + ref.h) {
                    // Add to fitting. Note: ref.offsetZ is in mm, z is 0-1. 
                    // We should fit based on RAW Z (0-1) and then apply scale? 
                    // OR convert everything to MM first?
                    // Let's assume fitting happens in normalized space (0-1) to find the plane, 
                    // then we subtract plane, THEN scale to mm.
                    // BUT ref.offsetZ is likely in mm. 
                    // To be safe, let's normalize ref.offsetZ by dividing by zScale if zScale != 0.
                    // Or better: Convert Z to mm first, then fit.
                    
                    const zMM = z * (zScale || 1);
                    fitPoints.push({ x: gx, y: gy, z: zMM - ref.offsetZ });
                }
            }
        }
    }

    // 4. Fit Plane
    // If we have points, we fit. The Z values in fitPoints are in MM (if we did the conversion above).
    // So the plane equation will result in Z_plane in MM.
    let plane = fitPlane(fitPoints);
    if (!plane) {
        plane = [0, 0, 0];
    }
    const [a, b, c] = plane;

    // 5. Level Data & Construct Physical Coordinates
    let minZ = Infinity, maxZ = -Infinity;
    
    // Physical steps (mm)
    const mmPerPixelX = effectiveWidthMM / targetW_px;
    const mmPerPixelY = effectiveHeightMM / targetH_px;
    
    const xs = new Float32Array(outW);
    const ys = new Float32Array(outH);

    for (let i = 0; i < outW; i++) xs[i] = i * effectiveStepX * mmPerPixelX;
    for (let i = 0; i < outH; i++) ys[i] = i * effectiveStepY * mmPerPixelY;

    // Scale factor for Z
    const scale = zScale || 1;

    for (let i = 0; i < grid.length; i++) {
        const gx = i % outW;
        const gy = Math.floor(i / outW);
        
        const rawZNorm = grid[i]; // 0-1
        
        let correctedZ: number;

        if (fitPoints.length > 0) {
            // We fitted in MM space
            const rawZMM = rawZNorm * scale;
            const planeZ = a * gx + b * gy + c;
            correctedZ = rawZMM - planeZ;
        } else {
            // No reference, just scale
            correctedZ = rawZNorm * scale;
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
