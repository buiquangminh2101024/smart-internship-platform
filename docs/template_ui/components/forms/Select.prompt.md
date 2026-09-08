Single choice from a known list: industry, city, salary band, sort order, moderation decision.

```jsx
<Select label="Ngành" options={["Công nghệ thông tin", "Marketing", "Kế toán"]} />
<Select size="sm" value={sort} options={[{value:"new",label:"Mới nhất"},{value:"salary",label:"Lương cao nhất"}]} onChange={…} />
```

Use `size="sm"` for filter-bar selects, default for forms. Six or more options with search needs a bespoke combobox — not in this system yet.
