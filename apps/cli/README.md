# Draftila CLI

Run Draftila locally with Node.js and Docker:

```bash
npx draftila start
```

Available commands:

```bash
npx draftila start
npx draftila stop
npx draftila restart
npx draftila status
npx draftila config
npx draftila uninstall
```

Configuration is stored in the operating system's user configuration directory. Draftila data is
stored in a persistent Docker volume and is preserved by a normal uninstall.
