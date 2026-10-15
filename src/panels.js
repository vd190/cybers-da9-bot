// الرسائل الثابتة: القوانين، التحقق، طرق الدفع، طريقة الشراء، التذاكر
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const config = require('../config');
const db = require('./db');
const { embed, channel, ASSETS } = require('./util');

const banner = () => new AttachmentBuilder(path.join(ASSETS, 'banner.png'), { name: 'banner.png' });

const RULES = [
  ['🤝 الاحترام', 'احترم الجميع. ممنوع السب، الشتم، العنصرية، التنمر أو أي إساءة بأي شكل.'],
  ['🚫 النشر والإعلانات', 'ممنوع نشر روابط سيرفرات أو حسابات أو مواقع، وممنوع الإعلان بالخاص لأعضاء السيرفر.'],
  ['📛 السبام', 'ممنوع السبام، تكرار الرسائل، المنشن الجماعي، أو إزعاج الإدارة بالمنشن.'],
  ['💸 الشراء الرسمي فقط', 'الشراء يكون **فقط** عن طريق التذاكر الرسمية في السيرفر. أي تعامل خارجها على مسؤوليتك.'],
  ['🕵️ الاحتيال', 'أي محاولة نصب أو تحايل أو تزوير إثبات دفع = **باند نهائي** بدون نقاش.'],
  ['🎭 الانتحال', 'ممنوع انتحال شخصية الإدارة أو المتجر. الإدارة **ما تراسلك خاص أولاً أبداً**.'],
  ['🛒 البيع الخارجي', 'ممنوع بيع أو عرض منتجات داخل السيرفر — هذا متجر رسمي وليس سوق مفتوح.'],
  ['🎫 التذاكر', 'لا تفتح تذكرة بدون سبب، ولا تفتح أكثر من تذكرة لنفس الطلب.'],
  ['🔞 المحتوى', 'ممنوع أي محتوى غير لائق، سياسي، ديني جدلي أو مخالف.'],
  ['📜 شروط ديسكورد', 'الالتزام بـ [شروط استخدام ديسكورد](https://discord.com/terms) و [إرشادات المجتمع](https://discord.com/guidelines).'],
];

async function clearBotMessages(ch) {
  const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  if (!msgs) return;
  for (const m of msgs.values()) {
    if (m.author.id === ch.client.user.id) await m.delete().catch(() => {});
  }
}

const builders = {
  async rules(ch) {
    const e = embed()
      .setTitle('📜 قوانين سيرفر Cybers DA9')
      .setDescription(
        'أهلاً فيك في **Cybers DA9** 🛒\nبدخولك للسيرفر أنت توافق على جميع القوانين التالية:\n​',
      )
      .setImage('attachment://banner.png');
    RULES.forEach(([title, text], i) => e.addFields({ name: `${i + 1}. ${title}`, value: text }));
    const penalties = embed(config.colors.danger)
      .setTitle('⚖️ العقوبات')
      .setDescription(
        [
          '`1` تحذير تلقائي من البوت',
          `\`${config.protection.warnLimit}\` تحذيرات = تايم أوت ${config.protection.warnTimeoutHours} ساعة`,
          '`🚨` النصب / الاحتيال / التخريب = **باند نهائي فوري**',
          '',
          '> الإدارة لها الحق في تعديل القوانين أو معاقبة أي شخص يضر بالسيرفر.',
        ].join('\n'),
      );
    await ch.send({ embeds: [e, penalties], files: [banner()] });
  },

  async verify(ch) {
    const e = embed()
      .setTitle('🛡️ التحقق')
      .setDescription(
        [
          'عشان تقدر تشوف المتجر والرومات لازم تتحقق إنك **شخص حقيقي** 👤',
          '',
          '**الخطوات:**',
          '`1` اضغط زر **تحقق** تحت',
          '`2` بيطلع لك رمز — اضغط **إدخال الرمز** واكتبه',
          '`3` تنعطى رتبة العضو وتنفتح لك كل الرومات ✅',
          '',
          '> ⚠️ الحسابات الجديدة جداً تنطرد تلقائياً للحماية.',
        ].join('\n'),
      );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify:start').setLabel('تحقق').setEmoji('✅').setStyle(ButtonStyle.Success),
    );
    await ch.send({ embeds: [e], components: [row] });
  },

  async payments(ch) {
    const e = embed()
      .setTitle('💳 طرق الدفع المتاحة')
      .setDescription(
        `${config.payments.map((p) => `${p.emoji} **${p.name}**\n> ${p.note}`).join('\n\n')}\n\n`
          + '❌ **ما نقبل أي طريقة دفع ثانية.**\n'
          + '⚠️ **عنوان المحفظة وتفاصيل الدفع ترسل داخل التذكرة فقط من الإدارة.**\n'
          + 'لا ترسل كود كرت لأي أحد بالخاص — أي شخص يطلبه منك خارج التذكرة = **محتال**، بلّغ عنه فوراً.',
      );
    await ch.send({ embeds: [e] });
  },

  async howto(ch) {
    const steps = embed()
      .setTitle('📖 طريقة الشراء')
      .setDescription(
        [
          `\`1\` تصفح المنتجات في <#${db.data.channels.products}>`,
          '`2` اضغط زر **🛒 شراء** تحت المنتج أو افتح تذكرة **شراء منتج**',
          '`3` الإدارة بترد عليك داخل التذكرة — الدفع **كروت** أو **USDT** فقط',
          '`4` أرسل الكرت (الكود + صورته) أو **إثبات تحويل USDT** (هاش العملية) داخل التذكرة',
          '`5` تستلم طلبك ✅ وبعدها تقدر تقيّمنا ⭐',
        ].join('\n'),
      );
    const terms = embed(config.colors.warn)
      .setTitle('📋 شروط الشراء')
      .setDescription(
        [
          '• الدفع يكون **قبل** التسليم.',
          '• **لا يوجد استرجاع** بعد استلام المنتج إلا إذا كان المنتج لا يعمل ولم يتم تعويضك.',
          '• الكروت المستخدمة أو المزورة = **باند نهائي**.',
          '• تحويلات USDT **نهائية** — تأكد من العنوان والشبكة قبل التحويل.',
          '• مدة التسليم تختلف حسب المنتج وتوضح لك داخل التذكرة.',
          '• احتفظ بإثبات الدفع حتى تستلم طلبك.',
          '• بإتمامك للشراء أنت توافق على هذه الشروط.',
        ].join('\n'),
      );
    await ch.send({ embeds: [steps, terms] });
  },

  async ticketPanel(ch) {
    const e = embed()
      .setTitle('🎫 مركز التذاكر')
      .setDescription(
        [
          'اختر نوع التذكرة المناسب وبيتم فتح روم خاص بينك وبين الإدارة 🔒',
          '',
          ...config.ticketTypes.map((t) => `${t.emoji} **${t.label}** — ${t.description}`),
          '',
          '> ⏱️ لا تكرر فتح التذاكر، الإدارة بترد عليك بأسرع وقت.',
        ].join('\n'),
      )
      .setImage('attachment://banner.png');
    const row = new ActionRowBuilder().addComponents(
      config.ticketTypes.map((t) =>
        new ButtonBuilder()
          .setCustomId(`ticket:open:${t.id}`)
          .setLabel(t.label)
          .setEmoji(t.emoji)
          .setStyle(ButtonStyle[t.style] ?? ButtonStyle.Secondary),
      ),
    );
    await ch.send({ embeds: [e], components: [row], files: [banner()] });
  },

  async products(ch) {
    const e = embed()
      .setTitle('🛍️ منتجات Cybers DA9')
      .setDescription('هنا تلقى كل منتجاتنا 👇\nاضغط **🛒 شراء** تحت أي منتج وبتنفتح لك تذكرة مباشرة.')
      .setImage('attachment://banner.png');
    await ch.send({ embeds: [e], files: [banner()] });
  },

  async announcements(ch) {
    const e = embed()
      .setTitle('🎉 افتتاح متجر Cybers DA9')
      .setDescription('حياكم الله في متجر **Cybers DA9** 🛒\nتابعوا هذا الروم لكل جديد: منتجات، عروض، وتخفيضات 🔥')
      .setImage('attachment://banner.png');
    await ch.send({ embeds: [e], files: [banner()] });
  },

  async reviews(ch) {
    const e = embed(config.colors.gold)
      .setTitle('⭐ تقييمات العملاء')
      .setDescription('كل التقييمات هنا من عملاء **حقيقيين** استلموا طلباتهم ✅\n(التقييم يتاح تلقائياً بعد استلام الطلب)');
    await ch.send({ embeds: [e] });
  },

  async staff(ch) {
    const e = embed(config.colors.purple)
      .setTitle('🔒 لوحة الإدارة')
      .setDescription(
        [
          '**أوامر المتجر**',
          '`/product add` إضافة منتج • `/product status` متوفر/نفذ • `/product remove` • `/product list`',
          '`/announce` إعلان • `/stats` إحصائيات المتجر',
          '',
          '**أوامر الإدارة**',
          '`/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/clearwarns`',
          '`/clear` `/lock` `/unlock` `/slowmode`',
          '',
          '**الحماية**',
          '`/lockdown` قفل السيرفر كامل • `/unlockdown` • `/raidmode`',
          '`/whitelist` القائمة البيضاء للبوتات/الأشخاص الموثوقين',
          '`/panels` إعادة إرسال الرسائل الثابتة • `/setup` إعادة بناء السيرفر',
          '',
          '> داخل أي تذكرة شراء اضغط **✅ تم التسليم** بعد ما تسلّم الطلب عشان ينسجل الطلب ويقدر العميل يقيّم.',
        ].join('\n'),
      );
    await ch.send({ embeds: [e] });
  },
};

// ترتيب مهم: products قبل howto عشان الرابط
const PANEL_KEYS = ['rules', 'verify', 'announcements', 'products', 'payments', 'howto', 'ticketPanel', 'reviews', 'staff'];
// الرسائل اللي يعاد إرسالها بأمر /panels (بدون المنتجات والتقييمات والإعلانات)
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

module.exports = { sendPanel, sendAllPanels, PANEL_KEYS, RESENDABLE };
