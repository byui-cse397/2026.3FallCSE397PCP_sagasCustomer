/**
 * Whether `/dev`, the component sandbox, answers at all.
 *
 * `SAGAS_DEV_SANDBOX=on` turns it on and `off` turns it off. Unset, it is on in
 * development and tests and off in a production build, so a deployment that
 * forgets the setting doesn't serve the sandbox. A deployment that serves
 * `/dev`, such as the fixture preview (P7), sets it to `on` in its Wrangler
 * configuration; the public site leaves it off.
 *
 * `process.env.SAGAS_DEV_SANDBOX` is read when the request arrives, not when
 * the app is built, so the setting belongs to the deployment.
 */
export function devSandboxEnabled(): boolean {
  const setting = process.env.SAGAS_DEV_SANDBOX;
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return process.env.NODE_ENV !== 'production';
}
