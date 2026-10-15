// بناء السيرفر كامل: الإعدادات، الرتب، الرومات، الصلاحيات، AutoMod، الرسائل الثابتة
const {
  ChannelType,
  PermissionFlagsBits: F,
  GuildVerificationLevel,
  GuildExplicitContentFilter,
  GuildDefaultMessageNotifications,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
} = require('discord.js');
const path = require('path');
const config = require('../config');
const db = require('./db');
const { ASSETS, sleep } = require('./util');
const { sendPanel, PANEL_KEYS, RESENDABLE } = require('./panels');

const LAYOUT = [
  {
    key: 'catStats', name: '📊 ・ الإحصائيات', mode: 'stats',
    channels: [{ key: 'memberCount', name: '👥・الأعضاء: 0', type: 'voice', mode: 'stats' }],
  },
  {
    key: 'catInfo', name: '📌 ・ المعلومات', mode: 'public',
    channels: [
      { key: 'rules', name: '📜・القوانين', mode: 'public', topic: 'قوانين السيرفر — اقرأها قبل أي شي' },
      { key: 'verify', name: '🛡️・التحقق', mode: 'verify', topic: 'اضغط زر التحقق عشان تنفتح لك الرومات' },
      { key: 'announcements', name: '📢・الإعلانات', mode: 'member-ro', reactions: true, topic: 'كل جديد المتجر' },
      { key: 'welcome', name: '👋・الترحيب', mode: 'member-ro' },
    ],
  },
  {
    key: 'catStore', name: '🛒 ・ المتجر', mode: 'member',
    channels: [
      { key: 'products', name: '🛍️・المنتجات', mode: 'member-ro', topic: 'اضغط 🛒 شراء تحت أي منتج' },
      { key: 'payments', name: '💳・طرق-الدفع', mode: 'member-ro' },
      { key: 'howto', name: '📖・طريقة-الشراء', mode: 'member-ro' },
      { key: 'ticketPanel', name: '🎫・فتح-تذكرة', mode: 'member-ro', topic: 'افتح تذكرة للشراء أو الدعم' },
      { key: 'reviews', name: '⭐・التقييمات', mode: 'member-ro', reactions: true, topic: 'تقييمات العملاء الحقيقية' },
    ],
  },
  {
    key: 'catCommunity', name: '💬 ・ العام', mode: 'member',
    channels: [
      { key: 'chat', name: '💬・الشات', mode: 'member', slowmode: 3, topic: 'الشات العام — التزم بالقوانين' },
      { key: 'commands', name: '🤖・الأوامر', mode: 'member' },
      { key: 'voice1', name: '🔊・الصوتي', type: 'voice', mode: 'voice' },
      { key: 'voice2', name: '🔊・الصوتي-2', type: 'voice', mode: 'voice' },
    ],
  },
  { key: 'ticketsCategory', name: '🎫 ・ التذاكر', mode: 'owner', channels: [] },
  {
    key: 'catStaff', name: '🔒 ・ الإدارة', mode: 'owner',
    channels: [
      { key: 'staff', name: '🔒・الإدارة', mode: 'owner' },
      { key: 'notes', name: '🗒️・ملاحظات', mode: 'owner' },
    ],
  },
  {
    key: 'catLogs', name: '📁 ・ السجلات', mode: 'owner',
    channels: [
      { key: 'logSecurity', name: '🚨・سجل-الحماية', mode: 'owner', topic: 'Anti-Nuke / Anti-Raid / Anti-Spam / AutoMod' },
      { key: 'logMod', name: '🔨・سجل-العقوبات', mode: 'owner' },
      { key: 'logMessages', name: '💬・سجل-الرسائل', mode: 'owner' },
      { key: 'logMembers', name: '👥・سجل-الأعضاء', mode: 'owner' },
      { key: 'logServer', name: '⚙️・سجل-السيرفر', mode: 'owner' },
      { key: 'logVoice', name: '🔊・سجل-الصوت', mode: 'owner' },
      { key: 'logTickets', name: '🎫・سجل-التذاكر', mode: 'owner' },
      { key: 'logOrders', name: '📦・سجل-الطلبات', mode: 'owner' },
    ],
  },
];

const NO_WRITE = [F.SendMessages, F.SendMessagesInThreads, F.CreatePublicThreads, F.CreatePrivateThreads];

const MEMBER_PERMS = [
  F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.AddReactions, F.UseExternalEmojis,
  F.UseExternalStickers, F.UseApplicationCommands, F.Connect, F.Speak, F.UseVAD, F.Stream,
  F.CreateInstantInvite,
];

function overwrites(guild, mode, { reactions = false } = {}) {
  const E = guild.roles.everyone.id;
  const M = db.data.roles.member;
  const ro = reactions ? NO_WRITE : [...NO_WRITE, F.AddReactions];
  switch (mode) {
    case 'public':
      return [{ id: E, allow: [F.ViewChannel, F.ReadMessageHistory], deny: ro }];
    case 'verify':
      return [
        { id: E, allow: [F.ViewChannel, F.ReadMessageHistory], deny: [...NO_WRITE, F.AddReactions] },
        { id: M, deny: [F.ViewChannel] },
      ];
    case 'member-ro':
      return [{ id: E, deny: [F.ViewChannel] }, { id: M, allow: [F.ViewChannel, F.ReadMessageHistory], deny: ro }];
    case 'member':
      return [{ id: E, deny: [F.ViewChannel] }, { id: M, allow: [F.ViewChannel] }];
    case 'voice':
      return [{ id: E, deny: [F.ViewChannel, F.Connect] }, { id: M, allow: [F.ViewChannel, F.Connect, F.Speak] }];
    case 'stats':
      return [{ id: E, allow: [F.ViewChannel], deny: [F.Connect] }];
    case 'owner':
    default:
      return [{ id: E, deny: [F.ViewChannel] }];
  }
}

async function ensureRole(guild, key, data) {
  let role = guild.roles.cache.get(db.data.roles[key])
    ?? guild.roles.cache.find((r) => r.name === data.name && !r.managed);
  if (role) role = await role.edit(data);
  else role = await guild.roles.create(data);
  db.data.roles[key] = role.id;
  db.save();
  return role;
}

async function ensureChannel(guild, def, parentId, created = new Set()) {
  const isCategory = def.channels !== undefined;
  const type = isCategory ? ChannelType.GuildCategory
    : def.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
  const permissionOverwrites = overwrites(guild, def.mode, def);
  const existing = guild.channels.cache.get(db.data.channels[def.key]);
  let ch;
  if (existing && existing.type === type) {
    ch = await existing.edit({ name: def.name, parent: parentId ?? null, permissionOverwrites, lockPermissions: false });
  } else {
    created.add(def.key);
    ch = await guild.channels.create({
      name: def.name,
      type,
      parent: parentId ?? undefined,
      topic: type === ChannelType.GuildText ? def.topic : undefined,
      rateLimitPerUser: def.slowmode,
      permissionOverwrites,
      reason: 'Cybers DA9 setup',
    });
  }
  db.data.channels[def.key] = ch.id;
  db.save();
  return ch;
}

async function setupAutoMod(guild) {
  const exemptRoles = [db.data.roles.owner].filter(Boolean);
  const alertChannel = db.data.channels.logSecurity;
  const block = (msg) => ({ type: AutoModerationActionType.BlockMessage, metadata: { customMessage: msg } });
  const alert = { type: AutoModerationActionType.SendAlertMessage, metadata: { channel: alertChannel } };
  const timeout = (s) => ({ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: s } });

  // احذف قواعدنا القديمة عشان ما تتكرر
  const existing = await guild.autoModerationRules.fetch().catch(() => null);
  if (existing) {
    for (const r of existing.values()) if (r.name.startsWith('CDA9')) await r.delete().catch(() => {});
  }

  const rules = [
    {
      name: 'CDA9 • Anti-Spam',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      actions: [block('رسالتك انحذفت: مشبوهة كسبام'), alert],
    },
    {
      name: 'CDA9 • Mention Spam',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: 5, mentionRaidProtectionEnabled: true },
      actions: [block('ممنوع المنشن الجماعي'), alert, timeout(3600)],
    },
    {
      name: 'CDA9 • Bad Content',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.KeywordPreset,
      triggerMetadata: {
        presets: [
          AutoModerationRuleKeywordPresetType.Profanity,
          AutoModerationRuleKeywordPresetType.SexualContent,
          AutoModerationRuleKeywordPresetType.Slurs,
        ],
      },
      actions: [block('رسالتك فيها كلام ممنوع'), alert],
    },
    {
      name: 'CDA9 • Invites & Scams',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: [
          'free nitro', 'nitro free', 'nitro for free', 'free steam', 'steam gift',
          '*dlscord*', '*disc0rd*', '*discorcl*', '*dicsord*', '*discrod*', '*discordgift*',
          '*steamcommunlty*', '*stearncommunity*', '*steancommunity*', '*steamcomunity*',
          '*grabify*', '*iplogger*', '*2no.co*', '*blasze*',
        ],
        regexPatterns: [
          '(?:discord(?:app)?\\.com/invite|discord\\.(?:gg|io|me|li)|dsc\\.gg|invite\\.gg)/\\S+',
        ],
      },
      actions: [block('ممنوع روابط الدعوات أو الروابط المشبوهة'), alert, timeout(600)],
    },
  ];

  if (config.protection.badWords.length) {
    rules.push({
      name: 'CDA9 • Custom Words',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: config.protection.badWords.slice(0, 1000) },
      actions: [block('رسالتك فيها كلمة ممنوعة'), alert],
    });
  }

  let made = 0;
  for (const r of rules) {
    try {
      await guild.autoModerationRules.create({ ...r, enabled: true, exemptRoles, reason: 'Cybers DA9 setup' });
      made++;
    } catch (e) {
      console.error(`[automod] ${r.name}:`, e.message);
    }
  }
  return made;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {{ reset: boolean, progress?: (msg: string) => void }} opts
 */
async function runSetup(guild, { reset, progress = () => {} }) {
  const me = guild.members.me;
  const report = [];
  const step = (msg) => {
    console.log(`[setup] ${msg}`);
    report.push(msg);
    progress(msg);
  };

  // 1) تنظيف السيرفر
  if (reset) {
    step('🧹 حذف الرومات والرتب القديمة');
    await guild.channels.fetch();
    for (const c of [...guild.channels.cache.values()]) await c.delete('Cybers DA9 reset').catch(() => {});
    for (const r of [...guild.roles.cache.values()]) {
      if (r.id === guild.id || r.managed || r.position >= me.roles.highest.position) continue;
      await r.delete('Cybers DA9 reset').catch(() => {});
    }
    db.data.channels = {};
    db.data.roles = {};
    db.data.tickets.open = {};
    db.data.tickets.meta = {};
    db.save();
  }

  // 2) إعدادات السيرفر
  step('⚙️ اسم السيرفر + الصورة + مستوى الحماية');
  await guild
    .edit({
      name: config.serverName,
      icon: path.join(ASSETS, 'icon.png'),
      verificationLevel: GuildVerificationLevel.High,
      explicitContentFilter: GuildExplicitContentFilter.AllMembers,
      defaultMessageNotifications: GuildDefaultMessageNotifications.OnlyMentions,
      systemChannel: null,
      reason: 'Cybers DA9 setup',
    })
    .catch((e) => step(`⚠️ إعدادات السيرفر: ${e.message}`));
  await guild.setBanner(path.join(ASSETS, 'banner.png')).catch(() => {}); // يحتاج بوست لفل 2

  // 3) الرتب
  step('🎭 الرتب (Owner + Member)');
  await guild.roles.everyone.setPermissions([F.ViewChannel, F.ReadMessageHistory], 'Cybers DA9 setup');
  const ownerRole = await ensureRole(guild, 'owner', {
    name: config.roles.owner.name,
    colors: { primaryColor: config.roles.owner.color },
    hoist: true,
    permissions: [F.Administrator],
    reason: 'Cybers DA9 setup',
  });
  await ensureRole(guild, 'member', {
    name: config.roles.member.name,
    colors: { primaryColor: config.roles.member.color },
    hoist: false,
    permissions: MEMBER_PERMS,
    reason: 'Cybers DA9 setup',
  });
  await ownerRole.setPosition(Math.max(1, me.roles.highest.position - 1)).catch(() => {});

  // 4) الرومات
  step('📁 الكاتيقوريات والرومات');
  const created = new Set();
  for (const cat of LAYOUT) {
    const parent = await ensureChannel(guild, cat, undefined, created);
    for (const def of cat.channels) await ensureChannel(guild, def, parent.id, created);
  }
  await guild.channels.fetch();

  // 5) توزيع الرتب على الأعضاء الحاليين
  step('👥 توزيع الرتب على الأعضاء الحاليين');
  const members = await guild.members.fetch();
  for (const m of members.values()) {
    if (m.user.bot) continue;
    if (m.id === guild.ownerId) {
      await m.roles.add(db.data.roles.owner).catch(() => {});
    } else if (!m.roles.cache.has(db.data.roles.member)) {
      await m.roles.add(db.data.roles.member).catch(() => {});
      db.data.verified[m.id] = Date.now();
    }
  }
  db.save();

  // 6) AutoMod
  step('🛡️ قواعد AutoMod');
  const made = await setupAutoMod(guild);
  step(`🛡️ تم إنشاء ${made} قواعد AutoMod`);

  // 7) الرسائل الثابتة
  step('📨 إرسال القوانين والتحقق والتذاكر وطرق الدفع');
  await sleep(500);
  for (const key of PANEL_KEYS) {
    // الرومات الجديدة تاخذ رسائلها، والقديمة نحدث فيها الرسائل الثابتة بس (بدون تكرار المنتجات/التقييمات)
    if (created.has(key)) await sendPanel(guild, key);
    else if (RESENDABLE.includes(key)) await sendPanel(guild, key, { clear: true });
  }
  if (created.has('products')) await require('./store').repostAll(guild);

  step('✅ انتهى التجهيز');
  db.flush();
  return report;
}

// ───── التجميل: وصف الرومات، الرتب، شاشة الترحيب، إعادة إرسال كل الرسائل ─────
const TOPICS = {
  rules: '📜 اقرأ القوانين قبل أي شي • Read the rules first',
  verify: '🛡️ اضغط تحقق عشان تنفتح لك الرومات • Click Verify to unlock the server',
  announcements: '📢 كل جديد المتجر والعروض • Store news & offers',
  welcome: '👋 ترحيب بالأعضاء الجدد • Welcoming new members',
  products: '🛍️ اضغط 🛒 شراء تحت أي منتج • Click 🛒 Buy under any product',
  payments: '💳 كروت و USDT فقط • Cards & USDT only',
  howto: '📖 خطوات الشراء والشروط • How to buy & terms',
  ticketPanel: '🎫 افتح تذكرة للشراء أو الدعم • Open a ticket to buy or get support',
  reviews: '⭐ تقييمات عملاء حقيقيين • Real customer reviews',
  chat: '💬 الشات العام — التزم بالقوانين • General chat — follow the rules',
  commands: '🤖 أوامر البوت • Bot commands',
  staff: '👑 لوحة الإدارة • Admin panel',
};

async function beautify(guild, progress = () => {}) {
  const { sendPanel } = require('./panels');
  const done = [];
  const c = db.data.channels;

  // 1) وصف الرومات بالعربي والإنجليزي
  for (const [key, topic] of Object.entries(TOPICS)) {
    const ch = guild.channels.cache.get(c[key]);
    if (ch?.isTextBased() && ch.topic !== topic) await ch.setTopic(topic).catch(() => {});
  }
  done.push('📝 وصف الرومات • Channel topics');
  progress(done.at(-1));

  // 2) الرتب: الأعضاء يظهرون كمجموعة لحالهم في قائمة الأعضاء
  const member = guild.roles.cache.get(db.data.roles.member);
  if (member && !member.hoist) await member.setHoist(true).catch(() => {});
  done.push('🎭 الرتب • Roles');
  progress(done.at(-1));

  // 3) مجتمع + شاشة ترحيب + وصف السيرفر
  try {
    if (!guild.features.includes('COMMUNITY')) {
      await guild.edit({
        features: [...guild.features, 'COMMUNITY'],
        rulesChannel: c.rules,
        publicUpdatesChannel: c.staff,
        reason: 'Cybers DA9 beautify',
      });
    }
    await guild.edit({
      description: 'متجر Cybers DA9 الرسمي — كورسات وأدوات أمن سيبراني وذكاء اصطناعي • Official Cybers DA9 store',
    }).catch(() => {});
    const welcomeChannels = [
      { channel: c.verify, emoji: '🛡️', description: 'تحقق أولاً • Verify first' },
      { channel: c.rules, emoji: '📜', description: 'القوانين • Rules' },
      { channel: c.products, emoji: '🛍️', description: 'المنتجات • Products' },
      { channel: c.ticketPanel, emoji: '🎫', description: 'للشراء والدعم • Buy & support' },
      { channel: c.payments, emoji: '💳', description: 'طرق الدفع • Payments' },
    ].filter((w) => w.channel);
    const description = 'حياك الله في Cybers DA9 🛒 تحقق وتصفح منتجاتنا • Welcome! Verify and browse our products';
    await guild.editWelcomeScreen({ enabled: true, description, welcomeChannels })
      .catch(() => guild.editWelcomeScreen({ enabled: true, description, welcomeChannels: welcomeChannels.slice(0, 2) }));
    done.push('🏠 شاشة الترحيب • Welcome screen');
  } catch (e) {
    console.error('[beautify] community:', e.message);
    done.push('⚠️ شاشة الترحيب ما اشتغلت • Welcome screen skipped');
  }
  progress(done.at(-1));

  // 4) إعادة إرسال كل الرسائل بالشكل الجديد
  for (const key of ['rules', 'verify', 'payments', 'howto', 'ticketPanel', 'staff']) {
    await sendPanel(guild, key, { clear: true });
  }
  // الرسائل اللي فيها محتوى ثاني: نحذف رأس الصفحة القديم بس
  for (const [key, re] of [['announcements', /افتتاح|Grand Opening/], ['reviews', /تقييمات العملاء/]]) {
    const ch = guild.channels.cache.get(c[key]);
    const msgs = await ch?.messages.fetch({ limit: 50 }).catch(() => null);
    for (const m of msgs?.values() ?? []) {
      if (m.author.id === guild.client.user.id && m.embeds.some((e) => re.test(e.title ?? ''))) await m.delete().catch(() => {});
    }
    await sendPanel(guild, key);
  }
  // المنتجات: رأس جديد ثم المنتجات تحته
  const productsCh = guild.channels.cache.get(c.products);
  if (productsCh) {
    const msgs = await productsCh.messages.fetch({ limit: 100 }).catch(() => null);
    for (const m of msgs?.values() ?? []) if (m.author.id === guild.client.user.id) await m.delete().catch(() => {});
    await sendPanel(guild, 'products');
    await require('./store').repostAll(guild);
  }
  done.push('🖼️ الرسائل والصور • Panels & images');
  progress(done.at(-1));

  await updateMemberCount(guild);
  return done;
}

// يرجع صلاحيات كل الرومات لوضعها الأصلي (يستخدمه الـ Anti-Nuke)
async function reapplyPermissions(guild) {
  for (const cat of LAYOUT) {
    for (const def of [cat, ...cat.channels]) {
      const ch = guild.channels.cache.get(db.data.channels[def.key]);
      if (ch) await ch.permissionOverwrites.set(overwrites(guild, def.mode, def), '[Anti-Nuke] restore').catch(() => {});
    }
  }
}

async function updateMemberCount(guild) {
  const ch = guild.channels.cache.get(db.data.channels.memberCount);
  if (!ch) return;
  const name = `👥・الأعضاء • Members: ${guild.memberCount}`;
  if (ch.name !== name) await ch.setName(name).catch(() => {});
}

module.exports = { runSetup, setupAutoMod, reapplyPermissions, updateMemberCount, beautify, overwrites, MEMBER_PERMS, LAYOUT };
