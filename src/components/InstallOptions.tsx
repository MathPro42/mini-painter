import type { JSX } from 'preact';
import type { Distribution } from '../state/browserUpdates';
import type { InstallPrompt } from '../state/installPrompt';
import { OFFLINE_ZIP_NAME } from '../utils/app/distribution';
import { useSignalValue } from './useSignalValue';

interface InstallOptionsProps {
  distribution: Distribution;
  install: InstallPrompt | null;
}

export const INSTALL_FROM_MENU_HINT =
  'Your browser installs from its own menu: look for "Install app", or Share → "Add to Home Screen".';

/** The two ways to run the app without the site: install it, or download a zip. */
export function InstallOptions({ distribution, install }: InstallOptionsProps): JSX.Element {
  if (distribution === 'offline') {
    return (
      <section class="settings__section" aria-labelledby="install-title">
        <h2 id="install-title" class="settings__heading">
          Use offline
        </h2>
        <p class="settings__hint">This is the offline copy. It runs from its folder.</p>
      </section>
    );
  }
  return (
    <section class="settings__section" aria-labelledby="install-title">
      <h2 id="install-title" class="settings__heading">
        Use offline
      </h2>
      <p class="settings__hint">Pick one way to run Mini Painter without this site:</p>
      <div class="settings__option">
        {install === null ? (
          <p class="settings__hint">{INSTALL_FROM_MENU_HINT}</p>
        ) : (
          <InstallButton install={install} />
        )}
        <p class="settings__hint">An app on this device. Updates itself.</p>
      </div>
      <div class="settings__option">
        <a
          class="button"
          href={`${import.meta.env.BASE_URL}${OFFLINE_ZIP_NAME}`}
          download={OFFLINE_ZIP_NAME}
        >
          Download zip
        </a>
        <p class="settings__hint">
          A folder to unzip and open (index.html), no install. Updates come as a new zip.
        </p>
      </div>
    </section>
  );
}

function InstallButton({ install }: { install: InstallPrompt }): JSX.Element {
  const canInstall = useSignalValue(install.canInstall);
  const installed = useSignalValue(install.installed);
  if (installed) {
    return <p class="settings__hint">Installed. Open Mini Painter from your apps.</p>;
  }
  if (!canInstall) {
    return <p class="settings__hint">{INSTALL_FROM_MENU_HINT}</p>;
  }
  return (
    <button
      type="button"
      class="button"
      onClick={() => {
        void install.install();
      }}
    >
      Install app
    </button>
  );
}
