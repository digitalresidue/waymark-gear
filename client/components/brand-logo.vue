<template>
    <!-- Both versions are in the page; CSS shows the one that suits the
         theme, so a theme toggle swaps it with no flash or extra request. -->
    <span class="wgBrandLogo">
        <img class="wgLogo wgLogoOnLight" src="/images/waymark-logo.png" alt="Waymark Gear — Build it. Share it. Go." width="843" height="127">
        <img class="wgLogo wgLogoOnDark" src="/images/waymark-logo-light.png" alt="Waymark Gear — Build it. Share it. Go." width="843" height="127">
    </span>
</template>

<script>
export default {
    name: 'BrandLogo',
};
</script>

<style lang="scss">
.wgBrandLogo {
    display: inline-flex;

    .wgLogoOnDark {
        display: none;
    }
}

@mixin wg-logo-dark {
    .wgBrandLogo {
        .wgLogoOnLight {
            display: none;
        }

        .wgLogoOnDark {
            display: block;
        }
    }
}

@media (prefers-color-scheme: dark) {
    .lp:not([data-theme="light"]) {
        @include wg-logo-dark;
    }
}

.lp[data-theme="dark"] {
    @include wg-logo-dark;
}
</style>
