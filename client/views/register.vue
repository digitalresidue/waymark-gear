<template>
    <authLayout card-id="register" :title="$t('auth.registerTitle')" :subtitle="$t('auth.registerSubtitle')">
        <p v-if="isLocalSaving" class="lpWarning">
            <strong>Note:</strong> Your existing data on your computer <strong>will</strong> be saved to your new account.
        </p>

        <registerForm />
        <template #after>
            <span class="wgMuted">{{ $t('auth.haveAccount') }}</span> <router-link to="/signin">
                {{ $t('auth.signInTitle') }}
            </router-link>
        </template>
    </authLayout>
</template>

<script>
import authLayout from '../components/auth-layout.vue';
import registerForm from '../components/register-form.vue';

export default {
    name: 'Register',
    components: {
        authLayout,
        registerForm,
    },

    computed: {
        isLocalSaving() {
            return this.$store.state.saveType === 'local';
        },
    },
};
</script>

<style lang="scss">

</style>
