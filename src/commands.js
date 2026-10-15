// أوامر السلاش + تنفيذها
const {
  SlashCommandBuilder,
  PermissionFlagsBits: F,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  InteractionContextType,
} = require('discord.js');
const config = require('../config');
const db = require('./db');
const { embed, ok, fail, reply, modal, log, channel, isOwner, cut, ts } = require('./util');
const { addWarn } = require('./protection/warns');
const { setRaidMode } = require('./protection/antiraid');
const { MEMBER_PERMS } = require('./setup');
const { sendAllPanels, RESENDABLE } = require('./panels');
const store = require('./store');

const ADMIN = F.Administrator;

const definitions = [
  new SlashCommandBuilder().setName('setup').setDescription('بناء السيرفر كامل: الرتب، الرومات، الحماية، القوانين')
    .addBooleanOption((o) => o.setName('reset').setDescription('حذف كل الرومات والرتب الحالية أولاً (للسيرفر الجديد)').setRequired(true))
    .setDefaultMemberPermissions(ADMIN),
  new SlashCommandBuilder().setName('panels').setDescription('إعادة إرسال القوانين والتحقق والتذاكر وطرق الدفع')
    .setDefaultMemberPermissions(ADMIN),
  new SlashCommandBuilder().setName('product').setDescription('إدارة منتجات المتجر').setDefaultMemberPermissions(ADMIN)
    .addSubcommand((s) => s.setName('add').setDescription('إضافة منتج')
      .addStringOption((o) => o.setName('name').setDescription('اسم المنتج').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('price').setDescription('السعر (مثال: 25 ر.س)').setRequired(true).setMaxLength(50))
      .addStringOption((o) => o.setName('description').setDescription('الوصف — استخدم | لسطر جديد').setRequired(true))
      .addAttachmentOption((o) => o.setName('image').setDescription('صورة المنتج (اختياري)')))
    .addSubcommand((s) => s.setName('edit').setDescription('تعديل منتج')
      .addStringOption((o) => o.setName('id').setDescription('رقم المنتج').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('الاسم الجديد').setMaxLength(100))
      .addStringOption((o) => o.setName('price').setDescription('السعر الجديد').setMaxLength(50))
      .addStringOption((o) => o.setName('description').setDescription('الوصف الجديد')))
    .addSubcommand((s) => s.setName('status').setDescription('متوفر / نفذت الكمية')
      .addStringOption((o) => o.setName('id').setDescription('رقم المنتج').setRequired(true))
      .addBooleanOption((o) => o.setName('available').setDescription('متوفر؟').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('حذف منتج')
      .addStringOption((o) => o.setName('id').setDescription('رقم المنتج').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('قائمة المنتجات')),
  new SlashCommandBuilder().setName('announce').setDescription('إرسال إعلان').setDefaultMemberPermissions(ADMIN)
    .addChannelOption((o) => o.setName('channel').setDescription('الروم (افتراضي: الإعلانات)').addChannelTypes(ChannelType.GuildText))
    .addBooleanOption((o) => o.setName('everyone').setDescription('منشن @everyone؟'))
    .addAttachmentOption((o) => o.setName('image').setDescription('صورة (اختياري)')),
  new SlashCommandBuilder().setName('ban').setDescription('تبنيد عضو').setDefaultMemberPermissions(ADMIN)
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('السبب'))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('حذف رسائله لآخر كم يوم (0-7)').setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder().setName('unban').setDescription('فك باند').setDefaultMemberPermissions(ADMIN)
    .addStringOption((o) => o.setName('user_id').setDescription('آيدي الشخص').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('طرد عضو').setDefaultMemberPermissions(ADMIN)
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('السبب')),
  new SlashCommandBuilder().setName('timeout').setDescription('تايم أوت لعضو').setDefaultMemberPermissions(ADMIN)
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('المدة بالدقايق').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName('reason').setDescription('السبب')),
  new SlashCommandBuilder().setName('untimeout').setDescription('فك التايم أوت').setDefaultMemberPermissions(ADMIN)
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('warn').setDescription('تحذير عضو').setDefaultMemberPermissions(ADMIN)
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('السبب').setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('عرض تحذيرات عضو').setDefaultMemberPermissions(ADMIN)
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarns').setDescription('مسح تحذيرات عضو').setDefaultMemberPermissions(ADMIN)
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('حذف رسائل').setDefaultMemberPermissions(ADMIN)
    .addIntegerOption((o) => o.setName('amount').setDescription('العدد (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('user').setDescription('رسائل عضو معين فقط')),
  new SlashCommandBuilder().setName('lock').setDescription('قفل الروم الحالي').setDefaultMemberPermissions(ADMIN),
  new SlashCommandBuilder().setName('unlock').setDescription('فتح الروم الحالي').setDefaultMemberPermissions(ADMIN),
  new SlashCommandBuilder().setName('slowmode').setDescription('السلو مود للروم الحالي').setDefaultMemberPermissions(ADMIN)
    .addIntegerOption((o) => o.setName('seconds').setDescription('بالثواني (0 = إيقاف)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('lockdown').setDescription('🚨 قفل السيرفر كامل (الكتابة والصوت)').setDefaultMemberPermissions(ADMIN),
  new SlashCommandBuilder().setName('unlockdown').setDescription('فك قفل السيرفر').setDefaultMemberPermissions(ADMIN),
  new SlashCommandBuilder().setName('raidmode').setDescription('تشغيل/إيقاف وضع الحماية من الرايد').setDefaultMemberPermissions(ADMIN)
    .addBooleanOption((o) => o.setName('enabled').setDescription('تشغيل؟').setRequired(true)),
  new SlashCommandBuilder().setName('whitelist').setDescription('القائمة البيضاء للـ Anti-Nuke (بوتات/أشخاص موثوقين)').setDefaultMemberPermissions(ADMIN)
    .addSubcommand((s) => s.setName('add').setDescription('إضافة (قبل إضافة البوت للسيرفر)').addStringOption((o) => o.setName('id').setDescription('آيدي البوت/الشخص أو منشن').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('إزالة').addStringOption((o) => o.setName('id').setDescription('آيدي البوت/الشخص أو منشن').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('عرض القائمة')),
  new SlashCommandBuilder().setName('stats').setDescription('إحصائيات المتجر').setDefaultMemberPermissions(ADMIN),
  new SlashCommandBuilder().setName('help').setDescription('معلومات عن المتجر وطريقة الشراء').setDefaultMemberPermissions(ADMIN),
].map((c) => c.setContexts(InteractionContextType.Guild).toJSON());

const announceDrafts = new Map();

const handlers = {
  async setup(i) {
    if (i.user.id !== i.guild.ownerId) return fail(i, 'هذا الأمر لصاحب السيرفر فقط.');
    const reset = i.options.getBoolean('reset');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`setup:confirm:${reset ? 1 : 0}`).setLabel('ابدأ التجهيز').setEmoji('🚀').setStyle(ButtonStyle.Danger),
    );
    return reply(i, {
      embeds: [
        embed(config.colors.warn).setTitle('⚠️ تأكيد التجهيز').setDescription(
          reset
            ? '**بيتم حذف كل الرومات والرتب الموجودة** وبناء السيرفر من جديد.\nالتقدم بيوصلك بالخاص.'
            : 'بيتم إنشاء/تحديث الرومات والرتب الناقصة بدون حذف شي.',
        ),
      ],
      components: [row],
    });
  },

  async panels(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await sendAllPanels(i.guild, RESENDABLE, { clear: true });
    return i.editReply('✅ تم إعادة إرسال الرسائل الثابتة.');
  },

  product: (i) => store.handle(i),

  async announce(i) {
    const ch = i.options.getChannel('channel') ?? channel(i.guild, 'announcements');
    if (!ch) return fail(i, 'ما لقيت روم الإعلانات.');
    announceDrafts.set(i.user.id, {
      channelId: ch.id,
      everyone: i.options.getBoolean('everyone') ?? false,
      image: i.options.getAttachment('image'),
    });
    return i.showModal(modal('announce:submit', 'إعلان جديد', [
      { id: 'title', label: 'العنوان', max: 256 },
      { id: 'body', label: 'المحتوى', paragraph: true, max: 4000 },
    ]));
  },

  async ban(i) {
    const user = i.options.getUser('user');
    const reason = i.options.getString('reason') ?? 'بدون سبب';
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    if (member && (!member.bannable || isOwner(member))) return fail(i, 'ما أقدر أبند هذا الشخص.');
    await user.send({ embeds: [embed(config.colors.danger).setDescription(`🔨 تبندت من **${config.serverName}**\n**السبب:** ${reason}`)] }).catch(() => {});
    await i.guild.members.ban(user.id, {
      reason: `${i.user.tag}: ${reason}`,
      deleteMessageSeconds: (i.options.getInteger('delete_days') ?? 0) * 86400,
    });
    return ok(i, `تم تبنيد ${user.tag}`);
  },

  async unban(i) {
    const id = i.options.getString('user_id').replace(/\D/g, '');
    const done = await i.guild.members.unban(id, `${i.user.tag}`).then(() => true).catch(() => false);
    return done ? ok(i, `تم فك الباند عن \`${id}\``) : fail(i, 'هذا الآيدي مو مبند أو غلط.');
  },

  async kick(i) {
    const member = i.options.getMember('user');
    const reason = i.options.getString('reason') ?? 'بدون سبب';
    if (!member?.kickable || isOwner(member)) return fail(i, 'ما أقدر أطرد هذا الشخص.');
    await member.send({ embeds: [embed(config.colors.danger).setDescription(`👢 انطردت من **${config.serverName}**\n**السبب:** ${reason}`)] }).catch(() => {});
    await member.kick(`${i.user.tag}: ${reason}`);
    return ok(i, `تم طرد ${member.user.tag}`);
  },

  async timeout(i) {
    const member = i.options.getMember('user');
    const minutes = i.options.getInteger('minutes');
    const reason = i.options.getString('reason') ?? 'بدون سبب';
    if (!member?.moderatable || isOwner(member)) return fail(i, 'ما أقدر أعطيه تايم أوت.');
    await member.timeout(minutes * 60_000, `${i.user.tag}: ${reason}`);
    return ok(i, `${member} تايم أوت ${minutes} دقيقة`);
  },

  async untimeout(i) {
    const member = i.options.getMember('user');
    if (!member?.moderatable) return fail(i, 'ما أقدر.');
    await member.timeout(null, i.user.tag);
    return ok(i, `تم فك التايم أوت عن ${member}`);
  },

  async warn(i) {
    const user = i.options.getUser('user');
    const reason = i.options.getString('reason');
    const count = await addWarn(i.guild, user.id, reason, i.user.id);
    await user.send({ embeds: [embed(config.colors.warn).setDescription(`⚠️ تحذير من **${config.serverName}** (${count}/${config.protection.warnLimit})\n**السبب:** ${reason}`)] }).catch(() => {});
    return ok(i, `تم تحذير ${user} — عنده **${count}** تحذيرات`);
  },

  async warnings(i) {
    const user = i.options.getUser('user');
    const list = db.data.warns[user.id] ?? [];
    if (!list.length) return reply(i, `${user} ما عنده تحذيرات ✅`);
    return reply(i, {
      embeds: [
        embed(config.colors.warn).setTitle(`⚠️ تحذيرات ${user.username} (${list.length})`).setDescription(
          cut(list.map((w, n) => `\`${n + 1}\` ${w.reason} — <@${w.by}> ${ts(w.at)}`).join('\n'), 4000),
        ),
      ],
    });
  },

  async clearwarns(i) {
    const user = i.options.getUser('user');
    delete db.data.warns[user.id];
    db.save();
    await log(i.guild, 'logMod', embed(config.colors.success).setDescription(`🧽 ${i.user} مسح تحذيرات ${user}`));
    return ok(i, `تم مسح تحذيرات ${user}`);
  },

  async clear(i) {
    const amount = i.options.getInteger('amount');
    const user = i.options.getUser('user');
    let msgs = await i.channel.messages.fetch({ limit: 100 });
    if (user) msgs = msgs.filter((m) => m.author.id === user.id);
    const deleted = await i.channel.bulkDelete([...msgs.values()].slice(0, amount), true);
    return ok(i, `انحذفت **${deleted.size}** رسالة`);
  },

  async lock(i) {
    await i.channel.permissionOverwrites.edit(db.data.roles.member, { SendMessages: false, AddReactions: false }, { reason: i.user.tag });
    await i.channel.send({ embeds: [embed(config.colors.danger).setDescription('🔒 تم قفل الروم')] });
    return ok(i, 'تم القفل');
  },

  async unlock(i) {
    await i.channel.permissionOverwrites.edit(db.data.roles.member, { SendMessages: null, AddReactions: null }, { reason: i.user.tag });
    await i.channel.send({ embeds: [embed(config.colors.success).setDescription('🔓 تم فتح الروم')] });
    return ok(i, 'تم الفتح');
  },

  async slowmode(i) {
    const s = i.options.getInteger('seconds');
    await i.channel.setRateLimitPerUser(s, i.user.tag);
    return ok(i, s ? `السلو مود صار ${s} ثانية` : 'تم إيقاف السلو مود');
  },

  async lockdown(i) {
    const role = i.guild.roles.cache.get(db.data.roles.member);
    if (!role) return fail(i, 'رتبة العضو غير موجودة.');
    const locked = MEMBER_PERMS.filter((p) => ![F.SendMessages, F.AddReactions, F.Connect, F.Speak, F.CreateInstantInvite].includes(p));
    await role.setPermissions(locked, `Lockdown by ${i.user.tag}`);
    db.data.lockdown = true;
    db.save();
    await channel(i.guild, 'announcements')?.send({
      embeds: [embed(config.colors.danger).setTitle('🚨 السيرفر مقفل مؤقتاً').setDescription('الكتابة متوقفة مؤقتاً لأسباب أمنية. التذاكر شغالة عادي.')],
    });
    await log(i.guild, 'logSecurity', embed(config.colors.danger).setDescription(`🚨 ${i.user} قفل السيرفر (Lockdown)`));
    return ok(i, 'تم قفل السيرفر كامل 🔒');
  },

  async unlockdown(i) {
    const role = i.guild.roles.cache.get(db.data.roles.member);
    if (!role) return fail(i, 'رتبة العضو غير موجودة.');
    await role.setPermissions(MEMBER_PERMS, `Unlockdown by ${i.user.tag}`);
    db.data.lockdown = false;
    db.save();
    await channel(i.guild, 'announcements')?.send({
      embeds: [embed(config.colors.success).setTitle('✅ رجع السيرفر طبيعي').setDescription('تقدرون تكتبون الحين.')],
    });
    await log(i.guild, 'logSecurity', embed(config.colors.success).setDescription(`🔓 ${i.user} فك قفل السيرفر`));
    return ok(i, 'تم فك قفل السيرفر 🔓');
  },

  async raidmode(i) {
    const on = i.options.getBoolean('enabled');
    await setRaidMode(i.guild, on, `يدوي بواسطة ${i.user.tag}`);
    return ok(i, on ? 'وضع الرايد شغال 🚨' : 'وضع الرايد متوقف ✅');
  },

  async whitelist(i) {
    if (i.user.id !== i.guild.ownerId) return fail(i, 'القائمة البيضاء لصاحب السيرفر فقط.');
    const sub = i.options.getSubcommand();
    if (sub === 'list') {
      const list = db.data.whitelist;
      return reply(i, list.length ? list.map((id) => `• <@${id}> \`${id}\``).join('\n') : 'القائمة فاضية — بس أنت والبوت موثوقين.');
    }
    const id = i.options.getString('id').replace(/\D/g, '');
    if (!/^\d{17,20}$/.test(id)) return fail(i, 'الآيدي غلط.');
    const user = await i.client.users.fetch(id).catch(() => null);
    if (!user) return fail(i, 'ما لقيت حساب بهذا الآيدي.');
    if (sub === 'add') {
      if (!db.data.whitelist.includes(user.id)) db.data.whitelist.push(user.id);
    } else {
      db.data.whitelist = db.data.whitelist.filter((x) => x !== user.id);
    }
    db.save();
    await log(i.guild, 'logSecurity', embed(config.colors.info).setDescription(`🛡️ ${i.user} ${sub === 'add' ? 'أضاف' : 'شال'} ${user} ${sub === 'add' ? 'إلى' : 'من'} القائمة البيضاء`));
    return ok(i, `${user} ${sub === 'add' ? 'انضاف للقائمة البيضاء' : 'انشال من القائمة البيضاء'}`);
  },

  async stats(i) {
    const { reviews, ratingSum } = db.data.stats;
    const avg = reviews ? (ratingSum / reviews).toFixed(1) : '—';
    const products = Object.values(db.data.products.items);
    return reply(i, {
      embeds: [
        embed().setTitle(`📊 إحصائيات ${config.serverName}`).addFields(
          { name: '👥 الأعضاء', value: `${i.guild.memberCount}`, inline: true },
          { name: '✅ المتحققين', value: `${Object.keys(db.data.verified).length}`, inline: true },
          { name: '🛍️ المنتجات', value: `${products.length} (${products.filter((p) => p.available).length} متوفر)`, inline: true },
          { name: '📦 الطلبات المكتملة', value: `${db.data.orders.counter}`, inline: true },
          { name: '🎫 التذاكر', value: `${db.data.tickets.counter} (${Object.keys(db.data.tickets.meta).length} مفتوحة)`, inline: true },
          { name: '⭐ التقييم', value: `${avg} من 5 (${reviews} تقييم)`, inline: true },
          { name: '🛡️ وضع الرايد', value: db.data.raid.active ? '🚨 شغال' : 'متوقف', inline: true },
          { name: '🔒 Lockdown', value: db.data.lockdown ? '🚨 شغال' : 'متوقف', inline: true },
        ),
      ],
    });
  },

  async help(i) {
    const c = db.data.channels;
    return reply(i, {
      embeds: [
        embed().setTitle(`🛒 ${config.serverName}`).setDescription(
          [
            `🛍️ المنتجات: <#${c.products}>`,
            `📖 طريقة الشراء: <#${c.howto}>`,
            `💳 طرق الدفع: <#${c.payments}>`,
            `🎫 فتح تذكرة: <#${c.ticketPanel}>`,
            `⭐ التقييمات: <#${c.reviews}>`,
            `📜 القوانين: <#${c.rules}>`,
            '',
            '⚠️ الإدارة ما تراسلك خاص أولاً أبداً.',
          ].join('\n'),
        ),
      ],
    });
  },
};


async function execute(i) {
  const handler = handlers[i.commandName];
  if (!handler) return;
  // البوت يسمع أوامر صاحب السيرفر فقط
  if (i.user.id !== i.guild.ownerId) return fail(i, 'هذا البوت يسمع أوامر صاحب السيرفر فقط.');
  return handler(i);
}

async function announceSubmit(i) {
  const draft = announceDrafts.get(i.user.id);
  announceDrafts.delete(i.user.id);
  if (!draft) return fail(i, 'انتهت الجلسة، أعد الأمر.');
  const ch = i.guild.channels.cache.get(draft.channelId);
  if (!ch) return fail(i, 'الروم غير موجود.');

  const e = embed()
    .setTitle(i.fields.getTextInputValue('title'))
    .setDescription(i.fields.getTextInputValue('body'))
    .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
  const files = [];
  if (draft.image?.contentType?.startsWith('image/')) {
    const ext = (draft.image.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '');
    const buf = Buffer.from(await (await fetch(draft.image.url)).arrayBuffer());
    files.push(new AttachmentBuilder(buf, { name: `announce.${ext}` }));
    e.setImage(`attachment://announce.${ext}`);
  }
  await ch.send({
    content: draft.everyone ? '@everyone' : undefined,
    embeds: [e],
    files,
    allowedMentions: { parse: draft.everyone ? ['everyone'] : [] },
  });
  return ok(i, `انرسل الإعلان في ${ch}`);
}

module.exports = { definitions, execute, announceSubmit };
