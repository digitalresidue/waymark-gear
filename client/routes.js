import dashboard from './views/dashboard.vue';
import gear from './views/gear.vue';
import pack from './views/pack.vue';
import profileEdit from './views/profile-edit.vue';
import home from './views/home.vue';
import explore from './views/explore.vue';
import ownerCatalog from './views/owner-catalog.vue';
import ownerKits from './views/owner-kits.vue';
import signin from './views/signin.vue';
import register from './views/register.vue';
import forgotPassword from './views/forgot-password.vue';
import resetPassword from './views/reset-password.vue';
import moderation from './views/moderation.vue';

export default [
    { path: '/', component: dashboard },
    { path: '/gear', component: gear },
    { path: '/pack', component: pack },
    { path: '/profile', component: profileEdit },
    { path: '/welcome', component: home },
    { path: '/explore', component: explore },
    { path: '/owner/catalog', component: ownerCatalog },
    { path: '/owner/kits', component: ownerKits },
    { path: '/signin', component: signin },
    { path: '/signin/reset-password', component: signin },
    { path: '/signin/forgot-username', component: signin },
    { path: '/register', component: register },
    { path: '/forgot-password', component: forgotPassword },
    { path: '/reset-password/:token', component: resetPassword },
    { path: '/moderation', component: moderation },
    { path: '/:pathMatch(.*)*', component: dashboard },
];
