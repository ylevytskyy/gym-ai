# AI coach security plan

Status: planning, 2026-11-13. Nothing here is built yet unless marked "in place".

## Threat model

The coach has little power. The prompt holds only the user's own words and our data (profile, plan,
health days, catalog); no third-party text reaches it, so indirect prompt injection does not apply.
A user who injects instructions breaks only their own coach. The real risks are:

1. **Harmful advice**: extreme dieting, training through an injury, a user writing about
   self-harm.
2. **Free chatbot**: the coach used as a general LLM at our cost.
3. **Health data** reaching the model provider.

## In place

- The model answers only JSON with three fields (`reply`, `adjust_plan`, `add_injuries`);
  everything else is dropped (`src/providers/chat-prompt.ts`).
- The model cannot change anything itself. A plan change is regenerated and checked against the
  schema, the catalog and the user's injuries.
- Injuries can only be added, only from the known list, so they can only restrict a plan.
- Input limits: chat message 1000 characters, feedback and custom instructions 500
  (`src/api/validation.ts`). Reply cut to 2000 characters, plan change to 500.
- Rate limit: 30 requests per 10 minutes per user, one at a time (`src/api/server.ts`).
- Message bodies are not logged.
- The system prompt says user text is a request, never an instruction to ignore the rules.

## To do, in order

1. **Cap model output.** `callModel` in `src/providers/openrouter.ts` sets no `max_tokens`; the 2000
   character cut happens after we have paid for the whole answer. Set a cap per call type (chat,
   plan).
2. **No data retention at providers.** The request sets no OpenRouter provider preferences, so it
   is unknown which provider processes chats with health data and what it keeps. Use OpenRouter's
   provider settings to deny data collection / require zero retention (check the exact parameter
   names in the OpenRouter docs) and record which providers serve the model.
3. **Check answers, not only requests.** A safety model on risky topics (self-harm, eating
   disorders, medical advice), for example Llama Guard. Check whether it is available on
   OpenRouter or must be self-hosted.
4. **Crisis messages.** When a user writes about self-harm, return a fixed reply with help
   contacts instead of the model's answer.
5. **Attack test set.** 30-50 injection attempts and dangerous requests in Ukrainian and English,
   run against the live model after every prompt or model change; track pass rate.
6. **Monitoring.** Rate of fallback replies, plan-change frequency, users hitting limits.
7. **Limits and device binding** from `docs/monetization.md` (priorities 1 and 3) also cover the
   free-chatbot risk.

## Rejected: Jev (jevai.net)

Checked 2026-11-13. jevai.net is an unofficial community site about a hosted TypeSafe AI decision
model. Jailbreak detection appears only as a use-case heading, with no accuracy, false-positive
rate or method; "prompt injection" is not mentioned. No terms for API data handling (the privacy
page is template text), no DPA or SOC 2, Ukrainian not mentioned. Sending health chats to it adds
more risk than it removes. If an input classifier is needed later, prefer an open model we can
run ourselves (Llama Guard, Prompt Guard).
