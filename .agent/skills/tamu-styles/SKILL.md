---
name: tamu-styles
description: >
  Apply Texas A&M Aggie UX (AUX) design system conventions when writing CSS, HTML, or Twig templates
  for TAMU web projects. Use this skill whenever the user is working on styling, layout, components,
  or templates in a TAMU website — including the tamu_theme Drupal theme, Canopy/MDX sites, or any
  other TAMU web project. Trigger when the user asks about TAMU branding, Aggie UX, maroon color
  usage, TAMU fonts, card components, buttons, typography, section styles, or wants to create/fix
  any CSS for a Texas A&M site. Also trigger when the user pastes CSS with hardcoded hex values like
  #500000 or #732f2f that should be using CSS custom properties, or asks to review existing CSS for
  compliance.
---

# TAMU Aggie UX Style Assistant

You are an expert on the Texas A&M Aggie UX (AUX) design system. Your job is to help developers
write CSS, HTML, and Twig templates that correctly follow TAMU brand and AUX conventions.

## Your workflow

1. **Understand the goal** — ask the user what they're trying to build or style if it's not clear.
2. **Check the project context** — read existing CSS/template files to understand what's already in
   place. For Drupal, check `tamu_theme/css/` and `tamu_theme.libraries.yml`. For Canopy, check
   `site/` and `content/`.
3. **Generate correct code** — write CSS and/or HTML that follows the rules below.
4. **Flag problems** — point out hardcoded values, missing focus states, missing library
   registrations, and CSS variable availability issues.

---

## ⚠️ Critical: CSS variable availability in Drupal

Before writing any CSS that uses `var(--primary-brand)` etc., check that `slim.css` (which defines
the `:root` variables) is actually registered and loading. This has caused real outages.

**Check `tamu_theme.libraries.yml`** — it should have an `aux-slim` entry:
```yaml
aux-slim:
  version: VERSION
  css:
    base:
      css/slim.css: {}
```

**Check `tamu_theme.info.yml`** — `tamu_theme/aux-slim` should appear in the `libraries:` list
*before* `header-overrides` and `cards`.

If `aux-slim` is missing, the CSS variables only exist when the external AUX CDN
(`aux.tamu.edu`) loads successfully. If it fails or is slow, every `var(--primary-brand)` resolves
to transparent/nothing and the site goes white.

**Always use fallback values on critical layout rules** — especially anything that controls
background colors on navigation or major structural elements:
```css
/* ✅ Safe — renders correctly even if CDN fails */
background-color: var(--primary-brand, #500000);

/* ❌ Risky — goes transparent if slim.css isn't loaded */
background-color: var(--primary-brand);
```

Use bare `var(--token)` (no fallback) for non-structural things like text color inside components
where a fallback isn't critical. Reserve the fallback form for anything that would break layout or
branding if it failed.

---

## CSS Custom Properties (always prefer these over hardcoded values)

These are defined in `:root` by `slim.css`:

```css
/* Brand colors */
--primary-brand: #500000;       /* maroon — use for headings, borders, buttons */
--primary-brand-dark: #3c0000;  /* button borders, top bar */
--primary-brand-light: #732f2f; /* h3 color, hover states */
--ivory: #e9e4dc;
--cream: #d6d3c4;               /* on-dark hover links */
--white: #ffffff;
--black: #000000;
--gold: #af8846;                /* focus outlines */

/* Gray scale */
--gray-100: #f6f6f6  through  --gray-900: #202020

/* Utility */
--link: var(--primary-brand);
--link-hover: var(--primary-brand-light);
--link-on-dark: var(--white);
--link-on-dark-hover: var(--cream);
--success: #389f5a;
--error: #d04343;
--warning: #deb349;
--info: #415779;

/* Fonts */
--work-sans: "Work Sans", Arial, sans-serif;
--open-sans: "Open Sans", Arial, sans-serif;
--oswald: "Oswald", Arial, sans-serif;
--georgia: Georgia, Times, serif;

/* Breakpoints */
--aux-breakpoint-sm: 576px;
--aux-breakpoint-md: 768px;
--aux-breakpoint-lg: 992px;
--aux-breakpoint-xl: 1200px;
--aux-breakpoint-xxl: 1400px;

/* Grid */
--col-1: 8.33%;
--gutter: .75rem;
```

---

## Typography

| Element | Size     | Color                        | Font          | Weight/Style   |
|---------|----------|------------------------------|---------------|----------------|
| h1      | 3.25rem  | `var(--primary-brand)`       | Oswald        | 400, uppercase |
| h2      | 2rem     | `var(--primary-brand)`       | Oswald        | 400            |
| h3      | 1.6rem   | `var(--primary-brand-light)` | Work Sans     | 600            |
| h4      | 1.35rem  | `var(--gray-700)`            | Open Sans     | 400            |
| h5      | 1.125rem | `var(--black)`               | Work Sans     | 700, uppercase |
| h6      | 1rem     | `var(--gray-800)`            | Open Sans     | 400, italic    |
| p/body  | 1rem     | `var(--black)`               | Open Sans     | line-height 1.5 |

---

## Theme variants

Three visual personalities applied as a class on a parent element:

- **default** (no class) — Oswald headings, hash dividers, angles-right CTA icon
- **`.bold`** — Work Sans headings, heavier weights, italic h3, dot dividers, offset box-shadow
- **`.elegant`** — Georgia serif headings, dotted borders, long-arrow CTAs, editorial feel

Choose based on content tone: default for utility pages, bold for marketing/hero, elegant for
editorial or archive content.

---

## Component patterns

### Cards
```html
<div class="tamu-cards-grid">
  <div class="tamu-card">
    <div class="tamu-card__image">
      <img src="..." alt="...">
    </div>
    <div class="tamu-card__body">
      <h2 class="tamu-card__title">Title</h2>
      <p class="tamu-card__description">Description.</p>
      <a class="tamu-card__link" href="...">View</a>
    </div>
  </div>
</div>
```
The `::before` pseudo-element creates the maroon accent bar at top. Cards have hover lift
(`translateY(-4px)`) and image zoom (`scale(1.04)`).

### Page headers (hero)

AUX has two closely related hero header components built on the same `.hero` markup:

- **Landing page header** — use *only* on top-level index pages linked in the primary
  navigation. Never on pages with a sidebar. Requires strong, high-resolution imagery; if you
  don't have it, use the standard page header instead.
- **Home page header** — same component and markup, intended *only* for a website or microsite
  home page.

Both require an `<h1>` (for a11y + SEO — it should match or closely mirror the page `<title>`),
and both support an optional superhead, a description, and optional CTAs.

```html
<div class="hero">
  <div class="hero__image">
    <img src="/path/to/hero.jpg" alt="">
  </div>
  <div class="hero__container">
    <div class="hero__content">
      <div class="heading-group heading-group--display">
        <span class="superhead">Superhead</span>
        <h1>Heading Level 1</h1>
      </div>
      <p class="hero__description">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut nec ex
        sollicitudin tellus tincidunt venenatis.
      </p>
      <a href="#" class="btn btn--cta">
        Apply Now
        <svg><use href="#aux_angles-right"></use></svg>
      </a>
    </div>
  </div>
</div>
```

**Styles** — apply as a modifier: default (no class), `.hero--bold`, `.hero--elegant`
(mirrors the default/bold/elegant theme variants above — bold for marketing, elegant for
editorial).

**Media** — supports `<img>` or a background `<video>`. Image heights: `.hero--narrow` (3:1),
default/standard (2.5:1), `.hero--tall` (2:1). On medium+ screens the bottom-left of the image
is overlapped by the content box and on very large screens the image crops to center — choose
images with a vertically centered focal point and test across breakpoints.

**Video option** — no audio, no flashing content (nothing flashing >3×/sec), provide a `poster`
image (first frame), and set `aria-describedby` on the `<video>` pointing to an `id` on a
`<div>` outside the video that holds the description; also link to a downloadable `.txt`
version. Start the description by stating the video is silent and describe the action, not just
objects.

### CTA links
```html
<a class="cta-link-trailing" href="...">Learn more</a>  <!-- icon after -->
<a class="cta-link-leading" href="...">Go back</a>       <!-- icon before -->
```

### Buttons
```html
<button>Submit</button>                                    <!-- primary filled -->
<a class="primary-button-alt" href="...">Learn More</a>   <!-- outlined -->
```
Buttons: uppercase, `var(--work-sans)`, no border-radius, `var(--primary-brand)` background.

### Dividers / tables
- `<hr>` or `.divider` — renders as TAMU hash SVG mask (dots in `.bold`)
- `.table--slim` / `.table--simple` — borderless table variants

---

## Layout classes

```
.content-area               width: 100%
.side-bar                   width: 25%
.content-area-with-sidebar  width: 75%
.full-screen                width: 100vw
.col-2 through .col-12      12-column grid using --col-1: 8.33%
```

---

## Accessibility requirements

- **Focus styles**: `outline: dotted var(--gold) 2px; outline-offset: 3px` on `:focus-visible`
- **Skip links**: `background: var(--primary-brand); color: var(--white)`
- **Semantic HTML**: correct heading hierarchy, `<nav>`, `<main>`, `<aside>`, ARIA labels
- **Color contrast**: WCAG 2.1 AA — never use `var(--primary-brand)` text on dark maroon bg
- **On-dark links**: use `--link-on-dark` and `--link-on-dark-hover` (never maroon on dark)

---

## Drupal-specific rules

### New CSS file checklist
1. Place file in `tamu_theme/css/<name>.css`
2. Register in `tamu_theme.libraries.yml`:
```yaml
my-library-name:
  version: VERSION
  css:
    theme:
      css/my-file.css: {}
```
3. Add to `tamu_theme.info.yml` libraries list (or attach in `.theme` / Twig)
4. Run `drush cr` to clear cache — Drupal won't see new libraries without it

### Overriding Bootstrap (the theme extends Archipelago Chiloe)
Use `!important` only when fighting Bootstrap utility classes that can't be scoped more
specifically. Don't use it in your own component code.

### AUX CDN
The full AUX component library loads from:
`https://aux.tamu.edu/v2/2.0.0/styles/aux-styles.css`

This is registered as `tamu_theme/aggie-ux-cdn` in `libraries.yml`. `slim.css` should always
be loaded locally as a fallback for the CSS variable definitions.

---

## Canopy/MDX-specific rules

- Apply the same CSS variables and class conventions
- CSS goes in `site/` — import in main stylesheet or reference in `canopy.yml`
- Content files live in `content/` as `.mdx` — use JSX `className=` instead of `class=`

---

## Common mistakes to flag

| Problem | Fix |
|---------|-----|
| Hardcoded `#500000`, `#732f2f`, `#3c0000` | Use `var(--primary-brand)` etc. |
| Hardcoded `"Oswald"`, `"Work Sans"`, `"Open Sans"` | Use `var(--oswald)` etc. |
| `var(--token)` on nav/structural bg with no fallback | Add `var(--token, #fallback)` |
| `slim.css` missing from `libraries.yml` | Add `aux-slim` library entry |
| `aux-slim` missing from `info.yml` | Add to `libraries:` list before other theme libs |
| Missing `:focus-visible` on interactive elements | Add gold dotted outline |
| Maroon text on dark maroon background | Use `var(--link-on-dark)` instead |
| New CSS not registered in `libraries.yml` | Register and run `drush cr` |
| Duplicate CSS property in same rule | Remove the first one |
| `px` font sizes | Use `rem` units |
| Landing/home page header on a page with a sidebar | Use the standard page header |
| Hero header missing an `<h1>` | Add one that mirrors the page `<title>` |
| Background video with audio, flashing, or no description | Mute it, remove flashing, add `aria-describedby` + `.txt` link |
