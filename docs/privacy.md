# Privacy notes

The source release is built from a clean copy of the project. It leaves out the original Git history and hosting setup.

Excluded from the repository and source archive:

- Private email addresses, personal names, and contact details.
- Account, conversation, workspace, and deployment identifiers.
- The original hosted-demo URL and source-server address.
- API keys, access tokens, passwords, cookies, and environment files.
- Local machine paths, virtual environments, package caches, and logs.

The browser demo runs its calculations locally. It does not use cloud inference, analytics, or external fonts. Imported recordings stay in the browser. Exported files are created locally.

Experiment files contain simulation settings, results, random seeds, software versions, and source hashes. They do not contain user recordings or personal data.

GitHub still shows the repository owner and records activity under that account. File cleanup cannot make an account-owned repository anonymous. Keep the repository private if that account link should not be public.

The included source check looks for common secrets, private deployment markers, local paths, and untranslated text. It is a useful check, not a proof that any future file is safe to publish.
