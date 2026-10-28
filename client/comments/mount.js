import { createApp } from 'vue';
import commentThread from './comment-thread.vue';

export default function mount(section) {
    const el = document.createElement('div');
    section.appendChild(el);
    createApp(commentThread, { externalId: section.dataset.externalId }).mount(el);
}
