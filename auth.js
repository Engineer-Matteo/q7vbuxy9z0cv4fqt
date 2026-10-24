function setupPinGate(appsScriptUrl, onAuthenticated) {
  var gate = document.getElementById('pin-gate');
  var content = document.getElementById('app-content');
  var form = document.getElementById('pin-form');
  var pinInput = document.getElementById('pin-input');
  var status = document.getElementById('pin-status');
  var submitButton = form && form.querySelector('button[type="submit"]');
  if (!gate || !content || !form || !pinInput || !status) return;

  function revealApp() {
    gate.hidden = true;
    content.hidden = false;
    if (typeof onAuthenticated === 'function') onAuthenticated();
  }

  if (sessionStorage.getItem('dormAppPinVerified') === 'true' && sessionStorage.getItem('dormAppPin')) {
    revealApp();
    return;
  }
  sessionStorage.removeItem('dormAppPinVerified');
  sessionStorage.removeItem('dormAppPin');
  sessionStorage.removeItem('dormAppUser');

  pinInput.focus();
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var pin = pinInput.value.trim();
    if (!appsScriptUrl) {
      status.textContent = 'PIN verification is not configured yet.';
      return;
    }

    if (submitButton) submitButton.disabled = true;
    status.textContent = 'Checking PIN...';
    fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ pin: pin, type: 'oven', action: 'verify' })
    }).then(function (response) {
      if (!response.ok) throw new Error('PIN verification failed.');
      return response.json();
    }).then(function (result) {
      if (!result || result.status !== 'success') {
        throw new Error(result && result.message === 'Invalid PIN' ? 'Incorrect PIN.' : 'PIN verification failed.');
      }
      sessionStorage.setItem('dormAppPin', pin);
      sessionStorage.setItem('dormAppUser', result.user || '');
      sessionStorage.setItem('dormAppPinVerified', 'true');
      revealApp();
    }).catch(function (error) {
      status.textContent = error && error.message === 'Incorrect PIN.'
        ? error.message
        : 'Could not verify the PIN. Check the Apps Script URL and deployment access.';
      pinInput.select();
    }).finally(function () {
      if (submitButton) submitButton.disabled = false;
    });
  });
}