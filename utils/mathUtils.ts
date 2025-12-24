
/**
 * Calculates the perpendicular distance from a point (px, py) to a line defined by two points (x1, y1) and (x2, y2).
 */
export const pointToLineDistance = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const proj = projectPointOntoLine(px, py, x1, y1, x2, y2);
    const dx = px - proj.x;
    const dy = py - proj.y;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  /**
   * Projects point (px, py) onto the infinite line defined by (x1, y1) and (x2, y2).
   * Returns the coordinates {x, y} of the projected point.
   */
  export const projectPointOntoLine = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): {x: number, y: number} => {
    // 1. 处理垂直线的情况 (x1 == x2)
    if (Math.abs(x2 - x1) < 1e-6) {
      return { x: x1, y: py };
    }

    // 2. 使用向量投影法计算垂足
    // 向量 AB
    const dx = x2 - x1;
    const dy = y2 - y1;
    // 参数 t = ((C - A) · AB) / |AB|^2
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);

    // 垂足 P = A + t * AB
    const pX = x1 + t * dx;
    const pY = y1 + t * dy;

    return {
        x: pX,
        y: pY
    };
  };
  
  /**
   * Helper to format numbers compactly
   */
  export const fmt = (n: number, d: number = 2) => n.toFixed(d);

  /**
   * Solves a 3x3 linear system A * x = B using Matrix Inversion.
   * A is flattened [a00, a01, a02, a10, ...], B is [b0, b1, b2]
   * Returns [x, y, z] or null if singular.
   */
  export const solve3x3 = (A: number[], B: number[]): [number, number, number] | null => {
    // A = [ a, b, c, d, e, f, g, h, k ]
    const [a, b, c, d, e, f, g, h, k] = A;
    
    // Determinant
    const det = a*(e*k - f*h) - b*(d*k - f*g) + c*(d*h - e*g);
    if (Math.abs(det) < 1e-9) return null; // Singular

    const invDet = 1.0 / det;

    // Inverse Matrix Elements
    const A00 = (e*k - f*h) * invDet;
    const A01 = (c*h - b*k) * invDet;
    const A02 = (b*f - c*e) * invDet;
    const A10 = (f*g - d*k) * invDet;
    const A11 = (a*k - c*g) * invDet;
    const A12 = (c*d - a*f) * invDet;
    const A20 = (d*h - e*g) * invDet;
    const A21 = (b*g - a*h) * invDet;
    const A22 = (a*e - b*d) * invDet;

    const x = A00*B[0] + A01*B[1] + A02*B[2];
    const y = A10*B[0] + A11*B[1] + A12*B[2];
    const z = A20*B[0] + A21*B[1] + A22*B[2];

    return [x, y, z];
  };

  /**
   * Fits a plane Z = ax + by + c to a set of points using Least Squares.
   * Returns coefficients [a, b, c].
   */
  export const fitPlane = (points: {x: number, y: number, z: number}[]): [number, number, number] | null => {
      const N = points.length;
      if (N < 3) return null;

      let sumX = 0, sumY = 0, sumZ = 0;
      let sumXX = 0, sumYY = 0, sumXY = 0;
      let sumXZ = 0, sumYZ = 0;

      for (let i = 0; i < N; i++) {
          const { x, y, z } = points[i];
          sumX += x;
          sumY += y;
          sumZ += z;
          sumXX += x * x;
          sumYY += y * y;
          sumXY += x * y;
          sumXZ += x * z;
          sumYZ += y * z;
      }

      // Matrix A^T * A
      // [ sumXX, sumXY, sumX ]
      // [ sumXY, sumYY, sumY ]
      // [ sumX,  sumY,  N    ]
      const Matrix = [
          sumXX, sumXY, sumX,
          sumXY, sumYY, sumY,
          sumX,  sumY,  N
      ];

      // Vector A^T * B
      // [ sumXZ ]
      // [ sumYZ ]
      // [ sumZ  ]
      const Vector = [ sumXZ, sumYZ, sumZ ];

      return solve3x3(Matrix, Vector);
  };
