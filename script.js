// Font size adjustment, persisted for the session via root CSS variable
(function () {
  var MIN = 14, MAX = 32, STEP = 2;
  var stored = parseInt(localStorage.getItem('vub-font-size'), 10);
  var current = isNaN(stored) ? 20 : stored;

  function apply(size) {
    document.documentElement.style.setProperty('--base-size', size + 'px');
    localStorage.setItem('vub-font-size', size);
  }

  apply(current);

  document.addEventListener('DOMContentLoaded', function () {
    var inc = document.getElementById('font-inc');
    var dec = document.getElementById('font-dec');
    if (inc) inc.addEventListener('click', function () {
      current = Math.min(MAX, current + STEP);
      apply(current);
    });
    if (dec) dec.addEventListener('click', function () {
      current = Math.max(MIN, current - STEP);
      apply(current);
    });
  });
})();

// Load a CSV file and render each row using the provided builder function.
// builder(rowObject) must return a DOM element to append.
// CSV must have a header row; commas inside a field can be wrapped in "quotes".
function loadCSVList(csvPath, containerId, builder) {
  var container = document.getElementById(containerId);
  if (!container) return;

  fetch(csvPath + '?v=' + Date.now())
    .then(function (response) {
      if (!response.ok) throw new Error('CSV not found: ' + csvPath);
      return response.text();
    })
    .then(function (text) {
      var rows = parseCSV(text);
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-msg">Nog geen gegevens.</div>';
        return;
      }
      container.innerHTML = '';
      rows.forEach(function (row) {
        container.appendChild(builder(row));
      });
    })
    .catch(function (err) {
      container.innerHTML = '<div class="empty-msg">Kon gegevens niet laden (' + err.message + ').</div>';
    });
}

// Basic CSV parser: handles quoted fields containing commas, returns array of objects
// keyed by the header row.
function parseCSV(text) {
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .filter(function (line) { return line.trim().length > 0; });
  if (lines.length === 0) return [];

  var headers = splitCSVLine(lines[0]);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var values = splitCSVLine(lines[i]);
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j].trim()] = (values[j] || '').trim();
    }
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Date-aware timetable with week navigation.
// Expected CSV columns: date (YYYY-MM-DD), day, start, end, course, type, room
function setupClassViewToggle(csvPath, timetableContainerId, listContainerId, labelId, prevId, nextId, controlsId) {
  var calendarBtn = document.getElementById('view-calendar');
  var listBtn = document.getElementById('view-list');
  var timetableEl = document.getElementById(timetableContainerId);
  var listEl = document.getElementById(listContainerId);
  var controlsEl = document.getElementById(controlsId);
  if (!calendarBtn || !listBtn || !timetableEl || !listEl) return;

  function show(view) {
    if (view === 'list') {
      timetableEl.style.display = 'none';
      listEl.style.display = '';
      if (controlsEl) controlsEl.style.display = 'none';
      calendarBtn.classList.remove('active');
      listBtn.classList.add('active');
    } else {
      timetableEl.style.display = '';
      listEl.style.display = 'none';
      if (controlsEl) controlsEl.style.display = '';
      calendarBtn.classList.add('active');
      listBtn.classList.remove('active');
    }
  }

  calendarBtn.addEventListener('click', function () { show('calendar'); });
  listBtn.addEventListener('click', function () { show('list'); });
  loadTimetable(csvPath, timetableContainerId, labelId, prevId, nextId);
  loadDatedList(csvPath, listContainerId);
  show('calendar');
}

function loadTimetable(csvPath, containerId, labelId, prevId, nextId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  // Monday of the current week as the starting offset
  var weekOffset = 0;

  fetch(csvPath + '?v=' + Date.now())
    .then(function (response) {
      if (!response.ok) throw new Error('CSV not found: ' + csvPath);
      return response.text();
    })
    .then(function (text) {
      var allRows = parseCSV(text);
      if (allRows.length === 0) {
        container.innerHTML = '<div class="empty-msg">Nog geen lessen.</div>';
        return;
      }

      function getMonday(offset) {
        var now = new Date();
        var day = now.getDay(); // 0=Sun,1=Mon,...
        var diff = (day === 0 ? -6 : 1 - day); // adjust to Monday
        var monday = new Date(now);
        monday.setDate(now.getDate() + diff + offset * 7);
        monday.setHours(0, 0, 0, 0);
        return monday;
      }

      function toYMD(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
      }

      function parseTime(time) {
        if (!time) return null;
        var parts = time.split(':');
        if (parts.length !== 2) return null;
        var hours = parseInt(parts[0], 10);
        var minutes = parseInt(parts[1], 10);
        if (isNaN(hours) || isNaN(minutes)) return null;
        return { hours: hours, minutes: minutes };
      }

      function assignColumns(events) {
        var columns = [];
        events.forEach(function (event) {
          for (var i = 0; i < columns.length; i++) {
            if (event.startMinutes >= columns[i][columns[i].length - 1].endMinutes) {
              columns[i].push(event);
              event.column = i;
              return;
            }
          }
          event.column = columns.length;
          columns.push([event]);
        });
        return columns.length;
      }

      function renderWeek() {
        var monday = getMonday(weekOffset);
        var weekDays = [];
        for (var i = 0; i < 7; i++) {
          var d = new Date(monday);
          d.setDate(monday.getDate() + i);
          weekDays.push(d);
        }

        var sunday = weekDays[6];
        var label = document.getElementById(labelId);
        if (label) {
          var fmt = { day: 'numeric', month: 'long' };
          label.textContent =
            monday.toLocaleDateString('nl-BE', fmt) + ' – ' +
            sunday.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
        }

        // Filter rows belonging to this week
        var weekDates = weekDays.map(toYMD);
        var weekRows = allRows.filter(function (r) { return weekDates.indexOf(r.date) !== -1; });

        // Only show days that have classes this week
        var activeDays = weekDays.filter(function (d) {
          return weekRows.some(function (r) { return r.date === toYMD(d); });
        });

        container.innerHTML = '';

        if (activeDays.length === 0) {
          container.innerHTML = '<div class="empty-msg">Geen lessen deze week.</div>';
          return;
        }

        var grid = document.createElement('div');
        grid.className = 'timetable';

        activeDays.forEach(function (dayDate) {
          var ymd = toYMD(dayDate);
          var dayRows = weekRows.filter(function (r) { return r.date === ymd; });

          var col = document.createElement('div');
          col.className = 'timetable-col';

          var header = document.createElement('div');
          header.className = 'timetable-col-header';
          header.innerHTML =
            '<span class="col-day">' + dayDate.toLocaleDateString('nl-BE', { weekday: 'long' }) + '</span>' +
            '<span class="col-date">' + dayDate.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }) + '</span>';
          col.appendChild(header);

          var body = document.createElement('div');
          body.className = 'timetable-col-body';

          var gridLines = document.createElement('div');
          gridLines.className = 'timetable-day-grid';
          for (var h = 0; h < 14; h++) {
            gridLines.appendChild(document.createElement('div'));
          }
          body.appendChild(gridLines);

          var dayStart = 8 * 60;
          var dayEnd = 22 * 60;

          var events = dayRows.map(function (match) {
            var start = parseTime(match.start);
            var end = parseTime(match.end);
            if (!start || !end) return null;
            var startMinutes = start.hours * 60 + start.minutes;
            var endMinutes = end.hours * 60 + end.minutes;
            if (endMinutes <= dayStart || startMinutes >= dayEnd) return null;
            return {
              row: match,
              startMinutes: Math.max(dayStart, startMinutes),
              endMinutes: Math.min(dayEnd, endMinutes)
            };
          }).filter(Boolean);

          events.sort(function (a, b) {
            if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
            return a.endMinutes - b.endMinutes;
          });

          var columns = assignColumns(events);

          events.forEach(function (eventInfo) {
            var top = eventInfo.startMinutes - dayStart;
            var height = Math.max(64, eventInfo.endMinutes - eventInfo.startMinutes);
            var smallGap = 6;
            var visualTop = top + 2;
            var visualHeight = Math.max(52, height - smallGap);

            var match = eventInfo.row;
            var event = document.createElement('div');
            event.className = 'timetable-event';
            event.style.top = visualTop + 'px';
            event.style.height = visualHeight + 'px';
            event.style.zIndex = eventInfo.column + 1;

            if (columns > 1) {
              var widthPercent = 100 / columns;
              event.style.left = 'calc(0.75em + ' + (eventInfo.column * widthPercent) + '%)';
              event.style.width = 'calc(' + widthPercent + '% - 1em)';
              event.style.right = 'auto';
            }

            var courseEl = document.createElement('span');
            courseEl.className = 'event-course';
            courseEl.textContent = match.course;
            event.appendChild(courseEl);

            var timeEl = document.createElement('span');
            timeEl.className = 'event-time';
            timeEl.textContent = match.start + ' – ' + match.end;
            event.appendChild(timeEl);

            if (match.type) {
              var typeEl = document.createElement('span');
              typeEl.className = 'event-type';
              typeEl.textContent = match.type;
              event.appendChild(typeEl);
            }

            if (match.room) {
              var roomEl = document.createElement('span');
              roomEl.className = 'event-room';
              roomEl.textContent = match.room;
              event.appendChild(roomEl);
            }

            body.appendChild(event);
          });

          col.appendChild(body);
          grid.appendChild(col);
        });

        container.appendChild(grid);
      }

      renderWeek();

      var prevBtn = document.getElementById(prevId);
      var nextBtn = document.getElementById(nextId);
      if (prevBtn) prevBtn.addEventListener('click', function () { weekOffset--; renderWeek(); });
      if (nextBtn) nextBtn.addEventListener('click', function () { weekOffset++; renderWeek(); });
    })
    .catch(function (err) {
      container.innerHTML = '<div class="empty-msg">Kon gegevens niet laden (' + err.message + ').</div>';
    });
}

// Render a chronological list of dated entries, grouped by date.
// Expected CSV columns: date (YYYY-MM-DD), day, start, end, course, type, room
function loadDatedList(csvPath, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  fetch(csvPath + '?v=' + Date.now())
    .then(function (response) {
      if (!response.ok) throw new Error('CSV not found: ' + csvPath);
      return response.text();
    })
    .then(function (text) {
      var rows = parseCSV(text);
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-msg">Nog geen gegevens.</div>';
        return;
      }

      // Sort chronologically
      rows.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.start < b.start ? -1 : (a.start > b.start ? 1 : 0);
      });

      // Split into upcoming (today onward) and past
      var today = new Date();
      var todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

      var upcoming = rows.filter(function (r) { return r.date >= todayStr; });
      var past = rows.filter(function (r) { return r.date < todayStr; });

      container.innerHTML = '';

      if (upcoming.length === 0) {
        var noneMsg = document.createElement('div');
        noneMsg.className = 'empty-msg';
        noneMsg.textContent = 'Geen aankomende afspraken.';
        container.appendChild(noneMsg);
      } else {
        appendDatedRows(upcoming, container);
      }

      if (past.length > 0) {
        var pastSection = document.createElement('div');
        pastSection.className = 'past-section';

        var toggle = document.createElement('button');
        toggle.className = 'past-toggle';
        toggle.textContent = 'Toon vorige afspraken (' + past.length + ')';

        var pastContainer = document.createElement('div');
        pastContainer.className = 'past-entries';
        pastContainer.style.display = 'none';
        appendDatedRows(past.reverse(), pastContainer);

        toggle.addEventListener('click', function () {
          var isHidden = pastContainer.style.display === 'none';
          pastContainer.style.display = isHidden ? 'block' : 'none';
          toggle.textContent = isHidden
            ? 'Verberg vorige afspraken (' + past.length + ')'
            : 'Toon vorige afspraken (' + past.length + ')';
        });

        pastSection.appendChild(toggle);
        pastSection.appendChild(pastContainer);
        container.appendChild(pastSection);
      }
    })
    .catch(function (err) {
      container.innerHTML = '<div class="empty-msg">Kon gegevens niet laden (' + err.message + ').</div>';
    });
}

function appendDatedRows(rows, container) {
  var currentDate = null;

  rows.forEach(function (row) {
    if (row.date !== currentDate) {
      currentDate = row.date;
      var heading = document.createElement('div');
      heading.className = 'day-heading';
      heading.textContent = formatDateLabel(row.date, row.day);
      container.appendChild(heading);
    }

    var card = document.createElement('div');
    card.className = 'entry-card';

    var title = document.createElement('div');
    title.className = 'title';
    title.textContent = row.course;

    var meta = document.createElement('div');
    meta.className = 'meta';
    var metaText = row.start + ' \u2013 ' + row.end;
    if (row.type) metaText += ' \u00b7 ' + row.type;
    if (row.room) metaText += ' \u00b7 ' + row.room;
    meta.textContent = metaText;

    card.appendChild(title);
    card.appendChild(meta);
    container.appendChild(card);
  });
}

function formatDateLabel(dateStr, dayName) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  var label = d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return label;
}

// Build a small horizontal bar showing grade out of 20, color-coded.
// grade: number (0-20). Returns a DOM element.
function buildGradeBar(grade) {
  var track = document.createElement('div');
  track.className = 'grade-bar-track';

  var fill = document.createElement('div');
  fill.className = 'grade-bar-fill';

  var numGrade = parseFloat(grade);
  if (isNaN(numGrade)) numGrade = 0;

  var percent = Math.max(0, Math.min(100, (numGrade / 20) * 100));
  fill.style.width = percent + '%';

  var colorClass;
  if (numGrade < 10) {
    colorClass = 'grade-bar-fail';
  } else if (numGrade < 12) {
    colorClass = 'grade-bar-low';
  } else if (numGrade < 14) {
    colorClass = 'grade-bar-mid';
  } else if (numGrade < 16) {
    colorClass = 'grade-bar-good';
  } else {
    colorClass = 'grade-bar-great';
  }
  fill.classList.add(colorClass);

  track.appendChild(fill);
  return track;
}

// Simple live search/filter for course or entry lists
function setupSearch(inputId, itemSelector, emptyMsgId) {
  var input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', function () {
    var query = input.value.trim().toLowerCase();
    var items = document.querySelectorAll(itemSelector);
    var visibleCount = 0;
    items.forEach(function (item) {
      var text = item.textContent.toLowerCase();
      var match = text.indexOf(query) !== -1;
      item.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });
    var emptyMsg = document.getElementById(emptyMsgId);
    if (emptyMsg) emptyMsg.style.display = visibleCount === 0 ? 'block' : 'none';
  });
}