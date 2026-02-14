# Development Log & Decisions

This document records the major decisions, iterations, and lessons learned while building the PlayStation 3D Showcase. It is meant to give future collaborators a clear picture of **why** things are the way they are.

---

## Phase 1: Initial Scene & Model Setup

### Goal

Create a clean 3D showcase of a PlayStation 1 with CRT monitor using React Three Fiber.

### Decisions

- **Vite + React Three Fiber**: Chosen for fast iteration and modern React features.
- **drei helpers**: `useGLTF` for model loading, `OrbitControls` for navigation, `Environment` preset "city" for realistic IBL lighting, `ContactShadows` for a seamless ground plane.
- **Vertex normals**: The original model had faceted "diamond" artifacts on the plastic surfaces, which required `geometry.computeVertexNormals()` on all meshes. After switching to the final model (`playstationconpantallalista.glb`) and the "city" Environment preset, the artifacts disappeared and the call was removed for performance.
- **Auto-fit logic**: The model is scaled to fill a `targetHeight` of 1.45 units, then grounded so `fittedBox.min.y = 0`. This makes the model sit on the shadow plane seamlessly regardless of export scale.

### Iterations

1. Model was floating above the ground plane -- fixed by grounding on `fittedBox.min.y`.
2. Background and shadow plane had different grays creating a visible seam -- tuned `ContactShadows` opacity and `position-y` to `0.001`.
3. Camera angle was too generic -- iterated to a front-left view (`[-2.4, 1.08, 3.25]`) that shows the console, controller, and TV in a balanced composition.
4. FOV choices: Tested both tight (30) and wide (50) values. Settled on 40 for a natural look with moderate perspective distortion.

---

## Phase 2: Click-to-Zoom Camera Animation

### Goal

When the user clicks the PlayStation console, the camera should smoothly animate to a head-on view of the TV screen.

### Key Challenge

`OrbitControls` and manual camera positioning fight each other. Any manual `camera.position.set()` is immediately overridden by OrbitControls on the next frame.

### Solution

1. **Freeze OrbitControls** during animation by replacing its `.update()` method with a no-op.
2. **GSAP direct interpolation**: Tween a `{ value: 0 → 1 }` object and use it to `lerpVectors()` position, target, and fov.
3. **camera.lookAt()** on every update step to keep the camera oriented correctly throughout the motion.
4. **Restore OrbitControls** on completion: put back the saved `.update()` method, set new target, and re-enable.

### Earlier Attempts (Abandoned)

- **CatmullRomCurve3 path**: Created a curved camera path from start to end. This caused the camera to swing through the center of the screen (page center, not TV center) and then jump to the final position. Abandoned in favor of direct linear interpolation, which looks cleaner and is more predictable.
- **Single-trigger animation**: Initially used a boolean `isZoomed` state. Clicking PS1 again would not re-trigger. Changed to a counter (`zoomTrigger`) so the animation can always re-fire.

### Click Detection

Only PlayStation console meshes trigger the animation (body, details, controller). We maintain a `Set` of clickable material names (`PS1_CLICKABLE`) and filter in the `onClick` handler. This prevents accidental triggers from clicking the TV, cables, or plugs.

---

## Phase 3: Video Playback on TV Screen

### Goal

After the camera arrives at the TV, a Crash Team Racing video plays on the TV screen with sound.

### Video Preparation

- Original: MP4 (180MB), square aspect ratio (1:1).
- Converted to WebM (VP9 + Opus) using a custom FFmpeg script (`scripts/convert-tv-video.sh`).
- Output: ~25MB, 720px width, CRF 33, Opus audio at 128kbps.

### Screen Material Problem

The original model used a single material (`pvm_screen_and_details_mat.001`) for both the screen glass AND the surrounding panel details (knobs, labels, vents). Applying a video texture to this material caused the video to bleed onto all those details.

### Attempted Solutions

1. **Runtime geometry splitting**: Used UV coordinate analysis to split the mesh into "screen" triangles and "detail" triangles at runtime. This was fragile and required hardcoded UV thresholds.
2. **UV transformation in code**: Tried to adjust `texture.rotation`, `repeat`, `offset`, and `center` to fit the video to just the screen area. This was extremely difficult to get right due to the irregular UV layout.

### Final Solution: Blender Fix

Created a **dedicated material** in Blender named `Pantalla_Video` that covers only the screen glass. This made the code trivially simple:

```javascript
videoTexture.flipY = false;
mat.map = videoTexture;
mat.emissiveMap = videoTexture;
mat.emissive.set(0xffffff);
mat.toneMapped = false;
```

**Lesson**: When a material/UV problem is difficult to solve in code, it's almost always easier to fix it in Blender.

### Video Orientation

- `useVideoTexture` defaults to `flipY = true`, but GLTF models expect `flipY = false`.
- We set `videoTexture.flipY = false` explicitly. This triggers a cosmetic `WebGL: INVALID_ENUM` warning because the texture is already initialized, but it works correctly.

---

## Phase 4: Lid-Closing Animation

### Goal

When the user clicks the PlayStation, the console lid (disc tray cover) should animate from open to closed simultaneously with the camera zoom.

### Blender Setup Requirements

This was the most iterative feature. Multiple model exports were needed.

1. **Lid must be a separate object** -- Initially the lid was merged with the body geometry. The user separated it in Blender.
2. **Pivot must be at the hinge** -- The lid's origin (pivot) was set to the hinge point in Blender (Edit Mode > set 3D cursor at hinge > Set Origin > Origin to 3D Cursor).
3. **Rotation must NOT be applied** -- The lid is rotated to ~-50 degrees (open) in Object Mode. This rotation must remain as a transform property, not baked into the geometry. If `Apply > Rotation` was used, the code would see `rotation.x = 0` even though the geometry looks open.

### `scene.clone(true)` Disaster

We originally cloned the GLTF scene with `scene.clone(true)` to avoid polluting cached materials. This worked fine for all meshes EXCEPT the lid. The clone operation broke the parent-child hierarchy: the lid's `Object3D` container was cloned but its mesh children were orphaned (0 children). This made it impossible to find or animate the lid.

**Fix**: Removed `scene.clone(true)` entirely. We now use the original scene directly and clone individual materials when we need to modify them. This preserves the full node hierarchy.

### Animation Approach

Used `useFrame` instead of GSAP for the lid animation because:

- The lid is a Three.js object that needs per-frame updates in the R3F render loop.
- GSAP operates outside the render loop and can cause timing issues with R3F.
- A simple custom `easeInOut` function provides smooth motion without extra dependencies.

### Naming Evolution

The lid object was renamed multiple times during development:

- `tapa_PS1` → `ps1_cap_16` → `ps1_lid` (final)

---

## Phase 5: Day-to-Night Background Transition

### Goal

During the camera zoom, the background should transition from light gray (#dbdbdf) to deep dark purple (#120E1A) for a cinematic effect.

### Implementation

The transition is driven inside the same GSAP tween that animates the camera. The `onUpdate` callback interpolates `scene.background` using `THREE.Color.lerp()`.

### Double-Transition Bug

The animation was triggered twice:

1. First trigger: user click increments `zoomTrigger`.
2. Second trigger: video loading completion causes a React state update, which caused the `useEffect` in `CameraAnimator` to re-evaluate.

On the second trigger, the background interpolation reset from `BG_DAY` (light gray), causing a visible "flash to white" even though the background was already dark.

**Fix**: Capture `scene.background.clone()` at the START of each animation run (not a hardcoded `BG_DAY`). If the background is already dark, interpolating from dark to dark produces no visible change.

```javascript
const startBg = scene.background ? scene.background.clone() : BG_DAY.clone();
// ... in onUpdate:
scene.background.copy(startBg).lerp(BG_NIGHT, t);
```

---

## Common Gotchas for Future Development

### 1. Don't clone the GLTF scene

`scene.clone(true)` breaks parent-child hierarchies for nested objects. Use the original scene and clone individual materials instead.

### 2. OrbitControls fights manual camera control

If you need to animate the camera programmatically, you MUST disable OrbitControls (set `enabled = false` AND replace `.update()` with a no-op). Simply disabling is not enough because some internal event handlers still fire.

### 3. useVideoTexture and flipY

Drei's `useVideoTexture` sets `flipY = true` by default. GLTF models need `flipY = false`. Set it explicitly after receiving the texture.

### 4. Material changes on cached GLTF scenes

`useGLTF` caches scenes. If you modify materials on the original scene, those modifications persist across component remounts. Always `.clone()` materials before modifying them.

### 5. Blender export: don't apply transforms

If a Blender object needs to animate (like the lid), its rotation/position/scale must be preserved as Object properties, not baked into the geometry with "Apply Transforms".

### 6. Screen content always goes through Blender

If you need to display content on a specific part of a model, it's far easier to create a dedicated material in Blender with clean UVs than to try to split geometry or transform UVs at runtime.

### 7. Animated reset: don't remount 3D components

Using `key={counter}` to remount a Three.js component causes an instant, jarring reset. For smooth transitions, keep the same component instance and use trigger props (counters) to start reverse animations. Module-level variables (`pristineScreenMaterial`, `initialLidRotationX` in `Playstation.jsx`) preserve the original GLTF state across the component lifetime since `useGLTF` caches and mutates the scene.

### 8. Shared tweenRef for opposing animations

`CameraAnimator` uses a single `tweenRef` shared between the zoom-in and zoom-out effects. Starting either animation kills the other, preventing race conditions. This pattern works well for any A→B / B→A animation pair.
