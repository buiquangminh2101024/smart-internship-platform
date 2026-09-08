import React from "react";

const CDN = "https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons";
const cache = new Map();

/** Lucide icon, fetched as real SVG markup and inked with currentColor. */
export function Icon({ name, size = 18, strokeWidth = 1.75, style, title, ...rest }) {
  const [markup, setMarkup] = React.useState(() => cache.get(name) || "");
  React.useEffect(() => {
    if (cache.has(name)) { setMarkup(cache.get(name)); return; }
    let alive = true;
    fetch(`${CDN}/${name}.svg`)
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => {
        const svg = t
          .replace(/width="24"/, 'width="100%"')
          .replace(/height="24"/, 'height="100%"')
          .replace(/stroke-width="2"/, `stroke-width="${strokeWidth}"`);
        cache.set(name, svg);
        if (alive) setMarkup(svg);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [name, strokeWidth]);

  return (
    <span
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: markup }}
      style={{
        display: "inline-flex",
        flex: "none",
        width: size,
        height: size,
        lineHeight: 0,
        color: "currentColor",
        ...style,
      }}
      {...rest}
    />
  );
}
