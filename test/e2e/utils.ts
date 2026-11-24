// LP_PORT lets a worktree run the suite against its own server instead of
// whatever checkout already holds :3000.
export const testPort = process.env.LP_PORT || '3000';
export const testRoot = `http://localhost:${testPort}/`;

// An Explore gear page with every filter unfolded: they start closed
// unless set (templates/explore-gear.mustache), and tests work the boxes.
export async function openExplore(page: import('@playwright/test').Page, href: string) {
    await page.goto(href);
    await page.locator('[data-filter-fold]').evaluateAll((els) => els.forEach((e) => { (e as HTMLDetailsElement).open = true; }));
}
