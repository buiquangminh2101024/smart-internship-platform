Top-level navigation for all three authenticated app shells. The `role` prop is how a user knows which product they are in.

```jsx
<SideNav role="employer" value={view} onChange={setView} header={<Logo />} items={[
  {value:'dash', label:'Tổng quan', icon:'layout-dashboard'},
  {section:'Tuyển dụng'},
  {value:'jobs', label:'Tin tuyển dụng', icon:'briefcase', count: 12},
]} />
```

248px wide, fixed. Items with `section` are non-interactive group headings.
