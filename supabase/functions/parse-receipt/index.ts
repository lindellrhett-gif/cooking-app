// Reads a photographed grocery receipt and returns structured items.
//
// This function exists so the Anthropic API key never ships inside the app.
// Anything bundled into an Expo build can be read by anyone who installs it,
// so the key lives only in Supabase's secret store:
//
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Nothing here writes to the pantry. It returns candidates; the review screen
// in the app is what decides. A silently wrong parse that poisons the pantry
// would break recipe matching in a way a user cannot diagnose.

import Anthropic from 'npm:@anthropic-ai/sdk@0.124.0';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

// Sonnet rather than Opus: about 2.4x cheaper per scan, and the review screen
// means a misread line costs the user a tap rather than a corrupted pantry.
const MODEL = 'claude-sonnet-5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/**
 * The shape Claude must return. Written as a raw JSON schema rather than
 * through the Zod helper so this Deno function has one fewer npm dependency
 * to keep in step.
 */
const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['store', 'purchased_on', 'items'],
  properties: {
    store: {
      type: ['string', 'null'],
      description: 'Shop name as printed, or null if not legible.',
    },
    purchased_on: {
      type: ['string', 'null'],
      description: 'Purchase date as YYYY-MM-DD, or null if not legible.',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['raw_line', 'guessed_name', 'ingredient_slug', 'quantity', 'unit', 'confidence'],
        properties: {
          raw_line: {
            type: 'string',
            description: 'The line exactly as printed, so a human can check your reading.',
          },
          guessed_name: {
            type: 'string',
            description: 'Plain English name of the food, e.g. "2% milk".',
          },
          ingredient_slug: {
            type: ['string', 'null'],
            description:
              'Slug from the supplied ingredient list, or null when nothing is a confident match.',
          },
          quantity: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `You read photographs of grocery receipts and return the food items on them.

How to read a receipt:
- Supermarket receipts abbreviate heavily and drop vowels. "GV MLK 2%" is Great Value 2% milk. "BNLS SKNLS CHKN BRST" is boneless skinless chicken breast. "ORG BABY SPNCH" is organic baby spinach. Work out the food, then discard the brand.
- Weighed items print as a weight and a price per unit on their own line. Attach that to the item above it.
- Skip anything that is not food: bags, cleaning products, toiletries, gift cards, bottle deposits.
- Skip totals, subtotals, tax, change, loyalty points, coupons and discount lines.
- A discount line that names a product is not a second purchase of it.

Matching to the ingredient list:
- Set ingredient_slug to the closest slug from the supplied list, using the aliases to guide you.
- Match the base food, not the brand or the packaging. Any brand of penne is "penne".
- Prefer the more general entry when unsure. Jasmine rice is "white-rice".
- Set ingredient_slug to null when nothing is a good match. A null is easy for the user to fix; a wrong slug quietly puts the wrong thing in their pantry.

Confidence:
- high: you can read the line and the food is unambiguous.
- medium: the line is readable but the food or the match involved a judgement call.
- low: the print is unclear, or you are guessing.

If the image is not a receipt, or nothing on it is legible, return an empty items array rather than inventing entries.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return json({ error: 'ANTHROPIC_API_KEY is not set on this project.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Caller's identity. Row-level security applies to everything read through
  // this client, so it cannot reach another household's scan.
  const asUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Not signed in.' }, 401);

  let scanId: string;
  try {
    ({ scanId } = await req.json());
  } catch {
    return json({ error: 'Expected a JSON body with scanId.' }, 400);
  }
  if (!scanId) return json({ error: 'Missing scanId.' }, 400);

  // RLS means this returns nothing unless the caller belongs to the household
  // that owns the scan. No separate membership check is needed.
  const { data: scan, error: scanError } = await asUser
    .from('receipt_scans')
    .select('id, household_id, storage_path, status')
    .eq('id', scanId)
    .maybeSingle();

  if (scanError) return json({ error: scanError.message }, 500);
  if (!scan) return json({ error: 'No such scan, or it is not yours.' }, 404);

  // Service role only for reading the image out of the private bucket.
  const asService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const markFailed = async (message: string) => {
    await asService
      .from('receipt_scans')
      .update({ status: 'failed', error: message })
      .eq('id', scanId);
  };

  const { data: file, error: fileError } = await asService.storage
    .from('receipts')
    .download(scan.storage_path);

  if (fileError || !file) {
    await markFailed(fileError?.message ?? 'Image not found in storage.');
    return json({ error: 'Could not read the uploaded image.' }, 500);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > 8 * 1024 * 1024) {
    await markFailed('Image too large.');
    return json({ error: 'That image is too large. Retake it at a lower resolution.' }, 413);
  }

  const mediaType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';

  // Ordered by slug so the prompt is stable and easy to diff between runs.
  const { data: ingredients, error: ingError } = await asService
    .from('ingredients')
    .select('slug, display_name, aliases')
    .order('slug');

  if (ingError) {
    await markFailed(ingError.message);
    return json({ error: 'Could not load the ingredient list.' }, 500);
  }

  const dictionary = (ingredients ?? [])
    .map((i) => {
      const aliases = (i.aliases ?? []).join(', ');
      return `${i.slug} | ${i.display_name}${aliases ? ` | also called: ${aliases}` : ''}`;
    })
    .join('\n');

  const client = new Anthropic({ apiKey: anthropicKey });

  try {
    const message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        // Abbreviation-guessing is exactly the kind of small inference that
        // benefits from thinking. Medium effort keeps a routine scan cheap.
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
        },
        system: [
          {
            type: 'text',
            text: INSTRUCTIONS,
          },
          {
            type: 'text',
            text: `Ingredient list. Each line is: slug | name | aliases\n\n${dictionary}`,
            // Deliberately not cached. Cache entries live five minutes and
            // break even only across two requests inside that window, but
            // receipts get scanned days apart. Marking this block would pay
            // the 1.25x write premium on every scan and never collect a read.
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: encodeBase64(bytes) },
              },
              {
                type: 'text',
                text: 'Read this receipt and return the food items on it.',
              },
            ],
          },
        ],
      })
      .finalMessage();

    // A refusal returns HTTP 200 with no usable content, so it has to be
    // checked before reading the body.
    if (message.stop_reason === 'refusal') {
      await markFailed('The model declined to read this image.');
      return json({ error: 'That image could not be processed. Try a different photo.' }, 422);
    }

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      await markFailed('No text block in the response.');
      return json({ error: 'Got an unreadable response. Try again.' }, 502);
    }

    const parsed = JSON.parse(textBlock.text);

    await asService
      .from('receipt_scans')
      .update({ status: 'parsed', parsed_payload: parsed, error: null })
      .eq('id', scanId);

    return json({
      ...parsed,
      // Surfaced so the real cost per scan can be checked against the
      // estimate rather than assumed.
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await markFailed(detail);
    return json({ error: `Could not read that receipt: ${detail}` }, 502);
  }
});
