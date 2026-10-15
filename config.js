// ═══════════════════════════════════════════════════════════
//  Cybers DA9 — إعدادات البوت (عدّل اللي تبيه هنا)
// ═══════════════════════════════════════════════════════════
module.exports = {
  serverName: 'Cybers DA9',

  // الألوان
  color: 0x00e5ff,
  colors: {
    success: 0x2ecc71,
    danger: 0xed4245,
    warn: 0xfee75c,
    info: 0x5865f2,
    purple: 0xb43cff,
    gold: 0xf1c40f,
  },

  // الرتبتين الوحيدة في السيرفر
  roles: {
    owner: { name: '👑 Owner', color: 0xf1c40f },
    member: { name: '🛒 Member', color: 0x00e5ff },
  },

  // طرق الدفع اللي تظهر في روم طرق الدفع — عدّلها حسب اللي عندك
  payments: [
    { emoji: '💳', name: 'كروت', note: 'ترسل الكرت (الكود + صورته) داخل التذكرة فقط — نوع الكرت يتأكد منه قبل الدفع' },
    { emoji: '🪙', name: 'USDT', note: 'عنوان المحفظة والشبكة يرسلون لك داخل التذكرة فقط' },
  ],

  // أنواع التذاكر
  ticketTypes: [
    { id: 'buy', label: 'شراء منتج', emoji: '🛒', style: 'Success', description: 'تبي تشتري منتج من المتجر' },
    { id: 'support', label: 'دعم فني', emoji: '🛠️', style: 'Primary', description: 'مشكلة في منتج اشتريته' },
    { id: 'question', label: 'استفسار', emoji: '❓', style: 'Secondary', description: 'سؤال قبل الشراء' },
    { id: 'report', label: 'بلاغ', emoji: '⚠️', style: 'Danger', description: 'بلاغ عن محتال أو مشكلة' },
  ],

  protection: {
    // الحسابات الأحدث من كذا يوم تنطرد تلقائياً (حماية من الحسابات الوهمية)
    minAccountAgeDays: 7,

    // Anti-Raid: إذا دخل عدد كبير خلال ثواني يتفعل وضع الطوارئ
    raid: { joins: 7, seconds: 15, durationMinutes: 15 },

    // Anti-Spam
    spam: {
      maxMessages: 6, // أكثر من 6 رسائل
      perSeconds: 5, // خلال 5 ثواني
      duplicates: 4, // نفس الرسالة 4 مرات
      maxMentions: 4, // منشنات في رسالة وحدة
      maxLines: 25, // أسطر في رسالة وحدة
      timeoutMinutes: 10,
    },

    // نظام التحذيرات: عند الوصول للحد ينعطى تايم أوت
    warnLimit: 3,
    warnTimeoutHours: 24,

    // منع الروابط للأعضاء (روابط الدعوات ممنوعة دائماً)
    blockLinks: true,
    allowedDomains: ['tenor.com', 'giphy.com'],

    // كلمات تمنع انتحال شخصية الإدارة في الأسماء
    impersonationWords: [
      'owner', 'admin', 'support', 'staff', 'moderator', 'cybers', 'da9',
      'اداره', 'إدارة', 'ادارة', 'الدعم', 'مالك', 'اونر', 'سبورت', 'مشرف',
    ],

    // كلمات ممنوعة إضافية (عربي/إنجليزي) — أضف اللي تبيه
    badWords: [],
  },

  verifyAttempts: 3,
};
