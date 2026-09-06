# IGNIA — reactive volumetric fire for Three.js / WebGL2

<p align="center"><img src="docs/media/ignia-overview.gif" width="760" alt="IGNIA volumetric fire"></p>

IGNIA is a code-rendered volumetric fire and smoke simulator built around a pressure-projected velocity field, transported reactive scalars, refined subgrid chemistry fields, volumetric extinction/emission, solid boundaries, and reproducible numerical checks. The flames are simulated fields — not sprites, prerecorded flipbooks, or generated imagery.

<table><tr><td><img src="docs/media/ignia-combustors.gif" alt="Combustors"></td><td><img src="docs/media/ignia-vortices.gif" alt="Vortices"></td></tr><tr><td><img src="docs/media/ignia-transients.gif" alt="Transients"></td><td><b>31 presets</b><br>candles · stove burners · jets · wind · tornado · fireball · mushroom cloud · smoke · boundaries · artistic emission palettes</td></tr></table>

## Run

```bash
npm install
npm start
```

`npm install` vendors the pinned official Three.js r180 distribution into `vendor/`. The server prints and opens a loopback URL for `index.html`.

Build a self-contained studio page with:

```bash
npm run check
npm run build
```

That produces `IGNIA_Studio.html`.

## Simulation

- Pressure-projected 3D velocity / momentum field.
- Temperature, fuel, oxygen-like concentration, soot, and instantaneous reaction fields.
- Optional 2×/3× refined transported reactive fields while pressure remains on the base grid.
- Buoyancy, vorticity confinement, source geometry, directional inlet velocity, wind fields, solid masks, cooling, and soot production.
- Ray-integrated volumetric extinction and emission with cached illumination, empty-space skipping, early termination, reflections, and bloom.
- Sphere, baffle, and stove-pan solid boundaries shared by solver and renderer.
- 31 authored scenes spanning candles, gas burners, jets, winds, vortices, transient fireballs, mushroom-style buoyant clouds, smoke, boundaries, and optical palettes.

The combustion model is a graphics-oriented low-speed approximation with normalized VFX parameters, not experimentally calibrated chemistry or a shock solver. The mushroom-cloud preset is buoyant VFX, not nuclear-reaction physics. IGNIA does not claim to reproduce proprietary EmberGen internals.

## Controls

Drag to orbit, scroll to dolly, Space to pause, H to hide the UI. The studio exposes fuel/source strength, wind, vorticity, refinement, exposure, collider modes, field views, and the preset library.

## Baseline verification

The PYRE IV baseline from which IGNIA was renamed was exercised with a 31-scene native-1080p catalogue, high-grid checkpoint renders at 64×96×64 pressure / 128×192×128 refined fields, a 14/14 compact numerical regression suite, and the pinned Three.js r180 backend in Chromium/WebGL2. Those results establish the tested source baseline rather than a universal performance claim.

## License

IGNIA is GPL-2.0-only, matching this repository's existing license. Three.js remains under its upstream MIT license; see `vendor/THREE-LICENSE.txt`.
