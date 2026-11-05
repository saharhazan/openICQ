ICQ New, the last ICQ (2020 to 2024), rebuilt and open source, for Windows, macOS and Linux.

## Download

| System | File |
|---|---|
| Windows 10 / 11 | `openICQ-*-win-*.exe` (setup) |
| macOS (Apple Silicon) | `openICQ-*-mac-arm64.dmg` |
| macOS (Intel) | `openICQ-*-mac-x64.dmg` |
| Linux | `openICQ-*-linux-x86_64.AppImage` or `openICQ-*-linux-amd64.deb` (arm64 builds included) |

The builds are not signed with a paid certificate, so the system asks once before the first start:

- **macOS**: right-click openICQ in Applications, choose Open, then Open again. If macOS says the app is damaged, run `xattr -dr com.apple.quarantine /Applications/openICQ.app`.
- **Windows**: SmartScreen shows "Windows protected your PC". Click More info, then Run anyway.
- **Linux AppImage**: `chmod +x openICQ-*.AppImage`, then run it.

On the first start openICQ asks how to connect: host a server on this computer (optionally for your whole network), or connect to an existing openICQ server. Then sign up and add friends by nickname or ICQ number.

`SHA256SUMS.txt` lists the checksum of every file.
