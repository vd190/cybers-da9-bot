// نظام التحقق برمز (Captcha) + الترحيب
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const config = require('../config');
const db = require('./db');
const { embed, reply, ok, fail, modal, log, channel, ts } = require('./util');
const { art } = require('./panels');

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codes = new Map(); // userId -> { code, exp, tries }
const cooldown = new Map(); // userId -> until

const genCode = () => Array.from({ length: 5 }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');

async function start(i) {
  const memberRole = db.data.roles.member;
  if (i.member.roles.cache.has(memberRole)) return ok(i, 'أنت متحقق من قبل 👌\n*You are already verified.*');
  if (db.data.raid.active) return fail(i, 'السيرفر حالياً في وضع الحماية، حاول بعد شوي.\n*The server is in protection mode, try again soon.*');
  const until = cooldown.get(i.user.id) ?? 0;
  if (until > Date.now()) return fail(i, `أخطأت كثير، حاول مرة ثانية ${ts(until)}\n*Too many attempts, try again later.*`);

  const code = genCode();
  codes.set(i.user.id, { code, exp: Date.now() + 120_000, tries: 0 });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify:enter').setLabel('إدخال الرمز • Enter code').setEmoji('⌨️').setStyle(ButtonStyle.Primary),
  );
  return reply(i, {
    embeds: [
      embed()
        .setTitle('🔐 رمز التحقق • Verification Code')
        .setDescription(`رمزك هو • Your code:\n# \` ${code.split('').join(' ')} \`\nاضغط **إدخال الرمز** واكتبه **بدون مسافات**.\n*Click **Enter code** and type it **without spaces**.*\n\n⏱️ ينتهي • Expires ${ts(Date.now() + 120_000)}`),
    ],
    components: [row],
  });
}

async function enter(i) {
  const entry = codes.get(i.user.id);
  if (!entry || entry.exp < Date.now()) return fail(i, 'الرمز انتهى، اضغط **تحقق** مرة ثانية.\n*Code expired, click **Verify** again.*');
  return i.showModal(modal('verify:submit', 'التحقق • Verification', [{ id: 'code', label: 'اكتب الرمز • Type the code', placeholder: 'مثال: AB12C', max: 12 }]));
}

async function submit(i) {
  const entry = codes.get(i.user.id);
  if (!entry || entry.exp < Date.now()) return fail(i, 'الرمز انتهى، اضغط **تحقق** مرة ثانية.\n*Code expired, click **Verify** again.*');
  const value = i.fields.getTextInputValue('code').toUpperCase().replace(/\s+/g, '');

  if (value !== entry.code) {
    entry.tries++;
    if (entry.tries >= config.verifyAttempts) {
      codes.delete(i.user.id);
      cooldown.set(i.user.id, Date.now() + 5 * 60_000);
      await log(i.guild, 'logSecurity', embed(config.colors.warn).setTitle('🔐 فشل التحقق')
        .setDescription(`${i.user} \`${i.user.id}\` أخطأ ${entry.tries} مرات — انتظار 5 دقايق`));
      return fail(i, 'أخطأت كثير — انتظر 5 دقايق وحاول مرة ثانية.\n*Too many attempts — wait 5 minutes.*');
    }
    return fail(i, `الرمز غلط ❌ باقي لك ${config.verifyAttempts - entry.tries} محاولات.\n*Wrong code — ${config.verifyAttempts - entry.tries} attempts left.*`);
  }

  codes.delete(i.user.id);
  await i.member.roles.add(db.data.roles.member, 'Verified').catch(() => {});
  db.data.verified[i.user.id] = Date.now();
  db.save();

  await log(i.guild, 'logMembers', embed(config.colors.success).setTitle('✅ تحقق ناجح')
    .setDescription(`${i.user} \`${i.user.id}\``));
  await welcome(i.member);

  return ok(i, `تم التحقق! حياك الله في **${config.serverName}** 🎉\n*Verified! Welcome to **${config.serverName}** 🎉*\n\n🛍️ <#${db.data.channels.products}>`);
}

async function welcome(member) {
  const ch = channel(member.guild, 'welcome');
  if (!ch) return;
  const a = art('welcome');
  const c = db.data.channels;
  const e = embed()
    .setAuthor({ name: member.user.username, iconURL: member.user.displayAvatarURL() })
    .setTitle(`👋 حياك الله • Welcome ${member.user.globalName ?? member.user.username}`)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `أهلاً ${member} في **${config.serverName}** 💙`,
        `*Welcome ${member} to **${config.serverName}** 💙*`,
        '',
        '━━━━━━━━━━━━━━━━━━',
        `📜 القوانين • Rules — <#${c.rules}>`,
        `🛍️ المنتجات • Products — <#${c.products}>`,
        `💳 طرق الدفع • Payments — <#${c.payments}>`,
        `🎫 للشراء • To buy — <#${c.ticketPanel}>`,
        '━━━━━━━━━━━━━━━━━━',
        '',
        `🎉 أنت العضو رقم **${member.guild.memberCount}** • Member **#${member.guild.memberCount}**`,
      ].join('\n'),
    )
    .setImage(a.url);
  await ch.send({ content: `${member}`, embeds: [e], files: [a.file] }).catch(() => {});
}

// تنظيف الرموز المنتهية
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k);
  for (const [k, t] of cooldown) if (t < now) cooldown.delete(k);
}, 300_000).unref();

module.exports = { start, enter, submit };
