/* ---------------- state ---------------- */
let catalog = { services: [], barbers: [], hairstyles: [], timeConfig: { times: [], peakTimes: [] } };
let adminData = null;
let currentUser = null;
let selection = { style: null, barber: null, service: null, date: null, slot: null };

const toast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.classList.remove('show'), 2600);
};

function showAlert(elId, msg, type = 'error') {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!msg) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
}

/* ---------------- API helpers ---------------- */
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadCatalog() {
  catalog = await api('/catalog');
}

async function refreshUser() {
  const { user } = await api('/auth/me');
  currentUser = user;
  updateHeader();
}

function peakTimes() {
  return catalog.timeConfig.peakTimes || [];
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function dateToApiFormat(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]} ${d.getDate()}`;
}

/* ---------------- navigation ---------------- */
function showView(name) {
  document.querySelectorAll('#mainNav .nav-link[data-view]').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === name);
  });
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const el = document.getElementById('view-' + name);
  if (el) el.classList.add('active');
}

async function navigate(view) {
  if (view === 'book' && (!currentUser || currentUser.role !== 'customer')) {
    toast('Please log in as a customer to book');
    showAuthTab('login');
    showView('auth');
    return;
  }
  if (view === 'bookings' && (!currentUser || currentUser.role !== 'customer')) {
    toast('Please log in to see your bookings');
    showAuthTab('login');
    showView('auth');
    return;
  }
  if (view === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
    showView('admin-login');
    return;
  }
  if (view === 'auth' && currentUser?.role === 'customer') {
    navigate('book');
    return;
  }
  if (view === 'admin-login' && currentUser?.role === 'admin') {
    navigate('admin');
    return;
  }
  showView(view);
  if (view === 'home') await renderHome();
  if (view === 'book') {
    await loadCatalog();
    renderBookFlow();
  }
  if (view === 'bookings') await renderBookings();
  if (view === 'admin') await renderAdmin();
}

document.getElementById('mainNav').addEventListener('click', (e) => {
  const link = e.target.closest('[data-view]');
  if (!link) return;
  e.preventDefault();
  navigate(link.dataset.view);
});

document.getElementById('navLogout').addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

document.getElementById('logoHome').addEventListener('click', () => navigate('home'));
document.getElementById('homeGetStarted').addEventListener('click', () => {
  if (currentUser?.role === 'customer') navigate('book');
  else {
    showAuthTab('register');
    showView('auth');
  }
});

/* ---------------- header / auth UI ---------------- */
function updateHeader() {
  const navCustomer = document.querySelectorAll('.nav-customer');
  const navAdmin = document.querySelectorAll('.nav-admin');
  const navAuth = document.getElementById('navAuth');
  const navAdminLogin = document.getElementById('navAdminLogin');
  const navLogout = document.getElementById('navLogout');

  navCustomer.forEach((el) => el.classList.add('hidden'));
  navAdmin.forEach((el) => el.classList.add('hidden'));
  navAuth.classList.remove('hidden');
  navAdminLogin.classList.remove('hidden');
  navLogout.classList.add('hidden');

  if (!currentUser) return;

  navAuth.classList.add('hidden');
  navLogout.classList.remove('hidden');

  if (currentUser.role === 'customer') {
    navCustomer.forEach((el) => el.classList.remove('hidden'));
    navAdminLogin.classList.add('hidden');
  }

  if (currentUser.role === 'admin') {
    navAdmin.forEach((el) => el.classList.remove('hidden'));
    navAdminLogin.classList.add('hidden');
  }
}

function showAuthTab(which) {
  document.querySelectorAll('.auth-tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.auth === which);
  });
  document.getElementById('customerLoginForm').classList.toggle('hidden', which !== 'login');
  document.getElementById('customerRegisterForm').classList.toggle('hidden', which !== 'register');
  document.getElementById('authError').textContent = '';
}

document.querySelectorAll('.auth-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => showAuthTab(btn.dataset.auth));
});

document.getElementById('customerLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('authError').textContent = '';
  try {
    const { user } = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      })
    });
    currentUser = user;
    updateHeader();
    toast('Welcome back!');
    navigate('book');
  } catch (err) {
    document.getElementById('authError').textContent = err.message;
  }
});

document.getElementById('customerRegisterForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('authError').textContent = '';
  try {
    const { user } = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('regName').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value
      })
    });
    currentUser = user;
    updateHeader();
    toast('Account created — you can book now');
    navigate('book');
  } catch (err) {
    document.getElementById('authError').textContent = err.message;
  }
});

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('adminAuthError').textContent = '';
  try {
    const { user } = await api('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('adminUsername').value,
        password: document.getElementById('adminPassword').value
      })
    });
    currentUser = user;
    updateHeader();
    toast('Admin signed in');
    navigate('admin');
  } catch (err) {
    document.getElementById('adminAuthError').textContent = err.message;
  }
});

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  currentUser = null;
  adminData = null;
  updateHeader();
  toast('Logged out');
  navigate('home');
}

/* ---------------- home (public) ---------------- */
async function renderHome() {
  await loadCatalog();
  renderHeroStats();
  document.getElementById('homeGallery').innerHTML = catalog.hairstyles.map((h) => `
    <div class="style-card">
      <div class="swatch" style="background:${h.color}">${escapeHtml(h.name)}</div>
      <div class="info"><div class="name">${escapeHtml(h.name)}</div><div class="tag">${escapeHtml(h.tag)}</div></div>
    </div>`).join('');

  document.getElementById('homeServices').innerHTML = catalog.services.map((s) => `
    <div class="service-item">
      <div><div class="s-name">${escapeHtml(s.name)}</div><div class="s-dur">${s.duration} min</div></div>
      <div class="s-price">₹${s.price}</div>
    </div>`).join('');

  document.getElementById('homeBarbers').innerHTML = catalog.barbers.map((b) => `
    <div class="barber-card">
      <div class="avatar" style="background:${b.color}">${escapeHtml(b.name[0])}</div>
      <div><h3>${escapeHtml(b.name)}</h3><div class="spec">${escapeHtml(b.spec)}</div><div class="rating">★ ${b.rating}</div></div>
    </div>`).join('');
}

function renderHeroStats() {
  const active = catalog.barbers.filter((b) => b.available !== false).length;
  document.getElementById('heroStats').innerHTML = `
    <div class="stat-pill"><div class="num">${active}</div><div class="lbl">Barbers available</div></div>
    <div class="stat-pill"><div class="num">${catalog.services.length}</div><div class="lbl">Services</div></div>
    <div class="stat-pill"><div class="num">${catalog.hairstyles.length}</div><div class="lbl">Style ideas</div></div>`;
}

/* ---------------- book flow ---------------- */
function renderBookFlow() {
  const svcSel = document.getElementById('service-select');
  const barberSel = document.getElementById('barber-select');
  const styleSel = document.getElementById('style-select');
  const dateInput = document.getElementById('book-date');

  svcSel.innerHTML = catalog.services.map((s) =>
    `<option value="${s.id}">${escapeHtml(s.name)} — ₹${s.price} (${s.duration} min)</option>`
  ).join('');

  barberSel.innerHTML = catalog.barbers.map((b) =>
    `<option value="${b.id}">${escapeHtml(b.name)} (${escapeHtml(b.spec)})</option>`
  ).join('');

  styleSel.innerHTML = '<option value="">— No preference —</option>' +
    catalog.hairstyles.map((h) => `<option value="${h.id}">${escapeHtml(h.name)}</option>`).join('');

  const today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);
  dateInput.value = today.toISOString().slice(0, 10);

  syncSelectionFromForm();
  loadTimeSlots();
  updateSummary();
}

function syncSelectionFromForm() {
  const svcId = Number(document.getElementById('service-select').value);
  const barberId = Number(document.getElementById('barber-select').value);
  const styleId = document.getElementById('style-select').value;
  const isoDate = document.getElementById('book-date').value;

  selection.service = catalog.services.find((s) => s.id === svcId) || null;
  selection.barber = catalog.barbers.find((b) => b.id === barberId) || null;
  selection.style = styleId ? catalog.hairstyles.find((h) => h.id === Number(styleId)) : null;
  selection.date = isoDate ? dateToApiFormat(isoDate) : null;
  selection.slot = document.getElementById('book-time').value || null;
}

async function loadTimeSlots() {
  const timeSel = document.getElementById('book-time');
  syncSelectionFromForm();
  if (!selection.barber || !selection.date) {
    timeSel.innerHTML = '<option value="">Select barber and date first</option>';
    selection.slot = null;
    return;
  }
  timeSel.innerHTML = '<option value="">Loading...</option>';
  try {
    const { slots } = await api(
      `/availability?barberId=${selection.barber.id}&date=${encodeURIComponent(selection.date)}`
    );
    const available = slots.filter((s) => s.available);
    if (available.length === 0) {
      timeSel.innerHTML = '<option value="">No slots available</option>';
      selection.slot = null;
      return;
    }
    timeSel.innerHTML = available.map((s) => {
      const label = s.peak ? `${s.slot} (peak +15%)` : s.slot;
      return `<option value="${s.slot}">${label}</option>`;
    }).join('');
    selection.slot = timeSel.value;
  } catch (e) {
    timeSel.innerHTML = `<option value="">${escapeHtml(e.message)}</option>`;
    selection.slot = null;
  }
}

function updateSummary() {
  const txt = document.getElementById('summaryText');
  const priceEl = document.getElementById('summaryPrice');
  const btn = document.getElementById('confirmBtn');
  const parts = [];
  if (selection.service) parts.push(selection.service.name);
  if (selection.barber) parts.push(selection.barber.name);
  if (selection.date && selection.slot) parts.push(`${selection.date}, ${selection.slot}`);
  txt.innerHTML = parts.length
    ? parts.map((p) => `<b>${escapeHtml(p)}</b>`).join(' · ')
    : 'Select a service, barber, date, and time';

  let price = selection.service ? selection.service.price : 0;
  const isPeak = selection.slot && peakTimes().includes(selection.slot);
  if (isPeak && price) price = Math.round(price * 1.15);
  priceEl.textContent = price ? `₹${price}${isPeak ? ' *' : ''}` : '';

  btn.disabled = !(selection.barber && selection.service && selection.date && selection.slot);
}

['service-select', 'barber-select', 'style-select', 'book-date'].forEach((id) => {
  document.getElementById(id).addEventListener('change', async () => {
    showAlert('booking-alert', '');
    syncSelectionFromForm();
    await loadTimeSlots();
    updateSummary();
  });
});

document.getElementById('book-time').addEventListener('change', () => {
  selection.slot = document.getElementById('book-time').value || null;
  updateSummary();
});

document.getElementById('confirmBtn').addEventListener('click', async () => {
  syncSelectionFromForm();
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true;
  btn.textContent = 'Booking...';
  showAlert('booking-alert', '');
  try {
    const appt = await api('/appointments', {
      method: 'POST',
      body: JSON.stringify({
        barberId: selection.barber.id,
        serviceId: selection.service.id,
        date: selection.date,
        slot: selection.slot,
        styleName: selection.style ? selection.style.name : null
      })
    });
    showAlert('booking-alert', 'Booking confirmed successfully! View it in your profile.', 'success');
    showConfirmation(appt);
    await loadTimeSlots();
  } catch (e) {
    showAlert('booking-alert', e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm & Pay at Shop';
    updateSummary();
  }
});

function showConfirmation(appt) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="card" style="max-width:480px;width:100%">
      <h2>Booked!</h2>
      <p style="color:var(--text-muted);margin-bottom:8px">${escapeHtml(appt.date)} at ${appt.slot}</p>
      <p style="color:var(--text-muted)">Queue position: <strong style="color:var(--accent-gold)">${appt.queueAhead}</strong></p>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-outline small" id="closeConfirm">Close</button>
        <button class="btn small" id="goBookings">View my bookings</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#closeConfirm').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#goBookings').addEventListener('click', () => {
    overlay.remove();
    navigate('bookings');
  });
}

/* ---------------- my bookings ---------------- */
async function renderBookings() {
  const wrap = document.getElementById('bookingsWrap');
  const profileInfo = document.getElementById('profileInfo');
  if (currentUser) {
    profileInfo.innerHTML = `
      <label>Full Name</label>
      <input type="text" value="${escapeHtml(currentUser.name)}" disabled>
      <label style="margin-top:12px">Email</label>
      <input type="text" value="${escapeHtml(currentUser.email || '')}" disabled>`;
  }
  try {
    const mine = await api('/appointments/mine');
    if (mine.length === 0) {
      wrap.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">No active bookings found.</p>`;
      return;
    }
    await loadCatalog();
    wrap.innerHTML = mine.map((a) => {
      const barber = catalog.barbers.find((b) => b.id === a.barberId);
      const service = catalog.services.find((s) => s.id === a.serviceId);
      const cancelBtn = a.status === 'upcoming'
        ? `<button class="btn btn-outline small" data-cancel="${a.id}" style="margin-top:8px;width:auto;padding:4px 12px;font-size:0.75rem">Cancel</button>`
        : '';
      return `
        <div class="appointment-card">
          <div class="appointment-info">
            <h4>${service ? escapeHtml(service.name) : 'Appointment'}</h4>
            <p>Barber: ${barber ? escapeHtml(barber.name) : '—'}</p>
            <p>Date: ${escapeHtml(a.date)} at ${a.slot} · ₹${a.price}</p>
          </div>
          <div style="text-align:right">
            <span class="badge ${a.status}">${a.status}</span>
            ${cancelBtn}
          </div>
        </div>`;
    }).join('');
    wrap.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/appointments/${btn.dataset.cancel}/cancel`, { method: 'POST' });
          toast('Booking cancelled');
          renderBookings();
        } catch (e) {
          toast(e.message);
        }
      });
    });
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error">${escapeHtml(e.message)}</div>`;
  }
}

/* ---------------- admin ---------------- */
let chart = null;

async function loadAdminData() {
  adminData = await api('/admin/data');
}

async function renderAdmin() {
  await loadAdminData();
  const stats = await api('/stats');

  document.getElementById('adminStats').innerHTML = `
    <div class="stat-card"><div class="num">₹${stats.totalRevenue}</div><div class="lbl">Total revenue</div></div>
    <div class="stat-card"><div class="num">${stats.totalBookings}</div><div class="lbl">Total bookings</div></div>
    <div class="stat-card"><div class="num">${stats.activeBarbers}</div><div class="lbl">Active barbers</div></div>
    <div class="stat-card"><div class="num">${adminData.customers.length}</div><div class="lbl">Customers</div></div>`;

  const labels = Object.keys(stats.byDay);
  const values = Object.values(stats.byDay);
  const ctx = document.getElementById('earningsChart');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['No data'],
      datasets: [{
        label: 'Revenue (₹)',
        data: values.length ? values : [0],
        backgroundColor: '#c5a880',
        borderRadius: 4,
        maxBarThickness: 40
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { grid: { color: '#262626' }, ticks: { color: '#a0a0a0' } },
        x: { grid: { display: false }, ticks: { color: '#a0a0a0' } }
      }
    }
  });

  document.getElementById('adminCustomers').innerHTML = adminData.customers.length
    ? adminData.customers.map((c) =>
        `<div class="appt-row"><span><b>${escapeHtml(c.name)}</b><br><span style="color:var(--text-muted)">${escapeHtml(c.email)}</span></span></div>`
      ).join('')
    : '<div class="empty">No registered customers yet</div>';

  const tbody = document.getElementById('adminBookingsTable');
  const rows = adminData.appointments.slice().reverse();
  tbody.innerHTML = rows.length
    ? rows.map((a) => {
        const barber = adminData.barbers.find((b) => b.id === a.barberId);
        const statuses = ['upcoming', 'progress', 'done', 'cancelled'];
        const opts = statuses.map((s) =>
          `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s}</option>`
        ).join('');
        return `<tr>
          <td>${escapeHtml(a.customerName || '—')}</td>
          <td>${escapeHtml(a.customerEmail || '—')}</td>
          <td>${escapeHtml(a.date)}</td>
          <td>${a.slot}</td>
          <td>${barber ? escapeHtml(barber.name) : '—'}</td>
          <td><select class="status-select" data-id="${a.id}" style="padding:6px 8px;font-size:13px;background:var(--input-bg);border:1px solid var(--border-color);color:var(--text-main);border-radius:6px">${opts}</select></td>
          <td><button class="btn small danger" data-del-appt="${a.id}">Delete</button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">No appointments yet</td></tr>`;

  tbody.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/appointments/${sel.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
        toast('Status updated');
      } catch (e) {
        toast(e.message);
        renderAdmin();
      }
    });
  });
  tbody.querySelectorAll('[data-del-appt]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this booking permanently?')) return;
      await api(`/appointments/${btn.dataset.delAppt}`, { method: 'DELETE' });
      toast('Booking deleted');
      renderAdmin();
    });
  });

  renderAdminServices();
  renderAdminBarbers();
  renderAdminHairstyles();
  renderTimeConfig();
}

function renderAdminServices() {
  document.getElementById('adminServices').innerHTML = adminData.services.map((s) => `
    <div class="manage-row">
      <div class="m-info"><b>${escapeHtml(s.name)}</b>${s.duration} min · ₹${s.price}</div>
      <button class="btn small danger" data-del-svc="${s.id}">Delete</button>
    </div>`).join('');
  document.querySelectorAll('[data-del-svc]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/services/${btn.dataset.delSvc}`, { method: 'DELETE' });
      toast('Service removed');
      renderAdmin();
    };
  });
}

document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/services', {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('svcName').value.trim(),
      duration: document.getElementById('svcDuration').value,
      price: document.getElementById('svcPrice').value
    })
  });
  e.target.reset();
  toast('Service added');
  renderAdmin();
});

function renderAdminBarbers() {
  document.getElementById('adminBarbersManage').innerHTML = adminData.barbers.map((b) => `
    <div class="manage-row">
      <div class="m-info"><b>${escapeHtml(b.name)}</b>${escapeHtml(b.spec)} · ${b.available === false ? 'Off shift' : 'Available'}</div>
      <div class="m-actions">
        <button class="btn small btn-outline" data-toggle-barber="${b.id}">${b.available === false ? 'Enable' : 'Disable'}</button>
        <button class="btn small danger" data-del-barber="${b.id}">Remove</button>
      </div>
    </div>`).join('');
  document.querySelectorAll('[data-del-barber]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/barbers/${btn.dataset.delBarber}`, { method: 'DELETE' });
      toast('Barber removed');
      renderAdmin();
    };
  });
  document.querySelectorAll('[data-toggle-barber]').forEach((btn) => {
    btn.onclick = async () => {
      const b = adminData.barbers.find((x) => x.id === Number(btn.dataset.toggleBarber));
      await api(`/barbers/${b.id}`, { method: 'PUT', body: JSON.stringify({ available: b.available === false }) });
      toast('Barber updated');
      renderAdmin();
    };
  });
}

document.getElementById('addBarberForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const colors = ['#20402B', '#B5502D', '#3d5a80', '#7a5f1f', '#5c4d8a', '#7a3b3b'];
  await api('/barbers', {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('barberName').value.trim(),
      spec: document.getElementById('barberSpec').value.trim(),
      color: colors[Math.floor(Math.random() * colors.length)]
    })
  });
  e.target.reset();
  toast('Barber added');
  renderAdmin();
});

function renderAdminHairstyles() {
  document.getElementById('adminHairstyles').innerHTML = adminData.hairstyles.map((h) => `
    <div class="manage-row">
      <div class="m-info"><b>${escapeHtml(h.name)}</b>${escapeHtml(h.tag)}</div>
      <button class="btn small danger" data-del-hs="${h.id}">Delete</button>
    </div>`).join('');
  document.querySelectorAll('[data-del-hs]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/hairstyles/${btn.dataset.delHs}`, { method: 'DELETE' });
      toast('Style removed');
      renderAdmin();
    };
  });
}

document.getElementById('addHairstyleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/hairstyles', {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('hsName').value.trim(),
      tag: document.getElementById('hsTag').value.trim()
    })
  });
  e.target.reset();
  toast('Hairstyle added');
  renderAdmin();
});

function renderTimeConfig() {
  const tc = adminData.timeConfig;
  document.getElementById('timesInput').value = (tc.times || []).join(', ');
  document.getElementById('peakTimesInput').value = (tc.peakTimes || []).join(', ');
  document.getElementById('blockBarber').innerHTML = adminData.barbers.map((b) =>
    `<option value="${b.id}">${escapeHtml(b.name)}</option>`
  ).join('');
  document.getElementById('blockedSlotsList').innerHTML = (adminData.blockedSlots || []).map((b) => {
    const barber = adminData.barbers.find((x) => x.id === b.barberId);
    return `<div class="manage-row"><div class="m-info"><b>${escapeHtml(barber ? barber.name : 'Barber')}</b>${escapeHtml(b.date)} ${b.slot}</div>
      <button class="btn small danger" data-unblock="${b.id}">Unblock</button></div>`;
  }).join('') || '<div class="empty" style="padding:12px">No blocked slots</div>';
  document.querySelectorAll('[data-unblock]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/admin/blocked-slots/${btn.dataset.unblock}`, { method: 'DELETE' });
      toast('Slot unblocked');
      renderAdmin();
    };
  });
}

document.getElementById('timeConfigForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const times = document.getElementById('timesInput').value.split(',').map((s) => s.trim()).filter(Boolean);
  const peakTimesArr = document.getElementById('peakTimesInput').value.split(',').map((s) => s.trim()).filter(Boolean);
  await api('/admin/time-config', { method: 'PUT', body: JSON.stringify({ times, peakTimes: peakTimesArr }) });
  toast('Schedule saved');
  renderAdmin();
});

document.getElementById('blockSlotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/admin/blocked-slots', {
    method: 'POST',
    body: JSON.stringify({
      barberId: document.getElementById('blockBarber').value,
      date: document.getElementById('blockDate').value.trim(),
      slot: document.getElementById('blockSlot').value.trim()
    })
  });
  e.target.reset();
  toast('Slot blocked');
  renderAdmin();
});

/* ---------------- init ---------------- */
(async function init() {
  await refreshUser();
  await renderHome();
})();
