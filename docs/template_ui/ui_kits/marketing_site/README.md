# UI kit — Marketing site

The public, signed-out surface. This is the only place `variant="accent"` CTAs and the Pine-deep full-bleed hero are allowed.

| File | Contents |
| --- | --- |
| `index.html` | The landing page, composed of the sections below |
| `Sections.jsx` | `SiteHeader`, `Hero`, `Roles`, `Lifecycle`, `Featured`, `EmployerCta`, `SiteFooter`, `Photo` |
| `Data.jsx` | Four sample postings for the featured grid |

## Notes
- **No photography was supplied.** `Photo` renders a labelled placeholder describing the intended shot. Replace these with real images before any external use; do not substitute stock illustration or generated art.
- The hero search bar is a real `Card` + `Input` + `Select` + `Button` composition — the same controls as the app, so the transition into the product feels continuous.
- Header/footer links are inert; the two primary CTAs deep-link into the candidate and employer kits.
