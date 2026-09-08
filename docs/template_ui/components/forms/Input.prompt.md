Text entry anywhere in the product; `Field` is the exported label/hint/error shell for wrapping custom controls.

```jsx
<Input label="Email trường" type="email" icon="mail" placeholder="ban@sinhvien.edu.vn" required />
<Input icon="search" placeholder="Tìm vị trí, công ty, kỹ năng…" />
<Input label="Mức lương" error="Vui lòng nhập số." />
```

Labels are sentence-case Vietnamese; hints explain *why* a field is needed, not how to type. Errors are one short sentence with a period.
