# IGNIA media

The README previews are compressed extracts from the native 1080p IGNIA/PYRE IV captures. They are intended as quick visual proof in GitHub; the source masters remain the 1080p H.264 captures produced by the renderer.

## Preview source windows

| Preview | Source master | Window |
| --- | --- | --- |
| Overview | `PYRE_IV_Preset_Catalogue_1080p_Clean.mp4` | ~0.7s–3.9s |
| Combustors | `PYRE_IV_Combustors_1080p.mp4` | ~0.4s–3.9s |
| Vortices | `PYRE_IV_Flows_Vortices_1080p.mp4` | ~0.4s–3.9s |
| Transients | `PYRE_IV_Transient_Effects_1080p.mp4` | ~0.0s–3.2s |

## High-quality GIF export

Use palette generation + paletteuse rather than direct GIF encoding. Example:

```bash
ffmpeg -y -ss 0.7 -t 7 -i PYRE_IV_Preset_Catalogue_1080p_Clean.mp4 \
  -vf "fps=12,scale=640:-1:flags=lanczos,palettegen=stats_mode=diff" palette.png
ffmpeg -y -ss 0.7 -t 7 -i PYRE_IV_Preset_Catalogue_1080p_Clean.mp4 -i palette.png \
  -lavfi "fps=12,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a" \
  -loop 0 docs/media/ignia-overview.gif
```

Recommended showcase target: 640 px wide, 10–12 fps, 6–8 seconds, palette optimized. If a preview becomes too large, reduce fps first, then width, then duration.

## Full-quality presentation

GitHub README GIFs are not the archival deliverables. For release presentation, publish the native 1080p MP4s as GitHub Release assets or on a static gallery page and keep the README GIFs as lightweight previews.
