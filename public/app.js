/* The Allen's — single-page app. Vanilla JS, no dependencies.
   All user text is inserted via textContent (never innerHTML), so
   user data can never become markup. */
'use strict';

/* ---------- tiny DOM helpers ---------- */
const view = document.getElementById('view');
const nav = document.getElementById('bottomnav');
const toastEl = document.getElementById('toast');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

let toastTimer = null;
function toast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', !!isError);
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
}

/* ---------- dates (client local time) ---------- */
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function localToday() { return fmtDate(new Date()); }
function parseDate(s) { // YYYY-MM-DD -> local Date (noon avoids DST edge cases)
  const p = s.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12);
}
function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function sundayStart(dateStr) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() - d.getDay());
  return fmtDate(d);
}
function dayDiff(a, b) { // b - a in whole days
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function prettyDate(dateStr) {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  return WEEKDAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
}
function shortDate(dateStr) {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  return MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate();
}

/* ---------- API ---------- */
let authState = null;   // {members, signedIn}
let data = null;        // overview payload
let currentTab = 'home';
let taskFilter = 'All';
let mealWeekStart = sundayStart(localToday());
let editingMealId = null;
let bearEditing = false;

async function api(path, opts) {
  const res = await fetch(path, Object.assign({
    headers: { 'Content-Type': 'application/json' },
  }, opts || {}));
  if (res.status === 401) {
    authState = null;
    data = null;
    showAuth();
    throw new Error('Please sign in to continue.');
  }
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) throw new Error((body && body.error) || ('Request failed (' + res.status + ')'));
  return body;
}

async function refresh() {
  data = await api('/api/overview');
  render();
}

/* ---------- due-date badges ---------- */
function dueBadge(dateStr, label) {
  const today = localToday();
  const diff = dayDiff(today, dateStr);
  const b = el('span', 'badge');
  if (diff < 0) { b.classList.add('badge-overdue'); b.textContent = (label || 'Overdue') + ' ' + Math.abs(diff) + 'd ago'; }
  else if (diff === 0) { b.classList.add('badge-soon'); b.textContent = label ? label + ' today' : 'Due today'; }
  else if (diff <= 3) { b.classList.add('badge-soon'); b.textContent = (label || 'Due') + ' in ' + diff + 'd'; }
  else { b.classList.add('badge-ok'); b.textContent = (label || 'Due') + ' ' + shortDate(dateStr); }
  return b;
}

/* ---------- shared form builders ---------- */
function labeledInput(labelText, input) {
  const wrap = document.createElement('div');
  const lab = el('label', null, labelText);
  wrap.appendChild(lab);
  wrap.appendChild(input);
  return wrap;
}
function textInput(name, opts) {
  const i = document.createElement('input');
  i.type = (opts && opts.type) || 'text';
  i.name = name;
  if (opts && opts.required) i.required = true;
  if (opts && opts.maxLength) i.maxLength = opts.maxLength;
  if (opts && opts.placeholder) i.placeholder = opts.placeholder;
  if (opts && opts.value !== undefined) i.value = opts.value;
  if (opts && opts.minLength) i.minLength = opts.minLength;
  if (opts && opts.autocomplete) i.autocomplete = opts.autocomplete;
  return i;
}
function selectInput(name, options, selected) {
  const s = document.createElement('select');
  s.name = name;
  options.forEach(function (o) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    if (o === selected) opt.selected = true;
    s.appendChild(opt);
  });
  return s;
}
function submitBtn(label, cls) {
  const b = document.createElement('button');
  b.type = 'submit';
  b.className = 'btn-block' + (cls ? ' ' + cls : '');
  b.textContent = label;
  return b;
}
function deleteBtn(label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn';
  b.textContent = label || '✕';
  b.setAttribute('aria-label', 'Delete');
  return b;
}
function errorPara() {
  const p = el('p', 'error-text');
  p.hidden = true;
  return p;
}
function showFormError(p, err) {
  p.textContent = err.message || String(err);
  p.hidden = false;
}
function emptyState(msg) { return el('p', 'muted', msg); }

/* ---------- auth screens ---------- */
function showAuth() {
  nav.hidden = true;
  clear(view);
  if (!authState) {
    // State unknown (e.g. after a 401): re-fetch it.
    api('/api/auth/state').then(function (s) { authState = s; showAuth(); })
      .catch(function (e) { view.appendChild(el('p', 'error-text', e.message)); });
    view.appendChild(el('p', 'muted center', 'Loading…'));
    return;
  }
  const anyLogin = authState.members.some(function (m) { return m.hasLogin; });
  if (!anyLogin) renderSetup(); else renderSignin();
}

function memberSelect(name, members) {
  const s = document.createElement('select');
  s.name = name;
  members.forEach(function (m) {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
    s.appendChild(opt);
  });
  return s;
}

function renderSetup() {
  const card = el('div', 'card auth-card');
  card.appendChild(el('h2', null, 'Create your login'));
  card.appendChild(el('p', 'muted center', 'Welcome to The Allen\u2019s! Set up the first login. The other member can be added later from the Account tab.'));
  const err = errorPara();
  const form = document.createElement('form');
  form.appendChild(labeledInput('Who is this login for?', memberSelect('name', authState.members)));
  form.appendChild(labeledInput('Password (at least 6 characters)', textInput('password', { type: 'password', required: true, minLength: 6, autocomplete: 'new-password' })));
  form.appendChild(err);
  form.appendChild(submitBtn('Create login'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      const r = await api('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.value, password: form.password.value }),
      });
      authState.signedIn = r.user.name;
      toast('Welcome, ' + r.user.name + '!');
      await loadApp();
    } catch (e2) { showFormError(err, e2); }
  });
  card.appendChild(form);
  view.appendChild(card);
}

function renderSignin() {
  const card = el('div', 'card auth-card');
  card.appendChild(el('h2', null, 'Sign in'));
  card.appendChild(el('p', 'muted center', 'Welcome back to The Allen\u2019s.'));
  const err = errorPara();
  const form = document.createElement('form');
  const withLogin = authState.members.filter(function (m) { return m.hasLogin; });
  form.appendChild(labeledInput('Who is signing in?', memberSelect('name', withLogin)));
  form.appendChild(labeledInput('Password', textInput('password', { type: 'password', required: true, autocomplete: 'current-password' })));
  form.appendChild(err);
  form.appendChild(submitBtn('Sign in'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      const r = await api('/api/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.value, password: form.password.value }),
      });
      authState.signedIn = r.user.name;
      toast('Welcome back, ' + r.user.name + '!');
      await loadApp();
    } catch (e2) { showFormError(err, e2); }
  });
  card.appendChild(form);
  view.appendChild(card);
}

async function loadApp() {
  try {
    data = await api('/api/overview');
    nav.hidden = false;
    currentTab = 'home';
    render();
  } catch (e) {
    if (e.message !== 'Please sign in to continue.') toast(e.message, true);
  }
}

/* ---------- tab switching ---------- */
nav.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  currentTab = btn.dataset.tab;
  render();
});

function render() {
  if (!data) { showAuth(); return; }
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === currentTab);
  });
  clear(view);
  if (currentTab === 'home') renderHome();
  else if (currentTab === 'calendar') renderCalendar();
  else if (currentTab === 'tasks') renderTasks();
  else if (currentTab === 'refills') renderRefills();
  else if (currentTab === 'meals') renderMeals();
  else if (currentTab === 'bear') renderBear();
  else if (currentTab === 'account') renderAccount();
}

function sectionTitle(text) { return el('h2', 'section-title', text); }

/* ---------- Home ---------- */
function renderHome() {
  const today = localToday();
  view.appendChild(sectionTitle('Today — ' + prettyDate(today)));

  // Today's events
  const evCard = el('div', 'card');
  evCard.appendChild(el('h3', null, '📅 Today\u2019s events'));
  const todaysEvents = data.events.filter(function (e) { return e.date === today; });
  if (!todaysEvents.length) evCard.appendChild(emptyState('No events today.'));
  else {
    const ul = el('ul', 'list');
    todaysEvents.forEach(function (e) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', e.title));
      const meta = [];
      if (e.time) meta.push(e.time);
      if (e.location) meta.push(e.location);
      if (e.who) meta.push(e.who);
      g.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(g);
      ul.appendChild(li);
    });
    evCard.appendChild(ul);
  }
  view.appendChild(evCard);

  // Tasks due today / overdue
  const taskCard = el('div', 'card');
  taskCard.appendChild(el('h3', null, '✅ Due today or overdue'));
  const dueTasks = data.tasks.filter(function (t) {
    return !t.done && t.dueDate && dayDiff(today, t.dueDate) <= 0;
  });
  if (!dueTasks.length) taskCard.appendChild(emptyState('Nothing due today. Nice work!'));
  else {
    const ul = el('ul', 'list');
    dueTasks.forEach(function (t) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', t.title));
      g.appendChild(el('div', 'muted small', (t.assignee || 'Either') + ' · ' + prettyDate(t.dueDate)));
      li.appendChild(g);
      li.appendChild(dueBadge(t.dueDate));
      ul.appendChild(li);
    });
    taskCard.appendChild(ul);
  }
  view.appendChild(taskCard);

  // Refills due soon (overdue or within 7 days)
  const refCard = el('div', 'card');
  refCard.appendChild(el('h3', null, '💊 Refills due soon'));
  const dueRefills = data.refills.filter(function (r) { return dayDiff(today, r.nextDue) <= 7; });
  if (!dueRefills.length) refCard.appendChild(emptyState('No refills due in the next week.'));
  else {
    const ul = el('ul', 'list');
    dueRefills.forEach(function (r) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', r.medication));
      g.appendChild(el('div', 'muted small', r.person + (r.dosage ? ' · ' + r.dosage : '')));
      li.appendChild(g);
      li.appendChild(dueBadge(r.nextDue));
      ul.appendChild(li);
    });
    refCard.appendChild(ul);
  }
  view.appendChild(refCard);

  // Meals this week
  const weekStart = sundayStart(today);
  const weekEnd = addDays(weekStart, 6);
  const mealCard = el('div', 'card');
  mealCard.appendChild(el('h3', null, '🍽️ Meals this week'));
  const weekMeals = data.meals.filter(function (m) { return m.date >= weekStart && m.date <= weekEnd; });
  if (!weekMeals.length) mealCard.appendChild(emptyState('No meals planned this week yet.'));
  else {
    const ul = el('ul', 'list');
    weekMeals.forEach(function (m) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', m.title));
      g.appendChild(el('div', 'muted small', WEEKDAYS[parseDate(m.date).getDay()] + ' · ' + m.mealType));
      li.appendChild(g);
      ul.appendChild(li);
    });
    mealCard.appendChild(ul);
  }
  view.appendChild(mealCard);

  // Bear's care today + next care date
  const bearCard = el('div', 'card');
  bearCard.appendChild(el('h3', null, '🐾 Bear\u2019s care'));
  const doneToday = new Set(data.bearLogs.filter(function (l) { return l.date === today; }).map(function (l) { return l.title; }));
  const pending = data.bearRoutines.filter(function (r) { return !doneToday.has(r.title); });
  const doneCount = data.bearRoutines.length - pending.length;
  bearCard.appendChild(el('p', null, doneCount + ' of ' + data.bearRoutines.length + ' daily routines done today.'));
  if (pending.length) {
    const ul = el('ul', 'list');
    pending.slice(0, 5).forEach(function (r) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', r.title));
      g.appendChild(el('div', 'muted small', r.category + (r.timeLabel ? ' · ' + r.timeLabel : '')));
      li.appendChild(g);
      ul.appendChild(li);
    });
    bearCard.appendChild(ul);
  }
  const upcoming = data.bearReminders.filter(function (r) { return !r.done && r.date >= today; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (upcoming.length) {
    const p = el('p', null, 'Next care date: ');
    const b = el('strong', null, upcoming[0].title + ' — ' + prettyDate(upcoming[0].date));
    p.appendChild(b);
    bearCard.appendChild(p);
  } else {
    bearCard.appendChild(el('p', 'muted', 'No upcoming care dates.'));
  }
  const goBear = submitBtn('Open Bear\u2019s care', 'btn-secondary');
  goBear.type = 'button';
  goBear.addEventListener('click', function () { currentTab = 'bear'; render(); });
  bearCard.appendChild(goBear);
  view.appendChild(bearCard);

  // Grocery count
  const left = data.groceries.filter(function (g) { return !g.done; }).length;
  const grocCard = el('div', 'card');
  grocCard.appendChild(el('h3', null, '🛒 Grocery list'));
  grocCard.appendChild(el('p', null, left + (left === 1 ? ' item' : ' items') + ' left to buy.'));
  const goMeals = submitBtn('Open Meals & groceries', 'btn-secondary');
  goMeals.type = 'button';
  goMeals.addEventListener('click', function () { currentTab = 'meals'; render(); });
  grocCard.appendChild(goMeals);
  view.appendChild(grocCard);

  // Quick-add task
  const qaCard = el('div', 'card');
  qaCard.appendChild(el('h3', null, '➕ Quick add a task'));
  const err = errorPara();
  const form = document.createElement('form');
  form.className = 'inline-form';
  const row = el('div', 'form-row');
  const titleIn = textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Pick up the dry cleaning' });
  row.appendChild(titleIn);
  const who = selectInput('assignee', ['Either', 'Michelle', 'Chad'], 'Either');
  who.style.flex = '0 0 110px';
  row.appendChild(who);
  form.appendChild(row);
  form.appendChild(err);
  form.appendChild(submitBtn('Add task'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title: titleIn.value.trim(), assignee: who.value }) });
      toast('Task added.');
      await refresh();
    } catch (e2) { showFormError(err, e2); }
  });
  qaCard.appendChild(form);
  view.appendChild(qaCard);
}

/* ---------- Calendar ---------- */
function renderCalendar() {
  view.appendChild(sectionTitle('Calendar'));
  const today = localToday();
  const byDate = {};
  data.events.forEach(function (e) {
    (byDate[e.date] = byDate[e.date] || []).push(e);
  });
  const dates = Object.keys(byDate).sort();
  if (!dates.length) view.appendChild(el('p', 'muted', 'No events yet. Add one below.'));
  dates.forEach(function (d) {
    const head = el('div', 'day-head');
    head.appendChild(el('h3', null, prettyDate(d)));
    if (d === today) head.appendChild(el('span', 'today-label', 'Today'));
    view.appendChild(head);
    const card = el('div', 'card');
    const ul = el('ul', 'list');
    byDate[d].forEach(function (e) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', e.title));
      const meta = [];
      if (e.time) meta.push(e.time);
      if (e.location) meta.push(e.location);
      if (e.who) meta.push(e.who);
      if (meta.length) g.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(g);
      const del = deleteBtn();
      del.addEventListener('click', async function () {
        try { await api('/api/events/' + e.id, { method: 'DELETE' }); toast('Event deleted.'); await refresh(); }
        catch (e2) { toast(e2.message, true); }
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    card.appendChild(ul);
    view.appendChild(card);
  });

  // Add event form
  const card = el('div', 'card');
  card.appendChild(el('h3', null, 'Add an event'));
  const err = errorPara();
  const form = document.createElement('form');
  form.appendChild(labeledInput('Title', textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Family dinner' })));
  const row1 = el('div', 'form-row');
  row1.appendChild(labeledInput('Date', textInput('date', { type: 'date', required: true, value: today })));
  row1.appendChild(labeledInput('Time', textInput('time', { type: 'time' })));
  form.appendChild(row1);
  form.appendChild(labeledInput('Location', textInput('location', { maxLength: 200, placeholder: 'Optional' })));
  form.appendChild(labeledInput('Who', selectInput('who', ['Family', 'Michelle', 'Chad', 'Both'], 'Family')));
  form.appendChild(err);
  form.appendChild(submitBtn('Add event'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      await api('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.value.trim(),
          date: form.date.value,
          time: form.time.value,
          location: form.location.value.trim(),
          who: form.who.value,
        }),
      });
      toast('Event added.');
      await refresh();
    } catch (e2) { showFormError(err, e2); }
  });
  card.appendChild(form);
  view.appendChild(card);
}

/* ---------- Tasks ---------- */
function renderTasks() {
  view.appendChild(sectionTitle('Tasks'));

  const filterRow = el('div', 'form-row');
  filterRow.appendChild(labeledInput('Show', selectInput('filter', ['All', 'Michelle', 'Chad', 'Either', 'Done'], taskFilter)));
  filterRow.firstChild.querySelector('select').addEventListener('change', function (e) {
    taskFilter = e.target.value;
    render();
  });
  view.appendChild(filterRow);

  const card = el('div', 'card');
  let list = data.tasks.slice();
  if (taskFilter === 'Done') list = list.filter(function (t) { return t.done; });
  else if (taskFilter !== 'All') list = list.filter(function (t) { return !t.done && t.assignee === taskFilter; });
  else list = list.filter(function (t) { return !t.done; });
  // Keep done items visible under "Done" filter; otherwise show open tasks first.
  if (!list.length) card.appendChild(emptyState(taskFilter === 'Done' ? 'No completed tasks yet.' : 'No tasks here. Add one below.'));
  else {
    const ul = el('ul', 'list');
    list.forEach(function (t) {
      const li = el('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!t.done;
      cb.setAttribute('aria-label', 'Mark done');
      cb.addEventListener('change', async function () {
        try {
          await api('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify({ done: cb.checked ? 1 : 0 }) });
          await refresh();
        } catch (e2) { toast(e2.message, true); cb.checked = !cb.checked; }
      });
      li.appendChild(cb);
      const g = el('div', 'grow');
      g.appendChild(el('div', t.done ? 'title done-text' : 'title', t.title));
      const meta = [t.assignee || 'Either', t.category || 'Household'];
      if (t.dueDate) meta.push(prettyDate(t.dueDate));
      g.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(g);
      if (t.dueDate && !t.done) li.appendChild(dueBadge(t.dueDate));
      const del = deleteBtn();
      del.addEventListener('click', async function () {
        try { await api('/api/tasks/' + t.id, { method: 'DELETE' }); toast('Task deleted.'); await refresh(); }
        catch (e2) { toast(e2.message, true); }
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    card.appendChild(ul);
  }
  view.appendChild(card);

  // Add task form
  const addCard = el('div', 'card');
  addCard.appendChild(el('h3', null, 'Add a task'));
  const err = errorPara();
  const form = document.createElement('form');
  form.appendChild(labeledInput('Title', textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Water the plants' })));
  const row1 = el('div', 'form-row');
  row1.appendChild(labeledInput('Assign to', selectInput('assignee', ['Either', 'Michelle', 'Chad'], 'Either')));
  row1.appendChild(labeledInput('Category', selectInput('category', ['Household', 'Shopping', 'Bear\u2019s care', 'Health', 'Faith & service', 'Other'], 'Household')));
  form.appendChild(row1);
  form.appendChild(labeledInput('Due date', textInput('dueDate', { type: 'date' })));
  form.appendChild(err);
  form.appendChild(submitBtn('Add task'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.value.trim(),
          assignee: form.assignee.value,
          category: form.category.value,
          dueDate: form.dueDate.value || undefined,
        }),
      });
      toast('Task added.');
      await refresh();
    } catch (e2) { showFormError(err, e2); }
  });
  addCard.appendChild(form);
  view.appendChild(addCard);
}

/* ---------- Refills ---------- */
function renderRefills() {
  view.appendChild(sectionTitle('Refills'));
  const card = el('div', 'card');
  if (!data.refills.length) card.appendChild(emptyState('No refills tracked yet. Add one below.'));
  else {
    const ul = el('ul', 'list');
    data.refills.forEach(function (r) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', r.medication));
      const meta = [r.person];
      if (r.dosage) meta.push(r.dosage);
      if (r.pharmacy) meta.push(r.pharmacy);
      meta.push('Every ' + r.intervalDays + ' days');
      if (r.notes) meta.push(r.notes);
      g.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(g);
      li.appendChild(dueBadge(r.nextDue));
      ul.appendChild(li);
      const actions = el('div', 'form-row');
      actions.style.margin = '0 0 10px';
      const doneBtn = submitBtn('Mark refilled', 'btn-honey btn-small');
      doneBtn.type = 'button';
      doneBtn.addEventListener('click', async function () {
        try {
          const res = await api('/api/refills/' + r.id + '/refilled', { method: 'POST' });
          toast('Marked refilled. Next due ' + prettyDate(res.nextDue) + '.');
          await refresh();
        } catch (e2) { toast(e2.message, true); }
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-danger btn-small';
      del.textContent = 'Delete';
      del.addEventListener('click', async function () {
        try { await api('/api/refills/' + r.id, { method: 'DELETE' }); toast('Refill deleted.'); await refresh(); }
        catch (e2) { toast(e2.message, true); }
      });
      actions.appendChild(doneBtn);
      actions.appendChild(del);
      // Attach action row as its own block after the list item.
      ul.appendChild(el('li')).appendChild(actions);
    });
    card.appendChild(ul);
  }
  view.appendChild(card);

  const addCard = el('div', 'card');
  addCard.appendChild(el('h3', null, 'Add a refill'));
  const err = errorPara();
  const form = document.createElement('form');
  form.appendChild(labeledInput('Medication', textInput('medication', { required: true, maxLength: 200, placeholder: 'e.g. Sample: Allergy tablets' })));
  const row1 = el('div', 'form-row');
  row1.appendChild(labeledInput('Next due', textInput('nextDue', { type: 'date', required: true, value: localToday() })));
  row1.appendChild(labeledInput('Every (days)', textInput('intervalDays', { type: 'number', value: '30' })));
  form.appendChild(row1);
  const row2 = el('div', 'form-row');
  row2.appendChild(labeledInput('Person', selectInput('person', ['Michelle', 'Chad'], 'Michelle')));
  row2.appendChild(labeledInput('Dosage', textInput('dosage', { placeholder: 'e.g. 1 tablet daily' })));
  form.appendChild(row2);
  form.appendChild(labeledInput('Pharmacy', textInput('pharmacy', { placeholder: 'Optional' })));
  form.appendChild(labeledInput('Notes', textInput('notes', { placeholder: 'Optional' })));
  form.appendChild(err);
  form.appendChild(submitBtn('Add refill'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      await api('/api/refills', {
        method: 'POST',
        body: JSON.stringify({
          medication: form.medication.value.trim(),
          nextDue: form.nextDue.value,
          intervalDays: Number(form.intervalDays.value) || 30,
          person: form.person.value,
          pharmacy: form.pharmacy.value.trim(),
          dosage: form.dosage.value.trim(),
          notes: form.notes.value.trim(),
        }),
      });
      toast('Refill added.');
      await refresh();
    } catch (e2) { showFormError(err, e2); }
  });
  addCard.appendChild(form);
  view.appendChild(addCard);
}

/* ---------- Meals & groceries ---------- */
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const MEAL_ORDER = { Breakfast: 0, Lunch: 1, Dinner: 2, Snack: 3 };
const GROCERY_CATEGORIES = ['Produce', 'Meat & dairy', 'Pantry', 'Frozen', 'Bakery', 'Household', 'Other'];

function renderMeals() {
  view.appendChild(sectionTitle('Meals'));
  const weekEnd = addDays(mealWeekStart, 6);

  // Week browser
  const navRow = el('div', 'week-nav');
  const prev = document.createElement('button');
  prev.type = 'button'; prev.className = 'btn-secondary btn-small'; prev.textContent = '← Prev';
  prev.addEventListener('click', function () { mealWeekStart = addDays(mealWeekStart, -7); render(); });
  const next = document.createElement('button');
  next.type = 'button'; next.className = 'btn-secondary btn-small'; next.textContent = 'Next →';
  next.addEventListener('click', function () { mealWeekStart = addDays(mealWeekStart, 7); render(); });
  const label = el('span', 'week-label', 'Week of ' + shortDate(mealWeekStart) + ' – ' + shortDate(weekEnd));
  navRow.appendChild(prev); navRow.appendChild(label); navRow.appendChild(next);
  view.appendChild(navRow);
  const thisWeekBtn = document.createElement('button');
  thisWeekBtn.type = 'button'; thisWeekBtn.className = 'btn-secondary btn-small btn-block';
  thisWeekBtn.textContent = 'Jump to this week';
  thisWeekBtn.style.marginBottom = '12px';
  thisWeekBtn.addEventListener('click', function () { mealWeekStart = sundayStart(localToday()); render(); });
  view.appendChild(thisWeekBtn);

  const today = localToday();
  for (let i = 0; i < 7; i++) {
    const dateStr = addDays(mealWeekStart, i);
    const head = el('div', 'day-head');
    head.appendChild(el('h3', null, WEEKDAYS[parseDate(dateStr).getDay()]));
    head.appendChild(el('span', 'date-label', shortDate(dateStr)));
    if (dateStr === today) head.appendChild(el('span', 'today-label', 'Today'));
    view.appendChild(head);

    const card = el('div', 'card');
    const dayMeals = data.meals
      .filter(function (m) { return m.date === dateStr; })
      .sort(function (a, b) { return (MEAL_ORDER[a.mealType] || 3) - (MEAL_ORDER[b.mealType] || 3); });

    if (editingMealId) {
      const m = dayMeals.find(function (x) { return x.id === editingMealId; });
      if (m) card.appendChild(mealEditForm(m));
    }

    if (!dayMeals.length) card.appendChild(emptyState('No meals planned.'));
    else {
      const ul = el('ul', 'list');
      dayMeals.forEach(function (m) {
        if (m.id === editingMealId) return;
        const li = el('li');
        const g = el('div', 'grow');
        g.appendChild(el('div', 'title', m.title));
        g.appendChild(el('div', 'muted small', m.mealType + (m.notes ? ' · ' + m.notes : '')));
        li.appendChild(g);
        const editBtn = document.createElement('button');
        editBtn.type = 'button'; editBtn.className = 'btn-secondary btn-small'; editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function () { editingMealId = m.id; render(); });
        li.appendChild(editBtn);
        const del = deleteBtn();
        del.addEventListener('click', async function () {
          try { await api('/api/meals/' + m.id, { method: 'DELETE' }); toast('Meal deleted.'); await refresh(); }
          catch (e2) { toast(e2.message, true); }
        });
        li.appendChild(del);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    card.appendChild(mealAddForm(dateStr));
    view.appendChild(card);
  }

  renderGroceries();
}

function mealAddForm(dateStr) {
  const err = errorPara();
  const form = document.createElement('form');
  form.className = 'inline-form';
  form.appendChild(labeledInput('Add a meal', textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Sample: Spaghetti night' })));
  const row = el('div', 'form-row');
  row.appendChild(labeledInput('Meal', selectInput('mealType', MEAL_TYPES, 'Dinner')));
  row.appendChild(labeledInput('Notes', textInput('notes', { placeholder: 'Optional' })));
  form.appendChild(row);
  const ing = document.createElement('textarea');
  ing.name = 'ingredients';
  ing.placeholder = 'Ingredients (one per line) — each line is added to the grocery list';
  form.appendChild(labeledInput('Ingredients', ing));
  form.appendChild(err);
  form.appendChild(submitBtn('Add meal', 'btn-small'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      await api('/api/meals', {
        method: 'POST',
        body: JSON.stringify({
          date: dateStr,
          title: form.title.value.trim(),
          mealType: form.mealType.value,
          notes: form.notes.value.trim(),
        }),
      });
      const lines = form.ingredients.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      for (const line of lines) {
        await api('/api/groceries', { method: 'POST', body: JSON.stringify({ title: line }) });
      }
      toast(lines.length ? 'Meal added, ' + lines.length + ' ingredient(s) added to the grocery list.' : 'Meal added.');
      await refresh();
    } catch (e2) { showFormError(err, e2); }
  });
  return form;
}

function mealEditForm(m) {
  const err = errorPara();
  const form = document.createElement('form');
  form.className = 'inline-form';
  form.appendChild(labeledInput('Edit meal', textInput('title', { required: true, maxLength: 200, value: m.title })));
  const row = el('div', 'form-row');
  row.appendChild(labeledInput('Date', textInput('date', { type: 'date', required: true, value: m.date })));
  row.appendChild(labeledInput('Meal', selectInput('mealType', MEAL_TYPES, m.mealType)));
  form.appendChild(row);
  form.appendChild(labeledInput('Notes', textInput('notes', { value: m.notes || '' })));
  form.appendChild(err);
  const btnRow = el('div', 'form-row');
  const save = submitBtn('Save changes', 'btn-small');
  save.style.marginTop = '0';
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'btn-secondary btn-small'; cancel.textContent = 'Cancel';
  cancel.style.marginTop = '0';
  cancel.addEventListener('click', function () { editingMealId = null; render(); });
  btnRow.appendChild(save);
  btnRow.appendChild(cancel);
  form.appendChild(btnRow);
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      await api('/api/meals/' + m.id, {
        method: 'PATCH',
        body: JSON.stringify({
          date: form.date.value,
          title: form.title.value.trim(),
          mealType: form.mealType.value,
          notes: form.notes.value.trim(),
        }),
      });
      editingMealId = null;
      toast('Meal updated.');
      await refresh();
    } catch (e2) { showFormError(err, e2); }
  });
  return form;
}

function renderGroceries() {
  view.appendChild(sectionTitle('Grocery list'));
  const card = el('div', 'card');
  if (!data.groceries.length) card.appendChild(emptyState('Grocery list is empty.'));
  else {
    const ul = el('ul', 'list');
    data.groceries.forEach(function (g) {
      const li = el('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!g.done;
      cb.setAttribute('aria-label', 'Check off');
      cb.addEventListener('change', async function () {
        try {
          await api('/api/groceries/' + g.id, { method: 'PATCH', body: JSON.stringify({ done: cb.checked ? 1 : 0 }) });
          await refresh();
        } catch (e2) { toast(e2.message, true); cb.checked = !cb.checked; }
      });
      li.appendChild(cb);
      const gEl = el('div', 'grow');
      gEl.appendChild(el('div', g.done ? 'title done-text' : 'title', g.title));
      const meta = [];
      if (g.quantity) meta.push(g.quantity);
      if (g.category && g.category !== 'Other') meta.push(g.category);
      if (meta.length) gEl.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(gEl);
      const del = deleteBtn();
      del.addEventListener('click', async function () {
        try { await api('/api/groceries/' + g.id, { method: 'DELETE' }); await refresh(); }
        catch (e2) { toast(e2.message, true); }
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    card.appendChild(ul);
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button'; clearBtn.className = 'btn-secondary btn-small btn-block';
    clearBtn.textContent = 'Clear checked';
    clearBtn.addEventListener('click', async function () {
      try {
        const res = await api('/api/groceries/clear-checked', { method: 'POST' });
        toast(res.removed + ' checked item(s) cleared.');
        await refresh();
      } catch (e2) { toast(e2.message, true); }
    });
    card.appendChild(clearBtn);
  }
  view.appendChild(card);

  const addCard = el('div', 'card');
  addCard.appendChild(el('h3', null, 'Add a grocery item'));
  const err = errorPara();
  const form = document.createElement('form');
  form.appendChild(labeledInput('Item', textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Milk' })));
  const row = el('div', 'form-row');
  row.appendChild(labeledInput('Amount', textInput('quantity', { placeholder: 'e.g. 1 gallon' })));
  row.appendChild(labeledInput('Category', selectInput('category', GROCERY_CATEGORIES, 'Other')));
  form.appendChild(row);
  form.appendChild(err);
  form.appendChild(submitBtn('Add item'));
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.hidden = true;
    try {
      await api('/api/groceries', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.value.trim(),
          quantity: form.quantity.value.trim(),
          category: form.category.value,
        }),
      });
      toast('Item added.');
      await refresh();
    } catch (e2) { showFormError(err, e2); }
  });
  addCard.appendChild(form);
  view.appendChild(addCard);
}

/* ---------- Bear ---------- */
const BEAR_ROUTINE_CATEGORIES = ['Walk', 'Feeding', 'Grooming', 'Health', 'Play', 'Other'];
const BEAR_REMINDER_CATEGORIES = ['Vet', 'Grooming', 'Medication', 'Other'];

function renderBear() {
  view.appendChild(sectionTitle('Bear 🐾'));
  const today = localToday();

  // Notes card
  const profile = data.bearProfile || {};
  const notesCard = el('div', 'card');
  notesCard.appendChild(el('h3', null, 'Bear\u2019s notes'));
  if (!bearEditing) {
    const dl = el('dl', 'kv');
    [['Food', profile.food], ['Feeding', profile.feedingNotes], ['Vet', profile.vetInfo], ['Grooming', profile.groomingNotes], ['Notes', profile.notes]].forEach(function (pair) {
      dl.appendChild(el('dt', null, pair[0]));
      dl.appendChild(el('dd', null, pair[1] || '—'));
    });
    notesCard.appendChild(dl);
    const editBtn = submitBtn('Edit notes', 'btn-secondary');
    editBtn.type = 'button';
    editBtn.addEventListener('click', function () { bearEditing = true; render(); });
    notesCard.appendChild(editBtn);
  } else {
    const err = errorPara();
    const form = document.createElement('form');
    form.appendChild(labeledInput('Food', textInput('food', { value: profile.food || '', placeholder: 'e.g. Brand and amount' })));
    form.appendChild(labeledInput('Feeding notes', textInput('feedingNotes', { value: profile.feedingNotes || '' })));
    form.appendChild(labeledInput('Vet info', textInput('vetInfo', { value: profile.vetInfo || '', placeholder: 'e.g. Vet name and phone' })));
    form.appendChild(labeledInput('Grooming notes', textInput('groomingNotes', { value: profile.groomingNotes || '' })));
    form.appendChild(labeledInput('General notes', textInput('notes', { value: profile.notes || '' })));
    form.appendChild(err);
    const btnRow = el('div', 'form-row');
    const save = submitBtn('Save notes', 'btn-small');
    save.style.marginTop = '0';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn-secondary btn-small'; cancel.textContent = 'Cancel';
    cancel.style.marginTop = '0';
    cancel.addEventListener('click', function () { bearEditing = false; render(); });
    btnRow.appendChild(save);
    btnRow.appendChild(cancel);
    form.appendChild(btnRow);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      err.hidden = true;
      try {
        await api('/api/bear/profile', {
          method: 'PUT',
          body: JSON.stringify({
            food: form.food.value.trim(),
            feedingNotes: form.feedingNotes.value.trim(),
            vetInfo: form.vetInfo.value.trim(),
            groomingNotes: form.groomingNotes.value.trim(),
            notes: form.notes.value.trim(),
          }),
        });
        bearEditing = false;
        toast('Bear\u2019s notes saved.');
        await refresh();
      } catch (e2) { showFormError(err, e2); }
    });
    notesCard.appendChild(form);
  }
  view.appendChild(notesCard);

  // Daily routines
  const doneToday = new Set(data.bearLogs.filter(function (l) { return l.date === today; }).map(function (l) { return l.title; }));
  const rCard = el('div', 'card');
  rCard.appendChild(el('h3', null, 'Daily routines'));
  if (!data.bearRoutines.length) rCard.appendChild(emptyState('No routines yet. Add one below.'));
  else {
    const ul = el('ul', 'list');
    data.bearRoutines.forEach(function (r) {
      const done = doneToday.has(r.title);
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', done ? 'title done-text' : 'title', r.title));
      const meta = [r.category];
      if (r.frequency) meta.push(r.frequency);
      if (r.timeLabel) meta.push(r.timeLabel);
      if (r.notes) meta.push(r.notes);
      g.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(g);
      if (done) {
        li.appendChild(el('span', 'badge badge-ok', 'Done today ✓'));
      } else {
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button'; doneBtn.className = 'btn-small'; doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', async function () {
          try {
            await api('/api/bear/routines/' + r.id + '/done', { method: 'POST', body: JSON.stringify({}) });
            toast(r.title + ' logged for today.');
            await refresh();
          } catch (e2) { toast(e2.message, true); }
        });
        li.appendChild(doneBtn);
      }
      const del = deleteBtn();
      del.addEventListener('click', async function () {
        try { await api('/api/bear/routines/' + r.id, { method: 'DELETE' }); toast('Routine deleted.'); await refresh(); }
        catch (e2) { toast(e2.message, true); }
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    rCard.appendChild(ul);
  }
  view.appendChild(rCard);

  // Add routine form
  const addRCard = el('div', 'card');
  addRCard.appendChild(el('h3', null, 'Add a routine'));
  const rErr = errorPara();
  const rForm = document.createElement('form');
  rForm.appendChild(labeledInput('Routine', textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Evening walk' })));
  const rRow = el('div', 'form-row');
  rRow.appendChild(labeledInput('Category', selectInput('category', BEAR_ROUTINE_CATEGORIES, 'Walk')));
  rRow.appendChild(labeledInput('When', textInput('timeLabel', { placeholder: 'e.g. Morning' })));
  rForm.appendChild(rRow);
  rForm.appendChild(labeledInput('Frequency', selectInput('frequency', ['Daily', 'Weekly', 'As needed'], 'Daily')));
  rForm.appendChild(labeledInput('Notes', textInput('notes', { placeholder: 'Optional' })));
  rForm.appendChild(rErr);
  rForm.appendChild(submitBtn('Add routine'));
  rForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    rErr.hidden = true;
    try {
      await api('/api/bear/routines', {
        method: 'POST',
        body: JSON.stringify({
          title: rForm.title.value.trim(),
          category: rForm.category.value,
          frequency: rForm.frequency.value,
          timeLabel: rForm.timeLabel.value.trim(),
          notes: rForm.notes.value.trim(),
        }),
      });
      toast('Routine added.');
      await refresh();
    } catch (e2) { showFormError(rErr, e2); }
  });
  addRCard.appendChild(rForm);
  view.appendChild(addRCard);

  // Care log
  const logCard = el('div', 'card');
  logCard.appendChild(el('h3', null, 'Care log'));
  if (!data.bearLogs.length) logCard.appendChild(emptyState('Nothing logged yet.'));
  else {
    const ul = el('ul', 'list');
    data.bearLogs.slice(0, 30).forEach(function (l) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', 'title', l.title));
      const meta = [prettyDate(l.date), l.createdBy];
      if (l.category) meta.push(l.category);
      if (l.notes) meta.push(l.notes);
      g.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(g);
      const del = deleteBtn();
      del.addEventListener('click', async function () {
        try { await api('/api/bear/logs/' + l.id, { method: 'DELETE' }); toast('Log entry deleted.'); await refresh(); }
        catch (e2) { toast(e2.message, true); }
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    logCard.appendChild(ul);
  }
  // Log something manually
  const logErr = errorPara();
  const logForm = document.createElement('form');
  logForm.className = 'inline-form';
  logForm.appendChild(labeledInput('Log something for Bear', textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Gave a bath' })));
  const lRow = el('div', 'form-row');
  lRow.appendChild(labeledInput('Date', textInput('date', { type: 'date', required: true, value: today })));
  lRow.appendChild(labeledInput('Category', selectInput('category', BEAR_ROUTINE_CATEGORIES, 'Other')));
  logForm.appendChild(lRow);
  logForm.appendChild(labeledInput('Notes', textInput('notes', { placeholder: 'Optional' })));
  logForm.appendChild(logErr);
  logForm.appendChild(submitBtn('Add to log', 'btn-small'));
  logForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    logErr.hidden = true;
    try {
      await api('/api/bear/logs', {
        method: 'POST',
        body: JSON.stringify({
          date: logForm.date.value,
          title: logForm.title.value.trim(),
          category: logForm.category.value,
          notes: logForm.notes.value.trim(),
        }),
      });
      toast('Logged.');
      await refresh();
    } catch (e2) { showFormError(logErr, e2); }
  });
  logCard.appendChild(logForm);
  view.appendChild(logCard);

  // Upcoming care dates
  const remCard = el('div', 'card');
  remCard.appendChild(el('h3', null, 'Upcoming care dates'));
  const open = data.bearReminders.filter(function (r) { return !r.done; });
  const doneRem = data.bearReminders.filter(function (r) { return r.done; });
  if (!open.length && !doneRem.length) remCard.appendChild(emptyState('No care dates yet. Add one below.'));
  else {
    const ul = el('ul', 'list');
    open.concat(doneRem).forEach(function (r) {
      const li = el('li');
      const g = el('div', 'grow');
      g.appendChild(el('div', r.done ? 'title done-text' : 'title', r.title));
      const meta = [prettyDate(r.date), r.category];
      if (r.notes) meta.push(r.notes);
      g.appendChild(el('div', 'muted small', meta.join(' · ')));
      li.appendChild(g);
      if (!r.done) {
        li.appendChild(dueBadge(r.date));
        const doneBtn = document.createElement('button');
        doneBtn.type = 'button'; doneBtn.className = 'btn-secondary btn-small'; doneBtn.textContent = 'Done';
        doneBtn.addEventListener('click', async function () {
          try { await api('/api/bear/reminders/' + r.id, { method: 'PATCH', body: JSON.stringify({ done: 1 }) }); await refresh(); }
          catch (e2) { toast(e2.message, true); }
        });
        li.appendChild(doneBtn);
      }
      const del = deleteBtn();
      del.addEventListener('click', async function () {
        try { await api('/api/bear/reminders/' + r.id, { method: 'DELETE' }); toast('Care date deleted.'); await refresh(); }
        catch (e2) { toast(e2.message, true); }
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    remCard.appendChild(ul);
  }
  view.appendChild(remCard);

  const addRemCard = el('div', 'card');
  addRemCard.appendChild(el('h3', null, 'Add a care date'));
  const remErr = errorPara();
  const remForm = document.createElement('form');
  remForm.appendChild(labeledInput('What', textInput('title', { required: true, maxLength: 200, placeholder: 'e.g. Vet checkup' })));
  const remRow = el('div', 'form-row');
  remRow.appendChild(labeledInput('Date', textInput('date', { type: 'date', required: true, value: today })));
  remRow.appendChild(labeledInput('Category', selectInput('category', BEAR_REMINDER_CATEGORIES, 'Vet')));
  remForm.appendChild(remRow);
  remForm.appendChild(labeledInput('Notes', textInput('notes', { placeholder: 'Optional' })));
  remForm.appendChild(remErr);
  remForm.appendChild(submitBtn('Add care date'));
  remForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    remErr.hidden = true;
    try {
      await api('/api/bear/reminders', {
        method: 'POST',
        body: JSON.stringify({
          title: remForm.title.value.trim(),
          date: remForm.date.value,
          category: remForm.category.value,
          notes: remForm.notes.value.trim(),
        }),
      });
      toast('Care date added.');
      await refresh();
    } catch (e2) { showFormError(remErr, e2); }
  });
  addRemCard.appendChild(remForm);
  view.appendChild(addRemCard);
}

/* ---------- Account ---------- */
function renderAccount() {
  view.appendChild(sectionTitle('Account'));
  const me = authState && authState.signedIn;
  const other = authState ? authState.members.find(function (m) { return m.name !== me; }) : null;

  const whoCard = el('div', 'card');
  whoCard.appendChild(el('h3', null, 'Signed in'));
  whoCard.appendChild(el('p', null, 'You are signed in as ' + (me || '—') + '.'));
  if (other) {
    whoCard.appendChild(el('p', 'muted', other.name + (other.hasLogin ? ' has a login.' : ' does not have a login yet.')));
  }
  view.appendChild(whoCard);

  // Change own password
  const pwCard = el('div', 'card');
  pwCard.appendChild(el('h3', null, 'Change my password'));
  const pwErr = errorPara();
  const pwForm = document.createElement('form');
  pwForm.appendChild(labeledInput('Current password', textInput('currentPassword', { type: 'password', required: true, minLength: 6, autocomplete: 'current-password' })));
  pwForm.appendChild(labeledInput('New password (at least 6 characters)', textInput('newPassword', { type: 'password', required: true, minLength: 6, autocomplete: 'new-password' })));
  pwForm.appendChild(pwErr);
  pwForm.appendChild(submitBtn('Change password'));
  pwForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    pwErr.hidden = true;
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pwForm.currentPassword.value, newPassword: pwForm.newPassword.value }),
      });
      pwForm.reset();
      toast('Password changed.');
    } catch (e2) { showFormError(pwErr, e2); }
  });
  pwCard.appendChild(pwForm);
  view.appendChild(pwCard);

  // Other member login
  if (other && !other.hasLogin) {
    const createCard = el('div', 'card');
    createCard.appendChild(el('h3', null, 'Create ' + other.name + '\u2019s login'));
    createCard.appendChild(el('p', 'muted', 'Set a starting password for ' + other.name + '. They can change it after signing in.'));
    const cErr = errorPara();
    const cForm = document.createElement('form');
    cForm.appendChild(labeledInput('Password for ' + other.name + ' (at least 6 characters)', textInput('password', { type: 'password', required: true, minLength: 6, autocomplete: 'new-password' })));
    cForm.appendChild(cErr);
    cForm.appendChild(submitBtn('Create login for ' + other.name));
    cForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      cErr.hidden = true;
      try {
        await api('/api/auth/setup', {
          method: 'POST',
          body: JSON.stringify({ name: other.name, password: cForm.password.value }),
        });
        toast('Login created for ' + other.name + '.');
        authState = await api('/api/auth/state');
        await refresh();
      } catch (e2) { showFormError(cErr, e2); }
    });
    createCard.appendChild(cForm);
    view.appendChild(createCard);
  }

  if (other && other.hasLogin) {
    const resetCard = el('div', 'card');
    resetCard.appendChild(el('h3', null, 'Reset ' + other.name + '\u2019s password'));
    resetCard.appendChild(el('p', 'muted', 'Set a new password for ' + other.name + '. They should change it after signing in.'));
    const rErr = errorPara();
    const rForm = document.createElement('form');
    rForm.appendChild(labeledInput('New password for ' + other.name + ' (at least 6 characters)', textInput('newPassword', { type: 'password', required: true, minLength: 6, autocomplete: 'new-password' })));
    rForm.appendChild(rErr);
    rForm.appendChild(submitBtn('Reset ' + other.name + '\u2019s password'));
    rForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      rErr.hidden = true;
      try {
        await api('/api/auth/reset-member-password', {
          method: 'POST',
          body: JSON.stringify({ name: other.name, newPassword: rForm.newPassword.value }),
        });
        rForm.reset();
        toast(other.name + '\u2019s password has been reset.');
      } catch (e2) { showFormError(rErr, e2); }
    });
    resetCard.appendChild(rForm);
    view.appendChild(resetCard);
  }

  // Sign out
  const outCard = el('div', 'card');
  const outBtn = document.createElement('button');
  outBtn.type = 'button';
  outBtn.className = 'btn-block btn-danger';
  outBtn.style.border = '1.5px solid var(--danger)';
  outBtn.textContent = 'Sign out';
  outBtn.addEventListener('click', async function () {
    try { await api('/api/auth/signout', { method: 'POST' }); } catch (e) { /* still sign out locally */ }
    authState = null;
    data = null;
    try { authState = await api('/api/auth/state'); } catch (e2) { authState = null; }
    showAuth();
  });
  outCard.appendChild(outBtn);
  view.appendChild(outCard);
}

/* ---------- boot ---------- */
(async function init() {
  try {
    authState = await api('/api/auth/state');
  } catch (e) {
    view.appendChild(el('p', 'error-text', 'Could not reach the server. Please try again.'));
    return;
  }
  if (authState.signedIn) await loadApp();
  else showAuth();
})();
