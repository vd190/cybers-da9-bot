// نظام السجلات الكامل
const { Events, AuditLogEvent, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const config = require('../config');
const db = require('./db');
const { embed, log, cut, ts } = require('./util');

const C = config.colors;

const ACTION_NAMES = {
  [AuditLogEvent.GuildUpdate]: '⚙️ تعديل إعدادات السيرفر',
  [AuditLogEvent.ChannelCreate]: '➕ إنشاء روم',
  [AuditLogEvent.ChannelUpdate]: '✏️ تعديل روم',
  [AuditLogEvent.ChannelDelete]: '🗑️ حذف روم',
  [AuditLogEvent.ChannelOverwriteCreate]: '🔐 إضافة صلاحية على روم',
  [AuditLogEvent.ChannelOverwriteUpdate]: '🔐 تعديل صلاحية روم',
  [AuditLogEvent.ChannelOverwriteDelete]: '🔐 حذف صلاحية روم',
  [AuditLogEvent.MemberKick]: '👢 طرد عضو',
  [AuditLogEvent.MemberPrune]: '🧹 تنظيف أعضاء (Prune)',
  [AuditLogEvent.MemberBanAdd]: '🔨 باند',
  [AuditLogEvent.MemberBanRemove]: '🔓 فك باند',
  [AuditLogEvent.MemberUpdate]: '✏️ تعديل عضو',
  [AuditLogEvent.MemberRoleUpdate]: '🎭 تعديل رتب عضو',
  [AuditLogEvent.MemberMove]: '🔀 نقل عضو صوتي',
  [AuditLogEvent.MemberDisconnect]: '📴 فصل عضو صوتي',
  [AuditLogEvent.BotAdd]: '🤖 إضافة بوت',
  [AuditLogEvent.RoleCreate]: '➕ إنشاء رتبة',
  [AuditLogEvent.RoleUpdate]: '✏️ تعديل رتبة',
  [AuditLogEvent.RoleDelete]: '🗑️ حذف رتبة',
  [AuditLogEvent.InviteCreate]: '🔗 إنشاء دعوة',
  [AuditLogEvent.InviteDelete]: '🔗 حذف دعوة',
  [AuditLogEvent.WebhookCreate]: '🪝 إنشاء Webhook',
  [AuditLogEvent.WebhookUpdate]: '🪝 تعديل Webhook',
  [AuditLogEvent.WebhookDelete]: '🪝 حذف Webhook',
  [AuditLogEvent.EmojiCreate]: '😀 إضافة إيموجي',
  [AuditLogEvent.EmojiDelete]: '😀 حذف إيموجي',
  [AuditLogEvent.StickerCreate]: '🏷️ إضافة ستيكر',
  [AuditLogEvent.StickerDelete]: '🏷️ حذف ستيكر',
  [AuditLogEvent.IntegrationCreate]: '🔌 إضافة تكامل',
  [AuditLogEvent.IntegrationDelete]: '🔌 حذف تكامل',
  [AuditLogEvent.AutoModerationRuleCreate]: '🛡️ إنشاء قاعدة AutoMod',
  [AuditLogEvent.AutoModerationRuleUpdate]: '🛡️ تعديل قاعدة AutoMod',
  [AuditLogEvent.AutoModerationRuleDelete]: '🛡️ حذف قاعدة AutoMod',
};

const MOD_ACTIONS = new Set([
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberPrune,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberBanRemove,
]);

// أحداث ما نسجلها في سجل السيرفر (تتسجل بمكان ثاني أو كثيرة جداً)
const SKIP_ACTIONS = new Set([
  AuditLogEvent.MessageDelete,
  AuditLogEvent.MessageBulkDelete,
  AuditLogEvent.MessagePin,
  AuditLogEvent.MessageUnpin,
  AuditLogEvent.AutoModerationBlockMessage,
  AuditLogEvent.AutoModerationFlagToChannel,
  AuditLogEvent.AutoModerationUserCommunicationDisabled,
]);

function fmtValue(key, value) {
  if (value === undefined || value === null) return '—';
  if (['permissions', 'allow', 'deny'].includes(key)) {
    try {
      const perms = new PermissionsBitField(BigInt(value)).toArray();
      return perms.length ? perms.join(', ') : 'لا شي';
    } catch {
      return String(value);
    }
  }
  if (key === '$add' || key === '$remove') return value.map((r) => `<@&${r.id}>`).join(' ');
  if (key === 'communication_disabled_until') return ts(value, 'F');
  if (typeof value === 'object') return '`' + cut(JSON.stringify(value), 200) + '`';
  return cut(String(value), 200);
}

function isLogChannel(channelId) {
  const d = db.data.channels;
  return Object.entries(d).some(([k, id]) => id === channelId && k.startsWith('log'));
}

function register(client) {
  const mine = (guild) => guild && guild.id === process.env.GUILD_ID;

  // ───── سجل التدقيق: كل شي صار في السيرفر + مين سواه ─────
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    if (!mine(guild) || SKIP_ACTIONS.has(entry.action)) return;

    const timeoutChange = entry.changes?.find((c) => c.key === 'communication_disabled_until');
    const isTimeout = entry.action === AuditLogEvent.MemberUpdate && timeoutChange;

    const title = isTimeout
      ? (timeoutChange.new ? '⏳ تايم أوت' : '⏳ فك تايم أوت')
      : ACTION_NAMES[entry.action] ?? `📝 ${AuditLogEvent[entry.action] ?? entry.action}`;

    const mention = { User: '<@%>', Role: '<@&%>', Channel: '<#%>', Thread: '<#%>' }[entry.targetType];
    const target = entry.targetId
      ? `${mention ? `${mention.replace('%', entry.targetId)} ` : ''}\`${entry.targetId}\``
      : '—';

    const e = embed(MOD_ACTIONS.has(entry.action) || isTimeout ? C.danger : C.info)
      .setTitle(title)
      .addFields(
        { name: 'المنفذ', value: entry.executorId ? `<@${entry.executorId}> \`${entry.executorId}\`` : '—', inline: true },
        { name: 'الهدف', value: target, inline: true },
      );
    if (entry.reason) e.addFields({ name: 'السبب', value: cut(entry.reason, 500) });

    const changes = (entry.changes ?? [])
      .slice(0, 8)
      .map((c) => {
        if (c.key === '$add') return `**+ رتب:** ${fmtValue('$add', c.new)}`;
        if (c.key === '$remove') return `**- رتب:** ${fmtValue('$remove', c.new)}`;
        return `**${c.key}:** ${fmtValue(c.key, c.old)} ➜ ${fmtValue(c.key, c.new)}`;
      });
    if (changes.length) e.addFields({ name: 'التغييرات', value: cut(changes.join('\n'), 1024) });

    const key = MOD_ACTIONS.has(entry.action) || isTimeout ? 'logMod' : 'logServer';
    await log(guild, key, e);
  });

  // ───── الرسائل ─────
  client.on(Events.MessageDelete, async (msg) => {
    if (!mine(msg.guild) || isLogChannel(msg.channelId)) return;
    if (msg.partial || !msg.author) {
      return log(msg.guild, 'logMessages', embed(C.danger).setTitle('🗑️ رسالة محذوفة (غير مخزنة)')
        .setDescription(`في <#${msg.channelId}> — \`${msg.id}\``));
    }
    if (msg.author.bot) return;
    const e = embed(C.danger)
      .setTitle('🗑️ رسالة محذوفة')
      .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
      .addFields(
        { name: 'العضو', value: `${msg.author} \`${msg.author.id}\``, inline: true },
        { name: 'الروم', value: `<#${msg.channelId}>`, inline: true },
        { name: 'المحتوى', value: cut(msg.content, 1024) },
      );
    if (msg.attachments.size) {
      e.addFields({ name: 'المرفقات', value: cut(msg.attachments.map((a) => a.url).join('\n'), 1024) });
    }
    await log(msg.guild, 'logMessages', e);
  });

  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (!mine(newMsg.guild) || isLogChannel(newMsg.channelId)) return;
    if (newMsg.partial) newMsg = await newMsg.fetch().catch(() => null);
    if (!newMsg || newMsg.author?.bot) return;
    if (oldMsg.partial || oldMsg.content === newMsg.content) return;
    const e = embed(C.warn)
      .setTitle('✏️ رسالة معدلة')
      .setAuthor({ name: newMsg.author.tag, iconURL: newMsg.author.displayAvatarURL() })
      .setDescription(`[اذهب للرسالة](${newMsg.url}) في <#${newMsg.channelId}>`)
      .addFields(
        { name: 'قبل', value: cut(oldMsg.content, 1024) },
        { name: 'بعد', value: cut(newMsg.content, 1024) },
      );
    await log(newMsg.guild, 'logMessages', e);
  });

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    if (!mine(channel.guild) || isLogChannel(channel.id)) return;
    const text = [...messages.values()]
      .reverse()
      .map((m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.tag ?? 'unknown'}: ${m.content ?? ''}`)
      .join('\n');
    const file = new AttachmentBuilder(Buffer.from(text || 'no cached content', 'utf8'), { name: 'bulk-delete.txt' });
    await log(channel.guild, 'logMessages',
      embed(C.danger).setTitle('🧹 حذف جماعي').setDescription(`انحذفت **${messages.size}** رسالة في ${channel}`),
      { files: [file] });
  });

  // ───── الأعضاء ─────
  client.on(Events.GuildMemberAdd, async (member) => {
    if (!mine(member.guild)) return;
    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    const e = embed(C.success)
      .setTitle(member.user.bot ? '🤖 دخول بوت' : '📥 عضو دخل')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'العضو', value: `${member} \`${member.id}\``, inline: true },
        { name: 'عمر الحساب', value: `${ts(member.user.createdAt, 'R')} (${ageDays} يوم)`, inline: true },
        { name: 'عدد الأعضاء', value: `${member.guild.memberCount}`, inline: true },
      );
    if (ageDays < 30) e.addFields({ name: '⚠️ تنبيه', value: 'حساب جديد' });
    await log(member.guild, 'logMembers', e);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    if (!mine(member.guild)) return;
    const roles = member.roles?.cache?.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(' ');
    const e = embed(C.danger)
      .setTitle('📤 عضو طلع')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'العضو', value: `${member.user.tag} \`${member.id}\``, inline: true },
        { name: 'دخل', value: member.joinedAt ? ts(member.joinedAt, 'R') : '—', inline: true },
        { name: 'الرتب', value: roles || '—' },
      );
    await log(member.guild, 'logMembers', e);
  });

  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    if (!mine(newM.guild) || oldM.partial) return;
    if (oldM.nickname !== newM.nickname) {
      await log(newM.guild, 'logMembers', embed(C.info).setTitle('🏷️ تغيير لقب')
        .addFields(
          { name: 'العضو', value: `${newM} \`${newM.id}\`` },
          { name: 'قبل', value: oldM.nickname ?? '—', inline: true },
          { name: 'بعد', value: newM.nickname ?? '—', inline: true },
        ));
    }
  });

  client.on(Events.UserUpdate, async (oldU, newU) => {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild || oldU.partial || !guild.members.cache.has(newU.id)) return;
    const changes = [];
    if (oldU.username !== newU.username) changes.push(`**اليوزر:** ${oldU.username} ➜ ${newU.username}`);
    if (oldU.globalName !== newU.globalName) changes.push(`**الاسم:** ${oldU.globalName ?? '—'} ➜ ${newU.globalName ?? '—'}`);
    if (oldU.avatar !== newU.avatar) changes.push('**تغيير الصورة**');
    if (!changes.length) return;
    await log(guild, 'logMembers', embed(C.info).setTitle('👤 تحديث حساب')
      .setThumbnail(newU.displayAvatarURL())
      .setDescription(`<@${newU.id}> \`${newU.id}\`\n${changes.join('\n')}`));
  });

  // ───── الصوت ─────
  client.on(Events.VoiceStateUpdate, async (oldS, newS) => {
    if (!mine(newS.guild)) return;
    const member = newS.member ?? oldS.member;
    if (!member || member.user.bot) return;
    let text;
    if (!oldS.channelId && newS.channelId) text = `🟢 ${member} دخل <#${newS.channelId}>`;
    else if (oldS.channelId && !newS.channelId) text = `🔴 ${member} طلع من <#${oldS.channelId}>`;
    else if (oldS.channelId !== newS.channelId) text = `🔀 ${member} انتقل من <#${oldS.channelId}> إلى <#${newS.channelId}>`;
    else if (oldS.serverMute !== newS.serverMute) text = `🔇 ${member} ${newS.serverMute ? 'انكتم' : 'انفك كتمه'} من السيرفر`;
    else if (oldS.serverDeaf !== newS.serverDeaf) text = `🔈 ${member} ${newS.serverDeaf ? 'انقطع صوته' : 'رجع صوته'} من السيرفر`;
    if (!text) return;
    await log(newS.guild, 'logVoice', embed(C.info).setDescription(text));
  });
}

module.exports = { register };
