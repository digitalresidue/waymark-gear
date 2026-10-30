// Import a list from another app by its share link: LighterPack
// (server/lighterpack.js) or PackWizard. Returns the parsed list; the browser
// adds it to the library like any other edit, so this works the same for
// signed-in and account-less people.
//
// Like the LighterPack import, a PackWizard link is only ever read from the
// configured PackWizard origin (www.packwizard.com in production), on its one
// public JSON path, with no redirects and a size cap, so a pasted link can't
// make this server request anything else.
//
// PackWizard items carry photos. For someone signed in, those are copied here
// (never hotlinked), a few at a time and within a time budget; a photo that
// can't be copied in time is left off and can be added later.

import config from 'config';

import { packWizardId, packWizardToList } from '../client/utils/packwizard-import.js';
import { lighterPackId } from '../client/utils/lighterpack-import.js';
import { ImportError, fetchText, importFromLighterPack, lighterPackOrigin } from './lighterpack.js';
import { copyRemoteImage, RemoteImageError } from './remote-image.js';

const MAX_PHOTOS = 40;
const PHOTO_BUDGET_MS = 20000;
const PHOTO_PARALLEL = 4;

export function packWizardOrigin() {
    return new URL(config.has('packwizardUrl') ? config.get('packwizardUrl') : 'https://www.packwizard.com').origin;
}
const hostOf = (origin) => new URL(origin).host;

export async function importFromPackWizard(link) {
    const origin = packWizardOrigin();
    const id = packWizardId(link, hostOf(origin));
    if (!id) throw new ImportError('Paste a PackWizard share link, like packwizard.com/s/AbC123x.');
    const body = await fetchText(`${origin}/api/packs/getSharedPackWithId?shareableId=${encodeURIComponent(id)}`, 'PackWizard', { accept: 'application/json' });
    let data;
    try {
        data = JSON.parse(body);
    } catch {
        throw new ImportError("PackWizard didn't send that list back. Check the link, and that the pack is shared.", 502);
    }
    const parsed = packWizardToList(data);
    if (!parsed || !parsed.itemCount) throw new ImportError("That list doesn't have any gear we could read.", 422);
    parsed.source = `${origin}/s/${id}`;
    return parsed;
}

/** Copy item photos for `owner`; drop the ones that can't be copied in time. */
export async function copyPhotos(parsed, owner, { log = () => {} } = {}) {
    const items = parsed.categories.flatMap((c) => c.items);
    const wanted = owner ? items.filter((i) => i.imageUrl).slice(0, MAX_PHOTOS) : [];
    const deadline = Date.now() + PHOTO_BUDGET_MS;
    const copied = new Map();
    let next = 0;
    const worker = async () => {
        while (next < wanted.length && Date.now() < deadline) {
            const item = wanted[next++];
            if (copied.has(item.imageUrl)) continue;
            copied.set(item.imageUrl, null);
            try {
                copied.set(item.imageUrl, (await copyRemoteImage(item.imageUrl, owner)).imageUrl);
            } catch (err) {
                if (!(err instanceof RemoteImageError)) log(err);
            }
        }
    };
    await Promise.all(Array.from({ length: PHOTO_PARALLEL }, worker));
    let photos = 0;
    for (const item of items) {
        const local = item.imageUrl ? copied.get(item.imageUrl) : null;
        if (local) {
            item.imageUrl = local;
            photos++;
        } else {
            delete item.imageUrl;
        }
    }
    parsed.photos = photos;
    return parsed;
}

/** Whichever app the link is from. */
export async function importFromLink(link, { owner = null, log } = {}) {
    if (packWizardId(link, hostOf(packWizardOrigin()))) {
        return copyPhotos(await importFromPackWizard(link), owner, { log });
    }
    if (lighterPackId(link, hostOf(lighterPackOrigin()))) return importFromLighterPack(link);
    throw new ImportError('Paste a share link from LighterPack (lighterpack.com/r/…) or PackWizard (packwizard.com/s/…).');
}
