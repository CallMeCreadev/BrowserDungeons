# BrowserDungeons / Platformer — Copilot Instructions

## Goal
Build a simple 2D browser platformer in **Blazor WebAssembly (.NET 8)** using a `<canvas>` and JS interop.
Target **60 FPS**, keyboard input, and readable platforming.

## Hard constraints
- Keep Blazor (no React/Vue).
- Do NOT touch `bin/` or `obj/`.
- Do NOT add a game engine unless explicitly asked.
- Keep source code readable (no minification).

## Where code goes
- `Pages/Index.razor` — hosts `<canvas>`, starts game via JS interop
- `wwwroot/app.js` — game loop, input, physics, rendering
- `wwwroot/css/app.css` — layout + UI styling

## Core gameplay (MVP)
- Player: move left/right, jump, gravity
- Solid platform collision
- Respawn if falling out of bounds
- One simple test level with a goal

## Implementation rules
- Use `requestAnimationFrame`
- Prefer JS for the game loop and rendering
- Avoid calling .NET every frame
- Centralize constants (gravity, speed, tile size)
- Use one global namespace: `window.platformer`

## Visual direction
- High-contrast platforms vs background
- Clear player silhouette
- Minimal UI, kept to corners
- Simple, readable **64-bit style**

## Visual inspiration (text summary)
- Player ~10–15% of screen height
- Platform spacing ~1–1.5× player height
- Dark/muted backgrounds, bright platforms
- Enclosed spaces, vertical traversal

Avoid:
- Busy backgrounds
- Low contrast
- Overly detailed sprites
