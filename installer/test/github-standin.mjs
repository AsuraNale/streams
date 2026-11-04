/**
 * A stand-in for GitHub's two addresses the update uses (desktop/src/main/services/update.mjs), on this machine
 * (127.0.0.1). The harness (installer/test/harness.mjs) sends the app's requests for
 *   https://api.github.com/repos/AsuraNale/streams/releases/latest
 *   https://github.com/AsuraNale/streams/releases/download/v<version>/Streams-<version>-setup.exe
 * here, path and all. The latest release is the one the test gives: its version, the setup program's file (served as
 * the download, its size and SHA-256 in the answer as GitHub writes them: `digest: "sha256:<hex>"`). `digest` may be set
 * to a wrong value (the update must then refuse the download: verify_failed).
 * @module installer/test/github-standin
 */

import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { basename } from 'node:path'
import { sha256File } from './machine.mjs'

const REPO = 'AsuraNale/streams'

/**
 * @param {object} o
 * @param {string} o.version - the release's version (major.minor.patch)
 * @param {string} o.file - the setup program served as its asset
 * @param {string} [o.digest] - what the answer says the SHA-256 is (default: the file's own)
 */
export async function startGitHub({ version, file, digest = null }) {
  const requests = []
  const name = basename(file)
  const release = {
    version, file, name, size: statSync(file).size, sha256: sha256File(file), digest: null,
  }
  release.digest = digest ?? release.sha256
  const server = createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, accept: req.headers.accept ?? null, userAgent: req.headers['user-agent'] ?? null })
    if (req.method === 'GET' && req.url === `/repos/${REPO}/releases/latest`) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        tag_name: `v${version}`,
        name: `流息 ${version}`,
        draft: false,
        prerelease: false,
        published_at: new Date().toISOString(),
        html_url: `https://github.com/${REPO}/releases/tag/v${version}`,
        body: `## 流息 ${version}\n\n- installer test release`,
        assets: [{
          name,
          size: release.size,
          digest: `sha256:${release.digest}`,
          browser_download_url: `https://github.com/${REPO}/releases/download/v${version}/${name}`,
        }],
      }))
      return
    }
    if (req.method === 'GET' && req.url === `/${REPO}/releases/download/v${version}/${name}`) {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(release.size) })
      createReadStream(file).pipe(res)
      return
    }
    res.writeHead(404).end('not found')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`, requests, release,
    /** What the next answers say the SHA-256 is (null: the file's own). */
    setDigest(hex) { release.digest = hex ?? release.sha256 },
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }),
  }
}
