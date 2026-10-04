# City demo

Top-down 3D city game in TypeScript and three.js, bundled with Vite.

- `npm run dev`: dev server with hot reload. `npm run build`: typecheck (`tsc`, strict), then bundle into `dist/`.
- Pushes to `main` deploy to GitHub Pages (pfg.pw/citygame3/) via `.github/workflows/deploy.yml`.
- The simulation is 2D (metres, plus a float floor level `z`); the 3D scene is generated from the same data.
- Physics is Box2D v3 (`box2d3-wasm`, the single-threaded build, wrapped in `physics.ts`). Everything that moves
  is a dynamic body, swept against walls (continuous collision; the small fast ones are also bullets, swept against
  other bodies), moved only by finite forces: never set a body's position or velocity, push it (`drive`, `steer`,
  `kick`, `force`). Walls are shapes on one static body; floor levels are collision category bits. The player is a
  light 10 cm disc whose wanted velocity is first clipped by `sweep` (Box2D's mover queries), so it never pushes
  into anything.
- The 2D canvas painters (`drawOutdoor`, `drawOfficeFloor`, ...) only paint textures for the 3D floors.
- Commit to git after every change, and push directly to `main` (no pull request needed).

## Layout (`src/`)

- `world/`: the static city, built as the modules load (walls, furniture, colliders, stairs, lifts, stations).
  They draw from one shared random sequence, so `main.ts` imports them in a fixed order; adding
  random calls to an earlier module reshuffles everything after it.
- `state.ts`: the player `P` (loaded from the saved position), shared mutable state `S`, the camera, input.
  Modules can't assign to each other's variables, so anything several modules change lives on `S`.
- `sim/`: everything that moves each tick (`tick.ts` is the step; the player's body in `player.ts`; trains, traffic,
  pedestrians, cars, boat, arena). Each module applies its forces, then `tick.ts` steps the physics once.
- `render/`: the 3D scene (`scene*.ts` build it once, `view.ts` updates and draws each frame), the
  texture painters (`paint.ts`) and mesh helpers (`mesh.ts`).
- `hud.ts`, `input.ts`, `main.ts` (the loop, and `window.G` for scripted tests).
- `demos/`: standalone pages built alongside the game (listed in `vite.config.ts`). `demos/physics-solver/` (code in
  `src/demos/`) is our own small rigid-body solver whose walls have no thickness and are never passed through:
  each wall remembers which side every body is on, and substeps are cut short enough that nothing moves more
  than 1 cm in one. Served at pfg.pw/citygame3/demos/physics-solver/.
- Colours are used as written: three's colour management is off and output is linear (see `render/renderer.ts`).
