# Signing Windows updates

Generate the updater key once. Run these commands from the checkout after `npm ci`. The key files go outside the repository. Enter a password when prompted and keep a backup of the private key and password.

```powershell
$keyDir = Join-Path $env:USERPROFILE '.clippy-board-signing'
New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
node node_modules/@tauri-apps/cli/tauri.js signer generate --write-keys (Join-Path $keyDir 'updater.key')
```

In [Clippy-board’s Actions settings](https://github.com/omar908/Clippy-board/settings/secrets/actions), add these repository entries:

| Tab | Name | Value |
|---|---|---|
| Secrets | `TAURI_SIGNING_PRIVATE_KEY` | Contents of `updater.key` |
| Secrets | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The key password, if you set one |
| Variables | `TAURI_UPDATE_PUBLIC_KEY` | Contents of `updater.key.pub` |

The release job embeds the public key in the Windows installers and uses the private key to sign the artifacts. Keep the same key for subsequent releases. Installed copies use the public key they shipped with.

The version-bump workflow publishes the MSI and NSIS installers, their signatures and `latest.json`. A publishing run requires signing configuration. PR checks and manual artifact builds can run without it. The update signatures are for Tauri’s updater. Windows Authenticode signing is a separate mechanism.

## Test an upgrade

1. Install the first signed, updater-enabled build from GitHub Releases. Start with the same installer format you normally use.
2. After the next signed version is published, open **Settings** in the older build and select **Check for updates**. Choose **Install and restart** and verify the version after restart. Repeat with both MSI and NSIS.
3. Check that the clipboard history and Settings preferences survive the upgrade. Turn off automatic checks and verify that the manual button still works.
4. Test failure with a disposable signed build and a test feed. A failed download or invalid signature should leave the app running with the option to retry or open the release page.

See the [Tauri updater guide](https://v2.tauri.app/plugin/updater/) for signing and Windows installer behavior.
