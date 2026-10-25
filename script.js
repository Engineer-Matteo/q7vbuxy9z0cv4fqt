function parseCSV(text) {
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .filter(function (line) { return line.trim().length > 0; });
  if (lines.length === 0) return [];

  var headers = splitCSVLine(lines[0]);
  return lines.slice(1).map(function (line) {
    var values = splitCSVLine(line);
    var row = {};
    headers.forEach(function (header, index) {
      row[header.trim()] = (values[index] || '').trim();
    });
    return row;
  });
}

function splitCSVLine(line) {
  var values = [];
  var value = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var character = line[i];
    if (character === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function fetchCleaningRows(csvPath) {
  var requestUrl = csvPath;
  var separator = requestUrl.indexOf('?') === -1 ? '?' : '&';
  if (/^https?:\/\//i.test(requestUrl)) {
    requestUrl += separator + 'type=cleaning&_=' + Date.now();
  } else {
    requestUrl += separator + 'v=' + Date.now();
  }

  return fetch(requestUrl, { cache: 'no-store' }).then(function (response) {
    if (!response.ok) throw new Error('Could not fetch cleaning schedule (' + response.status + ').');
    return response.text();
  }).then(function (text) {
    var rows = parseCSV(text);
    if (rows.length > 0 && !Object.prototype.hasOwnProperty.call(rows[0], 'date')) {
      throw new Error('The backend response is missing the required date column.');
    }
    return rows;
  });
}

function setupCleaningSchedule(csvPath, calendarContainerId, listContainerId, labelId, prevId, nextId, controlsId) {
  if (sessionStorage.getItem('dormAppPinVerified') !== 'true' || !sessionStorage.getItem('dormAppPin')) {
    window.location.replace('../index.html');
    return;
  }

  var calendarBtn = document.getElementById('view-calendar');
  var listBtn = document.getElementById('view-list');
  var calendarEl = document.getElementById(calendarContainerId);
  var listEl = document.getElementById(listContainerId);
  var controlsEl = document.getElementById(controlsId);
  if (!calendarBtn || !listBtn || !calendarEl || !listEl) return;

  function show(view) {
    var showList = view === 'list';
    calendarEl.style.display = showList ? 'none' : '';
    listEl.style.display = showList ? '' : 'none';
    if (controlsEl) controlsEl.style.display = showList ? 'none' : '';
    calendarBtn.classList.toggle('active', !showList);
    listBtn.classList.toggle('active', showList);
  }

  calendarBtn.addEventListener('click', function () { show('calendar'); });
  listBtn.addEventListener('click', function () { show('list'); });
  loadCleaningMonthView(csvPath, calendarContainerId, labelId, prevId, nextId);
  loadCleaningList(csvPath, listContainerId);
  show('calendar');
}

function loadCleaningMonthView(csvPath, containerId, labelId, prevId, nextId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var monthOffset = 0;
  var weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  fetchCleaningRows(csvPath).then(function (rows) {
    var rowsByDate = {};
    rows.forEach(function (row) {
      if (!row.date) return;
      if (!rowsByDate[row.date]) rowsByDate[row.date] = [];
      rowsByDate[row.date].push(row);
    });

    function toYMD(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');
    }

    function renderMonth() {
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      var monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      var startOffset = (monthStart.getDay() + 6) % 7;
      var gridStart = new Date(monthStart);
      gridStart.setDate(monthStart.getDate() - startOffset);

      var label = document.getElementById(labelId);
      if (label) label.textContent = monthStart.toLocaleDateString('en', { month: 'long', year: 'numeric' });

      container.innerHTML = '';
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-msg">No cleaning schedule found.</div>';
        return;
      }

      var calendar = document.createElement('div');
      calendar.className = 'cleaning-calendar';
      weekdayNames.forEach(function (name) {
        var weekday = document.createElement('div');
        weekday.className = 'cleaning-weekday';
        weekday.textContent = name;
        calendar.appendChild(weekday);
      });

      var dayCount = Math.ceil((startOffset + monthEnd.getDate()) / 7) * 7;
      var todayYMD = toYMD(now);
      for (var i = 0; i < dayCount; i++) {
        var date = new Date(gridStart);
        date.setDate(gridStart.getDate() + i);
        var dateKey = toYMD(date);
        var cell = document.createElement('div');
        cell.className = 'cleaning-day';
        if (date.getMonth() !== monthStart.getMonth()) cell.classList.add('outside-month');
        if (dateKey === todayYMD) cell.classList.add('is-today');

        var dayNumber = document.createElement('span');
        dayNumber.className = 'cleaning-day-number';
        dayNumber.textContent = date.getDate();
        cell.appendChild(dayNumber);

        (rowsByDate[dateKey] || []).forEach(function (row) {
          var event = document.createElement('div');
          event.className = 'cleaning-event';
          var team = document.createElement('strong');
          team.textContent = 'Team ' + (row.team || '');
          var people = document.createElement('span');
          people.textContent = [row.person1, row.person2].filter(Boolean).join(' & ');
          event.appendChild(team);
          event.appendChild(people);
          var swapButton = createCleaningSwapButton(row, rows, csvPath);
          if (swapButton) event.appendChild(swapButton);
          cell.appendChild(event);
        });
        calendar.appendChild(cell);
      }
      container.appendChild(calendar);

      var agenda = document.createElement('div');
      agenda.className = 'cleaning-agenda';
      var monthStartKey = toYMD(monthStart);
      var monthEndKey = toYMD(monthEnd);
      var monthRows = rows.filter(function (row) {
        return row.date >= monthStartKey && row.date <= monthEndKey;
      }).sort(function (a, b) {
        return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
      });

      if (monthRows.length === 0) {
        var emptyAgenda = document.createElement('div');
        emptyAgenda.className = 'empty-msg';
        emptyAgenda.textContent = 'No cleaning duties this month.';
        agenda.appendChild(emptyAgenda);
      } else {
        monthRows.forEach(function (row) {
          var item = document.createElement('article');
          item.className = 'cleaning-agenda-item';

          var dateLabel = document.createElement('h2');
          dateLabel.textContent = formatDateLabel(row.date);
          item.appendChild(dateLabel);

          var assignment = document.createElement('p');
          assignment.className = 'cleaning-agenda-assignment';
          var teamLabel = document.createElement('strong');
          teamLabel.textContent = 'Team ' + (row.team || '');
          var peopleLabel = document.createElement('span');
          peopleLabel.textContent = [row.person1, row.person2].filter(Boolean).join(' & ');
          assignment.appendChild(teamLabel);
          assignment.appendChild(peopleLabel);
          item.appendChild(assignment);

          var swapButton = createCleaningSwapButton(row, rows, csvPath);
          if (swapButton) item.appendChild(swapButton);
          agenda.appendChild(item);
        });
      }
      container.appendChild(agenda);
    }

    renderMonth();
    var prevBtn = document.getElementById(prevId);
    var nextBtn = document.getElementById(nextId);
    var todayBtn = document.getElementById('today-month');
    if (prevBtn) prevBtn.addEventListener('click', function () { monthOffset--; renderMonth(); });
    if (nextBtn) nextBtn.addEventListener('click', function () { monthOffset++; renderMonth(); });
    if (todayBtn) todayBtn.addEventListener('click', function () { monthOffset = 0; renderMonth(); });
  }).catch(function (error) {
    container.innerHTML = '<div class="empty-msg">Could not load schedule (' + error.message + ').</div>';
  });
}

function loadCleaningList(csvPath, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  fetchCleaningRows(csvPath).then(function (rows) {
    rows.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    container.innerHTML = '';
    if (rows.length === 0) {
      container.innerHTML = '<div class="empty-msg">No cleaning schedule found.</div>';
      return;
    }

    var today = new Date();
    var todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    var upcoming = rows.filter(function (row) { return row.date >= todayKey; });
    var past = rows.filter(function (row) { return row.date < todayKey; }).reverse();

    function appendRows(scheduleRows, target) {
      scheduleRows.forEach(function (row) {
        var heading = document.createElement('div');
        heading.className = 'day-heading';
        heading.textContent = formatDateLabel(row.date);
        target.appendChild(heading);

        var card = document.createElement('div');
        card.className = 'entry-card';
        var title = document.createElement('div');
        title.className = 'title';
        title.textContent = 'Team ' + (row.team || '');
        var meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = [row.person1, row.person2].filter(Boolean).join(' & ');
        card.appendChild(title);
        card.appendChild(meta);
        var swapButton = createCleaningSwapButton(row, rows, csvPath);
        if (swapButton) card.appendChild(swapButton);
        target.appendChild(card);
      });
    }

    if (upcoming.length) {
      appendRows(upcoming, container);
    } else {
      var noneMsg = document.createElement('div');
      noneMsg.className = 'empty-msg';
      noneMsg.textContent = 'No upcoming cleaning duties.';
      container.appendChild(noneMsg);
    }

    if (past.length) {
      var section = document.createElement('div');
      section.className = 'past-section';
      var toggle = document.createElement('button');
      toggle.className = 'past-toggle';
      toggle.type = 'button';
      toggle.textContent = 'Show previous duties (' + past.length + ')';
      var pastEntries = document.createElement('div');
      pastEntries.className = 'past-entries';
      pastEntries.style.display = 'none';
      appendRows(past, pastEntries);
      toggle.addEventListener('click', function () {
        var isHidden = pastEntries.style.display === 'none';
        pastEntries.style.display = isHidden ? 'block' : 'none';
        toggle.textContent = (isHidden ? 'Hide' : 'Show') + ' previous duties (' + past.length + ')';
      });
      section.appendChild(toggle);
      section.appendChild(pastEntries);
      container.appendChild(section);
    }
  }).catch(function (error) {
    container.innerHTML = '<div class="empty-msg">Could not load schedule (' + error.message + ').</div>';
  });
}

function formatDateLabel(dateStr) {
  var parts = dateStr.split('-');
  var date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function loadNextEventBanner(csvPath, bannerId) {
  var banner = document.getElementById(bannerId);
  if (!banner) return;

  fetchCleaningRows(csvPath).then(function (rows) {
    var now = new Date();
    var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    var next = rows.filter(function (row) { return row.date >= today; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); })[0];
    if (!next) {
      banner.style.display = 'none';
      return;
    }

    var label = document.createElement('span');
    label.className = 'next-event-label';
    label.textContent = 'Next cleaners: ';
    var detail = document.createElement('span');
    detail.className = 'next-event-detail';
    detail.textContent = formatDateLabel(next.date) + ' · Team ' + next.team + ' · ' +
      [next.person1, next.person2].filter(Boolean).join(' & ');
    banner.innerHTML = '';
    banner.appendChild(label);
    banner.appendChild(detail);
    banner.style.display = '';
  }).catch(function () {
    banner.style.display = 'none';
  });
}

function setupCleaningDoneBanner(appsScriptUrl, bannerId) {
  var banner = document.getElementById(bannerId);
  var pin = sessionStorage.getItem('dormAppPin');
  if (!banner || !pin || !appsScriptUrl) return;

  var now = new Date();
  var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  function requestCleaningStatus(action) {
    return fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        pin: pin,
        action: action,
        date: today
      })
    }).then(function (response) {
      if (!response.ok) throw new Error('Could not check cleaning status.');
      return response.json();
    }).then(function (result) {
      if (!result || result.status !== 'success') {
        throw new Error(result && result.message ? result.message : 'Could not check cleaning status.');
      }
      return result;
    });
  }

  function showCompleted(message) {
    banner.replaceChildren();
    var text = document.createElement('span');
    text.textContent = message;
    banner.appendChild(text);
    banner.hidden = false;
  }

  requestCleaningStatus('cleaning-status').then(function (result) {
    if (!result.hasDuty) return;
    if (result.completed) {
      showCompleted('Job well done! Your cleaning for today is marked complete.');
      return;
    }

    banner.replaceChildren();
    var prompt = document.createElement('span');
    prompt.textContent = 'You are on the cleaning team today.';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'cleaning-done-button';
    button.textContent = '\u2713';
    button.setAttribute('aria-label', 'Mark cleaning as done');
    button.title = 'Mark cleaning as done';
    button.addEventListener('click', function () {
      button.disabled = true;
      button.textContent = '\u2026';
      button.setAttribute('aria-label', 'Saving cleaning completion');
      button.title = 'Saving cleaning completion';
      requestCleaningStatus('mark-cleaning-done').then(function (saved) {
        if (!saved.hasDuty || !saved.completed) {
          throw new Error('Could not confirm the cleaning was marked complete.');
        }
        showCompleted('Job well done! Your cleaning for today is marked complete.');
        window.alert('Job well done! Your cleaning has been marked as complete.');
      }).catch(function (error) {
        button.disabled = false;
        button.textContent = '\u2713';
        button.setAttribute('aria-label', 'Mark cleaning as done');
        button.title = 'Mark cleaning as done';
        window.alert(error.message || 'Could not mark cleaning as done. Please try again.');
      });
    });
    banner.appendChild(prompt);
    banner.appendChild(button);
    banner.hidden = false;
  }).catch(function () {
    showCompleted("Could not check today's cleaning status. Please refresh the page to try again.");
  });
}

function setupPageActions(appsScriptUrl) {
  if (sessionStorage.getItem('dormAppPinVerified') !== 'true' || !sessionStorage.getItem('dormAppPin')) return;

  var header = document.querySelector('header.top');
  var title = header && header.querySelector('h1');
  if (!header || !title || header.querySelector('.page-actions')) return;

  function createActionIcon(paths) {
    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    paths.forEach(function (pathData) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      icon.appendChild(path);
    });
    return icon;
  }

  var actions = document.createElement('div');
  actions.className = 'page-actions';

  var feedbackButton = document.createElement('button');
  feedbackButton.type = 'button';
  feedbackButton.className = 'page-action-button';
  feedbackButton.appendChild(createActionIcon([
    'M9 7.13v-1a3 3 0 0 1 6 0v1',
    'M12 20v-6',
    'M2 12h2',
    'M20 12h2',
    'M3 18h2',
    'M19 18h2',
    'M3 6h2',
    'M19 6h2',
    'M6 12a6 6 0 0 0 12 0V8H6z',
    'm8 2 2 2',
    'm14 4 2-2'
  ]));
  feedbackButton.setAttribute('aria-label', 'Report a bug or suggest a feature');
  feedbackButton.title = 'Report a bug or suggest a feature';

  var logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'page-action-button page-action-logout';
  logoutButton.appendChild(createActionIcon([
    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
    'm16 17 5-5-5-5',
    'M21 12H9'
  ]));
  logoutButton.setAttribute('aria-label', 'Log out');
  logoutButton.title = 'Log out';

  actions.appendChild(feedbackButton);
  actions.appendChild(logoutButton);
  header.insertBefore(actions, header.querySelector('.stripe'));

  logoutButton.addEventListener('click', function () {
    sessionStorage.removeItem('dormAppPinVerified');
    sessionStorage.removeItem('dormAppPin');
    sessionStorage.removeItem('dormAppUser');
    var script = document.querySelector('script[src$="script.js"]');
    window.location.replace(new URL('index.html', script.src).href);
  });

  var dialog = document.createElement('dialog');
  dialog.className = 'feedback-dialog';
  dialog.setAttribute('aria-labelledby', 'feedback-dialog-title');

  var form = document.createElement('form');
  form.className = 'feedback-form';
  var heading = document.createElement('h2');
  heading.id = 'feedback-dialog-title';
  heading.textContent = 'Send feedback';
  form.appendChild(heading);

  var typeLabel = document.createElement('label');
  typeLabel.textContent = 'What would you like to report?';
  var typeInput = document.createElement('select');
  typeInput.name = 'feedbackType';
  var bugOption = document.createElement('option');
  bugOption.value = 'Bug report';
  bugOption.textContent = 'Report a bug';
  var featureOption = document.createElement('option');
  featureOption.value = 'Feature suggestion';
  featureOption.textContent = 'Suggest a feature';
  typeInput.appendChild(bugOption);
  typeInput.appendChild(featureOption);
  typeLabel.appendChild(typeInput);
  form.appendChild(typeLabel);

  var messageLabel = document.createElement('label');
  messageLabel.textContent = 'Describe it';
  var messageInput = document.createElement('textarea');
  messageInput.name = 'message';
  messageInput.required = true;
  messageInput.maxLength = 10000;
  messageInput.rows = 6;
  messageInput.placeholder = 'Tell us what happened or what you would like to see.';
  messageLabel.appendChild(messageInput);
  form.appendChild(messageLabel);

  var status = document.createElement('p');
  status.className = 'feedback-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.appendChild(status);

  var formActions = document.createElement('div');
  formActions.className = 'feedback-form-actions';
  var cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  var submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Send';
  formActions.appendChild(cancelButton);
  formActions.appendChild(submitButton);
  form.appendChild(formActions);
  dialog.appendChild(form);
  document.body.appendChild(dialog);

  feedbackButton.addEventListener('click', function () {
    status.textContent = '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
  });
  cancelButton.addEventListener('click', function () {
    dialog.close();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!appsScriptUrl) {
      status.textContent = 'Feedback sending is not configured. Please try again later.';
      return;
    }

    submitButton.disabled = true;
    status.textContent = 'Sending feedback...';
    fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        pin: sessionStorage.getItem('dormAppPin'),
        action: 'feedback',
        feedbackType: typeInput.value,
        message: messageInput.value,
        page: document.title
      })
    }).then(function (response) {
      if (!response.ok) throw new Error('Feedback could not be sent.');
      return response.json();
    }).then(function (result) {
      if (!result || result.status !== 'success' || result.feedbackSent !== true) {
        throw new Error(result && result.message
          ? result.message
          : 'Feedback sending is not enabled on the deployed Apps Script. Deploy backend_script.gs and try again.');
      }
      form.reset();
      dialog.close();
      window.alert('Thank you. Your feedback has been sent.');
    }).catch(function (error) {
      status.textContent = error && error.message
        ? error.message
        : 'Could not send feedback. Please check your connection and try again.';
    }).finally(function () {
      submitButton.disabled = false;
    });
  });
}
