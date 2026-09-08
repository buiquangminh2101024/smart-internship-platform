The committing action in a view — apply, publish, save, verify. Exactly one `primary` per screen region.

```jsx
<Button variant="primary" icon="send">Ứng tuyển ngay</Button>
<Button variant="secondary">Lưu tin</Button>
<Button variant="ghost" size="sm" icon="pencil">Sửa</Button>
```

Variants: `primary` (Pine), `secondary` (white + border, the workhorse), `ghost` (toolbars, table row actions), `accent` (Marigold — marketing CTAs only, never inside the app shell), `danger` (take down, delete), `link`. Sizes `sm` 32px / `md` 40px / `lg` 48px. `loading` disables and swaps in a spinner glyph.
