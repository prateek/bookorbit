import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SavePushSubscriptionDto } from './save-push-subscription.dto';

async function errorsFor(body: unknown) {
  const dto = plainToInstance(SavePushSubscriptionDto, body);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('SavePushSubscriptionDto', () => {
  it('accepts the endpoint and keys a browser subscription produces', async () => {
    const errors = await errorsFor({
      endpoint: 'https://web.push.apple.com/QGuQyavXutnMbj1YMqdNg1',
      keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects plain http endpoints, missing keys and malformed key material', async () => {
    expect(await errorsFor({ endpoint: 'http://web.push.apple.com/x', keys: { p256dh: 'a', auth: 'b' } })).not.toHaveLength(0);
    expect(await errorsFor({ endpoint: 'https://web.push.apple.com/x' })).not.toHaveLength(0);
    const nested = await errorsFor({ endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'not base64!', auth: 'b' } });
    expect(nested[0]?.children?.length).toBeGreaterThan(0);
  });
});
