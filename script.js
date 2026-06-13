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

  fetch(csvPath)
    .then(function (response) {
      if (!response.ok) throw new Error('CSV not found: ' + csvPath);
      return response.text();
    })
    .then(function (text) {
      var rows = parseCSV(text);
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-msg">No entries yet.</div>';
        return;
      }
      container.innerHTML = '';
      rows.forEach(function (row) {
        container.appendChild(builder(row));
      });
    })
    .catch(function (err) {
      container.innerHTML = '<div class="empty-msg">Could not load data (' + err.message + ').</div>';
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

// Render a weekly timetable grid from a CSV file.
// Expected CSV columns: day,start,end,course,type,room
// day must be a weekday name (Monday..Sunday), start/end as HH:MM.
function loadTimetable(csvPath, containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  fetch(csvPath)
    .then(function (response) {
      if (!response.ok) throw new Error('CSV not found: ' + csvPath);
      return response.text();
    })
    .then(function (text) {
      var rows = parseCSV(text);
      if (rows.length === 0) {
        container.innerHTML = '<div class="empty-msg">No classes yet.</div>';
        return;
      }
      renderTimetable(rows, container);
    })
    .catch(function (err) {
      container.innerHTML = '<div class="empty-msg">Could not load data (' + err.message + ').</div>';
    });
}

function renderTimetable(rows, container) {
  var dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Only show days that actually have at least one class
  var daysWithClasses = dayOrder.filter(function (day) {
    return rows.some(function (r) { return r.day === day; });
  });

  // Build sorted list of unique time slots across all rows
  var timeSet = {};
  rows.forEach(function (r) {
    timeSet[r.start] = true;
  });
  var times = Object.keys(timeSet).sort();

  container.innerHTML = '';
  var grid = document.createElement('div');
  grid.className = 'timetable';

  daysWithClasses.forEach(function (day) {
    var col = document.createElement('div');
    col.className = 'timetable-col';

    var header = document.createElement('div');
    header.className = 'timetable-col-header';
    header.textContent = day;
    col.appendChild(header);

    times.forEach(function (time) {
      var match = rows.find(function (r) { return r.day === day && r.start === time; });

      if (match) {
        var slot = document.createElement('div');
        slot.className = 'timetable-slot';

        var event = document.createElement('div');
        event.className = 'timetable-event';

        var courseEl = document.createElement('span');
        courseEl.className = 'event-course';
        courseEl.textContent = match.course;
        event.appendChild(courseEl);

        var timeEl = document.createElement('span');
        timeEl.className = 'event-time';
        timeEl.textContent = match.start + ' - ' + match.end;
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

        slot.appendChild(event);
        col.appendChild(slot);
      } else {
        var emptySlot = document.createElement('div');
        emptySlot.className = 'timetable-empty-slot';
        col.appendChild(emptySlot);
      }
    });

    grid.appendChild(col);
  });

  container.appendChild(grid);
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