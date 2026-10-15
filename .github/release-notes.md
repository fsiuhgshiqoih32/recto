## Download

| System | File |
| --- | --- |
| Windows 10 and 11 (64-bit) | `Recto-Setup-<version>.exe` |
| macOS on Apple Silicon (M1 and later) | `Recto-<version>-mac-arm64.dmg` |
| macOS on Intel | `Recto-<version>-mac-x64.dmg` |
| Linux (any distribution) | `Recto-<version>-linux-x86_64.AppImage` |
| Debian, Ubuntu, Mint | `Recto-<version>-linux-amd64.deb` |
| Linux, unpacked | `Recto-<version>-linux-x64.tar.gz` |

`SHA256SUMS.txt` lists a checksum for every file.

Recto isn't signed by Apple or Microsoft yet (that needs paid certificates), so each system warns once on first launch:

- **Windows:** SmartScreen says "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **macOS:** open the `.dmg` and drag Recto to Applications. The first time you open it, macOS says it can't verify the developer. Open **System Settings → Privacy & Security**, scroll down and choose **Open Anyway**.
- **Linux AppImage:** make it executable (`chmod +x Recto-*.AppImage`), then run it. On Ubuntu 24.04 and later, which restrict unprivileged sandboxes, either install the `.deb` instead or start the AppImage with `--no-sandbox`.

Prefer not to install anything? The web version runs in any modern browser and keeps your book on your device.
