# monetra-tracker

To install dependencies:

```bash
bun install
```

Fill `.env` with the `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` values from your Supabase dashboard. Bun loads `.env` automatically. Never put the secret key in frontend code.

To run:

```bash
bun start
```

For auto-reload during development:

```bash
bun run dev
```

This project was created using `bun init` in bun v1.4.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
