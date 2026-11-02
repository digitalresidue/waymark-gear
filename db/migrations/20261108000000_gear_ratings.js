// Star ratings for catalog gear (client/utils/ratings.js): one per person
// per item, changeable. A written review's rating is the reviewer's star
// rating too, so existing reviews seed the table. catalog_items keeps each
// item's average, count and ranking score so searches can sort by them.

export async function up(knex) {
    await knex.raw(`
        create table if not exists gear_ratings (
            catalog_id uuid not null references catalog_items (id) on delete cascade,
            user_id uuid not null references users (user_id) on delete cascade,
            stars smallint not null check (stars between 1 and 5),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            primary key (catalog_id, user_id)
        );
        create index if not exists gear_ratings_user_idx on gear_ratings (user_id);

        alter table catalog_items add column if not exists rating_avg real;
        alter table catalog_items add column if not exists rating_count integer not null default 0;
        alter table catalog_items add column if not exists rating_score real not null default 3.5;
        create index if not exists catalog_items_rating_idx on catalog_items (rating_score desc, rating_count desc);

        insert into gear_ratings (catalog_id, user_id, stars, created_at, updated_at)
            select catalog_id, author_id, rating, created_at, updated_at from gear_reviews
            where hidden_at is null
            on conflict do nothing;

        update catalog_items c set rating_avg = s.avg, rating_count = s.n,
            rating_score = (3.5 * 5 + s.avg * s.n) / (5 + s.n)
        from (select catalog_id, avg(stars)::real as avg, count(*)::int as n from gear_ratings group by catalog_id) s
        where s.catalog_id = c.id;
    `);
}

export async function down(knex) {
    await knex.raw(`
        drop index if exists catalog_items_rating_idx;
        alter table catalog_items drop column if exists rating_score;
        alter table catalog_items drop column if exists rating_count;
        alter table catalog_items drop column if exists rating_avg;
        drop table if exists gear_ratings;
    `);
}
