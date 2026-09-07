# IGNIA media

The README uses stable showcase aliases under `docs/media/showcase/`. Those files point to the same Git blobs as selected entries in the verified baseline media archive; they are not separately generated images.

## README showcase

| Alias | Verified source clip | Preview encoding |
| --- | --- | --- |
| `showcase/overview.gif` | `baseline/catalogue/01_hearth.mp4` | 480 px wide, 10 fps GIF |
| `showcase/combustors.gif` | `baseline/catalogue/05_stove4.mp4` | 480 px wide, 10 fps GIF |
| `showcase/vortices.gif` | `baseline/catalogue/20_tornado.mp4` | 480 px wide, 10 fps GIF |
| `showcase/transients.gif` | `baseline/catalogue/22_explosion.mp4` | 480 px wide, 10 fps GIF |

All source masters are native 1920×1080 H.264 recordings at 24 fps. The complete archive contains 43 original MP4s and 43 full-motion GIF previews.

- [Complete media tree](media/baseline/)
- [Scene gallery](media/baseline/index.html)
- [Hashes, resolution, duration and decode checks](media/baseline/publication-manifest.json)

The publication manifest records the conversion used for the baseline GIFs: 480 px wide, 10 fps, 128-color GIFs from the complete moving clips. No generated-image input was used.

## Re-encoding a local master

For a custom README preview, use a palette pass rather than direct GIF encoding:

```bash
ffmpeg -y -i input.mp4 \
  -filter_complex "fps=10,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 output.gif
```

For archival or presentation quality, use the original 1080p MP4s instead of GIF.
