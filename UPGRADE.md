# 0.5 engineering changes

- Correct positive-face MAC locations for every velocity component and centered interpolation for scalar trajectories; midpoint backtracing and donor-limited MacCormack correction. Removed the old velocity overwrite which discarded the corrected result.
- Characteristic boundary checks; elapsed-time-scaled edge damping. Refined transport uses an explicit RK2 trajectory and limited correction, with the same obstacle predicate as the coarse projection.
- Ray-segment emission integral uses optical depth, a small-depth series, and exact final segment length. Homogeneous-slab arithmetic is independently checked against the analytic integral; this test does not validate the complete renderer.
- Soot-key-light shadowing and an attenuated cached fire-light estimate; bounded phase function; darker, rougher supporting geometry. No prerecorded flame or generative image inputs.
- Persistent GPU position/age and velocity/temperature ember fields, one-way drag/cooling dynamics, smoke attenuation, additive point rasterization, complete snapshot/replay inclusion.
- 20-port burner disks no longer overlap into a continuous annulus. The corrected per-port radius is antialiased using the grid spacing.
- Signed HDR EXR writer with independently decoded fixture; optical-depth alpha and separately documented opacity-weighted depth/normal/velocity/position passes.
- WebGL compatibility regression: output vectors cannot use a dynamic fragment-output index on ANGLE. Velocity correction now uses a local result vector before assigning the output.
- Uniform 12-million-cell authoring/import cap; 256-MiB compressed and 512-MiB expanded snapshot limits, enforced while decompressing.

Exact outcomes and host timings must come from the generated validation JSON and new capture manifests, not these feature descriptions. Published video is offline software rendering unless a report explicitly says otherwise. No claim of EmberGen parity is made.
