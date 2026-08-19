import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type SculptureState = 
  | 'idle' 
  | 'listening' 
  | 'transcribing'
  | 'retrieving'
  | 'verifying'
  | 'answering' 
  | 'success' 
  | 'insufficient' 
  | 'error';

interface LivingSculptureProps {
  state: SculptureState;
  audioVolume?: number; // 0.0 to 1.0 real mic volume
  onClick?: () => void;
  timerSeconds?: number;
}

export default function LivingSculpture({
  state,
  audioVolume = 0,
  onClick,
  timerSeconds
}: LivingSculptureProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasFallbackRef = useRef<HTMLCanvasElement | null>(null);
  const [webGlSupported, setWebGlSupported] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const coreMeshRef = useRef<THREE.Mesh | null>(null);
  const outerGlassRef = useRef<THREE.Mesh | null>(null);
  const fluidRibbonGroupRef = useRef<THREE.Group | null>(null);
  const particleAuraRef = useRef<THREE.Points | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Parallax mouse position
  const mouseCoords = useRef({ currentX: 0, currentY: 0, targetX: 0, targetY: 0 });

  const uniformsRef = useRef<{
    uTime: { value: number };
    uAudioAmp: { value: number };
    uStateIndex: { value: number };
    uColorCore: { value: THREE.Color };
    uColorGlow: { value: THREE.Color };
    uColorRim: { value: THREE.Color };
  } | null>(null);

  // High-End State Palette Matrix (Deep Void + Refined Chromatic Accents)
  const stateMatrix: Record<SculptureState, {
    core: string;
    glow: string;
    rim: string;
    rotationRate: number;
    stateIndex: number;
    statusLabel: string;
    subLabel: string;
  }> = {
    idle: {
      core: '#032b21',
      glow: '#059669',
      rim: '#06b6d4',
      rotationRate: 0.6,
      stateIndex: 0,
      statusLabel: 'Voice & Evidence Engine Active',
      subLabel: 'Tap sculpture or speak in 5 Indian languages'
    },
    listening: {
      core: '#034563',
      glow: '#0284c7',
      rim: '#38bdf8',
      rotationRate: 2.2,
      stateIndex: 1,
      statusLabel: timerSeconds !== undefined ? `Listening... 00:${timerSeconds.toString().padStart(2, '0')}` : 'Listening...',
      subLabel: 'Speak naturally • Tap when finished'
    },
    transcribing: {
      core: '#1e1b4b',
      glow: '#6366f1',
      rim: '#38bdf8',
      rotationRate: 3.2,
      stateIndex: 2,
      statusLabel: 'Understanding Speech…',
      subLabel: 'Sarvam Saaras v3 decoding audio buffer'
    },
    retrieving: {
      core: '#022c22',
      glow: '#06b6d4',
      rim: '#10b981',
      rotationRate: 2.8,
      stateIndex: 3,
      statusLabel: 'Searching MSMARCO-XI Evidence…',
      subLabel: 'Executing dense vector + BM25 hybrid retrieval'
    },
    verifying: {
      core: '#451a03',
      glow: '#d97706',
      rim: '#fbbf24',
      rotationRate: 2.0,
      stateIndex: 4,
      statusLabel: 'Auditing Grounding & Citations…',
      subLabel: 'Verifying relevance threshold (0.35) & entity coverage'
    },
    answering: {
      core: '#064e3b',
      glow: '#10b981',
      rim: '#34d399',
      rotationRate: 1.4,
      stateIndex: 5,
      statusLabel: 'Synthesizing Grounded Answer…',
      subLabel: 'Gemini generating strictly supported response'
    },
    success: {
      core: '#064e3b',
      glow: '#10b981',
      rim: '#6ee7b7',
      rotationRate: 0.7,
      stateIndex: 6,
      statusLabel: 'Grounded in Evidence',
      subLabel: 'All claims verified with cited passages'
    },
    insufficient: {
      core: '#4c0519',
      glow: '#e11d48',
      rim: '#fb7185',
      rotationRate: 0.5,
      stateIndex: 7,
      statusLabel: 'Insufficient Evidence',
      subLabel: 'No verified source in index to support answer'
    },
    error: {
      core: '#450a0a',
      glow: '#dc2626',
      rim: '#f87171',
      rotationRate: 1.2,
      stateIndex: 8,
      statusLabel: 'Pipeline Interrupted',
      subLabel: 'Tap sculpture to retry'
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || 360;
    const height = container.clientHeight || 360;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch (e) {
      console.warn('[LivingSculpture] WebGL failed, using 2D fallback:', e);
      setWebGlSupported(false);
      return;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.z = 4.6;
    cameraRef.current = camera;

    // Advanced 3D Simplex Fluid Vertex Shader
    const vertexShader = `
      uniform float uTime;
      uniform float uAudioAmp;
      uniform float uStateIndex;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vDisplacement;

      vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

      float snoise(vec3 v){
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + 1.0 * C.xxx;
        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
        vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
        i = mod(i, 289.0 );
        vec4 p = permute( permute( permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
      }

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;

        float freq = 1.4;
        float speed = 0.7;
        float amp = 0.14 + (uAudioAmp * 0.55);

        // Responsive states
        if (uStateIndex > 1.5 && uStateIndex < 4.5) {
          freq = 2.4;
          speed = 1.6;
          amp = 0.22;
        }

        float n = snoise(position * freq + vec3(uTime * speed));
        vDisplacement = n;

        vec3 displaced = position + normal * (n * amp);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `;

    // Volumetric Refractive Glass Fragment Shader
    const fragmentShader = `
      uniform float uTime;
      uniform float uAudioAmp;
      uniform vec3 uColorCore;
      uniform vec3 uColorGlow;
      uniform vec3 uColorRim;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vDisplacement;

      void main() {
        vec3 view = normalize(-vPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.4);

        // Core dynamic color flow
        vec3 core = mix(uColorCore, uColorGlow, vDisplacement * 0.5 + 0.5);
        vec3 col = mix(core, uColorRim, fresnel);

        // Internal harmonic pulse
        float pulse = 0.5 + 0.5 * sin(uTime * 1.6 + vDisplacement * 2.8);
        col += uColorGlow * pulse * 0.35;

        // Audio reactivity highlight
        col += uColorRim * (uAudioAmp * 0.7);

        float alpha = 0.76 + (fresnel * 0.24) + (uAudioAmp * 0.15);
        gl_FragColor = vec4(col, min(0.97, alpha));
      }
    `;

    const config = stateMatrix[state];
    const uniforms = {
      uTime: { value: 0 },
      uAudioAmp: { value: audioVolume },
      uStateIndex: { value: config.stateIndex },
      uColorCore: { value: new THREE.Color(config.core) },
      uColorGlow: { value: new THREE.Color(config.glow) },
      uColorRim: { value: new THREE.Color(config.rim) }
    };
    uniformsRef.current = uniforms;

    // 1. Organic Living Core
    const coreGeo = new THREE.IcosahedronGeometry(1.3, 56);
    const coreMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);
    coreMeshRef.current = coreMesh;

    // 2. Multi-Refractive Outer Glass Shell
    const glassGeo = new THREE.SphereGeometry(1.58, 44, 44);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(config.rim),
      transparent: true,
      opacity: 0.14,
      roughness: 0.06,
      metalness: 0.08,
      transmission: 0.94,
      ior: 1.55,
      reflectivity: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });
    const outerGlass = new THREE.Mesh(glassGeo, glassMat);
    scene.add(outerGlass);
    outerGlassRef.current = outerGlass;

    // 3. Flowing Geometric Ribbon Waves
    const ribbonGroup = new THREE.Group();
    const ribbonGeo1 = new THREE.TorusGeometry(1.78, 0.012, 16, 120);
    const ribbonMat1 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(config.rim),
      transparent: true,
      opacity: 0.4
    });
    const ribbon1 = new THREE.Mesh(ribbonGeo1, ribbonMat1);
    ribbon1.rotation.x = Math.PI / 3.2;
    ribbonGroup.add(ribbon1);

    const ribbonGeo2 = new THREE.TorusGeometry(1.88, 0.008, 16, 120);
    const ribbonMat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(config.glow),
      transparent: true,
      opacity: 0.25
    });
    const ribbon2 = new THREE.Mesh(ribbonGeo2, ribbonMat2);
    ribbon2.rotation.y = Math.PI / 4;
    ribbon2.rotation.x = -Math.PI / 5;
    ribbonGroup.add(ribbon2);

    scene.add(ribbonGroup);
    fluidRibbonGroupRef.current = ribbonGroup;

    // 4. Luminous Particle Dust Aura
    const pCount = 160;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const rad = 1.75 + Math.random() * 0.95;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      pPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      pPos[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta);
      pPos[i * 3 + 2] = rad * Math.cos(phi);
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: new THREE.Color(config.glow),
      size: 0.034,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const particleAura = new THREE.Points(pGeo, pMat);
    scene.add(particleAura);
    particleAuraRef.current = particleAura;

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(amb);

    const pLight = new THREE.PointLight(new THREE.Color(config.glow), 3.0, 12);
    pLight.position.set(3, 3, 4);
    scene.add(pLight);

    // Animation Loop with Smooth Parallax
    let clock = new THREE.Clock();
    const renderLoop = () => {
      animFrameRef.current = requestAnimationFrame(renderLoop);
      const t = clock.getElapsedTime();

      // Smooth mouse tilt
      mouseCoords.current.currentX += (mouseCoords.current.targetX - mouseCoords.current.currentX) * 0.06;
      mouseCoords.current.currentY += (mouseCoords.current.targetY - mouseCoords.current.currentY) * 0.06;

      if (uniformsRef.current) {
        uniformsRef.current.uTime.value = t;
      }

      const rotRate = stateMatrix[state]?.rotationRate ?? 0.6;

      if (coreMeshRef.current) {
        coreMeshRef.current.rotation.y = t * 0.25 * rotRate + mouseCoords.current.currentX * 0.45;
        coreMeshRef.current.rotation.x = Math.sin(t * 0.2) * 0.15 - mouseCoords.current.currentY * 0.45;
      }

      if (outerGlassRef.current) {
        outerGlassRef.current.rotation.y = -t * 0.16 * rotRate + mouseCoords.current.currentX * 0.25;
        outerGlassRef.current.rotation.x = mouseCoords.current.currentY * 0.25;
      }

      if (fluidRibbonGroupRef.current) {
        fluidRibbonGroupRef.current.rotation.z = t * 0.32 * rotRate;
        fluidRibbonGroupRef.current.rotation.y = Math.sin(t * 0.22) * 0.25 + mouseCoords.current.currentX * 0.35;
      }

      if (particleAuraRef.current) {
        particleAuraRef.current.rotation.y = t * 0.1 * rotRate;
      }

      renderer.render(scene, camera);
    };

    renderLoop();

    // Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        if (newW > 0 && newH > 0 && rendererRef.current && cameraRef.current) {
          rendererRef.current.setSize(newW, newH);
          cameraRef.current.aspect = newW / newH;
          cameraRef.current.updateProjectionMatrix();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (rendererRef.current && rendererRef.current.domElement && container) {
        try {
          container.removeChild(rendererRef.current.domElement);
        } catch (e) {}
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Update uniforms when state or volume changes
  useEffect(() => {
    if (!uniformsRef.current) return;
    const config = stateMatrix[state];

    uniformsRef.current.uColorCore.value.set(config.core);
    uniformsRef.current.uColorGlow.value.set(config.glow);
    uniformsRef.current.uColorRim.value.set(config.rim);
    uniformsRef.current.uStateIndex.value = config.stateIndex;
    uniformsRef.current.uAudioAmp.value = audioVolume;

    if (outerGlassRef.current && (outerGlassRef.current.material as THREE.MeshPhysicalMaterial)) {
      (outerGlassRef.current.material as THREE.MeshPhysicalMaterial).color.set(config.rim);
    }
  }, [state, audioVolume]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    mouseCoords.current.targetX = x;
    mouseCoords.current.targetY = y;
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    mouseCoords.current.targetX = 0;
    mouseCoords.current.targetY = 0;
  };

  // 2D Fallback
  useEffect(() => {
    if (webGlSupported || !canvasFallbackRef.current) return;
    const canvas = canvasFallbackRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let id: number;
    let t = 0;
    const renderFallback = () => {
      id = requestAnimationFrame(renderFallback);
      t += 0.03;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const baseR = 90;
      const amp = audioVolume * 26;

      const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 140);
      const conf = stateMatrix[state];
      grad.addColorStop(0, conf.core);
      grad.addColorStop(0.65, conf.glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.arc(cx, cy, baseR + amp + Math.sin(t) * 4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = conf.rim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.2 + amp * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    };

    renderFallback();
    return () => cancelAnimationFrame(id);
  }, [webGlSupported, state, audioVolume]);

  const currentConf = stateMatrix[state] || stateMatrix.idle;

  return (
    <div 
      className="sculpture-spatial-stage"
      onClick={onClick}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={handlePointerLeave}
      role="button"
      tabIndex={0}
      aria-label={`${currentConf.statusLabel}: ${currentConf.subLabel}`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Volumetric Radial Glow Atmosphere */}
      <div 
        className="sculpture-volumetric-glow"
        style={{
          background: `radial-gradient(circle, ${currentConf.glow}35 0%, ${currentConf.core}18 45%, transparent 70%)`,
          transform: `scale(${isHovered ? 1.1 : 1.0})`
        }}
      />

      {/* 3D WebGL Canvas Surface */}
      <div 
        ref={containerRef}
        className="sculpture-three-mount"
        style={{ display: webGlSupported ? 'block' : 'none' }}
      />

      {/* 2D Fallback */}
      {!webGlSupported && (
        <canvas 
          ref={canvasFallbackRef}
          width={360}
          height={360}
        />
      )}

      {/* Central Integrated Pulse Glyphs */}
      <div className="sculpture-glyph-overlay">
        {state === 'idle' && (
          <div className="glyph-idle-core">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
        )}

        {state === 'listening' && (
          <div className="glyph-listening-core">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#ffffff">
              <rect x="6" y="6" width="12" height="12" rx="2.5" />
            </svg>
          </div>
        )}

        {(state === 'transcribing' || state === 'retrieving' || state === 'verifying' || state === 'answering') && (
          <div 
            className="glyph-radar-core"
            style={{
              borderTopColor: currentConf.rim,
              borderRightColor: currentConf.glow
            }}
          />
        )}
      </div>

      {/* Dynamic Status Capsule */}
      <div className="sculpture-state-capsule">
        <div className="state-primary-text">
          {state === 'listening' && <span className="sculpture-active-dot" />}
          {currentConf.statusLabel}
        </div>
        <div className="state-sub-text">
          {currentConf.subLabel}
        </div>
      </div>
    </div>
  );
}
