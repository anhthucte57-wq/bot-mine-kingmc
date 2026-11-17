const mineflayer = require('mineflayer');
const express = require('express');

const app = express();
app.use(express.json());

// ==========================================
// CẤU HÌNH SERVER & LỊCH TRÌNH
// ==========================================
const SERVER_HOST = 'play.kingmc.vn';
const SERVER_PORT = 25565;
const BOT_VERSION = '1.21.11'; // Cập nhật theo đúng phiên bản mới nhất của KingMC

const API_KEY = process.env.API_KEY || "mat_khau_bao_mat_123";

const TZ = 'Asia/Ho_Chi_Minh';
const OFF_HOUR = 4, OFF_MIN = 30;
const ON_HOUR  = 6, ON_MIN  = 0;

// ==========================================
// DANH SÁCH TÀI KHOẢN
// ==========================================
const ACCOUNTS = [
  { id: 1, username: '_DTM', password: 'ditmemay.com', isMain: true },
  { id: 2, username: 'BaoChauCX', password: 'manhdepzai', isMain: false }
];

// ==========================================
// QUẢN LÝ BOT STATE
// ==========================================
let bots = {}; 
let botStatus = {}; 
let isSleeping = false;

ACCOUNTS.forEach(acc => botStatus[acc.username] = "Offline");

// ==========================================
// HÀM TIỆN ÍCH THỜI GIAN
// ==========================================
function getVnTime() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return { h, m };
}

function isSleepWindow() {
  const { h, m } = getVnTime();
  const nowMin = h * 60 + m;
  const offMin = OFF_HOUR * 60 + OFF_MIN;
  const onMin  = ON_HOUR  * 60 + ON_MIN;
  return nowMin >= offMin && nowMin < onMin;
}

// ==========================================
// LOGIC KHỞI CHẠY BOT
// ==========================================
function startSingleBot(account) {
  const { username, password, isMain } = account;
  const logPrefix = `[${username}]`;

  if (isSleepWindow()) return;
  if (bots[username]) {
    try { bots[username].quit(); } catch(e){}
  }

  let joinAttempt = 0;
  let hasLoggedIn = false;
  let isInMainServer = false;
  let hasClickedAfkMenu = false;
  let hasWalked = false;
  let reconnectTimer = null;
  let afkInterval = null;

  function connect() {
    if (isSleepWindow()) return;
    joinAttempt++;
    hasLoggedIn = false;
    isInMainServer = false;
    hasClickedAfkMenu = false;
    hasWalked = false;
    
    botStatus[username] = "Đang kết nối...";
    console.log(`\n${logPrefix} 🔄 [LẦN ${joinAttempt}] Đang kết nối...`);

    const bot = mineflayer.createBot({
      host: SERVER_HOST,
      port: SERVER_PORT,
      username: username,
      version: BOT_VERSION,
      hideErrors: true,
      checkTimeoutInterval: 120000
    });

    bots[username] = bot;

    bot.on('error', (err) => {
      if (err.code !== 'ECONNRESET') console.log(`${logPrefix} [LỖI] ${err.message}`);
    });

    // Log chi tiết khi bị đá để dễ debug
    bot.on('kicked', (reason) => {
      console.log(`${logPrefix} ⛔ BỊ SERVER ĐÁ: ${reason}`);
      botStatus[username] = "Bị đá (Kicked)";
    });

    bot.on('spawn', () => {
      console.log(`${logPrefix} ✅ Đã vào sảnh chờ!`);
      botStatus[username] = "Đang ở sảnh";
      
      if (hasLoggedIn) return;
      hasLoggedIn = true;

      setTimeout(() => {
        bot.chat(`/dn ${password}`);
        console.log(`${logPrefix} [AUTH] Gửi lệnh đăng nhập.`);
      }, 3000);

      setTimeout(() => {
        if (!isInMainServer) {
          bot.setQuickBarSlot(4);
          bot.activateItem();
        }
      }, 7000);
    });

    bot.on('windowOpen', (window) => {
      if (!isInMainServer) {
        // Vào KingSMP
        setTimeout(() => {
          try {
            bot.clickWindow(24, 0, 0);
            isInMainServer = true;
            botStatus[username] = "Đang vào KingSMP";
            console.log(`${logPrefix} ✅ Đã vào KingSMP! Chuẩn bị /afk...`);
            
            setTimeout(() => {
              bot.chat('/afk');
              console.log(`${logPrefix} [AFK] Gửi lệnh /afk`);
            }, 2000);
          } catch (e) {
            console.log(`${logPrefix} [LỖI GUI] ${e.message}`);
          }
        }, 1000);
      } else if (!hasClickedAfkMenu) {
        // Menu AFK -> Click ô số 8
        setTimeout(() => {
          try {
            bot.clickWindow(7, 0, 0);
            hasClickedAfkMenu = true;
            console.log(`${logPrefix} [AFK] Đã click vào ô số 8 (Khu AFK).`);

            // Đi bộ 10 bước
            if (!hasWalked) {
              hasWalked = true;
              setTimeout(() => {
                console.log(`${logPrefix} [WALK] Bắt đầu di chuyển 10 bước...`);
                bot.setControlState('forward', true);
                setTimeout(() => {
                  bot.setControlState('forward', false);
                  console.log(`${logPrefix} [WALK] Đã đi xong 10 bước, đứng im AFK.`);
                  botStatus[username] = "Đang AFK";
                }, 5000); 
              }, 1500);
            }
          } catch (e) {
            console.log(`${logPrefix} [LỖI AFK MENU] ${e.message}`);
          }
        }, 1000);
      }
    });

    bot.on('end', (reason) => {
      console.log(`${logPrefix} ❌ Ngắt kết nối. Lý do: ${reason}`);
      if (bots[username] === bot) delete bots[username];
      if (afkInterval) clearInterval(afkInterval);
      botStatus[username] = "Offline (Mất kết nối)";

      if (isSleeping) return;

      let waitTime = joinAttempt > 5 ? 30000 : 5000;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, waitTime);
    });

    afkInterval = setInterval(() => {
      if (isSleeping || !bot.entity) return;
      if (isInMainServer) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
    }, 30000);
  }

  connect();
}

function startAllBots() {
  if (isSleepWindow()) {
    isSleeping = true;
    console.log(`😴 [SLEEP] Đang trong giờ nghỉ (04:30–06:00). Không kết nối.`);
    return;
  }
  isSleeping = false;
  
  ACCOUNTS.forEach((acc, index) => {
    setTimeout(() => {
      if (!isSleeping) startSingleBot(acc);
    }, index * 5000); 
  });
}

// ==========================================
// BỘ HẸN GIỜ OFF / ON
// ==========================================
setInterval(() => {
  const inSleep = isSleepWindow();

  if (inSleep && !isSleeping) {
    console.log(`⏰ [SCHEDULE] Đã tới 04:30 — Tắt TẤT CẢ bot.`);
    isSleeping = true;
    for (const username in bots) {
      try { bots[username].quit(); } catch (e) {}
      botStatus[username] = "Ngủ đông (04:30-06:00)";
    }
    bots = {};
    return;
  }

  if (!inSleep && isSleeping) {
    console.log(`⏰ [SCHEDULE] Đã tới 06:00 — Bật TẤT CẢ bot lại.`);
    isSleeping = false;
    startAllBots();
  }
}, 30 * 1000);

startAllBots();

// ==========================================
// GIAO DIỆN WEB QUẢN LÝ (DASHBOARD)
// ==========================================
app.get('/', (req, res) => {
  let html = `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quản Lý Bot KingMC</title>
    <style>
      body { font-family: Arial, sans-serif; background-color: #1e1e1e; color: #fff; padding: 20px; }
      h1 { text-align: center; color: #4CAF50; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #2d2d2d; }
      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #444; }
      th { background-color: #333; }
      .status { padding: 5px 10px; border-radius: 5px; font-weight: bold; }
      .online { background-color: #4CAF50; color: white; }
      .offline { background-color: #f44336; color: white; }
      .sleeping { background-color: #ff9800; color: white; }
      .btn { padding: 6px 12px; margin: 0 5px; border: none; border-radius: 3px; cursor: pointer; color: white; }
      .btn-pay { background-color: #2196F3; }
    </style>
  </head>
  <body>
    <h1>🤖 Dashboard Quản Lý Bot KingMC</h1>
    <p style="text-align: center;">Trạng thái hệ thống: <b>${isSleeping ? '😴 Đang ngủ đông' : '🟢 Đang hoạt động'}</b></p>
    
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Tài khoản</th>
          <th>Trạng thái</th>
          <th>Hành động</th>
        </tr>
      </thead>
      <tbody>
  `;

  ACCOUNTS.forEach(acc => {
    const status = botStatus[acc.username] || "Offline";
    let statusClass = "offline";
    if (status.includes("AFK") || status.includes("KingSMP")) statusClass = "online";
    else if (status.includes("Ngủ") || status.includes("Đang")) statusClass = "sleeping";

    html += `
      <tr>
        <td>${acc.id}</td>
        <td><b>${acc.username}</b> ${acc.isMain ? '(Main)' : ''}</td>
        <td><span class="status ${statusClass}">${status}</span></td>
        <td>
          <button class="btn btn-pay" onclick="sendChat('${acc.username}')">Chat /pay</button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
    
    <script>
      async function sendChat(username) {
        const ign = prompt("Nhập tên người chơi nhận tiền (IGN):");
        if (!ign) return;
        const amount = prompt("Nhập số tiền (Mon):");
        if (!amount) return;
        
        const res = await fetch('/api/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, ign, amount })
        });
        const data = await res.json();
        alert(data.message);
      }
      
      setTimeout(() => location.reload(), 5000);
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// ==========================================
// API RÚT TIỀN (GỌI TỪ WEB HOẶC BOT DISCORD)
// ==========================================
app.post('/api/pay', (req, res) => {
  const { username, ign, amount } = req.body;

  if (isSleeping) return res.json({ status: 'error', message: 'Bot đang ngủ đông (04:30-06:00)' });

  const targetBot = bots[username];
  if (!targetBot) return res.json({ status: 'error', message: `Bot ${username} chưa online` });

  try {
    const amountToPay = parseInt(amount) * 1000000;
    targetBot.chat(`/pay ${ign} ${amountToPay}`);
    console.log(`[PAY] [${username}] Đã gửi: /pay ${ign} ${amountToPay}`);
    res.json({ status: 'success', message: `Đã gửi lệnh /pay từ ${username} đến ${ign}` });
  } catch (e) {
    res.json({ status: 'error', message: e.message });
  }
});

app.post('/pay', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${API_KEY}`)
    return res.status(401).send({ status: 'error', message: 'Sai API Key' });

  const { ign, amount } = req.body;
  const mainAccount = ACCOUNTS.find(a => a.isMain);
  const mainBot = mainAccount ? bots[mainAccount.username] : null;

  if (!mainBot) return res.status(400).send({ status: 'error', message: 'Acc chính chưa online' });

  try {
    const amountToPay = amount * 1000000;
    mainBot.chat(`/pay ${ign} ${amountToPay}`);
    res.send({ status: 'success' });
  } catch (e) {
    res.status(500).send({ status: 'error', message: e.message });
  }
});

// Endpoint cho UptimeRobot ping để chống ngủ đông
app.get('/health', (req, res) => res.send({ status: 'ok', sleeping: isSleeping }));

app.listen(process.env.PORT || 3000, () =>
  console.log('🌐 API & Dashboard chạy ở cổng ' + (process.env.PORT || 3000))
);
