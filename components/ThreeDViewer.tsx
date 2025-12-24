import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GridData, SelectionBox, SelectionLine, ToolType, ViewMode, Marker, CameraView, ColorSettings } from '../types';
import { getColor as getColorFunc } from '../utils/colorUtils';
import { THEME } from '../constants';
import { Box, Settings, Sliders, Monitor } from 'lucide-react';

interface ThreeDViewerProps {
  grid: GridData;
  boxSel: SelectionBox;
  lineSel: SelectionLine;
  tool: ToolType;
  colorMap: string;
  viewMode: ViewMode;
  gradientMap: Float32Array | null;
  markers: Marker[];
  showMarkers: boolean;
  selectedMarkerId: string | null;
  colorSettings: ColorSettings;
  contrast: number;
  onContrastChange: (val: number) => void;
  tempMarker: { gridX: number, gridY: number, z: number } | null;
  hoverMarker: { gridX: number, gridY: number, z: number } | null;
}

const ThreeDViewer = React.memo(({ 
    grid, boxSel, lineSel, tool, colorMap, viewMode, gradientMap, markers, showMarkers, selectedMarkerId, colorSettings, contrast, onContrastChange, tempMarker, hoverMarker
}: ThreeDViewerProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    mesh: THREE.Mesh;
    markerGroup: THREE.Group;
    ghostMarkerGroup: THREE.Group;
    controls: OrbitControls;
  } | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [isAltLocked, setIsAltLocked] = useState(false);
  const [maxContrastRange, setMaxContrastRange] = useState(10.0);

  // --- Camera Control Logic ---
  const setCameraView = (view: CameraView) => {
      if (!sceneRef.current) return;
      const { camera, controls } = sceneRef.current;
      const d = 30; // camera frustum size roughly
      const dist = 50;

      controls.reset();
      
      switch(view) {
          case 'top':
              camera.position.set(0, dist, 0);
              camera.lookAt(0, 0, 0);
              break;
          case 'front':
              camera.position.set(0, 0, dist);
              camera.lookAt(0, 0, 0);
              break;
          case 'side':
              camera.position.set(dist, 0, 0);
              camera.lookAt(0, 0, 0);
              break;
          case 'iso':
          default:
              camera.position.set(20, 30, 20);
              camera.lookAt(0, 0, 0);
              break;
      }
      controls.update();
  };

  // --- Alt Key Interaction Logic (Lock Polar Angle) ---
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
        if (!sceneRef.current) return;
        const { controls } = sceneRef.current;

        if (e.key === 'Alt') {
            if (e.type === 'keydown') {
                if (!isAltLocked) {
                    setIsAltLocked(true);
                    // Lock the Polar Angle to the current elevation
                    const currentPolar = controls.getPolarAngle();
                    controls.minPolarAngle = currentPolar;
                    controls.maxPolarAngle = currentPolar;
                }
            } else if (e.type === 'keyup') {
                setIsAltLocked(false);
                // Reset limits to allow full orbit again
                controls.minPolarAngle = 0;
                controls.maxPolarAngle = Math.PI;
            }
        }
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);

    return () => {
        window.removeEventListener('keydown', handleKey);
        window.removeEventListener('keyup', handleKey);
    };
  }, [isAltLocked]);


  useEffect(() => {
    if (!mountRef.current) return;

    // --- Init Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THEME.bg);
    
    // Initial sizes
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const aspect = width / height;
    const d = 30;

    const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
    camera.position.set(20, 30, 20);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN // Standard mapping
    };

    // Lights
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 20, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // Base Mesh
    const geo = new THREE.PlaneGeometry(40, 40, 100, 100);
    const mat = new THREE.MeshStandardMaterial({ 
      vertexColors: true, 
      side: THREE.DoubleSide, 
      flatShading: false, 
      metalness: 0.1, 
      roughness: 0.6 
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);

    // Marker Groups
    const markerGroup = new THREE.Group();
    mesh.add(markerGroup);
    
    const ghostMarkerGroup = new THREE.Group();
    mesh.add(ghostMarkerGroup);

    scene.add(new THREE.GridHelper(50, 50, 0xaaaaaa, 0xdddddd));

    sceneRef.current = { scene, camera, renderer, mesh, markerGroup, ghostMarkerGroup, controls };

    // Animation Loop
    let rAF: number;
    let time = 0;
    const animate = () => {
      rAF = requestAnimationFrame(animate);
      time += 0.05;
      
      // Pulse animation for ghost markers
      ghostMarkerGroup.children.forEach(child => {
          const isTemp = child.userData.isTemp;
          if (isTemp) {
              const s = 1 + Math.sin(time) * 0.2;
              child.scale.set(s, s, s);
              // @ts-ignore
              if (child.material) child.material.opacity = 0.5 + Math.sin(time) * 0.3;
          }
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Responsive Handling
    const resizeObserver = new ResizeObserver((entries) => {
        if(!sceneRef.current) return;
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            const newAspect = width / height;
            sceneRef.current.camera.left = -d * newAspect;
            sceneRef.current.camera.right = d * newAspect;
            sceneRef.current.camera.top = d;
            sceneRef.current.camera.bottom = -d;
            sceneRef.current.camera.updateProjectionMatrix();
            sceneRef.current.renderer.setSize(width, height);
        }
    });

    resizeObserver.observe(mountRef.current);

    return () => {
      cancelAnimationFrame(rAF);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, []); 

  // Update Geometry/Colors when data or contrast changes
  useEffect(() => {
    if (!sceneRef.current || !grid.data) return;
    const { mesh } = sceneRef.current;

    let rx = 0, ry = 0, rw = grid.w, rh = grid.h;
    if (tool === 'box' && boxSel.w > 0) {
      rx = Math.floor(boxSel.x); ry = Math.floor(boxSel.y);
      rw = Math.floor(boxSel.w); rh = Math.floor(boxSel.h);
    }
    
    rw = Math.max(2, rw);
    rh = Math.max(2, rh);

    const segX = Math.min(rw, 150);
    const segY = Math.min(rh, 150);

    mesh.geometry.dispose();
    const geo = new THREE.PlaneGeometry(40, 40 * (rh / rw), segX - 1, segY - 1);
    const count = geo.attributes.position.count;
    const colors: number[] = [];
    const positions = geo.attributes.position;

    const isGradient = viewMode === 'gradient';
    const sourceData = isGradient && gradientMap ? gradientMap : grid.data;
    const range = grid.maxZ - grid.minZ || 1;

    const cMin = colorSettings.mode === 'absolute' ? colorSettings.min : (isGradient ? 0 : grid.minZ);
    const cMax = colorSettings.mode === 'absolute' ? colorSettings.max : (isGradient ? 1 : grid.maxZ);

    // Apply contrast to Z-Height scaling:
    // Base scale is 15. We multiply by contrast to exaggerate the peaks/valleys when contrast is high.
    const zScale = 15 * contrast;

    for (let i = 0; i < count; i++) {
      const ix = i % segX;
      const iy = Math.floor(i / segX);
      const dx = rx + Math.floor(ix * (rw / segX));
      const dy = ry + Math.floor(iy * (rh / segY));

      let rawVal = 0;
      let heightVal = 0;

      if (dx < grid.w && dy < grid.h) {
        const idx = dy * grid.w + dx;
        rawVal = sourceData[idx] || 0;
        heightVal = grid.data[idx] || 0;
      }

      const normalizedHeight = (heightVal - grid.minZ) / range;
      positions.setZ(i, normalizedHeight * zScale);

      const [r, g, b] = getColorFunc(rawVal, colorMap, cMin, cMax);
      
      const applyContrast = (c: number) => {
          return Math.max(0, Math.min(255, (c - 128) * contrast + 128));
      };

      colors.push(applyContrast(r) / 255, applyContrast(g) / 255, applyContrast(b) / 255);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    mesh.geometry = geo;

  }, [grid, boxSel, lineSel, tool, colorMap, viewMode, gradientMap, colorSettings, contrast]);

  // Update Markers Visibility & Position (Regular & Ghost)
  useEffect(() => {
      if (!sceneRef.current) return;
      const { markerGroup, ghostMarkerGroup } = sceneRef.current;
      
      markerGroup.visible = showMarkers;

      while (markerGroup.children.length > 0) markerGroup.remove(markerGroup.children[0]);
      while (ghostMarkerGroup.children.length > 0) ghostMarkerGroup.remove(ghostMarkerGroup.children[0]);

      let rx = 0, ry = 0, rw = grid.w, rh = grid.h;
      if (tool === 'box' && boxSel.w > 0) {
        rx = Math.floor(boxSel.x); ry = Math.floor(boxSel.y);
        rw = Math.floor(boxSel.w); rh = Math.floor(boxSel.h);
      }
      rw = Math.max(2, rw); rh = Math.max(2, rh);
      
      const width = 40;
      const height = 40 * (rh/rw);
      const range = grid.maxZ - grid.minZ || 1;
      const zScale = 15 * contrast; // Must match the mesh scaling

      const getPos = (gx: number, gy: number, zVal: number) => {
           if (gx < rx || gx > rx + rw || gy < ry || gy > ry + rh) return null;
           const relX = (gx - rx) / rw;
           const relY = (gy - ry) / rh;
           const x = (relX - 0.5) * width;
           const y = (0.5 - relY) * height;
           const z = ((zVal - grid.minZ) / range) * zScale;
           return { x, y, z };
      };

      if (showMarkers) {
          markers.forEach(m => {
              const pos = getPos(m.gridX, m.gridY, m.z);
              if (pos) {
                  const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16);
                  const color = m.id === selectedMarkerId ? THEME.primary : (m.type === 'measure' ? THEME.measure : THEME.accent);
                  const sphereMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
                  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
                  sphere.position.set(pos.x, pos.y, pos.z + 0.5); 
                  markerGroup.add(sphere);
              }
          });
      }

      if (tempMarker) {
          const pos = getPos(tempMarker.gridX, tempMarker.gridY, tempMarker.z);
          if (pos) {
              const sphereGeo = new THREE.SphereGeometry(0.8, 16, 16);
              const sphereMat = new THREE.MeshBasicMaterial({ 
                  color: THEME.primary, 
                  transparent: true, 
                  opacity: 0.6,
                  wireframe: true 
              });
              const sphere = new THREE.Mesh(sphereGeo, sphereMat);
              sphere.position.set(pos.x, pos.y, pos.z + 0.5);
              sphere.userData = { isTemp: true };
              ghostMarkerGroup.add(sphere);
          }
      }

      if (hoverMarker) {
          const pos = getPos(hoverMarker.gridX, hoverMarker.gridY, hoverMarker.z);
          if (pos) {
              const sphereGeo = new THREE.SphereGeometry(0.6, 16, 16);
              const sphereMat = new THREE.MeshBasicMaterial({ 
                  color: '#00ff00', 
                  wireframe: true,
                  transparent: true,
                  opacity: 0.8
              });
              const sphere = new THREE.Mesh(sphereGeo, sphereMat);
              sphere.position.set(pos.x, pos.y, pos.z + 0.5);
              sphere.userData = { isTemp: false };
              ghostMarkerGroup.add(sphere);
          }
      }

  }, [markers, showMarkers, selectedMarkerId, grid, boxSel, tool, tempMarker, hoverMarker, contrast]); 

  return (
    <div ref={containerRef} className="relative w-full h-full group touch-none">
        <div ref={mountRef} className="w-full h-full" />
        
        {/* Top Left: 3D Settings */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-2 z-10 pointer-events-auto">
             <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1.5 border-2 rounded shadow-sm transition-all duration-200 active:scale-95 ${showSettings ? 'bg-black text-white border-black rotate-90' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}
                title="3D Visual Settings"
             >
                <Settings size={14} />
             </button>
             
             {showSettings && (
                 <div className="bg-white/95 backdrop-blur border-2 border-gray-300 p-3 rounded shadow-lg flex flex-col gap-3 w-64 animate-scale-in origin-top-left">
                     <div className="flex items-center gap-2 text-xs font-bold text-gray-600 border-b pb-2">
                         <Sliders size={12} /> CONTRAST & RELIEF CONTROL
                     </div>
                     
                     {/* Slider Section */}
                     <div>
                        <div className="flex justify-between text-[10px] text-gray-500 font-bold mb-1">
                            <span>INTENSITY</span>
                            <span>{contrast.toFixed(1)}x</span>
                        </div>
                        <input 
                            type="range" min="0.1" max={maxContrastRange} step="0.1"
                            value={contrast}
                            onChange={e => onContrastChange(parseFloat(e.target.value))}
                            className="w-full accent-[#ff4d00] cursor-pointer"
                        />
                     </div>

                     {/* Precise Inputs */}
                     <div className="grid grid-cols-2 gap-3">
                         <div>
                             <label className="text-[9px] font-bold text-gray-500 block mb-1">CURRENT VALUE</label>
                             <div className="flex items-center border border-gray-300 rounded bg-white hover:border-gray-400 transition-colors">
                                <input 
                                    type="number" 
                                    step="0.1"
                                    min="0.1"
                                    value={contrast}
                                    onChange={e => onContrastChange(parseFloat(e.target.value))}
                                    className="w-full p-1.5 text-xs font-mono outline-none bg-transparent"
                                />
                                <span className="text-[10px] text-gray-400 pr-1">x</span>
                             </div>
                         </div>
                         <div>
                             <label className="text-[9px] font-bold text-gray-500 block mb-1">MAX LIMIT</label>
                             <div className="flex items-center border border-gray-300 rounded bg-white hover:border-gray-400 transition-colors">
                                <input 
                                    type="number" 
                                    step="1.0"
                                    min="1.0"
                                    value={maxContrastRange}
                                    onChange={e => setMaxContrastRange(parseFloat(e.target.value))}
                                    className="w-full p-1.5 text-xs font-mono outline-none bg-transparent"
                                />
                                <span className="text-[10px] text-gray-400 pr-1">x</span>
                             </div>
                         </div>
                     </div>

                     <div className="text-[9px] text-gray-400 border-t pt-2 mt-1 leading-tight">
                        ADJUSTS Z-AXIS EXAGGERATION AND COLOR SEPARATION. <br/>
                        HOLD <span className="font-bold text-black">ALT</span> + DRAG TO ROTATE AROUND Z-AXIS.
                     </div>
                 </div>
             )}
        </div>

        {/* Top Right: Camera Controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 bg-white/80 p-1 rounded border shadow-sm transition-all duration-300 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 pointer-events-auto">
            <button onClick={() => setCameraView('iso')} className="p-1 hover:bg-gray-200 rounded transition-colors" title="Isometric"><Box size={16}/></button>
            <button onClick={() => setCameraView('top')} className="p-1 hover:bg-gray-200 rounded transition-colors" title="Top View"><div className="w-4 h-4 border-2 border-black"></div></button>
            <button onClick={() => setCameraView('front')} className="p-1 hover:bg-gray-200 rounded transition-colors" title="Front View"><Monitor size={16} /></button>
        </div>

        {isAltLocked && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 animate-scale-in">
                <div className="bg-black/50 text-white px-3 py-1 rounded text-xs font-bold backdrop-blur">
                    Z-AXIS LOCKED
                </div>
            </div>
        )}
    </div>
  );
});

export default ThreeDViewer;