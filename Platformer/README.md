# Platformer (Blazor WebAssembly, .NET 8)

Minimal 2D platformer scaffold that runs in the browser via Blazor WebAssembly. Player can move horizontally, jump, crouch, and shoot.

Quick run:

```powershell
cd Platformer
dotnet build
dotnet run
```

Open `https://localhost:7071` (port shown by dotnet) and navigate to `/`.

Controls:
- Move: `A/D` or `ArrowLeft/ArrowRight`
- Jump: `W` or `ArrowUp` or `Space`
- Crouch: `S` or `ArrowDown`
- Shoot: `Z` or `K`

Notes:
- The game logic is in `wwwroot/app.js` for simplicity; you can port to C# later using JS interop or a canvas library.
- To deploy, publish static files and host on any static site or use `dotnet publish` and host via ASP.NET or static host.
