# PDF Half-Cutter

[PDF Half-Cutter](https://www.kancharlawar.com/pdf-cutter/) prepares oversized PDF pages for printing on US Letter paper without scaling their contents.

For every input page, it:

1. Cuts the displayed page halfway along its longest dimension.
2. Emits the top half then bottom half for portrait pages, or left half then right half for landscape pages.
3. Rotates each half 90° clockwise.
4. Centers it on portrait or landscape US Letter at exactly 1:1 scale.
5. Numbers the generated pages consecutively in the bottom-right corner.

The app accepts any page size whose two halves fit on Letter after that single cut. It preserves the input PDF's title, subject, and author metadata. Conversion runs in a Web Worker in the browser; there is no application backend.

## Local development

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Validation commands:

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## License

[MIT](LICENSE)
