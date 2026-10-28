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

<!-- Styles (light/dark swap) live in css/components/_site-chrome.scss, shared
     with the server-rendered pages. -->
