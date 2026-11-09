/** Where the app is deployed. The offline copy looks here for updates. */
export const SITE_URL = 'https://mathpro42.github.io/mini-painter/';

/** The offline copy, written next to the site by `npm run build`. */
export const OFFLINE_ZIP_NAME = 'mini-painter-offline.zip';

/** `version.json` of the deployed site. */
export const SITE_VERSION_URL = `${SITE_URL}version.json`;

/** Download link for the latest offline copy on the deployed site. */
export const SITE_OFFLINE_ZIP_URL = `${SITE_URL}${OFFLINE_ZIP_NAME}`;
