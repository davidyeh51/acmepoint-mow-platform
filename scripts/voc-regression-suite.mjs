// 無外部依賴；以原始程式搭配記憶體替身驗證，不連線、不發送訊息。
export async function runVocRegressionTests({ html, webhook, schema, migration }) {
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const check = async (name, fn) => {
    try { await fn(); results.push({ name, passed: true }); }
    catch (error) { results.push({ name, passed: false, error: error.message }); }
  };
  const table = schema.match(/CREATE TABLE IF NOT EXISTS public\.mow_voc_tickets \(([\s\S]*?)\n\);/);
  assert(table, 'VOC schema must exist');
  const columns = new Set([...table[1].matchAll(/^\s+([a-z_]+)\s+[A-Z]/gm)].map(match => match[1]));
  const validPayload = payload => {
    for (const key of Object.keys(payload)) assert(columns.has(key), 'Unknown VOC column: ' + key);
    assert(typeof payload.customer_content === 'string', 'customer_content is required');
  };
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(inline, 'Application script must exist');

  function app({ databaseError = null, rejectRequest = false, connected = true } = {}) {
    const memory = new Map();
    const elements = new Map();
    const alerts = [];
    const writes = [];
    const ticket = {
      ticket_no: 'TEST-001', field_name: '測試案場', severity: 'B:重要但非緊急',
      category: '監控斷線', channel: 'Line@官方號', handler: 'tester',
      report_date: '2026-10-21', close_date: '', status: '進行中', hours: '1.5',
      content: 'INV 通訊中斷', front_chat: '已受理', back_ops: '待工程師排查',
      confirmer: '', confirmed_at: ''
    };
    const input = {
      vocFormTicketNo: ticket.ticket_no, vocFormFieldName: ticket.field_name,
      vocFormSeverity: ticket.severity, vocFormCategory: ticket.category,
      vocFormChannel: ticket.channel, vocFormHandler: ticket.handler,
      vocFormReportDate: ticket.report_date, vocFormCloseDate: '',
      vocFormStatus: ticket.status, vocFormHours: ticket.hours,
      vocFormContent: ticket.content, vocFormFrontChat: ticket.front_chat,
      vocFormBackOps: ticket.back_ops, vocFormConfirmer: '', vocFormConfirmedAt: '',
      mockLineSender: '測試客戶', mockLineSite: ticket.field_name,
      mockLineSeverity: ticket.severity, mockLineHandler: ticket.handler,
      mockLineContent: ticket.content
    };
    const document = {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {
          value: input[id] || '', checked: false,
          classList: { add() {}, remove() {} }
        });
        return elements.get(id);
      }
    };
    const localStorage = {
      getItem: key => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value)
    };
    const supabase = { from(tableName) {
      assert(tableName === 'mow_voc_tickets', 'Unexpected table');
      return { async upsert(payload, options) {
        writes.push({ payload, options });
        if (rejectRequest) throw new Error('network unavailable');
        return { error: databaseError };
      } };
    } };
    const runtime = Function('window', 'document', 'localStorage', 'alert', 'prompt', 'console',
      inline + '\n' + [
        'renderTimeline = renderVocTable = updateVocCounters = filterVocTable = clearVocFilters = switchView = () => {};',
        'sendLarkNotification = async () => {};',
        'return { toVocDatabaseRecord, syncVocRecordToCloud, vocStorageMessage, saveVocRecord, submitLineMockTicket, quickConfirmVocTicket,',
        'setState(client, connected, records) { supabaseClient = client; isSupabaseConnected = connected; vocRecords = records; } };'
      ].join('\n')
    )({ addEventListener() {} }, document, localStorage, value => alerts.push(value),
      () => '測試確認者', { warn() {}, error() {} });
    runtime.setState(supabase, connected, [ticket]);
    return { runtime, ticket, alerts, writes, memory, elements };
  }

  await check('frontend payload uses SQL columns and preserves VOC content', () => {
    const { runtime, ticket } = app();
    const payload = runtime.toVocDatabaseRecord(ticket);
    validPayload(payload);
    assert(payload.customer_content === ticket.content, 'Lost customer content');
    assert(payload.front_desk_reply === ticket.front_chat, 'Lost front desk reply');
    assert(payload.back_desk_notes === ticket.back_ops, 'Lost back desk notes');
    assert(payload.hours_spent === '1.5', 'Lost hours');
    assert(payload.close_date === null && payload.confirmed_at === null, 'Empty dates must be null');
  });
  await check('save updates by unique ticket_no and reports cloud success', async () => {
    const a = app();
    await a.runtime.saveVocRecord();
    assert(a.writes.length === 1, 'Expected one write');
    validPayload(a.writes[0].payload);
    assert(a.writes[0].options.onConflict === 'ticket_no', 'Upsert must use ticket_no');
    assert(a.alerts.at(-1).includes('本機與雲端'), 'Missing cloud success message');
  });
  await check('new VOC saves use the same schema mapping', async () => {
    const a = app();
    a.elements.set('vocFormTicketNo', { value: 'TEST-NEW' });
    await a.runtime.saveVocRecord();
    validPayload(a.writes[0].payload);
    assert(a.writes[0].payload.ticket_no === 'TEST-NEW', 'Wrong new ticket');
    assert(JSON.parse(a.memory.get('mow_custom_voc'))[0].ticket_no === 'TEST-NEW', 'Missing local new ticket');
  });
  await check('database errors retain local edits and report cloud failure', async () => {
    const a = app({ databaseError: { message: 'column not found' } });
    await a.runtime.saveVocRecord();
    assert(a.alerts.at(-1).includes('雲端同步失敗'), 'Must disclose resolved Supabase errors');
    assert(JSON.parse(a.memory.get('mow_custom_voc'))[0].content === a.ticket.content, 'Local edit was lost');
  });
  await check('network rejection reports cloud failure', async () => {
    const a = app({ rejectRequest: true });
    await a.runtime.saveVocRecord();
    assert(a.alerts.at(-1).includes('雲端同步失敗'), 'Must disclose thrown network errors');
  });
  await check('offline save stays local and does not write to the cloud', async () => {
    const a = app({ connected: false });
    await a.runtime.saveVocRecord();
    assert(a.writes.length === 0, 'Offline must not write');
    assert(a.alerts.at(-1).includes('離線模式'), 'Must identify local-only storage');
  });
  await check('LINE simulator writes canonical SQL fields', async () => {
    const a = app();
    await a.runtime.submitLineMockTicket();
    assert(a.writes.length === 1, 'Expected simulated ticket write');
    validPayload(a.writes[0].payload);
    assert(a.writes[0].payload.customer_content.includes('INV 通訊中斷'), 'Missing simulated message');
    assert(a.alerts.at(-1).includes('模擬通報單'), 'Must label simulation');
  });
  await check('confirmation upserts historical tickets with confirmation metadata', async () => {
    const a = app();
    await a.runtime.quickConfirmVocTicket(a.ticket.ticket_no);
    const write = a.writes[0];
    assert(write, 'Confirmation must write');
    validPayload(write.payload);
    assert(write.options.onConflict === 'ticket_no', 'Historical ticket must be upserted');
    assert(write.payload.confirmer === '測試確認者', 'Missing confirmer');
    assert(Number.isFinite(Date.parse(write.payload.confirmed_at)), 'Invalid confirmation date');
  });
  await check('confirmation reports database failure while retaining the local signature', async () => {
    const a = app({ databaseError: { message: 'migration required' } });
    await a.runtime.quickConfirmVocTicket(a.ticket.ticket_no);
    assert(a.alerts.at(-1).includes('雲端同步失敗'), 'Signature sync must report failure');
    assert(JSON.parse(a.memory.get('mow_custom_voc'))[0].confirmer === '測試確認者', 'Local signature was lost');
  });
  await check('existing-database migration adds confirmation columns idempotently', () => {
    assert(/ADD COLUMN IF NOT EXISTS confirmer VARCHAR\(128\)/.test(migration), 'Missing confirmer migration');
    assert(/ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ/.test(migration), 'Missing confirmed_at migration');
    assert(columns.has('confirmer') && columns.has('confirmed_at'), 'Fresh schema missing confirmation columns');
  });

  const processSource = webhook.slice(
    webhook.indexOf('async function processLineMessage('),
    webhook.indexOf('// 模糊匹配案場名稱')
  ).replace('event: any', 'event');
  function webhookProcessor(databaseError = null) {
    const writes = [];
    const notifications = [];
    const replies = [];
    const supabase = { from() { return { async insert(payload) {
      writes.push(payload);
      return { error: databaseError };
    } }; } };
    const process = Function('supabase', 'extractSiteName', 'determineSeverity',
      'sendLarkNotification', 'replyLineMessage', 'LINE_CHANNEL_ACCESS_TOKEN', 'console',
      processSource + '\nreturn processLineMessage;'
    )(supabase, () => '測試案場', () => 'B:重要但非緊急',
      async info => notifications.push(info), async (...args) => replies.push(args),
      'TEST_TOKEN', { error() {} });
    const event = { message: { id: 'MSG-TEST', text: 'INV 通訊中斷' },
      source: { userId: 'USER-TEST' }, replyToken: 'REPLY-TEST' };
    return { process, event, writes, notifications, replies };
  }
  await check('LINE ingress saves SQL fields and source IDs before notifications', async () => {
    const a = webhookProcessor();
    await a.process(a.event);
    validPayload(a.writes[0]);
    assert(a.writes[0].line_message_id === 'MSG-TEST', 'Missing source message ID');
    assert(a.writes[0].line_user_id === 'USER-TEST', 'Missing source user ID');
    assert(a.notifications.length === 1 && a.replies.length === 1, 'Expected post-persistence notifications');
  });
  await check('failed LINE persistence prevents broadcast and success reply', async () => {
    const a = webhookProcessor({ message: 'database unavailable' });
    let failed = false;
    try { await a.process(a.event); } catch { failed = true; }
    assert(failed, 'Persistence error must propagate to HTTP handler');
    assert(a.notifications.length === 0 && a.replies.length === 0, 'Must not announce unsaved ticket');
  });

  const handlerSource = webhook.slice(webhook.indexOf('serve(async'), webhook.indexOf('// 處理單筆 Line 文字通報'))
    .replace('req: Request', 'req').replace('(error as Error).message', 'error.message');
  async function request({ secret = 'TEST_SECRET', verified = true, processingError = false, method = 'POST' } = {}) {
    let handler;
    let processed = 0;
    class FakeResponse {
      constructor(body, options = {}) { this.body = body; this.status = options.status || 200; }
    }
    Function('serve', 'Response', 'LINE_CHANNEL_SECRET', 'verifyLineSignature', 'processLineMessage',
      'console', handlerSource
    )(callback => { handler = callback; }, FakeResponse, secret, async () => verified,
      async () => { processed++; if (processingError) throw new Error('cannot persist'); }, { error() {} });
    const response = await handler({
      method, headers: { get: () => 'TEST_SIGNATURE' },
      text: async () => JSON.stringify({ events: [{ type: 'message', message: { type: 'text' } }] })
    });
    return { response, processed };
  }
  await check('unconfigured LINE secret rejects ingress without processing', async () => {
    const { response, processed } = await request({ secret: '' });
    assert(response.status === 503 && processed === 0, 'Missing secret must fail closed');
  });
  await check('invalid LINE signature rejects ingress without processing', async () => {
    const { response, processed } = await request({ verified: false });
    assert(response.status === 401 && processed === 0, 'Invalid signature must be rejected');
  });
  await check('LINE persistence failure produces HTTP 500', async () => {
    const { response } = await request({ processingError: true });
    assert(response.status === 500, 'Failure must reach LINE caller');
  });
  await check('valid LINE request succeeds after processing', async () => {
    const { response, processed } = await request();
    assert(response.status === 200 && processed === 1, 'Valid event must be processed');
  });
  await check('non-POST LINE request is rejected', async () => {
    const { response, processed } = await request({ method: 'GET' });
    assert(response.status === 405 && processed === 0, 'GET must not process events');
  });
  return results;
}
