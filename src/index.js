// ═══════════════════════════════════════
//   Cybers DA9 — البوت الرئيسي
// ═══════════════════════════════════════
const path = require('path');

// قراءة ملف .env (يشتغل على أي نسخة Node)
try {
  const raw = require('fs').readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {
  // متغيرات البيئة ممكن تكون من الاستضافة مباشرة
}
// الاستضافة تقدر تمرر الإعدادات كـ: node src/index.js TOKEN=xxx GUILD_ID=yyy
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^-{0,2}([A-Z_][A-Z0-9_]*)=(.+)$/i);
  if (m) process.env[m[1].toUpperCase()] = m[2];
  // توكن ملصوق لحاله بدون TOKEN=
  else if (/^[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(arg)) process.env.TOKEN = arg;
}
process.env.GUILD_ID ||= '1559821910676869130';

const {
  Client,
  GatewayIntentBits: G,
  Partials,
  Events,
  ActivityType,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const db = require('./db');
const { embed, fail, getGuild, alert } = require('./util');
const commands = require('./commands');
const verify = require('./verify');
const tickets = require('./tickets');
const logs = require('./logs');
const antinuke = require('./protection/antinuke');
const antiraid = require('./protection/antiraid');
const antispam = require('./protection/antispam');
const { runSetup, updateMemberCount } = require('./setup');

const { TOKEN, GUILD_ID } = process.env;
if (!TOKEN || !GUILD_ID) {
  console.error('❌ لازم تحط TOKEN و GUILD_ID في ملف .env (شوف .env.example)');
  process.exit(1);
}

const client = new Client({
  intents: [
    G.Guilds,
    G.GuildMembers,
    G.GuildModeration,
    G.GuildExpressions,
    G.GuildIntegrations,
    G.GuildWebhooks,
    G.GuildInvites,
    G.GuildVoiceStates,
    G.GuildMessages,
    G.MessageContent,
    G.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
  allowedMentions: { parse: ['users'] },
});

logs.register(client);
antinuke.register(client);

// ───── التشغيل ─────
client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} شغال`);

  // البوت خاص بسيرفر واحد فقط
  for (const g of client.guilds.cache.values()) {
    if (g.id !== GUILD_ID) await g.leave().catch(() => {});
  }

  const guild = getGuild(client);
  if (!guild) {
    console.log('⚠️ البوت مو داخل السيرفر. ادخله من هذا الرابط:');
    console.log(`https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands&guild_id=${GUILD_ID}&disable_guild_select=true`);
    return;
  }
  await prepare(guild);
});

async function prepare(guild) {
  if (!client.user.avatar) {
    await client.user.setAvatar(path.join(__dirname, '..', 'assets', 'icon.png')).catch((e) => console.warn('avatar:', e.message));
  }
  await guild.commands.set(commands.definitions);
  await guild.members.fetch().catch(() => {});
  await guild.channels.fetch().catch(() => {});
  antinuke.trackParents(guild);
  antiraid.resumeRaid(guild);
  await updateMemberCount(guild);

  client.user.setPresence({
    activities: [{ name: `🛒 ${config.serverName} | /help`, type: ActivityType.Watching }],
    status: 'online',
  });

  const me = guild.members.me;
  if (guild.roles.highest.id !== me.roles.highest.id) {
    console.warn('⚠️ رتبة البوت مو أعلى رتبة! اسحبها لأعلى القائمة في إعدادات السيرفر عشان الحماية تشتغل 100%.');
  }
  if (!me.permissions.has('Administrator')) {
    console.warn('⚠️ البوت ما عنده Administrator — بعض الأشياء ما بتشتغل.');
  }
  if (!db.data.channels.rules) console.log('👉 اكتب /setup reset:True داخل السيرفر عشان يتجهز كامل.');
  console.log(`🛡️ الحماية شغالة على: ${guild.name}`);
}

client.on(Events.GuildCreate, async (g) => {
  if (g.id !== GUILD_ID) return g.leave().catch(() => {});
  await prepare(g);
});

setInterval(() => {
  const guild = getGuild(client);
  if (guild) updateMemberCount(guild);
}, 10 * 60_000).unref();

// ───── الأعضاء ─────
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== GUILD_ID || member.user.bot) return; // البوتات يتعامل معها الـ Anti-Nuke
  await antiraid.handleJoin(member);
});

client.on(Events.UserUpdate, async (_, user) => {
  const member = getGuild(client)?.members.cache.get(user.id);
  if (member) await antiraid.checkImpersonation(member);
});

// ───── الرسائل ─────
client.on(Events.MessageCreate, (msg) => {
  antispam.handleMessage(msg).catch((e) => console.error('[antispam]', e));
});

// ───── الأزرار والأوامر والنوافذ ─────
client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.guildId && i.guildId !== GUILD_ID) return;

    if (i.isChatInputCommand()) {
      if (!i.inCachedGuild()) return;
      return await commands.execute(i);
    }

    const [a, b, c, d] = (i.customId ?? '').split(':');

    // التقييم يشتغل حتى بالخاص
    if (i.isButton() && a === 'review') return await tickets.reviewAsk(i, b, Number(c));
    if (i.isModalSubmit() && a === 'review' && b === 'submit') return await tickets.reviewSubmit(i, c, Number(d));

    if (!i.inCachedGuild()) return;

    if (i.isButton()) {
      if (a === 'verify' && b === 'start') return await verify.start(i);
      if (a === 'verify' && b === 'enter') return await verify.enter(i);
      if (a === 'buy') return await tickets.openModal(i, 'buy', b);
      if (a === 'ticket' && b === 'open') return await tickets.openModal(i, c);
      if (a === 'ticket' && b === 'close') return await tickets.closeAsk(i);
      if (a === 'ticket' && b === 'closeConfirm') return await tickets.close(i);
      if (a === 'ticket' && b === 'deliver') return await tickets.deliverAsk(i);
      if (a === 'setup' && b === 'confirm') return await setupFromButton(i, c === '1');
    }

    if (i.isModalSubmit()) {
      if (i.customId === 'verify:submit') return await verify.submit(i);
      if (a === 'ticket' && b === 'create') return await tickets.create(i, c, d);
      if (i.customId === 'ticket:delivered') return await tickets.delivered(i);
      if (i.customId === 'announce:submit') return await commands.announceSubmit(i);
    }
  } catch (e) {
    console.error('[interaction]', i.customId ?? i.commandName, e);
    if (i.isRepliable()) {
      if (i.deferred) await i.editReply('❌ صار خطأ، حاول مرة ثانية.').catch(() => {});
      else fail(i, 'صار خطأ، حاول مرة ثانية.');
    }
  }
});

async function setupFromButton(i, reset) {
  if (i.user.id !== i.guild.ownerId) return fail(i, 'لصاحب السيرفر فقط.');
  await i.update({ embeds: [embed().setDescription('🚀 جاري التجهيز... التقدم بيوصلك بالخاص.')], components: [] });

  const lines = [];
  const status = await i.user
    .send({ embeds: [embed().setTitle(`🚀 تجهيز ${config.serverName}`).setDescription('بدأ التجهيز...')] })
    .catch(() => null);
  const progress = (m) => {
    lines.push(m);
    status?.edit({ embeds: [embed().setTitle(`🚀 تجهيز ${config.serverName}`).setDescription(lines.join('\n'))] }).catch(() => {});
  };

  try {
    await runSetup(i.guild, { reset, progress });
    antinuke.trackParents(i.guild);
    await updateMemberCount(i.guild);
    await alert(i.guild, embed(config.colors.success)
      .setTitle(`✅ ${config.serverName} جاهز`)
      .setDescription(`${lines.join('\n')}\n\n**الخطوة الجاية:** أضف منتجاتك بـ \`/product add\``));
  } catch (e) {
    console.error('[setup]', e);
    await i.user.send(`❌ صار خطأ أثناء التجهيز: ${e.message}`).catch(() => {});
  }
}

// ───── أخطاء + إغلاق آمن ─────
process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    db.flush();
    client.destroy();
    process.exit(0);
  });
}

client.login(TOKEN).catch((e) => {
  if (/disallowed intents/i.test(e.message)) {
    console.error('❌ لازم تفعّل الـ Intents: من Discord Developer Portal ➜ Bot ➜ فعّل SERVER MEMBERS INTENT و MESSAGE CONTENT INTENT');
  } else if (e.code === 'TokenInvalid') {
    console.error('❌ التوكن غلط — انسخه من جديد من Developer Portal ➜ Bot ➜ Reset Token');
  } else {
    console.error('❌ فشل تسجيل الدخول:', e.message);
  }
  process.exitCode = 1;
  client.destroy();
});
