# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start Vite dev server (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # serve dist/ locally
```

## API Key Setup

Copy `.env.example` to `.env` and fill in your Google Maps key:

```
VITE_GOOGLE_API_KEY=AIza...
```

Google Cloud Console setup:
1. Create a project → enable **Map Tiles API**
2. Create an API key (restrict it to "Map Tiles API" + your domain)
3. Billing must be enabled (the API has a free quota)

Running without a key shows a flat green fallback plane instead of 3D tiles.

## Architecture

**Single-file prototype** — all logic lives in `src/main.js`. The HTML shell is `index.html`.

### Coordinate system

Google 3D Tiles are in **ECEF** (Earth-Centred, Earth-Fixed) coordinates. The function `ecefToLocalMatrix(lat, lng)` builds a 4×4 matrix that inverts the local-to-ECEF transform so Hannover Hauptbahnhof ends up at world origin (0,0,0) with:

- **X = East**, **Y = Up (radial)**, **Z = South** (right-handed Y-up)

This matrix is applied to `tiles.group` with `matrixAutoUpdate = false` so the tile hierarchy is positioned correctly once and not recomputed.

The WGS84 ellipsoid surface at this location is at **local y = 0**. Hannover's actual street level is ~54 m above the ellipsoid, so tiles appear near **y ≈ 54**. The car spawns at y = 200 and falls to the ground via downward raycasting once tiles load.

### 3D Tiles renderer (v0.3.46)

```js
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin } from '3d-tiles-renderer/plugins';
```

- `TilesRenderer` — base class; call `setCamera`, `setResolutionFromRenderer`, and `update()` every frame
- `GoogleCloudAuthPlugin` — appends the API key and manages session tokens; **do not** embed the key in the URL yourself
- `GLTFExtensionsPlugin` — registers a `GLTFLoader` + Draco decoder with the tile manager

### Physics

Simplified arcade model inside the main loop:
- Forward / brake / rolling drag change `speed`
- Steering scales with `speed / MAX_SPD` (understeer)
- Gravity (`yVel`) + downward `Raycaster` snap the car to tile geometry each frame
- Camera follows with `lerp(…, 1 - exp(-8 * dt))` for frame-rate-independent smoothing

### Ground detection caveat

`tiles.group` contains dynamically streamed meshes. The raycaster hits whatever geometry is currently loaded — distant or unloaded tiles won't be hit. On steep slopes the car may hover briefly until the correct tile loads. This is expected for a streaming 3D world.
