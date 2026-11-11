
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');

const DRY_RUN = true;
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

const promotionWords = [
  'للإعلان', 'اعلان', 'إعلان', 'تسويق',
  'متوفر للبيع', 'خصم', 'عرض خاص',
  'اشترك', 'اطلب الآن', 'للطلب', 'للحجز'
];

const contactWords = [
  'تواصل', 'راسل', 'واتساب', 'خاص',
  'اتصل', 'للطلب', 'للحجز', 'احجز'
];

function getMessageText(message) {
  const content = message.message || {};

  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    ''
  ).trim();
}

function isAdvertisement(text) {
  const normalized = text.toLowerCase();

  const hasPromotion = promotionWords.some(word =>
    normalized.includes(word.toLowerCase())
  );

  const hasContact = contactWords.some(word =>
    normalized.includes(word.toLowerCase())
  );

  const hasLink = /https?:\/\/|www\./i.test(normalized);

  return hasPromotion && (hasContact || hasLink);
}

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Student Group Guard', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('امسح رمز QR لربط رقم البوت:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('البوت متصل وجاهز للمراقبة.');
      console.log('وضع التجربة مفعل: لا حذف ولا طرد.');
    }

    if (connection === 'close') {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('تم تسجيل الخروج. تحتاج إلى ربط الرقم مجدداً.');
        return;
      }

      console.log('انقطع الاتصال، إعادة المحاولة بعد قليل...');
      setTimeout(() => startBot().catch(console.error), 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const message of messages) {
      try {
        const groupId = message.key.remoteJid;

        if (
          !groupId ||
          !groupId.endsWith('@g.us') ||
          message.key.fromMe
        ) continue;

        const text = getMessageText(message);

        if (!text || !isAdvertisement(text)) continue;

        const sender = message.key.participant;
        if (!sender) continue;

        let metadata;

        try {
          metadata = await sock.groupMetadata(groupId);
        } catch {
          console.log('تعذر التحقق من مشرفي المجموعة. تم تجاهل الرسالة.');
          continue;
        }

        const participant = metadata.participants.find(
          member => member.id === sender
        );

        if (participant?.admin) continue;

        console.log('تم رصد رسالة يُحتمل أنها إعلان.');
        console.log('المجموعة:', metadata.subject);
        console.log('المرسل:', sender);
        console.log('وضع التجربة: لم يتم حذف الرسالة أو طرد العضو.');

      } catch (error) {
        console.error('خطأ أثناء فحص الرسالة:', error.message);
      }
    }
  });
}

startBot().catch(console.error);
