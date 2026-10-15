import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 取得環境變數
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const LARK_WEBHOOK_URL = Deno.env.get("LARK_WEBHOOK_URL") ?? "";
const LARK_CHAT_ID = Deno.env.get("LARK_CHAT_ID") ?? "oc_34f63c89b66f864c66fdb00f64f75131"; // 目標群組：【流程】業務流程整合 ft. 飛書

// 初始化 Supabase 客戶端 (使用 Service Role 擁有後端直接寫入權限)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // 僅接受 POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-line-signature") || "";

    // 驗證 Line HMAC-SHA256 簽名 (若未設置 Secret 則放行以利測試)
    if (LINE_CHANNEL_SECRET && !(await verifyLineSignature(rawBody, signature, LINE_CHANNEL_SECRET))) {
      return new Response("Invalid Signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const events = payload.events || [];

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        await processLineMessage(event);
      }
    }

    return new Response(JSON.stringify({ status: "success", count: events.length }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("處理 Line Webhook 錯誤:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// 處理單筆 Line 文字通報
async function processLineMessage(event: any) {
  const userMessage = event.message.text.trim();
  const userId = event.source.userId || "anonymous_user";
  const replyToken = event.replyToken;

  // 1. 自動產生單號 YYYYMMDD + 3碼流水號
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSeq = String(Math.floor(Math.random() * 899) + 100);
  const ticketNo = `${todayStr}${randomSeq}`;

  // 2. 智慧案場識別 (關鍵字模糊匹配)
  const siteName = extractSiteName(userMessage) || "未指定案場 (待客服確認)";

  // 3. 自動等級判定 (A: 緊急, B: 重要, C: 例行)
  const severity = determineSeverity(userMessage);

  // 4. 入庫至 Supabase 資料表 mow_voc_tickets
  const { data, error } = await supabase.from("mow_voc_tickets").insert({
    ticket_no: ticketNo,
    field_name: siteName,
    severity: severity,
    category: "Line@ 客訴反映",
    channel: "Line@官方號",
    handler: "ivychung", // 預設客服維運窗口
    report_date: new Date().toISOString().slice(0, 10),
    status: "進行中",
    content: `[Line@ 客戶 ID: ${userId}] ${userMessage}`,
    front_chat: `客戶: ${userMessage}`,
    back_ops: `由 Line Webhook 自動立案 (單號: ${ticketNo})，待維運主管分派工程師。`,
  });

  if (error) {
    console.error("Supabase 寫入失敗:", error);
  }

  // 5. 即時廣播推播至 Lark 飛書群組「【流程】業務流程整合 ft. 飛書」
  await sendLarkNotification({
    ticketNo,
    siteName,
    severity,
    userMessage,
    userId,
    today: new Date().toISOString().slice(0, 10),
  });

  // 6. 回覆客戶 Line 確認立案
  if (LINE_CHANNEL_ACCESS_TOKEN && replyToken) {
    await replyLineMessage(replyToken, `【進金生能源服務 ✕ 維運客服部】\n您好！已為您完成通報立案：\n\n📌 工單編號：${ticketNo}\n🏢 通報案場：${siteName}\n🚨 應變等級：${severity}\n\n我們的工程師與客服管理師已在飛書工作群即時受理，將儘速排查處理並向您回報進度，感謝您的通報！`);
  }
}

// 模糊匹配案場名稱
function extractSiteName(text: string): string | null {
  const candidates = [
    "群創光電", "路科", "路科FAB8", "順益", "順益中壢", "可口可樂", "奇美", "富強鑫",
    "中租", "台合", "聚紡", "奇景", "大成", "統一", "南科", "芳生螺絲", "高興昌"
  ];
  for (const c of candidates) {
    if (text.includes(c)) return c;
  }
  return null;
}

// 根據內容自動判定程度等級
function determineSeverity(text: string): string {
  const urgentKeywords = ["全停", "跳脫", "起火", "冒煙", "高壓跳機", "沒電", "完全沒發電", "大火", "斷電"];
  for (const kw of urgentKeywords) {
    if (text.includes(kw)) return "A:緊急處置";
  }
  const importantKeywords = ["逆變器告警", "inv", "通訊中斷", "斷線", "日報異常", "pr下降", "異常"];
  for (const kw of importantKeywords) {
    if (text.toLowerCase().includes(kw)) return "B:重要但非緊急";
  }
  return "C:例行事項";
}

// 推播至 Lark 群組
async function sendLarkNotification(info: any) {
  const cardText = `【Line@ 客服通報 (VOC) 即時入庫通知】\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 通報單號：${info.ticketNo}\n` +
    `🚨 通報程度：${info.severity}\n` +
    `🏢 關聯案場：${info.siteName}\n` +
    `📱 客戶來源：Line@ 官方號 (${info.userId.substring(0, 8)}...)\n` +
    `💬 通報反映內容：\n${info.userMessage}\n` +
    `📅 提報日期：${info.today}\n` +
    `🎯 目標群組：【流程】業務流程整合 ft. 飛書 (ID: ${LARK_CHAT_ID})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 營運大盤查看：https://davidyeh51.github.io/acmepoint-mow-platform/`;

  // 若有群機器人 Webhook 則直打
  if (LARK_WEBHOOK_URL) {
    try {
      await fetch(LARK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "text",
          content: { text: cardText },
        }),
      });
      console.log("Lark Webhook 推播成功！");
    } catch (e) {
      console.error("Lark Webhook 發送失敗:", e);
    }
  } else {
    console.log("Lark 推播卡片已準備完畢:", cardText);
  }
}

// Line 簽章驗證
async function verifyLineSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
  return signature === expectedSignature;
}

// 回覆 Line 訊息
async function replyLineMessage(replyToken: string, text: string) {
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });
  } catch (err) {
    console.error("Line Reply 發送失敗:", err);
  }
}
