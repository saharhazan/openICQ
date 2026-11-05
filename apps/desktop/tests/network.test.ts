import { describe, expect, it } from 'vitest';
import { hostedOrigins, lanAddresses } from '../src/main/network.ts';

describe('network', () => {
  it('keeps only private IPv4 network addresses', () => {
    const entry = (address: string, family: 'IPv4' | 'IPv6', internal = false) => ({
      address,
      family,
      internal,
      netmask: '',
      mac: '',
      cidr: null,
      ...(family === 'IPv6' ? { scopeid: 0 } : {}),
    });
    const interfaces = {
      lo0: [entry('127.0.0.1', 'IPv4', true)],
      en0: [entry('192.168.1.20', 'IPv4'), entry('fe80::1', 'IPv6')],
      en1: [entry('169.254.10.10', 'IPv4'), entry('10.0.0.5', 'IPv4')],
      utun3: [entry('100.101.1.2', 'IPv4'), entry('203.0.113.7', 'IPv4'), entry('172.20.0.3', 'IPv4'), entry('172.32.0.1', 'IPv4')],
    } as unknown as Parameters<typeof lanAddresses>[0];
    expect(lanAddresses(interfaces)).toEqual(['10.0.0.5', '172.20.0.3', '192.168.1.20']);
  });

  it('accepts this computer always and the network addresses when given', () => {
    expect(hostedOrigins(5190, [])).toEqual(['http://127.0.0.1:5190', 'http://localhost:5190']);
    expect(hostedOrigins(5190, ['10.0.0.5'])).toContain('http://10.0.0.5:5190');
  });
});
