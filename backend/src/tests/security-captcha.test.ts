import { buildCaptchaChallenge, verifyCaptchaChallenge } from '../modules/auth/auth.routes';
import { verifyChallengeToken } from '../utils/jwt';

describe('captcha challenge security', () => {
  it('does not embed plaintext answer in challenge token', () => {
    const challenge = buildCaptchaChallenge('security.tester@example.com');
    const payload = verifyChallengeToken(challenge.token);

    expect(payload.type).toBe('captcha');
    expect((payload as { answer?: string }).answer).toBeUndefined();
    expect(payload.captchaNonce).toBeTruthy();
    expect(payload.captchaMac).toBeTruthy();
  });

  it('accepts only the correct answer', () => {
    const challenge = buildCaptchaChallenge('security.tester@example.com');
    const match = challenge.question.match(/What is (\d+) \+ (\d+)\?/);
    expect(match).not.toBeNull();

    const expectedAnswer = String(Number(match![1]) + Number(match![2]));
    expect(verifyCaptchaChallenge('security.tester@example.com', challenge.token, expectedAnswer)).toBe(true);
    expect(verifyCaptchaChallenge('security.tester@example.com', challenge.token, '999')).toBe(false);
  });
});
