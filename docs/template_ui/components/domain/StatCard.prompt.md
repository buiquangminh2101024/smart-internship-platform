Dashboard metric tile for employer and admin overviews. Four across at most.

```jsx
<StatCard icon="briefcase" label="Tin đang hiển thị" value={12} />
<StatCard icon="users" label="Hồ sơ mới" value={48} delta="+8" deltaTone="up" hint="tuần này" />
```

Numbers use `--type-h1`, never display size — this is a work tool, not a marketing page.
