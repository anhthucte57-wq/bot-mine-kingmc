const mineflayer = require('mineflayer');
const express = require('express');

const app = express();
app.use(express.json());

// ==========================================
// CẤU HÌNH SERVER & LỊCH TRÌNH
// ==========================================
const SERVER_HOST = 'play.kingmc.vn';
const SERVER_PORT = 25565;
const BOT_VERSION = '1.20.1';

const API_KEY = process.env.API_KEY || "mat_khau_bao_mat_123";

const TZ = 'Asia/Ho_Chi_Minh';
const OFF_HOUR = 4, OFF_MIN = 30;
const ON_HOUR  = 6, ON_MIN  = 0;

// ==========================================
// DANH SÁCH TÀI KHOẢN (SỬA TÊN VÀ PASS Ở ĐÂY)
// ==========================================
const ACCOUNTS = [
  { username: '_DTM', password: 'ditmemay.com', isMain: true },  // Acc chính (dùng để rút tiền)
  { username: 'BaoChauCX', password: 'manhdepzai', isMain: false } // Acc phụ
];

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
// QUẢN LÝ BOT
// ==========================================
let bots = {}; 
let isSleeping = false;

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

    bot.on('spawn', () => {
      console.log(`${logPrefix} ✅ Đã vào sảnh chờ!`);
      if (hasLoggedIn) return;
      hasLoggedIn = true;

      setTimeout(() => {
        bot.chat(`/dn ${password}`);
        console.log(`${logPrefix} [AUTH] Gửi lệnh đăng nhập.`);
      }, 2000);

      setTimeout(() => {
        if (!isInMainServer) {
          bot.setQuickBarSlot(4);
          bot.activateItem();
        }
      }, 6000);
    });

    bot.on('windowOpen', (window) => {
      if (!isInMainServer) {
        // Vào KingSMP
        setTimeout(() => {
          try {
            bot.clickWindow(24, 0, 0);
            isInMainServer = true;
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
        // Menu AFK hiện ra -> Click ô 8
        setTimeout(() => {
          try {
            bot.clickWindow(7, 0, 0);
            hasClickedAfkMenu = true;
            console.log(`${logPrefix} [AFK] Đã click vào ô số 8 (Khu AFK).`);

            // --- TÍNH NĂNG MỚI: DI CHUYỂN 10 BƯỚC ---
            if (!hasWalked) {
              hasWalked = true;
              setTimeout(() => {
                console.log(`${logPrefix} [WALK] Bắt đầu di chuyển 10 bước...`);
                
                // Đi tới 10 bước (giả lập bấm phím W)
                bot.setControlState('forward', true);
                
                // 10 bước ~ 5 giây (mỗi bước 0.5s). Bạn có thể tăng giảm thời gian này.
                setTimeout(() => {
                  bot.setControlState('forward', false);
                  console.log(`${logPrefix} [WALK] Đã đi xong 10 bước, đứng im AFK.`);
                }, 5000); // 5000ms = 5 giây
              }, 1500); // Đợi 1.5s sau khi click xong menu để bắt đầu đi
            }
            // ----------------------------------------

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

      if (isSleeping) return;

      if (joinAttempt === 1 || !isInMainServer) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
      }
    });

    // Jump AFK mỗi 30s
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

// ==========================================
// KHỞI ĐỘNG TẤT CẢ BOT
// ==========================================
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
// API RÚT TIỀN
// ==========================================
app.post('/pay', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${API_KEY}`)
    return res.status(401).send({ status: 'error', message: 'Sai API Key' });

  const { ign, amount } = req.body;

  if (isSleeping)
    return res.status(400).send({ status: 'error', message: 'Bot đang trong giờ nghỉ' });

  const mainAccount = ACCOUNTS.find(a => a.isMain);
  if (!mainAccount) return res.status(500).send({ status: 'error', message: 'Chưa cấu hình acc chính' });
  
  const mainBot = bots[mainAccount.username];
  if (!mainBot) return res.status(400).send({ status: 'error', message: 'Acc chính chưa online' });

  try {
    const amountToPay = amount * 1000000;
    mainBot.chat(`/pay ${ign} ${amountToPay}`);
    console.log(`[PAY] [${mainAccount.username}] Đã gửi: /pay ${ign} ${amountToPay}`);
    res.send({ status: 'success' });
  } catch (e) {
    res.status(500).send({ status: 'error', message: e.message });
  }
});

app.get('/', (req, res) => res.send({
  status: 'ok',
  sleeping: isSleeping,
  botsOnline: Object.keys(bots).length,
  botsList: Object.keys(bots)
}));

app.listen(process.env.PORT || 3000, () =>
  console.log('🌐 API chạy ở cổng ' + (process.env.PORT || 3000))
);
