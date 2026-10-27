import { BadRequestException } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';
import { ensureSafeUrl } from '../../common/utils/ssrf.utils';

const trusted = new BlockList();
for (const [address, prefix] of [
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
] as const) {
  trusted.addSubnet(address, prefix, 'ipv4');
}
trusted.addAddress('::1', 'ipv6');
trusted.addSubnet('fc00::', 7, 'ipv6');

export async function runnerUrl(raw: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Invalid runner URL.');
  }
  if (url.username || url.password || url.search || url.hash)
    throw new BadRequestException('Runner URL must not include credentials, query parameters or a fragment.');
  if (url.protocol === 'http:') {
    const address = url.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(address);
    // Literal addresses prevent a private hostname from rebinding to a public HTTP endpoint.
    if (!allowPrivate || !family || !trusted.check(address, family === 6 ? 'ipv6' : 'ipv4'))
      throw new BadRequestException(
        'HTTP runners require an explicit private or loopback IP address and private-network opt-in. Use HTTPS for hostnames.',
      );
  }
  return ensureSafeUrl(url.href, { allowPrivate });
}
