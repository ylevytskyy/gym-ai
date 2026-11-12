// Reads the newest sign-in code from the local Supabase mailbox (Mailpit).
// Only for the local stack: MAILBOX_URL defaults to the one `supabase start` prints.
var base = typeof MAILBOX_URL === 'undefined' ? 'http://127.0.0.1:54324' : MAILBOX_URL;
var list = json(http.get(base + '/api/v1/search?query=' + encodeURIComponent('to:' + EMAIL)).body);
if (!list.messages || list.messages.length === 0) throw new Error('No email for ' + EMAIL);
var message = json(http.get(base + '/api/v1/message/' + list.messages[0].ID).body);
var match = /\b(\d{6})\b/.exec(message.Text || message.HTML || '');
if (!match) throw new Error('No 6-digit code in the email. The email template must contain {{ .Token }}.');
output.code = match[1];
