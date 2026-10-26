<template>
    <authLayout card-id="signin" title="Sign in" subtitle="Welcome back.">
        <SigninForm :message="message" />
        <template #after>
            <span class="wgMuted">New here?</span> <router-link to="/register">
                Create an account
            </router-link>
        </template>
    </authLayout>
</template>

<script>
import authLayout from '../components/auth-layout.vue';
import SigninForm from '../components/signin-form.vue';
import { contactEmail } from '../brand.js';

export default {
    name: 'Signin',
    components: {
        authLayout,
        SigninForm,
    },
    computed: {
        message() {
            const deliveryNote = contactEmail
                ? ` If it doesn't arrive, check your spam folder or contact ${contactEmail}.`
                : " If it doesn't arrive, check your spam folder.";

            if (this.$route.path.indexOf('/reset-password') > -1) {
                return `A password reset link has been sent to the address associated with your account. The link expires in one hour.${deliveryNote}`;
            }

            if (this.$route.path.indexOf('/forgot-username') > -1) {
                return `An email has been sent to the address associated with your account.${deliveryNote}`;
            }

            return '';
        },
    },
};
</script>

<style lang="scss">

</style>
