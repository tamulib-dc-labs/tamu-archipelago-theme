/**
 * @file
 * Advanced search: a one-line summary of the search above the results
 * (/advanced-search).
 *
 *   Results for Title has all of “cotton” AND Subject has any of “football”
 *
 * Built from the form as rendered, which carries the submitted values
 * whether the view reloaded the page or answered over AJAX. Rows with no
 * words are skipped, as the filter skips them; so are rows Classic Mode
 * keeps hidden.
 */
(function (Drupal, once) {
  'use strict';

  var MATCH = {
    and: Drupal.t('has all of'),
    or: Drupal.t('has any of'),
    not: Drupal.t('has none of')
  };

  function selected(row, type) {
    var select = row.querySelector('select[data-advanced-search-type="' + type + '"]');
    if (!select || select.selectedIndex < 0) {
      return null;
    }
    var option = select.options[select.selectedIndex];
    return { value: option.value, label: option.textContent.trim() };
  }

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

  function summary(list, range) {
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
    return line;
  }

  // "from 1950 to 1960", "from 1950", "up to 1960" from the Date filter
  // (inputs marked by tamu_theme_advanced_search_date_alter()).
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
        if (!list.length && !range) {
          return;
        }
        // Straight above the results. Chiloé lifts .view-header ("Displaying
        // results …") above the form, so it is not a place for this line.
        var anchor = view.querySelector(':scope > .view-content') ||
          view.querySelector(':scope > .view-empty');
        if (anchor) {
          anchor.parentNode.insertBefore(summary(list, range), anchor);
        }
      });
    }
  };

  /**
   * "Narrow results": the Type / Rights / Digital origin / Medium facets
   * (dropdown widget, blocks in the Content 12 Columns width region) as
   * one Aggie UX Horizontal Filters panel straight under the search form.
   *
   * Chiloé renders each facet block as a collapsed accordion. Each select
   * (built by the facets dropdown widget from its links) moves into the
   * panel under a real label taken from the block title; moving the
   * element keeps the widget's change handler, which loads the filtered
   * page. Facets with no values for the current search stay hidden (the
   * block has .hidden), and with none to show there is no panel. Without
   * JavaScript the blocks stay where they are, as links.
   */
  Drupal.behaviors.tamuAdvancedSearchNarrow = {
    attach: function (context) {
      once('tamu-adv-narrow', 'body.page-view-advanced-search', context).forEach(function () {
        var form = document.querySelector('form.tamu-advanced-search');
        var region = document.querySelector('.region-content-top');
        if (!form || !region) {
          return;
        }
        var fields = [];
        region.querySelectorAll('.block-facets.block-facet--dropdown').forEach(function (block) {
          var select = block.querySelector('.facets-widget-dropdown select');
          if (!select || block.classList.contains('hidden')) {
            return;
          }
          var title = block.querySelector('.accordion-button span, h2, .block-title');
          if (!select.id) {
            select.id = block.id + '-select';
          }
          var field = document.createElement('div');
          field.className = 'tamu-adv-narrow__field';
          var label = document.createElement('label');
          label.setAttribute('for', select.id);
          label.textContent = title ? title.textContent.trim() : '';
          field.appendChild(label);
          field.appendChild(select);
          fields.push(field);
          block.hidden = true;
        });
        if (!fields.length) {
          return;
        }
        var panel = document.createElement('section');
        panel.className = 'tamu-adv-narrow';
        panel.setAttribute('aria-labelledby', 'tamu-adv-narrow-heading');
        var heading = document.createElement('h2');
        heading.id = 'tamu-adv-narrow-heading';
        heading.className = 'tamu-adv-narrow__heading';
        heading.textContent = Drupal.t('Narrow results');
        var list = document.createElement('div');
        list.className = 'tamu-adv-narrow__fields';
        fields.forEach(function (field) {
          list.appendChild(field);
        });
        panel.appendChild(heading);
        panel.appendChild(list);
        form.parentNode.insertBefore(panel, form.nextSibling);
      });
    }
  };
})(Drupal, once);
