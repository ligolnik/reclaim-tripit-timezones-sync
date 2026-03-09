const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

/**
 * Send notifications about timezone sync changes via configured channels.
 * Supports Telegram and/or AWS SNS — both are optional and independent.
 * Never throws — notification failure should not crash the sync.
 */
export async function sendNotification(previousEntries, newSegments) {
  try {
    const message = buildMessage(previousEntries, newSegments);

    await sendTelegram(message);
    await sendSns(message);
  } catch (err) {
    console.log(`  WARNING: Notification failed: ${err.message}`);
  }
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log(`  WARNING: Telegram notification failed: ${res.status} ${body}`);
    } else {
      console.log('  Telegram notification sent');
    }
  } catch (err) {
    console.log(`  WARNING: Telegram notification failed: ${err.message}`);
  }
}

async function sendSns(message) {
  if (!SNS_TOPIC_ARN) return;

  if (!isValidSnsArn(SNS_TOPIC_ARN)) {
    console.log(`  WARNING: Invalid SNS_TOPIC_ARN format: ${SNS_TOPIC_ARN}`);
    return;
  }

  try {
    const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
    const region = SNS_TOPIC_ARN.split(':')[3] || process.env.AWS_REGION || 'us-east-1';
    const client = new SNSClient({ region });

    await client.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: 'Reclaim Timezone Sync',
      Message: stripMarkdown(message),
    }));

    console.log('  SNS notification sent');
  } catch (err) {
    console.log(`  WARNING: SNS notification failed: ${err.message}`);
  }
}

export function isValidSnsArn(arn) {
  return /^arn:aws:sns:[a-z0-9-]+:\d{12}:.+$/.test(arn);
}

export function stripMarkdown(text) {
  return text
    .replace(/\*([^*]+)\*/g, '$1')   // *bold*
    .replace(/_([^_]+)_/g, '$1')     // _italic_
    .replace(/`([^`]+)`/g, '$1');    // `code`
}

/**
 * Build a human-readable Markdown message describing the changes.
 */
export function buildMessage(previousEntries, newSegments) {
  const prevCount = previousEntries.length;
  const newCount = newSegments.length;

  let text = '*Reclaim Timezone Sync*\n\n';

  if (newCount === 0) {
    text += `Cleared ${prevCount} timezone ${prevCount === 1 ? 'override' : 'overrides'} — no upcoming travel.`;
    return text;
  }

  text += `Set ${newCount} timezone ${newCount === 1 ? 'override' : 'overrides'}`;
  if (prevCount > 0) {
    text += ` (was ${prevCount})`;
  }
  text += ':\n\n';

  for (const s of newSegments) {
    text += `• \`${s.timezone}\` ${s.startDate} → ${s.endDate}\n`;
    if (s.label) text += `  _${s.label}_\n`;
  }

  return text;
}

/**
 * Compare previous Reclaim entries with new segments.
 * Returns true if there are meaningful differences.
 */
export function entriesChanged(previousEntries, newSegments) {
  const toKey = (e) => `${e.startDate}|${e.endDate}|${e.timezone}`;
  const prevSet = new Set(previousEntries.map(toKey));
  const newSet = new Set(newSegments.map(toKey));

  if (prevSet.size !== newSet.size) return true;
  for (const key of newSet) {
    if (!prevSet.has(key)) return true;
  }
  return false;
}
