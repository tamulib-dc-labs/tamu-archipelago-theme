/**
 * @file
 * Advanced search (/advanced-search): "Narrow results" filters that are
 * part of the search, and a one-line summary of the search above the
 * results.
 *
 *   Results for Title has all of “cotton” AND Subject has any of “football”
 *   dated 1940 to 1949 · Type: Video or Audio
 */
(function (Drupal, once) {
  'use strict';

  var MATCH = {
    and: Drupal.t('has all of'),
    or: Drupal.t('has any of'),
    not: Drupal.t('has none of')
  };

  // ---------------------------------------------------------------------
  // Narrow results
  // ---------------------------------------------------------------------

  /**
   * The facet values in the page URL (f[0]=type:Book&f[1]=type:Map …),
   * in order, as [alias, value] pairs.
   */
  function urlFacets() {
    var pairs = [];
    new URLSearchParams(window.location.search).forEach(function (value, key) {
      if (/^f\[\d+\]$/.test(key)) {
        var at = value.indexOf(':');
        if (at > 0) {
          pairs.push([value.slice(0, at), value.slice(at + 1)]);
        }
      }
    });
    return pairs;
  }

  // What a closed filter says: "Any", one or two names, or a count.
  function summaryText(details) {
    var names = [];
    details.querySelectorAll('input:checked').forEach(function (box) {
      names.push(box.dataset.label);
    });
    if (!names.length) {
      return Drupal.t('Any');
    }
    if (names.length <= 2) {
      return names.join(', ');
    }
    return Drupal.formatPlural(names.length, '1 selected', '@count selected');
  }

  /**
   * One filter: an Aggie UX select-look summary that opens a checklist.
   * Values are the facet's links (value, label after the facet's replace
   * processor, count); values already in the URL start ticked, including
   * ones the current results no longer contain, so they can be unticked.
   */
  function buildFilter(filter, chosen, index) {
    var id = 'tamu-adv-narrow-' + index;
    var field = document.createElement('div');
    field.className = 'tamu-adv-narrow__field';

    var label = document.createElement('span');
    label.className = 'tamu-adv-narrow__label';
    label.id = id + '-label';
    label.textContent = filter.title;
    field.appendChild(label);

    var details = document.createElement('details');
    details.className = 'tamu-adv-ms';
    var summary = document.createElement('summary');
    summary.className = 'tamu-adv-ms__summary';
    summary.setAttribute('aria-describedby', label.id);
    details.appendChild(summary);

    var options = document.createElement('fieldset');
    options.className = 'tamu-adv-ms__options';
    var legend = document.createElement('legend');
    legend.className = 'visually-hidden';
    legend.textContent = filter.title;
    options.appendChild(legend);

    var items = filter.items.slice();
    chosen.forEach(function (value) {
      if (!items.some(function (item) { return item.value === value; })) {
        items.unshift({ value: value, label: value, count: '' });
      }
    });
    items.forEach(function (item, i) {
      var option = document.createElement('label');
      option.className = 'tamu-adv-ms__option';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.id = id + '-' + i;
      box.value = item.value;
      box.dataset.alias = filter.alias;
      box.dataset.label = item.label;
      box.checked = chosen.indexOf(item.value) !== -1;
      option.appendChild(box);
      var text = document.createElement('span');
      text.className = 'tamu-adv-ms__text';
      text.textContent = item.label;
      option.appendChild(text);
      if (item.count) {
        var count = document.createElement('span');
        count.className = 'tamu-adv-ms__count';
        count.textContent = '(' + item.count + ')';
        option.appendChild(count);
      }
      options.appendChild(option);
    });
    details.appendChild(options);
    summary.textContent = summaryText(details);
    options.addEventListener('change', function () {
      summary.textContent = summaryText(details);
    });
    field.appendChild(details);
    return field;
  }

  /**
   * "Narrow results": the Type / Rights / Digital origin / Medium facets
   * (links widget, OR operator, blocks in the Content 12 Columns width
   * region) as multi-select filters inside the search form.
   *
   * They are part of the search: ticking a value does nothing until
   * Search, which sends every ticked value as f[n]=alias:value next to
   * the search rows and Date, so they also survive a new search. Values
   * of one filter are ORed (Video or Audio); different filters are ANDed.
   * Reset clears them with the rest of the form.
   *
   * Facets with no values for the current results are skipped, and with
   * none there is no panel. Without JavaScript the facet blocks stay
   * where they are, as links.
   */
  Drupal.behaviors.tamuAdvancedSearchNarrow = {
    attach: function (context) {
      once('tamu-adv-narrow', 'body.page-view-advanced-search', context).forEach(function () {
        var form = document.querySelector('form.tamu-advanced-search');
        var region = document.querySelector('.region-content-top');
        if (!form || !region) {
          return;
        }
        var inUrl = urlFacets();
        var filters = [];
        region.querySelectorAll('.block-facets').forEach(function (block) {
          var list = block.querySelector('ul[data-drupal-facet-alias]');
          if (!list) {
            return;
          }
          var items = [];
          list.querySelectorAll('a[data-drupal-facet-item-value]').forEach(function (link) {
            var value = link.querySelector('.facet-item__value');
            items.push({
              value: link.dataset.drupalFacetItemValue,
              label: value ? value.textContent.trim() : link.dataset.drupalFacetItemValue,
              count: link.dataset.drupalFacetItemCount || ''
            });
          });
          var alias = list.dataset.drupalFacetAlias;
          var chosen = inUrl.filter(function (pair) { return pair[0] === alias; })
            .map(function (pair) { return pair[1]; });
          if (!items.length && !chosen.length) {
            return;
          }
          var title = block.querySelector('.accordion-button span, h2, .block-title');
          filters.push({ alias: alias, title: title ? title.textContent.trim() : alias, items: items, chosen: chosen });
          block.hidden = true;
        });
        if (!filters.length) {
          return;
        }

        var ours = filters.map(function (filter) { return filter.alias; });
        var panel = document.createElement('fieldset');
        panel.className = 'tamu-adv-narrow';
        var heading = document.createElement('legend');
        heading.className = 'tamu-adv-narrow__heading';
        heading.textContent = Drupal.t('Narrow results');
        panel.appendChild(heading);
        var hint = document.createElement('p');
        hint.className = 'tamu-adv-narrow__hint';
        hint.textContent = Drupal.t('Optional. Tick any values to include, then Search.');
        panel.appendChild(hint);
        var row = document.createElement('div');
        row.className = 'tamu-adv-narrow__fields';
        filters.forEach(function (filter, i) {
          row.appendChild(buildFilter(filter, filter.chosen, i));
        });
        panel.appendChild(row);

        // Inside the form, just above Search / Reset.
        var actions = form.querySelector('.form-actions');
        (actions ? actions.parentNode : form).insertBefore(panel, actions);

        // One open checklist at a time; Esc or a click elsewhere closes it.
        panel.addEventListener('toggle', function (event) {
          if (event.target.open) {
            panel.querySelectorAll('details[open]').forEach(function (other) {
              if (other !== event.target) {
                other.open = false;
              }
            });
          }
        }, true);
        document.addEventListener('click', function (event) {
          if (!panel.contains(event.target)) {
            panel.querySelectorAll('details[open]').forEach(function (open) {
              open.open = false;
            });
          }
        });
        panel.addEventListener('keydown', function (event) {
          var open = event.target.closest('details[open]');
          if (event.key === 'Escape' && open) {
            open.open = false;
            open.querySelector('summary').focus();
          }
        });

        // Search sends the ticked values (and any other facet in the URL)
        // as f[n]; Reset sends none.
        form.addEventListener('submit', function (event) {
          form.querySelectorAll('input[data-tamu-adv-facet]').forEach(function (input) {
            input.remove();
          });
          var submitter = event.submitter || document.activeElement;
          if (submitter && /^edit-reset/.test(submitter.getAttribute('data-drupal-selector') || '')) {
            return;
          }
          var values = inUrl.filter(function (pair) { return ours.indexOf(pair[0]) === -1; });
          panel.querySelectorAll('input[type="checkbox"]:checked').forEach(function (box) {
            values.push([box.dataset.alias, box.value]);
          });
          values.forEach(function (pair, i) {
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'f[' + i + ']';
            input.value = pair[0] + ':' + pair[1];
            input.setAttribute('data-tamu-adv-facet', '');
            form.appendChild(input);
          });
        });
      });
    }
  };

  // ---------------------------------------------------------------------
  // Summary line
  // ---------------------------------------------------------------------

  function selected(row, type) {
    var select = row.querySelector('select[data-advanced-search-type="' + type + '"]');
    if (!select || select.selectedIndex < 0) {
      return null;
    }
    var option = select.options[select.selectedIndex];
    return { value: option.value, label: option.textContent.trim() };
  }

  // Rows with no words are skipped, as the filter skips them; so are rows
  // Classic Mode keeps hidden.
  function terms(form) {
    var list = [];
    form.querySelectorAll('.tamu-adv-row:not(.hidden)').forEach(function (row) {
      var input = row.querySelector('input[type="text"]');
      var words = input ? input.value.trim() : '';
      if (!words) {
        return;
      }
      var group = selected(row, 'group_op') || selected(row, 'op');
      var field = selected(row, 'fields');
      var match = selected(row, 'boolean');
      list.push({
        group: group ? group.label : '',
        field: field ? field.label : '',
        match: match ? (MATCH[match.value] || match.label.toLowerCase()) : '',
        words: words
      });
    });
    return list;
  }

  // "dated 1950 to 1960", "dated 1950 or later", "dated 1960 or earlier"
  // from the Date filter (inputs marked by
  // tamu_theme_advanced_search_date_alter()).
  function dateRange(form) {
    var min = form.querySelector('[data-tamu-adv-date="min"]');
    var max = form.querySelector('[data-tamu-adv-date="max"]');
    var from = min ? min.value.trim() : '';
    var to = max ? max.value.trim() : '';
    if (from && to) {
      return Drupal.t('dated @from to @to', { '@from': from, '@to': to });
    }
    if (from) {
      return Drupal.t('dated @from or later', { '@from': from });
    }
    if (to) {
      return Drupal.t('dated @to or earlier', { '@to': to });
    }
    return '';
  }

  // "Type: Video or Audio", one per filter with ticked values, from the
  // Narrow results checklists (which start from the URL, so they match
  // what was searched).
  function narrowed(form) {
    var parts = [];
    form.querySelectorAll('.tamu-adv-narrow__field').forEach(function (field) {
      var names = [];
      field.querySelectorAll('input:checked').forEach(function (box) {
        names.push(box.dataset.label);
      });
      if (names.length) {
        parts.push({
          title: field.querySelector('.tamu-adv-narrow__label').textContent,
          values: names.join(' ' + Drupal.t('or') + ' ')
        });
      }
    });
    return parts;
  }

  function summary(list, range, filters) {
    var line = document.createElement('p');
    line.className = 'tamu-adv-summary';
    var lead = document.createElement('span');
    lead.className = 'tamu-adv-summary__lead';
    lead.textContent = Drupal.t('Results for');
    line.appendChild(lead);
    list.forEach(function (term, i) {
      if (i > 0 && term.group) {
        var op = document.createElement('span');
        op.className = 'tamu-adv-summary__op';
        op.textContent = term.group;
        line.appendChild(document.createTextNode(' '));
        line.appendChild(op);
      }
      line.appendChild(document.createTextNode(' '));
      if (term.field) {
        var field = document.createElement('strong');
        field.textContent = term.field;
        line.appendChild(field);
        line.appendChild(document.createTextNode(' '));
      }
      if (term.match) {
        line.appendChild(document.createTextNode(term.match + ' '));
      }
      var words = document.createElement('q');
      words.textContent = term.words;
      line.appendChild(words);
    });
    if (range) {
      line.appendChild(document.createTextNode(' ' + range));
    }
    filters.forEach(function (filter) {
      line.appendChild(document.createTextNode(' · '));
      var name = document.createElement('strong');
      name.textContent = filter.title + ':';
      line.appendChild(name);
      line.appendChild(document.createTextNode(' ' + filter.values));
    });
    return line;
  }

  Drupal.behaviors.tamuAdvancedSearchSummary = {
    attach: function (context) {
      once('tamu-adv-summary', '.view-id-advanced_search', context).forEach(function (view) {
        var form = view.querySelector('form.tamu-advanced-search') ||
          document.querySelector('form.tamu-advanced-search');
        if (!form) {
          return;
        }
        var list = terms(form);
        var range = dateRange(form);
        var filters = narrowed(form);
        if (!list.length && !range && !filters.length) {
          return;
        }
        // Straight above the results. Chiloé lifts .view-header ("Displaying
        // results …") above the form, so it is not a place for this line.
        var anchor = view.querySelector(':scope > .view-content') ||
          view.querySelector(':scope > .view-empty');
        if (anchor) {
          anchor.parentNode.insertBefore(summary(list, range, filters), anchor);
        }
      });
    }
  };
})(Drupal, once);
