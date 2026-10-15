// Microsoft Store package (MSIX/AppX), built with `npm run dist:store`.
// Partner Center signs the package when it certifies it, so Store installs
// never meet SmartScreen, and the Store keeps them up to date. The identity
// values are yours, from Partner Center → your app → Product identity
// (docs/microsoft-store.md); scripts/store-env.mjs checks they are set.
module.exports = {
  extends: './electron-builder.yml',
  // The current Windows SDK tools (makeappx 10.0.26100), shipped as a plain zip.
  toolsets: { winCodeSign: '1.1.0' },
  appx: {
    identityName: process.env.RECTO_STORE_IDENTITY_NAME,
    publisher: process.env.RECTO_STORE_PUBLISHER,
    publisherDisplayName: process.env.RECTO_STORE_PUBLISHER_NAME,
    applicationId: 'Recto',
    displayName: 'Recto',
    backgroundColor: 'transparent',
    languages: ['en-US'],
    // Windows 10 1809 and later; tested on Windows 11 24H2.
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0',
    artifactName: 'Recto-${version}-store.${ext}',
  },
};
