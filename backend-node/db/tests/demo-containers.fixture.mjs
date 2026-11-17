import assert from 'node:assert/strict';
import childProcess from 'node:child_process';

export const containerId = '0123456789abcdef'.repeat(4);
export const demo = {
  context: 'desktop-linux',
  project: 'goodlook-demo-' + 'f'.repeat(32),
};

export function mockDocker(t, { change = () => {}, endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine' } = {}) {
  const portBindings = { '3306/tcp': [{ HostIp: '127.0.0.1', HostPort: '33317' }] };
  const container = {
    Id: containerId,
    Name: '/' + demo.project + '-mysql-1',
    Config: {
      Hostname: containerId.slice(0, 12),
      Image: 'mysql:8.4',
      Labels: { 'com.docker.compose.project': demo.project, 'com.docker.compose.service': 'mysql' },
    },
    State: { Running: true, Health: { Status: 'healthy' } },
    HostConfig: { PortBindings: structuredClone(portBindings), Tmpfs: { '/var/lib/mysql': '' } },
    NetworkSettings: { Ports: portBindings },
    Mounts: [],
  };
  change(container);
  t.mock.method(childProcess, 'execFileSync', (program, args) => {
    assert.equal(program, 'docker');
    if (args[0] === 'context') {
      assert.equal(args.at(-1), demo.context);
      return endpoint;
    }
    assert.deepEqual(args.slice(0, 2), ['--context', demo.context]);
    if (args[2] === 'info') return 'linux';
    assert.deepEqual(args.slice(2), ['inspect', '--type', 'container', containerId]);
    return JSON.stringify([container]);
  });
}
