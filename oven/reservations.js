function setupOvenReservations(reservationsPath, apiUrl) {
  var calendar = document.getElementById('reservation-calendar');
  var weekLabel = document.getElementById('week-label');
  var form = document.getElementById('reservation-form');
  var dateInput = document.getElementById('reservation-date');
  var timeInput = document.getElementById('reservation-time');
  var durationInput = document.getElementById('reservation-duration');
  var status = document.getElementById('reservation-status');
  var submitButton = form && form.querySelector('button[type="submit"]');
  if (!calendar || !weekLabel || !form || !dateInput || !timeInput || !durationInput || !status) return;
  if (!sessionStorage.getItem('dormAppPinVerified') || !sessionStorage.getItem('dormAppPin')) {
    window.location.replace('../index.html');
    return;
  }

  var reservations = [];
  var weekOffset = 0;

  function dateKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function parseDate(value) {
    var parts = value.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function getWeekStart() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    today.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
    return today;
  }

  function getSlotId(reservation) {
    return reservation.date + '|' + reservation.time + '|' + reservation.duration;
  }

  function normalizeReservations(data) {
    if (Array.isArray(data)) return data;
    return Object.keys(data || {}).map(function (slotId) {
      var parts = slotId.split('|');
      if (parts.length !== 3) return null;
      return {
        date: parts[0],
        time: parts[1],
        duration: Number(parts[2]),
        name: data[slotId],
        slotId: slotId
      };
    }).filter(Boolean);
  }

  function getReservations() {
    if (apiUrl) {
      var separator = apiUrl.indexOf('?') === -1 ? '?' : '&';
      return fetch(apiUrl + separator + 'type=oven&_=' + Date.now(), { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('Could not load reservations from the server.');
          return response.json();
        }).then(normalizeReservations);
    }
    return fetch(reservationsPath + '?v=' + Date.now()).then(function (response) {
      if (!response.ok) throw new Error('Could not load reservations.json.');
      return response.json();
    }).then(normalizeReservations);
  }

  function renderWeek() {
    var weekStart = getWeekStart();
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekLabel.textContent = weekStart.toLocaleDateString('en', { day: 'numeric', month: 'short' }) +
      ' - ' + weekEnd.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });

    var week = document.createElement('div');
    week.className = 'oven-week';
    var todayKey = dateKey(new Date());

    for (var dayIndex = 0; dayIndex < 7; dayIndex++) {
      var date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayIndex);
      var key = dateKey(date);
      var day = document.createElement('section');
      day.className = 'oven-day';
      if (key === todayKey) day.classList.add('is-today');

      var heading = document.createElement('div');
      heading.className = 'oven-day-header';
      heading.textContent = date.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
      day.appendChild(heading);

      reservations.filter(function (reservation) { return reservation.date === key; })
        .sort(function (a, b) { return a.time < b.time ? -1 : (a.time > b.time ? 1 : 0); })
        .forEach(function (reservation) {
          var event = document.createElement('div');
          event.className = 'oven-reservation';
          var start = reservation.time || '';
          var duration = Number(reservation.duration) || 0;
          var time = document.createElement('span');
          time.className = 'oven-reservation-time';
          time.textContent = start + ' - ' + formatEndTime(start, duration);
          var detail = document.createElement('span');
          detail.textContent = duration + ' min' + (reservation.name ? ' · ' + reservation.name : '');
          event.appendChild(time);
          event.appendChild(detail);
          day.appendChild(event);
        });
      week.appendChild(day);
    }

    calendar.innerHTML = '';
    var scroll = document.createElement('div');
    scroll.className = 'oven-calendar-scroll';
    scroll.appendChild(week);
    calendar.appendChild(scroll);
  }

  function formatEndTime(start, duration) {
    var parts = start.split(':');
    if (parts.length !== 2) return '';
    var totalMinutes = Number(parts[0]) * 60 + Number(parts[1]) + duration;
    return String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0') + ':' +
      String(totalMinutes % 60).padStart(2, '0');
  }

  function refreshReservations() {
    return getReservations().then(function (items) {
      reservations = Array.isArray(items) ? items : [];
      renderWeek();
      return reservations;
    }).catch(function (error) {
      calendar.innerHTML = '<div class="empty-msg">' + error.message + '</div>';
      throw error;
    });
  }

  function overlaps(reservation) {
    var start = reservation.time.split(':').map(Number);
    var newStart = start[0] * 60 + start[1];
    var newEnd = newStart + Number(reservation.duration);
    return reservations.some(function (existing) {
      if (existing.date !== reservation.date) return false;
      var existingTime = (existing.time || '').split(':').map(Number);
      if (existingTime.length !== 2 || existingTime.some(isNaN)) return false;
      var existingStart = existingTime[0] * 60 + existingTime[1];
      var existingEnd = existingStart + Number(existing.duration);
      return newStart < existingEnd && newEnd > existingStart;
    });
  }

  function saveReservation(reservation) {
    var payload = {
      pin: sessionStorage.getItem('dormAppPin'),
      type: 'oven',
      action: 'book',
      slotId: getSlotId(reservation)
    };
    return fetch(apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  }

  document.getElementById('prev-week').addEventListener('click', function () {
    weekOffset--;
    renderWeek();
  });
  document.getElementById('next-week').addEventListener('click', function () {
    weekOffset++;
    renderWeek();
  });

  var today = new Date();
  dateInput.value = dateKey(today);
  dateInput.min = dateKey(today);
  timeInput.value = '18:00';
  if (!apiUrl) {
    status.textContent = 'Booking is unavailable until the Apps Script URL is configured.';
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!apiUrl) {
      status.textContent = 'Add the deployed Apps Script URL to enable booking.';
      return;
    }

    var reservation = {
      date: dateInput.value,
      time: timeInput.value,
      duration: Number(durationInput.value)
    };
    if (!reservation.date || !reservation.time || reservation.duration <= 0) return;
    if (reservation.date === dateKey(new Date()) && reservation.time <=
        new Date().toTimeString().slice(0, 5)) {
      status.textContent = 'Choose a start time later than now.';
      return;
    }
    var startParts = reservation.time.split(':').map(Number);
    if (startParts[0] * 60 + startParts[1] + reservation.duration > 24 * 60) {
      status.textContent = 'Reservations must end before midnight.';
      return;
    }
    if (overlaps(reservation)) {
      status.textContent = 'That time overlaps an existing reservation.';
      return;
    }

    if (submitButton) submitButton.disabled = true;
    status.textContent = 'Saving reservation...';
    saveReservation(reservation).then(function () {
      return refreshReservations();
    }).then(function (updatedReservations) {
      var currentUser = sessionStorage.getItem('dormAppUser');
      var saved = updatedReservations.some(function (item) {
        return item.slotId === getSlotId(reservation) && item.name === currentUser;
      });
      if (!saved) throw new Error('The server did not confirm this reservation.');
      var currentWeekStart = getWeekStart();
      var reservationDate = parseDate(reservation.date);
      var dayDifference = Math.floor((reservationDate - currentWeekStart) / 86400000);
      if (dayDifference < 0 || dayDifference > 6) {
        weekOffset += Math.floor((reservationDate - currentWeekStart) / (7 * 86400000));
        renderWeek();
      }
      status.textContent = 'Reservation saved.';
    }).catch(function (error) {
      status.textContent = error.message || 'Could not save the reservation.';
    }).finally(function () {
      if (submitButton) submitButton.disabled = false;
    });
  });

  refreshReservations();
}