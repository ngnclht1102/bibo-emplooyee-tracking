---
title: "Example post: how to write a BiBoTracking blog post"
description: "A template post that shows every front matter field and the markdown conventions used by the BiBoTracking blog."
date: 2026-10-27
updated: 2026-10-27
tags: [example, writing]
focus_keyword: "bibotracking blog post format"
cover: /blog/assets/example-cover.png
---

Posts start with a short intro of two or three sentences that answers the reader's
question straight away and uses the focus keyword once, naturally. There is no `# Title`
heading in the body — the title comes from the front matter and the renderer emits the
`<h1>`.

## Use H2 for the main sections

Keep paragraphs short. Write in plain English, second person, no marketing fluff. Prefer
concrete numbers and real examples over adjectives.

### H3 for sub-points

- Bullet lists are fine for scannable points.
- Keep each bullet to one line where possible.

## Links, code and images

Internal links are root-relative: [see the pricing](/#pricing) or
[another post](/blog/some-other-post/). External links use the full URL.

```bash
# fenced code blocks get a language tag
curl -s https://bibotracker.com/blog/
```

Images live in `marketing/blog/assets/` and are referenced as `/blog/assets/<file>`:

```markdown
![Alt text that describes the image](/blog/assets/example-cover.png)
```

## Close with a short takeaway

End with two or three sentences that summarise the answer and point to the product only
if it genuinely fits the topic.
