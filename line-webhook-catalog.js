// line-webhook-catalog.js
// เวอร์ชัน Flex Message Carousel — แสดงรายการร้านค้า/สินค้าพร้อมรูปภาพและปุ่มสั่งซื้อ
// ไม่ใช้ Anthropic API (ฟรี) ต้องมี products.json และโฟลเดอร์ images/ อยู่โฟลเดอร์เดียวกัน

const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const config = {
  channelAccessToken: 'YOUR_CHANNEL_ACCESS_TOKEN',
  channelSecret: 'YOUR_CHANNEL_SECRET',
};

// **สำคัญ**: เปลี่ยนเป็นโดเมน Railway จริงของคุณ (ไม่ต้องมี / ปิดท้าย)
const BASE_URL = 'https://ndcshop-line-bot-production.up.railway.app';

const app = express();
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// เปิดให้เข้าถึงรูปภาพผ่าน URL เช่น BASE_URL/images/shop-01.png
app.use('/images', express.static(path.join(__dirname, 'images')));

const productData = JSON.parse(fs.readFileSync('./products.json', 'utf8'));

function shopImageUrl(shopId) {
  return `${BASE_URL}/images/shop-${shopId}.png`;
}

// ---------- Flex Message: การ์ดรายชื่อร้านทั้งหมด (Carousel) ----------
function buildShopCarousel() {
  const bubbles = productData.shops.slice(0, 12).map((shop) => ({
    type: 'bubble',
    hero: {
      type: 'image',
      url: shopImageUrl(shop.id),
      size: 'full',
      aspectRatio: '3:2',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `${shop.id}. ${shop.name}`, weight: 'bold', size: 'lg', wrap: true },
        { type: 'text', text: shop.category, size: 'sm', color: '#999999', wrap: true },
        ...(shop.phone ? [{ type: 'text', text: `โทร ${shop.phone}`, size: 'xs', color: '#999999', wrap: true }] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#1e2761',
          action: { type: 'message', label: 'ดูสินค้าร้านนี้', text: shop.id },
        },
      ],
    },
  }));
  return { type: 'flex', altText: 'รายชื่อร้านค้าทั้งหมด', contents: { type: 'carousel', contents: bubbles } };
}

// ---------- Flex Message: การ์ดสินค้าของร้านเดียว (Carousel) ----------
function buildProductCarousel(shopId) {
  const shop = productData.shops.find((s) => s.id === shopId);
  if (!shop) return null;

  const bubbles = shop.products.slice(0, 12).map((p) => ({
    type: 'bubble',
    hero: {
      type: 'image',
      url: shopImageUrl(shop.id),
      size: 'full',
      aspectRatio: '3:2',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: p.name, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: p.price ? `฿${p.price.toLocaleString()}` : 'สอบถามราคา', size: 'xl', color: '#c9a768', weight: 'bold' },
        { type: 'text', text: `ร้าน ${shop.name}`, size: 'xs', color: '#999999', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#1e2761',
          action: { type: 'message', label: 'สั่งซื้อสินค้านี้', text: `สั่งซื้อ: ${p.name} (ร้าน ${shop.name})` },
        },
      ],
    },
  }));
  return { type: 'flex', altText: `สินค้าร้าน ${shop.name}`, contents: { type: 'carousel', contents: bubbles } };
}

// รายการคำสำคัญที่ใช้จับจากประโยคของลูกค้า (เรียงจากคำเฉพาะเจาะจงไปทั่วไป)
const KEYWORDS = [
  'กระเป๋าสาน', 'กระเป๋า', 'เนคไท', 'เข็มเนคไท', 'เข็มกลัด', 'เข็มรัฏฐาภิรักษ์',
  'หมวก', 'แจ็คเก็ต', 'เสื้อโปโล', 'เสื้อ', 'เครื่องประดับ', 'กระดุม', 'ตราปัก', 'ผ้าขนหนู', 'สติ๊กเกอร์',
];

function extractKeyword(text) {
  for (const kw of KEYWORDS) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

// ---------- ค้นหาสินค้าจากคำค้น (จับคำสำคัญในประโยคได้ แม้มีคำอื่นปนมา) ----------
function searchProducts(rawText) {
  const keyword = extractKeyword(rawText) || rawText; // ถ้าไม่เจอคำในลิสต์ ใช้ข้อความเดิมค้นแบบตรงตัว
  const results = [];
  for (const shop of productData.shops) {
    for (const p of shop.products) {
      if (p.name.includes(keyword) || shop.category.includes(keyword) || shop.name.includes(keyword)) {
        results.push({ shop, product: p });
      }
    }
  }
  return results;
}

function buildSearchResultFlex(keyword, results) {
  if (results.length === 0) return null;
  const bubbles = results.slice(0, 12).map((r) => ({
    type: 'bubble',
    hero: {
      type: 'image',
      url: shopImageUrl(r.shop.id),
      size: 'full',
      aspectRatio: '3:2',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: r.product.name, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: r.product.price ? `฿${r.product.price.toLocaleString()}` : 'สอบถามราคา', size: 'xl', color: '#c9a768', weight: 'bold' },
        { type: 'text', text: `ร้าน ${r.shop.name}`, size: 'xs', color: '#999999', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#1e2761',
          action: { type: 'message', label: 'สั่งซื้อสินค้านี้', text: `สั่งซื้อ: ${r.product.name} (ร้าน ${r.shop.name})` },
        },
      ],
    },
  }));
  return { type: 'flex', altText: `ผลการค้นหา "${keyword}"`, contents: { type: 'carousel', contents: bubbles } };
}

// ---------- ระบบสั่งซื้อแบบสนทนา (เก็บสถานะไว้ในหน่วยความจำระหว่างเซิร์ฟเวอร์ทำงาน) ----------
const sessions = new Map(); // userId -> { step, productName, shopName, shopPhone, name, phone, qty }

function ordersFilePath() {
  return path.join(__dirname, 'orders.json');
}

function saveOrder(order) {
  let orders = [];
  try {
    orders = JSON.parse(fs.readFileSync(ordersFilePath(), 'utf8'));
  } catch (e) {
    orders = [];
  }
  orders.push(order);
  fs.writeFileSync(ordersFilePath(), JSON.stringify(orders, null, 2));
}

function quickReplyQty() {
  return {
    items: [1, 2, 3, 4, 5].map((n) => ({
      type: 'action',
      action: { type: 'message', label: `${n} ชิ้น`, text: String(n) },
    })),
  };
}

function quickReplyConfirm() {
  return {
    items: [
      { type: 'action', action: { type: 'message', label: '✅ ยืนยันสั่งซื้อ', text: 'ยืนยัน' } },
      { type: 'action', action: { type: 'message', label: '❌ ยกเลิก', text: 'ยกเลิก' } },
    ],
  };
}

// เริ่มขั้นตอนสั่งซื้อ เมื่อลูกค้ากดปุ่ม "สั่งซื้อสินค้านี้"
function startOrderSession(userId, productName, shopName, shopPhone) {
  sessions.set(userId, { step: 'ask_name', productName, shopName, shopPhone });
}

// จัดการข้อความระหว่างอยู่ในขั้นตอนสั่งซื้อ คืนค่า null ถ้าไม่ได้อยู่ในเซสชัน
async function handleOrderStep(event, userId, text) {
  const session = sessions.get(userId);
  if (!session) return null;

  if (text === 'ยกเลิก') {
    sessions.delete(userId);
    return reply(event, 'ยกเลิกคำสั่งซื้อแล้วค่ะ 🙏 หากต้องการสั่งใหม่ พิมพ์ "รายชื่อร้าน" ได้เลย');
  }

  if (session.step === 'ask_name') {
    session.name = text;
    session.step = 'ask_phone';
    return reply(event, `ขอบคุณค่ะคุณ ${text}\n📱 รบกวนขอเบอร์โทรติดต่อกลับด้วยค่ะ`);
  }

  if (session.step === 'ask_phone') {
    session.phone = text;
    session.step = 'ask_qty';
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ต้องการกี่ชิ้นคะ 🛍️', quickReply: quickReplyQty() }],
    });
  }

  if (session.step === 'ask_qty') {
    const qty = parseInt(text, 10);
    if (!qty || qty < 1) {
      return reply(event, 'รบกวนพิมพ์เป็นตัวเลขจำนวนชิ้นด้วยค่ะ เช่น 1, 2, 3');
    }
    session.qty = qty;
    session.step = 'confirm';
    const summary =
      `กรุณาตรวจสอบออเดอร์ค่ะ 📋\n\n` +
      `สินค้า: ${session.productName}\n` +
      `ร้าน: ${session.shopName}\n` +
      `จำนวน: ${qty} ชิ้น\n` +
      `ชื่อผู้สั่ง: ${session.name}\n` +
      `เบอร์โทร: ${session.phone}\n\n` +
      `ยืนยันคำสั่งซื้อหรือไม่คะ?`;
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: summary, quickReply: quickReplyConfirm() }],
    });
  }

  if (session.step === 'confirm') {
    if (text === 'ยืนยัน') {
      const orderId = 'ND' + Date.now().toString().slice(-8);
      saveOrder({
        orderId,
        productName: session.productName,
        shopName: session.shopName,
        qty: session.qty,
        customerName: session.name,
        customerPhone: session.phone,
        createdAt: new Date().toISOString(),
      });
      sessions.delete(userId);
      return reply(
        event,
        `🎉 ยืนยันคำสั่งซื้อสำเร็จ!\nเลขที่ออเดอร์: ${orderId}\n\nแอดมินจะติดต่อกลับที่เบอร์ที่แจ้งไว้เพื่อนัดชำระเงิน/รับสินค้าค่ะ 🙏\nขอบคุณที่อุดหนุนร้านค้าสโมสร วปอ. นะคะ`
      );
    }
    return reply(event, 'พิมพ์ "ยืนยัน" เพื่อยืนยันคำสั่งซื้อ หรือ "ยกเลิก" เพื่อยกเลิกค่ะ', quickReplyConfirm());
  }

  return null;
}

function reply(event, text, quickReply) {
  const message = { type: 'text', text };
  if (quickReply) message.quickReply = quickReply;
  return client.replyMessage({ replyToken: event.replyToken, messages: [message] });
}


app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const text = event.message.text.trim();
  const userId = event.source.userId;

  // ถ้าอยู่ระหว่างขั้นตอนสั่งซื้อ ให้จัดการที่นี่ก่อนเงื่อนไขอื่นทั้งหมด
  const orderResult = await handleOrderStep(event, userId, text);
  if (orderResult) return orderResult;

  const greetings = ['สวัสดี', 'หวัดดี', 'ดีค่ะ', 'ดีคับ', 'ดีครับ', 'ดีจ้า', 'ทัก', 'hi', 'hello'];
  const isGreeting = greetings.some((g) => text.toLowerCase().includes(g.toLowerCase())) || text === 'ดี';

  if (isGreeting) {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: 'สวัสดีค่ะ ยินดีต้อนรับสู่ร้านค้าสโมสร วปอ. 🙏\nพิมพ์ "รายชื่อร้าน" เพื่อดูร้านทั้งหมดพร้อมรูปภาพ\nหรือพิมพ์เลขร้าน/คำค้น เช่น "เนคไท" "กระเป๋า" เพื่อดูสินค้า',
        },
      ],
    });
  }

  if (text.includes('รายชื่อร้าน')) {
    return client.replyMessage({ replyToken: event.replyToken, messages: [buildShopCarousel()] });
  }

  const shopIdMatch = text.match(/^\d{1,2}$/);
  if (shopIdMatch) {
    const paddedId = text.padStart(2, '0');
    const flex = buildProductCarousel(paddedId);
    if (flex) return client.replyMessage({ replyToken: event.replyToken, messages: [flex] });
  }

  // ปุ่ม "สั่งซื้อสินค้านี้" ส่งข้อความรูปแบบ "สั่งซื้อ: ชื่อสินค้า (ร้าน ชื่อร้าน)" -> เริ่มขั้นตอนสั่งซื้อ
  const orderMatch = text.match(/^สั่งซื้อ:\s*(.+?)\s*\(ร้าน\s*(.+?)\)$/);
  if (orderMatch) {
    const [, productName, shopName] = orderMatch;
    const shop = productData.shops.find((s) => s.name === shopName);
    startOrderSession(userId, productName, shopName, shop?.phone || '');
    return reply(event, `รับทราบค่ะ ต้องการสั่งซื้อ "${productName}"\n\n👤 รบกวนขอชื่อผู้สั่งซื้อด้วยค่ะ`);
  }

  if (text.includes('ติดต่อ') || text.includes('แอดมิน')) {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'แอดมินจะติดต่อกลับโดยเร็วที่สุดค่ะ 🙏' }],
    });
  }

  const results = searchProducts(text);
  const flex = buildSearchResultFlex(text, results);
  if (flex) {
    return client.replyMessage({ replyToken: event.replyToken, messages: [flex] });
  }
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: `ไม่พบสินค้าที่ตรงกับ "${text}" ค่ะ\nลองพิมพ์ "รายชื่อร้าน" หรือคำอื่น เช่น "เนคไท" "กระเป๋า" "หมวก"` }],
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// วิธีติดตั้ง:
// npm install express @line/bot-sdk
// ต้องมี products.json และโฟลเดอร์ images/ (มีไฟล์ shop-01.png ... shop-12.png) อยู่โฟลเดอร์เดียวกัน
//
// ทดสอบใน LINE:
// - พิมพ์ "สวัสดี" -> เมนูต้อนรับ
// - พิมพ์ "รายชื่อร้าน" -> การ์ดร้านค้าเลื่อนดูได้ 12 ใบ พร้อมปุ่ม "ดูสินค้าร้านนี้"
// - กดปุ่มหรือพิมพ์ "01" -> การ์ดสินค้าของร้านนั้น พร้อมราคาและปุ่ม "สั่งซื้อสินค้านี้"
// - กดปุ่มสั่งซื้อ -> บอทยืนยันออเดอร์อัตโนมัติ
