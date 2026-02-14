import {
  useRef,
  useState,
  useCallback,
  useEffect,
  Suspense,
  memo,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  useVideoTexture,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import Playstation from "./Playstation";
import VideoControls from "./VideoControls";

// Available videos (WebM in public/)
export const VIDEOS = [
  {
    id: "crash",
    label: "Crash Team Racing",
    src: "/crash-team-racing.webm",
    cover: "/cover-crash.webp",
  },
  {
    id: "harryp",
    label: "Harry Potter",
    src: "/harryp.webm",
    cover: "/cover-harryp.webp",
  },
  {
    id: "winning",
    label: "Winning Eleven",
    src: "/winning-eleven.webm",
    cover: "/cover-winning.webp",
  },
];

// Default video index
const DEFAULT_VIDEO_INDEX = 0; // Crash Team Racing
const ACTION_LAYOUTS = ["rightTransport", "topRightPair", "bottomActionRow"];

/* ═══════════════════════════════════════════════════════════════════
   TWEAKABLE VALUES
   ═══════════════════════════════════════════════════════════════════ */

const INITIAL_CAMERA = {
  position: [-2.4, 1.08, 3.25],
  target: [0, 0.66, 0],
  fov: 40,
};

const CLOSEUP_FOV = 35;
const CLOSEUP_DISTANCE = 2.5;

const ANIM_DURATION = 2.2;
const ANIM_EASE = "power2.inOut";

const BG_DAY = new THREE.Color("#dbdbdf");
const BG_NIGHT = new THREE.Color("#120E1A");

/* ═══════════════════════════════════════════════════════════════════
   CameraAnimator
   ═══════════════════════════════════════════════════════════════════ */
const CameraAnimator = memo(function CameraAnimator({
  zoomTrigger,
  zoomOutTrigger = 0,
  screenCenterRef,
  controlsRef,
  onZoomComplete,
  onZoomOutComplete,
}) {
  const { camera, scene } = useThree();
  const tweenRef = useRef(null);
  const savedUpdateRef = useRef(null);

  // Store callbacks in refs so they never trigger effect re-runs.
  // Without this, changing videoSrc/currentVideoIndex would recreate
  // handleZoomComplete, which would re-trigger the zoom-in effect and
  // kill the zoom-out tween mid-flight — leaving OrbitControls disabled.
  const onZoomCompleteRef = useRef(onZoomComplete);
  onZoomCompleteRef.current = onZoomComplete;
  const onZoomOutCompleteRef = useRef(onZoomOutComplete);
  onZoomOutCompleteRef.current = onZoomOutComplete;

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.target.set(...INITIAL_CAMERA.target);
      controlsRef.current.update();
    }
  }, [controlsRef]);

  // ── Zoom-in: camera → TV screen, bg → night ──────────────────────────
  useEffect(() => {
    if (zoomTrigger === 0) return;
    if (!screenCenterRef.current) return;

    const controls = controlsRef.current;
    if (!controls) return;

    if (tweenRef.current) tweenRef.current.kill();

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startFov = camera.fov;

    const screenCenter = screenCenterRef.current;
    const endPos = new THREE.Vector3(
      screenCenter.x,
      screenCenter.y + 0.03,
      screenCenter.z + CLOSEUP_DISTANCE,
    );
    const endTarget = screenCenter.clone();

    controls.enabled = false;
    savedUpdateRef.current = controls.update.bind(controls);
    controls.update = () => {};

    const lerpTarget = new THREE.Vector3();
    const progress = { value: 0 };
    const startBg = scene.background
      ? scene.background.clone()
      : BG_DAY.clone();

    tweenRef.current = gsap.to(progress, {
      value: 1,
      duration: ANIM_DURATION,
      ease: ANIM_EASE,
      onUpdate: () => {
        const t = progress.value;
        camera.position.lerpVectors(startPos, endPos, t);
        lerpTarget.lerpVectors(startTarget, endTarget, t);
        camera.lookAt(lerpTarget);
        camera.fov = THREE.MathUtils.lerp(startFov, CLOSEUP_FOV, t);
        camera.updateProjectionMatrix();
        if (scene.background) {
          scene.background.copy(startBg).lerp(BG_NIGHT, t);
        }
      },
      onComplete: () => {
        camera.position.copy(endPos);
        camera.lookAt(endTarget);
        camera.fov = CLOSEUP_FOV;
        camera.updateProjectionMatrix();
        if (scene.background) scene.background.copy(BG_NIGHT);

        controls.update = savedUpdateRef.current;
        savedUpdateRef.current = null;
        controls.target.copy(endTarget);
        controls.update();
        requestAnimationFrame(() => {
          controls.enabled = true;
        });

        onZoomCompleteRef.current?.();
      },
    });

    return () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
      if (savedUpdateRef.current && controls) {
        controls.update = savedUpdateRef.current;
        savedUpdateRef.current = null;
        controls.enabled = true;
      }
    };
  }, [zoomTrigger, screenCenterRef, controlsRef, camera, scene]);

  // ── Zoom-out (reverse): camera → initial position, bg → day ──────────
  useEffect(() => {
    if (zoomOutTrigger === 0) return;

    const controls = controlsRef.current;
    if (!controls) return;

    if (tweenRef.current) tweenRef.current.kill();

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startFov = camera.fov;

    const endPos = new THREE.Vector3(...INITIAL_CAMERA.position);
    const endTarget = new THREE.Vector3(...INITIAL_CAMERA.target);

    controls.enabled = false;
    savedUpdateRef.current = controls.update.bind(controls);
    controls.update = () => {};

    const lerpTarget = new THREE.Vector3();
    const progress = { value: 0 };
    const startBg = scene.background
      ? scene.background.clone()
      : BG_NIGHT.clone();

    tweenRef.current = gsap.to(progress, {
      value: 1,
      duration: ANIM_DURATION,
      ease: ANIM_EASE,
      onUpdate: () => {
        const t = progress.value;
        camera.position.lerpVectors(startPos, endPos, t);
        lerpTarget.lerpVectors(startTarget, endTarget, t);
        camera.lookAt(lerpTarget);
        camera.fov = THREE.MathUtils.lerp(startFov, INITIAL_CAMERA.fov, t);
        camera.updateProjectionMatrix();
        if (scene.background) {
          scene.background.copy(startBg).lerp(BG_DAY, t);
        }
      },
      onComplete: () => {
        camera.position.copy(endPos);
        camera.lookAt(endTarget);
        camera.fov = INITIAL_CAMERA.fov;
        camera.updateProjectionMatrix();
        if (scene.background) scene.background.copy(BG_DAY);

        controls.update = savedUpdateRef.current;
        savedUpdateRef.current = null;
        controls.target.copy(endTarget);
        controls.update();
        requestAnimationFrame(() => {
          controls.enabled = true;
        });

        onZoomOutCompleteRef.current?.();
      },
    });

    return () => {
      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
      if (savedUpdateRef.current && controls) {
        controls.update = savedUpdateRef.current;
        savedUpdateRef.current = null;
        controls.enabled = true;
      }
    };
  }, [zoomOutTrigger, controlsRef, camera, scene]);

  return null;
});

/* ═══════════════════════════════════════════════════════════════════
   VideoTextureLoader
   ═══════════════════════════════════════════════════════════════════ */
function VideoTextureLoader({ src, onReady }) {
  const texture = useVideoTexture(src, {
    unsuspend: "loadedmetadata",
    start: false,
    muted: false,
    loop: false,
    crossOrigin: "anonymous",
  });

  useEffect(() => {
    onReady(texture);
  }, [texture, onReady]);

  return null;
}

/* ═══════════════════════════════════════════════════════════════════
   Experience – main scene
   ═══════════════════════════════════════════════════════════════════ */
export default function Experience() {
  const controlsRef = useRef();
  const screenCenterRef = useRef(null);
  const videoRef = useRef(null);
  const controlsWrapRef = useRef(null);
  const controlsStaticOverlayRef = useRef(null);
  const casesWrapRef = useRef(null);
  const controlsTlRef = useRef(null);
  const isHidingControlsRef = useRef(false);

  const [zoomTrigger, setZoomTrigger] = useState(0);
  const [currentVideoIndex, setCurrentVideoIndex] =
    useState(DEFAULT_VIDEO_INDEX);
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoTexture, setVideoTexture] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [actionLayout, setActionLayout] = useState(ACTION_LAYOUTS[0]);

  // ── Animated reset state ──────────────────────────────────────
  const [isResetting, setIsResetting] = useState(false);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [openLidTrigger, setOpenLidTrigger] = useState(0);

  // ── Controls visibility & hide/show ─────────────────────────
  const [showControls, setShowControls] = useState(false);
  const [controlsKey, setControlsKey] = useState(0);
  const [isHidden, setIsHidden] = useState(false);
  const hasShownControlsRef = useRef(false);
  const showTimerRef = useRef(null);

  // ── Instruction tooltip state ────────────────────────────────
  const [showInstructionTooltip, setShowInstructionTooltip] = useState(false);
  const instructionTimerRef = useRef(null);

  // ── Scene callbacks ─────────────────────────────────────────
  const handleScreenReady = useCallback((center) => {
    screenCenterRef.current = center;
  }, []);

  const handlePs1Click = useCallback(() => {
    if (screenCenterRef.current) {
      setZoomTrigger((n) => n + 1);
    }
  }, []);

  const handleZoomComplete = useCallback(() => {
    if (!videoSrc) {
      setVideoSrc(VIDEOS[currentVideoIndex].src);
    }
  }, [videoSrc, currentVideoIndex]);

  const handleVideoReady = useCallback((texture) => {
    setVideoTexture(texture);
    const video = texture.source.data;
    videoRef.current = video;
    video.currentTime = 0;
    video
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch(() => {});
  }, []);

  // ── Video control callbacks ─────────────────────────────────
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback((offset) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(
      0,
      Math.min(video.duration || 0, video.currentTime + offset),
    );
  }, []);

  const handleSwitchVideo = useCallback((newIndex) => {
    if (videoRef.current) videoRef.current.pause();
    videoRef.current = null;
    setIsPlaying(false);
    setVideoTexture(null);
    setCurrentVideoIndex(newIndex);
    setVideoSrc(VIDEOS[newIndex].src);
  }, []);

  // ── Auto-advance to next video when current one ends ────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoEnded = () => {
      const next = (currentVideoIndex + 1) % VIDEOS.length;
      handleSwitchVideo(next);
    };

    video.addEventListener('ended', handleVideoEnded);
    return () => {
      video.removeEventListener('ended', handleVideoEnded);
    };
  }, [currentVideoIndex, handleSwitchVideo]);

  // ── Hide/show callbacks ─────────────────────────────────────
  const handleHide = useCallback(() => {
    if (isHidingControlsRef.current) return;

    const wrapEl = controlsWrapRef.current;
    const overlayEl = controlsStaticOverlayRef.current;
    const casesEl = casesWrapRef.current;

    // Fallback: if refs aren't ready, hide immediately.
    if (!wrapEl || !overlayEl) {
      setIsHidden(true);
      return;
    }

    isHidingControlsRef.current = true;
    if (controlsTlRef.current) controlsTlRef.current.kill();

    // Cases: simple fade out (no static)
    if (casesEl)
      gsap.to(casesEl, { opacity: 0, duration: 0.25, ease: "power2.in" });

    // Panel: reverse static – noise fades IN then panel disappears
    gsap.set(overlayEl, { opacity: 0, display: "block" });

    controlsTlRef.current = gsap.timeline({
      onComplete: () => {
        isHidingControlsRef.current = false;
        setIsHidden(true);
      },
    });

    controlsTlRef.current
      .to(overlayEl, { opacity: 0.5, duration: 0.12, ease: "steps(3)" })
      .to(overlayEl, { opacity: 0.9, duration: 0.1, ease: "steps(2)" })
      .to(overlayEl, { opacity: 1, duration: 0.12, ease: "steps(4)" })
      .to(wrapEl, { opacity: 0, duration: 0.25, ease: "power2.in" }, "-=0.08");
  }, []);

  const handleShow = useCallback(() => {
    setIsHidden(false);
    setControlsKey((k) => k + 1);
  }, []);

  // ── Animated reset: zoom-out completion callback ────────────
  const handleZoomOutComplete = useCallback(() => {
    // Final cleanup after all animations have finished
    setIsResetting(false);
    setShowControls(false);
    setIsHidden(false);
    setCurrentVideoIndex(DEFAULT_VIDEO_INDEX);
    setControlsKey((k) => k + 1);

    // Kill any lingering GSAP timelines
    if (controlsTlRef.current) {
      controlsTlRef.current.kill();
      controlsTlRef.current = null;
    }
    isHidingControlsRef.current = false;
  }, []);

  const handleResetAll = useCallback(() => {
    if (isResetting) return; // Prevent double-reset

    // 1. Mark as resetting (keeps panel alive while videoTexture goes null)
    setIsResetting(true);

    // 2. Pause video & clear timers
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    videoRef.current = null;
    hasShownControlsRef.current = false;

    // 3. Hide panel with VHS static animation
    handleHide();

    // 4. Clear video (screen goes black via Playstation's bidirectional effect)
    setIsPlaying(false);
    setVideoTexture(null);
    setVideoSrc(null);

    // 5. Reset zoomTrigger so the zoom-in effect won't re-fire
    setZoomTrigger(0);

    // 6. Start camera zoom-out + background transition
    setZoomOutTrigger((n) => n + 1);

    // 7. Start lid open animation
    setOpenLidTrigger((n) => n + 1);

    // State fully resets when handleZoomOutComplete fires (~2.2s)
  }, [isResetting, handleHide]);

  // ── Entrance: cases = fade only, panel = static reveal ────────
  useEffect(() => {
    const isVisible = videoTexture && showControls && !isHidden;
    if (!isVisible) return;

    const wrapEl = controlsWrapRef.current;
    const overlayEl = controlsStaticOverlayRef.current;
    const casesEl = casesWrapRef.current;
    if (!wrapEl || !overlayEl) return;

    isHidingControlsRef.current = false;
    if (controlsTlRef.current) controlsTlRef.current.kill();

    // Cases: simple fade in (no static)
    if (casesEl) {
      gsap.set(casesEl, { opacity: 0 });
      gsap.to(casesEl, { opacity: 1, duration: 0.5, ease: "power2.out" });
    }

    // Panel: static reveal – noise fades OUT to reveal
    gsap.set(wrapEl, { opacity: 1, y: 0 });
    gsap.set(overlayEl, { opacity: 1, display: "block" });

    controlsTlRef.current = gsap.timeline();
    controlsTlRef.current
      .to(overlayEl, { opacity: 0.7, duration: 0.15, ease: "steps(3)" })
      .to(overlayEl, { opacity: 0.9, duration: 0.1, ease: "steps(2)" })
      .to(overlayEl, { opacity: 0.5, duration: 0.15, ease: "steps(4)" })
      .to(overlayEl, { opacity: 0, duration: 0.8, ease: "power2.inOut" })
      .set(overlayEl, { display: "none" });

    return () => {
      if (controlsTlRef.current) controlsTlRef.current.kill();
    };
  }, [videoTexture, showControls, isHidden, controlsKey]);

  // ── 8-second delay (first time only) ───────────────────────
  useEffect(() => {
    if (isPlaying && videoTexture && !hasShownControlsRef.current) {
      hasShownControlsRef.current = true;
      showTimerRef.current = setTimeout(() => setShowControls(true), 8000);
    }
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, [isPlaying, videoTexture]);

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!showControls) return;

      // R = replay entrance animation (only when panel visible)
      if ((e.key === "r" || e.key === "R") && !isHidden) {
        setControlsKey((k) => k + 1);
      }

      // H = show panel when hidden (hiding is handled inside VideoControls)
      if ((e.key === "h" || e.key === "H") && isHidden) {
        handleShow();
      }

      // 1/2/3 = compare action-button layouts
      if (e.key === "1") setActionLayout(ACTION_LAYOUTS[0]);
      if (e.key === "2") setActionLayout(ACTION_LAYOUTS[1]);
      if (e.key === "3") setActionLayout(ACTION_LAYOUTS[2]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showControls, isHidden, handleShow]);

  // ── Show instruction after 10s if PS1 not clicked ─────────────
  useEffect(() => {
    // Only show if user hasn't zoomed in yet and not resetting
    if (zoomTrigger === 0 && !isResetting && !videoSrc) {
      instructionTimerRef.current = setTimeout(() => {
        setShowInstructionTooltip(true);
      }, 20000);
    } else {
      setShowInstructionTooltip(false);
      if (instructionTimerRef.current) {
        clearTimeout(instructionTimerRef.current);
        instructionTimerRef.current = null;
      }
    }

    return () => {
      if (instructionTimerRef.current) {
        clearTimeout(instructionTimerRef.current);
      }
    };
  }, [zoomTrigger, isResetting, videoSrc]);

  // ── Styles for residual elements & mode switcher ────────────
  const controlsAreaStyle = {
    position: "absolute",
    bottom: 24,
    left: 24,
    zIndex: 10,
    pointerEvents: "auto",
    userSelect: "none",
  };

  const ledDotStyle = {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ff3333",
    cursor: "pointer",
    animation: "vhs-led-pulse 1.8s ease-in-out infinite",
    boxShadow: "0 0 6px #ff3333, 0 0 14px rgba(255,51,51,0.3)",
    marginBottom: 6,
  };

  // ── PS1 jewel case styles (floating above panel) ────────────
  const caseRowStyle = {
    display: "flex",
    gap: 12,
    marginBottom: 10,
  };

  const makeCaseStyle = (isActive) => ({
    display: "flex",
    width: 75,
    height: 64,
    cursor: "pointer",
    borderRadius: 2,
    overflow: "hidden",
    position: "relative",
    transform: isActive ? "scale(1.08)" : "scale(1)",
    boxShadow: isActive
      ? "0 4px 14px rgba(0,0,0,0.7)"
      : "0 2px 6px rgba(0,0,0,0.5)",
    opacity: isActive ? 1 : 0.7,
    filter: isActive ? "none" : "brightness(0.8)",
  });

  const caseSpineStyle = {
    width: 8,
    minWidth: 8,
    background: "#202020",
    position: "relative",
    boxShadow:
      "inset -2px 0 3px rgba(0,0,0,0.7), inset 2px 0 3px rgba(82,82,82,0.2)",
  };

  const caseSpineBottomStyle = {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    background: "#4c4c4c",
  };

  const caseFrontStyle = {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    background: "#111",
  };

  const caseCoverImgStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };

  const caseShineStyle = {
    position: "absolute",
    inset: 0,
    boxShadow:
      "inset 0 2px 3px rgba(255,255,255,0.12), inset 2px 0 3px rgba(255,255,255,0.1), inset 0 -2px 3px rgba(255,255,255,0.08), inset -2px 0 3px rgba(255,255,255,0.05)",
    pointerEvents: "none",
  };

  const STATIC_NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)' opacity='0.6'/%3E%3C/svg%3E")`;

  const wrapperStaticOverlayStyle = {
    position: "absolute",
    inset: 0,
    backgroundImage: STATIC_NOISE_SVG,
    backgroundSize: "200px 200px",
    animation: "vhs-static-shift 0.15s steps(5) infinite",
    zIndex: 50,
    pointerEvents: "none",
    opacity: 0,
    display: "none",
    borderRadius: 6,
  };

  // ── Instruction tooltip styles (3D Html label) ────────────────
  const tooltip3dContainerStyle = {
    textAlign: "center",
    fontFamily: "'Courier New', monospace",
    userSelect: "none",
    animation:
      "tooltip-float 3s ease-in-out infinite, tooltip-fade-in 1.5s ease-out",
  };

  const tooltip3dPressStyle = {
    fontSize: 9,
    fontWeight: "bold",
    color: "#888",
    letterSpacing: 4,
    textTransform: "uppercase",
    marginBottom: 2,
  };

  const tooltip3dSubStyle = {
    fontSize: 11,
    color: "#555",
    letterSpacing: 1,
  };

  const tooltip3dArrowStyle = {
    fontSize: 10,
    color: "#aaa",
    marginTop: 4,
    animation: "tooltip-bounce 1.2s ease-in-out infinite",
  };

  const panelReady = (videoTexture || isResetting) && showControls;
  const panelVisible = panelReady && !isHidden;
  const panelHidden = panelReady && isHidden;
  const showResidualLed = panelHidden && !isResetting;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* Pulsing LED keyframe (injected once) */}
      <style>{`
        @keyframes vhs-led-pulse {
          0%, 100% { opacity: 0.4; box-shadow: 0 0 4px #ff3333; }
          50% { opacity: 1; box-shadow: 0 0 8px #ff3333, 0 0 18px rgba(255,51,51,0.4); }
        }
        @keyframes vhs-static-shift {
          0%   { background-position: 0 0; }
          25%  { background-position: -30px 15px; }
          50%  { background-position: 15px -20px; }
          75%  { background-position: -10px 30px; }
          100% { background-position: 20px -10px; }
        }
        @keyframes tooltip-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes tooltip-fade-in {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes tooltip-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(3px); opacity: 1; }
        }
        .ps1-case {
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease, filter 0.15s ease;
        }
        .ps1-case:hover {
          transform: scale(1.05) !important;
          opacity: 1 !important;
          filter: brightness(1) !important;
        }
      `}</style>

      <Canvas
        shadows
        camera={{ position: INITIAL_CAMERA.position, fov: INITIAL_CAMERA.fov }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.forceContextLoss = null;
        }}
      >
        <color attach="background" args={["#dbdbdf"]} />
        <Environment preset="city" environmentIntensity={0.9} />
        <ambientLight intensity={0.45} />

        <ContactShadows
          opacity={0.35}
          scale={9}
          blur={2.2}
          far={1.6}
          resolution={512}
          position={[0, 0.001, 0]}
        />

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom
          enableRotate
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
        />

        <CameraAnimator
          zoomTrigger={zoomTrigger}
          zoomOutTrigger={zoomOutTrigger}
          screenCenterRef={screenCenterRef}
          controlsRef={controlsRef}
          onZoomComplete={handleZoomComplete}
          onZoomOutComplete={handleZoomOutComplete}
        />

        {videoSrc && (
          <Suspense fallback={null}>
            <VideoTextureLoader
              key={videoSrc}
              src={videoSrc}
              onReady={handleVideoReady}
            />
          </Suspense>
        )}

        <Playstation
          onPs1Click={handlePs1Click}
          onScreenReady={handleScreenReady}
          videoTexture={videoTexture}
          openLidTrigger={openLidTrigger}
        />

        {/* ── Instruction tooltip (3D floating label) ─────────── */}
        {showInstructionTooltip && (
          <group position={[0.6, 0.95, 0.8]}>
            <Html center occlude distanceFactor={4} style={{ pointerEvents: "none" }}>
              <div style={tooltip3dContainerStyle}>
                <div style={tooltip3dPressStyle}>PRESS START</div>
                <div style={tooltip3dSubStyle}>Click on the PlayStation</div>
                <div style={tooltip3dArrowStyle}>&#9660;</div>
              </div>
            </Html>
          </group>
        )}
      </Canvas>

      {/* ── Controls area (bottom-left) ──────────────────────── */}
      {panelReady && (
        <div style={controlsAreaStyle}>
          {/* Active panel */}
          {panelVisible && (
            <>
              {/* Floating cases – fade only (no static) */}
              <div ref={casesWrapRef} style={{ ...caseRowStyle, opacity: 0 }}>
                {VIDEOS.map((v, idx) => (
                  <div
                    key={v.id}
                    className="ps1-case"
                    style={makeCaseStyle(idx === currentVideoIndex)}
                    onClick={() =>
                      idx !== currentVideoIndex && handleSwitchVideo(idx)
                    }
                    title={v.label}
                  >
                    <div style={caseSpineStyle}>
                      <div style={caseSpineBottomStyle} />
                    </div>
                    <div style={caseFrontStyle}>
                      <img
                        src={v.cover}
                        alt={v.label}
                        style={caseCoverImgStyle}
                        draggable={false}
                      />
                      <div style={caseShineStyle} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Panel – VHS static reveal */}
              <div
                ref={controlsWrapRef}
                style={{ position: "relative", display: "inline-block" }}
              >
                <div
                  ref={controlsStaticOverlayRef}
                  style={wrapperStaticOverlayStyle}
                />
                <VideoControls
                  key={controlsKey}
                  onHide={handleHide}
                  videoRef={videoRef}
                  isPlaying={isPlaying}
                  currentVideoIndex={currentVideoIndex}
                  videos={VIDEOS}
                  onPlayPause={handlePlayPause}
                  onSeek={handleSeek}
                  onSwitchVideo={handleSwitchVideo}
                  onResetAll={handleResetAll}
                  actionLayout={actionLayout}
                />
              </div>
            </>
          )}

          {/* Residual: pulsing LED dot */}
          {showResidualLed && (
            <div
              onClick={handleShow}
              style={ledDotStyle}
              title="Show controls (H)"
            />
          )}
        </div>
      )}

    </div>
  );
}
