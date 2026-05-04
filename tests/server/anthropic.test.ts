import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateLines, checkTone, getAnthropicClient, VOICE_SYSTEM_PROMPT, ANTHROPIC_REQUEST_TIMEOUT_MS } from '@/server/anthropic';

type MockResponse = {
  content: Array<{ type: string; text?: string }>;
};

function makeAnthropic(response: MockResponse | (() => Promise<MockResponse>) | (() => never)) {
  const create = vi.fn().mockImplementation(async () => {
    if (typeof response === 'function') {
      return response();
    }
    return response;
  });
  return { messages: { create } } as any;
}

describe('VOICE_SYSTEM_PROMPT', () => {
  it('is a non-empty string with the required contract sections', () => {
    expect(typeof VOICE_SYSTEM_PROMPT).toBe('string');
    expect(VOICE_SYSTEM_PROMPT.length).toBeGreaterThan(500);
    expect(VOICE_SYSTEM_PROMPT).toContain('LINE 1');
    expect(VOICE_SYSTEM_PROMPT).toContain('LINE 2');
    expect(VOICE_SYSTEM_PROMPT).toContain('JSON');
  });

  it('encodes the line-length contract that validation.ts enforces', () => {
    expect(VOICE_SYSTEM_PROMPT).toMatch(/Hard maximum 60/);
    expect(VOICE_SYSTEM_PROMPT).toMatch(/Hard maximum 100/);
  });
});

describe('getAnthropicClient', () => {
  it('returns the same instance on repeated calls (singleton)', () => {
    const a = getAnthropicClient();
    const b = getAnthropicClient();
    expect(a).toBe(b);
  });
});

describe('generateLines', () => {
  it('joins multi-block text responses', async () => {
    const anthropic = makeAnthropic({
      content: [
        { type: 'text', text: '{"line1":"a",' },
        { type: 'text', text: '"line2":"long enough line two here"}' },
      ],
    });

    const result = await generateLines(anthropic, 'Monday again');

    expect(result).toBe('{"line1":"a","line2":"long enough line two here"}');
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it('passes prompt as user message and uses voice system prompt', async () => {
    const anthropic = makeAnthropic({
      content: [{ type: 'text', text: '{}' }],
    });

    await generateLines(anthropic, 'my morning routine');

    const args = anthropic.messages.create.mock.calls[0][0];
    expect(args.system).toBe(VOICE_SYSTEM_PROMPT);
    expect(args.messages).toEqual([{ role: 'user', content: 'my morning routine' }]);
    expect(args.max_tokens).toBe(200);
    expect(args.temperature).toBe(0.9);
  });

  it('filters out non-text blocks', async () => {
    const anthropic = makeAnthropic({
      content: [
        { type: 'tool_use' as any },
        { type: 'text', text: 'hello' },
        { type: 'tool_result' as any },
      ],
    });

    const result = await generateLines(anthropic, 'work');
    expect(result).toBe('hello');
  });

  it('returns empty string when there are no text blocks', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'tool_use' as any }] });
    const result = await generateLines(anthropic, 'work');
    expect(result).toBe('');
  });

  it('uses ANTHROPIC_MODEL_GEN env var when set', async () => {
    const original = process.env.ANTHROPIC_MODEL_GEN;
    process.env.ANTHROPIC_MODEL_GEN = 'claude-test-model';
    try {
      const anthropic = makeAnthropic({ content: [{ type: 'text', text: '' }] });
      await generateLines(anthropic, 'work');
      expect(anthropic.messages.create.mock.calls[0][0].model).toBe('claude-test-model');
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_MODEL_GEN;
      else process.env.ANTHROPIC_MODEL_GEN = original;
    }
  });

  it('defaults model to claude-sonnet-4-6 when env var unset', async () => {
    const original = process.env.ANTHROPIC_MODEL_GEN;
    delete process.env.ANTHROPIC_MODEL_GEN;
    try {
      const anthropic = makeAnthropic({ content: [{ type: 'text', text: '' }] });
      await generateLines(anthropic, 'work');
      expect(anthropic.messages.create.mock.calls[0][0].model).toBe('claude-sonnet-4-6');
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_MODEL_GEN = original;
    }
  });

  it('propagates SDK errors so the caller can retry/fall back', async () => {
    const anthropic = makeAnthropic(() => {
      throw new Error('boom');
    });

    await expect(generateLines(anthropic, 'work')).rejects.toThrow('boom');
  });

  // Timeout contract: every Anthropic call passes an explicit per-request
  // timeout (second arg to messages.create) so the SDK does NOT inherit its
  // 10-minute default. The Netlify lambda kills at ~10–26s; without this cap
  // a hung provider would burn the entire budget on one stuck request and
  // the retry loop would never get a second attempt. See `audit-reports/20`.
  it('passes ANTHROPIC_REQUEST_TIMEOUT_MS as the per-request timeout', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: '' }] });
    await generateLines(anthropic, 'work');
    const opts = anthropic.messages.create.mock.calls[0][1];
    expect(opts).toEqual({ timeout: ANTHROPIC_REQUEST_TIMEOUT_MS });
  });
});

describe('checkTone', () => {
  beforeEach(() => {
    delete process.env.ENABLE_TONE_CHECK;
  });

  afterEach(() => {
    delete process.env.ENABLE_TONE_CHECK;
  });

  it('returns true when verdict starts with "safe"', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'safe' }] });
    expect(await checkTone(anthropic, 'work', 'The week loops without consent.')).toBe(true);
  });

  it('returns false when verdict starts with "user"', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'user' }] });
    expect(await checkTone(anthropic, 'work', 'You are a failure as a person.')).toBe(false);
  });

  it('is case-insensitive on the verdict', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'SAFE' }] });
    expect(await checkTone(anthropic, 'work', 'x')).toBe(true);
  });

  it('trims whitespace before comparing verdict', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: '  safe  \n' }] });
    expect(await checkTone(anthropic, 'work', 'x')).toBe(true);
  });

  it('treats non-text content as "safe" (defensive default)', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'tool_use' as any }] });
    expect(await checkTone(anthropic, 'work', 'x')).toBe(true);
  });

  it('returns true when ENABLE_TONE_CHECK is exactly "false" (skip path)', async () => {
    process.env.ENABLE_TONE_CHECK = 'false';
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'user' }] });
    const result = await checkTone(anthropic, 'work', 'anything');
    expect(result).toBe(true);
    // SDK should not have been called when bypass is on
    expect(anthropic.messages.create).not.toHaveBeenCalled();
  });

  it('still runs check when ENABLE_TONE_CHECK is "true" (truthy but not the bypass sentinel)', async () => {
    process.env.ENABLE_TONE_CHECK = 'true';
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'safe' }] });
    await checkTone(anthropic, 'work', 'x');
    expect(anthropic.messages.create).toHaveBeenCalledTimes(1);
  });

  it('returns true on SDK error (fails open — never block on a tone-check infra failure)', async () => {
    const anthropic = makeAnthropic(() => {
      throw new Error('network down');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await checkTone(anthropic, 'work', 'The week loops without consent.');
      expect(result).toBe(true);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('passes prompt and line2 in the user message body for context', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'safe' }] });
    await checkTone(anthropic, 'my dating life', 'The apps are eating their users.');
    const userMsg = anthropic.messages.create.mock.calls[0][0].messages[0].content;
    expect(userMsg).toContain('my dating life');
    expect(userMsg).toContain('The apps are eating their users.');
  });

  it('uses safety model env var when set', async () => {
    const original = process.env.ANTHROPIC_MODEL_SAFETY;
    process.env.ANTHROPIC_MODEL_SAFETY = 'claude-haiku-test';
    try {
      const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'safe' }] });
      await checkTone(anthropic, 'work', 'x');
      expect(anthropic.messages.create.mock.calls[0][0].model).toBe('claude-haiku-test');
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_MODEL_SAFETY;
      else process.env.ANTHROPIC_MODEL_SAFETY = original;
    }
  });

  it('uses temperature 0 for deterministic verdicts', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'safe' }] });
    await checkTone(anthropic, 'work', 'x');
    expect(anthropic.messages.create.mock.calls[0][0].temperature).toBe(0);
  });

  // Same per-request timeout contract as generateLines — see comment there.
  it('passes ANTHROPIC_REQUEST_TIMEOUT_MS as the per-request timeout', async () => {
    const anthropic = makeAnthropic({ content: [{ type: 'text', text: 'safe' }] });
    await checkTone(anthropic, 'work', 'x');
    const opts = anthropic.messages.create.mock.calls[0][1];
    expect(opts).toEqual({ timeout: ANTHROPIC_REQUEST_TIMEOUT_MS });
  });
});
