The single object every role sees. Same card in candidate search, saved jobs, employer job manager and admin moderation queue — only the props change.

```jsx
<JobCard title="Thực tập sinh Frontend" company="FPT Software" verified isNew
  location="Hà Nội" salary="4 – 6 triệu / tháng" deadline="Còn 12 ngày"
  tags={["React", "3 tháng", "Hybrid"]} saved={saved} onSave={toggle} onClick={open} />
```

Candidate views pass `onSave` and no `status`. Employer/admin views pass `status` and omit `onSave`. Salary and deadline are pre-formatted strings — formatting is the app's job, not the component's.
