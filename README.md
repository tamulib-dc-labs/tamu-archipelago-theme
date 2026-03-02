# TAMU Theme

A Drupal child theme providing Texas A&M University branding for an [Archipelago Commons](https://github.com/esmero/archipelago-deployment) digital repository.

## Inheritance chain

```
bootstrap_barrio  (base)
  └── archipelago_subtheme_chiloe  (parent)
        └── tamu_theme  (this theme)
```

This theme inherits all regions, templates, and libraries from `archipelago_subtheme_chiloe`. Only the files explicitly present here override parent behavior.

---

## File structure

```
tamu_theme/
├── tamu_theme.info.yml          # Theme declaration and library attachment
├── tamu_theme.libraries.yml     # Registers css/header.css
├── tamu_theme.theme             # PHP preprocess hooks (currently empty)
├── config/
│   └── install/
│       └── tamu_theme.settings.yml  # Default Bootstrap Barrio settings
├── css/
│   └── header.css               # All visual overrides (top bar + main navbar)
└── templates/
    └── layout/
        └── html.html.twig       # Adds the sticky institutional top bar
```

---

## Key customizations

### 1. Institutional top bar (`html.html.twig`)

A sticky `<div id="tamu-top-bar">` is injected at the top of `<body>`, above all Drupal regions and the theme's main header. It contains:

- **Brand/logo** — an inline SVG linked to `https://www.tamu.edu`
- **Utility nav** — three links (University Libraries, Directory, TAMU Home)

To edit the top bar content, open `templates/layout/html.html.twig` and find the section between the two comment blocks:

```twig
{# ============================================================
   TAMU Institutional Top Bar
   ...
   ============================================================ #}
```

Changes to this file require a Drupal cache clear:

```bash
docker exec esmero-php drush cr
```

To replace the inline SVG with an image instead:

```twig
<img src="/path/to/logo.png" alt="Texas A&M University" />
```

### 2. Header CSS (`css/header.css`)

All visual styles live here. CSS changes take effect on browser hard-refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`) — no cache clear needed.

| Selector | Purpose |
|---|---|
| `#tamu-top-bar` | Sticky top bar background and layout |
| `.tamu-top-bar__inner` | Max-width container and padding |
| `.tamu-top-bar__brand svg` | Logo/SVG size (`height` controls scale) |
| `.tamu-top-bar__link` | Utility nav link color |
| `header#header nav.navbar` | Main navbar maroon background |
| `header#header nav.navbar .nav-link` | Primary menu link colors |

**Brand colors:**

| Name | Hex |
|---|---|
| Maroon (navbar) | `#500000` |
| Dark maroon (top bar) | `#3d0000` |
| White | `#ffffff` |

### 3. Bootstrap Barrio settings (`config/install/tamu_theme.settings.yml`)

Applied once on theme installation. Key values set here:

- `bootstrap_barrio_navbar_color: navbar-dark` — Bootstrap class that makes nav links white
- `bootstrap_barrio_navbar_background: ''` — removes Bootstrap's `bg-white` (CSS handles background)
- `bootstrap_barrio_base_primary_color: '#500000'` — maroon as the primary color

To change colors after installation, go to:
`/admin/appearance/settings/tamu_theme`

---

## Installation

### Prerequisites

- Archipelago Commons deployment running
- `archipelago_subtheme_chiloe` present in `web/themes/contrib/`
- [Role Theme Switcher](https://www.drupal.org/project/role_theme_switcher) module enabled

### Steps

1. Place this directory at `web/themes/custom/tamu_theme/`

2. Enable the theme:
   ```bash
   docker exec esmero-php drush theme:enable tamu_theme
   docker exec esmero-php drush config:set system.theme default tamu_theme -y
   docker exec esmero-php drush cr
   ```

3. **Important — update the Role Theme Switcher.** This site uses the Role Theme Switcher module, which overrides the system default theme per role. Without this step the new theme will not render for any user. Update each role:

   ```bash
   docker exec esmero-php drush php:eval "
   \$config = \Drupal::service('config.factory')->getEditable('role_theme_switcher.settings');
   \$roles = \$config->get('roles');
   foreach (['anonymous', 'authenticated', 'administrator', 'metadata_pro'] as \$role) {
     if (isset(\$roles[\$role])) {
       \$roles[\$role]['theme'] = 'tamu_theme';
     }
   }
   \$config->set('roles', \$roles)->save();
   " && docker exec esmero-php drush cr
   ```

   Or configure it via the UI at `/admin/appearance/role-theme-switcher`.

### Switching back to `archipelago_subtheme_chiloe`

```bash
docker exec esmero-php drush php:eval "
\$config = \Drupal::service('config.factory')->getEditable('role_theme_switcher.settings');
\$roles = \$config->get('roles');
foreach (['anonymous', 'authenticated', 'administrator', 'metadata_pro'] as \$role) {
  if (isset(\$roles[\$role])) {
    \$roles[\$role]['theme'] = 'archipelago_subtheme_chiloe';
  }
}
\$config->set('roles', \$roles)->save();
" && docker exec esmero-php drush cr
```

---

## Block layout

Each Drupal theme maintains its own independent block layout. When `tamu_theme` is first enabled, Drupal creates a fresh set of block placements. Any blocks placed in `archipelago_subtheme_chiloe` regions (such as welcome text on the front page) must be re-placed under the new theme at `/admin/structure/block`.

---

## Development tips

### Disable Twig caching

To avoid running `drush cr` after every template edit, add these lines to `web/sites/default/settings.php`:

```php
$settings['twig_debug'] = TRUE;
$settings['twig_auto_reload'] = TRUE;
$settings['twig_cache'] = FALSE;
```

Remove or comment them out before deploying to production.

### When do I need `drush cr`?

| Change type | Cache clear needed? |
|---|---|
| Twig template (`.html.twig`) | Yes — `drush cr` |
| CSS (`header.css`) | No — hard browser refresh |
| `tamu_theme.info.yml` or `.libraries.yml` | Yes — `drush cr` |
| `tamu_theme.theme` (PHP hooks) | Yes — `drush cr` |
