// line-webhook-free.js
// เวอร์ชันฟรี 100% - ไม่ใช้ Anthropic API (ไม่มีค่าใช้จ่ายส่วนนี้)
// ใช้ระบบเมนู + ค้นหาคำสำคัญจากไฟล์ products.json แทน AI
// ต้องมีไฟล์ products.json อยู่โฟลเดอร์เดียวกัน

const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');

const config = {
  channelAccessToken: WoK3+2ucrOTNVYf8muyoA2UN9q8FJ8+oDPlZ84R/tyUJGP8JlHTxnO6RO4IdEyBIhfTqVD+sRTCsdaYf7dmrwK+7WGHmP2UJD8wMZMnah2pBUT0JQoY2Gy2Fle3W3Npy/R0OyrwBLrwBvyHLfmYpJQdB04t89/1O/w1cDnyilFU=',
  channelSecret: '7dc1cc53f8a402edaa2095f5c82b729d',
};

const app = express();
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// ---------- โหลดข้อมูลสินค้า ----------
const productData = JSON.parse(fs.readFileSync('./products.json', 'utf8'));

function buildShopListText() {
  return productData.shops
    .map((s) => `${s.id}. ${s.name} — ${s.category}${s.phone ? `\n   โทร ${s.phone}` : ''}`)
    .join('\n');
}

function buildShopDetailText(shopId) {
  const shop = productData.shops.find((s) => s.id === shopId);
  if (!shop) return null;
  const items = shop.products
    .map((p) => `• ${p.name} — ${p.price ? `฿${p.price.toLocaleString()}` : 'สอบถามราคา'}`)
    .join('\n');
  return `${shop.id}. ${shop.name}\n${shop.category}\n${shop.phone ? `โทร ${shop.phone}\n` : ''}${shop.address ? `${shop.address}\n` : ''}\nสินค้า:\n${items}`;
}

// ค้นหาสินค้าจากคำค้น (ค้นในชื่อสินค้าและหมวดหมู่ร้าน)
function searchProducts(keyword) {
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

function buildSearchResultText(keyword, results) {
  if (results.length === 0) {
    return `ไม่พบสินค้าที่ตรงกับ "${keyword}" ค่ะ\nลองพิมพ์ "รายชื่อร้าน" เพื่อดูร้านทั้งหมด หรือพิมพ์คำอื่น เช่น "เนคไท" "กระเป๋า" "หมวก" "เสื้อโปโล"`;
  }
  const lines = results
    .slice(0, 8) // จำกัดไม่เกิน 8 รายการ กันข้อความยาวเกินไป
    .map((r) => `• ${r.product.name} — ฿${r.product.price?.toLocaleString() || 'สอบถาม'}\n  ร้าน ${r.shop.id} ${r.shop.name}${r.shop.phone ? ` โทร ${r.shop.phone}` : ''}`);
  return `พบสินค้าที่เกี่ยวข้อง ${results.length} รายการ:\n\n${lines.join('\n\n')}`;
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

  if (text.includes('สวัสดี') || text.toLowerCase() === 'hello') {
    return reply(
      event,
      'สวัสดีค่ะ ยินดีต้อนรับสู่ร้านค้าสโมสร วปอ. 🙏\n\nพิมพ์ "รายชื่อร้าน" ดูร้านทั้งหมด\nพิมพ์เลขร้าน เช่น "01" ดูสินค้าร้านนั้น\nหรือพิมพ์คำค้น เช่น "เนคไท" "กระเป๋า" "หมวก" "เสื้อโปโล" เพื่อค้นหาสินค้า'
    );
  }

  if (text.includes('รายชื่อร้าน')) {
    return reply(event, buildShopListText());
  }

  const shopIdMatch = text.match(/^\d{1,2}$/);
  if (shopIdMatch) {
    const paddedId = text.padStart(2, '0');
    const detail = buildShopDetailText(paddedId);
    if (detail) return reply(event, detail);
  }

  if (text.includes('ติดต่อ') || text.includes('แอดมิน')) {
    return reply(event, 'แอดมินจะติดต่อกลับโดยเร็วที่สุดค่ะ 🙏\nหรือติดต่อร้านค้าที่ต้องการโดยตรงตามเบอร์ในรายชื่อร้านได้เลยค่ะ');
  }

  // ค้นหาสินค้าจากคำที่พิมพ์มา
  const results = searchProducts(text);
  return reply(event, buildSearchResultText(text, results));
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
// npm install express @line/bot-sdk
// (ไม่ต้องติดตั้ง @anthropic-ai/sdk แล้ว เพราะไม่ใช้ AI)
// ต้องมีไฟล์ products.json อยู่โฟลเดอร์เดียวกัน
//
// ทดสอบใน LINE:
// - พิมพ์ "สวัสดี" -> เมนูต้อนรับ
// - พิมพ์ "รายชื่อร้าน" -> ดูร้านทั้งหมด
// - พิมพ์ "01" -> ดูสินค้าร้าน Alex
// - พิมพ์ "เนคไท" -> ค้นสินค้าที่มีคำว่าเนคไททุกร้าน
