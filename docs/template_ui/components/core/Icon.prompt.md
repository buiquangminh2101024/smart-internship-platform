Lucide icon wrapper — the only icon source in InternHub; use it anywhere a glyph is needed instead of inline SVG.

```jsx
<Icon name="briefcase" size={18} />
<Icon name="search" size={16} title="Tìm kiếm" />
```

Icons inherit `currentColor`, so colour them on the parent. Default stroke weight is 1.75 (Lucide ships 2 — InternHub runs slightly lighter). Names are kebab-case Lucide names; the SVG is fetched from the pinned `lucide-static@0.474.0` CDN and cached per name.
