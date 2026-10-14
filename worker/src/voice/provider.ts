import type { VoiceStart } from '../../../shared/voice';
import type { UserRow } from '../db/queries';
import type { LoggedItem } from '../vapi/prompt';

export interface VoiceContext {
  env: Env;
  url: URL;
  user: UserRow;
  callId: number;
  localDate: string;
  localTime: string;
  alreadyLogged: LoggedItem[];
}

export interface VoiceProvider {
  readonly id: string;
  configured(env: Env, user: UserRow): boolean;
  prepare(context: VoiceContext): Omit<VoiceStart, 'callId' | 'localDate' | 'provider'>;
  /** Credentials may be minted only by a hosted backend. */
  credentials?(env: Env): Promise<Record<string, unknown>>;
  connect?(req: Request, env: Env): Promise<Response>;
}
