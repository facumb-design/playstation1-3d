# PlayStation 1 - 3D Interactive Showcase

A high-end 3D product showcase of a PlayStation 1 console with a Sony PVM CRT monitor, built with React Three Fiber. The scene features interactive camera animations, video playback on the TV screen, a lid-closing animation, a VHS-styled controls panel, and smooth day-to-night transitions — all fully reversible with an animated reset.

## Live Features

1. **Gallery-style 3D scene** -- Clean white/gray background with soft contact shadows. The model is auto-fitted and grounded on load.
2. **Click-to-zoom camera animation** -- Click the PlayStation console (body, details, or controller) and the camera smoothly travels to a head-on view of the TV screen.
3. **Video playback on TV** -- After the camera arrives at the TV, a video automatically loads and plays with sound on the TV screen.
4. **Lid-closing animation** -- Simultaneously with the camera zoom, the PS1 console lid animates from open (-50 degrees) to closed (0 degrees).
5. **Day-to-night background transition** -- The background color transitions from light gray (#dbdbdf) to deep purple (#120E1A) during the camera animation, creating a cinematic effect.
6. **VHS-styled controls panel** -- After 8 seconds of playback, a retro VHS-style controls panel appears with a static-noise reveal animation. Includes play/pause, seek, channel switching, and power buttons.
7. **Multiple video channels** -- Switch between game videos (Crash Team Racing, Harry Potter) via the channel selector or clickable jewel-case thumbnails.
8. **Animated reset (power-off)** -- Press the ⏻ button to smoothly reverse everything: camera zooms out, background fades back to gray, PS1 lid reopens, TV turns off, and controls hide with VHS static. The scene is fully re-interactive after the ~2.2s transition.

## Tech Stack

| Package            | Version | Purpose                                                                        |
| ------------------ | ------- | ------------------------------------------------------------------------------ |
| React              | 19.x    | UI framework                                                                   |
| Vite               | 7.x     | Build tool & dev server                                                        |
| @react-three/fiber | 9.x     | React renderer for Three.js                                                    |
| @react-three/drei  | 10.x    | Helpers (useGLTF, OrbitControls, Environment, ContactShadows, useVideoTexture) |
| three              | 0.182.x | 3D engine                                                                      |
| gsap               | 3.x     | Camera & UI animation tweening                                                 |
| Playwright         | 1.58.x  | Visual regression testing                                                      |

## Project Structure

```
playstation/
├── public/
│   ├── playstationconpantallalista.glb   # Main 3D model (active)
│   ├── crash-team-racing.webm            # TV video – Crash Team Racing
│   ├── harryp.webm                       # TV video – Harry Potter
│   ├── cover-crash.webp                  # Jewel case cover art
│   └── cover-harryp.webp                 # Jewel case cover art
├── src/
│   ├── main.jsx                          # Vite entry point
│   ├── App.jsx                           # Root component with Suspense wrapper
│   ├── App.css / index.css               # Global styles
│   └── components/
│       ├── Experience.jsx                # Scene orchestrator, camera, video loading, reset
│       ├── Playstation.jsx               # 3D model, materials, lid animation
│       └── VideoControls.jsx             # VHS-styled controls panel UI
├── tests/
│   └── verify-scene.spec.js             # Playwright smoke test
└── package.json
```

## Architecture

### Data Flow

```
User clicks PS1 console
       │
       ├──> Playstation.onClick
       │       ├──> onPs1Click() → Experience increments zoomTrigger
       │       └──> startLidAnimation() → begins lid close via useFrame
       │
       ├──> CameraAnimator (useEffect on zoomTrigger)
       │       ├──> GSAP tweens camera position/fov from current to TV front
       │       ├──> Interpolates background color (day → night)
       │       └──> onComplete → triggers video loading
       │
       └──> VideoTextureLoader mounts (Suspense)
               ├──> useVideoTexture loads WebM
               └──> onReady → Playstation applies texture to screen material

User clicks ⏻ power-off button
       │
       ├──> handleResetAll()
       │       ├──> Pauses video, clears texture (screen goes black)
       │       ├──> Triggers handleHide() → VHS static panel animation
       │       ├──> Increments zoomOutTrigger → reverse camera animation
       │       └──> Increments openLidTrigger → lid opens back
       │
       └──> CameraAnimator (useEffect on zoomOutTrigger)
               ├──> GSAP tweens camera back to INITIAL_CAMERA position
               ├──> Interpolates background color (night → day)
               └──> onComplete → final state cleanup (ready to re-interact)
```

### Key Components

#### `Experience.jsx`

The scene orchestrator. Contains:

- **Canvas setup** -- White background, city environment map, ambient light, contact shadows.
- **CameraAnimator** (inner component, memoized) -- Handles both zoom-in (to TV screen) and zoom-out (back to initial position) via separate `zoomTrigger` / `zoomOutTrigger` counters. Both share a single `tweenRef` so starting one kills the other. Uses GSAP for smooth tweening with OrbitControls frozen during animation.
- **VideoTextureLoader** (inner component) -- Mounted only after zoom completes. Uses `useVideoTexture` from drei with `start: false, muted: false, loop: true`.
- **Animated reset flow** -- `handleResetAll` orchestrates all reverse animations simultaneously. An `isResetting` flag keeps the controls panel alive during the transition. `handleZoomOutComplete` fires after ~2.2s to do final state cleanup.
- **State management** -- `zoomTrigger` / `zoomOutTrigger` (counters for camera animations), `openLidTrigger` (counter for lid), `videoSrc` / `videoTexture` (null until loaded), `isResetting` (transition guard).

#### `Playstation.jsx`

The model component. Contains:

- **Model loading** -- `useGLTF` loads the GLB. Uses the original scene directly (no `scene.clone()` -- cloning was breaking the lid node hierarchy).
- **Pristine state preservation** -- Module-level `pristineScreenMaterial` and `initialLidRotationX` store the original GLTF state before any mutations, enabling clean resets without remounting.
- **Auto-fit** -- Scales model to `targetHeight = 1.45`, centers on X/Z, grounds on Y.
- **Screen material** -- Finds the Blender material named `"Pantalla_Video"`, clones from the pristine copy, and applies video texture bidirectionally (apply on play, clear on reset).
- **Click detection** -- Only PS1 console meshes are clickable (materials: `ps1_body_mat.001`, `ps1_details_mat.001`, `ps1_controller.001`). TV, cables, and plugs are not clickable.
- **Lid animation** -- Bidirectional: closes on PS1 click (rotation.x → 0), opens on reset (`openLidTrigger` → `initialLidRotationX`). Both use the same `useFrame`-based animation loop with custom ease-in-out.

#### `VideoControls.jsx`

VHS-styled retro controls panel. Contains transport buttons (play/pause, seek ±10s), a channel switcher (CH ▲ ▼), a fader-style progress bar, an LED status display, and action buttons (minimize, power-off). Appears with a VHS static-noise reveal animation after 8 seconds of playback.

## Tweakable Values

All key values are defined as constants at the top of each file:

### Experience.jsx

| Constant                  | Value                | Description                                     |
| ------------------------- | -------------------- | ----------------------------------------------- |
| `INITIAL_CAMERA.position` | `[-2.4, 1.08, 3.25]` | Starting camera position (left, slightly above) |
| `INITIAL_CAMERA.target`   | `[0, 0.66, 0]`       | Initial orbit target                            |
| `INITIAL_CAMERA.fov`      | `40`                 | Field of view (perspective)                     |
| `CLOSEUP_FOV`             | `35`                 | FOV when zoomed to TV                           |
| `CLOSEUP_DISTANCE`        | `2.5`                | Distance from screen center on Z axis           |
| `ANIM_DURATION`           | `2.2`                | Camera animation duration (seconds)             |
| `ANIM_EASE`               | `"power2.inOut"`     | GSAP easing function                            |
| `BG_DAY`                  | `"#dbdbdf"`          | Background color (default)                      |
| `BG_NIGHT`                | `"#120E1A"`          | Background color (after zoom)                   |
| `DEFAULT_VIDEO_INDEX`     | `0`                  | Default video (Crash Team Racing)               |

### Playstation.jsx

| Constant               | Value                                | Description                          |
| ---------------------- | ------------------------------------ | ------------------------------------ |
| `MODEL_PATH`           | `"/playstationconpantallalista.glb"` | GLB model path                       |
| `SCREEN_MATERIAL_NAME` | `"Pantalla_Video"`                   | Blender material for the TV screen   |
| `PS1_CLICKABLE`        | 3 material names                     | Materials that respond to click      |
| `LID_OBJECT_NAME`      | `"ps1_lid"`                          | Blender object name for the lid mesh |
| `LID_CLOSE_DURATION`   | `1.0`                                | Lid animation duration (seconds)     |

## Blender Model Requirements

The GLB model must be exported from Blender with specific conventions:

### Screen Material (`Pantalla_Video`)

- The TV screen must have a **dedicated material** named `Pantalla_Video` in Blender.
- This material should cover ONLY the screen glass area (not bezels, knobs, or panel details).
- UVs should map 0-1 to fill the screen area.

### Lid Mesh (`ps1_lid`)

- The lid must be a **separate mesh object** named `ps1_lid`.
- Its **origin/pivot** must be at the hinge point (where lid connects to the PS1 body).
- In Object Mode, it should be **rotated** to approximately -50 degrees on the X axis (open position).
- The rotation must **NOT be applied** (Ctrl+A > Rotation) -- the transform must be preserved as a node property.
- When `rotation.x = 0`, the lid should appear closed.

### Export Settings

- Format: glTF Binary (.glb)
- Do NOT apply transforms on export (rotation must be preserved).
- No Draco compression needed (the model is under 20MB).

## Running the Project

```bash
# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev

# Build for production
npm run build

# Run visual regression test
npm run verify
```

## Adding New Videos

To add a new video channel:

1. Convert the video to WebM format (VP9 + Opus, ~1:1 aspect ratio recommended for the CRT screen):
   ```bash
   ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 2M -c:a libopus output.webm
   ```
2. Place the `.webm` file in `public/` and a cover image (`.webp`) alongside it.
3. Add an entry to the `VIDEOS` array in `Experience.jsx`:
   ```jsx
   { id: "my-game", label: "My Game", src: "/my-game.webm", cover: "/cover-my-game.webp" }
   ```

## Known Issues & Notes

- **WebGL warning**: `INVALID_ENUM: texParameter` appears in console when setting `videoTexture.flipY = false` after `useVideoTexture` initializes. This is cosmetic and does not affect rendering.
- **Safari audio**: Some Safari versions may block audio autoplay even after user interaction. The video will still play visually.
- **Camera through model**: If the user positions the camera directly behind the TV and clicks the PS1, the straight-line camera path may clip through the model. This is rare in practice since the default view is from the front-left.
- **scene.clone() avoided**: We use the original GLTF scene directly instead of cloning it, because `Object3D.clone(true)` was breaking parent-child hierarchies (specifically the lid node lost its mesh children). Module-level variables (`pristineScreenMaterial`, `initialLidRotationX`) preserve the original state for resets.
