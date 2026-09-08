Every panel, list row and stat block in InternHub sits on a Card. Never stack shadows by nesting Cards — use `tone="sunken"` for an inner well.

```jsx
<Card padding="lg">…</Card>
<Card interactive selected={id === openId} onClick={open}>…</Card>
```

`tone="warning"` is reserved for moderation/verification notices; `tone="brand"` for onboarding and empty-state promos.
