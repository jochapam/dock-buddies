# Dock Buddies: notes for Claude

- Characters: **Barry** (brown plush bear) and **Nom** (pink alien, not a bunny). Soft cel look, no fur. Don't widen the bear beyond 1.08.
- Show work on the characters as stills, not videos, unless asked.
- Scene changes: edit `scene/src/scene.js`, run `scene/build-scene.sh` (reuses `scene/baked-meshes.b64`). Check with stills via `scene/dir_test.py` (Playwright + SwiftShader; query params like `?preview`, `?sleep=1`, `?bday=8`, `?expr=`, `?mouse=x,y`).
- Shape changes in `sculpt.js` need a re-bake (see `scene/build-scene.sh` header).
- The Swift app can't be compiled in the Linux container; GitHub Actions compiles it and reports errors as annotations
  (read them via `gh api repos/jochapam/dock-buddies/check-runs/<job-id>/annotations`).
- Release = bump `VERSION` and push to main. Installed apps self-update from the latest release.
- Never put personal names or the birthday message in the repo; that lives in each Mac's Settings.
- Planned activities (plug into the director in scene.js): story time, Nom's plush crocodile, movie night.
