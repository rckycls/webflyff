import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { DEFAULT_PORTS, parseAdminConfig } from '../src/admin/config';
import { parseWebConfig } from '../src/config';

const example = JSON.parse(readFileSync(fileURLToPath(new URL('../web.config.example.json', import.meta.url)), 'utf8'));
const site = { ...example, ticketSecret: 'k'.repeat(40) };
const admin = example.admin as Record<string, unknown>;

it('reads the example admin section with its defaults', () => {
  const config = parseAdminConfig(admin);
  expect(config.listen).toEqual({ host: '127.0.0.1', port: 8092 });
  expect(config.origin).toBe('https://admin.play.example.com');
  expect(config.sql.user).toBe('flyffweb_admin');
  expect(config.sessionIdleMinutes).toBe(30);
  expect(config.sessionMaxHours).toBe(12);
  expect(config.assetsDir).toBe('dist/assets');
  expect(config.gateway).toEqual({ host: '127.0.0.1', port: 8090 });
  expect(config.servers.map((s) => s.name)).toEqual(['Account', 'Certifier', 'Database', 'Core', 'Login', 'Cache', 'World']);
  expect(config.servers.find((s) => s.name === 'Database')).toEqual({ name: 'Database', host: '127.0.0.1', ports: [7000, 24000, 7200] });
  expect(config.servers.find((s) => s.name === 'World')!.ports).toEqual([3101]);
  expect(DEFAULT_PORTS.Core).toEqual([4000, 4001, 4002]);
});

it('leaves the panel off without a section, and says nothing', () => {
  const { admin: _, ...withoutAdmin } = site;
  const config = parseWebConfig(withoutAdmin);
  expect(config.admin).toBeUndefined();
  expect(config.adminProblem).toBeUndefined();
});

it('turns the panel off for a bad section but keeps the site', () => {
  const config = parseWebConfig({ ...site, admin: { ...admin, listen: { host: '0.0.0.0', port: 8092 } } });
  expect(config.admin).toBeUndefined();
  expect(config.adminProblem).toContain('admin.listen.host');
  expect(config.siteOrigin).toBe(site.siteOrigin);
});

it('wants an https origin, with loopback http only for a loopback listener', () => {
  expect(() => parseAdminConfig({ ...admin, origin: 'http://admin.example.com' })).toThrow(/admin\.origin/);
  expect(() => parseAdminConfig({ ...admin, origin: 'https://admin.example.com/' })).toThrow(/admin\.origin/);
  expect(parseAdminConfig({ ...admin, origin: 'http://127.0.0.1:8092' }).origin).toBe('http://127.0.0.1:8092');
  expect(parseAdminConfig({ ...admin, origin: 'http://localhost:8092' }).origin).toBe('http://localhost:8092');
  expect(() => parseAdminConfig({ ...admin, origin: 'http://10.0.0.5:8092' })).toThrow(/admin\.origin/);
});

it('replaces only the ports it is given, and applies one host to all servers', () => {
  const config = parseAdminConfig({ ...admin, ports: { World: [3102] }, serverHost: '192.168.1.20' });
  expect(config.servers.find((s) => s.name === 'World')!.ports).toEqual([3102]);
  expect(config.servers.find((s) => s.name === 'Login')!.ports).toEqual([28000]);
  expect(config.servers.every((s) => s.host === '192.168.1.20')).toBe(true);
});

it('refuses unknown keys and out-of-range values', () => {
  expect(() => parseAdminConfig({ ...admin, foo: 1 })).toThrow(/admin\.foo/);
  expect(() => parseAdminConfig({ ...admin, ports: { Moon: [1] } })).toThrow(/admin\.ports\.Moon/);
  expect(() => parseAdminConfig({ ...admin, sessionIdleMinutes: 0 })).toThrow(/admin\.sessionIdleMinutes/);
  expect(() => parseAdminConfig({ ...admin, sessionMaxHours: 25 })).toThrow(/admin\.sessionMaxHours/);
  expect(() => parseAdminConfig({ ...admin, credentialsFile: '' })).toThrow(/admin\.credentialsFile/);
});
