import { useEffect, useRef, useState, useCallback } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
const MODEL_PATH = "/playstationconpantallalista.glb";

// The dedicated screen material created in Blender
const SCREEN_MATERIAL_NAME = "Pantalla_Video";

// Only the PlayStation CONSOLE is clickable (not TV, cables, plugs)
const PS1_CLICKABLE = new Set([
  "ps1_body_mat.001",
  "ps1_details_mat.001",
  "ps1_controller.001",
]);

// Name of the lid object in the GLTF (set in Blender)
const LID_OBJECT_NAME = "ps1_lid";

// Lid animation duration (used for both open and close)
const LID_ANIM_DURATION = 1.0; // seconds

// Simple ease-in-out function (replaces GSAP for lid)
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Persist pristine GLTF state across remounts (useGLTF caches & mutates the scene)
let pristineScreenMaterial = null;
let initialLidRotationX = null;

export default function Playstation({
  onPs1Click,
  onScreenReady,
  videoTexture,
  openLidTrigger = 0,
  ...props
}) {
  const { scene, materials } = useGLTF(MODEL_PATH);
  const groupRef = useRef();
  const [hovered, setHovered] = useState(false);

  // Use the original scene directly – scene.clone(true) was breaking the
  // parent-child hierarchy of the lid node (ps1_cap_16 lost its mesh children).
  // Material modifications below use .clone() on individual materials, so the
  // cached GLTF materials are NOT affected.

  // Keep a ref to the screen material (cloned from the model)
  const screenMatRef = useRef(null);

  // Lid refs
  const lidRef = useRef(null);
  // Lid animation state: { active, startAngle, endAngle, elapsed }
  const lidAnimRef = useRef({
    active: false,
    startAngle: 0,
    endAngle: 0,
    elapsed: 0,
  });

  // Pointer cursor on PS1 hover
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered]);

  const isPs1 = useCallback((obj) => {
    return obj?.isMesh && PS1_CLICKABLE.has(obj.material?.name);
  }, []);

  // ── Model setup: shadows, normals, fit, screen material, screen center ──
  useEffect(() => {
    if (!groupRef.current) return;

    // Setup shadows
    groupRef.current.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    // Find the screen mesh by material name and clone its material
    groupRef.current.traverse((child) => {
      if (child.isMesh && child.material?.name === SCREEN_MATERIAL_NAME) {
        // Save the pristine material ONCE (before any video texture mutation)
        if (!pristineScreenMaterial) {
          pristineScreenMaterial = child.material.clone();
        }
        // Always clone from the pristine copy so resets start with a blank screen
        const clonedMat = pristineScreenMaterial.clone();
        clonedMat.name = SCREEN_MATERIAL_NAME;
        clonedMat.toneMapped = false;
        clonedMat.emissiveIntensity = 1;
        clonedMat.needsUpdate = true;
        child.material = clonedMat;
        screenMatRef.current = clonedMat;
      }
    });

    // Make the original screen+details material glow too
    const origMat = materials["pvm_screen_and_details_mat.001"];
    if (origMat) {
      origMat.toneMapped = false;
      origMat.emissiveIntensity = 1;
      origMat.needsUpdate = true;
    }

    // Auto-fit model: scale, center, ground
    const box = new THREE.Box3().setFromObject(groupRef.current);
    const size = box.getSize(new THREE.Vector3());
    const targetHeight = 1.45;
    if (size.y > 0) {
      groupRef.current.scale.setScalar(targetHeight / size.y);
    }
    const fittedBox = new THREE.Box3().setFromObject(groupRef.current);
    const center = fittedBox.getCenter(new THREE.Vector3());
    groupRef.current.position.x = -center.x;
    groupRef.current.position.z = -center.z;
    groupRef.current.position.y = -fittedBox.min.y;

    // Find the lid object by name (set in Blender)
    let lidFound = false;
    groupRef.current.traverse((child) => {
      if (lidFound) return; // only grab the first match
      if (
        child.name === LID_OBJECT_NAME ||
        child.name?.startsWith(LID_OBJECT_NAME)
      ) {
        // Save the original open-angle ONCE, then always restore it on mount
        if (initialLidRotationX === null) {
          initialLidRotationX = child.rotation.x;
        }
        child.rotation.x = initialLidRotationX; // Restore open position
        lidRef.current = child;
        lidFound = true;
      }
    });

    // Report screen center for camera animation
    groupRef.current.traverse((child) => {
      if (child.isMesh && child.material?.name === SCREEN_MATERIAL_NAME) {
        const meshBox = new THREE.Box3().setFromObject(child);
        const meshCenter = meshBox.getCenter(new THREE.Vector3());
        onScreenReady?.(meshCenter.clone());
      }
    });
  }, [scene, materials, onScreenReady]);

  // ── Lid close: called directly from the click handler ─────────────────
  const startLidAnimation = useCallback(() => {
    if (!lidRef.current) return;

    const lid = lidRef.current;
    const startAngle = lid.rotation.x;
    const endAngle = 0;

    // If already at target, nothing to do
    if (Math.abs(startAngle - endAngle) < 0.001) return;

    // Start the useFrame-based animation
    lidAnimRef.current = {
      active: true,
      startAngle,
      endAngle,
      elapsed: 0,
    };
  }, []);

  // ── Lid open: triggered externally via openLidTrigger prop ────────────────
  useEffect(() => {
    if (openLidTrigger === 0 || !lidRef.current || initialLidRotationX === null)
      return;
    lidAnimRef.current = {
      active: true,
      startAngle: lidRef.current.rotation.x,
      endAngle: initialLidRotationX,
      elapsed: 0,
    };
  }, [openLidTrigger]);

  // ── useFrame: animate lid every frame (R3F render loop) ─────────────────
  useFrame((_, delta) => {
    // Video texture update
    if (videoTexture?.source?.data?.readyState >= 2) {
      videoTexture.needsUpdate = true;
    }

    // Lid animation (runs inside R3F render loop, guaranteed visual updates)
    const anim = lidAnimRef.current;
    if (!anim.active || !lidRef.current) return;

    anim.elapsed += delta;
    const t = Math.min(anim.elapsed / LID_ANIM_DURATION, 1);
    const easedT = easeInOut(t);
    const angle = anim.startAngle + (anim.endAngle - anim.startAngle) * easedT;

    const lid = lidRef.current;
    lid.rotation.x = angle;

    if (t >= 1) {
      lid.rotation.x = anim.endAngle;
      anim.active = false;
    }
  });

  // ── Apply / clear video texture on the screen material ──────────────────
  useEffect(() => {
    const mat = screenMatRef.current;
    if (!mat) return;

    if (videoTexture) {
      // GLTF models expect non-flipped textures; video defaults to flipY=true
      videoTexture.flipY = false;

      mat.map = videoTexture;
      mat.emissiveMap = videoTexture;
      mat.emissive = mat.emissive || new THREE.Color(0xffffff);
      mat.emissive.set(0xffffff);
      mat.toneMapped = false;
      mat.needsUpdate = true;
    } else if (pristineScreenMaterial) {
      // Clear screen back to pristine (TV off) state
      mat.map = pristineScreenMaterial.map;
      mat.emissiveMap = pristineScreenMaterial.emissiveMap;
      if (pristineScreenMaterial.emissive) {
        mat.emissive = mat.emissive || new THREE.Color();
        mat.emissive.copy(pristineScreenMaterial.emissive);
      }
      mat.needsUpdate = true;
    }
  }, [videoTexture]);

  return (
    <group
      ref={groupRef}
      {...props}
      dispose={null}
      onClick={(e) => {
        if (isPs1(e.object)) {
          e.stopPropagation();
          onPs1Click?.();
          startLidAnimation(); // close the lid immediately on click
        }
      }}
      onPointerOver={(e) => {
        if (isPs1(e.object)) {
          e.stopPropagation();
          setHovered(true);
        }
      }}
      onPointerOut={() => setHovered(false)}
    >
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
