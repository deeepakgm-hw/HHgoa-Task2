import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type OrbState = 
  | 'idle' 
  | 'listening' 
  | 'transcribing'
  | 'retrieving'
  | 'verifying'
  | 'answering' 
  | 'success' 
  | 'refused' 
  | 'error';

interface AIAmbientOrbProps {
  state: OrbState;
  audioVolume?: number; // 0.0 to 1.0 real-time mic volume
  onClick?: () => void;
  size?: number;
  sublabel?: string;
  timerSeconds?: number;
}

export default function AIAmbientOrb({
  state,
  audioVolume = 0,
  onClick,
  size = 290,
  sublabel,
  timerSeconds
}: AIAmbientOrbProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasFallbackRef = useRef<HTMLCanvasElement | null>(null);
  const [webGlAvailable, setWebGlAvailable] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const coreMeshRef = useRef<THREE.Mesh | null>(null);
  const outerGlassRef = useRef<THREE.Mesh | null>(null);
  const ringGroupRef = useRef<THREE.Group | null>(null);
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number; targetX: number; targetY: number }>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0
  });

  const uniformsRef = useRef<{
    uTime: { value: number };
    uAudioAmp: { value: number };
    uState: { value: number };
    uColorCore: { value: THREE.Color };
    uColorGlow: { value: THREE.Color };
    uColorRim: { value: THREE.Color };
  } | null>(null);

  // Enhanced Color & Dynamics Matrix
  const stateConfigMap: Record<OrbState, { 
    core: string; 
    glow: string; 
    rim: string; 
    rotationSpeed: number; 
    stateIndex: number;
    primaryText: string;
    subText: string;
  }> = {
    idle: {
      core: '#064e3b',
      glow: '#10b981',
      rim: '#06b6d4',
      rotationSpeed: 0.5,
      stateIndex: 0,
      primaryText: 'Tap to Speak',
      subText: sublabel || 'English • हिन्दी • ಕನ್ನಡ • தமிழ் • తెలుగు'
    },
    listening: {
      core: '#0369a1',
      glow: '#06b6d4',
      rim: '#38bdf8',
      rotationSpeed: 2.2,
      stateIndex: 1,
      primaryText: timerSeconds !== undefined ? `Listening... 00:${timerSeconds.toString().padStart(2, '0')}` : 'Listening...',
      subText: 'Speak naturally • Tap orb when finished'
    },
    transcribing: {
      core: '#1e3a8a',
      glow: '#3b82f6',
      rim: '#38bdf8',
      rotationSpeed: 3.0,
      stateIndex: 2,
      primaryText: 'Understanding speech…',
      subText: 'Sarvam Saaras v3 decoding audio buffer'
    },
    retrieving: {
      core: '#064e3b',
      glow: '#06b6d4',
      rim: '#10b981',
      rotationSpeed: 2.8,
      stateIndex: 3,
      primaryText: 'Finding evidence…',
      subText: 'Searching 3,381 MSMARCO-XI passage chunks'
    },
    verifying: {
      core: '#78350f',
      glow: '#f59e0b',
      rim: '#fbbf24',
      rotationSpeed: 2.0,
      stateIndex: 4,
      primaryText: 'Checking evidence…',
      subText: 'Auditing relevance threshold & entity coverage'
    },
    answering: {
      core: '#065f46',
      glow: '#10b981',
      rim: '#34d399',
      rotationSpeed: 1.2,
      stateIndex: 5,
      primaryText: 'Preparing grounded answer…',
      subText: 'Gemini generating strictly supported response'
    },
    success: {
      core: '#065f46',
      glow: '#34d399',
      rim: '#6ee7b7',
      rotationSpeed: 0.6,
      stateIndex: 6,
      primaryText: 'Evidence Verified',
      subText: 'Grounded in retrieved sources • Tap to ask again'
    },
    refused: {
      core: '#881337',
      glow: '#f43f5e',
      rim: '#fb7185',
      rotationSpeed: 0.5,
      stateIndex: 7,
      primaryText: 'Insufficient Evidence',
      subText: 'No verified source found in MSMARCO-XI index'
    },
    error: {
      core: '#991b1b',
      glow: '#ef4444',
      rim: '#f87171',
      rotationSpeed: 1.0,
      stateIndex: 8,
      primaryText: 'Pipeline Interrupted',
      subText: 'Tap to retry query'
    }
  };

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = size;
    const height = size;

    // Check WebGL support
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
      renderer.toneMappingExposure = 1.25;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
    } catch (e) {
      console.warn('[AIAmbientOrb] WebGL initialization failed, switching to 2D canvas fallback:', e);
      setWebGlAvailable(false);
      return;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.3;
    cameraRef.current = camera;

    // High-precision GLSL Noise Vertex Shader
    const vertexShader = `
      uniform float uTime;
      uniform float uAudioAmp;
      uniform float uState;
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

        float noiseFreq = 1.5;
        float noiseSpeed = 0.75;
        float noiseAmp = 0.16 + (uAudioAmp * 0.48);

        // Fluid radar vortex for searching states
        if (uState >= 2.0 && uState <= 4.0) {
          noiseFreq = 2.2;
          noiseSpeed = 1.4;
          noiseAmp = 0.24;
        }

        float noise = snoise(position * noiseFreq + vec3(uTime * noiseSpeed));
        vDisplacement = noise;

        vec3 newPosition = position + normal * (noise * noiseAmp);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `;

    // Volumetric Glass & Fresnel Rim Fragment Shader
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
        vec3 viewDir = normalize(-vPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.2);

        vec3 coreColor = mix(uColorCore, uColorGlow, vDisplacement * 0.5 + 0.5);
        vec3 finalColor = mix(coreColor, uColorRim, fresnel);

        // Internal volumetric harmonic pulsation
        float pulse = 0.5 + 0.5 * sin(uTime * 1.8 + vDisplacement * 3.2);
        finalColor += uColorGlow * pulse * 0.38;

        // Dynamic audio amplitude flare
        finalColor += uColorRim * (uAudioAmp * 0.65);

        float alpha = 0.74 + (fresnel * 0.26) + (uAudioAmp * 0.18);
        gl_FragColor = vec4(finalColor, min(0.96, alpha));
      }
    `;

    const config = stateConfigMap[state];
    const uniforms = {
      uTime: { value: 0 },
      uAudioAmp: { value: audioVolume },
      uState: { value: config.stateIndex },
      uColorCore: { value: new THREE.Color(config.core) },
      uColorGlow: { value: new THREE.Color(config.glow) },
      uColorRim: { value: new THREE.Color(config.rim) }
    };
    uniformsRef.current = uniforms;

    // 1. Core Organic Fluid Mesh
    const coreGeometry = new THREE.IcosahedronGeometry(1.28, 52);
    const coreMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(coreMesh);
    coreMeshRef.current = coreMesh;

    // 2. Translucent Glass Shell
    const glassGeometry = new THREE.SphereGeometry(1.52, 40, 40);
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(config.rim),
      transparent: true,
      opacity: 0.16,
      roughness: 0.08,
      metalness: 0.12,
      transmission: 0.92,
      ior: 1.52,
      reflectivity: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08
    });
    const outerGlass = new THREE.Mesh(glassGeometry, glassMaterial);
    scene.add(outerGlass);
    outerGlassRef.current = outerGlass;

    // 3. Orbital Energy Ring Group
    const ringGroup = new THREE.Group();
    const ringGeo1 = new THREE.TorusGeometry(1.68, 0.012, 16, 120);
    const ringMat1 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(config.rim),
      transparent: true,
      opacity: 0.35
    });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 3;
    ringGroup.add(ring1);

    const ringGeo2 = new THREE.TorusGeometry(1.76, 0.008, 16, 120);
    const ringMat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color(config.glow),
      transparent: true,
      opacity: 0.22
    });
    const ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    ring2.rotation.y = Math.PI / 4;
    ring2.rotation.x = -Math.PI / 6;
    ringGroup.add(ring2);

    scene.add(ringGroup);
    ringGroupRef.current = ringGroup;

    // 4. Ambient Sparkle Particle Halo
    const particleCount = 140;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const radius = 1.65 + Math.random() * 0.85;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      particlePos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      particlePos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePos[i * 3 + 2] = radius * Math.cos(phi);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: new THREE.Color(config.glow),
      size: 0.032,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);
    particleSystemRef.current = particleSystem;

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(new THREE.Color(config.glow), 2.8, 10);
    pointLight.position.set(2.5, 2.5, 3.5);
    scene.add(pointLight);

    // Animation Loop with Smooth Mouse Parallax
    let clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse interpolation
      mousePosRef.current.x += (mousePosRef.current.targetX - mousePosRef.current.x) * 0.05;
      mousePosRef.current.y += (mousePosRef.current.targetY - mousePosRef.current.y) * 0.05;

      if (uniformsRef.current) {
        uniformsRef.current.uTime.value = elapsedTime;
      }

      const rotSpeed = stateConfigMap[state]?.rotationSpeed ?? 0.6;

      if (coreMeshRef.current) {
        coreMeshRef.current.rotation.y = elapsedTime * 0.28 * rotSpeed + mousePosRef.current.x * 0.4;
        coreMeshRef.current.rotation.x = Math.sin(elapsedTime * 0.22) * 0.15 - mousePosRef.current.y * 0.4;
      }

      if (outerGlassRef.current) {
        outerGlassRef.current.rotation.y = -elapsedTime * 0.18 * rotSpeed + mousePosRef.current.x * 0.2;
        outerGlassRef.current.rotation.x = mousePosRef.current.y * 0.2;
      }

      if (ringGroupRef.current) {
        ringGroupRef.current.rotation.z = elapsedTime * 0.35 * rotSpeed;
        ringGroupRef.current.rotation.y = Math.sin(elapsedTime * 0.25) * 0.25 + mousePosRef.current.x * 0.3;
      }

      if (particleSystemRef.current) {
        particleSystemRef.current.rotation.y = elapsedTime * 0.12 * rotSpeed;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (rendererRef.current && rendererRef.current.domElement && container) {
        try {
          container.removeChild(rendererRef.current.domElement);
        } catch (e) {}
        rendererRef.current.dispose();
      }
    };
  }, [size]);

  // Update Three.js uniforms and materials when state changes
  useEffect(() => {
    if (!uniformsRef.current) return;
    const config = stateConfigMap[state];

    uniformsRef.current.uColorCore.value.set(config.core);
    uniformsRef.current.uColorGlow.value.set(config.glow);
    uniformsRef.current.uColorRim.value.set(config.rim);
    uniformsRef.current.uState.value = config.stateIndex;
    uniformsRef.current.uAudioAmp.value = audioVolume;

    if (outerGlassRef.current && (outerGlassRef.current.material as THREE.MeshPhysicalMaterial)) {
      (outerGlassRef.current.material as THREE.MeshPhysicalMaterial).color.set(config.rim);
    }
  }, [state, audioVolume]);

  // Mouse move handler for interactive 3D parallax
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    mousePosRef.current.targetX = x;
    mousePosRef.current.targetY = y;
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    mousePosRef.current.targetX = 0;
    mousePosRef.current.targetY = 0;
  };

  // 2D Canvas Fallback
  useEffect(() => {
    if (webGlAvailable || !canvasFallbackRef.current) return;
    const canvas = canvasFallbackRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;
    let t = 0;

    const drawFallback = () => {
      frameId = requestAnimationFrame(drawFallback);
      t += 0.03;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const baseR = (size / 2) * 0.65;
      const amp = audioVolume * 24;

      const grad = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR * 1.3);
      const conf = stateConfigMap[state];
      grad.addColorStop(0, conf.core);
      grad.addColorStop(0.6, conf.glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.arc(cx, cy, baseR + amp + Math.sin(t) * 4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = conf.rim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.15 + amp * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    };

    drawFallback();
    return () => cancelAnimationFrame(frameId);
  }, [webGlAvailable, state, audioVolume, size]);

  const currentConfig = stateConfigMap[state] || stateConfigMap.idle;

  return (
    <div 
      className="orb-hero-interaction-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        userSelect: 'none',
        cursor: onClick ? 'pointer' : 'default'
      }}
      onClick={onClick}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={handlePointerLeave}
      role="button"
      tabIndex={0}
      aria-label={`${currentConfig.primaryText}: ${currentConfig.subText}`}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Volumetric Atmospheric Glow */}
      <div 
        className="orb-atmospheric-glow"
        style={{
          position: 'absolute',
          width: `${size * 1.4}px`,
          height: `${size * 1.4}px`,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${stateConfigMap[state].glow}38 0%, ${stateConfigMap[state].core}18 45%, transparent 70%)`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
          transform: `scale(${isHovered ? 1.08 : 1.0})`,
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.5s ease',
          zIndex: 0
        }}
      />

      {/* 3D WebGL Canvas */}
      <div 
        ref={mountRef} 
        style={{
          width: `${size}px`,
          height: `${size}px`,
          position: 'relative',
          zIndex: 1,
          display: webGlAvailable ? 'block' : 'none'
        }}
      />

      {/* 2D Canvas Fallback */}
      {!webGlAvailable && (
        <canvas 
          ref={canvasFallbackRef}
          width={size}
          height={size}
          style={{ position: 'relative', zIndex: 1 }}
        />
      )}

      {/* Integrated Center Micro-Icon */}
      <div 
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 2,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {state === 'idle' && (
          <div 
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(5, 6, 7, 0.45)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ecfdf5' }}>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
        )}

        {state === 'listening' && (
          <div 
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.25)',
              backdropFilter: 'blur(12px)',
              border: '1.5px solid #f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 24px rgba(239, 68, 68, 0.5)',
              animation: 'pulse 1.2s infinite'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#ffffff">
              <rect x="6" y="6" width="12" height="12" rx="2.5" />
            </svg>
          </div>
        )}

        {(state === 'transcribing' || state === 'retrieving' || state === 'verifying' || state === 'answering') && (
          <div 
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: stateConfigMap[state].rim,
              borderRightColor: stateConfigMap[state].glow,
              animation: 'spin 1s linear infinite'
            }}
          />
        )}
      </div>

      {/* State Text Readout Underneath Orb */}
      <div 
        style={{
          marginTop: '1.25rem',
          textAlign: 'center',
          zIndex: 2,
          position: 'relative'
        }}
      >
        <div 
          style={{
            fontFamily: 'var(--font-display, "Inter", sans-serif)',
            fontSize: '1.25rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: state === 'error' || state === 'refused' ? '#fb7185' : state === 'listening' ? '#38bdf8' : state === 'verifying' ? '#fbbf24' : '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          {state === 'listening' && <span className="pulsing-live-dot" />}
          {currentConfig.primaryText}
        </div>

        <div 
          style={{
            fontFamily: 'var(--font-sans, "Inter", sans-serif)',
            fontSize: '0.85rem',
            color: 'rgba(255, 255, 255, 0.55)',
            marginTop: '0.25rem',
            letterSpacing: '-0.01em',
            maxWidth: '340px',
            lineHeight: 1.4
          }}
        >
          {currentConfig.subText}
        </div>
      </div>
    </div>
  );
}
