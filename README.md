# IGNIA · reactive volume laboratory

Three.js / WebGL2 fire, smoke, and one-way coupled ember tracers. Version 0.5 adds corrected MAC velocity transport, refined RK2 scalar transport, stable optically-thin integration, cached smoke illumination, and scene-linear floating-point EXR passes.

This is a working VFX prototype, **not demonstrated EmberGen 2.0 parity** and not calibrated combustion, nuclear-blast, or tornado physics. The velocity/pressure solve is dense and coarser than the transported reactive fields. The fine Fourier closure is a modeled subgrid velocity, not a fine-grid pressure solve.

## Run

```sh
npm install
npm start
```

Open the localhost address printed by `tools/serve.py`. A local Three.js r180 distribution is included, with its original MIT license, so this release can also start with `python tools/serve.py` without a network download. `npm run build` creates a self-contained HTML application. `window.IGNIA` is the application API; `window.PYRE` remains a compatibility alias.

## Scene coverage

The 31 presets include wood fire; one and three candles; one burner, four burners and pan interaction; clean and sooty fuel profiles; directional, opposing, pulsed, ribbon and multi-nozzle jets; steady, gusting, oscillating, rotating and sheared wind; driven fire/smoke vortices; a finite reactive burst; buoyant mushroom-cloud VFX; a moving source; sphere/baffle boundaries; smoke without fuel; and four artistic palettes. Sources, wind, thermal/soot parameters and palettes are independent controls.

The source profiles are artistic surrogates, not chemically calibrated material models. Color palettes do not change the numerical fields. The mushroom effect has no nuclear reactions, detonation, radiation or blast-wave calculation.

## Rendering and export

The same exported GLSL is used by the Three.js browser host and the EGL offline capture host. The volume renderer integrates three-band thermal emission, soot extinction and cached approximate single-scattered light. Depth, normal, velocity and position passes are **opacity-weighted moments**, not a hard surface or a deep EXR. The normal is the density-gradient normal. EXR outputs preserve floating-point, signed and above-one values without exposure or a display transform.

The UI exports PNG stills, WebM recordings, a 16-frame RGBA flipbook, fluid/pressure/particle snapshots, and FLOAT scanline EXR passes. `IGNIA.readAOV(1..5)` reads raw linear data; `IGNIA.exportEXR(1..5)` downloads the pass. Snapshot imports enforce explicit allocation, payload-length, finite-value and decompression limits.

Fine refinement is selectable at 2× or 3×, capped at 12 million transported cells. Film velocity resolution is 64×96×64; 3× refinement is 192×288×192. These are distinct from the final pixel dimensions. GPU memory and frame cost grow materially at that setting. The in-app benchmark reports actual end-to-end timings, not an assumed FPS.

## Reproduce tests and video

```sh
python -m pip install -r requirements.txt
npm run check
npm run export-shaders
npm run export-detail
npm run export-diagnostics
python tools/test_lab.py
python tools/test_optical_segment.py
python tools/test_embers.py
node tools/test_exr.cjs
python tools/browser_delivery.py
python tools/capture_delivery.py --mode catalogue --grid 64 --refinement 3 --only hearth --destination delivery/hearth
python tools/capture_delivery.py --mode verification --grid 64 --refinement 3 --only wind --destination delivery/wind
```

EGL tools require system Mesa/EGL libraries, FFmpeg and the DejaVu fonts. The browser tool requires Chromium and Python Playwright; it explicitly rejects the native WebGL fallback. Long reels use EGL; the separate browser clip records the actual Three.js canvas. All recorded moving scenes advance twice at 1/48 second per 24-fps output frame. Encoded playback FPS is not interactive GPU throughput.

## Published media

[Original 43 GIFs and byte-for-byte 1080p recordings](docs/media/baseline/) · [Original gallery](docs/media/baseline/index.html) · [Original upload hashes](docs/media/baseline/publication-manifest.json).

New results belong in `docs/media/next`, with a source-commit manifest. Baseline media is retained separately and must not be presented as a rerender of the new version.

## Known boundaries

No sparse simulation domain, production node graph, animated FBX/Alembic collision import, calibrated fuel chemistry, multi-bounce volume path tracing, deep EXR, or consumer-GPU performance parity is established. Ember tracers have prescribed drag, cooling and gravity and do not feed heat, mass or momentum back into the fluid. Smooth-looking fields and numerical regression passes are not evidence of physical validation.

## License

Project distribution: **GPL-2.0-only**, preserving this repository's license. The independently licensed Three.js distribution and its MIT notice remain under `vendor/THREE-LICENSE.txt`. Earlier MIT-origin PYRE source is incorporated into this GPL-2.0 distribution; its provenance is retained in source history.
