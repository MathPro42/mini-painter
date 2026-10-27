# Mini Painter

A small web app for trying out paint color schemes on your own 3D models and SVG files,
right in the browser. Nothing is uploaded to a server.

**Live:** https://mathpro42.github.io/mini-painter/

> Status: early. Open an SVG paint-scheme sheet (or any flat-colored SVG), then click or
> pick its regions and paint them on a view you can zoom into. 3D model upload is not
> there yet; until a file is opened, the viewport shows a placeholder cube.

## Quick start

```bash
npm ci
npm run dev     # http://localhost:5173/mini-painter/
npm run check   # lint, format, typecheck, tests, build
```

## Docs

- [CONTRIBUTING.md](./CONTRIBUTING.md): setup, scripts, running tests, architecture
- [CLAUDE.md](./CLAUDE.md): architecture rules, principles, decision log

## License

[MIT](./LICENSE)
