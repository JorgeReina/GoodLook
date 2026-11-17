[CmdletBinding()]
param(
    [ValidateSet('mysql', 'mariadb')]
    [string]$Dialect = 'mysql',

    [ValidateSet('test', 'interactive')]
    [string]$Mode = 'test'
)

$ErrorActionPreference = 'Stop'

function Invoke-CheckedDocker {
    & docker @args
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker command failed.'
    }
}

function Assert-PortAvailable {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 33317)
    $listener.ExclusiveAddressUse = $true
    try {
        $listener.Start()
    } catch [System.Net.Sockets.SocketException] {
        throw 'Demo local: cannot bind 127.0.0.1:33317. Check whether the port is occupied.'
    } finally {
        $listener.Stop()
    }
}

function Get-DemoContainer {
    $result = Invoke-CheckedDocker --context $context inspect --type container $containerId
    return @((($result -join [Environment]::NewLine) | ConvertFrom-Json))[0]
}

Assert-PortAvailable
$context = Invoke-CheckedDocker context show
$endpoint = Invoke-CheckedDocker context inspect --format '{{.Endpoints.docker.Host}}' $context
if ($endpoint -cnotin @('npipe:////./pipe/dockerDesktopLinuxEngine', 'npipe:////./pipe/docker_engine', 'unix:///var/run/docker.sock')) {
    throw 'Demo local: a local Docker socket is required.'
}
if ((Invoke-CheckedDocker --context $context info --format '{{.OSType}}') -cne 'linux') {
    throw 'Demo local: Docker must run Linux containers.'
}

$backend = Split-Path -Parent $PSScriptRoot
$project = "goodlook-demo-$([Guid]::NewGuid().ToString('N'))"
$image = if ($Dialect -eq 'mariadb') { 'mariadb:10.11' } else { 'mysql:8.4' }
$emptyEnvFile = [System.IO.Path]::GetTempFileName()
$compose = @('--context', $context, 'compose', '--env-file', $emptyEnvFile,
    '-p', $project, '-f', (Join-Path $backend 'compose.integration.yaml'))
if ($Dialect -eq 'mariadb') {
    $compose += @('-f', (Join-Path $backend 'compose.mariadb.integration.yaml'))
}

$ownsProject = $false
try {
    $resolvedConfig = (Invoke-CheckedDocker @compose config --format json) -join [Environment]::NewLine | ConvertFrom-Json
    $service = $resolvedConfig.services.mysql
    $ports = @($service.ports)
    if ($resolvedConfig.name -cne $project -or
        @($resolvedConfig.services.PSObject.Properties).Count -ne 1 -or
        $service.image -cne $image -or $service.privileged -or
        $service.volumes -or $resolvedConfig.volumes -or $service.network_mode -or
        @($service.tmpfs).Count -ne 1 -or $service.tmpfs[0] -cne '/var/lib/mysql' -or
        $ports.Count -ne 1 -or $ports[0].host_ip -cne '127.0.0.1' -or
        $ports[0].published -cne '33317' -or $ports[0].target -ne 3306 -or
        $ports[0].protocol -cne 'tcp') {
        throw 'Demo local: unexpected Compose isolation configuration.'
    }

    $projectFilter = "label=com.docker.compose.project=$project"
    if ((Invoke-CheckedDocker --context $context ps -aq --filter $projectFilter) -or
        (Invoke-CheckedDocker --context $context network ls -q --filter $projectFilter) -or
        (Invoke-CheckedDocker --context $context volume ls -q --filter $projectFilter)) {
        throw 'Demo local: the generated Compose project already exists.'
    }
    $ownsProject = $true
    Invoke-CheckedDocker @compose create --no-build --no-recreate mysql | Out-Null

    $ids = @(Invoke-CheckedDocker @compose ps -aq mysql)
    if ($ids.Count -ne 1 -or $ids[0] -cnotmatch '\A[a-f0-9]{64}\z') {
        throw 'Demo local: Compose did not return one full container ID.'
    }
    $containerId = $ids[0]
    $container = Get-DemoContainer
    $bindings = @($container.HostConfig.PortBindings.'3306/tcp')
    if ($container.Id -cne $containerId -or
        $container.Config.Hostname -cne $containerId.Substring(0, 12) -or
        $container.Config.Labels.'com.docker.compose.project' -cne $project -or
        $container.Config.Labels.'com.docker.compose.service' -cne 'mysql' -or
        $container.Config.Image -cne $image -or $container.State.Status -cne 'created' -or
        $container.HostConfig.Privileged -or $container.HostConfig.Binds -or
        @($container.Mounts | Where-Object { $_.Type -cne 'tmpfs' -or $_.Destination -cne '/var/lib/mysql' }).Count -ne 0 -or
        @($container.HostConfig.Tmpfs.PSObject.Properties).Count -ne 1 -or
        $null -eq $container.HostConfig.Tmpfs.'/var/lib/mysql' -or
        @($container.HostConfig.PortBindings.PSObject.Properties).Count -ne 1 -or
        $bindings.Count -ne 1 -or $bindings[0].HostIp -cne '127.0.0.1' -or $bindings[0].HostPort -cne '33317') {
        throw 'Demo local: container identity, storage or port binding could not be verified.'
    }

    Assert-PortAvailable
    Invoke-CheckedDocker --context $context start $containerId | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        $container = Get-DemoContainer
        if (-not $container.State.Running -or $container.State.Health.Status -ceq 'unhealthy' -or
            [DateTime]::UtcNow -ge $deadline) {
            throw 'Demo local: the isolated database did not become healthy.'
        }
        if ($container.State.Health.Status -cne 'healthy') { Start-Sleep -Seconds 1 }
    } until ($container.State.Health.Status -ceq 'healthy')

    $published = @($container.NetworkSettings.Ports.'3306/tcp')
    if ($published.Count -ne 1 -or $published[0].HostIp -cne '127.0.0.1' -or $published[0].HostPort -cne '33317') {
        throw 'Demo local: the running container did not publish the expected loopback address.'
    }

    & node (Join-Path $backend 'db/demo-guard.mjs') $containerId $Dialect.ToLowerInvariant() $context $project
    if ($LASTEXITCODE -ne 0) {
        throw 'Demo local: isolated migrations failed.'
    }

    if ($Mode -eq 'test') {
        $previousTestFlag = $env:GOODLOOK_RUN_MYSQL_TESTS
        $previousContainerId = $env:GOODLOOK_TEST_CONTAINER_ID
        $previousDockerContext = $env:GOODLOOK_DEMO_DOCKER_CONTEXT
        $previousDemoProject = $env:GOODLOOK_DEMO_PROJECT
        Push-Location -LiteralPath $backend
        try {
            $env:GOODLOOK_RUN_MYSQL_TESTS = '1'
            $env:GOODLOOK_TEST_CONTAINER_ID = $containerId
            $env:GOODLOOK_DEMO_DOCKER_CONTEXT = $context
            $env:GOODLOOK_DEMO_PROJECT = $project
            & node --import tsx --test test/integration/demo-seed.test.ts
            if ($LASTEXITCODE -ne 0) {
                throw 'Demo local: isolated seed integration failed.'
            }
        } finally {
            $env:GOODLOOK_RUN_MYSQL_TESTS = $previousTestFlag
            $env:GOODLOOK_TEST_CONTAINER_ID = $previousContainerId
            $env:GOODLOOK_DEMO_DOCKER_CONTEXT = $previousDockerContext
            $env:GOODLOOK_DEMO_PROJECT = $previousDemoProject
            Pop-Location
        }
    } else {
        & node (Join-Path $backend 'db/demo-seed.mjs') $containerId $context $project
        if ($LASTEXITCODE -ne 0) {
            throw 'Demo local: isolated seed failed.'
        }
        Write-Host "Demo local: isolated $Dialect database ready at 127.0.0.1:33317 with sample data."
        Write-Host "Project: $project. Press Ctrl+C to remove it."
        while ($true) { Start-Sleep -Seconds 1 }
    }
} finally {
    try {
        if ($ownsProject) {
            Invoke-CheckedDocker @compose down | Out-Null
        }
    } finally {
        Remove-Item -LiteralPath $emptyEnvFile -ErrorAction SilentlyContinue
    }
}
