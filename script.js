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
