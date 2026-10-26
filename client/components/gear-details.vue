<template>
    <modal id="wgGearDetails" :shown="shown" @hide="close">
        <template v-if="item">
            <h2>{{ item.name || 'Gear details' }}</h2>
            <form class="wgGearForm" data-testid="gear-details" @submit.prevent="save">
                <label class="wgField">Closet category
                    <input
                        v-model.trim="form.closetCategory"
                        class="wgInput"
                        maxlength="60"
                        list="wgClosetCategories"
                        placeholder="e.g. Insulation, Shelter, Cook kit"
                        data-testid="gear-closet-category"
                    >
                    <datalist id="wgClosetCategories">
                        <option v-for="c in closetCategories" :key="c" :value="c" />
                    </datalist>
                </label>

                <div class="wgField">
                    <span>Photos <span class="wgMuted">({{ form.photos.length }}/6)</span></span>
                    <ul class="wgGearPhotos">
                        <li v-for="(p, i) in form.photos" :key="p">
                            <button type="button" class="wgGearPhotoThumb" :aria-label="`View photo ${i + 1}`" @click="view(i)">
                                <img :src="p" alt="" data-testid="gear-photo-thumb">
                            </button>
                            <button type="button" class="wgGearPhotoRemove" :aria-label="`Remove photo ${i + 1}`" @click="form.photos.splice(i, 1)">
                                ×
                            </button>
                        </li>
                        <li v-if="form.photos.length < 6">
                            <label class="wgGearPhotoAdd" :class="{ wgBusy: uploading }">
                                {{ uploading ? '…' : '+' }}
                                <span class="wgVisuallyHidden">Add a photo</span>
                                <input type="file" accept="image/jpeg,image/png,image/webp" class="wgVisuallyHidden" data-testid="gear-photo-file" :disabled="uploading || !signedIn" @change="upload">
                            </label>
                        </li>
                    </ul>
                    <span class="wgMuted wgProfileHint">{{ signedIn ? 'Resized to fit 512×512. In lists they open in a lightbox instead of crowding the row.' : 'Sign in to add photos.' }}</span>
                </div>

                <label class="wgField">How many do you own? <span class="wgMuted">(optional)</span>
                    <input v-model.number="form.qtyOwned" class="wgInput wgQtyOwned" type="number" min="0" max="10000" step="1" inputmode="numeric" placeholder="—" data-testid="gear-qty-owned">
                    <span class="wgMuted wgProfileHint">Lists warn you when they use more than this.</span>
                </label>

                <label class="wgField">Where to buy (link)
                    <input v-model.trim="form.url" class="wgInput" type="url" inputmode="url" placeholder="https://" data-testid="gear-buy-link">
                    <span v-if="item.catalogId && item.catalogSync" class="wgMuted wgProfileHint">From the Waymark catalog. Changing it makes this item your own copy.</span>
                </label>

                <label class="wgField">Review video (YouTube)
                    <input v-model.trim="form.videoUrl" class="wgInput" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" data-testid="gear-video-link" :aria-invalid="String(Boolean(form.videoUrl && !videoOk))">
                    <span v-if="form.videoUrl && !videoOk" class="wgThreadError">That isn't a YouTube video link.</span>
                    <button v-else-if="form.videoUrl" type="button" class="wgBtn wgBtnGhost wgBtnSmall wgGearPreview" @click="preview">▶ Preview</button>
                </label>

                <p v-if="error" class="wgImportError" role="alert">
                    {{ error }}
                </p>
                <div class="wgImportActions">
                    <a :href="reportUrl" class="wgReportInline">Report wrong specs</a>
                    <button type="submit" class="wgBtn wgBtnPrimary" :disabled="Boolean(form.videoUrl && !videoOk) || uploading" data-testid="gear-details-save">
                        Save
                    </button>
                    <button type="button" class="wgBtn wgBtnGhost" @click="close">
                        Cancel
                    </button>
                </div>
            </form>
        </template>
    </modal>
</template>

<script>
import modal from './modal.vue';
import { youTubeId } from '../utils/gear-meta.js';
import { openPhotos, openVideo } from '../utils/lightbox.js';

export default {
    name: 'GearDetails',
    components: { modal },
    props: {
        shown: { type: Boolean, required: true },
        item: { type: Object, default: null },
    },
    emits: ['hide'],
    data() {
        return { form: { closetCategory: '', photos: [], url: '', videoUrl: '', qtyOwned: '' }, uploading: false, error: '' };
    },
    computed: {
        signedIn() {
            return this.$store.state.saveType === 'remote';
        },
        closetCategories() {
            return [...new Set(this.$store.state.library.items.map((i) => i.closetCategory).filter(Boolean))].sort();
        },
        videoOk() {
            return Boolean(youTubeId(this.form.videoUrl));
        },
        reportUrl() {
            const label = encodeURIComponent(this.item ? this.item.name : '');
            return `/report?kind=${this.item && this.item.catalogId ? 'catalog' : 'other'}&label=${label}`;
        },
    },
    watch: {
        item: {
            immediate: true,
            handler(item) {
                if (!item) return;
                this.form = {
                    closetCategory: item.closetCategory || '',
                    photos: [...(item.photos || [])],
                    url: item.url || '',
                    videoUrl: item.videoUrl || '',
                    qtyOwned: Number.isInteger(item.qtyOwned) ? item.qtyOwned : '',
                };
                this.error = '';
            },
        },
    },
    methods: {
        close() {
            this.$emit('hide');
        },
        view(i) {
            openPhotos([...this.form.photos.slice(i), ...this.form.photos.slice(0, i)], this.item.name || 'Gear');
        },
        preview() {
            openVideo(this.form.videoUrl, `${this.item.name || 'Gear'}: review`);
        },
        async upload(evt) {
            const file = evt.target.files && evt.target.files[0];
            evt.target.value = '';
            if (!file) return;
            this.uploading = true;
            this.error = '';
            try {
                const body = new FormData();
                body.append('image', file);
                const res = await fetch('/api/profile/image?kind=photo', { method: 'POST', body, credentials: 'same-origin' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.message || 'That photo could not be uploaded.');
                if (!this.form.photos.includes(json.imageUrl)) this.form.photos.push(json.imageUrl);
            } catch (err) {
                this.error = err.message;
            } finally {
                this.uploading = false;
            }
        },
        save() {
            const owned = Number(this.form.qtyOwned);
            const changes = {
                id: this.item.id,
                closetCategory: this.form.closetCategory,
                photos: [...this.form.photos],
                videoUrl: this.form.videoUrl,
                qtyOwned: this.form.qtyOwned !== '' && Number.isInteger(owned) && owned >= 0 ? owned : null,
            };
            if (this.form.url !== (this.item.url || '')) changes.url = this.form.url;
            this.$store.commit('updateItem', changes);
            this.close();
        },
    },
};
</script>

<style lang="scss">
#wgGearDetails {
    max-width: calc(100vw - 32px);
    width: 480px;

    h2 {
        margin-top: 0;
    }
}

.wgGearForm {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.wgGearPhotos {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    list-style: none;
    margin: 6px 0 4px;
    padding: 0;

    li {
        position: relative;
    }
}

.wgGearPhotoThumb,
.wgGearPhotoAdd {
    align-items: center;
    background: var(--lp-surface-sunken);
    border: 1px solid var(--lp-border);
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    font-size: 24px;
    height: 64px;
    justify-content: center;
    overflow: hidden;
    padding: 0;
    width: 64px;

    img {
        height: 100%;
        object-fit: cover;
        width: 100%;
    }
}

.wgGearPhotoAdd.wgBusy {
    cursor: progress;
}

.wgGearPhotoRemove {
    background: var(--lp-text);
    border: 0;
    border-radius: 999px;
    color: var(--lp-surface);
    cursor: pointer;
    font-size: 14px;
    height: 22px;
    line-height: 1;
    position: absolute;
    right: -6px;
    top: -6px;
    width: 22px;
}

.wgGearPreview {
    align-self: flex-start;
    margin-top: 6px;
}

.wgReportInline {
    color: var(--lp-text-secondary);
    font-size: 13px;
    margin-right: auto;
}
.wgQtyOwned {
    max-width: 120px;
}
</style>
