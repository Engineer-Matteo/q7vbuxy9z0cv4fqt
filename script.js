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
