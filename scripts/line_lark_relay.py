#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
進金生能源服務 (ACME) - 維運管理智慧營運平台
Line@ 官方號通報入庫 ✕ 飛書 Lark 群組自動廣播 中繼腳本

目標群組：【流程】業務流程整合 ft. 飛書
目標 Chat ID: oc_34f63c89b66f864c66fdb00f64f75131
"""

import sys
import os
import json
import time
import urllib.request
import urllib.error
from datetime import datetime

# 設定編碼
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

TARGET_CHAT_ID = "oc_34f63c89b66f864c66fdb00f64f75131"
TARGET_CHAT_NAME = "【流程】業務流程整合 ft. 飛書"

def build_notification_text(ticket_no, site_name, severity, content, handler="ivychung", sender="Line@ 客戶"):
    """構造飛書富文本卡片內容"""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return (
        f"【MOW 維運客服通報 (VOC) 即時通知】\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📌 通報單號：{ticket_no}\n"
        f"🚨 應變等級：{severity}\n"
        f"🏢 通報案場：{site_name}\n"
        f"👤 提報來源：{sender}\n"
        f"🛠️ 負責工程師：{handler}\n"
        f"📅 提報時間：{now_str}\n"
        f"💬 反映內容：\n{content}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🎯 推播目標：{TARGET_CHAT_NAME} (ID: {TARGET_CHAT_ID})\n"
        f"🔗 營運大盤查看：https://davidyeh51.github.io/acmepoint-mow-platform/"
    )

def send_via_webhook(webhook_url, text):
    """透過群自定義機器人 Webhook 推播"""
    headers = {"Content-Type": "application/json; charset=utf-8"}
    payload = {
        "msg_type": "text",
        "content": {"text": text}
    }
    req = urllib.request.Request(webhook_url, data=json.dumps(payload).encode('utf-8'), headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            res_data = resp.read().decode('utf-8')
            print(f"[SUCCESS] Lark Webhook 推播成功: {res_data}")
            return True
    except Exception as e:
        print(f"[ERROR] Lark Webhook 發送失敗: {e}")
        return False

def simulate_line_incoming(sender="群創光電-路科廠廠務 王組長", 
                           site="群創光電(路科FAB8)", 
                           severity="A:緊急處置", 
                           content="@進金生能源服務-客服部 您好，路科八廠 INV#02 出現電網異常告警跳脫，現場 PR 值下降 15%，請儘速派工確認！"):
    """模擬收到 Line@ 官方號訊息並觸發廣播"""
    today_str = datetime.now().strftime("%Y%m%d")
    import random
    ticket_no = f"{today_str}{random.randint(100, 999)}"
    
    print("\n" + "="*60)
    print("📲 [模擬 Line@ 官方號訊息進線]")
    print(f"發話者: {sender}")
    print(f"案場匹配: {site}")
    print(f"訊息內容: {content}")
    print("="*60)
    
    card = build_notification_text(ticket_no, site, severity, content, sender=sender)
    print("\n📢 [構造飛書通知卡片]:")
    print(card)
    print("="*60)
    print("✅ 模擬入庫 mow_voc_tickets 成功！")
    print(f"✅ 模擬推播至飛書群組「{TARGET_CHAT_NAME}」成功！\n")
    return card

if __name__ == '__main__':
    print(f"=== 進金生維運平台 Line@ ✕ 飛書中繼工具 ===")
    print(f"目標連動群組：{TARGET_CHAT_NAME}")
    print(f"目標 Chat ID：{TARGET_CHAT_ID}\n")
    
    simulate_line_incoming()
