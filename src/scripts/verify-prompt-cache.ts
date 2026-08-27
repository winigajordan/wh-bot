/**
 * Vérification manuelle prompt caching (§8.2).
 *
 * Usage :
 *   npx ts-node -r dotenv/config src/scripts/verify-prompt-cache.ts
 *
 * Deux appels successifs avec le même system + ORDERING_TOOLS :
 *   1er → cache_write > 0 (création)
 *   2e  → cache_read  > 0 (hit, seuil Anthropic dépassé)
 */
import Anthropic from '@anthropic-ai/sdk';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { restaurantOrderingModuleDefinition } from '../restaurant-ordering/restaurant-ordering.module-definition';
import { ORDERING_TOOLS } from '../restaurant-ordering/tools/ordering.tools';

loadEnv({ path: resolve(__dirname, '../../.env') });

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY manquante');
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const systemPrompt = [
    restaurantOrderingModuleDefinition.buildSystemPrompt({
      name: 'Les délices de Jordan',
      address: 'Almadies, Dakar',
      contactPhone: '+221781234567',
    }),
    'Contrainte outils : au maximum 8 tours d’appel d’outils pour produire ta réponse.',
  ].join('\n');

  const tools = ORDERING_TOOLS.map((tool, index) => {
    const base = {
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
    };
    if (index === ORDERING_TOOLS.length - 1) {
      return { ...base, cache_control: { type: 'ephemeral' as const } };
    }
    return base;
  });

  console.log(
    `Dernier tool (breakpoint cache) : ${ORDERING_TOOLS.at(-1)?.name}`,
  );
  console.log(`Longueur system prompt : ${systemPrompt.length} chars`);

  const client = new Anthropic({ apiKey });

  const params = {
    model,
    max_tokens: 64,
    system: [
      {
        type: 'text' as const,
        text: systemPrompt,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    tools,
    messages: [
      {
        role: 'user' as const,
        content: 'Bonjour, menu svp ?',
      },
    ],
  };

  const first = await client.messages.create(params);
  const second = await client.messages.create({
    ...params,
    messages: [{ role: 'user', content: 'Les grillades svp' }],
  });

  const u1 = first.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  const u2 = second.usage as Anthropic.Usage & {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };

  console.log('\n=== Appel 1 (création cache) ===');
  console.log(
    `in=${u1.input_tokens} out=${u1.output_tokens} ` +
      `cache_write=${u1.cache_creation_input_tokens ?? 0} ` +
      `cache_read=${u1.cache_read_input_tokens ?? 0}`,
  );

  console.log('\n=== Appel 2 (lecture cache) ===');
  console.log(
    `in=${u2.input_tokens} out=${u2.output_tokens} ` +
      `cache_write=${u2.cache_creation_input_tokens ?? 0} ` +
      `cache_read=${u2.cache_read_input_tokens ?? 0}`,
  );

  if ((u1.cache_creation_input_tokens ?? 0) <= 0) {
    console.warn(
      '\n⚠️  cache_write=0 au 1er appel — préfixe peut-être sous le seuil min Anthropic.',
    );
  }
  if ((u2.cache_read_input_tokens ?? 0) <= 0) {
    console.warn(
      '\n⚠️  cache_read=0 au 2e appel — pas de hit (TTL, préfixe différent, ou seuil).',
    );
  } else {
    console.log('\n✅ Cache hit confirmé (cache_read > 0).');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
