// نظام التذاكر + تسليم الطلبات + التقييمات
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits: F,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const db = require('./db');
const { embed, reply, ok, fail, modal, log, channel, isOwner, cut, ts, sleep, getGuild } = require('./util');

const typeOf = (id) => config.ticketTypes.find((t) => t.id === id) ?? config.ticketTypes[0];

// ───── فتح تذكرة ─────
function openModal(i, typeId, productId) {
  const t = typeOf(typeId);
  const product = productId ? db.data.products.items[productId] : null;
  if (productId && (!product || !product.available)) return fail(i, 'هذا المنتج غير متوفر حالياً.');
  const existing = db.data.tickets.open[i.user.id];
  if (existing && i.guild.channels.cache.has(existing)) return fail(i, `عندك تذكرة مفتوحة: <#${existing}>`);

  const fields = product
    ? [{ id: 'details', label: 'الكمية / ملاحظات', placeholder: 'مثال: 1', paragraph: true, required: false, max: 500 }]
    : [{ id: 'details', label: 'اشرح طلبك', placeholder: t.description, paragraph: true, max: 1000, min: 3 }];
  const title = product ? `شراء: ${product.name}` : `${t.emoji} ${t.label}`;
  return i.showModal(modal(`ticket:create:${t.id}${product ? `:${productId}` : ''}`, title, fields));
}

async function create(i, typeId, productId) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = i.guild;
  const t = typeOf(typeId);
  const product = productId ? db.data.products.items[productId] : null;
  const details = i.fields.getTextInputValue('details');

  const existing = db.data.tickets.open[i.user.id];
  if (existing && guild.channels.cache.has(existing)) return i.editReply(`❌ عندك تذكرة مفتوحة: <#${existing}>`);

  const number = ++db.data.tickets.counter;
  db.save();
  const parent = guild.channels.cache.get(db.data.channels.ticketsCategory);

  const ch = await guild.channels
    .create({
      name: `${t.emoji}・${t.id}-${String(number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: parent?.id,
      topic: `تذكرة #${number} • ${t.label} • ${i.user.tag} (${i.user.id})`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [F.ViewChannel] },
        {
          id: i.user.id,
          allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.AttachFiles, F.EmbedLinks],
          deny: [F.MentionEveryone, F.CreatePublicThreads, F.CreatePrivateThreads],
        },
        ...(db.data.roles.owner
          ? [{ id: db.data.roles.owner, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.AttachFiles, F.ManageMessages] }]
          : []),
      ],
      reason: `Ticket #${number}`,
    })
    .catch((e) => {
      console.error('[tickets] create:', e.message);
      return null;
    });
  if (!ch) return i.editReply('❌ صار خطأ في فتح التذكرة، بلّغ الإدارة.');

  db.data.tickets.open[i.user.id] = ch.id;
  db.data.tickets.meta[ch.id] = {
    userId: i.user.id,
    type: t.id,
    number,
    productId: productId ?? null,
    details,
    createdAt: Date.now(),
    orderId: null,
  };
  db.save();

  const e = embed()
    .setTitle(`${t.emoji} تذكرة #${number} — ${t.label}`)
    .setDescription(
      [
        `أهلاً ${i.user} 👋`,
        'الإدارة بترد عليك بأقرب وقت، لا تسوي منشن متكرر.',
        '',
        '⚠️ **لا تدفع لأي حساب إلا اللي ينرسل لك هنا من الإدارة.**',
      ].join('\n'),
    )
    .addFields({ name: '📝 التفاصيل', value: cut(details, 1024) });
  if (product) {
    e.addFields(
      { name: '🛍️ المنتج', value: product.name, inline: true },
      { name: '💰 السعر', value: product.price, inline: true },
    );
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:deliver').setLabel('تم التسليم (للإدارة)').setEmoji('✅').setStyle(ButtonStyle.Success),
  );

  await ch.send({
    content: `${i.user} ${db.data.roles.owner ? `<@&${db.data.roles.owner}>` : ''}`,
    embeds: [e],
    components: [row],
    allowedMentions: { users: [i.user.id], roles: db.data.roles.owner ? [db.data.roles.owner] : [] },
  });

  await log(guild, 'logTickets', embed(0x2ecc71)
    .setTitle(`🎫 تذكرة جديدة #${number}`)
    .addFields(
      { name: 'العضو', value: `${i.user} \`${i.user.id}\``, inline: true },
      { name: 'النوع', value: `${t.emoji} ${t.label}`, inline: true },
      { name: 'الروم', value: `${ch}`, inline: true },
      ...(product ? [{ name: 'المنتج', value: `${product.name} — ${product.price}` }] : []),
    ));

  return i.editReply(`✅ انفتحت تذكرتك: ${ch}`);
}

// ───── إغلاق ─────
function closeAsk(i) {
  const meta = db.data.tickets.meta[i.channelId];
  if (!meta) return fail(i, 'هذا مو روم تذكرة.');
  if (i.user.id !== meta.userId && !isOwner(i.member)) return fail(i, 'ما تقدر تقفل هذي التذكرة.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:closeConfirm').setLabel('تأكيد الإغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
  return reply(i, { embeds: [embed(config.colors.warn).setDescription('متأكد تبي تقفل التذكرة؟')], components: [row] });
}

async function fetchAll(ch) {
  const all = [];
  let before;
  for (;;) {
    const batch = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse();
}

async function transcript(ch, meta, closer) {
  const msgs = await fetchAll(ch);
  const t = typeOf(meta.type);
  const lines = [
    `══════ ${config.serverName} — Ticket #${meta.number} ══════`,
    `Type     : ${t.label}`,
    `Opened by: ${meta.userId}`,
    `Opened at: ${new Date(meta.createdAt).toISOString()}`,
    `Closed by: ${closer.tag} (${closer.id})`,
    `Closed at: ${new Date().toISOString()}`,
    `Order    : ${meta.orderId ? `#${meta.orderId}` : '-'}`,
    '═'.repeat(50),
    '',
  ];
  for (const m of msgs) {
    const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    let text = m.content || '';
    for (const e of m.embeds) text += `\n    [embed] ${e.title ?? ''} ${e.description ?? ''}`.replace(/\n(?!    )/g, '\n    ');
    for (const a of m.attachments.values()) text += `\n    [file] ${a.url}`;
    lines.push(`[${time}] ${m.author.tag}: ${text}`);
  }
  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `ticket-${meta.number}.txt` });
}

function reviewRow(orderId) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`review:${orderId}:${n}`)
        .setLabel(`${n}`)
        .setEmoji('⭐')
        .setStyle(n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
}

async function close(i) {
  const meta = db.data.tickets.meta[i.channelId];
  if (!meta) return fail(i, 'هذا مو روم تذكرة.');
  if (i.user.id !== meta.userId && !isOwner(i.member)) return fail(i, 'ما تقدر تقفل هذي التذكرة.');
  if (meta.closing) return;
  meta.closing = true;

  await i.update({ components: [] }).catch(() => {});
  await i.channel.send({ embeds: [embed(config.colors.danger).setDescription(`🔒 بيتم إغلاق التذكرة خلال 5 ثواني بواسطة ${i.user}`)] });

  const file = await transcript(i.channel, meta, i.user);
  const t = typeOf(meta.type);
  await log(i.guild, 'logTickets', embed(config.colors.danger)
    .setTitle(`🔒 تذكرة مقفلة #${meta.number}`)
    .addFields(
      { name: 'صاحب التذكرة', value: `<@${meta.userId}> \`${meta.userId}\``, inline: true },
      { name: 'أقفلها', value: `${i.user}`, inline: true },
      { name: 'النوع', value: `${t.emoji} ${t.label}`, inline: true },
      { name: 'انفتحت', value: ts(meta.createdAt, 'f'), inline: true },
      { name: 'الطلب', value: meta.orderId ? `✅ #${meta.orderId}` : '—', inline: true },
    ), { files: [file] });

  const user = await i.client.users.fetch(meta.userId).catch(() => null);
  if (user) {
    const pending = meta.orderId && db.data.orders.pendingReviews[meta.orderId];
    const dmFile = new AttachmentBuilder(file.attachment, { name: file.name });
    await user
      .send({
        embeds: [
          embed().setTitle(`🎫 تذكرتك #${meta.number} انقفلت`).setDescription(
            pending ? 'شكراً لتعاملك معنا 💙\nقيّم تجربتك من الأزرار تحت ⭐' : `شكراً لتواصلك مع **${config.serverName}** 💙`,
          ),
        ],
        components: pending ? [reviewRow(meta.orderId)] : [],
        files: [dmFile],
      })
      .catch(() => {});
  }

  await sleep(5000);
  await i.channel.delete(`Ticket #${meta.number} closed by ${i.user.tag}`).catch(() => {});
}

// ───── تسليم الطلب (للأونر) ─────
function deliverAsk(i) {
  if (!isOwner(i.member)) return fail(i, 'هذا الزر للإدارة فقط.');
  const meta = db.data.tickets.meta[i.channelId];
  if (!meta) return fail(i, 'هذا مو روم تذكرة.');
  if (meta.orderId) return fail(i, `الطلب مسجل من قبل (#${meta.orderId}).`);
  const product = meta.productId ? db.data.products.items[meta.productId] : null;
  return i.showModal(modal('ticket:delivered', 'تسليم الطلب', [
    { id: 'product', label: 'المنتج', value: product?.name, max: 100 },
    { id: 'price', label: 'السعر', value: product?.price, max: 50 },
    { id: 'note', label: 'ملاحظات (اختياري)', paragraph: true, required: false, max: 500 },
  ]));
}

async function delivered(i) {
  const meta = db.data.tickets.meta[i.channelId];
  if (!meta || !isOwner(i.member)) return fail(i, 'غير مسموح.');
  if (meta.orderId) return fail(i, `الطلب مسجل من قبل (#${meta.orderId}).`);

  const productName = i.fields.getTextInputValue('product');
  const price = i.fields.getTextInputValue('price');
  const note = i.fields.getTextInputValue('note');
  const orderId = ++db.data.orders.counter;
  meta.orderId = orderId;
  db.data.orders.pendingReviews[orderId] = { userId: meta.userId, product: productName, price, at: Date.now() };
  db.save();

  await log(i.guild, 'logOrders', embed(config.colors.success)
    .setTitle(`📦 طلب مكتمل #${orderId}`)
    .addFields(
      { name: 'العميل', value: `<@${meta.userId}> \`${meta.userId}\``, inline: true },
      { name: 'المنتج', value: cut(productName, 200), inline: true },
      { name: 'السعر', value: cut(price, 100), inline: true },
      { name: 'سلّمه', value: `${i.user}`, inline: true },
      { name: 'التذكرة', value: `#${meta.number}`, inline: true },
      ...(note ? [{ name: 'ملاحظات', value: cut(note, 1024) }] : []),
    ));

  await i.channel.send({
    content: `<@${meta.userId}>`,
    embeds: [
      embed(config.colors.success)
        .setTitle('✅ تم تسليم طلبك')
        .setDescription(`**${productName}** — ${price}\n\nشكراً لثقتك في **${config.serverName}** 💙\nقيّم تجربتك من الأزرار تحت ⭐`),
    ],
    components: [reviewRow(orderId)],
  });
  return ok(i, `تم تسجيل الطلب #${orderId}`);
}

// ───── التقييمات ─────
function reviewAsk(i, orderId, stars) {
  const p = db.data.orders.pendingReviews[orderId];
  if (!p) return fail(i, 'التقييم غير متاح أو تم التقييم من قبل.');
  if (p.userId !== i.user.id) return fail(i, 'التقييم لصاحب الطلب فقط.');
  return i.showModal(modal(`review:submit:${orderId}:${stars}`, `تقييمك ${'⭐'.repeat(stars)}`, [
    { id: 'comment', label: 'اكتب رأيك (اختياري)', paragraph: true, required: false, max: 500 },
  ]));
}

async function reviewSubmit(i, orderId, stars) {
  const p = db.data.orders.pendingReviews[orderId];
  if (!p || p.userId !== i.user.id) return fail(i, 'التقييم غير متاح.');
  delete db.data.orders.pendingReviews[orderId];
  db.data.stats.reviews++;
  db.data.stats.ratingSum += stars;
  db.save();

  const guild = i.guild ?? getGuild(i.client);
  const comment = i.fields.getTextInputValue('comment');
  const ch = guild && channel(guild, 'reviews');
  if (ch) {
    await ch.send({
      embeds: [
        embed(config.colors.gold)
          .setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() })
          .setTitle(`${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}`)
          .setDescription(comment ? `> ${cut(comment, 500)}` : '> بدون تعليق')
          .addFields(
            { name: '🛍️ المنتج', value: cut(p.product, 200), inline: true },
            { name: '🧾 الطلب', value: `#${orderId}`, inline: true },
            { name: '👤 العميل', value: `<@${i.user.id}>`, inline: true },
          ),
      ],
    }).then((m) => m.react('💙').catch(() => {})).catch(() => {});
  }

  if (i.isFromMessage()) {
    await i.update({ components: [] }).catch(() => {});
    return i.followUp({ content: '💙 شكراً على تقييمك!', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return ok(i, 'شكراً على تقييمك 💙');
}

module.exports = { openModal, create, closeAsk, close, deliverAsk, delivered, reviewAsk, reviewSubmit };
