# City demo

Top-down 3D city game. Everything is in `index.html` (no build step; open it in a browser).
`three.min.js` is a vendored copy of three.js r149 (classic script, so the game also runs from `file://`).

- The simulation is 2D (metres, plus a float floor level `z`); the 3D scene is generated from the same data.
- The 2D canvas painters (`drawOutdoor`, `drawOfficeFloor`, ...) only paint textures for the 3D floors.
- Commit to git after every change.
