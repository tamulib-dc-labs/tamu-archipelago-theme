/**
 * @file
 * Search facets in a slide-in panel (/search, /search_grid).
 *
 * The facet sidebar is hidden and the results take the full width. A
 * "Filters" button above the results opens the facets as a Bootstrap 5
 * offcanvas panel over the page, which brings the backdrop, Esc to close,
 * focus handling and aria state with it. The button shows how many facets
 * are applied, and is refreshed after every facet AJAX update.
 *
 * The sidebar markup is reused in place: it only gains the offcanvas
 * classes and a header, so the facet blocks and their AJAX keep working.
 * Without JavaScript (or Bootstrap) the sidebar stays a normal column.
 */
(function (Drupal, once) {
  'use strict';

  var SIDEBAR = '#sidebar_first';

  function activeCount(sidebar) {
    return sidebar.querySelectorAll('.block-facets.facet-active').length;
  }

  function updateToggle(toggle, sidebar) {
    var count = activeCount(sidebar);
    toggle.querySelector('.tamu-facet-toggle__label').textContent = Drupal.t('Filters');
    var badge = toggle.querySelector('.tamu-facet-toggle__count');
    badge.textContent = count ? String(count) : '';
    badge.hidden = !count;
    toggle.setAttribute('aria-label', count ?
      Drupal.formatPlural(count, 'Filters, 1 applied', 'Filters, @count applied') :
      Drupal.t('Filters'));
  }

  function buildToggle() {
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'tamu-facet-toggle';
    toggle.setAttribute('data-bs-toggle', 'offcanvas');
    toggle.setAttribute('data-bs-target', SIDEBAR);
    toggle.setAttribute('aria-controls', SIDEBAR.slice(1));
    // Funnel icon; decorative, the label carries the meaning.
    toggle.innerHTML =
      '<svg class="tamu-facet-toggle__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M1.5 2h13a.5.5 0 0 1 .4.8L10 9.2V14a.5.5 0 0 1-.74.44l-2.5-1.38A.5.5 0 0 1 6.5 12.6V9.2L1.1 2.8A.5.5 0 0 1 1.5 2z"/>' +
      '</svg>' +
      '<span class="tamu-facet-toggle__label"></span>' +
      '<span class="tamu-facet-toggle__count" hidden></span>';
    return toggle;
  }

  function buildHeader() {
    var header = document.createElement('div');
    header.className = 'offcanvas-header tamu-facet-drawer__header';
    var title = document.createElement('h2');
    title.className = 'tamu-facet-drawer__title';
    title.id = 'tamu-facet-drawer-title';
    title.textContent = Drupal.t('Filter results');
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close';
    close.setAttribute('data-bs-dismiss', 'offcanvas');
    close.setAttribute('aria-label', Drupal.t('Close filters'));
    header.appendChild(title);
    header.appendChild(close);
    return header;
  }

  function setUp(sidebar) {
    sidebar.classList.add('offcanvas', 'offcanvas-start', 'tamu-facet-drawer');
    sidebar.setAttribute('tabindex', '-1');
    sidebar.setAttribute('aria-labelledby', 'tamu-facet-drawer-title');
    sidebar.insertBefore(buildHeader(), sidebar.firstChild);
    var aside = sidebar.querySelector(':scope > aside');
    if (aside) {
      aside.classList.add('offcanvas-body');
    }

    // The button sits in the band above the results, beside the
    // list/grid switcher, so it is in the same place on both displays.
    var toggle = buildToggle();
    var band = document.getElementById('main-breadcrumbs');
    if (band) {
      band.insertBefore(toggle, band.firstChild);
    }
    else {
      var main = document.querySelector('main#content');
      main.insertBefore(toggle, main.firstChild);
    }
    document.body.classList.add('has-facet-drawer');
  }

  Drupal.behaviors.tamuFacetDrawer = {
    attach: function (context) {
      if (!document.body.classList.contains('page-view-solr-search-content')) {
        return;
      }
      if (!(window.bootstrap && window.bootstrap.Offcanvas)) {
        // search-results.css hides the sidebar until the panel is ready;
        // give it back as a plain column.
        document.body.classList.add('no-facet-drawer');
        return;
      }
      once('tamu-facet-drawer', SIDEBAR, context).forEach(setUp);

      // Facet AJAX replaces blocks inside the sidebar; recount each time.
      var sidebar = document.querySelector(SIDEBAR);
      var toggle = document.querySelector('.tamu-facet-toggle');
      if (sidebar && toggle) {
        updateToggle(toggle, sidebar);
      }

      // The update also removes the facet link that had focus, which drops
      // focus to <body>: keyboard users lose their place, and Bootstrap's
      // Esc handler (bound to the panel) stops hearing keys. Put focus back
      // in the open panel.
      if (sidebar && sidebar.classList.contains('show') &&
        !sidebar.contains(document.activeElement)) {
        sidebar.focus();
      }
    }
  };

  // Esc still closes the panel if focus has ended up outside it anyway.
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }
    var sidebar = document.querySelector(SIDEBAR + '.offcanvas.show');
    var Offcanvas = window.bootstrap && window.bootstrap.Offcanvas;
    if (sidebar && Offcanvas && !sidebar.contains(event.target)) {
      Offcanvas.getOrCreateInstance(sidebar).hide();
    }
  });
})(Drupal, once);
