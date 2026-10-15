// Anti-Nuke: أي شخص/بوت غير موثوق يسوي تخريب → يتعكس اللي سواه ويتبند فوراً
const {
  Events,
  AuditLogEvent: A,
  ChannelType,
  PermissionFlagsBits: F,
  PermissionsBitField,
  GuildVerificationLevel,
} = require('discord.js');
const config = require('../../config');
const db = require('../db');
const { embed, alert, isTrusted, sleep } = require('../util');

const DANGEROUS = [
  F.Administrator, F.ManageGuild, F.ManageRoles, F.ManageChannels, F.BanMembers, F.KickMembers,
  F.ManageWebhooks, F.MentionEveryone, F.ManageMessages, F.ModerateMembers, F.ManageGuildExpressions,
];
const hasDangerous = (bits) => {
  const p = new PermissionsBitField(BigInt(bits ?? 0));
  return DANGEROUS.some((d) => p.has(d, false));
};

const deletedChannels = new Map();
const deletedRoles = new Map();
const parentMap = new Map();
const punishing = new Set();
const actionCounter = new Map(); // للموثوقين غير الأونر: حد أقصى للحذف

// إذا حتى بوت موثوق حذف أكثر من 3 أشياء خلال 10 ثواني → يتعاقب
const TRUSTED_LIMIT = { count: 3, ms: 10_000 };

function trackParents(guild) {
  for (const c of guild.channels.cache.values()) parentMap.set(c.id, c.parentId);
}

async function punish(guild, userId, why) {
  if (punishing.has(userId) || userId === guild.ownerId || userId === guild.client.user.id) return;
  punishing.add(userId);
  setTimeout(() => punishing.delete(userId), 15_000);

  const member = await guild.members.fetch(userId).catch(() => null);
  let result;
  if (member && !member.bannable) {
    result = '⚠️ ما قدرت أعاقبه — رتبته أعلى من رتبة البوت! ارفع رتبة البوت لأعلى القائمة.';
  } else {
    if (member) {
      // نشيل كل رتبه قبل الباند عشان يوقف فوراً
      await member.roles.set(member.roles.cache.filter((r) => r.managed).map((r) => r.id)).catch(() => {});
    }
    db.data.whitelist = db.data.whitelist.filter((id) => id !== userId);
    db.save();
    result = await guild.members
      .ban(userId, { reason: `[Anti-Nuke] ${why}`, deleteMessageSeconds: 3600 })
      .then(() => '🔨 تم سحب رتبه وتبنيده نهائياً')
      .catch((e) => `⚠️ فشل الباند: ${e.message}`);
  }

  const e = embed(config.colors.danger)
    .setTitle('🚨 Anti-Nuke — محاولة تخريب')
    .addFields(
      { name: 'المنفذ', value: `<@${userId}> \`${userId}\``, inline: true },
      { name: 'العملية', value: why, inline: true },
      { name: 'الإجراء', value: result },
    );
  await alert(guild, e);
  const owner = await guild.fetchOwner().catch(() => null);
  await owner?.send({ embeds: [e] }).catch(() => {});
}

async function restoreChannel(guild, oldId) {
  await sleep(1200); // ننتظر حدث channelDelete يخزن النسخة
  const snap = deletedChannels.get(oldId);
  if (!snap) return null;
  deletedChannels.delete(oldId);

  const permissionOverwrites = snap.overwrites.filter((o) => guild.roles.cache.has(o.id) || guild.members.cache.has(o.id));
  const ch = await guild.channels
    .create({
      name: snap.name,
      type: snap.type,
      parent: snap.parentId && guild.channels.cache.has(snap.parentId) ? snap.parentId : undefined,
      topic: snap.topic ?? undefined,
      nsfw: snap.nsfw,
      rateLimitPerUser: snap.rateLimitPerUser ?? undefined,
      userLimit: snap.userLimit ?? undefined,
      permissionOverwrites,
      position: snap.position,
      reason: '[Anti-Nuke] استرجاع روم محذوف',
    })
    .catch(() => null);
  if (!ch) return null;

  // الكاتيقوري: نرجع الرومات اللي كانت فيه
  if (snap.type === ChannelType.GuildCategory) {
    for (const [cid, pid] of parentMap) {
      if (pid !== oldId) continue;
      await guild.channels.cache.get(cid)?.setParent(ch.id, { lockPermissions: false }).catch(() => {});
    }
  }

  const key = Object.keys(db.data.channels).find((k) => db.data.channels[k] === oldId);
  if (key) {
    db.data.channels[key] = ch.id;
    db.save();
    const { sendPanel, PANEL_KEYS } = require('../panels');
    if (PANEL_KEYS.includes(key)) await sendPanel(guild, key);
    if (key === 'products') await require('../store').repostAll(guild);
  }
  return ch;
}

async function restoreRole(guild, oldId) {
  await sleep(1200);
  const snap = deletedRoles.get(oldId);
  if (!snap) return null;
  deletedRoles.delete(oldId);

  const role = await guild.roles
    .create({
      name: snap.name,
      colors: { primaryColor: snap.color },
      hoist: snap.hoist,
      mentionable: snap.mentionable,
      permissions: snap.permissions,
      reason: '[Anti-Nuke] استرجاع رتبة محذوفة',
    })
    .catch(() => null);
  if (!role) return null;
  await role.setPosition(Math.max(1, Math.min(snap.position, guild.members.me.roles.highest.position - 1))).catch(() => {});

  const key = Object.keys(db.data.roles).find((k) => db.data.roles[k] === oldId);
  if (key) {
    db.data.roles[key] = role.id;
    db.save();
    // صلاحيات الرومات كانت مربوطة بالرتبة القديمة → نعيد تطبيقها
    await require('../setup').reapplyPermissions(guild);
    if (key === 'owner') await guild.members.cache.get(guild.ownerId)?.roles.add(role).catch(() => {});
    if (key === 'member') {
      for (const id of Object.keys(db.data.verified)) {
        const m = guild.members.cache.get(id);
        if (m && !m.user.bot) await m.roles.add(role).catch(() => {});
      }
    }
  }
  return role;
}

function overTrustedLimit(guild, userId) {
  if (userId === guild.ownerId || userId === guild.client.user.id) return false;
  const now = Date.now();
  const list = (actionCounter.get(userId) ?? []).filter((t) => now - t < TRUSTED_LIMIT.ms);
  list.push(now);
  actionCounter.set(userId, list);
  return list.length > TRUSTED_LIMIT.count;
}

const DESTRUCTIVE = new Set([A.ChannelDelete, A.RoleDelete, A.MemberBanAdd, A.MemberKick, A.MemberPrune, A.WebhookCreate, A.EmojiDelete]);

async function onAuditEntry(entry, guild) {
  const exec = entry.executorId;
  if (!exec) return;

  if (isTrusted(guild, exec)) {
    // حتى الموثوقين لهم حد — لو بوت موثوق انخترق
    if (DESTRUCTIVE.has(entry.action) && overTrustedLimit(guild, exec)) {
      await punish(guild, exec, 'تخريب جماعي (تجاوز الحد المسموح حتى للموثوقين)');
    } else return;
  }

  const t = entry.targetId;
  switch (entry.action) {
    case A.ChannelDelete:
      await punish(guild, exec, 'حذف روم');
      await restoreChannel(guild, t);
      break;
    case A.ChannelCreate:
      await punish(guild, exec, 'إنشاء روم');
      await guild.channels.cache.get(t)?.delete('[Anti-Nuke]').catch(() => {});
      break;
    case A.ChannelUpdate:
    case A.ChannelOverwriteCreate:
    case A.ChannelOverwriteUpdate:
    case A.ChannelOverwriteDelete:
      await punish(guild, exec, 'تعديل روم / صلاحياته');
      await require('../setup').reapplyPermissions(guild);
      break;
    case A.RoleCreate:
      await punish(guild, exec, 'إنشاء رتبة');
      await guild.roles.cache.get(t)?.delete('[Anti-Nuke]').catch(() => {});
      break;
    case A.RoleDelete:
      await punish(guild, exec, 'حذف رتبة');
      await restoreRole(guild, t);
      break;
    case A.RoleUpdate: {
      await punish(guild, exec, 'تعديل رتبة');
      const role = guild.roles.cache.get(t);
      for (const c of entry.changes ?? []) {
        if (!role) break;
        if (c.key === 'permissions') await role.setPermissions(BigInt(c.old), '[Anti-Nuke] revert').catch(() => {});
        if (c.key === 'name') await role.setName(c.old, '[Anti-Nuke] revert').catch(() => {});
      }
      break;
    }
    case A.MemberRoleUpdate: {
      const added = entry.changes?.find((c) => c.key === '$add')?.new ?? [];
      const bad = added.filter((r) => r.id === db.data.roles.owner || hasDangerous(guild.roles.cache.get(r.id)?.permissions.bitfield));
      if (!bad.length) break;
      await punish(guild, exec, 'إعطاء رتبة إدارية');
      const target = await guild.members.fetch(t).catch(() => null);
      if (target) {
        await target.roles.remove(bad.map((r) => r.id), '[Anti-Nuke] revert').catch(() => {});
        if (target.id !== guild.ownerId) await punish(guild, target.id, 'استلم رتبة إدارية من شخص غير موثوق');
      }
      break;
    }
    case A.MemberBanAdd:
      await punish(guild, exec, 'تبنيد أعضاء');
      await guild.members.unban(t, '[Anti-Nuke] revert').catch(() => {});
      break;
    case A.MemberKick:
      await punish(guild, exec, 'طرد أعضاء');
      break;
    case A.MemberPrune:
      await punish(guild, exec, 'Prune أعضاء');
      break;
    case A.WebhookCreate: {
      await punish(guild, exec, 'إنشاء Webhook');
      const hooks = await guild.fetchWebhooks().catch(() => null);
      await hooks?.get(t)?.delete('[Anti-Nuke]').catch(() => {});
      break;
    }
    case A.WebhookUpdate:
    case A.WebhookDelete:
      await punish(guild, exec, 'التلاعب بـ Webhook');
      break;
    case A.BotAdd:
      // الأونر هو الوحيد اللي يضيف بوتات
      await punish(guild, exec, 'إضافة بوت بدون إذن');
      await punish(guild, t, 'بوت مضاف بدون إذن الأونر');
      break;
    case A.IntegrationCreate:
      await punish(guild, exec, 'إضافة تكامل');
      break;
    case A.GuildUpdate: {
      await punish(guild, exec, 'تعديل إعدادات السيرفر');
      for (const c of entry.changes ?? []) {
        if (c.key === 'name') await guild.setName(config.serverName).catch(() => {});
        if (c.key === 'verification_level' && c.new < GuildVerificationLevel.High) {
          await guild.setVerificationLevel(GuildVerificationLevel.High).catch(() => {});
        }
      }
      break;
    }
    case A.EmojiDelete:
    case A.StickerDelete:
      await punish(guild, exec, 'حذف إيموجي/ستيكر');
      break;
    case A.AutoModerationRuleDelete:
    case A.AutoModerationRuleUpdate:
      await punish(guild, exec, 'تعطيل AutoMod');
      await require('../setup').setupAutoMod(guild);
      break;
    default:
      break;
  }
}

function register(client) {
  const mine = (g) => g && g.id === process.env.GUILD_ID;

  client.on(Events.ChannelCreate, (c) => mine(c.guild) && parentMap.set(c.id, c.parentId));
  client.on(Events.ChannelUpdate, (_, c) => mine(c.guild) && parentMap.set(c.id, c.parentId));

  client.on(Events.ChannelDelete, (c) => {
    if (!mine(c.guild)) return;
    // التذاكر ما نرجعها — بس ننظف بياناتها
    const meta = db.data.tickets.meta[c.id];
    if (meta) {
      delete db.data.tickets.meta[c.id];
      if (db.data.tickets.open[meta.userId] === c.id) delete db.data.tickets.open[meta.userId];
      db.save();
      return;
    }
    deletedChannels.set(c.id, {
      name: c.name,
      type: c.type,
      parentId: c.parentId,
      topic: c.topic,
      nsfw: c.nsfw,
      rateLimitPerUser: c.rateLimitPerUser,
      userLimit: c.userLimit,
      position: c.rawPosition,
      overwrites: c.permissionOverwrites.cache.map((o) => ({
        id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield,
      })),
    });
    setTimeout(() => deletedChannels.delete(c.id), 60_000);
  });

  client.on(Events.GuildRoleDelete, (r) => {
    if (!mine(r.guild)) return;
    deletedRoles.set(r.id, {
      name: r.name,
      color: r.colors?.primaryColor ?? r.color,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: r.permissions.bitfield,
      position: r.position,
    });
    setTimeout(() => deletedRoles.delete(r.id), 60_000);
  });

  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    if (!mine(guild)) return;
    onAuditEntry(entry, guild).catch((e) => console.error('[antinuke]', e));
  });
}

module.exports = { register, trackParents, punish };
