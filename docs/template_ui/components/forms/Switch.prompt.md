Settings that take effect the moment they are flipped: notification channels, profile visibility, auto-close on quota.

```jsx
<Switch label="Nhận email khi có tin phù hợp" checked={emailOn} onChange={toggle} />
```

If the change needs a Save button, use `Checkbox` instead — a Switch always implies "saved already".
