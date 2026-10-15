const {
  EmbedBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const path = require('path');
const config = require('../config');
const db = require('./db');

const ASSETS = path.join(__dirname, '..', 'assets');

function embed(color = config.color) {
  return new EmbedBuilder().setColor(color).setFooter({ text: config.serverName }).setTimestamp();
}

// صاحب السيرفر أو اللي معه رتبة الأونر
function isOwner(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  const ownerRole = db.data.roles.owner;
  return Boolean(ownerRole && member.roles?.cache?.has(ownerRole));
}

// موثوق عند الـ Anti-Nuke: صاحب السيرفر + البوت نفسه + القائمة البيضاء
function isTrusted(guild, userId) {
  return userId === guild.ownerId || userId === guild.client.user.id || db.data.whitelist.includes(userId);
}

function channel(guild, key) {
  const id = db.data.channels[key];
  return id ? guild.channels.cache.get(id) ?? null : null;
}

async function log(guild, key, emb, extra = {}) {
  const ch = channel(guild, key);
  if (!ch) return;
  await ch.send({ embeds: [emb], allowedMentions: { parse: [] }, ...extra }).catch(() => {});
}

// تنبيه أمني + منشن للأونر
async function alert(guild, emb, extra = {}) {
  const ch = channel(guild, 'logSecurity');
  if (!ch) return;
  await ch
    .send({ content: `<@${guild.ownerId}>`, embeds: [emb], allowedMentions: { users: [guild.ownerId] }, ...extra })
    .catch(() => {});
}

function cut(text, n = 1000) {
  const s = String(text ?? '').trim();
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n - 3)}...` : s;
}

const ts = (date, style = 'R') => `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function modal(customId, title, fields) {
  const m = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));
  for (const f of fields) {
    m.addLabelComponents(
      new LabelBuilder().setLabel(f.label.slice(0, 45)).setTextInputComponent((t) => {
        t.setCustomId(f.id)
          .setStyle(f.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(f.required ?? true);
        if (f.placeholder) t.setPlaceholder(f.placeholder.slice(0, 100));
        if (f.value) t.setValue(String(f.value).slice(0, f.max ?? 4000));
        if (f.max) t.setMaxLength(f.max);
        if (f.min) t.setMinLength(f.min);
        return t;
      }),
    );
  }
  return m;
}

function reply(interaction, content, color) {
  const payload = typeof content === 'string'
    ? { embeds: [embed(color).setDescription(content)] }
    : content;
  payload.flags = MessageFlags.Ephemeral;
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

const ok = (i, text) => reply(i, `✅ ${text}`, config.colors.success);
const fail = (i, text) => reply(i, `❌ ${text}`, config.colors.danger);

function getGuild(client) {
  return client.guilds.cache.get(process.env.GUILD_ID) ?? null;
}

module.exports = {
  ASSETS,
  embed,
  isOwner,
  isTrusted,
  channel,
  log,
  alert,
  cut,
  ts,
  sleep,
  modal,
  reply,
  ok,
  fail,
  getGuild,
};
