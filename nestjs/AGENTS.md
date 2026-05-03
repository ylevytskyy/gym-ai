# NestJS API Guidelines

## Package Manager

Use `pnpm` for all JavaScript and TypeScript commands in this workspace. Do not use `npm` or `yarn` for installs, scripts, or one-off package execution unless the user explicitly asks for it.

## Development Server

- Run `pnpm start:dev` from this directory to start the API in watch mode.
- Run `pnpm start:debug` from this directory to start the API in watch mode with the Node debugger on port `9229`.
- Keep `.env` populated from `.env.example`, including `JWT_SECRET`, before starting the API locally.
- The API listens on port `3000` by default and uses the `/api` global prefix.
- Verify local health with `curl -s http://127.0.0.1:3000/api/health`.
- Attach a debugger to `127.0.0.1:9229` when using `pnpm start:debug`.

## Ngrok Exposure

- Use the paid reserved domain when exposing the local API:
  `ngrok http --url=wiseland.ngrok.pro 3000`.
- Verify the public tunnel with:
  `curl -s https://wiseland.ngrok.pro/api/health`.
- Mobile local development should use `https://wiseland.ngrok.pro/api` as its API base URL.
- If updating or creating a mobile `.env` file is required, stop and ask the user to do it.
