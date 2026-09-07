# IGNIA 0.5 exports and reproducibility

## Start without a dependency download

The pinned Three.js r180 runtime is included under `vendor/`. Run `python tools/serve.py`, then open the local address printed by the server. A Node install is required for building the single-file distribution and regenerating exported GLSL, not for serving the checked-in browser app. Run `npm run check` to syntax-check the JavaScript.

## Full simulation checkpoint

Use **Save state** in the app. The `.pyre.gz` snapshot stores coarse velocity/temperature, reactive species, pressure, refined velocity/temperature and species, and the two GPU ember fields. Use the state file input to restore it. The snapshot retains browser simulation/render parameters and the simulation clock. It is different from a VDB export.

The browser round-trip regression exercises the real download and file-input handlers, then compares all seven readback arrays word by word, both immediately after restoration and after eight more simulation substeps. This is `npm run test:state`. It uses a 40 × 64 × 40 pressure grid and 80 × 128 × 80 refined fields; it is not a claim of identical floating-point trajectories across GPU vendors.

## FLOAT EXR passes

The EXR controls export uncompressed, scanline FLOAT channels. The beauty pass is linear radiance with optical-depth alpha, without the display transform or bloom. Other selectable passes are opacity-weighted depth, density-gradient normal, velocity, and position. These are volumetric weighted moments, not exact solid-surface G-buffer data or deep EXR samples.

`npm run test:exr` writes a fixture under `validation/`. The fixture preserves values below zero and above one. The official OpenEXR Python decoder independently checks the file without a conversion step. OpenCV 4.13 decodes the same fixture; OpenCV 5.0.0 returned no image in the tested runner, so it is not used as the release acceptance decoder.

## Native OpenVDB

Export a checkpoint from the browser, then run the command-line converter. On Ubuntu with distro bindings:

```bash
sudo apt install python3-openvdb python3-numpy
/usr/bin/python3 tools/export_vdb.py saved.pyre.gz fields.vdb
```

Elsewhere, use a Python environment containing the official OpenVDB bindings and NumPy:

```bash
python tools/export_vdb.py saved.pyre.gz fields.vdb
```

The converter writes actual OpenVDB grids using the native library. It does not rerun the simulation. The exported fields are `density` (soot), `temperature`, `fuel`, `oxygen`, `reaction`, `velocity`, and `pressure`. Refined fields use their fine lattice; pressure retains its coarse lattice. Cell-center transforms preserve the domain's world coordinates. Velocity is centered before export when reading a coarse-only staggered snapshot.

Temperature and species remain **normalized VFX-model quantities**. The display's `300 + 1420*T` kelvin mapping is a visualization proxy, not calibrated thermochemistry. The VDB does not contain particles, renderer settings, scattering, lighting, or tone mapping. There is no VDB-to-live-solver importer in this release.

Every conversion reads the written VDB back and checks every exported value. A `.json` sidecar reports grid dimensions, active-voxel counts, transforms, source/output SHA-256 and maximum absolute round-trip error. The supplied regression uses an actual simulated state, not only a manufactured constant field.

## New recordings

For the exact immutable source used by the new EGL recordings, see each scene's capture manifest. The later VDB, test and packaging commits do not change those simulation shaders. To record locally:

```bash
python -m pip install -r requirements.txt
npm run export-shaders
npm run export-detail
npm run export-diagnostics
python tools/capture_delivery.py --mode catalogue --grid 64 --refinement 3 --destination delivery/catalogue
python tools/capture_delivery.py --mode verification --grid 64 --refinement 3 --destination delivery/verification
```

The EGL capture tools require Mesa/EGL and FFmpeg. The browser recording tool additionally needs Chromium and Playwright. These are **offline captures** with deterministic simulation timesteps; encoded 24 fps is not a real-time performance benchmark. The 3× setting is refined transported fields driven by coarse pressure plus a modeled subgrid flow, not a pressure solve on every fine cell.

`python tools/build_reels.py INPUT_ARTIFACT_DIRECTORY OUTPUT_DIRECTORY` assembles the full capture set. It rejects missing scenes, changed input hashes, wrong frame counts, non-1080p volume targets, decoding errors, or static clips labeled as moving. It does not use the baseline movies as render inputs.
