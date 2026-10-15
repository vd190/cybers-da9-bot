// المنتجات: إضافة / تعديل / حالة / حذف
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('./db');
const { embed, ok, fail, reply, channel, cut } = require('./util');

const IMG_DIR = path.join(__dirname, '..', 'data', 'products');
const imgPath = (p) => (p.imageFile ? path.join(IMG_DIR, p.imageFile) : null);

function productEmbed(p) {
  const e = embed(p.available ? config.color : config.colors.danger)
    .setTitle(p.name)
    .setDescription(cut(`${p.description}\n​`, 4000))
    .addFields(
      { name: '💰 السعر • Price', value: `**${p.price}**`, inline: true },
      { name: '📦 الحالة • Status', value: p.available ? '✅ متوفر • Available' : '❌ نفذت الكمية • Sold out', inline: true },
      { name: '​', value: '🛒 اضغط **شراء** تحت وبتنفتح لك تذكرة\n🛒 Click **Buy** below to open a ticket' },
    )
    .setFooter({ text: `${config.serverName} • منتج / Product #${p.id}` });
  if (p.imageFile) e.setImage(`attachment://${p.imageFile}`);
  return e;
}

function productRow(p) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`buy:${p.id}`)
      .setLabel(p.available ? 'شراء • Buy' : 'غير متوفر • Sold out')
      .setEmoji('🛒')
      .setStyle(p.available ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!p.available),
  );
}

async function post(guild, p) {
  const ch = channel(guild, 'products');
  if (!ch) throw new Error('روم المنتجات غير موجود — شغّل /setup');
  const files = p.imageFile && fs.existsSync(imgPath(p))
    ? [new AttachmentBuilder(imgPath(p), { name: p.imageFile })]
    : [];
  const msg = await ch.send({ embeds: [productEmbed(p)], components: [productRow(p)], files });
  p.messageId = msg.id;
  db.save();
  return msg;
}

async function refresh(guild, p) {
  const ch = channel(guild, 'products');
  const msg = await ch?.messages.fetch(p.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [productEmbed(p)], components: [productRow(p)] });
  else await post(guild, p);
}

async function repostAll(guild) {
  for (const p of Object.values(db.data.products.items)) await post(guild, p).catch(() => {});
}

// | = سطر جديد ، || = سطر فاضي ، --- = خط فاصل
const text = (s) => s
  ?.replace(/\s*---\s*/g, '\n━━━━━━━━━━━━━━━━━━\n')
  .replace(/\\n|\s*\|\s*/g, '\n')
  .trim();

async function handle(i) {
  const sub = i.options.getSubcommand();
  const items = db.data.products.items;

  if (sub === 'add') {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const id = String(++db.data.products.counter);
    const p = {
      id,
      name: i.options.getString('name'),
      price: i.options.getString('price'),
      description: text(i.options.getString('description')),
      available: true,
      imageFile: null,
      messageId: null,
    };
    const img = i.options.getAttachment('image');
    if (img) {
      if (!img.contentType?.startsWith('image/')) return i.editReply('❌ الملف لازم يكون صورة.');
      const ext = (img.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      fs.mkdirSync(IMG_DIR, { recursive: true });
      p.imageFile = `product-${id}.${ext}`;
      const file = imgPath(p);
      const buf = Buffer.from(await (await fetch(img.url)).arrayBuffer());
      fs.writeFileSync(file, buf);
    }
    items[id] = p;
    db.save();
    try {
      await post(i.guild, p);
    } catch (e) {
      return i.editReply(`❌ ${e.message}`);
    }
    return i.editReply(`✅ انضاف المنتج **${p.name}** (رقم #${id}) في <#${db.data.channels.products}>`);
  }

  const id = i.options.getString('id');
  if (sub !== 'list' && !items[id]) return fail(i, `ما فيه منتج رقمه #${id}. شوف \`/product list\``);

  if (sub === 'edit') {
    const p = items[id];
    p.name = i.options.getString('name') ?? p.name;
    p.price = i.options.getString('price') ?? p.price;
    p.description = text(i.options.getString('description')) ?? p.description;
    db.save();
    await refresh(i.guild, p);
    return ok(i, `تم تعديل المنتج **${p.name}**`);
  }

  if (sub === 'status') {
    const p = items[id];
    p.available = i.options.getBoolean('available');
    db.save();
    await refresh(i.guild, p);
    return ok(i, `**${p.name}** صار ${p.available ? '✅ متوفر' : '❌ غير متوفر'}`);
  }

  if (sub === 'remove') {
    const p = items[id];
    const ch = channel(i.guild, 'products');
    await (await ch?.messages.fetch(p.messageId).catch(() => null))?.delete().catch(() => {});
    if (p.imageFile) fs.rmSync(imgPath(p), { force: true });
    delete items[id];
    db.save();
    return ok(i, `انحذف المنتج **${p.name}**`);
  }

  if (sub === 'list') {
    const list = Object.values(items);
    if (!list.length) return reply(i, 'ما فيه منتجات للحين. أضف بـ `/product add`');
    return reply(i, {
      embeds: [
        embed().setTitle('🛍️ المنتجات').setDescription(
          list.map((p) => `\`#${p.id}\` ${p.available ? '✅' : '❌'} **${p.name}** — ${p.price}`).join('\n'),
        ),
      ],
    });
  }
}

module.exports = { handle, repostAll };
