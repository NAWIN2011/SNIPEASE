const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'snipease-dev-secret-change-in-production';

app.use(express.json());
app.use(
  session({
    name: 'snipease.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- password helpers ----------
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, user) {
  return hashPassword(password, user.salt) === user.passwordHash;
}

// ---------- JSON-file persistence ----------
function readDB() {
  const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  migrateDB(db);
  return db;
}

function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function migrateDB(db) {
  let changed = false;
  if (!db.users) {
    db.users = [];
    changed = true;
  }
  if (!db.nextUserId) {
    db.nextUserId = 1;
    changed = true;
  }
  if (!db.nextHairstyleId) {
    const maxHs = (db.hairstyles || []).reduce((m, h) => Math.max(m, h.id || 0), 0);
    db.nextHairstyleId = maxHs + 1;
    changed = true;
  }
  if (!db.timeConfig) {
    db.timeConfig = {
      times: ['10:00', '10:30', '11:00', '11:30', '12:00', '13:00', '13:30', '16:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'],
      peakTimes: ['17:00', '17:30', '18:00', '18:30']
    };
    changed = true;
  }
  if (!db.blockedSlots) {
    db.blockedSlots = [];
    changed = true;
  }
  if (!db.users.some((u) => u.role === 'admin')) {
    const salt = crypto.randomBytes(16).toString('hex');
    db.users.push({
      id: db.nextUserId++,
      role: 'admin',
      username: 'admin',
      email: null,
      name: 'Shop Owner',
      salt,
      passwordHash: hashPassword('admin123', salt)
    });
    changed = true;
  }
  if (changed) writeDB(db);
}

function findUserById(db, id) {
  return db.users.find((u) => u.id === id);
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    username: u.username
  };
}

// ---------- auth middleware ----------
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const db = readDB();
    const user = findUserById(db, req.session.userId);
    if (!user || user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.user = user;
    next();
  };
}

const requireAdmin = requireRole('admin');
const requireCustomer = requireRole('customer');

function peakPrice(service, slot, db) {
  const peakTimes = db.timeConfig.peakTimes || [];
  const isPeak = peakTimes.includes(slot);
  const price = isPeak ? Math.round(service.price * 1.15) : service.price;
  return { price, isPeak };
}

function slotTaken(db, barberId, date, slot, excludeAppointmentId) {
  if (db.blockedSlots.some((b) => b.barberId === barberId && b.date === date && b.slot === slot)) {
    return true;
  }
  return db.appointments.some(
    (a) =>
      a.barberId === barberId &&
      a.date === date &&
      a.slot === slot &&
      a.status !== 'cancelled' &&
      a.id !== excludeAppointmentId
  );
}

// ---------- auth routes ----------
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const db = readDB();
  if (db.users.some((u) => u.email && u.email === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: db.nextUserId++,
    role: 'customer',
    name: String(name).trim(),
    email: normalizedEmail,
    username: null,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDB(db);
  req.session.userId = user.id;
  req.session.role = user.role;
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const db = readDB();
  const user = db.users.find((u) => u.role === 'customer' && u.email === normalizedEmail);
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const db = readDB();
  const user = db.users.find((u) => u.role === 'admin' && u.username === String(username).trim());
  if (!user || !verifyPassword(password, user)) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const db = readDB();
  const user = findUserById(db, req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ user: null });
  }
  res.json({ user: publicUser(user) });
});

// ---------- public catalog ----------
app.get('/api/catalog', (req, res) => {
  const db = readDB();
  res.json({
    services: db.services,
    barbers: db.barbers.filter((b) => b.available !== false),
    hairstyles: db.hairstyles,
    timeConfig: db.timeConfig
  });
});

app.get('/api/availability', (req, res) => {
  const barberId = Number(req.query.barberId);
  const date = req.query.date;
  if (!barberId || !date) {
    return res.status(400).json({ error: 'barberId and date are required' });
  }
  const db = readDB();
  const times = db.timeConfig.times || [];
  const slots = times.map((slot) => ({
    slot,
    available: !slotTaken(db, barberId, date, slot),
    peak: (db.timeConfig.peakTimes || []).includes(slot)
  }));
  res.json({ slots });
});

// ---------- customer appointments ----------
app.get('/api/appointments/mine', requireCustomer, (req, res) => {
  const db = readDB();
  const mine = db.appointments
    .filter((a) => a.customerId === req.user.id)
    .sort((a, b) => `${a.date}${a.slot}`.localeCompare(`${b.date}${b.slot}`));
  res.json(mine);
});

app.post('/api/appointments', requireCustomer, (req, res) => {
  const db = readDB();
  const { barberId, serviceId, date, slot, styleName } = req.body;
  if (!barberId || !serviceId || !date || !slot) {
    return res.status(400).json({ error: 'barberId, serviceId, date, and slot are required' });
  }
  const service = db.services.find((s) => s.id === Number(serviceId));
  const barber = db.barbers.find((b) => b.id === Number(barberId));
  if (!service) return res.status(400).json({ error: 'invalid service' });
  if (!barber || barber.available === false) return res.status(400).json({ error: 'invalid barber' });
  if (!db.timeConfig.times.includes(slot)) {
    return res.status(400).json({ error: 'invalid time slot' });
  }
  if (slotTaken(db, Number(barberId), date, slot)) {
    return res.status(409).json({ error: 'This slot is no longer available' });
  }

  const { price, isPeak } = peakPrice(service, slot, db);
  const queueAhead = db.appointments.filter(
    (a) =>
      a.barberId === Number(barberId) &&
      a.date === date &&
      (a.status === 'upcoming' || a.status === 'progress')
  ).length;

  const appt = {
    id: db.nextAppointmentId++,
    customerId: req.user.id,
    customerName: req.user.name,
    customerEmail: req.user.email,
    barberId: Number(barberId),
    serviceId: Number(serviceId),
    styleName: styleName || null,
    date,
    slot,
    price,
    status: 'upcoming',
    points: 15,
    isPeak,
    queueAhead,
    createdAt: new Date().toISOString()
  };
  db.appointments.push(appt);
  writeDB(db);
  res.status(201).json(appt);
});

app.post('/api/appointments/:id/cancel', requireCustomer, (req, res) => {
  const db = readDB();
  const appt = db.appointments.find((a) => a.id === Number(req.params.id));
  if (!appt) return res.status(404).json({ error: 'not found' });
  if (appt.customerId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (appt.status !== 'upcoming') {
    return res.status(400).json({ error: 'Only upcoming bookings can be cancelled' });
  }
  appt.status = 'cancelled';
  appt.cancelledAt = new Date().toISOString();
  writeDB(db);
  res.json(appt);
});

// ---------- admin: full data & stats ----------
app.get('/api/admin/data', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({
    services: db.services,
    barbers: db.barbers,
    hairstyles: db.hairstyles,
    appointments: db.appointments,
    timeConfig: db.timeConfig,
    blockedSlots: db.blockedSlots,
    customers: db.users.filter((u) => u.role === 'customer').map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt
    }))
  });
});

app.get('/api/stats', requireAdmin, (req, res) => {
  const db = readDB();
  const active = db.appointments.filter((a) => a.status !== 'cancelled');
  const revenue = active.reduce((sum, a) => sum + (a.price || 0), 0);
  const byDay = {};
  active.forEach((a) => {
    byDay[a.date] = (byDay[a.date] || 0) + (a.price || 0);
  });
  res.json({
    totalRevenue: revenue,
    totalBookings: active.length,
    activeBarbers: db.barbers.filter((b) => b.available !== false).length,
    byDay
  });
});

// ---------- services (admin CRUD) ----------
app.post('/api/services', requireAdmin, (req, res) => {
  const db = readDB();
  const { name, duration, price } = req.body;
  if (!name || duration == null || price == null) {
    return res.status(400).json({ error: 'name, duration, price required' });
  }
  const service = {
    id: db.nextServiceId++,
    name: String(name).trim(),
    duration: Number(duration),
    price: Number(price)
  };
  db.services.push(service);
  writeDB(db);
  res.status(201).json(service);
});

app.put('/api/services/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const svc = db.services.find((s) => s.id === Number(req.params.id));
  if (!svc) return res.status(404).json({ error: 'not found' });
  if (req.body.name != null) svc.name = String(req.body.name).trim();
  if (req.body.duration != null) svc.duration = Number(req.body.duration);
  if (req.body.price != null) svc.price = Number(req.body.price);
  writeDB(db);
  res.json(svc);
});

app.delete('/api/services/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.services = db.services.filter((s) => s.id !== Number(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

// ---------- barbers (admin CRUD) ----------
app.post('/api/barbers', requireAdmin, (req, res) => {
  const db = readDB();
  const { name, spec, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const barber = {
    id: db.nextBarberId++,
    name: String(name).trim(),
    spec: spec || 'General stylist',
    rating: 5.0,
    color: color || '#20402B',
    available: true
  };
  db.barbers.push(barber);
  writeDB(db);
  res.status(201).json(barber);
});

app.put('/api/barbers/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const b = db.barbers.find((x) => x.id === Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'not found' });
  if (req.body.name != null) b.name = String(req.body.name).trim();
  if (req.body.spec != null) b.spec = req.body.spec;
  if (req.body.color != null) b.color = req.body.color;
  if (req.body.available != null) b.available = !!req.body.available;
  if (req.body.rating != null) b.rating = Number(req.body.rating);
  writeDB(db);
  res.json(b);
});

app.delete('/api/barbers/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.barbers = db.barbers.filter((b) => b.id !== Number(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

// ---------- hairstyles (admin CRUD) ----------
app.post('/api/hairstyles', requireAdmin, (req, res) => {
  const db = readDB();
  const { name, tag, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const style = {
    id: db.nextHairstyleId++,
    name: String(name).trim(),
    tag: tag || 'Any face',
    color: color || '#20402B'
  };
  db.hairstyles.push(style);
  writeDB(db);
  res.status(201).json(style);
});

app.put('/api/hairstyles/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const h = db.hairstyles.find((x) => x.id === Number(req.params.id));
  if (!h) return res.status(404).json({ error: 'not found' });
  if (req.body.name != null) h.name = String(req.body.name).trim();
  if (req.body.tag != null) h.tag = req.body.tag;
  if (req.body.color != null) h.color = req.body.color;
  writeDB(db);
  res.json(h);
});

app.delete('/api/hairstyles/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.hairstyles = db.hairstyles.filter((h) => h.id !== Number(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

// ---------- time slots (admin) ----------
app.put('/api/admin/time-config', requireAdmin, (req, res) => {
  const db = readDB();
  const { times, peakTimes } = req.body;
  if (times && Array.isArray(times)) {
    db.timeConfig.times = times.map(String).filter(Boolean);
  }
  if (peakTimes && Array.isArray(peakTimes)) {
    db.timeConfig.peakTimes = peakTimes.map(String).filter(Boolean);
  }
  writeDB(db);
  res.json(db.timeConfig);
});

app.post('/api/admin/blocked-slots', requireAdmin, (req, res) => {
  const db = readDB();
  const { barberId, date, slot } = req.body;
  if (!barberId || !date || !slot) {
    return res.status(400).json({ error: 'barberId, date, slot required' });
  }
  const entry = { id: Date.now(), barberId: Number(barberId), date, slot };
  db.blockedSlots.push(entry);
  writeDB(db);
  res.status(201).json(entry);
});

app.delete('/api/admin/blocked-slots/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.blockedSlots = db.blockedSlots.filter((b) => b.id !== Number(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

// ---------- appointments (admin) ----------
app.patch('/api/appointments/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const appt = db.appointments.find((a) => a.id === Number(req.params.id));
  if (!appt) return res.status(404).json({ error: 'not found' });
  if (req.body.status != null) {
    const allowed = ['upcoming', 'progress', 'done', 'cancelled'];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ error: 'invalid status' });
    }
    appt.status = req.body.status;
  }
  writeDB(db);
  res.json(appt);
});

app.delete('/api/appointments/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.appointments = db.appointments.filter((a) => a.id !== Number(req.params.id));
  writeDB(db);
  res.json({ ok: true });
});

// Legacy unprotected route — deny
app.get('/api/data', (req, res) => {
  res.status(403).json({ error: 'Use /api/catalog or authenticate for admin data' });
});

app.listen(PORT, () => {
  readDB();
  console.log(`SnipEase server running at http://localhost:${PORT}`);
  console.log('Default admin login: username admin / password admin123');
});
