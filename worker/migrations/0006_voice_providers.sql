-- Additive: existing Vapi rows, IDs, configuration and webhook processing are untouched.
ALTER TABLE calls ADD COLUMN voice_provider TEXT NOT NULL DEFAULT 'vapi';
ALTER TABLE calls ADD COLUMN provider_call_id TEXT;
CREATE UNIQUE INDEX calls_provider_id ON calls(voice_provider, provider_call_id)
  WHERE provider_call_id IS NOT NULL;
