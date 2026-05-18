# OCAIS — Opita Code AI Stream

> Lightweight AI streaming SDK for AWS Lambda. Zero deps. TypeScript-first.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥20-green.svg)](https://nodejs.org/)

## ¿Por qué OCAIS?

Los SDKs existentes (Vercel AI SDK, LangChain) están diseñados para frameworks web fullstack. **OCAIS está diseñado para un solo caso de uso: streaming AI en AWS Lambda con SSE.**

| | Vercel AI SDK | OCAIS |
|---|---|---|
| Bundle | ~2.8 MB | ~15 KB |
| Dependencies | 30+ transitivas | 0 |
| Target | Next.js, React | AWS Lambda |
| Breaking changes | Fuera de tu control | Tú decides |

## Instalación

```bash
npm install @opita/ocais
```

## Uso rápido

### Streaming con DeepSeek

```typescript
import { streamText, openai } from '@opita/ocais';

const stream = streamText({
  provider: openai({
    apiKey: process.env.DEEP_SEEK_KEY,
    baseURL: 'https://api.deepseek.com',
  }),
  model: 'deepseek-chat',
  system: 'Eres un asistente útil.',
  messages: [{ role: 'user', content: 'Hola' }],
});

for await (const chunk of stream) {
  if (chunk.type === 'text') process.stdout.write(chunk.text);
}
```

### Streaming con Google Gemini

```typescript
import { streamText, google } from '@opita/ocais';

const stream = streamText({
  provider: google({ apiKey: process.env.API_GOOGLE_CLOUD }),
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Hola' }],
});
```

### En AWS Lambda

```typescript
import { streamText, openai, createSSEWriter } from '@opita/ocais';

export const handler = awslambda.streamifyResponse(
  async (event, responseStream) => {
    const writer = createSSEWriter(responseStream);
    const body = JSON.parse(event.body || '{}');

    const stream = streamText({
      provider: openai({ apiKey: process.env.DEEP_SEEK_KEY, baseURL: 'https://api.deepseek.com' }),
      model: 'deepseek-chat',
      system: 'Eres Aura, asistente de Vibe Studio.',
      messages: body.messages,
    });

    for await (const chunk of stream) {
      writer.write(chunk);
    }
    writer.done();
  }
);
```

### Generación estructurada

```typescript
import { generateObject, google } from '@opita/ocais';
import { z } from 'zod';

const { object } = await generateObject({
  provider: google({ apiKey }),
  model: 'gemini-2.5-flash',
  schema: z.object({
    missions: z.array(z.object({
      title: z.string(),
      description: z.string(),
    })).length(3),
  }),
  prompt: 'Genera 3 misiones diarias para un desarrollador.',
});
```

## Providers

| Provider | Constructor | APIs compatibles |
|----------|-------------|------------------|
| OpenAI-compatible | `openai({ apiKey, baseURL? })` | OpenAI, DeepSeek, OpenRouter, Groq |
| Google Gemini | `google({ apiKey })` | Gemini 1.5, 2.0, 2.5 |

## API

### `streamText(options): AsyncIterable<StreamChunk>`

Streams text from an AI provider with optional tool calling.

### `generateObject<T>(options): Promise<{ object: T }>`

Generates a structured JSON object validated against a Zod schema.

### `createSSEWriter(stream): SSEWriter`

Creates an SSE writer for AWS Lambda response streams.

## Licencia

MIT © [Opita Code](https://opitacode.com)
