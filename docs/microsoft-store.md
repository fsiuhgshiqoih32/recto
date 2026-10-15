# Publishing Recto in the Microsoft Store

The GitHub installer (`Recto-Setup-x.y.z.exe`) is unsigned, so Windows
SmartScreen warns about it until it builds a reputation, and Smart App Control
may block it. A Microsoft Store listing avoids that for free. Microsoft signs
the package when it certifies it, Store installs never show the SmartScreen
warning, and the Store delivers updates.

Registering as an individual developer has been free since September 2025.
The package must be built on Windows.

## 1. Reserve the app in Partner Center

1. Sign in to [Partner Center](https://partner.microsoft.com/dashboard) with a
   Microsoft account and register as an **individual** developer.
2. **Apps and games → New product → MSIX or PWA app**, then reserve a name
   (for example "Recto Book Formatter" if "Recto" is taken).
3. Open the app, then **Product management → Product identity**. Note three values:

   | Partner Center shows | Set this environment variable |
   |---|---|
   | Package/Identity/Name | `RECTO_STORE_IDENTITY_NAME` |
   | Package/Identity/Publisher | `RECTO_STORE_PUBLISHER` |
   | Package/Properties/PublisherDisplayName | `RECTO_STORE_PUBLISHER_NAME` |

## 2. Build the package

In PowerShell, from the repository:

```powershell
$env:RECTO_STORE_IDENTITY_NAME = '12345YourName.RectoBookFormatter'
$env:RECTO_STORE_PUBLISHER = 'CN=1A2B3C4D-5E6F-...'
$env:RECTO_STORE_PUBLISHER_NAME = 'Your Name'
npm ci
npm run dist:store
```

If the build stops with `spawn UNKNOWN`, Windows blocked the packaging tools
electron-builder downloads. Install the [Windows SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/)
and point the build at its tools:

```powershell
$env:ELECTRON_BUILDER_WINDOWS_KITS_PATH = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
npm run dist:store
```

This writes `release/Recto-x.y.z-store.appx`. It is unsigned, which is what
Partner Center expects. The tile images come from `build/appx/`.
`npx tsx scripts/make-icon.ts` redraws them from `build/icon.svg`.

## 3. Submit it

In Partner Center, start a submission:

- **Packages:** upload the `.appx`.
- **Properties:** Category *Productivity*. Privacy policy: Recto collects
  nothing and sends nothing anywhere unless you ask it to (Help → Check for
  Updates). The README's Privacy section says so and can serve as the policy
  page.
- **Age ratings:** complete the questionnaire. Recto has no user-to-user
  features.
- **Store listing:** description, screenshots (`docs/screenshots/` has some),
  and a link to the GitHub page.

Certification usually takes one to three days.

## Things to know

- A Store copy updates only through the Store. Help → Check for Updates says
  so instead of pointing to GitHub.
- The Store package is the same app as the installer, but Windows gives Store
  apps their own storage, so a Store copy keeps its own library. Move books
  between an installer copy and a Store copy with Save As and Open.
- `.recto` files open in the Store copy once it is installed: the package
  declares the file type.
