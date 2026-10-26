<template>
    <div class="wgHome">
        <siteHeader />
        <main class="wgPage wgProfileEdit">
            <div class="wgSectionHead">
                <div>
                    <h1 class="wgH2">
                        Your profile
                    </h1>
                    <p class="wgLede">
                        What people see at <strong>/@{{ username || 'you' }}</strong>: your published lists, plus anything you add here.
                    </p>
                </div>
                <a v-if="profile && !form.hidden" :href="`/@${username}`" class="wgBtn wgBtnGhost" target="_blank" rel="noopener" data-testid="profile-view">View profile ↗</a>
            </div>

            <p v-if="!signedIn" class="wgCard wgProfileEditNote">
                Public profiles need an account. <router-link to="/register">
                    Create one
                </router-link> to keep your lists in sync and get a profile page.
            </p>
            <p v-else-if="loadError" class="wgCard wgProfileEditNote" role="alert">
                {{ loadError }}
            </p>

            <form v-else-if="profile" class="wgProfileForm" data-testid="profile-form" @submit.prevent="save">
                <section class="wgCard wgProfileImages">
                    <div class="wgProfileBannerEdit" :style="form.bannerUrl ? { backgroundImage: `url(${form.bannerUrl})` } : null">
                        <label class="wgBtn wgBtnSmall wgProfileUpload">
                            {{ uploading === 'banner' ? 'Uploading…' : (form.bannerUrl ? 'Change banner' : 'Add a banner') }}
                            <input type="file" accept="image/jpeg,image/png,image/webp" class="wgVisuallyHidden" data-testid="profile-banner-file" @change="upload('banner', $event)">
                        </label>
                    </div>
                    <div class="wgProfileAvatarRow">
                        <div class="wgProfileAvatarEdit">
                            <img v-if="form.avatarUrl" :src="form.avatarUrl" alt="" data-testid="profile-avatar-preview">
                            <span v-else aria-hidden="true">{{ initial }}</span>
                        </div>
                        <label class="wgBtn wgBtnSmall wgBtnGhost">
                            {{ uploading === 'avatar' ? 'Uploading…' : (form.avatarUrl ? 'Change picture' : 'Add a picture') }}
                            <input type="file" accept="image/jpeg,image/png,image/webp" class="wgVisuallyHidden" data-testid="profile-avatar-file" @change="upload('avatar', $event)">
                        </label>
                        <button v-if="form.avatarUrl" type="button" class="wgBtn wgBtnSmall wgBtnGhost" @click="form.avatarUrl = ''">
                            Remove
                        </button>
                        <button v-if="form.bannerUrl" type="button" class="wgBtn wgBtnSmall wgBtnGhost" @click="form.bannerUrl = ''">
                            Remove banner
                        </button>
                    </div>
                    <p class="wgMuted wgProfileHint">
                        Pictures are cropped to a square and banners to 3:1, from the center. JPEG, PNG or WebP, up to 5 MB.
                    </p>
                </section>

                <section class="wgCard wgProfileFields">
                    <div class="wgProfileRow">
                        <label class="wgField">Name
                            <input v-model="form.displayName" class="wgInput" maxlength="60" placeholder="Your name" data-testid="profile-display-name">
                        </label>
                        <label class="wgField">Trail name
                            <input v-model="form.trailName" class="wgInput" maxlength="40" placeholder="e.g. Pathfinder" data-testid="profile-trail-name">
                        </label>
                    </div>

                    <div class="wgField">
                        <span class="wgProfileBioHead">
                            <label for="wgBio">About you</label>
                            <button type="button" class="wgBtn wgBtnSmall wgBtnGhost" :aria-pressed="String(previewBio)" data-testid="profile-bio-preview" @click="previewBio = !previewBio">
                                {{ previewBio ? 'Edit' : 'Preview' }}
                            </button>
                        </span>
                        <textarea
                            v-show="!previewBio"
                            id="wgBio"
                            v-model="form.bio"
                            class="wgInput wgProfileBioInput"
                            maxlength="4000"
                            rows="8"
                            placeholder="Trails you've hiked, what's next, how you pack. Markdown works: **bold**, lists, links."
                            data-testid="profile-bio"
                        />
                        <!-- eslint-disable-next-line vue/no-v-html -- hardened renderer: drops inline HTML, unsafe links -->
                        <div v-show="previewBio" class="wgProfileBioPreview lpListDescription" v-html="bioHtml" />
                        <span class="wgMuted wgProfileCount">{{ form.bio.length }}/4000</span>
                    </div>
                </section>

                <section class="wgCard wgProfileFields">
                    <h2 class="wgProfileEditH">
                        Links
                    </h2>
                    <div class="wgProfileRow">
                        <label v-for="n in networks" :key="n.id" class="wgField">{{ n.label }}
                            <input v-model.trim="form.links[n.id]" class="wgInput" :placeholder="n.placeholder" :data-testid="`profile-link-${n.id}`" :aria-invalid="String(errorField === n.id)">
                        </label>
                    </div>
                </section>

                <section class="wgCard wgProfileFields">
                    <h2 class="wgProfileEditH">
                        Flagship lists
                    </h2>
                    <p class="wgMuted wgProfileHint">
                        Pin up to three of your published lists to the top of your profile.
                    </p>
                    <p v-if="!profile.kits.length" class="wgProfileHint" data-testid="profile-no-kits">
                        You haven't published a list yet. Open a list's Share menu and turn on <b>Publish to Explore</b>; it'll show up on your profile.
                    </p>
                    <ul v-else class="wgProfileKitPick">
                        <li v-for="kit in profile.kits" :key="kit.externalId">
                            <label class="wgProfileCheck">
                                <input
                                    type="checkbox"
                                    :checked="form.featured.includes(kit.externalId)"
                                    :disabled="!form.featured.includes(kit.externalId) && form.featured.length >= 3"
                                    :data-testid="`profile-feature-${kit.externalId}`"
                                    @change="toggleFeatured(kit.externalId, $event.target.checked)"
                                >
                                <span>{{ kit.name }}</span>
                                <span class="wgMuted wgMono">{{ fmt(kit.baseWeightMg) }}</span>
                            </label>
                        </li>
                    </ul>
                </section>

                <section class="wgCard wgProfileFields">
                    <label class="wgProfileCheck">
                        <input v-model="form.hidden" type="checkbox" data-testid="profile-hidden">
                        <span>Hide my profile. Your shared list links keep working.</span>
                    </label>
                    <label class="wgProfileCheck">
                        <input v-model="form.notifyEmail" type="checkbox" data-testid="profile-notify-email">
                        <span>Email me when someone comments on my lists or replies to me (at most every 15 minutes).</span>
                    </label>
                </section>

                <p v-if="error" class="wgImportError" role="alert" data-testid="profile-error">
                    {{ error }}
                </p>
                <div class="wgProfileActions">
                    <button type="submit" class="wgBtn wgBtnPrimary" :disabled="saving || Boolean(uploading)" data-testid="profile-save">
                        {{ saving ? 'Saving…' : 'Save profile' }}
                    </button>
                    <span v-if="saved" class="wgMuted" role="status" data-testid="profile-saved">Saved.</span>
                </div>
            </form>
        </main>
        <globalAlerts />
    </div>
</template>

<script>
import siteHeader from '../components/site-header.vue';
import globalAlerts from '../components/global-alerts.vue';
import { api, formatWeightMg } from '../utils/format.js';
import { marked } from '../utils/markdown.js';

const NETWORKS = [
    { id: 'youtube', label: 'YouTube', placeholder: '@yourchannel or a link' },
    { id: 'x', label: 'X', placeholder: '@handle' },
    { id: 'instagram', label: 'Instagram', placeholder: '@handle' },
    { id: 'website', label: 'Website or blog', placeholder: 'yoursite.com' },
];

export default {
    name: 'ProfileEdit',
    components: { siteHeader, globalAlerts },
    data() {
        return {
            profile: null,
            form: null,
            networks: NETWORKS,
            previewBio: false,
            uploading: '',
            saving: false,
            saved: false,
            error: '',
            errorField: '',
            loadError: '',
        };
    },
    computed: {
        signedIn() {
            return Boolean(this.$store.state.loggedIn);
        },
        username() {
            return (this.profile && this.profile.username) || this.$store.state.loggedIn || '';
        },
        initial() {
            return ((this.form && this.form.displayName) || this.username || '?').trim().charAt(0).toUpperCase();
        },
        bioHtml() {
            return this.form && this.form.bio ? marked(this.form.bio) : '<p class="wgMuted">Nothing here yet.</p>';
        },
    },
    async mounted() {
        document.title = 'Your profile — Waymark Gear';
        if (!this.signedIn) return;
        try {
            this.setProfile(await api('/api/profile'));
        } catch (err) {
            this.loadError = err.message || 'Your profile could not be loaded.';
        }
    },
    methods: {
        fmt(mg) {
            return formatWeightMg(mg, 'lb');
        },
        setProfile(profile) {
            this.profile = profile;
            this.form = {
                displayName: profile.displayName,
                trailName: profile.trailName,
                bio: profile.bio,
                avatarUrl: profile.avatarUrl,
                bannerUrl: profile.bannerUrl,
                links: { youtube: '', x: '', instagram: '', website: '', ...profile.links },
                featured: [...profile.featured],
                hidden: profile.hidden,
                notifyEmail: profile.notifyEmail !== false,
            };
        },
        toggleFeatured(id, on) {
            const list = this.form.featured.filter((f) => f !== id);
            if (on) list.push(id);
            this.form.featured = list.slice(0, 3);
        },
        async upload(kind, evt) {
            const file = evt.target.files && evt.target.files[0];
            evt.target.value = '';
            if (!file) return;
            this.error = '';
            this.uploading = kind;
            try {
                const body = new FormData();
                body.append('image', file);
                const res = await fetch(`/api/profile/image?kind=${kind}`, { method: 'POST', body, credentials: 'same-origin' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.message || 'That picture could not be uploaded.');
                this.form[kind === 'avatar' ? 'avatarUrl' : 'bannerUrl'] = json.imageUrl;
            } catch (err) {
                this.error = err.message;
            } finally {
                this.uploading = '';
            }
        },
        async save() {
            this.saving = true;
            this.saved = false;
            this.error = '';
            this.errorField = '';
            try {
                const profile = await api('/api/profile', { method: 'PUT', body: JSON.stringify(this.form) });
                this.setProfile(profile);
                this.saved = true;
            } catch (err) {
                this.error = err.message || 'Your profile could not be saved.';
                this.errorField = (err.body && err.body.field) || '';
            } finally {
                this.saving = false;
            }
        },
    },
};
</script>

<style lang="scss">
@import "../css/_globals";

.wgProfileEdit {
    max-width: 820px;
    padding-bottom: 64px;
    padding-top: 28px;
}

.wgProfileEditNote {
    padding: 18px 20px;
}

.wgProfileForm {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.wgProfileImages {
    overflow: hidden;
    padding: 0 0 14px;
}

.wgProfileBannerEdit {
    align-items: flex-end;
    aspect-ratio: 3 / 1;
    background: linear-gradient(135deg, #1D3B30, #3F6B52 60%, #C4571F 160%);
    background-position: center;
    background-size: cover;
    display: flex;
    justify-content: flex-end;
    padding: 12px;
}

.wgProfileUpload {
    background: rgba(255, 255, 255, 0.92);
    color: #1D3B30;
    cursor: pointer;
}

.wgProfileAvatarRow {
    align-items: flex-end;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: -44px;
    padding: 0 16px;

    label {
        cursor: pointer;
    }
}

.wgProfileAvatarEdit {
    align-items: center;
    background: var(--lp-primary);
    border: 4px solid var(--lp-surface);
    border-radius: 50%;
    color: #fff;
    display: flex;
    font-family: $font-display;
    font-size: 40px;
    font-weight: 800;
    height: 104px;
    justify-content: center;
    overflow: hidden;
    width: 104px;

    img {
        height: 100%;
        object-fit: cover;
        width: 100%;
    }
}

.wgProfileHint {
    font-size: 13px;
    margin: 10px 16px 0;
}

.wgProfileFields {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 18px;

    .wgProfileHint {
        margin: 0;
    }
}

.wgProfileRow {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.lp .wgProfileEditH {
    font-family: $font-body;
    font-size: 15px;
    font-stretch: 100%;
    margin: 0;
}

.wgProfileBioHead {
    align-items: center;
    display: flex;
    justify-content: space-between;
}

.wgProfileBioInput {
    font-family: $font-body;
    min-height: 160px;
    resize: vertical;
}

.wgProfileBioPreview {
    border: 1px solid var(--lp-border);
    border-radius: 10px;
    min-height: 160px;
    padding: 4px 14px;
}

.wgProfileCount {
    font-size: 12px;
    text-align: right;
}

.wgProfileKitPick {
    display: flex;
    flex-direction: column;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
}

.wgProfileCheck {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 10px;
    min-height: 40px;

    input {
        accent-color: var(--lp-primary);
        flex: none;
        height: 20px;
        width: 20px;
    }

    span:first-of-type {
        flex: 1 1 auto;
    }
}

.wgProfileActions {
    align-items: center;
    display: flex;
    gap: 14px;
}
</style>
