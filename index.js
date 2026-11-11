
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

const DRY_RUN = process.env.DRY_RUN !== 'false';

const adWords = [
  'للإعلان', 'اعلان', 'إعلان',
  'تسويق', 'تواصل خاص', 'اشترك',
  'متوفر للبيع', 'خصم', 'عرض خاص'
];

function isAdvertisement(message) {
  const text = message.body.toLowerCase();

  const hasAdWord = adWords.some(word =>
    text.includes(word.toLowerCase())
  );

  const hasLink = /https?:\/\/|www\./i.test(text);

  return hasAdWord || (hasLink && hasAdWord);
}

client.on('qr', qr => {
  console.log('امسح رمز QR لربط رقم البوت:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('البوت متصل وجاهز للمراقبة.');
  console.log('وضع التجربة:', DRY_RUN);
});

client.on('message', async message => {
  try {
    const chat = await message.getChat();

    if (!chat.isGroup || message.fromMe) return;

    if (isAdvertisement(message)) {
      console.log('تم رصد رسالة قد تكون إعلاناً في:', chat.name);

      if (DRY_RUN) {
        console.log('وضع التجربة: لم يتم حذف الرسالة أو طرد العضو.');
      }
    }
  } catch (error) {
    console.error('خطأ:', error.message);
  }
});

client.initialize();
