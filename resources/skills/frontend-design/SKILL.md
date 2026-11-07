---
name: frontend-design
description: Direction for shipping interface work that does not look templated.
version: 1.0.0
---

# Frontend design

Before writing components, decide and write down in `docs/design-system.md`:

- **Type**: one display face, one body face, a real scale (12/14/16/20/28/40). No more than three weights.
- **Palette**: one neutral ramp plus one accent. Name every colour as a token; never hardcode hex in components.
- **Layout**: the primary object of the page gets the most space. Decide the grid before the components.
- **Depth**: pick one mechanism (hairline borders, or soft shadows, not both everywhere).

Rules that prevent the templated look:

- No gradient headline text, no random glass panels, no icon in every heading.
- No three-equal-cards section as the default layout.
- Every screen needs a real empty state and a real error state.
- Type scale and spacing must come from tokens, not from ad-hoc pixel values.
- Test at 360px, 768px and 1440px before calling it done.
