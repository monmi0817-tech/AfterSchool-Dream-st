const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const ExcelJS = require('exceljs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let dataDirectory;
let updatePromptOpen = false;
const configPath = () => path.join(app.getPath('userData'), 'config.json');
const dataPath = () => path.join(dataDirectory, 'afterschool-application-data.json');

async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
}

async function initializeStorage() {
  const config = await readJson(configPath(), {});
  dataDirectory = config.dataDirectory || path.join(app.getPath('documents'), '방과후신청양식_데이터');
  await fsp.mkdir(dataDirectory, { recursive: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#f5f7fb',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('app-version', app.getVersion());
    if (app.isPackaged) setTimeout(checkForUpdates, 2500);
  });
}

function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', status);
}

async function checkForUpdates() {
  try {
    sendUpdateStatus({ state: 'checking' });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('업데이트 확인 실패', error);
    sendUpdateStatus({ state: 'error', message: '업데이트를 확인하지 못했습니다.' });
  }
}

autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-not-available', () => sendUpdateStatus({ state: 'idle' }));
autoUpdater.on('error', error => {
  log.error('자동 업데이트 오류', error);
  sendUpdateStatus({ state: 'error', message: '업데이트 중 오류가 발생했습니다.' });
});
autoUpdater.on('update-available', async info => {
  if (updatePromptOpen || !mainWindow) return;
  updatePromptOpen = true;
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '새 업데이트가 있습니다',
    message: `새 버전 v${info.version}을 사용할 수 있습니다.`,
    detail: '지금 업데이트하시겠습니까? 다운로드 중에는 작업을 계속할 수 있습니다.',
    buttons: ['업데이트', '나중에'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  updatePromptOpen = false;
  if (choice.response === 0) {
    sendUpdateStatus({ state: 'downloading', percent: 0, version: info.version });
    try { await autoUpdater.downloadUpdate(); } catch (error) { log.error('업데이트 다운로드 실패', error); }
  } else sendUpdateStatus({ state: 'deferred', version: info.version });
});
autoUpdater.on('download-progress', progress => sendUpdateStatus({
  state: 'downloading',
  percent: Math.max(0, Math.min(100, progress.percent || 0)),
  transferred: progress.transferred,
  total: progress.total
}));
autoUpdater.on('update-downloaded', async info => {
  sendUpdateStatus({ state: 'downloaded', percent: 100, version: info.version });
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '업데이트 다운로드 완료',
    message: `v${info.version} 업데이트를 설치할 준비가 되었습니다.`,
    detail: '지금 재시작하면 업데이트가 자동으로 설치됩니다. 나중에를 선택하면 앱을 종료할 때 설치됩니다.',
    buttons: ['지금 재시작', '나중에'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  if (choice.response === 0) autoUpdater.quitAndInstall(false, true);
  else sendUpdateStatus({ state: 'ready-later', version: info.version });
});

function normalizeHeader(value) {
  return String(value ?? '').replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();
}

const aliases = {
  programCode: ['프로그램코드','프로그램code','코드'], programName: ['프로그램명','부서명','프로그램','부서'],
  studentCode: ['학생코드','학생code'], grade: ['학년'], classNo: ['반','학급'], number: ['번호','출석번호'],
  name: ['이름','학생명'], department: ['부서','부서명','프로그램','프로그램명']
};

function findHeaderRow(sheet, fields) {
  const max = Math.min(sheet.rowCount, 30);
  for (let r = 1; r <= max; r++) {
    const values = sheet.getRow(r).values.slice(1).map(normalizeHeader);
    const score = fields.filter(field => aliases[field].some(a => values.includes(normalizeHeader(a)))).length;
    if (score >= Math.min(2, fields.length)) return r;
  }
  return 1;
}

function buildColumnMap(sheet, headerRow, fields) {
  const map = {};
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const h = normalizeHeader(cell.text || cell.value);
    for (const field of fields) if (!map[field] && aliases[field].some(a => normalizeHeader(a) === h)) map[field] = col;
  });
  return map;
}

async function parseWorkbook(filePath, kind) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets[0];
  const fields = kind === 'programs' ? ['programCode','programName'] : kind === 'students'
    ? ['studentCode','grade','classNo','number','name'] : ['department','grade','classNo','number','name'];
  const headerRow = findHeaderRow(sheet, fields);
  const columns = buildColumnMap(sheet, headerRow, fields);
  const missing = fields.filter(f => !columns[f]);
  if (missing.length) throw new Error(`필수 열을 찾지 못했습니다: ${missing.map(f => ({programCode:'프로그램 코드',programName:'프로그램명',studentCode:'학생 코드',grade:'학년',classNo:'반',number:'번호',name:'이름',department:'부서'}[f])).join(', ')}`);
  const rows = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const item = {};
    for (const field of fields) item[field] = String(sheet.getCell(r, columns[field]).text ?? '').trim();
    if (Object.values(item).some(Boolean)) rows.push({ id: crypto.randomUUID(), ...item });
  }
  return rows;
}

async function writeSimpleTemplate(kind, savePath) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('입력양식');
  const headers = kind === 'programs' ? ['프로그램 코드','프로그램명'] : kind === 'students'
    ? ['학생 코드','학년','반','번호','이름'] : ['부서','학년','반','번호','이름'];
  ws.addRow(headers); ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  ws.getRow(1).alignment = { horizontal: 'center' };
  headers.forEach((h, i) => ws.getColumn(i + 1).width = Math.max(14, h.length * 2 + 4));
  ws.views = [{ state: 'frozen', ySplit: 1 }]; await wb.xlsx.writeFile(savePath);
}

ipcMain.handle('load-data', async () => ({ data: await readJson(dataPath(), { programs: [], students: [], rosters: [] }), dataDirectory }));
ipcMain.handle('save-data', async (_, data) => { await fsp.mkdir(dataDirectory, { recursive: true }); await fsp.writeFile(dataPath(), JSON.stringify(data, null, 2), 'utf8'); return true; });
ipcMain.handle('import-excel', async (_, kind) => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Excel 파일', extensions: ['xlsx','xlsm'] }] });
  if (result.canceled) return null;
  return parseWorkbook(result.filePaths[0], kind);
});
ipcMain.handle('download-template', async (_, kind) => {
  const labels = { programs: '프로그램정보_입력양식.xlsx', students: '학생정보_입력양식.xlsx', rosters: '부서별학생명단_입력양식.xlsx' };
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: labels[kind], filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }] });
  if (result.canceled) return false; await writeSimpleTemplate(kind, result.filePath); return true;
});
ipcMain.handle('choose-data-directory', async (_, currentData) => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory','createDirectory'] });
  if (result.canceled) return null;
  const next = result.filePaths[0]; await fsp.mkdir(next, { recursive: true });
  await fsp.writeFile(path.join(next, 'afterschool-application-data.json'), JSON.stringify(currentData, null, 2), 'utf8');
  dataDirectory = next; await fsp.writeFile(configPath(), JSON.stringify({ dataDirectory }, null, 2), 'utf8'); return dataDirectory;
});
ipcMain.handle('open-data-directory', async () => shell.openPath(dataDirectory));
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'development' };
  await checkForUpdates();
  return { ok: true };
});
ipcMain.handle('export-result', async (_, rows) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: '방과후_프로그램_신청_양식.xlsx', filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }] });
  if (result.canceled) return false;
  const template = path.join(__dirname, 'assets', 'application-template.xlsx');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(template); const ws = wb.worksheets[0];
  for (const table of ws.getTables()) ws.removeTable(table.name);
  const outputStyles = Array.from({ length: 8 }, (_, index) => JSON.parse(JSON.stringify(ws.getRow(4).getCell(index + 1).style || {})));
  for (let r = 4; r <= ws.rowCount; r++) ws.getRow(r).values = [];
  rows.forEach((item, index) => {
    const row = ws.getRow(index + 4); row.values = [index + 1, item.programCode, item.programName, item.studentCode, item.grade, item.classNo, item.number, item.studentName];
    for (let c = 1; c <= 8; c++) {
      row.getCell(c).style = outputStyles[c - 1];
      row.getCell(c).font = { name: '맑은 고딕', size: 11 };
      row.getCell(c).alignment = { vertical: 'center', horizontal: [1,5,6,7].includes(c) ? 'center' : 'left' };
      row.getCell(c).border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
    }
  });
  await wb.xlsx.writeFile(result.filePath); return true;
});

app.whenReady().then(async () => { await initializeStorage(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
