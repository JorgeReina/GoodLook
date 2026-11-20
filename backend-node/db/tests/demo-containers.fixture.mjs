import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import net from 'node:net';

export const containerId = '0123456789abcdef'.repeat(4);
export const networkId = 'a'.repeat(64);
const context = 'desktop-linux';

export function mockDocker(t, {
  change = () => {},
  endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine',
  preexisting = false,
} = {}) {
  let project;
  let state = 'created';
  const operations = [];
  t.mock.method(net, 'createServer', () => ({
    once() {},
    listen(_, done) { done(); },
    close(done) { done(); },
  }));
  t.mock.method(childProcess, 'execFileSync', (program, args) => {
    assert.equal(program, 'docker');
    if (args[0] === 'context') {
      if (args[1] === 'show') return context;
      assert.equal(args.at(-1), context);
      return endpoint;
    }
    assert.deepEqual(args.slice(0, 2), ['--context', context]);
    const command = args[2];
    if (command === 'info') return 'linux';
    if (command === 'compose') {
      const actualProject = args[args.indexOf('-p') + 1];
      project ??= actualProject;
      assert.match(project, /^goodlook-demo-[a-f0-9]{32}$/);
      assert.equal(actualProject, project);
      if (args.includes('config')) return JSON.stringify({
        name: project,
        services: {
          mysql: {
            image: 'mysql:8.4',
            environment: { MYSQL_DATABASE: 'goodlook_disposable_test', MYSQL_USER: 'goodlook_test', MYSQL_PASSWORD: 'local_test_only_password', MYSQL_ROOT_PASSWORD: 'local_test_only_root' },
            healthcheck: { test: ['CMD-SHELL', 'mysqladmin ping'], interval: '2s', timeout: '3s', retries: 45 },
            tmpfs: ['/var/lib/mysql'],
            ports: [{ host_ip: '127.0.0.1', published: '33317', target: 3306, protocol: 'tcp' }],
          },
        },
      });
      assert.fail('Compose can only read configuration');
    }
    if (command === 'network' && args[3] === 'create') {
      operations.push(['network create', project]);
      return networkId;
    }
    if (command === 'create') {
      assert.equal(args[args.indexOf('--network') + 1], networkId);
      operations.push(['create', project]);
      if (preexisting) throw new Error('container name already exists');
      return containerId;
    }
    if (command === 'rm') {
      operations.push(['rm', args.at(-1)]);
      return '';
    }
    if (command === 'network' && args[3] === 'rm') {
      operations.push(['network rm', args.at(-1)]);
      return '';
    }
    if (command === 'start') {
      assert.equal(args.at(-1), containerId);
      state = 'running';
      return '';
    }
    assert.deepEqual(args.slice(2), ['inspect', '--type', 'container', containerId]);
    const portBindings = {
      '3306/tcp': [{ HostIp: '127.0.0.1', HostPort: '33317' }],
      '33060/tcp': null,
    };
    const container = {
      Id: containerId,
      Name: '/' + project + '-mysql-1',
      Config: {
        Hostname: containerId.slice(0, 12),
        Image: 'mysql:8.4',
        Labels: { 'com.docker.compose.project': project, 'com.docker.compose.service': 'mysql' },
      },
      State: { Status: state, Running: state === 'running', Health: { Status: 'healthy' } },
      HostConfig: { NetworkMode: networkId, PortBindings: structuredClone(portBindings), Tmpfs: { '/var/lib/mysql': '' } },
      NetworkSettings: { Ports: portBindings, Networks: { [project]: { NetworkID: networkId } } },
      Mounts: [],
    };
    change(container);
    return JSON.stringify([container]);
  });
  return operations;
}
