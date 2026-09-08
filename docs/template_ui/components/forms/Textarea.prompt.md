Long-form entry: job descriptions, requirements, cover letters, moderation notes.

```jsx
<Textarea label="Mô tả công việc" rows={6} maxLength={2000} value={desc} onChange={e => setDesc(e.target.value)} />
```

Pass `maxLength` on anything a recruiter writes for public display — the counter is part of the publishing discipline.
