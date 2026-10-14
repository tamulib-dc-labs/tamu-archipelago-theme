/**
 * @file
 * Advanced search (/advanced-search): filter rows (Date, Type, Rights,
 * Digital origin, Medium picked in a row's "Search in" list) and a
 * one-line summary of the search above the results.
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

  // "Search in" values for filters are "facet:{alias}"; the server never
  // sees them (see the submit handler).
  var PREFIX = 'facet:';

  // "Search in" value for the Date filter row.
  var DATE = 'date:range';

  // Filters read best broadest first.
  var ORDER = ['type', 'rights', 'digital_origin', 'medium'];

  // ---------------------------------------------------------------------
  // Filter rows
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

  /**
   * The facets on the page (links widget, OR operator, blocks in the
   * Content 12 Columns width region), keyed by URL alias, in ORDER. Each
   * has its title, its values for the current results (value, label after
   * the facet's replace processor, count) and the values ticked in the
   * URL. The blocks are hidden: filters live in the search rows.
   */
  function readFacets(region, inUrl) {
    var facets = {};
    if (region) {
      region.querySelectorAll('.block-facets').forEach(function (block) {
        var list = block.querySelector('ul[data-drupal-facet-alias]');
        if (!list) {
          return;
        }
        var alias = list.dataset.drupalFacetAlias;
        var items = [];
        list.querySelectorAll('a[data-drupal-facet-item-value]').forEach(function (link) {
          var value = link.querySelector('.facet-item__value');
          items.push({
            value: link.dataset.drupalFacetItemValue,
            label: value ? value.textContent.trim() : link.dataset.drupalFacetItemValue,
            count: link.dataset.drupalFacetItemCount || ''
          });
        });
        var title = block.querySelector('.accordion-button span, h2, .block-title');
        facets[alias] = {
          alias: alias,
          title: title ? title.textContent.trim() : alias,
          items: items,
          chosen: inUrl.filter(function (pair) { return pair[0] === alias; })
            .map(function (pair) { return pair[1]; })
        };
        block.hidden = true;
      });
    }
    // A value searched for that the results no longer hold stays listed,
    // ticked, so it can be unticked.
    Object.keys(facets).forEach(function (alias) {
      var facet = facets[alias];
      facet.chosen.forEach(function (value) {
        if (!facet.items.some(function (item) { return item.value === value; })) {
          facet.items.unshift({ value: value, label: value, count: '' });
        }
      });
      if (!facet.items.length) {
        delete facets[alias];
      }
    });
    return facets;
  }

  function sortedAliases(facets) {
    var rank = function (alias) {
      var i = ORDER.indexOf(alias);
      return i === -1 ? ORDER.length : i;
    };
    return Object.keys(facets).sort(function (a, b) { return rank(a) - rank(b); });
  }

  // What a closed list says: "Any", one or two names, or a count.
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
   * The value list a filter row shows in place of Match and Search words:
   * closed it looks like an AUX select and says what is ticked, open it is
   * a checklist with counts. Ticks are kept per filter in `ticked`, so they
   * follow the filter when Remove shifts rows up.
   */
  function buildValues(facet, ticked, first) {
    var wrap = document.createElement('div');
    wrap.className = 'js-form-item tamu-adv-values';
    wrap.dataset.alias = facet.alias;

    var label = document.createElement('span');
    label.className = 'tamu-adv-values__label' + (first ? '' : ' visually-hidden');
    label.textContent = Drupal.t('Includes');
    wrap.appendChild(label);

    var details = document.createElement('details');
    details.className = 'tamu-adv-ms';
    var summary = document.createElement('summary');
    summary.className = 'tamu-adv-ms__summary';
    summary.setAttribute('aria-label', Drupal.t('@filter values', { '@filter': facet.title }));
    details.appendChild(summary);

    var options = document.createElement('fieldset');
    options.className = 'tamu-adv-ms__options';
    var legend = document.createElement('legend');
    legend.className = 'visually-hidden';
    legend.textContent = facet.title;
    options.appendChild(legend);
    facet.items.forEach(function (item) {
      var option = document.createElement('label');
      option.className = 'tamu-adv-ms__option';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.value = item.value;
      box.dataset.label = item.label;
      box.checked = ticked[facet.alias].has(item.value);
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
    options.addEventListener('change', function (event) {
      var set = ticked[facet.alias];
      if (event.target.checked) {
        set.add(event.target.value);
      }
      else {
        set.delete(event.target.value);
      }
      summary.textContent = summaryText(details);
    });
    wrap.appendChild(details);
    return wrap;
  }

  /**
   * Filter rows: Date, Type, Rights, Digital origin and Medium are offered
   * at the end of every row's "Search in" list (a "Filter by" group).
   * Picking one swaps that row's Match and Search words for the filter:
   * From / To boxes for Date, the value list for the others; picking a
   * field again brings them back. A filter is used in one row at a time,
   * and a filter row is always ANDed with the rest.
   *
   * On Search, ticked values go out as f[n]=alias:value (values of one
   * filter ORed, filters ANDed) and Date as the Date filter's own date[min]
   * / date[max] inputs, which the date row borrows from the (now hidden)
   * Date fieldset; with no date row the range is cleared. The server gets
   * an empty "All fields" row in place of each filter row, so the
   * Strawberryfield filter never sees the facet:… / date:… values. On the
   * page that comes back, the URL's filters and date range are put back
   * into empty rows (adding rows with "Add another field" when needed).
   * Reset sends no filters.
   *
   * Without JavaScript the facet blocks stay on the page as links and the
   * Date fieldset stays as it is.
   */
  Drupal.behaviors.tamuAdvancedSearchFilters = {
    attach: function (context) {
      once('tamu-adv-filters', 'form.tamu-advanced-search', context).forEach(function (form) {
        var inUrl = urlFacets();
        var facets = readFacets(document.querySelector('.region-content-top'), inUrl);
        var aliases = sortedAliases(facets);
        var dateFieldset = form.querySelector('.tamu-adv-date');
        var dateHome = dateFieldset ? dateFieldset.querySelector(':scope > .fieldset-wrapper') : null;
        var dateItems = dateHome ? Array.prototype.slice.call(dateHome.querySelectorAll(':scope > .js-form-item')) : [];
        var dateInputs = dateItems.map(function (item) { return item.querySelector('input'); });
        if (!aliases.length && !dateInputs.length) {
          return;
        }
        if (dateFieldset) {
          dateFieldset.classList.add('hidden');
        }
        var ticked = {};
        aliases.forEach(function (alias) {
          ticked[alias] = new Set(facets[alias].chosen);
        });
        var rows = function () {
          return Array.prototype.slice.call(form.querySelectorAll('.tamu-adv-row'));
        };
        var fieldSelect = function (row) {
          return row.querySelector('select[data-advanced-search-type="fields"]');
        };
        var groupSelect = function (row) {
          return row.querySelector('select[data-advanced-search-type="group_op"], select[data-advanced-search-type="op"]');
        };
        // The filter a row's "Search in" names: "date", a facet alias, or
        // null for a field.
        var filterOf = function (row) {
          var value = fieldSelect(row).value;
          if (value === DATE) {
            return 'date';
          }
          return value.indexOf(PREFIX) === 0 ? value.slice(PREFIX.length) : null;
        };

        // The "Filter by" options, the same in every row (Remove shifts
        // rows by option index).
        rows().forEach(function (row) {
          var group = document.createElement('optgroup');
          group.label = Drupal.t('Filter by');
          if (dateInputs.length) {
            var date = document.createElement('option');
            date.value = DATE;
            date.textContent = Drupal.t('Date');
            group.appendChild(date);
          }
          aliases.forEach(function (alias) {
            var option = document.createElement('option');
            option.value = PREFIX + alias;
            option.textContent = facets[alias].title;
            group.appendChild(option);
          });
          fieldSelect(row).appendChild(group);
        });

        // From / To boxes for a date row: the Date filter's own inputs,
        // moved in.
        var buildDates = function (first) {
          var wrap = document.createElement('div');
          wrap.className = 'js-form-item tamu-adv-dates';
          wrap.dataset.filter = 'date';
          var label = document.createElement('span');
          label.className = 'tamu-adv-values__label' + (first ? '' : ' visually-hidden');
          label.textContent = Drupal.t('Between');
          wrap.appendChild(label);
          var boxes = document.createElement('div');
          boxes.className = 'tamu-adv-dates__boxes';
          dateItems.forEach(function (item) {
            boxes.appendChild(item);
          });
          wrap.appendChild(boxes);
          return wrap;
        };
        var putDatesHome = function () {
          dateItems.forEach(function (item) {
            dateHome.appendChild(item);
          });
        };

        var render = function () {
          var used = {};
          rows().forEach(function (row, index) {
            var select = fieldSelect(row);
            var filter = filterOf(row);
            if (filter && used[filter]) {
              // Same filter twice (after a shift): the later row goes back
              // to "All fields".
              select.selectedIndex = 0;
              filter = null;
            }
            var current = row.querySelector('.tamu-adv-values, .tamu-adv-dates');
            if (current && current.dataset.filter !== filter) {
              if (current.classList.contains('tamu-adv-dates')) {
                putDatesHome();
              }
              current.remove();
              current = null;
            }
            var connector = groupSelect(row);
            if (filter) {
              used[filter] = true;
              row.classList.add('tamu-adv-row--filter');
              if (!current) {
                row.querySelector(':scope > .fieldset-wrapper').appendChild(
                  filter === 'date' ? buildDates(index === 0) : buildValues(facets[filter], ticked, index === 0)
                );
              }
              if (connector && connector.dataset.advancedSearchType === 'group_op') {
                connector.value = 'and';
                connector.disabled = true;
              }
            }
            else {
              row.classList.remove('tamu-adv-row--filter');
              if (connector) {
                connector.disabled = false;
              }
            }
          });
          // Each filter in one row only.
          rows().forEach(function (row) {
            var select = fieldSelect(row);
            Array.prototype.forEach.call(select.querySelectorAll('optgroup option'), function (option) {
              var key = option.value === DATE ? 'date' : option.value.slice(PREFIX.length);
              option.disabled = Boolean(used[key]) && select.value !== option.value;
            });
          });
        };

        // Put the searched date range and the URL's filters back, each into
        // the next empty row.
        var addOne = form.querySelector('[data-advanced-search-addone]');
        var freeRows = function () {
          return rows().filter(function (row) {
            var words = row.querySelector('input[type="text"]');
            return !row.classList.contains('hidden') && !filterOf(row) &&
              !(words && words.value.trim());
          });
        };
        var restore = [];
        if (dateInputs.some(function (input) { return input.value.trim(); })) {
          restore.push(DATE);
        }
        aliases.forEach(function (alias) {
          if (facets[alias].chosen.length) {
            restore.push(PREFIX + alias);
          }
        });
        restore.forEach(function (value) {
          var free = freeRows();
          if (!free.length && addOne && !addOne.classList.contains('visually-hidden')) {
            addOne.click();
            free = freeRows();
          }
          if (free.length) {
            fieldSelect(free[0]).value = value;
          }
        });
        render();

        form.addEventListener('change', function (event) {
          if (event.target.matches('select[data-advanced-search-type="fields"]')) {
            render();
          }
        });
        // Remove and Add another field move values between rows (the
        // Strawberryfield script, on the same click); redraw after them.
        // Capture phase: that script stops the click from bubbling.
        form.addEventListener('click', function (event) {
          if (event.target.closest('[data-advanced-search-delone], [data-advanced-search-addone]')) {
            window.setTimeout(render, 0);
          }
        }, true);

        // One open list at a time; Esc or a click elsewhere closes it.
        form.addEventListener('toggle', function (event) {
          if (event.target.open) {
            form.querySelectorAll('details[open]').forEach(function (other) {
              if (other !== event.target) {
                other.open = false;
              }
            });
          }
        }, true);
        document.addEventListener('click', function (event) {
          form.querySelectorAll('details[open]').forEach(function (open) {
            if (!open.contains(event.target)) {
              open.open = false;
            }
          });
        });
        form.addEventListener('keydown', function (event) {
          var open = event.target.closest('details[open]');
          if (event.key === 'Escape' && open) {
            open.open = false;
            open.querySelector('summary').focus();
          }
        });

        form.addEventListener('submit', function (event) {
          // Facets renders the active values into the form as hidden f[n]
          // inputs, to keep them across searches; the rows decide now.
          form.querySelectorAll('input[type="hidden"][name^="f["]').forEach(function (input) {
            input.remove();
          });
          var values = inUrl.filter(function (pair) { return aliases.indexOf(pair[0]) === -1; });
          var dated = false;
          rows().forEach(function (row) {
            var filter = filterOf(row);
            if (!filter) {
              return;
            }
            if (filter === 'date') {
              dated = true;
            }
            else {
              ticked[filter].forEach(function (value) {
                values.push([filter, value]);
              });
            }
            // An empty "All fields" row for the server.
            fieldSelect(row).selectedIndex = 0;
            var words = row.querySelector('input[type="text"]');
            if (words) {
              words.value = '';
            }
            var connector = groupSelect(row);
            if (connector) {
              connector.disabled = false;
            }
          });
          if (!dated) {
            dateInputs.forEach(function (input) {
              input.value = '';
            });
          }
          var submitter = event.submitter || document.activeElement;
          if (submitter && /^edit-reset/.test(submitter.getAttribute('data-drupal-selector') || '')) {
            return;
          }
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

  // Word rows; rows with no words are skipped, as the filter skips them,
  // and so are rows Classic Mode keeps hidden and filter rows.
  function terms(form) {
    var list = [];
    form.querySelectorAll('.tamu-adv-row:not(.hidden):not(.tamu-adv-row--filter)').forEach(function (row) {
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

  // "Type: Video or Audio", one per filter row with ticked values (filter
  // rows start from the URL, so they match what was searched).
  function filtered(form) {
    var parts = [];
    form.querySelectorAll('.tamu-adv-row--filter').forEach(function (row) {
      var names = [];
      row.querySelectorAll('.tamu-adv-values input:checked').forEach(function (box) {
        names.push(box.dataset.label);
      });
      var field = selected(row, 'fields');
      if (names.length && field) {
        parts.push({ title: field.label, values: names.join(' ' + Drupal.t('or') + ' ') });
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
        var filters = filtered(form);
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
