import { describeVapiError, isMeetingEnded } from '@/services/calls/vapiErrors';

describe('describeVapiError', () => {
  it('finds the message wherever the SDK puts it', () => {
    expect(describeVapiError({ error: { message: 'Invalid Key' } })).toBe('Invalid Key');
    expect(describeVapiError({ errorMsg: 'Meeting has ended' })).toBe('Meeting has ended');
    expect(describeVapiError(new Error('boom'))).toBe('boom');
    expect(describeVapiError('plain string')).toBe('plain string');
  });

  it('serialises odd shapes and never returns nothing', () => {
    expect(describeVapiError({ error: { code: 7 } })).toBe('{"code":7}');
    expect(describeVapiError(undefined)).toBe('Voice call failed');
    expect(describeVapiError('')).toBe('Voice call failed');
  });

  it('caps very long messages', () => {
    expect(describeVapiError({ message: 'x'.repeat(500) })).toHaveLength(300);
  });
});

describe('isMeetingEnded', () => {
  it('recognises the server hanging up', () => {
    expect(isMeetingEnded({ action: 'error', errorMsg: 'Meeting has ended', error: { type: 'ejected', msg: 'Meeting has ended' } })).toBe(true);
    expect(isMeetingEnded({ error: { type: 'ejected' } })).toBe(true);
    expect(isMeetingEnded({ errorMsg: 'Meeting has ended' })).toBe(true);
    expect(isMeetingEnded(new Error('The meeting has ended.'))).toBe(true);
  });

  it('does not hide real failures', () => {
    expect(isMeetingEnded({ error: { message: 'Invalid Key' } })).toBe(false);
    expect(isMeetingEnded({ errorMsg: 'Connection lost' })).toBe(false);
    expect(isMeetingEnded({ error: { type: 'nbf-room' } })).toBe(false);
    expect(isMeetingEnded(undefined)).toBe(false);
  });
});
