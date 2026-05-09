import fs from 'node:fs'

// Run inside GitLab CI build:mac / build:win jobs immediately before the
// electron-builder packaging step. Two effects:
//   1. If the pipeline is on a tag matching `^v[0-9]+\.[0-9]+\.[0-9]+...`,
//      bump apps/desktop/package.json `version` to the tag's stripped form
//      so latest-mac.yml / latest.yml advertise the new release version.
//   2. If LOUPE_INTERNAL_UPDATE_USER + LOUPE_INTERNAL_UPDATE_TOKEN are set
//      (CI variables, only injected on protected refs), rewrite
//      package.json `build.publish` to a generic provider that points at
//      the project's Generic Package registry latest channel, with the
//      deploy token embedded in the URL for HTTP Basic auth.
//
// Both edits are local to the runner's checkout — no commit, no push.

const PACKAGE_PATH = 'apps/desktop/package.json'
const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'))

const tag = process.env.CI_COMMIT_TAG
if (tag) {
  const version = tag.replace(/^v/, '')
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`tag ${tag} does not map to a valid semver`)
    process.exit(1)
  }
  pkg.version = version
  console.log(`[ci-prepare] desktop version -> ${version}`)
}

const user = process.env.LOUPE_INTERNAL_UPDATE_USER
const token = process.env.LOUPE_INTERNAL_UPDATE_TOKEN
const projectId = process.env.CI_PROJECT_ID
if (user && token && projectId) {
  const host = process.env.CI_SERVER_HOST || 'gitlab.com'
  const url = `https://${user}:${token}@${host}/api/v4/projects/${projectId}/packages/generic/loupe/latest/`
  pkg.build = pkg.build || {}
  pkg.build.publish = [{ provider: 'generic', url, channel: 'latest' }]
  console.log(`[ci-prepare] publish -> generic @ ${host} project=${projectId}`)
}

// GitLab Generic Package filenames must match /^[\w\.-]+$/ — no spaces. Override
// electron-builder's default artifactName (which inherits productName "Loupe QA
// Recorder" with spaces) to a hyphenated form so uploaded files + the yml's
// embedded filenames stay valid for the registry.
pkg.build = pkg.build || {}
pkg.build.mac = { ...(pkg.build.mac || {}), artifactName: 'Loupe-QA-Recorder-${version}-${arch}.${ext}' }
pkg.build.win = { ...(pkg.build.win || {}), artifactName: 'Loupe-QA-Recorder-${version}.${ext}' }
pkg.build.nsis = { ...(pkg.build.nsis || {}), artifactName: 'Loupe-QA-Recorder-${version}.${ext}' }
console.log('[ci-prepare] artifactName -> Loupe-QA-Recorder-... (space-free)')

fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n')
