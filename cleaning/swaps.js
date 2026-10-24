function createCleaningSwapButton(row, rows, apiUrl) {
  var username = sessionStorage.getItem('dormAppUser');
  if (!username || (row.person1 !== username && row.person2 !== username)) return null;

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'cleaning-swap-button';
  button.textContent = 'Swap';
  button.setAttribute('aria-label', 'Swap cleaning duty on ' + row.date);
  button.addEventListener('click', function () {
    openCleaningSwapDialog(row, rows, apiUrl, username);
  });
  return button;
}

function openCleaningSwapDialog(sourceRow, rows, apiUrl, username) {
  var sourceIndex = rows.indexOf(sourceRow);
  var otherRows = rows.map(function (row, index) {
    return { row: row, index: index };
  }).filter(function (item) {
    return item.index !== sourceIndex && item.row.date !== sourceRow.date;
  });

  if (!otherRows.length) return;

  var overlay = document.createElement('div');
  overlay.className = 'cleaning-swap-overlay';
  var panel = document.createElement('section');
  panel.className = 'cleaning-swap-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'cleaning-swap-title');

  var title = document.createElement('h2');
  title.id = 'cleaning-swap-title';
  title.textContent = 'Swap cleaning duty';
  panel.appendChild(title);

  var form = document.createElement('form');
  form.className = 'cleaning-swap-form';

  var modeLabel = document.createElement('label');
  modeLabel.textContent = 'Swap type';
  var modeSelect = document.createElement('select');
  var personOption = document.createElement('option');
  personOption.value = 'person';
  personOption.textContent = 'Swap my person slot';
  var teamOption = document.createElement('option');
  teamOption.value = 'team';
  teamOption.textContent = 'Swap the full team assignment';
  modeSelect.appendChild(personOption);
  modeSelect.appendChild(teamOption);
  modeLabel.appendChild(modeSelect);
  form.appendChild(modeLabel);

  var targetLabel = document.createElement('label');
  targetLabel.textContent = 'Other cleaning duty';
  var targetSelect = document.createElement('select');
  otherRows.forEach(function (item) {
    var option = document.createElement('option');
    option.value = String(item.index);
    option.textContent = item.row.date + ' · Team ' + item.row.team + ' · ' +
      [item.row.person1, item.row.person2].filter(Boolean).join(' & ');
    targetSelect.appendChild(option);
  });
  targetLabel.appendChild(targetSelect);
  form.appendChild(targetLabel);

  var personLabel = document.createElement('label');
  personLabel.textContent = 'Person to swap with';
  var targetPersonSelect = document.createElement('select');
  personLabel.appendChild(targetPersonSelect);
  form.appendChild(personLabel);

  var status = document.createElement('p');
  status.className = 'cleaning-swap-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  form.appendChild(status);

  var actions = document.createElement('div');
  actions.className = 'cleaning-swap-actions';
  var cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'cleaning-swap-cancel';
  cancelButton.textContent = 'Cancel';
  var submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Confirm swap';
  actions.appendChild(cancelButton);
  actions.appendChild(submitButton);
  form.appendChild(actions);

  function updatePeople() {
    var targetRow = rows[Number(targetSelect.value)];
    targetPersonSelect.innerHTML = '';
    ['person1', 'person2'].forEach(function (field) {
      var person = targetRow[field];
      if (!person || person === username) return;
      var option = document.createElement('option');
      option.value = field;
      option.textContent = person;
      targetPersonSelect.appendChild(option);
    });
    var isPersonSwap = modeSelect.value === 'person';
    personLabel.hidden = !isPersonSwap;
    if (isPersonSwap && targetPersonSelect.options.length === 0) {
      status.textContent = 'No other person is listed on that duty.';
    } else {
      status.textContent = '';
    }
  }

  modeSelect.addEventListener('change', updatePeople);
  targetSelect.addEventListener('change', updatePeople);
  updatePeople();

  function closeDialog() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  cancelButton.addEventListener('click', closeDialog);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) closeDialog();
  });
  overlay.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeDialog();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var targetIndex = Number(targetSelect.value);
    var updatedRows = rows.map(function (item) {
      return {
        date: item.date,
        team: item.team,
        person1: item.person1,
        person2: item.person2
      };
    });
    var source = updatedRows[sourceIndex];
    var target = updatedRows[targetIndex];

    if (modeSelect.value === 'team') {
      ['team', 'person1', 'person2'].forEach(function (field) {
        var value = source[field];
        source[field] = target[field];
        target[field] = value;
      });
    } else {
      var sourceField = source.person1 === username ? 'person1' : 'person2';
      var targetField = targetPersonSelect.value;
      if (!targetField || !target[targetField]) {
        status.textContent = 'Choose another person to swap with.';
        return;
      }
      var person = source[sourceField];
      source[sourceField] = target[targetField];
      target[targetField] = person;
    }

    var csvData = 'date,team,person1,person2\n' + updatedRows.map(function (item) {
      return [item.date, item.team, item.person1, item.person2].map(escapeCleaningCSV).join(',');
    }).join('\n');
    submitButton.disabled = true;
    status.textContent = 'Saving swap...';
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        pin: sessionStorage.getItem('dormAppPin'),
        type: 'cleaning',
        csvData: csvData
      })
    }).then(function (response) {
      if (!response.ok) throw new Error('The server rejected the swap.');
      return response.json();
    }).then(function (result) {
      if (!result || result.status !== 'success') {
        throw new Error(result && result.message ? result.message : 'The server rejected the swap.');
      }
      status.textContent = 'Swap saved.';
      window.location.reload();
    }).catch(function (error) {
      status.textContent = error.message || 'Could not save the swap.';
      submitButton.disabled = false;
    });
  });

  overlay.appendChild(panel);
  panel.appendChild(form);
  document.body.appendChild(overlay);
  modeSelect.focus();
}

function escapeCleaningCSV(value) {
  var text = String(value || '');
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}