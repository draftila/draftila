# Draftila CLI

Run Draftila locally with Node.js:

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

The first start downloads a checksum-verified native production runtime for macOS, Linux, or
Windows. Docker and a source checkout are not required.

Configuration and Draftila data are stored in the operating system's user application directories.
A normal uninstall removes the downloaded runtime while preserving projects, uploaded files, and
configuration. `npx draftila uninstall --purge` permanently removes all local Draftila data after a
separate confirmation.
