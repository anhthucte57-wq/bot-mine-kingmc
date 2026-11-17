const mineflayer = require('mineflayer');
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Cấu hình Server & Lịch trình
const SERVER_HOST = 'play.kingmc.vn';
const SERVER_PORT = 25565;
const BOT_VERSION = '1.21.11'; 
const TZ = 'Asia/Ho_Chi_Minh';
const OFF_HOUR = 4, OFF_MIN = 30;
const ON_HOUR = 6, ON_MIN = 0;

// DANH SÁCH ACC (Thêm acc của bạn vào đây)
let ACCOUNTS = [
  { id: 1, username: 'BuilderSucVat', password: 'Zb7ZhMzgf9', isMain: true },
  { id: 2, username: 'BaoChauCX', password: 'manhdepzai', isMain: false }
];

let bots = {}; 
let botStatus = {}; 
let botLogs = {}; 
let isSleeping = false;

ACCOUNTS.forEach(acc => {
    botStatus[acc.username] = "Offline";
    botLogs[acc.username] = [];
});

// Hàm tiện ích
function getVnTime() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  return { h: parseInt(parts.find(p => p.type === 'hour').value, 10), m: parseInt(parts.find(p => p.type === 'minute').value, 10) };
}
function isSleepWindow() {
  const { h, m } = getVnTime();
  const nowMin = h * 60 + m;
  return nowMin >= (OFF_HOUR * 60 + OFF_MIN) && nowMin < (ON_HOUR * 60 + ON_MIN);
}

// LOGIC BOT
function startSingleBot(account) {
  const { username, password } = account;
  if (isSleepWindow() || bots[username]) return;

  botStatus[username] = "Đang kết nối...";
  let isInMainServer = false;
  let hasClickedAfkMenu = false;
  let hasWalked = false;
  let afkInterval = null;

  const bot = mineflayer.createBot({
    host: SERVER_HOST, port: SERVER_PORT, username: username, version: BOT_VERSION, hideErrors: true
  });
  bots[username] = bot;

  bot.on('kicked', (reason) => {
    botStatus[username] = "Bị đá (Kicked)";
    logToBot(username, `⛔ Bị đá: ${reason}`);
  });

  bot.on('spawn', () => {
    botStatus[username] = "Đang ở sảnh";
    logToBot(username, "✅ Đã vào sảnh chờ!");
    
    setTimeout(() => { bot.chat(`/dn ${password}`); }, 3000);
    
    setTimeout(() => {
      if (!isInMainServer) { bot.chat('/menu'); }
    }, 7000);
  });

  bot.on('windowOpen', (window) => {
    if (!isInMainServer) {
      setTimeout(() => {
        try {
          bot.clickWindow(13, 0, 0); // Click KingSMP
          isInMainServer = true;
          botStatus[username] = "Đang vào KingSMP";
          logToBot(username, "✅ Đã click vào KingSMP!");
          setTimeout(() => { bot.chat('/afk'); }, 2000);
        } catch (e) { logToBot(username, `Lỗi click: ${e.message}`); }
      }, 1000);
    } else if (!hasClickedAfkMenu) {
      setTimeout(() => {
        try {
          bot.clickWindow(7, 0, 0); // Click Khu AFK số 8
          hasClickedAfkMenu = true;
          logToBot(username, "✅ Đã vào khu AFK số 8!");
          
          if (!hasWalked) {
            hasWalked = true;
            setTimeout(() => {
              bot.setControlState('forward', true);
              setTimeout(() => {
                bot.setControlState('forward', false);
                botStatus[username] = "Đang AFK";
                logToBot(username, "🚶 Đã đi 10 bước, bắt đầu treo AFK.");
              }, 5000);
            }, 1500);
          }
        } catch (e) { logToBot(username, `Lỗi click AFK: ${e.message}`); }
      }, 1000);
    }
  });

  bot.on('end', () => {
    botStatus[username] = "Offline (Mất kết nối)";
    delete bots[username];
    if (afkInterval) clearInterval(afkInterval);
    if (!isSleeping) {
      logToBot(username, "❌ Mất kết nối, thử lại sau 10s...");
      setTimeout(() => startSingleBot(account), 10000);
    }
  });

  afkInterval = setInterval(() => {
    if (!isSleeping && isInMainServer && bot.entity) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 500);
    }
  }, 30000);
}

function startAllBots() {
  if (isSleepWindow()) { isSleeping = true; return; }
  isSleeping = false;
  ACCOUNTS.forEach((acc, index) => {
    setTimeout(() => { if (!isSleeping) startSingleBot(acc); }, index * 5000);
  });
}

setInterval(() => {
  const inSleep = isSleepWindow();
  if (inSleep && !isSleeping) {
    isSleeping = true;
    for (const u in bots) { try { bots[u].quit(); } catch(e){} }
    bots = {};
  } else if (!inSleep && isSleeping) {
    isSleeping = false;
    startAllBots();
  }
}, 30000);

startAllBots();

// Lưu Log
function logToBot(username, msg) {
    if(!botLogs[username]) botLogs[username] = [];
    botLogs[username].push(`[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`);
    if(botLogs[username].length > 50) botLogs[username].shift();
    console.log(`[${username}] ${msg}`);
}

// ================= GIAO DIỆN WEB =================
app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <title>Tool Quản Lý Bot KingMC</title>
    <style>
      body { font-family: Arial, sans-serif; background-color: #121212; color: #fff; padding: 20px; }
      h1 { text-align: center; color: #4CAF50; }
      .container { max-width: 1000px; margin: auto; }
      .card { background: #1e1e1e; border-radius: 8px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { padding: 10px; text-align: left; border-bottom: 1px solid #333; }
      th { background-color: #2c2c2c; }
      .status { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
      .online { background-color: #2e7d32; }
      .offline { background-color: #c62828; }
      .sleeping { background-color: #f57c00; }
      .btn { padding: 5px 10px; border: none; border-radius: 4px; cursor: pointer; color: #fff; margin-right: 5px; }
      .btn-pay { background-color: #1976d2; }
      .btn-cmd { background-color: #7b1fa2; }
      .log-box { background: #000; color: #0f0; font-family: monospace; padding: 10px; height: 150px; overflow-y: auto; font-size: 12px; border-radius: 4px; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🤖 Tool Quản Lý Bot KingMC</h1>
      <div class="card">
        <h3>Hệ thống: <span style="color: ${isSleeping ? '#f57c00' : '#4CAF50'}">${isSleeping ? '😴 Đang ngủ đông' : '🟢 Đang hoạt động'}</span></h3>
        <button class="btn btn-cmd" onclick="sendCmd('all', 'say Hello')">Test Lệnh All</button>
      </div>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Tài khoản</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody id="bot-list">
            <!-- Javascript sẽ render ở đây -->
          </tbody>
        </table>
      </div>
      <div class="card" id="log-container" style="display:none;">
        <h3>Logs: <span id="log-title"></span></h3>
        <div class="log-box" id="log-content"></div>
      </div>
    </div>

    <script>
      const ws = new WebSocket('wss://' + window.location.host);
      let currentLogBot = null;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          renderBots(data.bots);
        } else if (data.type === 'logs' && data.username === currentLogBot) {
          renderLogs(data.logs);
        }
      };

      function renderBots(bots) {
        const tbody = document.getElementById('bot-list');
        tbody.innerHTML = '';
        bots.forEach(bot => {
          let statusClass = bot.status.includes('AFK') || bot.status.includes('KingSMP') ? 'online' : (bot.status.includes('Offline') ? 'offline' : 'sleeping');
          tbody.innerHTML += \`
            <tr>
              <td><b>\${bot.username}</b></td>
              <td><span class="status \${statusClass}">\${bot.status}</span></td>
              <td>
                <button class="btn btn-pay" onclick="pay('\${bot.username}')">Chat /pay</button>
                <button class="btn btn-cmd" onclick="showLogs('\${bot.username}')">Xem Log</button>
              </td>
            </tr>
          \`;
        });
      }

      function pay(username) {
        const ign = prompt("Nhập tên người chơi nhận:");
        const amount = prompt("Nhập số tiền:");
        if (!ign || !amount) return;
        fetch('/api/pay', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ bot: username, ign, amount }) })
          .then(r => r.json()).then(d => alert(d.message));
      }

      function sendCmd(bot, cmd) {
        fetch('/api/cmd', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ bot, command: cmd }) });
      }

      function showLogs(username) {
        currentLogBot = username;
        document.getElementById('log-container').style.display = 'block';
        document.getElementById('log-title').innerText = username;
        ws.send(JSON.stringify({ type: 'subscribe', username }));
      }

      function renderLogs(logs) {
        const box = document.getElementById('log-content');
        box.innerHTML = logs.map(l => \`<div>\${l}</div>\`).join('');
        box.scrollTop = box.scrollHeight;
      }
    </script>
  </body>
  </html>
  `);
});

// ================= API =================
app.post('/api/pay', (req, res) => {
  const { bot: username, ign, amount } = req.body;
  const bot = bots[username];
  if (!bot) return res.json({ success: false, message: 'Bot chưa online' });
  
  bot.chat(\`/pay \${ign} \${amount * 1000000}\`);
  res.json({ success: true, message: \`Đã gửi lệnh từ \${username}\` });
});

app.post('/api/cmd', (req, res) => {
  const { bot: username, command } = req.body;
  const bot = bots[username];
  if (bot) bot.chat(command);
  res.json({ success: true });
});

// ================= WEBSOCKET REALTIME =================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  // Gửi trạng thái ban đầu
  const initialStatus = ACCOUNTS.map(a => ({ username: a.username, status: botStatus[a.username] }));
  ws.send(JSON.stringify({ type: 'status', bots: initialStatus }));

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'subscribe') {
      ws.send(JSON.stringify({ type: 'logs', username: data.username, logs: botLogs[data.username] || [] }));
    }
  });
  ws.on('close', () => clients.delete(ws));
});

// Bắn trạng thái và logs mỗi 2 giây
setInterval(() => {
  const statusList = ACCOUNTS.map(a => ({ username: a.username, status: botStatus[a.username] }));
  const payload = JSON.stringify({ type: 'status', bots: statusList });
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }
  
  // Bắn logs cho ai đang xem
  for (const client of clients) {
    if (client.readyState === 1) {
      // (Có thể tối ưu gửi logs ở đây nếu cần)
    }
  }
}, 2000);

server.listen(process.env.PORT || 3000, () => {
  console.log('🌐 Tool chạy tại cổng ' + (process.env.PORT || 3000));
});
