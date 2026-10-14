export interface AccountCredentials {
  userId: string;
  secret: string;
}

export type PersonalSettingsRequest = (
  method: string,
  path: string,
  body?: unknown,
  credentials?: AccountCredentials,
) => Promise<{ status: number; body: any }>;

export function checkPersonalSettings(send: PersonalSettingsRequest): Promise<void>;
