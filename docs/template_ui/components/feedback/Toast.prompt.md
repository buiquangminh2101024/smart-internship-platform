Confirms an action just happened, or explains why it did not. Floating (bottom-right, 380px) by default; `inline` turns it into a page-level notice.

```jsx
<Toast tone="success" title="Đã gửi hồ sơ ứng tuyển" description="Nhà tuyển dụng thường phản hồi trong 5 ngày." onDismiss={hide} />
<Toast inline tone="warning" title="Công ty chưa được xác thực" description="Tin sẽ hiển thị sau khi Admin xác thực doanh nghiệp." />
```

Left bar carries the tone colour — the only place a 3px coloured border is allowed in the system.
