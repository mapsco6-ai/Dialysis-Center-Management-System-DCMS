# Builds and tests against NEW disposable PostgreSQL databases. Never uses .env DB URLs.
$ErrorActionPreference = 'Stop'
$reviewRoot = Split-Path -Parent $PSScriptRoot
$reviewContainer = 'dcms-followup-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$reviewPassword = [Guid]::NewGuid().ToString('N')
$reviewAppPassword = [Guid]::NewGuid().ToString('N')
$reviewVariables = @('DATABASE_URL','APP_DATABASE_URL','TEST_DATABASE_URL','TEST_APP_DATABASE_URL','TEST_RESULTS_NAME','JWT_SECRET','SUPER_ADMIN_PASSWORD','NODE_ENV')
$reviewPrevious = @{}
foreach ($key in $reviewVariables) { $reviewPrevious[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
function Assert-ReviewCommand([string]$step) { if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" } }
Push-Location $reviewRoot
try {
  npm run prisma:generate --workspace=@dcms/api
  Assert-ReviewCommand 'Prisma client generation'
  npm run build:api
  Assert-ReviewCommand 'API build'
  npm run build:web
  Assert-ReviewCommand 'Web build'
  docker run --rm -d --name $reviewContainer -e "POSTGRES_PASSWORD=$reviewPassword" -e POSTGRES_DB=complete_test -p '127.0.0.1::5432' postgres:16-alpine
  Assert-ReviewCommand 'Disposable PostgreSQL startup'
  $reviewPortLine = docker port $reviewContainer 5432/tcp
  Assert-ReviewCommand 'Discover test port'
  if ($reviewPortLine -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Unexpected test database bind address' }
  $reviewPort = $Matches[1]
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $reviewContainer pg_isready -U postgres -d complete_test 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw 'Disposable PostgreSQL did not become ready' }
  "CREATE ROLE dcms_app LOGIN PASSWORD '$reviewAppPassword';" | docker exec -i $reviewContainer psql -U postgres -d complete_test -v ON_ERROR_STOP=1
  Assert-ReviewCommand 'Create test application role'
  $env:JWT_SECRET = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $env:SUPER_ADMIN_PASSWORD = [Guid]::NewGuid().ToString('N')
  $env:NODE_ENV = 'test'
  foreach ($reviewDatabase in @('complete_test', 'reception_test', 'phase456_test')) {
    if ($reviewDatabase -ne 'complete_test') {
      docker exec $reviewContainer createdb -U postgres $reviewDatabase
      Assert-ReviewCommand 'Create test database'
    }
    $env:DATABASE_URL = "postgresql://postgres:${reviewPassword}@127.0.0.1:${reviewPort}/${reviewDatabase}?schema=public"
    $env:TEST_DATABASE_URL = $env:DATABASE_URL
    $env:APP_DATABASE_URL = "postgresql://dcms_app:${reviewAppPassword}@127.0.0.1:${reviewPort}/${reviewDatabase}?schema=public"
    $env:TEST_APP_DATABASE_URL = $env:APP_DATABASE_URL
    npm run prisma:deploy --workspace=@dcms/api
    Assert-ReviewCommand 'Test migrations'
    @"
GRANT CONNECT ON DATABASE $reviewDatabase TO dcms_app;
GRANT USAGE ON SCHEMA public TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dcms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dcms_app;
"@ | docker exec -i $reviewContainer psql -U postgres -d $reviewDatabase -v ON_ERROR_STOP=1
    Assert-ReviewCommand 'Grant test application privileges'
    Get-Content apps/api/prisma/harden-db.sql -Raw | docker exec -i $reviewContainer psql -U postgres -d $reviewDatabase -v ON_ERROR_STOP=1
    Assert-ReviewCommand 'Apply runtime database protections'
    if ($reviewDatabase -eq 'complete_test') {
      $env:TEST_RESULTS_NAME = 'FOLLOWUP-FIXES-TEST-RESULTS.json'
      node apps/api/scripts/test-complete-review.cjs
    } else {
      $kind = $reviewDatabase.Replace('_test','')
      $env:TEST_RESULTS_NAME = 'FOLLOWUP-REGRESSION-' + $kind.ToUpper() + '.json'
      node apps/api/scripts/run-review-regressions.cjs $kind
    }
    Assert-ReviewCommand "Tests for $reviewDatabase"
  }
  npm run generate:openapi --workspace=@dcms/api
  Assert-ReviewCommand 'OpenAPI generation'
  node apps/api/scripts/test-openapi.cjs
  Assert-ReviewCommand 'OpenAPI verification'
} finally {
  docker stop $reviewContainer 2>$null | Out-Null
  foreach ($key in $reviewVariables) { [Environment]::SetEnvironmentVariable($key, $reviewPrevious[$key], 'Process') }
  Pop-Location
}
