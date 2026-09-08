Paging for any long list: search results, applicants, verification queue.

```jsx
<Pagination page={p} total={13} onChange={setP} summary="1–20 trong 248 tin" />
```

Always pass `summary` on search results — students need to know how large the result set is before they page.
