// الرسائل الثابتة (عربي + إنجليزي): القوانين، التحقق، طرق الدفع، طريقة الشراء، التذاكر...
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('./db');
const { embed, channel, ASSETS } = require('./util');

const LINE = '━━━━━━━━━━━━━━━━━━';
const SPACER = '​';

// صورة القسم (assets/panels/<name>.png) — وإذا ما لقاها يرجع للبانر العام
function art(name) {
  const file = path.join(ASSETS, 'panels', `${name}.png`);
  if (fs.existsSync(file)) return { file: new AttachmentBuilder(file, { name: `${name}.png` }), url: `attachment://${name}.png` };
  return { file: new AttachmentBuilder(path.join(ASSETS, 'banner.png'), { name: 'banner.png' }), url: 'attachment://banner.png' };
}

// رسالة فيها صورة القسم فوق والشرح تحتها
async function sendWithArt(ch, name, embeds, components = []) {
  const a = art(name);
  const header = new EmbedBuilder().setColor(embeds[0]?.data.color ?? config.color).setImage(a.url);
  await ch.send({ embeds: [header, ...embeds], components, files: [a.file] });
}

const RULES = [
  ['🤝', 'الاحترام', 'Respect',
    'احترم الجميع — ممنوع السب والعنصرية والتنمر بأي شكل.',
    'Respect everyone — no insults, racism or bullying of any kind.'],
  ['🚫', 'النشر والإعلانات', 'No Advertising',
    'ممنوع نشر روابط سيرفرات أو حسابات، وممنوع الإعلان بالخاص.',
    'No server/account links and no advertising in DMs.'],
  ['📛', 'السبام', 'No Spam',
    'ممنوع تكرار الرسائل والمنشن الجماعي وإزعاج الإدارة.',
    'No repeated messages, mass mentions or pinging staff.'],
  ['💸', 'الشراء الرسمي فقط', 'Official Purchases Only',
    'الشراء فقط عن طريق تذاكر السيرفر — غيرها على مسؤوليتك.',
    'Buy only through server tickets — anything else is at your own risk.'],
  ['🕵️', 'الاحتيال', 'Fraud',
    'أي محاولة نصب أو تزوير إثبات دفع = باند نهائي.',
    'Any scam attempt or fake payment proof = permanent ban.'],
  ['🎭', 'الانتحال', 'Impersonation',
    'ممنوع انتحال الإدارة — الإدارة ما تراسلك خاص أولاً أبداً.',
    'Do not impersonate staff — staff will never DM you first.'],
  ['🛒', 'البيع الخارجي', 'No Reselling',
    'ممنوع بيع أو عرض أي منتجات داخل السيرفر.',
    'Selling or offering products inside the server is not allowed.'],
  ['🎫', 'التذاكر', 'Tickets',
    'لا تفتح تذكرة بدون سبب، ولا أكثر من تذكرة لنفس الطلب.',
    'No pointless tickets, and only one ticket per order.'],
  ['🔞', 'المحتوى', 'Content',
    'ممنوع أي محتوى غير لائق أو سياسي أو ديني جدلي.',
    'No NSFW, political or controversial religious content.'],
  ['📜', 'شروط ديسكورد', 'Discord ToS',
    'الالتزام بـ [شروط ديسكورد](https://discord.com/terms) و [إرشادات المجتمع](https://discord.com/guidelines).',
    'Follow the [Discord Terms](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines).'],
];

async function clearBotMessages(ch) {
  const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
  if (!msgs) return;
  for (const m of msgs.values()) {
    if (m.author.id === ch.client.user.id) await m.delete().catch(() => {});
  }
}

const builders = {
  async rules(ch) {
    const intro = embed()
      .setTitle('📜 قوانين السيرفر • Server Rules')
      .setDescription(
        [
          'بدخولك للسيرفر أنت توافق على القوانين التالية 👇',
          'By joining the server you agree to the following rules 👇',
        ].join('\n'),
      );
    RULES.forEach(([emoji, ar, en, tAr, tEn], i) => {
      intro.addFields({ name: `${i + 1}. ${emoji} ${ar} • ${en}`, value: `${tAr}\n*${tEn}*` });
    });
    const penalties = embed(config.colors.danger)
      .setTitle('⚖️ العقوبات • Penalties')
      .setDescription(
        [
          '⚠️ **مخالفة بسيطة:** تحذير تلقائي من البوت',
          '*Minor offence: automatic warning*',
          '',
          `⏳ **${config.protection.warnLimit} تحذيرات:** تايم أوت ${config.protection.warnTimeoutHours} ساعة`,
          `*${config.protection.warnLimit} warnings: ${config.protection.warnTimeoutHours}h timeout*`,
          '',
          '🚨 **نصب / احتيال / تخريب:** باند نهائي فوري',
          '*Scam / fraud / sabotage: instant permanent ban*',
        ].join('\n'),
      );
    await sendWithArt(ch, 'rules', [intro, penalties]);
  },

  async verify(ch) {
    const e = embed(0x00ffa3)
      .setTitle('🛡️ التحقق • Verification')
      .setDescription(
        [
          'عشان تشوف المتجر لازم تثبت إنك **شخص حقيقي** 👤',
          'To access the store, prove you are a **real person** 👤',
          '',
          LINE,
          '**`1`** اضغط **تحقق** تحت • Click **Verify** below',
          '**`2`** اكتب الرمز اللي يطلع لك • Type the code you get',
          '**`3`** تنفتح لك كل الرومات ✅ • All channels unlock ✅',
          LINE,
          '',
          '> ⚠️ الحسابات الجديدة جداً تنطرد تلقائياً للحماية.',
          '> *Very new accounts are removed automatically for security.*',
        ].join('\n'),
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify:start').setLabel('تحقق • Verify').setEmoji('✅').setStyle(ButtonStyle.Success),
    );
    await sendWithArt(ch, 'verify', [e], [row]);
  },

  async payments(ch) {
    const e = embed(0xffd166)
      .setTitle('💳 طرق الدفع • Payment Methods')
      .setDescription(
        [
          ...config.payments.flatMap((p) => [
            `${p.emoji} **${p.name} • ${p.nameEn}**`,
            `> ${p.note}`,
            `> *${p.noteEn}*`,
            '',
          ]),
          LINE,
          '❌ **ما نقبل أي طريقة دفع ثانية.**',
          '*No other payment methods are accepted.*',
          '',
          '⚠️ **تفاصيل الدفع ترسل داخل التذكرة فقط من الإدارة.**',
          '*Payment details are only sent inside your ticket by staff.*',
          '',
          '🚫 أي أحد يطلب منك كود كرت أو تحويل بالخاص = **محتال**.',
          '*Anyone asking for a card code or transfer in DMs = **scammer**.*',
        ].join('\n'),
      );
    await sendWithArt(ch, 'payments', [e]);
  },

  async howto(ch) {
    const steps = embed()
      .setTitle('📖 طريقة الشراء • How to Buy')
      .setDescription(
        [
          `**\`1\`** 🛍️ تصفح المنتجات في <#${db.data.channels.products}>`,
          '*Browse the products channel*',
          '',
          '**`2`** 🛒 اضغط **شراء** تحت المنتج',
          '*Click **Buy** under the product — a private ticket opens*',
          '',
          '**`3`** 💬 الإدارة ترد عليك وترسل تفاصيل الدفع',
          '*Staff reply with payment details*',
          '',
          '**`4`** 💳 أرسل الكرت أو إثبات تحويل USDT',
          '*Send the card or your USDT transfer proof*',
          '',
          '**`5`** ✅ تستلم طلبك وتقدر تقيّمنا ⭐',
          '*Receive your order and leave a review ⭐*',
        ].join('\n'),
      );
    const terms = embed(config.colors.warn)
      .setTitle('📋 شروط الشراء • Purchase Terms')
      .setDescription(
        [
          '• الدفع **قبل** التسليم. • *Payment comes **before** delivery.*',
          '',
          '• **لا يوجد استرجاع** بعد الاستلام إلا إذا المنتج لا يعمل.',
          '  *No refunds after delivery unless the product does not work.*',
          '',
          '• الكروت المستخدمة أو المزورة = **باند نهائي**.',
          '  *Used or fake cards = **permanent ban**.*',
          '',
          '• تحويلات USDT **نهائية** — تأكد من العنوان والشبكة.',
          '  *USDT transfers are **final** — double-check address & network.*',
          '',
          '• بإتمامك للشراء أنت توافق على هذه الشروط.',
          '  *By purchasing you agree to these terms.*',
        ].join('\n'),
      );
    await sendWithArt(ch, 'howto', [steps, terms]);
  },

  async ticketPanel(ch) {
    const e = embed(0x7a5cff)
      .setTitle('🎫 مركز التذاكر • Ticket Center')
      .setDescription(
        [
          'اختر نوع التذكرة وينفتح لك روم خاص مع الإدارة 🔒',
          '*Pick a ticket type and a private room with staff opens* 🔒',
          '',
          LINE,
          ...config.ticketTypes.flatMap((t) => [`${t.emoji} **${t.label} • ${t.labelEn}**`, `> ${t.description} • *${t.descriptionEn}*`]),
          LINE,
          '',
          '> ⏱️ لا تكرر فتح التذاكر — نرد عليك بأسرع وقت.',
          '> *Please don\'t open duplicate tickets — we\'ll reply ASAP.*',
        ].join('\n'),
      );
    const row = new ActionRowBuilder().addComponents(
      config.ticketTypes.map((t) =>
        new ButtonBuilder()
          .setCustomId(`ticket:open:${t.id}`)
          .setLabel(`${t.label} • ${t.labelEn}`)
          .setEmoji(t.emoji)
          .setStyle(ButtonStyle[t.style] ?? ButtonStyle.Secondary),
      ),
    );
    await sendWithArt(ch, 'tickets', [e], [row]);
  },

  async products(ch) {
    const e = embed()
      .setTitle('🛍️ منتجات Cybers DA9 • Our Products')
      .setDescription(
        [
          'كل منتجاتنا هنا 👇 اضغط **🛒 شراء** تحت أي منتج وتنفتح لك تذكرة مباشرة.',
          '*All our products are below 👇 Click **🛒 Buy** under any product to open a ticket.*',
          '',
          `💳 الدفع: كروت أو USDT — <#${db.data.channels.payments}>`,
          `*Payment: cards or USDT*`,
        ].join('\n'),
      );
    await sendWithArt(ch, 'store', [e]);
  },

  async announcements(ch) {
    const e = embed(0xff5c8a)
      .setTitle('🎉 افتتاح متجر Cybers DA9 • Grand Opening')
      .setDescription(
        [
          'حياكم الله في **Cybers DA9** 🛒',
          'تابعوا هذا الروم لكل جديد: منتجات، عروض، وتخفيضات 🔥',
          '',
          '*Welcome to **Cybers DA9** 🛒*',
          '*Follow this channel for new products, offers and discounts 🔥*',
        ].join('\n'),
      );
    await sendWithArt(ch, 'announcements', [e]);
  },

  async reviews(ch) {
    const e = embed(config.colors.gold)
      .setTitle('⭐ تقييمات العملاء • Customer Reviews')
      .setDescription(
        [
          'كل التقييمات هنا من عملاء **حقيقيين** استلموا طلباتهم ✅',
          '*Every review here is from a **real** customer who received their order ✅*',
          '',
          '> التقييم يتاح تلقائياً بعد استلام الطلب.',
          '> *You can review automatically after your order is delivered.*',
        ].join('\n'),
      );
    await sendWithArt(ch, 'reviews', [e]);
  },

  async staff(ch) {
    const e = embed(config.colors.purple)
      .setTitle('👑 لوحة الإدارة • Admin Panel')
      .setDescription(
        [
          '**🛒 المتجر • Store**',
          '`/product add` إضافة منتج • `/product edit` تعديل (وصورة `image_url`)',
          '`/product status` متوفر/نفذ • `/product remove` حذف • `/product list`',
          '`/announce` إعلان • `/stats` إحصائيات',
          '',
          '**🔨 الإدارة • Moderation**',
          '`/ban` `/unban` `/kick` `/timeout` `/untimeout`',
          '`/warn` `/warnings` `/clearwarns` `/clear` `/lock` `/unlock` `/slowmode`',
          '',
          '**🛡️ الحماية • Security**',
          '`/lockdown` قفل السيرفر • `/unlockdown` • `/raidmode`',
          '`/whitelist` القائمة البيضاء',
          '',
          '**🎨 الشكل • Appearance**',
          '`/panels` إعادة إرسال الرسائل • `/setup` إعادة بناء السيرفر',
          '',
          LINE,
          '✅ داخل تذكرة الشراء اضغط **تم التسليم** بعد ما تسلّم الطلب — ينسجل الطلب ويقدر العميل يقيّم.',
        ].join('\n'),
      );
    await sendWithArt(ch, 'staff', [e]);
  },
};

const PANEL_KEYS = ['rules', 'verify', 'announcements', 'products', 'payments', 'howto', 'ticketPanel', 'reviews', 'staff'];
const RESENDABLE = ['rules', 'verify', 'payments', 'howto', 'ticketPanel', 'staff'];

async function sendPanel(guild, key, { clear = false } = {}) {
  const ch = channel(guild, key);
  if (!ch || !builders[key]) return false;
  if (clear) await clearBotMessages(ch);
  await builders[key](ch).catch((e) => console.error(`[panels] ${key}:`, e.message));
  return true;
}

async function sendAllPanels(guild, keys = PANEL_KEYS, opts) {
  for (const key of keys) await sendPanel(guild, key, opts);
}

module.exports = { sendPanel, sendAllPanels, art, PANEL_KEYS, RESENDABLE, SPACER };
