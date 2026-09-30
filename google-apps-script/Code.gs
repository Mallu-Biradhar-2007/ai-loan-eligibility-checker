/**
 * loancheck Google Sheets Web App
 *
 * Setup:
 * 1. Create a Google Sheet and open Extensions > Apps Script.
 * 2. Paste this file into Code.gs.
 * 3. Optional: add Script Properties named SHEET_ID and SHEET_NAME.
 *    If SHEET_ID is omitted, the script uses the active spreadsheet.
 * 4. Deploy > New deployment > Web app > Execute as Me > Anyone.
 * 5. Copy the Web app URL into CONFIG.SHEETS_URL in js/app.js.
 *
 * The frontend posts as text/plain to avoid a browser preflight request.
 * Do not add passwords, government IDs, or account credentials to this sheet.
 */

const HEADERS = [
  'Timestamp', 'Name', 'Email', 'Phone', 'Age', 'Income', 'Employment',
  'Credit Score', 'Loan Type', 'Loan Amount', 'Result', 'Eligibility Score'
];

function getSheet_() {
  const properties = PropertiesService.getScriptProperties();
  const sheetId = properties.getProperty('SHEET_ID');
  const sheetName = properties.getProperty('SHEET_NAME') || 'Eligibility Records';
  const spreadsheet = sheetId ? SpreadsheetApp.openById(sheetId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('No spreadsheet is configured. Set SHEET_ID in Script Properties.');
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function number_(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateRecord_(input) {
  if (!input || typeof input !== 'object') throw new Error('A record object is required.');
  const name = cleanText_(input.name || input.fullName, 120);
  const email = cleanText_(input.email, 160);
  const phone = cleanText_(input.phone, 20).replace(/\D/g, '');
  const age = number_(input.age);
  const income = number_(input.income || input.monthlyIncome);
  const creditScore = number_(input.creditScore);
  const loanAmount = number_(input.loanAmount);
  const eligibilityScore = number_(input.eligibilityScore);
  if (name.length < 2) throw new Error('Name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
  if (!/^\d{10}$/.test(phone)) throw new Error('A 10-digit phone number is required.');
  if (age === null || age < 18 || age > 70) throw new Error('Age must be between 18 and 70.');
  if (income === null || income <= 0) throw new Error('Income must be greater than zero.');
  if (!cleanText_(input.employment, 40)) throw new Error('Employment is required.');
  if (!cleanText_(input.loanType, 40)) throw new Error('Loan type is required.');
  if (loanAmount === null || loanAmount < 10000) throw new Error('Loan amount is invalid.');
  if (creditScore === null || creditScore < 300 || creditScore > 900) throw new Error('Credit score is invalid.');
  if (!cleanText_(input.result, 40)) throw new Error('Result is required.');
  if (eligibilityScore === null || eligibilityScore < 0 || eligibilityScore > 100) throw new Error('Eligibility score is invalid.');
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const input = JSON.parse(raw);
    validateRecord_(input);
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    const row = [
      new Date(),
      cleanText_(input.name || input.fullName, 120),
      cleanText_(input.email, 160),
      cleanText_(input.phone, 20),
      number_(input.age),
      number_(input.income || input.monthlyIncome),
      cleanText_(input.employment, 40),
      number_(input.creditScore),
      cleanText_(input.loanType, 40),
      number_(input.loanAmount),
      cleanText_(input.result, 40),
      number_(input.eligibilityScore)
    ];
    sheet.appendRow(row);
    return json_({ ok: true, message: 'Record saved.' });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doGet(e) {
  try {
    const sheet = getSheet_();
    ensureHeaders_(sheet);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return json_({ ok: true, records: [] });
    const records = values.slice(1).reverse().map(function(row) {
      return {
        Timestamp: row[0] instanceof Date ? row[0].toISOString() : row[0],
        Name: row[1], Email: row[2], Phone: row[3], Age: row[4], Income: row[5],
        Employment: row[6], 'Credit Score': row[7], 'Loan Type': row[8],
        'Loan Amount': row[9], Result: row[10], 'Eligibility Score': row[11]
      };
    });
    const requestedLimit = Number(e && e.parameter && e.parameter.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 100;
    return json_({ ok: true, records: records.slice(0, limit) });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error), records: [] });
  }
}
