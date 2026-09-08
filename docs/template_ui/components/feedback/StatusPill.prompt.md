The lifecycle of a job post, rendered identically wherever it appears. Never invent a new status word — import `statusVocabulary` instead.

```jsx
<StatusPill status="review" />
<StatusPill status="published" size="sm" />
<StatusPill status="takendown" label="Đã hạ bởi Admin" />
```

`review` is Marigold because it means "waiting on a human". `takendown` is the only red state; `expired` is deliberately quiet (outlined grey) so closed inventory does not shout.
