Icon-only control for dense places: card corners, table rows, toolbars, message composer.

```jsx
<IconButton icon="bookmark" label="Lưu tin" active={saved} onClick={toggle} />
<IconButton icon="ellipsis-vertical" label="Tùy chọn" size="sm" />
```

Always pass `label` — it is the accessible name and the tooltip. `active` renders the Pine-tinted selected state (used for saved jobs, pinned filters).
