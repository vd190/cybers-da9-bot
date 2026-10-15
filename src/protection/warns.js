// نظام التحذيرات
const config = require('../../config');
const db = require('../db');
const { embed, log, cut } = require('../util');

async function addWarn(guild, userId, reason, byId) {
  const list = (db.data.warns[userId] ??= []);
  list.push({ reason, by: byId, at: Date.now() });
  db.save();
  const count = list.length;
  const { warnLimit, warnTimeoutHours } = config.protection;

  const e = embed(config.colors.warn)
    .setTitle('⚠️ تحذير')
    .addFields(
      { name: 'العضو', value: `<@${userId}> \`${userId}\``, inline: true },
      { name: 'بواسطة', value: `<@${byId}>`, inline: true },
      { name: 'العدد', value: `${count}/${warnLimit}`, inline: true },
      { name: 'السبب', value: cut(reason, 500) },
    );

  if (count % warnLimit === 0) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.moderatable) {
      await member
        .timeout(warnTimeoutHours * 3600_000, `وصل ${count} تحذيرات`)
        .then(() => e.addFields({ name: 'العقوبة', value: `⏳ تايم أوت ${warnTimeoutHours} ساعة` }))
        .catch(() => {});
    }
  }
  await log(guild, 'logMod', e);
  return count;
}

module.exports = { addWarn };
