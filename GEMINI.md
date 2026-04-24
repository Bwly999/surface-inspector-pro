# Surface Inspector Pro - Project Context

## Project Overview
**Surface Inspector Pro** (v3.0) is a specialized web-based application designed for **surface metrology and micro-topography analysis**. It allows users to visualize, measure, and analyze 3D surface data (point clouds) through interactive 2D and 3D interfaces.

## Tech Stack
*   **Core:** React 19, TypeScript, Vite
*   **Package Manager:** pnpm
*   **Visualization:** Three.js (3D), HTML5 Canvas (2D)
*   **Charting:** ECharts
*   **Styling:** Tailwind CSS (Utility classes) + Custom CSS animations
*   **Icons:** Lucide React
*   **State Management:** React Hooks (`useState`, `useContext`, custom `useLocalStorage`)

## Architecture & Key Concepts

### Data Model (`types.ts`)
The core data structure is **`GridData`**:
*   `data`: Flat Float32Array representing Z-heights.
*   `w`, `h`: Width and height of the grid.
*   `minZ`, `maxZ`: Vertical range for normalization.
*   `xs`, `ys`: Optional real-world coordinates.

### Main Components
*   **`App.tsx`**: The application root. Handles global state (Grid data, selections, markers, tool modes) and orchestrates layout.
*   **`components/ThreeDViewer.tsx`**: 
    *   Uses **Three.js** to render the surface.
    *   Implements an **Orthographic Camera** for precise inspection.
    *   Features a custom mesh generation strategy using `PlaneGeometry` with vertex colors derived from Z-heights.
    *   Includes "Contrast" control to exaggerate Z-axis relief.
*   **`components/Surface2DCanvas.tsx`**:
    *   Renders a high-performance 2D heatmap/heightmap.
    *   Handles interactive tools: Box Selection, Line Measurement (2-click), Pan/Zoom, Keyboard Picking ('T' key).
*   **`components/ProfileChart.tsx`**:
    *   Displays cross-sectional signal profiles based on user selection (Horizontal/Vertical cuts).
    *   Supports physical measurement tools (ΔZ, ΔXY, P2L).

### Data Flow
1.  **Input:** User imports CSV or Image.
2.  **Processing:** `utils/dataUtils.ts` parses CSV or converts Image -> Point Cloud (`GridData`).
3.  **State:** `App.tsx` updates the `grid` state.
4.  **Render:** 
    *   `ThreeDViewer` rebuilds the 3D mesh.
    *   `Surface2DCanvas` repaints the heatmap.
    *   `ProfileChart` updates based on `boxSel` or `lineSel` (Region of Interest).

## Development Workflow

### Scripts
*   **Install Dependencies:** `pnpm install`
*   **Start Dev Server:** `pnpm run dev` (Runs on Vite)
*   **Build for Production:** `pnpm run build`
*   **Preview Build:** `pnpm run preview`

### Directory Structure
```
/
├── components/         # UI & Visualization Components
│   ├── ThreeDViewer.tsx    # 3D Surface View
│   ├── Surface2DCanvas.tsx # 2D Heatmap View
│   ├── ProfileChart.tsx    # Signal Analysis
│   └── ...
├── hooks/              # Custom React Hooks (e.g., useLocalStorage)
├── utils/              # Logic for Math, Color, & Data Processing
├── types.ts            # TypeScript Definitions (Shared interfaces)
├── App.tsx             # Main Layout & State Container
└── constants.ts        # Config (Theme colors, Map options)
```

## Coding Conventions
*   **Styling:** Heavy reliance on **Tailwind CSS** for layout and spacing. Custom animations (`@keyframes`) are defined in `<style>` blocks within components (e.g., `App.tsx`).
*   **Performance:**
    *   Use `React.memo` for heavy visualization components.
    *   Use `Float32Array` for handling large datasets.
    *   Throttle/Debounce render-intensive operations where possible.
*   **UI/UX:** "Industrial" aesthetic with a high-contrast palette (Dark/Orange/White).
