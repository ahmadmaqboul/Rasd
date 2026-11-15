# Fixtures

These files are **hand-built** to match the known shape of each platform's responses. They are **not**
captured responses. Phase 0 was built in a cloud environment that cannot reach Instagram or Facebook.

When the spikes run on a real machine, every raw response is saved automatically to:

- `data/spikes/instagram/<handle>/raw-*.json`
- `data/spikes/ad-library/<slug>/raw-*.json`

**To do in Phase 2:** replace these files with real responses (after removing any personal data), so the
tests catch real changes in the sites' payloads.

| File | Stands in for |
|---|---|
| `instagram-web-profile-info.json` | Older shape: `data.user` with `edge_owner_to_timeline_media` |
| `instagram-timeline-graphql.json` | Newer shape: `like_count` / `comment_count` / `taken_at` / `image_versions2` |
| `ad-library-graphql.json` | Ad Library search results: `ad_archive_id` + `snapshot` |
