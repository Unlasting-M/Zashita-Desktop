# Source and third-party notices

Zashita Desktop 2.0 is a new Electron application based on the author's Zashita
web client (web v0.1.2, source revision 88f083420042a2dc94827e2b054a85f76485aa32).
It does not contain the Copy InterviewDog executable, decompiled modules,
vendor backend or bundled speech model from the earlier desktop patch project.
The application icon is the author's existing Zashita artwork.

Third-party dependencies retain their own licenses. Packaged runtime components:

| Component | License | Source |
| --- | --- | --- |
| Electron, Chromium and Node.js | MIT plus bundled Chromium/Node notices | https://github.com/electron/electron |
| ws | MIT | https://github.com/websockets/ws |
| PDF.js | Apache-2.0 | https://github.com/mozilla/pdf.js |
| fflate | MIT | https://github.com/101arrowz/fflate |

The release includes `LICENSE.electron.txt`, `LICENSES.chromium.html`, and
`resources/licenses/` with the applicable library license files. Build-only tools
(esbuild, electron-builder and Playwright) are not part of the application runtime.
Cloud services are external services, not bundled model weights.
