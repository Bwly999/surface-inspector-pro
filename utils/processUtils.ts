
import { ConverterConfig, GridData } from '../types';
import { fitPlane } from './mathUtils';

export const processImageToGrid = (
    imgData: ImageData,
    config: ConverterConfig
): GridData => {
    const { width, height, data } = imgData;
    const { widthMM, heightMM, stepX, stepY, rotation, references } = config;

    // 1. Determine Target Dimensions based on Rotation & Sampling
    let srcW = width;
    let srcH = height;
    
    // Logic to handle rotation coordinate mapping
    // 0: x'=x, y'=y
    // 90: x'=y, y'=H-1-x (Dims swapped)
    // 180: x'=W-1-x, y'=H-1-y
    // -90: x'=W-1-y, y'=x (Dims swapped)
    
    const isRotated = rotation === 90 || rotation === -90;
    const targetW_px = isRotated ? srcH : srcW;
    const targetH_px = isRotated ? srcW : srcH;

    // Output Grid Dimensions
    const outW = Math.floor(targetW_px / stepX);
    const outH = Math.floor(targetH_px / stepY);
    
    const grid = new Float32Array(outW * outH);
    
    // Helper to get Z from original image (Gray value 0-255 normalized to 0-1)
    // We assume the image is grayscale, so R=G=B. We take Red channel.
    const getZ = (x: number, y: number): number => {
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;
        return data[(y * width + x) * 4] / 255.0;
    };

    // 2. Collection points for Plane Fitting (Reference Planes)
    const fitPoints: {x: number, y: number, z: number}[] = [];

    // Helper to map Output Grid Coordinates (gx, gy) back to Source Image Coordinates (sx, sy)
    const mapGridToSource = (gx: number, gy: number): {sx: number, sy: number} => {
        // 1. Scale up to Target Pixel Space
        const tx = gx * stepX;
        const ty = gy * stepY;
        
        // 2. Inverse Rotation to get Source Pixel
        let sx = 0, sy = 0;
        if (rotation === 0) {
            sx = tx; sy = ty;
        } else if (rotation === 90) {
            // Target X (was Source Y), Target Y (was Source H - X)
            // tx = y, ty = W - x  =>  y = tx, x = W - ty
            // Actually: 90 deg clockwise: (x, y) -> (H-1-y, x) ? No, standard image rotation
            // Let's stick to standard canvas rotation logic:
            // 90 deg CW: (x, y) -> (height - 1 - y, x) ??
            // Let's implement simpler:
            // 90: sx = ty, sy = srcH - 1 - tx
            sx = ty; sy = srcH - 1 - tx;
        } else if (rotation === 180) {
            sx = srcW - 1 - tx; sy = srcH - 1 - ty;
        } else if (rotation === -90) {
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
            grid[idx] = z; // Store raw Z temporarily

            // Check if this source pixel falls into any Reference Plane ROI
            for (const ref of references) {
                // references are in Source Image Coordinates
                if (sx >= ref.x && sx < ref.x + ref.w && sy >= ref.y && sy < ref.y + ref.h) {
                    // Add to fitting, subtracting the offset (we want the base plane to be at Z=0 relative to the offset)
                    // We fit the plane to (gx, gy, z - offset)
                    fitPoints.push({ x: gx, y: gy, z: z - ref.offsetZ });
                }
            }
        }
    }

    // 4. Fit Plane
    // Z_plane = a*gx + b*gy + c
    let plane = fitPlane(fitPoints);
    if (!plane) {
        // Fallback: Flat plane at average height if no refs or calc fails
        // Or just Z=0 plane (c=0)
        plane = [0, 0, 0];
        console.warn("Could not fit plane, using default 0");
    }
    const [a, b, c] = plane;

    // 5. Level Data & Construct Physical Coordinates
    let minZ = Infinity, maxZ = -Infinity;
    
    // Physical steps (mm)
    const mmPerPixelX = widthMM / targetW_px;
    const mmPerPixelY = heightMM / targetH_px;
    
    // We want the physical coordinates to match the grid
    const xs = new Float32Array(outW);
    const ys = new Float32Array(outH);

    for (let i = 0; i < outW; i++) xs[i] = i * stepX * mmPerPixelX;
    for (let i = 0; i < outH; i++) ys[i] = i * stepY * mmPerPixelY;

    for (let i = 0; i < grid.length; i++) {
        const gx = i % outW;
        const gy = Math.floor(i / outW);
        
        const rawZ = grid[i];
        const planeZ = a * gx + b * gy + c;
        const correctedZ = rawZ - planeZ;
        
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
