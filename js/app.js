(() => {
  'use strict';

  const CONFIG = Object.freeze({
    SHEETS_URL: '',
    AI_ENDPOINT: '/api/claude',
    RECORDS_KEY: 'loancheck.savedRecords.v1',
    REQUEST_TIMEOUT: 16000,
    maxLoanAmount: 100000000,
    maxTenureYears: 40
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const toNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const formatINR = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.max(0, toNumber(value)));
  const formatNumber = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.max(0, toNumber(value)));
  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  };
  const setText = (selector, value, root = document) => {
    const element = typeof selector === 'string' ? $(selector, root) : selector;
    if (element) element.textContent = String(value ?? '');
    return element;
  };
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  let toastTimer;
  function showToast(message, tone = 'success') {
    const toast = $('#toast');
    const messageEl = $('#toast-message');
    const icon = $('.toast-icon');
    if (!toast || !messageEl) return;
    setText(messageEl, message);
    setText(icon, tone === 'error' ? '!' : '✓');
    icon.style.background = tone === 'error' ? 'var(--coral)' : 'var(--teal)';
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 5200);
  }

  function animateNumber(element, start, end, duration = 750, formatter = (value) => Math.round(value)) {
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setText(element, formatter(end));
      return;
    }
    const started = performance.now();
    const frame = (now) => {
      const progress = clamp((now - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setText(element, formatter(start + (end - start) * eased));
      if (progress < 1) window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  }

  function scrollToTarget(target) {
    const element = typeof target === 'string' ? $(target) : target;
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function initNavigation() {
    const menuToggle = $('.menu-toggle');
    const nav = $('.primary-nav');
    if (menuToggle && nav) {
      menuToggle.addEventListener('click', () => {
        const open = nav.classList.toggle('open');
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      });
      $$('.primary-nav a').forEach((link) => link.addEventListener('click', () => {
        nav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation');
      }));
    }
    $$('.tool-card, .text-link').forEach((link) => {
      link.addEventListener('click', (event) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          event.preventDefault();
          scrollToTarget(href);
          history.replaceState(null, '', href);
        }
      });
    });
    const sections = $$('main section[id]');
    const navLinks = $$('.primary-nav a');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
        });
      }, { rootMargin: '-25% 0px -65% 0px' });
      sections.forEach((section) => observer.observe(section));
    }
    setText('#current-year', new Date().getFullYear());
  }

  function setFieldError(inputId, message) {
    const input = $(`#${inputId}`);
    const field = input?.closest('.field');
    const error = $(`#error-${inputId}`);
    if (!input || !field || !error) return;
    field.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    input.setAttribute('aria-describedby', error.id);
    setText(error, message || '');
  }

  function clearFormErrors(form) {
    $$('.field', form).forEach((field) => {
      field.classList.remove('has-error');
      const input = $('input, select', field);
      const error = $('.field-error', field);
      if (input) input.setAttribute('aria-invalid', 'false');
      if (error) setText(error, '');
    });
  }

  function showValidation(form, errors) {
    clearFormErrors(form);
    errors.forEach(({ id, message }) => setFieldError(id, message));
    if (errors.length) {
      const first = $(`#${errors[0].id}`);
      first?.focus({ preventScroll: true });
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return errors.length === 0;
  }

  function validateEligibility(raw) {
    const errors = [];
    const name = String(raw.fullName || '').trim();
    const email = String(raw.email || '').trim();
    const phone = String(raw.phone || '').replace(/\D/g, '');
    const age = toNumber(raw.age, NaN);
    const income = toNumber(raw.monthlyIncome, NaN);
    const experience = toNumber(raw.experience, NaN);
    const creditScore = toNumber(raw.creditScore, NaN);
    const obligations = toNumber(raw.obligations, NaN);
    const loanAmount = toNumber(raw.loanAmount, NaN);
    const tenureYears = toNumber(raw.tenureYears, NaN);
    if (!name || name.length < 2) errors.push({ id: 'eligibility-name', message: 'Please enter your full name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ id: 'eligibility-email', message: 'Enter a valid email address.' });
    if (!/^\d{10}$/.test(phone)) errors.push({ id: 'eligibility-phone', message: 'Use a 10-digit phone number.' });
    if (!Number.isFinite(age) || age < 18 || age > 70) errors.push({ id: 'eligibility-age', message: 'Age must be between 18 and 70.' });
    if (!Number.isFinite(income) || income <= 0) errors.push({ id: 'eligibility-income', message: 'Monthly income must be greater than zero.' });
    if (!raw.employment) errors.push({ id: 'eligibility-employment', message: 'Choose an employment type.' });
    if (!Number.isFinite(experience) || experience < 0 || experience > 60) errors.push({ id: 'eligibility-experience', message: 'Enter experience from 0 to 60 years.' });
    if (!Number.isFinite(creditScore) || creditScore < 300 || creditScore > 900) errors.push({ id: 'eligibility-score', message: 'Credit score must be between 300 and 900.' });
    if (!Number.isFinite(obligations) || obligations < 0) errors.push({ id: 'eligibility-obligations', message: 'Existing EMIs cannot be negative.' });
    if (!raw.loanType) errors.push({ id: 'eligibility-loan-type', message: 'Choose a loan type.' });
    if (!Number.isFinite(loanAmount) || loanAmount < 10000 || loanAmount > CONFIG.maxLoanAmount) errors.push({ id: 'eligibility-amount', message: 'Use an amount between ₹10,000 and ₹10 crore.' });
    if (!Number.isFinite(tenureYears) || tenureYears < 1 || tenureYears > CONFIG.maxTenureYears) errors.push({ id: 'eligibility-tenure', message: 'Tenure must be between 1 and 40 years.' });
    return errors;
  }

  function eligibilityCalculation(raw) {
    const data = {
      fullName: String(raw.fullName || '').trim(),
      email: String(raw.email || '').trim(),
      phone: String(raw.phone || '').replace(/\D/g, ''),
      age: toNumber(raw.age),
      monthlyIncome: toNumber(raw.monthlyIncome),
      employment: String(raw.employment || ''),
      experience: toNumber(raw.experience),
      creditScore: toNumber(raw.creditScore),
      obligations: toNumber(raw.obligations),
      loanType: String(raw.loanType || ''),
      loanAmount: toNumber(raw.loanAmount),
      tenureYears: toNumber(raw.tenureYears)
    };
    const foir = data.monthlyIncome ? data.obligations / data.monthlyIncome : 1;
    let score = 0;
    const reasons = [];
    const ageGood = data.age >= 21 && data.age <= 60;
    score += ageGood ? 15 : 8;
    reasons.push({ text: ageGood ? 'Your age sits within a typical lending window.' : 'Your age may narrow the range of lenders or products available.', warning: !ageGood });
    const incomePoints = data.monthlyIncome >= 100000 ? 18 : data.monthlyIncome >= 60000 ? 16 : data.monthlyIncome >= 30000 ? 12 : data.monthlyIncome >= 15000 ? 8 : 4;
    score += incomePoints;
    reasons.push({ text: data.monthlyIncome >= 30000 ? 'Income gives the application a workable affordability base.' : 'A lower income base may limit the amount a lender is comfortable with.', warning: data.monthlyIncome < 30000 });
    const employmentPoints = { Salaried: 18, Business: 15, 'Self-employed': 13, Student: 6, Unemployed: 0 }[data.employment] ?? 4;
    score += employmentPoints;
    reasons.push({ text: data.employment === 'Unemployed' ? 'A current income source will be important before applying.' : `${data.employment} income can support an application when documented consistently.`, warning: data.employment === 'Unemployed' });
    const experiencePoints = data.experience >= 5 ? 12 : data.experience >= 2 ? 9 : data.experience > 0 ? 6 : 2;
    score += experiencePoints;
    reasons.push({ text: data.experience >= 2 ? 'Your experience indicates some income stability.' : 'Building more income history could strengthen this profile.', warning: data.experience < 2 });
    const creditPoints = data.creditScore >= 750 ? 20 : data.creditScore >= 650 ? 15 : data.creditScore >= 550 ? 8 : 2;
    score += creditPoints;
    reasons.push({ text: data.creditScore >= 750 ? 'Your credit score is in a strong band.' : data.creditScore >= 650 ? 'Your credit score is workable, with room to improve pricing.' : 'The credit score is the biggest potential constraint right now.', warning: data.creditScore < 750 });
    const foirPoints = foir <= .3 ? 17 : foir <= .5 ? 12 : foir <= .65 ? 5 : 0;
    score += foirPoints;
    reasons.push({ text: foir <= .5 ? `Existing EMIs use about ${Math.round(foir * 100)}% of income, within a common comfort range.` : `Existing EMIs use about ${Math.round(foir * 100)}% of income, above a common comfort range.`, warning: foir > .5 });
    score = Math.round(clamp(score, 0, 100));
    const monthlyRoom = Math.max(0, data.monthlyIncome * .5 - data.obligations);
    const termFactor = { Personal: .72, Home: .82, Car: .76, Education: .80 }[data.loanType] ?? .72;
    const maxEligible = Math.max(0, Math.round(monthlyRoom * data.tenureYears * 12 * termFactor));
    const status = score >= 72 && foir <= .5 && data.creditScore >= 650 && data.employment !== 'Unemployed' ? 'Eligible' : score >= 50 && foir <= .65 ? 'Partially Eligible' : 'Not Eligible';
    const rateBase = data.creditScore >= 750 ? [9.5, 12] : data.creditScore >= 650 ? [12, 16] : [16, 22];
    const typeAdjustment = data.loanType === 'Home' ? -1 : data.loanType === 'Education' ? -.5 : 0;
    const rates = [Math.max(7, rateBase[0] + typeAdjustment), Math.max(10, rateBase[1] + typeAdjustment)];
    const improvement = [];
    if (foir > .5) improvement.push('Bring existing monthly obligations below half of income before taking on a new EMI.');
    if (data.creditScore < 750) improvement.push('Keep every payment on time and reduce revolving utilization to improve the credit profile.');
    if (data.experience < 2) improvement.push('Build a longer, consistent income trail and keep documents ready.');
    if (data.employment === 'Unemployed') improvement.push('A stable income source will materially improve borrowing readiness.');
    if (!improvement.length) improvement.push('Compare at least two offers and keep the final EMI comfortably below your monthly room.');
    return { ...data, foir, score, reasons, maxEligible, status, rates, improvement };
  }

  function renderEligibility(result) {
    const panel = $('#eligibility-result');
    const badge = $('#eligibility-result-badge');
    const gauge = $('#eligibility-gauge');
    if (!panel || !badge || !gauge) return;
    panel.hidden = false;
    setText('#eligibility-result-title', result.status === 'Eligible' ? 'A healthy starting point' : result.status === 'Partially Eligible' ? 'Some room to improve' : 'Pause and strengthen first');
    setText(badge, result.status);
    badge.className = `result-badge ${result.status === 'Partially Eligible' ? 'partial' : result.status === 'Not Eligible' ? 'no' : ''}`;
    gauge.style.setProperty('--score', result.score);
    animateNumber($('#eligibility-score-output'), 0, result.score, 900, (value) => Math.round(value));
    setText('#eligibility-max-output', formatINR(result.maxEligible));
    setText('#eligibility-rate-output', `${result.rates[0].toFixed(1)}–${result.rates[1].toFixed(1)}%`);
    setText('#eligibility-foir-output', `${Math.round(result.foir * 100)}%`);
    const reasonList = $('#eligibility-reasons');
    reasonList.textContent = '';
    result.reasons.forEach((reason) => {
      const li = document.createElement('li');
      if (reason.warning) li.className = 'warning';
      li.textContent = reason.text;
      reasonList.append(li);
    });
    $('#eligibility-ai-output').textContent = '';
    $('#eligibility-ai-button').disabled = false;
    scrollToTarget(panel);
  }

  function buildEligibilityFallback(result) {
    return `Your rule-based score is ${result.score}/100, with an estimated comfortable loan range up to ${formatINR(result.maxEligible)}.\n\nNext steps:\n- ${result.improvement.join('\n- ')}\n\nThis is an educational estimate, not a guarantee of approval.`;
  }

  let latestEligibility = null;
  async function submitEligibility(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    const errors = validateEligibility(raw);
    if (!showValidation(form, errors)) {
      setText('#eligibility-form-status', 'Please review the highlighted fields.', '#eligibility-form-status');
      $('#eligibility-form-status').className = 'form-status error';
      return;
    }
    const status = $('#eligibility-form-status');
    status.className = 'form-status';
    setText(status, 'Calculating your snapshot…');
    await sleep(260);
    latestEligibility = eligibilityCalculation(raw);
    renderEligibility(latestEligibility);
    setText(status, 'Snapshot ready. You can ask for AI context or save it below.');
    status.className = 'form-status success';
  }

  async function askAI(prompt, data) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    try {
      const response = await fetch(CONFIG.AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ prompt, data }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || typeof payload.text !== 'string' || !payload.text.trim()) {
        throw new Error(payload.error || `AI request failed (${response.status})`);
      }
      return payload.text.trim();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function renderSafeRichText(container, text) {
    container.textContent = '';
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    let list = null;
    const flushList = () => { list = null; };
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) { flushList(); return; }
      const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
      if (bullet) {
        if (!list) { list = document.createElement('ul'); container.append(list); }
        const li = document.createElement('li');
        li.textContent = bullet[1];
        list.append(li);
        return;
      }
      const heading = trimmed.replace(/^#+\s*/, '');
      if (trimmed.startsWith('#')) {
        flushList();
        const h4 = document.createElement('h4');
        h4.textContent = heading;
        container.append(h4);
        return;
      }
      flushList();
      const p = document.createElement('p');
      p.textContent = trimmed;
      container.append(p);
    });
  }

  async function handleEligibilityAI() {
    if (!latestEligibility) return;
    const output = $('#eligibility-ai-output');
    const button = $('#eligibility-ai-button');
    button.disabled = true;
    output.className = 'ai-output loading';
    setText(output, 'Preparing a plain-language explanation…');
    const prompt = 'Explain this loan eligibility snapshot in concise, practical language. Mention that it is educational and not professional advice, do not guarantee approval, and give 2–4 prioritized improvement steps. Use short paragraphs and bullets.';
    try {
      const text = await askAI(prompt, latestEligibility);
      output.className = 'ai-output';
      renderSafeRichText(output, text);
    } catch (error) {
      output.className = 'ai-output';
      renderSafeRichText(output, `AI context is temporarily unavailable. Here is a rule-based guide instead.\n\n${buildEligibilityFallback(latestEligibility)}`);
    } finally {
      button.disabled = false;
    }
  }

  function normalizeRecord(record) {
    const source = record || {};
    return {
      timestamp: source.timestamp || source.Timestamp || new Date().toISOString(),
      name: String(source.name || source.Name || '—'),
      email: String(source.email || source.Email || ''),
      phone: String(source.phone || source.Phone || ''),
      age: toNumber(source.age ?? source.Age),
      income: toNumber(source.income ?? source.Income),
      employment: String(source.employment || source.Employment || ''),
      creditScore: toNumber(source.creditScore ?? source['Credit Score']),
      loanType: String(source.loanType || source['Loan Type'] || ''),
      loanAmount: toNumber(source.loanAmount ?? source['Loan Amount']),
      result: String(source.result || source.Result || ''),
      eligibilityScore: toNumber(source.eligibilityScore ?? source['Eligibility Score'])
    };
  }

  function getLocalRecords() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(CONFIG.RECORDS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(normalizeRecord) : [];
    } catch (error) {
      return [];
    }
  }

  function saveLocalRecord(record) {
    const records = [normalizeRecord(record), ...getLocalRecords()].slice(0, 50);
    try {
      window.localStorage.setItem(CONFIG.RECORDS_KEY, JSON.stringify(records));
      return { ok: true, records };
    } catch (error) {
      return { ok: false, records: getLocalRecords() };
    }
  }

  function updateSourcePill(label, remote = false) {
    const pill = $('#records-source-pill');
    if (!pill) return;
    pill.textContent = '';
    const dot = document.createElement('i');
    pill.append(dot, document.createTextNode(` ${label}`));
    pill.classList.toggle('remote', remote);
  }

  function renderRecords(records, source = 'Local backup') {
    const normalized = (records || []).map(normalizeRecord).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const empty = $('#records-empty');
    const table = $('#records-table-wrap');
    const body = $('#records-body');
    const count = $('#nav-record-count');
    if (!empty || !table || !body) return;
    setText(count, normalized.length);
    updateSourcePill(source, source === 'Google Sheets');
    body.textContent = '';
    normalized.forEach((record) => {
      const row = document.createElement('tr');
      const values = [formatDate(record.timestamp), record.name, record.loanType || '—', formatINR(record.loanAmount), record.result || '—', `${Math.round(record.eligibilityScore)}/100`];
      values.forEach((value, index) => {
        const cell = document.createElement('td');
        if (index === 4) {
          const badge = document.createElement('span');
          const resultClass = record.result === 'Partially Eligible' ? 'partial' : record.result === 'Not Eligible' ? 'no' : '';
          badge.className = `record-result ${resultClass}`;
          badge.textContent = value;
          cell.append(badge);
        } else cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    empty.hidden = normalized.length > 0;
    table.hidden = normalized.length === 0;
  }

  async function loadRecords() {
    const notice = $('#records-notice');
    const localRecords = getLocalRecords();
    renderRecords(localRecords, 'Local backup');
    if (!CONFIG.SHEETS_URL) {
      setText(notice, localRecords.length ? 'Showing records saved in this browser.' : 'Sheets is not configured; local backup is ready.');
      return;
    }
    setText(notice, 'Loading from Google Sheets…');
    try {
      const response = await fetch(CONFIG.SHEETS_URL, { method: 'GET', headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || (!Array.isArray(payload) && payload?.ok !== true)) throw new Error('Sheets returned an invalid response.');
      const remote = Array.isArray(payload) ? payload : Array.isArray(payload.records) ? payload.records : [];
      renderRecords([...remote, ...localRecords], 'Google Sheets');
      setText(notice, `${remote.length} Sheet record${remote.length === 1 ? '' : 's'} loaded.`);
    } catch (error) {
      setText(notice, 'Sheets was unavailable; showing local backup.');
      showToast('Google Sheets was unavailable, so your local backup is still visible.', 'error');
    }
  }

  async function persistRecord() {
    if (!latestEligibility) return;
    const saveButton = $('#eligibility-save-button');
    saveButton.disabled = true;
    const record = normalizeRecord({
      timestamp: new Date().toISOString(),
      name: latestEligibility.fullName,
      email: latestEligibility.email,
      phone: latestEligibility.phone,
      age: latestEligibility.age,
      income: latestEligibility.monthlyIncome,
      employment: latestEligibility.employment,
      creditScore: latestEligibility.creditScore,
      loanType: latestEligibility.loanType,
      loanAmount: latestEligibility.loanAmount,
      result: latestEligibility.status,
      eligibilityScore: latestEligibility.score
    });
    let savedRemotely = false;
    if (CONFIG.SHEETS_URL) {
      try {
        const response = await fetch(CONFIG.SHEETS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(record) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true) throw new Error(`Sheets returned an unsuccessful response (${response.status}).`);
        savedRemotely = true;
      } catch (error) {
        savedRemotely = false;
      }
    }
    const localResult = saveLocalRecord(record);
    await loadRecords();
    if (!localResult.ok && savedRemotely) showToast('Snapshot saved to Google Sheets. Browser storage was unavailable.', 'error');
    else if (!localResult.ok) showToast('This browser could not save a local backup. Check storage permissions.', 'error');
    else showToast(savedRemotely ? 'Snapshot saved to Google Sheets and this browser.' : 'Snapshot saved locally. Configure Sheets when you are ready.', savedRemotely ? 'success' : 'error');
    saveButton.disabled = false;
  }

  function validateCredit(raw) {
    const errors = [];
    if (!raw.paymentHistory) errors.push({ id: 'credit-payment', message: 'Choose a payment history.' });
    if (!raw.creditAge) errors.push({ id: 'credit-age', message: 'Choose a credit age.' });
    if (!raw.creditMix) errors.push({ id: 'credit-mix', message: 'Choose a credit mix.' });
    const activeLoans = toNumber(raw.activeLoans, NaN);
    const inquiries = toNumber(raw.inquiries, NaN);
    if (!Number.isFinite(activeLoans) || activeLoans < 0 || activeLoans > 20) errors.push({ id: 'credit-loans', message: 'Use a number from 0 to 20.' });
    if (!Number.isFinite(inquiries) || inquiries < 0 || inquiries > 20) errors.push({ id: 'credit-inquiries', message: 'Use a number from 0 to 20.' });
    return errors;
  }

  let latestCredit = null;
  function creditCalculation(raw) {
    const utilization = clamp(toNumber(raw.utilization, 30), 0, 100);
    const utilizationScore = utilization <= 10 ? 100 : utilization <= 30 ? 90 : utilization <= 50 ? 75 : utilization <= 75 ? 55 : 30;
    const activeLoans = clamp(toNumber(raw.activeLoans), 0, 20);
    const inquiries = clamp(toNumber(raw.inquiries), 0, 20);
    const loanScore = clamp(100 - activeLoans * 8, 25, 100);
    const inquiryScore = clamp(100 - inquiries * 14, 20, 100);
    const scores = {
      'Payment history': toNumber(raw.paymentHistory),
      'Credit utilization': utilizationScore,
      'Credit age': toNumber(raw.creditAge),
      'Active loans': loanScore,
      'Recent inquiries': inquiryScore,
      'Credit mix': toNumber(raw.creditMix)
    };
    const weighted = scores['Payment history'] * .35 + scores['Credit utilization'] * .20 + scores['Credit age'] * .15 + scores['Active loans'] * .08 + scores['Recent inquiries'] * .10 + scores['Credit mix'] * .12;
    const score = Math.round(clamp(300 + weighted * 6, 300, 900));
    const risk = score >= 750 ? 'Low' : score >= 650 ? 'Medium' : 'High';
    const strongest = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];
    return { score, risk, scores, utilization, activeLoans, inquiries, strongest, weakest };
  }

  function renderCredit(result) {
    latestCredit = result;
    const gauge = $('#credit-gauge');
    const badge = $('#credit-risk-badge');
    gauge.style.setProperty('--score', ((result.score - 300) / 600) * 100);
    animateNumber($('#credit-score-output'), 300, result.score, 900, (value) => Math.round(value));
    setText('#credit-risk-output', `${result.risk} risk`);
    setText('#credit-summary-output', `${result.strongest} is a relative strength. Start with ${result.weakest.toLowerCase()} for the biggest potential improvement.`);
    setText(badge, `${result.risk} risk`);
    badge.className = `risk-badge ${result.risk.toLowerCase()}`;
    const list = $('#credit-factors');
    list.textContent = '';
    Object.entries(result.scores).forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'factor-row';
      const labelRow = document.createElement('div');
      labelRow.className = 'factor-label';
      const name = document.createElement('span');
      name.textContent = label;
      const valueEl = document.createElement('strong');
      valueEl.textContent = `${Math.round(value)}%`;
      labelRow.append(name, valueEl);
      const bar = document.createElement('div');
      bar.className = 'factor-bar';
      const fill = document.createElement('b');
      fill.style.width = `${value}%`;
      bar.append(fill);
      row.append(labelRow, bar);
      list.append(row);
    });
    setText('#credit-ai-output', 'Ready when you want a few personalized next steps.');
  }

  async function submitCredit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    const errors = validateCredit(raw);
    if (!showValidation(form, errors)) {
      $('#credit-form-status').className = 'form-status error';
      setText('#credit-form-status', 'Please complete the highlighted signals.');
      return;
    }
    $('#credit-form-status').className = 'form-status';
    setText('#credit-form-status', 'Estimating your range…');
    await sleep(240);
    renderCredit(creditCalculation(raw));
    $('#credit-form-status').className = 'form-status success';
    setText('#credit-form-status', 'Estimate ready. Remember, bureau scores may differ.');
  }

  async function handleCreditAI() {
    if (!latestCredit) {
      showToast('Complete the credit analyzer first.', 'error');
      return;
    }
    const output = $('#credit-ai-output');
    const button = $('#credit-ai-button');
    button.disabled = true;
    setText(output, 'Thinking through your factors…');
    try {
      const text = await askAI('Give concise, practical educational insights for this estimated credit profile. Do not promise score changes or lending outcomes. Mention that it is not professional financial advice and prioritize the 2 most useful habits.', latestCredit);
      setText(output, text);
    } catch (error) {
      setText(output, `AI is unavailable right now. Start with ${latestCredit.weakest.toLowerCase()}, then keep ${latestCredit.strongest.toLowerCase()} steady. This is educational guidance, not professional advice.`);
    } finally {
      button.disabled = false;
    }
  }

  const emiState = { tenureUnit: 'years' };
  function getEmiInputs() {
    return { amount: clamp(toNumber($('#emi-amount')?.value, 1200000), 10000, 100000000), rate: clamp(toNumber($('#emi-rate')?.value, 10.5), 0, 40), tenure: clamp(toNumber($('#emi-tenure')?.value, 5), 1, emiState.tenureUnit === 'years' ? 30 : 360) };
  }

  function calculateEMI(amount, annualRate, tenure, unit) {
    const months = unit === 'years' ? tenure * 12 : tenure;
    const monthlyRate = annualRate / 12 / 100;
    const monthly = monthlyRate === 0 ? amount / months : amount * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    const total = monthly * months;
    const interest = Math.max(0, total - amount);
    const schedule = [];
    let balance = amount;
    for (let month = 1; month <= months; month += 1) {
      const interestPart = monthlyRate === 0 ? 0 : balance * monthlyRate;
      const principalPart = month === months ? balance : Math.max(0, monthly - interestPart);
      const closing = Math.max(0, balance - principalPart);
      schedule.push({ month, opening: balance, principal: principalPart, interest: interestPart, closing });
      balance = closing;
    }
    return { amount, annualRate, tenure, unit, months, monthly, total, interest, schedule };
  }

  function syncEmiControl(inputId, rangeId, value) {
    const input = $(`#${inputId}`);
    const range = $(`#${rangeId}`);
    if (!input || !range) return;
    const min = toNumber(input.min, 0);
    const max = toNumber(input.max, 100000000);
    const next = clamp(toNumber(value, toNumber(input.value)), min, max);
    input.value = String(next);
    range.value = String(clamp(next, toNumber(range.min, min), toNumber(range.max, max)));
  }

  function renderEmi(result) {
    setText('#emi-amount-output', formatINR(result.amount));
    setText('#emi-rate-output', `${result.annualRate.toFixed(1)}%`);
    setText('#emi-monthly-output', formatINR(result.monthly));
    setText('#emi-interest-output', formatINR(result.interest));
    setText('#emi-total-output', formatINR(result.total));
    setText('#emi-principal-output', formatINR(result.amount));
    setText('#emi-interest-legend', formatINR(result.interest));
    const principalPercent = result.total > 0 ? Math.round((result.amount / result.total) * 100) : 100;
    $('#emi-donut').style.setProperty('--principal', `${principalPercent}%`);
    setText('#emi-principal-percent', `${principalPercent}%`);
    setText('#emi-tenure-min', result.unit === 'years' ? '1 year' : '1 month');
    setText('#emi-tenure-max', result.unit === 'years' ? '30 years' : '360 months');
    const body = $('#amortization-body');
    body.textContent = '';
    result.schedule.forEach((row) => {
      const tr = document.createElement('tr');
      [row.month, formatINR(row.opening), formatINR(row.principal), formatINR(row.interest), formatINR(row.closing)].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = String(value);
        tr.append(td);
      });
      body.append(tr);
    });
  }

  function updateEmi() {
    const result = calculateEMI(...Object.values(getEmiInputs()), emiState.tenureUnit);
    renderEmi(result);
  }

  function initEmi() {
    const pairs = [['emi-amount', 'emi-amount-range'], ['emi-rate', 'emi-rate-range'], ['emi-tenure', 'emi-tenure-range']];
    pairs.forEach(([inputId, rangeId]) => {
      const input = $(`#${inputId}`);
      const range = $(`#${rangeId}`);
      input?.addEventListener('input', () => { syncEmiControl(inputId, rangeId, input.value); updateEmi(); });
      range?.addEventListener('input', () => { syncEmiControl(inputId, rangeId, range.value); updateEmi(); });
    });
    $$('[data-tenure-unit]').forEach((button) => button.addEventListener('click', () => {
      emiState.tenureUnit = button.dataset.tenureUnit;
      $$('[data-tenure-unit]').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
      const tenureInput = $('#emi-tenure');
      const tenureRange = $('#emi-tenure-range');
      const currentYears = toNumber(tenureInput.value, 5);
      const next = emiState.tenureUnit === 'months' ? Math.round(currentYears * 12) : Math.max(1, Math.round(currentYears / 12));
      tenureInput.max = emiState.tenureUnit === 'years' ? '30' : '360';
      tenureRange.max = tenureInput.max;
      tenureInput.value = String(clamp(next, 1, toNumber(tenureInput.max)));
      tenureRange.value = tenureInput.value;
      updateEmi();
    }));
    $('#amortization-toggle')?.addEventListener('click', () => {
      const button = $('#amortization-toggle');
      const panel = $('#amortization-panel');
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
    });
    updateEmi();
  }

  function validateTips(raw, topicSelected) {
    const errors = [];
    const income = toNumber(raw.income, NaN);
    const expenses = toNumber(raw.expenses, NaN);
    if (!topicSelected && (!Number.isFinite(income) || income <= 0)) errors.push({ id: 'tips-income', message: 'Enter your monthly income or choose a topic.' });
    if (!topicSelected && (!Number.isFinite(expenses) || expenses < 0)) errors.push({ id: 'tips-expenses', message: 'Enter your monthly expenses or choose a topic.' });
    if (!topicSelected && !raw.goal) errors.push({ id: 'tips-goal', message: 'Choose a goal or choose a topic.' });
    return errors;
  }

  function buildTipsFallback(context) {
    const income = toNumber(context.income);
    const expenses = toNumber(context.expenses);
    const surplus = Math.max(0, income - expenses);
    const goal = context.goal || context.topic || 'building financial resilience';
    const topic = context.topic || goal;
    const generic = {
      Saving: ['Automate a small transfer on payday—even 5% is a useful start.', 'Build a starter buffer before increasing long-term risk.', 'Keep the buffer in an accessible account separate from daily spending.'],
      'Debt reduction': ['List balances by interest rate and direct extra money to the costliest debt first.', 'Keep minimum payments automated so progress is not interrupted.', 'Avoid taking a new loan to manage a payment that is already uncomfortable.'],
      'Improving credit score': ['Pay every bill on time and keep card utilization below 30% where possible.', 'Avoid several hard inquiries in a short window.', 'Check your credit report for errors before applying for a major loan.'],
      'Investing basics': ['Start with a goal, time horizon and emergency buffer before investing.', 'Choose diversified, understandable products and keep costs visible.', 'Do not invest money you may need for near-term essentials.'],
      Insurance: ['Cover essential health and term-life needs before adding complex products.', 'Compare exclusions, waiting periods and claim terms—not only the premium.', 'Review cover when income, dependents or liabilities change.']
    };
    const tips = generic[topic] || ['Keep essential expenses visible with a simple monthly plan.', 'Set one automatic action on payday that supports your goal.', 'Review the plan once a month and adjust without judgment.'];
    return `Your focus: ${goal}.\n\nA simple starting point:\n- ${tips.join('\n- ')}\n\n${income ? `Based on the numbers shared, your current monthly surplus is approximately ${formatINR(surplus)}.` : 'Add your income and expense numbers next time for a more tailored view.'}\n\nThis is educational guidance, not professional financial advice.`;
  }

  let selectedTipTopic = '';
  let latestTipsContext = null;
  async function generateTips(context) {
    latestTipsContext = context;
    const placeholder = $('.output-placeholder');
    const content = $('.tips-content');
    const output = $('#tips-ai-output');
    const status = $('#tips-form-status');
    placeholder.hidden = true;
    content.hidden = false;
    output.className = 'ai-output loading';
    setText(output, 'Building a practical starting point…');
    setText('#tips-context-label', context.topic ? `Topic: ${context.topic}` : `For: ${context.goal}`);
    try {
      const text = await askAI('Give concise, practical educational financial tips based on the provided context. Do not sell products, guarantee outcomes, or give regulated professional advice. Use a short opening and 3–5 bullets. Keep the tone plain and supportive.', context);
      output.className = 'ai-output rich-output';
      renderSafeRichText(output, text);
    } catch (error) {
      output.className = 'ai-output rich-output';
      renderSafeRichText(output, `AI is unavailable, so here is a rule-based starting point.\n\n${buildTipsFallback(context)}`);
      setText(status, 'AI is unavailable; showing deterministic tips instead.');
      status.className = 'form-status';
    }
  }

  async function submitTips(event) {
    event.preventDefault();
    const form = $('#tips-form');
    const raw = Object.fromEntries(new FormData(form).entries());
    const errors = validateTips(raw, Boolean(selectedTipTopic));
    if (!showValidation(form, errors)) {
      $('#tips-form-status').className = 'form-status error';
      setText('#tips-form-status', 'Complete the short form or choose a topic.');
      return;
    }
    const context = { income: toNumber(raw.income), expenses: toNumber(raw.expenses), goal: raw.goal || '', topic: selectedTipTopic };
    $('#tips-form-status').className = 'form-status success';
    setText('#tips-form-status', 'Your guidance is ready below.');
    await generateTips(context);
  }

  function initTips() {
    $$('.topic-button').forEach((button) => button.addEventListener('click', () => {
      $$('.topic-button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      selectedTipTopic = button.dataset.topic || '';
      if ($('#tips-goal')) $('#tips-goal').value = '';
      generateTips({ income: toNumber($('#tips-income')?.value), expenses: toNumber($('#tips-expenses')?.value), goal: '', topic: selectedTipTopic });
    }));
    $('#followup-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('#tips-followup');
      const question = String(input?.value || '').trim();
      if (!question) { input?.focus(); return; }
      if (!latestTipsContext) { showToast('Generate a tips view first, then ask a follow-up.', 'error'); return; }
      const output = $('#tips-ai-output');
      const previous = output.textContent;
      output.className = 'ai-output loading';
      setText(output, 'Thinking about that follow-up…');
      try {
        const text = await askAI('Answer this follow-up question in the context of the previous financial tips. Be concise, practical, educational, and do not promise outcomes or provide professional financial advice.', { context: latestTipsContext, question });
        output.className = 'ai-output rich-output';
        renderSafeRichText(output, text);
      } catch (error) {
        output.className = 'ai-output rich-output';
        renderSafeRichText(output, `AI is unavailable for this follow-up. Keep your original plan simple and review it monthly.\n\n${previous || 'This is educational guidance, not professional financial advice.'}`);
      }
      input.value = '';
    });
  }

  function bindEvents() {
    $('#eligibility-form')?.addEventListener('submit', submitEligibility);
    $('#eligibility-ai-button')?.addEventListener('click', handleEligibilityAI);
    $('#eligibility-save-button')?.addEventListener('click', persistRecord);
    $('#credit-form')?.addEventListener('submit', submitCredit);
    $('#credit-utilization')?.addEventListener('input', (event) => setText('#credit-utilization-output', `${event.target.value}%`));
    $('#credit-ai-button')?.addEventListener('click', handleCreditAI);
    $('#tips-form')?.addEventListener('submit', submitTips);
    $('#refresh-records')?.addEventListener('click', loadRecords);
    $('#toast-close')?.addEventListener('click', () => $('#toast')?.classList.remove('show'));
  }

  function init() {
    initNavigation();
    bindEvents();
    initEmi();
    initTips();
    loadRecords();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
