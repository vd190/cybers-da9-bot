// قاعدة بيانات JSON بسيطة — تنحفظ في data/db.json
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'db.json');

const defaults = () => ({
  channels: {}, // key -> channel id
  roles: {}, // owner / member -> role id
  whitelist: [], // user/bot ids trusted by anti-nuke
  warns: {}, // userId -> [{ reason, by, at }]
  verified: {}, // userId -> timestamp
  tickets: { counter: 0, open: {}, meta: {} },
  products: { counter: 0, items: {} },
  orders: { counter: 0, pendingReviews: {} },
  stats: { reviews: 0, ratingSum: 0 },
  raid: { active: false, until: 0 },
  lockdown: false,
});

let data;

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const key of Object.keys(base)) {
      if (saved[key] === undefined) continue;
      base[key] = typeof base[key] === 'object' && !Array.isArray(base[key])
        ? { ...base[key], ...saved[key] }
        : saved[key];
    }
  } catch {
    // first run
  }
  data = base;
}

function flush() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}

load();

module.exports = {
  get data() {
    return data;
  },
  save,
  flush,
};
