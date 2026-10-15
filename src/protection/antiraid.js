// Anti-Raid + Anti-Alt + Anti-Impersonation
const { GuildVerificationLevel } = require('discord.js');
const config = require('../../config');
const db = require('../db');
const { embed, alert, log, isOwner } = require('../util');

const joins = [];
let raidTimer = null;

async function setRaidMode(guild, on, reason) {
  const p = config.protection.raid;
  clearTimeout(raidTimer);
  db.data.raid = on ? { active: true, until: Date.now() + p.durationMinutes * 60_000 } : { active: false, until: 0 };
  db.save();
  await guild
    .setVerificationLevel(on ? GuildVerificationLevel.VeryHigh : GuildVerificationLevel.High, `Raid mode ${on ? 'ON' : 'OFF'}`)
    .catch(() => {});
  if (on) raidTimer = setTimeout(() => setRaidMode(guild, false, 'انتهت المدة تلقائياً'), p.durationMinutes * 60_000);

  const e = embed(on ? config.colors.danger : config.colors.success)
    .setTitle(on ? '🚨 وضع الحماية من الرايد: مفعّل' : '✅ وضع الحماية من الرايد: متوقف')
    .setDescription(
      on
        ? `**السبب:** ${reason}\nأي شخص يدخل الحين بينطرد تلقائياً، ومستوى التحقق صار **Highest**.\nبيتوقف تلقائياً بعد ${p.durationMinutes} دقيقة.`
        : `**السبب:** ${reason}`,
    );
  await alert(guild, e);
}

// لما البوت يشتغل: نكمل مؤقت الرايد لو كان شغال
function resumeRaid(guild) {
  const { active, until } = db.data.raid;
  if (!active) return;
  const left = until - Date.now();
  if (left <= 0) setRaidMode(guild, false, 'انتهت المدة');
  else raidTimer = setTimeout(() => setRaidMode(guild, false, 'انتهت المدة تلقائياً'), left);
}

async function kickWithReason(member, why) {
  await member
    .send({
      embeds: [embed(config.colors.danger).setTitle(`🛡️ ${config.serverName}`).setDescription(`تم طردك تلقائياً:\n**${why}**`)],
    })
    .catch(() => {});
  await member.kick(`[Anti-Raid] ${why}`).catch(() => {});
  await log(member.guild, 'logSecurity', embed(config.colors.danger)
    .setTitle('🛡️ Anti-Raid — طرد تلقائي')
    .setDescription(`${member.user.tag} \`${member.id}\`\n**السبب:** ${why}`));
}

async function checkImpersonation(member) {
  if (!member || member.user.bot || isOwner(member)) return;
  const name = member.displayName.toLowerCase();
  const hit = config.protection.impersonationWords.find((w) => name.includes(w.toLowerCase()));
  if (!hit || !member.manageable) return;
  const newNick = `عضو ${member.id.slice(-4)}`;
  await member.setNickname(newNick, 'Anti-Impersonation').catch(() => {});
  await log(member.guild, 'logSecurity', embed(config.colors.warn)
    .setTitle('🎭 منع انتحال')
    .setDescription(`${member} كان اسمه **${member.user.globalName ?? member.user.username}** (فيه "${hit}") ➜ تغير لـ **${newNick}**`));
}

/** يرجع true لو العضو مسموح له يبقى */
async function handleJoin(member) {
  const p = config.protection;
  const now = Date.now();

  joins.push(now);
  while (joins.length && now - joins[0] > p.raid.seconds * 1000) joins.shift();
  if (!db.data.raid.active && joins.length >= p.raid.joins) {
    await setRaidMode(member.guild, true, `دخل ${joins.length} حساب خلال ${p.raid.seconds} ثانية`);
  }
  if (db.data.raid.active) {
    await kickWithReason(member, 'السيرفر حالياً في وضع الحماية من الرايد، حاول تدخل بعد شوي');
    return false;
  }

  const ageDays = (now - member.user.createdTimestamp) / 86_400_000;
  if (ageDays < p.minAccountAgeDays) {
    await kickWithReason(member, `حسابك جديد جداً (لازم يكون عمره ${p.minAccountAgeDays} أيام على الأقل)`);
    return false;
  }

  await checkImpersonation(member);
  return true;
}

module.exports = { handleJoin, setRaidMode, resumeRaid, checkImpersonation };
