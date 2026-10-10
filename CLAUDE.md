# Dock Buddies: notes for Claude

- Characters: **Barry** (brown plush bear) and **Nom** (pink alien, not a bunny). Soft cel look, no fur. Don't widen the bear beyond 1.08.
- Show work on the characters as stills, not videos, unless asked.
- Scene changes: edit `scene/src/scene.js`, run `scene/build-scene.sh` (reuses `scene/baked-meshes.b64`). Check with stills via `scene/dir_test.py` (Playwright + SwiftShader; query params like `?preview`, `?sleep=1`, `?bday=8`, `?expr=`, `?mouse=x,y`).
- Shape changes in `sculpt.js` need a re-bake (see `scene/build-scene.sh` header).
- The Swift app can't be compiled in the Linux container; GitHub Actions compiles it and reports errors as annotations
  (read them via `gh api repos/jochapam/dock-buddies/check-runs/<job-id>/annotations`).
- Release = bump `VERSION` and push to main. Installed apps self-update from the latest release.
- Never put personal names or the birthday message in the repo; that lives in each Mac's Settings.
- **Greg** is Nom's plush crocodile (green, cream jaw/belly, big grin with teeth, curly tail, wonky golden horns, small brown bow). Nom hugs him during the "croc" activity and while asleep.
- Director activities (scene.js `ACTS`): toast, croc (Greg cuddle), stretch, story (Barry reads a picture book; favourite in the evening), refill (Nom pours from a coffee pot); waving hello when the pointer comes close; Halloween pumpkin (24-31 Oct) and bats (31st); plus waking up with a stretch and yawn. The app's ☕ > Ask Them To menu calls `window.doActivity(name)`.
- Chats (scene/src/chats.js): short scripted conversations every 12-18 min; bubbles drawn natively by the app (WKScriptMessageHandler "say"), in-scene sprite fallback for tests (`?chat=N&ct=seconds`).
- Planned: movie night.
- Stored meshes are used in sculpt order; anything sculpted after the stored set is sculpted live. So add new shapes at the END (after Greg), check with `scene/multi.py` (one page load, many states via `__params.set(...)`), then re-bake when final.
