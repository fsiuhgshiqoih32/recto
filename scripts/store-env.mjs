// Checks the Partner Center identity values a Microsoft Store build needs
// before spending minutes on the build (see docs/microsoft-store.md).
const needed = {
  RECTO_STORE_IDENTITY_NAME: 'Package/Identity/Name, e.g. 12345YourName.Recto',
  RECTO_STORE_PUBLISHER: 'Package/Identity/Publisher, e.g. CN=1A2B3C4D-…',
  RECTO_STORE_PUBLISHER_NAME: 'Package/Properties/PublisherDisplayName, e.g. Your Name',
};
const missing = Object.entries(needed).filter(([name]) => !process.env[name]?.trim());
if (missing.length) {
  console.error('A Microsoft Store build needs your app identity from Partner Center → Product identity:\n');
  for (const [name, hint] of missing) console.error(`  ${name}  (${hint})`);
  console.error('\nSee docs/microsoft-store.md.');
  process.exit(1);
}
if (process.platform !== 'win32') {
  console.error('Microsoft Store packages are built on Windows.');
  process.exit(1);
}
