// line-webhook-v3.js
// เวอร์ชันใช้ข้อมูลสินค้าจริงจาก products.json
// ต้องมีไฟล์ products.json อยู่โฟลเดอร์เดียวกัน

const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const config = {
  channelAccessToken: 'YOUR_CHANNEL_ACCESS_TOKEN',
  channelSecret: 'YOUR_CHANNEL_SECRET',
};

const app = express();
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const anthropic = new Anthropic({ apiKey: 'YOUR_ANTHROPIC_API_KEY' });

// ---------- โหลดข้อมูลสินค้า ----------
const productData = JSON.parse(fs.readFileSync('./products.json', 'utf8'));

// สร้างข้อความสรุปร้านค้าทั้งหมด (ใช้ตอบเมื่อพิมพ์ "รายชื่อร้าน")
function buildShopListText() {
  return productData.shops
    .map((s) => `${s.id}. ${s.name} — ${s.category}${s.phone ? `\n   โทร ${s.phone}` : ''}`)
    .join('\n');
}

// สร้างข้อความสินค้าของร้านเดียว (ใช้ตอบเมื่อพิมพ์เลขร้าน เช่น "01")
function buildShopDetailText(shopId) {
  const shop = productData.shops.find((s) => s.id === shopId);
  if (!shop) return null;
  const items = shop.products
    .map((p) => `• ${p.name} — ${p.price ? `฿${p.price.toLocaleString()}` : 'สอบถามราคา'}`)
    .join('\n');
  return `${shop.id}. ${shop.name}\n${shop.category}\n${shop.phone ? `โทร ${shop.phone}\n` : ''}${shop.address ? `${shop.address}\n` : ''}\nสินค้า:\n${items}`;
}

// สร้าง system prompt ให้ Claude รู้ข้อมูลสินค้าทั้งหมด (แบบย่อ ประหยัด token)
function buildSystemPrompt() {
  const summary = productData.shops
    .map((s) => {
      const items = s.products.map((p) => `${p.name} ฿${p.price || '?'}`).join(', ');
      return `ร้าน ${s.id} ${s.name} (${s.category}${s.phone ? `, โทร ${s.phone}` : ''}): ${items}`;
    })
    .join('\n');

  return `คุณเป็นแอดมินบอทร้านค้าสโมสร วปอ. (วิทยาลัยป้องกันราชอาณาจักร) ตอบสุภาพ กระชับ เป็นกันเอง
ข้อมูลอัปเดตล่าสุด: ${productData.updated}

รายชื่อร้านค้าและสินค้าทั้งหมด:
${summary}

กติกาการตอบ:
- ถ้าลูกค้าถามหาสินค้า ให้บอกชื่อร้าน ราคา และเบอร์โทรร้านนั้น (ถ้ามี)
- ถ้าลูกค้าอยากสั่งซื้อ ให้แนะนำให้ติดต่อร้านโดยตรงตามเบอร์ที่ให้ไว้ หรือถ้าไม่มีเบอร์ให้แจ้งว่าจะส่งต่อให้แอดมินช่วยประสานงาน
- ถ้าไม่แน่ใจหรือไม่มีข้อมูล ให้บอกตามตรงว่าไม่มีข้อมูล อย่าเดาราคาเอง`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

async function askClaude(userText) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText }],
  });
  return msg.content[0].text;
}

// ---------- Webhook ----------
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

  // คำสั่งลัด: "สวัสดี" -> เมนูต้อนรับ
  if (text.includes('สวัสดี') || text.toLowerCase() === 'hello') {
    return reply(
      event,
      'สวัสดีค่ะ ยินดีต้อนรับสู่ร้านค้าสโมสร วปอ. 🙏\nพิมพ์ "รายชื่อร้าน" เพื่อดูร้านค้าทั้งหมด\nหรือพิมพ์เลขร้าน (เช่น "01") เพื่อดูสินค้าของร้านนั้น\nหรือพิมพ์คำถาม/ชื่อสินค้าที่ต้องการหา เช่น "มีเนคไทสีฟ้าไหม"'
    );
  }

  // "รายชื่อร้าน" -> แสดงร้านทั้งหมด
  if (text.includes('รายชื่อร้าน')) {
    return reply(event, buildShopListText());
  }

  // เลขร้าน เช่น "01" หรือ "3" -> แสดงสินค้าร้านนั้น
  const shopIdMatch = text.match(/^\d{1,2}$/);
  if (shopIdMatch) {
    const paddedId = text.padStart(2, '0');
    const detail = buildShopDetailText(paddedId);
    if (detail) return reply(event, detail);
  }

  // นอกนั้นให้ Claude ตอบแบบเข้าใจภาษาธรรมชาติ โดยรู้ข้อมูลสินค้าทั้งหมด
  const aiReply = await askClaude(text);
  return reply(event, aiReply);
}

function reply(event, text) {
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text }],
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// วิธีติดตั้ง:
// npm install express @line/bot-sdk @anthropic-ai/sdk
// ต้องมีไฟล์ products.json อยู่โฟลเดอร์เดียวกับไฟล์นี้
//
// ทดสอบใน LINE:
// - พิมพ์ "สวัสดี" -> เมนูต้อนรับ
// - พิมพ์ "รายชื่อร้าน" -> ดูร้านทั้งหมด 12 ร้าน
// - พิมพ์ "01" -> ดูสินค้าร้าน Alex ทั้งหมด
// - พิมพ์ "มีเนคไทสีฟ้าไหม" -> AI ค้นหาให้และบอกราคา+เบอร์ร้าน
