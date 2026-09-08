In-page view switching: application statuses, pipeline stages, profile sections, moderation queues.

```jsx
<Tabs value={tab} onChange={setTab} items={[
  {value:'all', label:'Tất cả', count: 24},
  {value:'review', label:'Chờ duyệt', count: 5},
  {value:'published', label:'Đang hiển thị', count: 12},
]} />
```

Counts belong on the tab, never in the panel heading. Do not use Tabs for top-level navigation — that is `SideNav`.
