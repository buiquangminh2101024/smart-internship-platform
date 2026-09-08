Multi-select in filter panels, consent lines, and "select all" table headers.

```jsx
<Checkbox label="Remote" checked={remote} onChange={() => setRemote(!remote)} />
<Checkbox label="Đồng ý cho nhà tuyển dụng xem CV" description="Bạn có thể tắt bất cứ lúc nào trong Cài đặt." />
<Checkbox indeterminate label="Chọn tất cả" />
```
