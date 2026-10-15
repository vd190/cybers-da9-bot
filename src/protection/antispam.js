// Anti-Spam + Anti-Links + Anti-Invites + Anti-Mention
const config = require('../../config');
const db = require('../db');
const { embed, log, isOwner, isTrusted, cut } = require('../util');
const { addWarn } = require('./warns');

const URL_RE = /\bhttps?:\/\/[^\s<>]+|\bwww\.[^\s<>]+/gi;
const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.(?:gg|io|me|li)|dsc\.gg|invite\.gg)\/\S+/i;

const msgTimes = new Map();
const recent = new Map();
const lastPunish = new Map();

function host(url) {
  try {
    return new URL(url.startsWith('http') ? url : `http://${url}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

async function violation(msg, reason, { timeoutMin = 0, purge = false } = {}) {
  const userId = msg.author.id;
  await msg.delete().catch(() => {});

  if (purge) {
    const fetched = await msg.channel.messages.fetch({ limit: 50 }).catch(() => null);
    const theirs = fetched?.filter((m) => m.author.id === userId && Date.now() - m.createdTimestamp < 60_000);
    if (theirs?.size) await msg.channel.bulkDelete(theirs, true).catch(() => {});
  }

  // لا نعاقب نفس الشخص مرتين بنفس اللحظة
  if (Date.now() - (lastPunish.get(userId) ?? 0) < 5000) return;
  lastPunish.set(userId, Date.now());

  if (timeoutMin && msg.member?.moderatable) {
    await msg.member.timeout(timeoutMin * 60_000, `[Anti-Spam] ${reason}`).catch(() => {});
  }

  const note = await msg.channel
    .send({
      content: `${msg.author}`,
      embeds: [embed(config.colors.warn).setDescription(`⚠️ **${reason}**${timeoutMin ? ` — تايم أوت ${timeoutMin} دقيقة` : ''}`)],
    })
    .catch(() => null);
  if (note) setTimeout(() => note.delete().catch(() => {}), 6000);

  await log(msg.guild, 'logSecurity', embed(config.colors.warn)
    .setTitle('🧹 Anti-Spam')
    .addFields(
      { name: 'العضو', value: `${msg.author} \`${userId}\``, inline: true },
      { name: 'الروم', value: `${msg.channel}`, inline: true },
      { name: 'المخالفة', value: reason },
      { name: 'الرسالة', value: cut(msg.content, 800) },
    ));
  await addWarn(msg.guild, userId, `[تلقائي] ${reason}`, msg.client.user.id);
}

async function handleMessage(msg) {
  if (!msg.guild || msg.guild.id !== process.env.GUILD_ID) return;
  if (msg.author.bot || msg.webhookId || !msg.member) return;
  if (isOwner(msg.member) || isTrusted(msg.guild, msg.author.id)) return;

  const s = config.protection.spam;
  const content = msg.content ?? '';
  const inTicket = msg.channel.parentId === db.data.channels.ticketsCategory;
  const userId = msg.author.id;
  const now = Date.now();

  if (INVITE_RE.test(content)) return violation(msg, 'نشر رابط دعوة سيرفر', { timeoutMin: 60 });

  if (config.protection.blockLinks && !inTicket) {
    const urls = content.match(URL_RE) ?? [];
    const blocked = urls.some((u) => {
      const h = host(u);
      return !config.protection.allowedDomains.some((d) => h === d || h.endsWith(`.${d}`));
    });
    if (blocked) return violation(msg, 'الروابط ممنوعة في السيرفر');
  }

  const mentions = msg.mentions.users.size + msg.mentions.roles.size + (msg.mentions.everyone ? s.maxMentions : 0);
  if (mentions >= s.maxMentions) return violation(msg, 'منشن جماعي', { timeoutMin: s.timeoutMinutes });

  if (content.split('\n').length > s.maxLines) return violation(msg, 'رسالة طويلة جداً (سبام أسطر)');

  const times = (msgTimes.get(userId) ?? []).filter((t) => now - t < s.perSeconds * 1000);
  times.push(now);
  msgTimes.set(userId, times);
  if (times.length > s.maxMessages) {
    msgTimes.set(userId, []);
    return violation(msg, 'سبام رسائل سريعة', { timeoutMin: s.timeoutMinutes, purge: true });
  }

  const norm = content.toLowerCase().replace(/\s+/g, ' ').trim();
  if (norm.length >= 2 || msg.attachments.size) {
    const key = norm || `att:${msg.attachments.size}`;
    const list = (recent.get(userId) ?? []).filter((r) => now - r.t < 30_000);
    list.push({ c: key, t: now });
    recent.set(userId, list);
    if (list.filter((r) => r.c === key).length >= s.duplicates) {
      recent.set(userId, []);
      return violation(msg, 'تكرار نفس الرسالة', { timeoutMin: s.timeoutMinutes, purge: true });
    }
  }
}

// تنظيف الذاكرة كل 5 دقايق
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of msgTimes) if (!v.some((t) => now - t < 60_000)) msgTimes.delete(k);
  for (const [k, v] of recent) if (!v.some((r) => now - r.t < 60_000)) recent.delete(k);
  for (const [k, t] of lastPunish) if (now - t > 60_000) lastPunish.delete(k);
}, 300_000).unref();

module.exports = { handleMessage };
