# dung1bit

## Run

- `npm install`
- `npm run dev`

## Lighting Pipeline (Lumen)

- `src/systems/lumen.ts` is the single visibility/light source.
- `src/index.ts` updates lights each frame and calls `lumen.calculateLighting(...)`.
- `src/ui/render.ts` draws fog using `lumen.isVisible(...)` and `lumen.getLightLevel(...)`.

### Light source types

- `STATIC`: room torches.
- `DYNAMIC`: player light.
- `TEMPORARY`: bullets, muzzle flashes, fire cells, explosions.