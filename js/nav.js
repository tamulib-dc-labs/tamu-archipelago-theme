/**
 * @file
 * Mobile navigation behaviour.
 *
 * The menu toggle lives in #tamu-top-bar and the panel it opens is positioned
 * fixed, floating over the page. That arrangement needs two things CSS alone
 * cannot provide:
 *
 * 1. The panel sits directly below the institutional bar, but that bar's
 *    height depends on the logo, which scales with the viewport. The height is
 *    measured here and published as --tamu-top-bar-h for header.css to consume.
 *
 * 2. A panel that overlays the page needs click-outside and Escape to dismiss
 *    it. A collapse that pushes content down does not, which is why the
 *    upstream markup ships without either.
 */
(function () {
  'use strict';

  var BAR_ID = 'tamu-top-bar';
  var PANEL_SELECTOR = '.to-be-collapsed';
  var TOGGLE_SELECTOR = '.tamu-top-bar__menu-toggle';

  /* ---------------------------------------------------------------
     Institutional bar height
     --------------------------------------------------------------- */

  function publishBarHeight() {
    var bar = document.getElementById(BAR_ID);
    if (!bar) {
      return;
    }
    var height = bar.offsetHeight;
    var identity = document.querySelector('.tamu-site-identity');
    if (identity) {
      height += identity.offsetHeight;
    }
    document.documentElement.style.setProperty(
      '--tamu-top-bar-h',
      height + 'px'
    );
  }

  publishBarHeight();
  // The logo is inline SVG, so layout is settled at parse time; load and
  // resize cover font swaps and orientation changes.
  window.addEventListener('load', publishBarHeight);
  window.addEventListener('resize', publishBarHeight);

  /* ---------------------------------------------------------------
     Dismissing the floating panel
     --------------------------------------------------------------- */

  function openPanels() {
    return Array.prototype.filter.call(
      document.querySelectorAll(PANEL_SELECTOR),
      function (panel) {
        return panel.classList.contains('show');
      }
    );
  }

  function close(panel) {
    var Collapse = window.bootstrap && window.bootstrap.Collapse;
    if (!Collapse) {
      return;
    }
    Collapse.getOrCreateInstance(panel, { toggle: false }).hide();
  }

  document.addEventListener('click', function (event) {
    var panels = openPanels();
    if (!panels.length) {
      return;
    }

    var target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    // The toggle runs Bootstrap's own handler; closing here too would have it
    // immediately reopen.
    if (target.closest(TOGGLE_SELECTOR)) {
      return;
    }

    panels.forEach(function (panel) {
      if (!panel.contains(target)) {
        close(panel);
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }

    var panels = openPanels();
    if (!panels.length) {
      return;
    }

    panels.forEach(close);

    var toggle = document.querySelector(TOGGLE_SELECTOR);
    if (toggle) {
      toggle.focus();
    }
  });

  /* ---------------------------------------------------------------
     Hero search placeholder
     The hero search box and the header/modal search box are two block
     placements of the *same* Views exposed-filter display, so Drupal
     builds a single form render array and reuses it for both — a
     hook_form_alter placeholder would show up in both inputs. Setting
     it here, scoped to the hero block's own DOM node, only touches the
     one input.
     --------------------------------------------------------------- */
  function setHeroSearchPlaceholder() {
    var heroSearchInput = document.querySelector(
      '.block-views-exposed-filter-blocksolr-search-content-page-1 input[type="text"]'
    );
    if (heroSearchInput && !heroSearchInput.placeholder) {
      heroSearchInput.placeholder = 'Search for images, books, videos, etc.';
    }
  }

  // This script runs mid-body, before the hero markup further down the
  // page has been parsed, so the query needs the DOM to finish first. Core's
  // autocomplete behavior also renames this input's id (it collides with the
  // header search box's) once it attaches, which happens around the same
  // time — waiting for the window 'load' event (after behaviors attach)
  // avoids a race where that rename clobbers our change.
  window.addEventListener('load', setHeroSearchPlaceholder);
})();
